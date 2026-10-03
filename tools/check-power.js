// 강화 카드(js/rules.js isPower · docs/15 §7)가 규칙대로 도는지 본다.
//
//   node tools/check-power.js
//
//   - 한 장만: 덱에 있으면 은총 · 이벤트 · 보상이 다시 넣지 않는다
//   - 복제 불가: 이벤트 「카드 복제」 가 까닭을 대며 거절한다(「강화 카드.」 신탁을 붙인 카드도)
//   - 쓰면 사라짐: 내면 이 전투에서 사라지고, 끝나면 판의 덱(run.deck)에서도 빠진다
//   - 다시 안 나온다: 써 버린 카드(run.spent)는 은총 · 이벤트에 안 뜬다
//   - 판 내내: 다음 전투(newCombat)에 처음부터 걸려 있다 · 저장 → 읽기(판 · 싸움 중)에도 남는다
//   - 신탁 길: 「강화 카드.」 신탁을 고른 카드도 강화 카드다 · 덱에 두 장이면 그 신탁을 내놓지 않는다
//   - 135명 모두 강화 길이 하나까지 · 「판 내내」 는 강화 카드에만
import * as R from "../js/run.js";
import * as C from "../js/combat.js";
import * as EV from "../js/events.js";
import * as S from "../js/save.js";
import * as RULES from "../js/rules.js";
import { CARDS, HERO_DATA, flashed } from "../js/cardbook.js";
import { statMod } from "../js/passive.js";

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
      for (const x of all) if (boonOf(x).length && !RULES.isPower(x)) stray.push(`${c.name}`);
      for (const x of all) if (RULES.isPower(x) && !boonOf(x).length) stray.push(`${c.name}(판 내내 없음)`);
    }
  }
  check(!many.length, `135명 모두 강화 길이 하나까지 ${many.join(" · ")}`);
  check(!stray.length, `「판 내내」 는 강화 카드에만 · 강화 카드는 「판 내내」 를 든다 ${[...new Set(stray)].join(" · ")}`);
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
console.log("쓰면 사라짐 · 다시 안 나옴 · 판 내내");
{
  const run = fresh(21);
  run.deck.push(POWER);
  const boon = boonOf(CARDS[POWER])[0];
  const { st, r } = playIn(run, POWER);
  const tig = st.party.find((u) => u.key === "티그");
  check(r.ok && st.gone.includes(POWER) && !st.discard.includes(POWER), "내면 이 전투에서 사라진다(소멸)");
  const stat = { dealtMod: "dealt", atkMod: "atk", defMod: "def", critMod: "crit", healMod: "heal", takenMod: "taken" }[boon.k];
  check(Math.abs(statMod(st, tig, stat) - boon.v) < 1e-9, `그 자리에서 걸린다 — 티그 ${stat} +${pct(statMod(st, tig, stat))}`);
  check((tig.mods || []).some((m) => m.run && m.left >= RULES.BOON_TURNS), "정보 창이 「판 내내」 로 적는 증감(run · 9999턴)");
  // 싸움 중 저장 → 읽기 — 쓴 것 · 건 것이 그대로
  const mid = S.unpack(JSON.parse(JSON.stringify(S.pack({ ...run, where: { k: "fight" } }, st))));
  check(mid && mid.combat.gained.spent.includes(POWER) && mid.combat.gained.boons.length === 1, "싸움 중 이어하기에도 gained(spent · boons)가 남는다");
  for (let i = 0; i < 3; i++) C.endTurn(st);
  check(Math.abs(statMod(st, tig, stat) - boon.v) < 1e-9, "턴이 지나도 풀리지 않는다");
  R.afterFight(run, st);
  check(!run.deck.includes(POWER) && run.spent.includes(POWER), "전투가 끝나면 판의 덱에서 빠지고 run.spent 에 적힌다");
  check((run.boons["티그"] || []).length === 1 && run.boons["티그"][0].src === `「${CARDS[POWER].name}」`, `run.boons 에 출처와 함께 — ${JSON.stringify(run.boons["티그"])}`);
  check(!R.uniquesLeft(run, "티그").includes(POWER) && !!R.powerWhy(run, POWER), "써 버린 카드는 은총 · 이벤트에 다시 안 나온다");
  let regrace = false;
  for (let i = 0; i < 200; i++) { const g = R.rollEpiphany({ ...run, rng: run.rng, elite: true }); if (Object.values(g).some((x) => x.kind === "hero" && x.options.includes(POWER))) regrace = true; }
  check(!regrace, "은총 선택지에도 안 뜬다(200번)");
  // 다음 전투 — 처음부터 걸려 있다
  run.node = 1;
  const { st: st2 } = R.openFight(run);
  const t2 = st2.party.find((u) => u.key === "티그");
  check(Math.abs(statMod(st2, t2, stat) - boon.v) < 1e-9 && !st2.draw.includes(POWER) && !st2.hand.includes(POWER), `다음 전투(newCombat)에 처음부터 ${stat} +${pct(boon.v)} · 카드는 없다`);
  // 판 저장 → 읽기 → 다음 전투
  const back = S.unpack(JSON.parse(JSON.stringify(S.pack({ ...run, where: { k: "map" } }))));
  check(!!back && back.run.spent.includes(POWER) && back.run.boons["티그"].length === 1, "판 이어하기에 spent · boons 가 남는다");
  const { st: st3 } = R.openFight(back.run);
  const t3 = st3.party.find((u) => u.key === "티그");
  check(Math.abs(statMod(st3, t3, stat) - boon.v) < 1e-9, "되살린 판의 다음 전투에도 걸린다");
  // 깨진 boons 는 버린다
  const bad = S.pack({ ...run, where: { k: "map" } }); bad.run.boons = { 티그: [{ stat: 3 }] };
  check(S.unpack(JSON.parse(JSON.stringify(bad))) === null, "깨진 판 내내 버프가 든 저장은 버린다");
}

