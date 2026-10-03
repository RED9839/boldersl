// 주도 · 종극 · 층 보스 복제 — 2026-10 사용자 요청분
//   node tools/check-finale.js
import * as C from "../js/combat.js";
import * as R from "../js/run.js";
import { CARDS } from "../js/cardbook.js";
import { ENEMIES } from "../js/data/enemies.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const foe = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss);
const party = ["에르핀", "네르", "티그"];
const mk = () => { const s = C.newCombat({ partyKeys: party, deck: C.buildDeck(party), enemyIds: [foe], seed: 3 }); s.ap = 99; return s; };

console.log("종극 — 내면 턴이 끝난다");
{
  const s = mk();
  const id = s.hand[0];
  s.book[id] = { ...C.cardOf(s, id), tags: [...(C.cardOf(s, id).tags || []), "종극"] };
  const r = C.playCard(s, 0, 0, { ally: 0 });
  check(r.ok && r.finale === true, "종극 카드를 내면 finale 로 알린다");
  check(s.hand.every((h) => C.canPlay(s, h)), "그 턴에는 더 못 낸다");
  C.endTurn(s);
  check(!s.finaleLock, "다음 턴에는 다시 낸다");
}
console.log("주도 — 턴 시작 50% 비용 -1, 다른 카드를 먼저 내면 풀린다");
{
  let hit = 0, n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = C.newCombat({ partyKeys: party, deck: C.buildDeck(party), enemyIds: [foe], seed });
    for (const d of new Set([...s.draw, ...s.hand, ...s.discard])) s.book[d] = { ...C.cardOf(s, d), tags: [...(C.cardOf(s, d).tags || []), "주도"] };   // 덱 전부 주도
    C.endTurn(s);                                  // 다음 턴 시작에 굴린다
    const id2 = s.hand.find((h) => C.cardOf(s, h).cost >= 1);
    if (!id2) continue;
    n++;
    const base = C.cardOf(s, id2).cost;
    if (C.costOf(s, id2) === Math.max(0, base - 1)) {
      hit++;
      const other = s.hand.findIndex((h) => h !== id2 && !C.canPlay(s, h));
      if (other >= 0 && hit === 1) { s.ap = 99; C.playCard(s, other, 0, { ally: 0 }); check(C.costOf(s, id2) === base, "다른 카드를 먼저 내면 원래 비용"); }
    }
  }
  check(n > 20 && hit / n > 0.3 && hit / n < 0.7, `반반쯤 싸진다 (${hit}/${n})`);
}
console.log("층 보스 — 가진 고유 카드 하나를 복제");
{
  const run = R.newRun(party, {});
  const uq = Object.values(CARDS).filter((c) => c.unique && c.hero === "티그" && c.type !== "강화").map((c) => c.id);
  run.deck.push(uq[0]);
  const pw = Object.values(CARDS).find((c) => c.unique && c.type === "강화" && party.includes(c.hero));
  if (pw) run.deck.push(pw.id);
  run.deck.push(...uq.slice(1, 4));
  const before = run.deck.length;
  const offer = R.bossCopyOffer(run);
  check(offer.length === 3 && offer.every((id) => uq.includes(id)), `가진 고유 카드 셋을 내놓는다 — 강화 카드는 빼고 (${offer.map((id) => CARDS[id].name).join(" · ")})`);
  check(JSON.stringify(R.bossCopyOffer(run)) === JSON.stringify(offer), "다시 물어도(새로고침) 같은 셋");
  const got = R.bossCopy(run, offer[1]);
  check(got === offer[1] && run.deck.length === before + 1 && run.deck.filter((x) => x === offer[1]).length === 2, "고른 카드가 덱에 한 장 더");
  check(R.bossCopy(run, pw ? pw.id : "없는카드") === null, "셋 밖의 카드(강화 카드)는 복제하지 않는다");
  const run2 = R.newRun(party, {});
  check(R.bossCopyOffer(run2).length === 0 && R.bossCopy(run2) === null, "고유 카드가 없으면 아무것도 안 한다");
  run.node = 3; R.advance(run);
  check(run.deck.length === before + 1, "층을 넘을 때는 따로 복제하지 않는다(고른 것만)");
}
console.log(bad ? `실패 ${bad}개` : "주도 · 종극 · 보스 복제가 돈다");
process.exit(bad ? 1 : 0);
