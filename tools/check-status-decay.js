// 상태가 언제 줄어드나 — 적이 사도에게 건 「약화 1턴」 은 내 턴을 한 번 거친 뒤에 풀린다(2026-10: 걸리자마자 풀리던 것).
//   node tools/check-status-decay.js
import * as C from "../js/combat.js";
import { ENEMIES } from "../js/data/enemies.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const foe = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss);
const mk = () => C.newCombat({ partyKeys: ["에르핀", "네르", "티그"], deck: C.buildDeck(["에르핀", "네르", "티그"]), enemyIds: [foe], seed: 5 });

// 1) 적의 차례에 아군 전원 약화 1 — 다음 내 턴에 남아 있고, 그 턴이 끝나면 풀린다
{
  const s = mk();
  const e = s.enemies[0];
  e.intent = { t: "debuff", id: "약화", v: 1, say: "시험 — 약화" };
  e.sealed = false;
  C.endTurn(s);
  const w = s.party.filter((u) => !u.dead).map((u) => u.status["약화"] || 0);
  check(w.every((n) => n === 1), `적이 건 약화 1 — 내 턴에 남아 있다 (${w.join(" · ")})`);
  e.intent = { t: "block", v: 1, say: "시험 — 막기" };
  C.endTurn(s);
  const w2 = s.party.filter((u) => !u.dead).map((u) => u.status["약화"] || 0);
  check(w2.every((n) => n === 0), `내 턴을 한 번 거치면 풀린다 (${w2.join(" · ")})`);
}
// 2) 내가 적에게 건 취약 1 — 적의 차례를 거친 뒤 풀린다(예전 그대로)
{
  const s = mk();
  const e = s.enemies[0];
  e.status["취약"] = 1;
  e.intent = { t: "block", v: 1, say: "시험 — 막기" };
  C.endTurn(s);
  check((e.status["취약"] || 0) === 0, `적에게 건 취약 1 — 적의 차례가 끝나면 풀린다 (${e.status["취약"] || 0})`);
}
console.log(bad ? `실패 ${bad}개` : "상태가 제때 줄어든다");
process.exit(bad ? 1 : 0);
