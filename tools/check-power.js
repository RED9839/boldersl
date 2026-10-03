// 강화 카드(js/rules.js isPower · docs/15 §7)가 규칙대로 도는지 본다.
//
//   node tools/check-power.js
//
//   - 한 장만: 덱에 있으면 은총 · 이벤트 · 보상이 다시 넣지 않는다
//   - 복제 불가: 이벤트 「카드 복제」 가 까닭을 대며 거절한다(「강화 카드.」 신탁을 붙인 카드도)
//   - 쓰면 이 전투에서 사라짐: 내면 이 전투에서만 사라진다(s.gone). 판의 덱(run.deck)에는 남아 다음 전투에 다시 쓴다
//   - 판에 남기지 않는다: run.spent · run.boons 가 없다. 옛 저장의 것은 읽을 때 덱으로 돌려놓고 버린다(깨져 있어도 판은 읽는다)
//   - 전투 내내: 그 자리에서 걸려 그 전투 끝까지 · 싸움 중 저장 → 읽기에도 남고, 다음 전투에는 없다
//   - 신탁 길: 「강화 카드.」 신탁을 고른 카드도 강화 카드다 · 덱에 두 장이면 그 신탁을 내놓지 않는다
//   - 135명 모두 강화 길이 하나까지 · 「전투 내내」 증감은 강화 카드에만
import * as R from "../js/run.js";
import * as C from "../js/combat.js";
import * as EV from "../js/events.js";
import * as S from "../js/save.js";
import * as RULES from "../js/rules.js";
import { CARDS, HERO_DATA, flashed } from "../js/cardbook.js";
import { statMod, MORALE_ATK } from "../js/passive.js";

let fails = 0;
const check = (c, m) => { console.log((c ? "  ok   " : "  실패 ") + m); if (!c) fails++; };
const idOf = (hero, ko) => Object.keys(CARDS).find((id) => CARDS[id].hero === hero && CARDS[id].name === ko);
const pct = (v) => `${Math.round(v * 100)}%`;

// 판 하나 — 티그(「백호 비전서」 가 기본부터 강화) · 에르핀(「무한의 케이크」 신탁 ⑤ 가 강화) · 네르
const PARTY = ["티그", "에르핀", "네르"];
const fresh = (seed = 11) => R.newRun(PARTY, {}, seed);
const POWER = idOf("티그", "백호 비전서");
const CAKE = idOf("에르핀", "무한의 케이크");
const CAKE_N = (CARDS[CAKE].flash || []).findIndex((f) => (f.fx || []).some((x) => x.k === "tag" && x.id === "강화")) + 1;
const boonOf = (card) => (card.fx || []).filter((f) => f.run);
// 「전투 내내 자신 · 아군 1명 공격력 +15%(의 배수)」 — 옛 「자신 · 아군 1명 사기 N」 을 옮긴 개인 버프. 어느 카드에나 쓴다(tools/check-hero.js 와 같다)
const morale = (f) => f.k === "atkMod" && f.run && f.v > 0 && (f.target === "self" || f.target === "oneAlly") && Math.round(f.v * 100) % 15 === 0;
// 싸움을 열어 그 카드를 손에 쥐여 낸다 — 적은 단단하게(한 수에 끝나지 않게)
function playIn(run, id) {
  const { st } = R.openFight(run);
  for (const e of st.enemies) e.hp = e.maxHp = 5000;
  for (const pile of [st.draw, st.discard]) { const i = pile.indexOf(id); if (i >= 0) pile.splice(i, 1); }
  st.hand.unshift(id); st.ap = 3;
  const r = C.playCard(st, 0, 0);
  return { st, r };
}

