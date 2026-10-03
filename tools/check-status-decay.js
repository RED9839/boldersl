// 상태가 언제 줄어드나 — 카제나 겹 규칙(rules.js STATUS_V · docs/16): 취약 · 약화는 턴으로 안 줄고, 한 번 돌 때마다 1 줄어든다.
// 감전 · 침묵은 그대로 턴으로 준다(적이 사도에게 건 것은 내 턴을 한 번 거친 뒤에).
//   node tools/check-status-decay.js
import * as C from "../js/combat.js";
import { ENEMIES } from "../js/data/enemies.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const foe = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss && !(ENEMIES[k].passives || []).length);
const mk = () => C.newCombat({ partyKeys: ["에르핀", "네르", "티그"], deck: C.buildDeck(["에르핀", "네르", "티그"]), enemyIds: [foe], seed: 5 });
const wk = (s) => s.party.filter((u) => !u.dead).map((u) => u.status["약화"] || 0);

// 1) 적의 차례에 파티 약화 1 — 턴이 지나도 남고, 피해 카드를 내면 1 줄어든다
{
  const s = mk();
  const e = s.enemies[0];
  e.hp = e.maxHp = 9999;
  e.intent = { t: "debuff", id: "약화", v: 1, say: "시험 — 약화" };
  e.sealed = false;
  C.endTurn(s);
  check(wk(s).every((n) => n === 1), `적이 건 약화 1 — 내 턴에 남아 있다 (${wk(s).join(" · ")})`);
  e.intent = { t: "block", v: 1, say: "시험 — 막기" };
  s.hand = [];
  C.endTurn(s);
  check(wk(s).every((n) => n === 1), `턴만 넘기면 안 준다 (${wk(s).join(" · ")})`);
  // 에르핀 공격 카드 한 장 — 약화는 파티 층(적이 건 것, docs/16 §8)이라 파티의 약화가 1 준다(사도 모두가 같은 겹을 본다)
  const atk = s.hand.findIndex((id) => { const c = C.cardOf(s, id); return c.hero === "에르핀" && (c.fx || []).some((f) => f.k === "dmg"); });
  if (atk < 0) { s.hand.push(C.buildDeck(["에르핀"]).find((id) => (C.cardOf(s, id).fx || []).some((f) => f.k === "dmg"))); }
  const i = atk < 0 ? s.hand.length - 1 : atk;
  s.ap = 9;
  C.playCard(s, i, 0);
  const erpin = s.party.find((u) => u.key === "에르핀");
  check((erpin.status["약화"] || 0) === 0 && s.party.every((u) => (u.status["약화"] || 0) === 0) && (s.pool.status["약화"] || 0) === 0, "피해 카드 한 장 — 파티의 약화가 1 준다(파티 층)");
}
// 2) 내가 적에게 건 취약 1 — 적의 차례를 거쳐도 남고, 카드에 맞으면 준다
{
  const s = mk();
  const e = s.enemies[0];
  e.hp = e.maxHp = 9999;
  e.status["취약"] = 1;
  e.intent = { t: "block", v: 1, say: "시험 — 막기" };
  C.endTurn(s);
  check((e.status["취약"] || 0) === 1, `적에게 건 취약 1 — 턴이 지나도 남는다 (${e.status["취약"] || 0})`);
}
// 3) 감전은 턴으로 준다(옛 그대로)
{
  const s = mk();
  const e = s.enemies[0];
  e.status["감전"] = 1;
  e.intent = { t: "block", v: 1, say: "시험 — 막기" };
  C.endTurn(s);
  check((e.status["감전"] || 0) === 0, `감전 1 — 적의 차례가 끝나면 풀린다 (${e.status["감전"] || 0})`);
}
console.log(bad ? `실패 ${bad}개` : "상태가 제때 줄어든다");
process.exit(bad ? 1 : 0);
