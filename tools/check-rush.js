// 즉시 행동 — 내 턴에 당겨져 움직인 적은 그 적의 차례에 쉰다(2026-10: 턴 끝에 무작위 수를 또 했다).
//   node tools/check-rush.js
import * as C from "../js/combat.js";
import { ENEMIES } from "../js/data/enemies.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const foe = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss);
const party = ["에르핀", "네르", "티그"];
const s = C.newCombat({ partyKeys: party, deck: C.buildDeck(party), enemyIds: [foe], seed: 7 });
const e = s.enemies[0];
s.ap = 99;
e.intent = { t: "attack", v: 5, say: "시험 — 친다", rush: 3 };
e.rushCnt = 2;                                   // 한 장만 더 내면 당겨진다
const i = s.hand.findIndex((id) => !C.canPlay(s, id));
check(i >= 0, "낼 수 있는 카드가 손에 있다");
C.playCard(s, i, 0, { ally: 0 });
check(e.rushedTurn === true, "카드를 내자 즉시 행동했다");
check(e.intent == null, "즉시 행동한 뒤 새 수를 굴리지 않는다");
const acted = () => s.log.filter((l) => l.startsWith(`${e.ko}: `) && !l.includes("즉시 행동") && !l.includes("쉰다")).length;
const before = acted();
C.endTurn(s);
check(s.log.some((l) => l.includes(`${e.ko}: 즉시 행동을 했다 — 이번에는 쉰다`)), "적의 차례에 쉰다고 말한다");
check(acted() === before, `적의 차례에 아무것도 하지 않았다 (${acted() - before}번)`);
check(e.intent != null && e.rushedTurn === false, "다음 내 턴에는 새 수를 예고한다");
console.log(bad ? `실패 ${bad}개` : "즉시 행동한 적은 그 차례에 쉰다");
process.exit(bad ? 1 : 0);