console.log("강화 카드 — 사도마다 하나");
{
  check(RULES.isPower(CARDS[POWER]), `「백호 비전서」 는 강화 카드다`);
  check(!RULES.isPower(CARDS[CAKE]) && CAKE_N > 0 && RULES.isPower(flashed(CARDS[CAKE], CAKE_N)),
    `「무한의 케이크」 는 기본은 스킬, 신탁 ${"①②③④⑤"[CAKE_N - 1]} 를 고르면 강화 카드 (${CARDS[CAKE].flash[CAKE_N - 1].ko})`);
  check(!RULES.isPower(CARDS[Object.keys(CARDS).find((id) => CARDS[id].neutral && CARDS[id].type === "강화")]), "교주 카드의 「강화」 는 이 규칙 밖이다(덱에 1장만은 따로)");
  // 135명 — 강화 길(기본 카드 하나 또는 신탁 하나)이 하나까지
  let many = [], stray = [];
  for (const k of Object.keys(HERO_DATA)) {
    const uniq = Object.values(CARDS).filter((c) => c.hero === k && c.unique);
    const paths = uniq.filter((c) => RULES.isPower(c)).length + uniq.filter((c) => !RULES.isPower(c)).reduce((a, c) => a + (c.flash || []).filter((_, i) => RULES.isPower(flashed(c, i + 1))).length, 0);
    if (paths > 1) many.push(k);
    for (const c of Object.values(CARDS).filter((c) => c.hero === k)) {
      const all = [c, ...(c.flash || []).map((_, i) => flashed(c, i + 1))];
      for (const x of all) if (boonOf(x).some((f) => !morale(f)) && !RULES.isPower(x)) stray.push(`${c.name}`);
      for (const x of all) if (RULES.isPower(x) && !boonOf(x).length) stray.push(`${c.name}(전투 내내 없음)`);
    }
  }
  check(!many.length, `135명 모두 강화 길이 하나까지 ${many.join(" · ")}`);
  check(!stray.length, `「전투 내내」 증감은 강화 카드에만 · 강화 카드는 「전투 내내」 를 든다 ${[...new Set(stray)].join(" · ")}`);
}

console.log("");
console.log("옛 「아군 1명 사기」 → 「전투 내내 아군 1명 공격력 +15%」 — 고른 사도에게 · 쌓인다 · 사도마다 +150% 까지");
{
  const PRAY = idOf("네르", "꿈으로 올리는 기도");
  const n = (CARDS[PRAY].flash || []).findIndex((f) => (f.fx || []).some((x) => x.k === "atkMod" && x.run && x.target === "oneAlly")) + 1;
  const run = fresh(31);
  run.flash[PRAY] = n;
  const { st, r } = playIn(run, PRAY);
  const tig = st.party.find((u) => u.key === "티그"), ner = st.party.find((u) => u.key === "네르");
  check(n > 0 && r.ok && tig.idx === 0, `「마시멜로 마카롱」(신탁 ${"①②③④⑤"[n - 1]})을 티그(자리 0)를 골라 냈다`);
  check(Math.abs(statMod(st, tig, "atk") - MORALE_ATK) < 1e-9 && statMod(st, ner, "atk") === 0, `고른 사도에게만 — 티그 공격력 +${pct(statMod(st, tig, "atk"))} · 네르 +${pct(statMod(st, ner, "atk"))}`);
  check((tig.mods || []).some((m) => m.run && m.stat === "atk" && m.left >= RULES.BOON_TURNS), "정보 창이 「전투 내내」 로 적는 증감(run · 9999턴)");
  st.hand.unshift(PRAY); st.ap = 3; C.playCard(st, 0, 0);
  check(Math.abs(statMod(st, tig, "atk") - 2 * MORALE_ATK) < 1e-9, `두 번 내면 쌓인다 — 티그 +${pct(statMod(st, tig, "atk"))}`);
  for (let i = 0; i < 12; i++) { st.hand.unshift(PRAY); st.ap = 3; C.playCard(st, 0, 0); }
  check(Math.abs(statMod(st, tig, "atk") - MORALE_ATK * RULES.STATUS_V.사기Max) < 1e-9, `사기 겹 상한(${RULES.STATUS_V.사기Max})과 같이 +${pct(MORALE_ATK * RULES.STATUS_V.사기Max)} 까지 — 티그 +${pct(statMod(st, tig, "atk"))}`);
}

console.log("");
console.log("한 장만 · 복제 불가");
{
  const run = fresh();
  run.deck.push(POWER);
  check(!!R.powerWhy(run, POWER), `덱에 있으면 더 넣지 못한다 — 「${R.powerWhy(run, POWER)}」`);
  check(!R.uniquesLeft(run, "티그").includes(POWER), "은총 · 이벤트의 고유 카드 풀에 안 뜬다");
  R.takeReward(run, POWER);
  check(run.deck.filter((x) => x === POWER).length === 1, "보상으로 넣으려 해도 한 장 그대로");
  // 이벤트 「카드 복제」
  check(!EV.dupeOk(POWER, run), "복제 고르기에서 잠긴다");
  run.event = { key: "시험", pending: [{ k: "dupe" }], log: [] };
  const why = EV.resolve(run, POWER);
  check(!!why && /강화 카드/.test(why) && run.deck.filter((x) => x === POWER).length === 1, `복제를 거절한다 — 「${why}」`);
  // 이벤트가 고유 카드를 고르게 할 때도
  run.event = { key: "시험", pending: [{ k: "card", cards: [POWER], label: "고유 카드" }], log: [] };
  const why2 = EV.resolve(run, POWER);
  check(!!why2 && run.deck.filter((x) => x === POWER).length === 1, `이벤트 카드 고르기도 막는다 — 「${why2}」`);
  // 신탁 길 — 「강화 카드.」 신탁을 붙이면 그 카드도 복제할 수 없다
  run.deck.push(CAKE);
  check(EV.dupeOk(CAKE, run), "신탁을 붙이기 전의 「무한의 케이크」 는 복제할 수 있다");
  run.flash[CAKE] = CAKE_N;
  check(!EV.dupeOk(CAKE, run) && R.powerCard(run, CAKE), "「강화 카드.」 신탁을 붙이면 복제 잠김");
  run.event = { key: "시험", pending: [{ k: "dupe" }], log: [] };
  check(!!EV.resolve(run, CAKE), "신탁 길 강화 카드도 복제를 거절한다");
  run.event = null;
}