console.log("");
console.log("신탁 길 — 「강화 카드.」 신탁을 고른 카드");
{
  const run = fresh(31);
  run.deck.push(CAKE);
  run.flash[CAKE] = CAKE_N;
  const { st, r } = playIn(run, CAKE);
  check(r.ok && st.gone.includes(CAKE), "신탁을 얹은 카드를 내면 사라진다");
  R.afterFight(run, st);
  check(!run.deck.includes(CAKE) && run.spent.includes(CAKE) && (run.boons["에르핀"] || []).length === 1, `덱에서 빠지고 판 내내 버프가 남는다 — ${JSON.stringify(run.boons["에르핀"])}`);
  // 신탁을 고르기 전(기본 스킬)이면 그대로 버린 더미로
  const run2 = fresh(32);
  run2.deck.push(CAKE);
  const { st: s2 } = playIn(run2, CAKE);
  check(s2.discard.includes(CAKE) && !(s2.gained.spent || []).length, "신탁 없는 「무한의 케이크」 는 보통 카드(버린 더미로)");
  // 전투 중 신탁으로 바로 강화 카드가 되면 — 그 카드를 내는 순간 강화 카드라 사라진다
  const run3 = fresh(33);
  run3.deck.push(CAKE);
  run3.forceGlow = { [CAKE]: { kind: "card", options: [{ n: CAKE_N, shin: null }] } };
  const { st: s3 } = R.openFight(run3);
  for (const pile of [s3.draw, s3.discard]) { const i = pile.indexOf(CAKE); if (i >= 0) pile.splice(i, 1); }
  s3.hand.unshift(CAKE); s3.ap = 3;
  C.applyEpiphany(s3, CAKE, 0);
  C.playCard(s3, 0, 0);
  R.afterFight(run3, s3);
  check(run3.flash[CAKE] === CAKE_N && !run3.deck.includes(CAKE) && run3.spent.includes(CAKE), "전투 중 신탁으로 강화 카드가 되면 그 자리에서 쓰여 사라진다");
}

console.log("");
console.log(fails ? `실패 ${fails}` : "전부 통과");
process.exit(fails ? 1 : 0);