console.log("");
console.log("덱에 두 장 든 카드에는 「강화 카드.」 신탁을 내놓지 않는다");
{
  const run = fresh(5);
  run.deck.push(CAKE, CAKE);
  check(!R.flashOk(run, CAKE, CAKE_N) && R.flashOk(run, CAKE, CAKE_N === 1 ? 2 : 1), "두 장이면 그 신탁만 빠진다(다른 넷은 그대로)");
  check(!R.takeFlash(run, { cardId: CAKE, n: CAKE_N }) && !run.flash[CAKE], "수련으로도 붙지 않는다");
  let seen = false;
  for (let i = 0; i < 300; i++) { const o = R.offerFlash(run); if (o && o.cardId === CAKE && o.picks.includes(CAKE_N)) seen = true; }
  for (let i = 0; i < 300; i++) { const g = R.rollEpiphany({ ...run, rng: run.rng, elite: true }); if (g[CAKE] && g[CAKE].options.some((o) => o.n === CAKE_N)) seen = true; }
  check(!seen, "캠프 수련 · 전투 신탁 어디에도 안 뜬다(300번씩)");
  run.deck.splice(run.deck.indexOf(CAKE), 1);
  check(R.flashOk(run, CAKE, CAKE_N), "한 장이면 다시 뜰 수 있다");
}

console.log("");
console.log("쓰면 이 전투에서 사라짐 · 덱에는 남음 · 전투 내내");
{
  const run = fresh(21);
  run.deck.push(POWER);
  const boon = boonOf(CARDS[POWER])[0];
  const { st, r } = playIn(run, POWER);
  const tig = st.party.find((u) => u.key === "티그");
  check(r.ok && st.gone.includes(POWER) && !st.discard.includes(POWER), "내면 이 전투에서 사라진다(소멸처럼)");
  const stat = { dealtMod: "dealt", atkMod: "atk", defMod: "def", critMod: "crit", healMod: "heal", takenMod: "taken" }[boon.k];
  check(Math.abs(statMod(st, tig, stat) - boon.v) < 1e-9, `그 자리에서 걸린다 — 티그 ${stat} +${pct(statMod(st, tig, stat))}`);
  check((tig.mods || []).some((m) => m.run && m.left >= RULES.BOON_TURNS), "정보 창이 「전투 내내」 로 적는 증감(run · 9999턴)");
  check(!st.gained.spent && !st.gained.boons, "판에 넘길 것(gained.spent · boons)이 없다");
  // 싸움 중 저장 → 읽기 — 사라진 카드 · 건 버프가 그 싸움 안에서 그대로
  const mid = S.unpack(JSON.parse(JSON.stringify(S.pack({ ...run, where: { k: "fight" } }, st))));
  const midTig = mid && mid.combat.party.find((u) => u.key === "티그");
  check(!!mid && mid.combat.gone.includes(POWER) && Math.abs(statMod(mid.combat, midTig, stat) - boon.v) < 1e-9, "싸움 중 이어하기에도 사라진 카드 · 전투 내내 버프가 남는다");
  for (let i = 0; i < 3; i++) C.endTurn(st);
  check(Math.abs(statMod(st, tig, stat) - boon.v) < 1e-9, "턴이 지나도 풀리지 않는다(전투 내내)");
  R.afterFight(run, st);
  check(run.deck.filter((x) => x === POWER).length === 1 && !run.spent && !run.boons, "전투가 끝나도 판의 덱에 그대로 한 장 — 판에 적는 것(spent · boons)이 없다");
  check(!R.uniquesLeft(run, "티그").includes(POWER) && !!R.powerWhy(run, POWER), "덱에 있으니 은총 · 이벤트가 또 넣지 않는다(유일)");
  // 다음 전투 — 버프는 없고, 카드는 다시 뽑힌다
  run.node = 1;
  const { st: st2 } = R.openFight(run);
  const t2 = st2.party.find((u) => u.key === "티그");
  const inPiles = [...st2.draw, ...st2.hand].includes(POWER);
  check(Math.abs(statMod(st2, t2, stat)) < 1e-9 && inPiles, `다음 전투에는 ${stat} 버프가 없고 카드는 덱에 있다(다시 쓴다)`);
  const { st: st2b, r: r2 } = playIn(run, POWER);
  const t2b = st2b.party.find((u) => u.key === "티그");
  check(r2.ok && st2b.gone.includes(POWER) && Math.abs(statMod(st2b, t2b, stat) - boon.v) < 1e-9, "다음 전투에서 또 내면 또 걸린다");
}

console.log("");
console.log("옛 판(「판 내내」 시절)의 저장");
{
  const run = fresh(41);
  const old = S.pack({ ...run, where: { k: "map" } });
  old.run.deck = old.run.deck.filter((x) => x !== POWER);
  old.run.spent = [POWER, "모르는카드"];
  old.run.boons = { 티그: [{ stat: "atk", v: 0.1, src: `「${CARDS[POWER].name}」` }], 네르: [{ stat: 3 }] };
  const back = S.unpack(JSON.parse(JSON.stringify(old)));
  check(!!back, "옛 spent · boons(깨진 것까지)가 든 저장도 읽는다");
  check(!!back && back.run.deck.filter((x) => x === POWER).length === 1 && !back.run.spent && !back.run.boons, "써 버린 강화 카드는 덱으로 돌아오고 spent · boons 는 비운다");
  const { st: st3 } = R.openFight(back.run);
  const t3 = st3.party.find((u) => u.key === "티그");
  check(Math.abs(statMod(st3, t3, "atk")) < 1e-9, "옛 판 내내 버프는 다음 전투에 걸리지 않는다");
  // 싸움 중 옛 저장 — gained.spent · boons 가 있어도 afterFight 는 덱을 건드리지 않는다
  const run2 = fresh(42);
  run2.deck.push(POWER);
  const { st } = playIn(run2, POWER);
  st.gained.spent = [POWER]; st.gained.boons = [{ hero: "티그", stat: "atk", v: 0.1, src: "x" }];
  R.afterFight(run2, st);
  check(run2.deck.includes(POWER) && !run2.spent && !run2.boons, "옛 싸움의 gained.spent · boons 는 보지 않는다");
}

console.log("");
console.log("신탁 길 — 「강화 카드.」 신탁을 고른 카드");
{
  const run = fresh(31);
  run.deck.push(CAKE);
  run.flash[CAKE] = CAKE_N;
  const { st, r } = playIn(run, CAKE);
  check(r.ok && st.gone.includes(CAKE), "신탁을 얹은 카드를 내면 이 전투에서 사라진다");
  R.afterFight(run, st);
  check(run.deck.includes(CAKE) && run.flash[CAKE] === CAKE_N && !run.boons, "판의 덱에는 남고(신탁도 그대로) 버프는 판에 남지 않는다");
  // 신탁을 고르기 전(기본 스킬)이면 그대로 버린 더미로
  const run2 = fresh(32);
  run2.deck.push(CAKE);
  const { st: s2 } = playIn(run2, CAKE);
  check(s2.discard.includes(CAKE) && !s2.gone.includes(CAKE), "신탁 없는 「무한의 케이크」 는 보통 카드(버린 더미로)");
  // 전투 중 신탁으로 바로 강화 카드가 되면 — 그 카드를 내는 순간 강화 카드라 이 전투에서 사라진다
  const run3 = fresh(33);
  run3.deck.push(CAKE);
  run3.forceGlow = { [CAKE]: { kind: "card", options: [{ n: CAKE_N, shin: null }] } };
  const { st: s3 } = R.openFight(run3);
  for (const pile of [s3.draw, s3.discard]) { const i = pile.indexOf(CAKE); if (i >= 0) pile.splice(i, 1); }
  s3.hand.unshift(CAKE); s3.ap = 3;
  C.applyEpiphany(s3, CAKE, 0);
  C.playCard(s3, 0, 0);
  check(s3.gone.includes(CAKE), "전투 중 신탁으로 강화 카드가 되면 그 자리에서 쓰여 이 전투에서 사라진다");
  R.afterFight(run3, s3);
  check(run3.flash[CAKE] === CAKE_N && run3.deck.includes(CAKE), "판의 덱에는 남는다");
}

console.log("");
console.log(fails ? `실패 ${fails}` : "전부 통과");
process.exit(fails ? 1 : 0);
