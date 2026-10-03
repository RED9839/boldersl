// 한 판(런)의 상태. 전투 바깥의 것들 — 편성·층·덱·체력·보상.
import { HEROES, ROSTER } from "./data/heroes.js";
import { HERO_DATA } from "./cardbook.js";

// 스탯은 기획서가 원본이다. 기획서에 없는 사도만 옛 heroes.js 를 본다.
const base = (k) => HERO_DATA[k] || HEROES[k] || { hp: 50, row: "mid" };
import { CARDS as OLD_CARDS, EXTRA } from "./data/cards.js";
import { CARDS, NEUTRAL_IDS, EQUIP, flashed, COPY, baseId, isCopy } from "./cardbook.js";
import { FLOORS } from "./data/enemies.js";
import * as R from "./rules.js";
import { buildDeck, makeRng, newCombat } from "./combat.js";

// 파티 HP 하나(docs/16 §8) — 세 사도의 최대 HP 합. 장비 HP 는 끼는 순간 파티 최대 HP 에 더한다(shiftHp)
export const partyBaseHp = (keys) => keys.reduce((a, k) => a + (base(k).hp || 0), 0);
export function newRun(partyKeys, rows, seed = Date.now()) {
  const max = partyBaseHp(partyKeys);
  return {
    seed, rng: makeRng(seed),
    party: partyKeys.slice(), rows: { ...rows }, partyHp: max, partyMaxHp: max,
    traits: [],                   // 옛 신탁 체계 — 지금은 안 쓴다(tools/sim.js 가 아직 잰다)
    flash: {},                    // 카드 id → 신탁 번호(1~5). 카드마다 하나만.
    reward: null,                 // 이번 보상에서 굴린 것 — 다시 그려도 안 바뀐다
    bag: [],                      // 받았지만 끼기 · 팔기를 아직 정하지 않은 장비 id — 가방이 아니다(gainEquip · ui.js settleGear)
    gauge: 0,                     // 고학년 게이지 — 전투가 끝나도 남은 만큼 다음 전투로 넘어간다
    gear: {},                     // { 사도키: { 무기: id, 방어구: id, 장신구: id } }
    gold: R.GOLD_START,
    shop: null,                   // 이번 상점에서 굴린 진열 — 다시 그려도 안 바뀐다
    shopSeen: {},                 // 층마다 한 번 — { 0: true }
    removals: 0,                  // 카드 제거를 몇 번 했나 — 값이 오른다
    stops: {},                    // 들른 캠프 — { "0:camp": { used: "rest" } }
    camp: null,                   // 지금 캠프에서 굴린 수련 선택지
    deck: buildDeck(partyKeys),
    floor: 0, node: 0,            // node 0..2 전투, 3 보스, 4 마지막 층 너머의 마지막 보스(isFinal)
    bench: Object.keys(HERO_DATA).filter((k) => !partyKeys.includes(k)),

    where: null,                  // 지금 어느 화면에 있나 — 이어하기가 그 자리로 돌아간다(js/main.js · js/save.js)
    done: null,
  };
}

export const currentFloor = (run) => FLOORS[run.floor];
export const isBoss = (run) => run.node >= 3;
// 판의 마지막 싸움 — 마지막 층의 보스를 넘은 뒤 뿌리 깊은 곳의 우로스(enemies.js final). 이것도 보스다
export const isFinal = (run) => run.node >= 4;
export const finalOf = (run) => (isFinal(run) && FLOORS[run.floor] && FLOORS[run.floor].final) || null;
export function currentEnemies(run) {
  if (run.eventFight) return run.eventFight.enemies;      // 이벤트가 연 전투(js/events.js)
  const f = currentFloor(run);
  if (isFinal(run)) return f.final.boss;
  if (isBoss(run)) return f.boss;
  // 지도의 칸이 정해 둔 짝(js/map.js) — 없으면(옛 저장 · 도구) 세기의 대표 싸움
  const at = run.map && run.map.at && run.map.rows.flat().find((n) => n.id === run.map.at);
  return (at && at.foes) || f.fights[run.node];
}

// 싸움을 연다 — 전투 상태와 전리품(골드 · 장비)을 이 자리에서 한 번 굴린다. 화면(fight-screen.js fightScreen)과 시험 도구가 같이 쓴다.
// 굴리는 차례가 판의 난수를 정하니 바꾸지 않는다: 신탁(빛날 카드) → 전리품. 전투는 제 씨앗으로 따로 굴린다.
// 적 세기는 rules.js foeScale 한 곳에서 — 층 · 보스 · 엘리트. 이벤트가 연 싸움은 run.eventFight.elite 를 본다(전에는 엘리트 체력이 빠졌다). hpx · dmgx 는 재는 도구가 그 위에 더 곱는 것
export function foeScaleOf(run) {
  return R.foeScale(run.floor, { boss: isBoss(run) && !run.eventFight, final: isFinal(run) && !run.eventFight, elite: run.eventFight ? !!run.eventFight.elite : !!run.elite });
}
export function openFight(run, { hpx = 1, dmgx = 1 } = {}) {
  const next = run.nextFight || null;          // 이벤트가 걸어 둔 「다음 전투」 효과 — 여기서 한 번 가져간다(events.js takeNextFight 와 같다)
  run.nextFight = null;
  const st = newCombat({
    partyKeys: run.party, rows: run.rows, deck: run.deck.slice(),
    enemyIds: currentEnemies(run), partyHp: run.partyHp, partyMaxHp: run.partyMaxHp, traits: run.traits, gear: gearStats(run), gearFx: gearPassives(run), flash: run.flash,
    enemyHp: foeScaleOf(run).hp * hpx, enemyDmg: foeScaleOf(run).dmg * dmgx,   // 층마다 · 엘리트 칸(이벤트 엘리트도) 체력 ×1.5
    next, shin: run.shin, gauge: run.gauge || 0,   // 기적이 붙은 카드 · 고학년 게이지는 전투 사이에 이어진다
    elite: run.eventFight ? !!run.eventFight.elite : !!run.elite,   // 엘리트 칸 — 강인도 칸이 하나 더(rules.js TOUGH)
    glow: run.forceGlow || rollEpiphany(run),   // 신탁 — 이 전투에서 빛날 카드(카제나). forceGlow 는 시험 도구가 정해 넣는 것
    seed: (run.seed + run.floor * 101 + run.node * 7 + (run.step || 0) * 13 + (run.eventFight ? 555 : 0)) >>> 0,
  });
  // 전리품 — 싸움을 열 때 정해 둔다. 이벤트가 연 전투는 적힌 보상만(events.js afterEventFight)
  const loot = run.eventFight ? null : rollReward(run);
  return { st, loot };
}

// 전투가 끝난 뒤 — 체력을 남기고, 만난 짝을 적어 둔다
export function afterFight(run, combat) {
  const g = combat.gained || { cards: [], flash: [] };
  for (const id of g.cards) if (!run.deck.includes(id) && !powerWhy(run, id)) run.deck.push(id);
  for (const f of g.flash) { run.flash[f.cardId] = f.n; if (f.shin) (run.shin = run.shin || {})[f.cardId] = f.shin; }
  // 강화 카드는 판에 남기는 것이 없다 — 덱에 그대로 있고, 버프는 그 전투에서 끝났다(옛 gained.spent · boons 는 보지 않는다)
  run.lastGained = { cards: g.cards.slice(), flash: g.flash.slice() };
  // 싸움 기록 — 판 기록 파일(recordOf)에 들어간다. 어디서 · 누구와 · 몇 턴 · 파티 HP 얼마에서 얼마로
  const kind = run.eventFight ? "event" : isFinal(run) ? "final" : isBoss(run) ? "boss" : run.elite ? "elite" : "fight";
  (run.hist = run.hist || []).push({
    floor: run.floor + 1, node: run.node, kind, foes: FLOORS[run.floor] ? (currentEnemies(run) || []).slice() : [],   // 시험 도구의 가짜 판(층 없음)에서도 멈추지 않게 result: combat.over || null,
    turns: combat.turn || 0, hp: [run.partyHp, combat.pool ? Math.max(0, combat.pool.hp) : run.partyHp, run.partyMaxHp],
    got: { cards: g.cards.slice(), flash: g.flash.map((f) => [f.cardId, f.n]) },
  });
  if (combat.pool) { run.partyHp = Math.max(0, combat.pool.hp); run.partyMaxHp = combat.pool.maxHp; }
  run.gauge = Math.max(0, Math.min(R.GAUGE_MAX, combat.gauge || 0));   // 남은 고학년 게이지는 다음 전투로
}

// 보상 — 편성한 사도의 카드 중 아직 없는 것에서 셋
// 보상으로 얻는 것은 **그 사도의 고유 카드**다.
// 기획서: 사도 1명당 카드 8장 = 시작 카드 4 + 고유 카드 4.
// 시작 덱에는 시작 카드 넉 장만 들어 있고, 고유 카드는 판을 돌며 하나씩 얻는다.
export function rewardCards(run) {
  const pool = [];
  for (const k of run.party)
    for (const id of uniquesLeft(run, k)) pool.push(id);
  const out = [];
  while (out.length < 3 && pool.length) out.push(...pool.splice(Math.floor(run.rng() * pool.length), 1));
  return out;
}

// ── 신탁 — 싸움을 열 때 어느 카드가 빛날지 굴린다(rules.js EPI_*) ─────────────────
// 돌려주는 것: { 카드id: { kind: "hero", hero, options: [고유 카드 id ×3] } | { kind: "card", options: [{ n, shin }] ×3 } }
export function rollEpiphany(run) {
  const kind = run.eventFight ? "event" : isBoss(run) ? "boss" : run.elite ? "elite" : "fight";
  const pick = (a) => a[Math.floor(run.rng() * a.length)];
  const draw3 = (pool) => { const p = pool.slice(), out = []; while (out.length < 3 && p.length) out.push(...p.splice(Math.floor(run.rng() * p.length), 1)); return out; };
  const glow = {};
  // 은총 — 사도마다 따로 굴린다(카제나). 아직 얻을 고유 카드가 남은 사도의 기본 카드 하나가 빛난다
  const heroes = run.party.filter((k) => uniquesLeft(run, k).length
    && run.deck.some((id) => CARDS[id] && CARDS[id].hero === k && !CARDS[id].unique));
  const grace = (k) => {
    const base = run.deck.filter((id) => CARDS[id] && CARDS[id].hero === k && !CARDS[id].unique && !isCopy(id));
    // 고르지 않는다 — 그 사도의 고유 카드 넷 가운데 아직 없는 것에서 무작위 하나
    glow[pick(base)] = { kind: "hero", hero: k, options: [pick(uniquesLeft(run, k))] };
  };
  for (const k of heroes) if (run.rng() < (R.EPI_HERO[kind] || 0)) grace(k);
  if (heroes.length && R.EPI_SURE.hero.includes(kind) && !Object.keys(glow).length) grace(pick(heroes));
  // 카드 신탁 — 신탁이 아직 없는 카드. 사도마다(그 사도의 고유 카드) + 교주 카드 몫을 따로 굴린다.
  // 프리클이 몰래 챙겨 둔 것(rewardFlash)이 있거나 반드시 뜨는 칸인데 아무것도 안 빛났으면 하나는 반드시
  const able = flashTargets(run).filter((id) => !glow[id]);
  const owners = {};
  for (const id of able) (owners[CARDS[id].hero || "neutral"] ||= []).push(id);
  const lit = Object.values(owners).filter(() => run.rng() < (R.EPI_CARD[kind] || 0)).map(pick);
  if (able.length && !lit.length && (run.rewardFlash || R.EPI_SURE.card.includes(kind))) lit.push(pick(able));
  if (lit.length) run.rewardFlash = false;
  for (const cardId of lit) {
    const c = CARDS[cardId];
    const options = draw3([1, 2, 3, 4, 5].filter((n) => (c.flash || [])[n - 1] && flashOk(run, cardId, n))).sort((a, b) => a - b).map((n) => ({ n, shin: null }));
    // 기적 — 셋 가운데 하나에 드물게
    if (options.length && run.rng() < R.DIVINE) {
      // 「비용 -1」은 신탁을 얹은 뒤에도 비용이 1 이상인 선택지에만(①경량은 이미 0 일 수 있다)
      const o = pick(options);
      const kinds = divineKindsFor(flashed(c, o.n));
      o.shin = pick(kinds.length ? kinds : ["draw"]);
    }
    if (options.length) glow[cardId] = { kind: "card", options };
  }
  return glow;
}

// 아직 얻을 수 있는 고유 카드 — 덱에 있는 것 · 한 번 빼 버린 것(run.dropped)은 빠진다.
// 은총 · 상점이 같이 쓴다. 빼 버린 카드가 은총으로 다시 돌아오지 않게(사용자가 정한 규칙)
export function uniquesLeft(run, heroKey) {
  const gone = new Set(run.dropped || []);
  return uniqueIdsOf(heroKey).filter((id) => !run.deck.includes(id) && !gone.has(id));
}
// 덱에서 카드를 뺄 때 — 고유 카드면 적어 둔다
export function forgetCard(run, cardId) {
  if (CARDS[cardId] && CARDS[cardId].unique) (run.dropped = run.dropped || []).push(cardId);
  if (run.flash) delete run.flash[cardId];
}

export function uniqueIdsOf(heroKey) {
  return Object.keys(CARDS).filter((id) => CARDS[id].hero === heroKey && CARDS[id].unique)
    .sort((a, b) => a.localeCompare(b));
}

// 보상은 **들어올 때 한 번만 굴린다.** 화면을 다시 그릴 때마다 굴리면
// 볼 때마다 카드가 바뀐다(전에 그랬다).
export function rollReward(run) {
  const [lo, hi] = R.GOLD_FIGHT;
  const base = isBoss(run) ? R.GOLD_BOSS : lo + Math.floor(run.rng() * (hi - lo + 1)) + run.floor * 5;
  const gold = run.elite ? Math.round(base * R.ELITE_GOLD) : base;
  const lastBoss = isBoss(run) && run.floor >= FLOORS.length - 1 && (isFinal(run) || !FLOORS[run.floor].final);
  // 드랍 — 장비가 확률로 하나(R.DROP). 마지막 보스는 판이 끝나니 안 떨군다. 교주 카드는 상점 · 이벤트에서만
  const T = R.DROP[isBoss(run) ? "boss" : run.elite ? "elite" : "fight"];
  const at = (tbl) => tbl[Math.min(run.floor, tbl.length - 1)];
  const eq = !lastBoss && (run.devDrop || run.rng() < T.equip) ? offerEquip(run, at(T.equipGrade), 1, { dupes: true }) : [];   // devDrop — 시험 화면(&drop=1)
  run.reward = {
    equip: eq.length ? eq : null,
    equipTaken: null,
    gold, goldTaken: false,
    // 고유 카드 · 신탁은 이제 **전투 중 신탁**으로 얻는다(카제나) — 보상은 골드와 장비(엘리트 · 보스)
    cards: [],
    flash: null,
    gained: run.lastGained || { cards: [], flash: [] },
  };
  return run.reward;
}

// 강화 카드를 덱에 넣을 수 없는 까닭 — 이미 한 장 있으면(유일). 넣을 수 있으면 null.
// 은총 · 이벤트 · 보상이 덱에 카드를 넣는 곳마다 본다(rules.js isPower)
// 이 판에서 그 카드가 강화 카드인가 — 기본이 강화이거나, 「강화 카드.」 신탁을 붙였거나
export const powerCard = (run, cardId) => !!CARDS[cardId] && R.isPower(flashed(CARDS[cardId], (run.flash || {})[cardId]));
// 신탁 n 을 이 카드에 붙여도 되나 — 「강화 카드.」 신탁은 덱에 그 카드가 한 장일 때만 내놓는다
// (복제로 둘 이상 든 카드가 강화 카드가 되면 「한 장만」 이 깨진다 — 고르게 하지 않는 쪽을 택했다)
export function flashOk(run, cardId, n) {
  const c = CARDS[cardId];
  if (!c || !R.isPower(flashed(c, n)) || R.isPower(c)) return true;
  return run.deck.filter((x) => x === cardId).length <= 1;
}
// 유일(rules.js isOnly — 강화 카드 · 「유일.」 · 교주 「덱에 1장만.」)은 덱에 한 장만. 강화 카드는 써도 덱에 남는다(이 전투에서만 사라짐)
export const onlyCard = (run, cardId) => !!CARDS[cardId] && R.isOnly(flashed(CARDS[cardId], (run.flash || {})[cardId]));
export function powerWhy(run, cardId) {
  if (onlyCard(run, cardId) && run.deck.includes(cardId)) return "유일 — 덱에 한 장만 넣을 수 있습니다";
  return null;
}

// 쓰지 못한 신탁 — 빛났지만 그 카드를 안 내고 전투가 끝났다. 전투 뒤 창에서 하나를 골라 받는다(2026-10 사용자, fight-screen.js finish).
// g 는 그 전투의 빛(combat s.glow[cardId]) — 은총(hero)이면 고유 카드 하나를 덱에, 카드 신탁(card)이면 그 신탁(· 축복)을 붙인다. 까닭(못 받으면) 또는 null
export function claimGlow(run, cardId, g, choice) {
  const o = g && g.options && g.options[choice];
  if (o == null) return "고를 수 없습니다";
  if (g.kind === "hero") {
    if (powerWhy(run, o)) return powerWhy(run, o);
    run.deck.push(o);
    return null;
  }
  if (!flashOk(run, cardId, o.n)) return "강화 카드가 되는 신탁은 덱에 한 장일 때만 붙습니다";
  run.flash[cardId] = o.n;
  if (o.shin) (run.shin = run.shin || {})[cardId] = o.shin;
  return null;
}

export function takeReward(run, cardId) {
  if (cardId && !powerWhy(run, cardId)) run.deck.push(cardId);
  // 골드는 카드를 안 골라도 받는다 — 한 번만
  if (run.reward && !run.reward.goldTaken) { run.gold += run.reward.gold || 0; run.reward.goldTaken = true; }
}

// ── 골디의 상점 ──────────────────────────────────────────────────────────
// 층마다 보스 앞에서 한 번 들른다. 파는 것:
//   교주 카드 셋(효과가 다 도는 것만) · 파티 사도의 고유 카드 둘 · 카드 제거(한 번)
// 골디는 **할인하지 않는다**(인물 사전: 할인 요구에는 웃으며 단호). 값은 기획서의 골드 그대로.
export const needsShop = (run) => isBoss(run) && !run.shopSeen[run.floor] && !run.done;

// ── 캠프 ────────────────────────────────────────────────────────────────
// 한 층: 전투(0) → 전투(1) → 캠프 → 전투(2) → 캠프 + 상점 → 보스(3)
// 전투 칸 번호(node)는 그대로 두고, 그 사이에 들르는 칸을 끼운다.
export function nextStop(run) {
  if (run.done) return null;
  if (run.node === 2 && !run.stops[`${run.floor}:camp`]) return "camp";
  if (run.node === 3 && !run.stops[`${run.floor}:campshop`]) return "campshop";
  return null;
}

export function enterCamp(run, kind) {
  // 지도의 칸마다 따로 — 한 층에 휴식 칸이 여럿일 수 있다
  const key = `${run.floor}:${kind}${run.map && run.map.at ? ":" + run.map.at : ""}`;
  if (!run.stops[key]) {
    run.stops[key] = { used: null };
    run.camp = { key, train: offerFlash(run) };   // 수련 선택지는 들어올 때 한 번만 굴린다
  }
  return run.stops[key];
}

// 쉬기 — 파티 HP 를 파티 최대 HP 의 CAMP_HEAL 만큼 채운다(rules.js)
export const campHealOf = (run) => Math.min(run.partyMaxHp - run.partyHp, Math.round(run.partyMaxHp * R.CAMP_HEAL));
export function campRest(run) {
  const st = run.stops[run.camp && run.camp.key];
  if (!st || st.used) return "이번 캠프에서는 이미 골랐습니다";
  run.partyHp = Math.min(run.partyMaxHp, run.partyHp + Math.max(0, campHealOf(run)));
  st.used = "rest";
  return null;
}

// 수련 — 가진 고유 카드 하나에 신탁(다섯 중 셋)
export function campTrain(run, pick) {
  const st = run.stops[run.camp && run.camp.key];
  if (!st || st.used) return "이번 캠프에서는 이미 골랐습니다";
  if (!takeFlash(run, pick)) return "수련할 카드가 없습니다";
  st.used = "train";
  return null;
}

// 진열 — 교주 카드 셋(흔한 것이 자주) + 장비 셋. 고유 카드는 팔지 않는다(은총으로만)
function shelf(run) {
  const has = new Set(run.deck);
  const pool = NEUTRAL_IDS.filter((id) => CARDS[id].playable && !(R.isOnly(CARDS[id]) && has.has(id)));
  const neutral = [];
  while (neutral.length < R.SHOP_NEUTRAL && pool.length) {
    const w = pool.map((id) => R.SHOP_GRADE_WEIGHT[CARDS[id].grade] || 1);
    let r = run.rng() * w.reduce((a, b) => a + b, 0), i = 0;
    while (r >= w[i]) r -= w[i++];
    neutral.push(...pool.splice(i, 1));
  }
  return [
    ...neutral.map((id) => ({ id, kind: "neutral", price: CARDS[id].price, sold: false })),
    ...offerEquip(run, R.SHOP_EQUIP, R.SHOP_EQUIP_N).map((id) => ({ id, kind: "equip", price: R.EQUIP_PRICE[EQUIP[id].grade], sold: false })),
  ];
}

// 새로고침 값 — 이번 상점에서 몇 번 했나에 따라
export const rerollPrice = (run) => R.SHOP_REROLL + R.SHOP_REROLL_STEP * ((run.shop && run.shop.rerolls) || 0);

// 새로고침 — 진열을 통째로 다시 굴린다(팔린 칸도 새 물건으로). 택배 · 선물 · 카드 제거는 그대로
export function rerollShop(run) {
  if (!run.shop) return "상점이 열려 있지 않습니다";
  const price = rerollPrice(run);
  if (run.gold < price) return "골드가 모자랍니다";
  run.gold -= price;
  const keep = run.shop.items.filter((it) => it.delivery && !it.sold);
  run.shop.items = [...shelf(run), ...keep];
  run.shop.rerolls = (run.shop.rerolls || 0) + 1;
  return null;
}

export function rollShop(run) {
  run.shop = {
    floor: run.floor,
    items: shelf(run),
    rerolls: 0,
    removeUsed: false,
    gift: null,
  };
  // 슈팡에게 맡긴 택배(이벤트 C7) — 이번 상점에서 그 등급 장비 하나를 공짜로
  if (run.shopGift) {
    const [id] = offerEquip(run, { [run.shopGift]: 1 }, 1);
    if (id) run.shop.items.push({ id, kind: "equip", price: 0, sold: false, delivery: true });
    run.shopGift = null;
  }
  // 수양딸에게는 선물 — 할인이 아니라 선물이다(인물 사전: 실비아는 수양딸 · 돈에 쩨쩨하지 않다). 한 판에 한 번.
  if (!run.goldyGift && run.party.some((k) => (HERO_DATA[k] || {}).ko === "실비아")) {
    const shown = new Set(run.shop.items.map((it) => it.id));
    const gp = NEUTRAL_IDS.filter((id) => CARDS[id].playable && ["일반", "고급"].includes(CARDS[id].grade) && !shown.has(id));
    if (gp.length) {
      const id = gp[Math.floor(run.rng() * gp.length)];
      run.deck.push(id); run.goldyGift = id; run.shop.gift = id;
    }
  }
  run.shopSeen[run.floor] = true;
  return run.shop;
}

export const removePrice = (run) => R.PRICE_REMOVE + R.PRICE_REMOVE_STEP * (run.removals || 0);

// 산다 — 못 사면 왜인지 돌려준다(화면이 그대로 보여 준다)
export function buy(run, idx) {
  const it = run.shop && run.shop.items[idx];
  if (!it || it.sold) return "이미 팔린 물건입니다";
  if (run.gold < it.price) return "골드가 모자랍니다";
  run.gold -= it.price;
  it.sold = true;
  if (it.kind === "equip") gainEquip(run, it.id); else run.deck.push(it.id);
  return null;
}

// 카드 제거 — 한 번 들를 때 한 번. 덱에서 한 장(같은 카드가 여럿이면 하나만) 뺀다
export function removeCard(run, cardId) {
  if (!run.shop || run.shop.removeUsed) return "이번에는 더 뺄 수 없습니다";
  const price = removePrice(run);
  if (run.gold < price) return "골드가 모자랍니다";
  const i = run.deck.indexOf(cardId);
  if (i < 0) return "덱에 없는 카드입니다";
  if (R.isTaboo(CARDS[cardId])) return "금기 카드는 뺄 수 없습니다";   // v6 카제나 금기
  run.gold -= price;
  run.deck.splice(i, 1);
  run.removals = (run.removals || 0) + 1;
  run.shop.removeUsed = true;
  forgetCard(run, cardId);
  return null;
}

// 신탁 — **이미 가진 고유 카드**에만 붙는다(기획서: 고유 카드마다 신탁 다섯).
// 신탁 자리에서 그중 한 장을 골라, 다섯 중 **무작위 셋**을 보여 주고 하나를 고르게 한다.
// 한 카드에 하나만 붙는다 — 이미 붙은 카드는 다시 안 나온다.
export function flashTargets(run) {
  return run.deck.filter((id, i) => run.deck.indexOf(id) === i)
    .filter((id) => CARDS[id] && !isCopy(id) && (CARDS[id].unique || CARDS[id].neutral) && (CARDS[id].flash || []).length === 5 && !run.flash[id] && !R.isTaboo(CARDS[id]));   // 복제본은 빛나지 않는다   // 금기는 신탁이 안 붙는다
}

// 이 카드에 쓸모 있는 축복 — 피해가 없으면 피해 쪽을, 회복이 없으면 회복 쪽을 빼고, 비용 -1 은 1코 이상만
export function divineKindsFor(c) {
  if (!c) return [];
  if (c.bless) return R.blessKeys(c);   // 그 카드만의 축복이 있으면 그것들(셋까지 — "own" · "own1" · "own2")

  const fx = c.fx || [];
  const has = (k) => fx.some((f) => f.k === k || (k === "dmg" && f.k === "damage") || (k === "dmg" && f.k === "aoe"));
  const ok = { power: has("dmg"), weakSpot: has("dmg"), frost: has("dmg"), thorn: has("dmg"), heal: has("heal"),
    guard: has("block") || has("shield"), cost: typeof c.cost === "number" && c.cost >= 1, ap: typeof c.cost === "number" && c.cost >= 1 };
  return (R.DIVINE_KINDS[c.type] || ["draw", "cost"]).filter((k) => ok[k] !== false);
}

export function offerFlash(run) {
  const able = flashTargets(run);
  if (!able.length) return null;                       // 고유 카드가 없으면 신탁도 없다
  const cardId = able[Math.floor(run.rng() * able.length)];
  const all = [1, 2, 3, 4, 5].filter((n) => flashOk(run, cardId, n));
  const picks = [];
  while (picks.length < 3 && all.length) picks.push(...all.splice(Math.floor(run.rng() * all.length), 1));
  return { cardId, picks: picks.sort((a, b) => a - b) };
}

export function takeFlash(run, pick) {
  if (!pick || !pick.cardId || !pick.n || !flashOk(run, pick.cardId, pick.n)) return false;
  run.flash[pick.cardId] = pick.n;
  return true;
}

// ── 장비 ────────────────────────────────────────────────────────────────
// 칸은 사도당 무기·방어구·장신구 하나씩. 스탯 줄은 사도 스탯에 그대로 더한다.
// 애착 장비를 그 사도가 끼면 Lv.3 스탯이 더 붙는다(기획서: Lv.3 보너스는 작은 스탯 가산).
// HP 는 한 판의 최대 HP 에 바로 넣고, 공격·방어·치명은 전투를 열 때 넣는다(gearStats).
export function statsOf(equipId, heroKey) {
  const e = EQUIP[equipId];
  const out = { hp: 0, atk: 0, def: 0, crit: 0 };   // 옛 「회복력 +N」 은 v6 에 없앴다(치유도 방어력 — 장비는 「방어 +N」)
  if (!e) return out;
  for (const k in out) out[k] += e.stats[k] || 0;
  if (e.affinity && e.affinity === heroKey && e.affinityLv3) for (const k in out) out[k] += e.affinityLv3[k] || 0;
  return out;
}
export function gearOf(run, heroKey) { return (run.gear && run.gear[heroKey]) || {}; }
// 장비 효과 — 낀 장비의 「효과」 줄과, 애착 사도가 꼈으면 「애착」 줄. 둘 다 패시브 문법이라
// 전투를 열 때 그 사도의 패시브 뒤에 붙는다(js/passive.js setupPassives). 다 읽히는 줄만 켠다(build-cards 의 effectRead · affinityRead)
export function gearPassives(run) {
  const out = {};
  for (const k of run.party) {
    const parts = [];
    for (const id of Object.values(gearOf(run, k))) {
      const e = EQUIP[id];
      if (!e) continue;
      if (e.effect && e.effectRead) parts.push(e.effect.includes(":") ? e.effect : `${e.ko}: ${e.effect}`);
      if (e.affinity === k && e.affinityPassive && e.affinityRead) parts.push(e.affinityPassive.includes(":") ? e.affinityPassive : `${e.ko}(애착): ${e.affinityPassive}`);
    }
    if (parts.length) out[k] = parts.join(" · ");
  }
  return out;
}

export function gearStats(run) {
  const out = {};
  for (const k of run.party) {
    const t = { hp: 0, atk: 0, def: 0, crit: 0 };
    for (const id of Object.values(gearOf(run, k))) { const s = statsOf(id, k); for (const x in t) t[x] += s[x]; }
    out[k] = t;
  }
  return out;
}
const owned = (run) => new Set([...(run.bag || []), ...Object.values(run.gear || {}).flatMap((g) => Object.values(g))]);

// 파티 최대 HP 가 바뀌면 지금 HP 도 같이 — 늘면 그만큼 차고, 줄면 넘치는 만큼만 깎인다(장비 HP · 이벤트)
export function shiftHp(run, k, d) {
  if (!d) return;
  run.partyMaxHp = Math.max(1, (run.partyMaxHp || 1) + d);
  run.partyHp = Math.max(1, Math.min(run.partyMaxHp, (run.partyHp || 0) + Math.max(0, d)));
}

// 장비를 얻는다 — 드랍 · 상점 · 이벤트가 모두 이리로. 가방은 없다(2026-10 사용자: 장비를 얻으면 무조건 장착 or 판매 밖에 선택지 없게 하자).
// 얻은 장비는 run.bag(「정할 차례」 줄)에 섰다가 화면이 곧장 띄우는 창(ui.js settleGear)에서 끼거나 팔려 빠진다.
// 줄에 세워 두는 까닭 — 창을 보다 새로고침해도 산 장비가 사라지지 않고 다음 화면에서 다시 묻게(옛 판의 가방도 같은 줄로 처리된다)
export function gainEquip(run, equipId) {
  if (!EQUIP[equipId]) return "그런 장비가 없습니다";
  run.bag.push(equipId);
  return null;
}

// 낀다 — 한 번 끼면 빼지 못한다(뺄 길이 없다). replace 가 아니면 빈 칸에만.
// replace 면 그 칸에 낀 것을 판다(sellPrice 만큼 골드) — 바꿔 끼기 = 옛 장비 팔기
export function equip(run, heroKey, equipId, { replace = false } = {}) {
  const e = EQUIP[equipId];
  if (!e) return "그런 장비가 없습니다";
  if (!run.party.includes(heroKey)) return "파티에 없는 사도입니다";
  const i = run.bag.indexOf(equipId);
  if (i < 0) return "받은 장비가 아닙니다";
  const g = (run.gear[heroKey] = run.gear[heroKey] || {});
  const old = g[e.slot];
  if (old && !replace) return `${e.slot} 칸이 차 있습니다 — 바꿔 끼면 낀 것은 팔립니다`;
  run.bag.splice(i, 1);
  if (old) { shiftHp(run, heroKey, -statsOf(old, heroKey).hp); run.gold += sellPrice(old); }
  g[e.slot] = equipId;
  shiftHp(run, heroKey, statsOf(equipId, heroKey).hp);
  return null;
}

// 판다 — 받고 아직 정하지 않은 장비만. 낀 것은 바꿔 낄 때 저절로 팔린다. 사는 값의 EQUIP_SELL 만큼 골드
export const sellPrice = (equipId) => { const e = EQUIP[equipId]; return e ? Math.round((R.EQUIP_PRICE[e.grade] || 0) * R.EQUIP_SELL) : 0; };
export function sellEquip(run, equipId) {
  const i = run.bag.indexOf(equipId);
  if (i < 0) return "받은 장비가 아닙니다 — 낀 장비는 바꿔 낄 때 팔립니다";
  run.bag.splice(i, 1);
  run.gold += sellPrice(equipId);
  return null;
}

// 무작위로 n개 — 등급 가중치 { 희귀: 3, 전설: 1 }. 이미 가진 장비도 나온다 — 드랍 · 상점 · 이벤트 모두.
// 같은 역할 사도 둘(마법 딜러 둘)이 같은 장비를 하나씩 낄 수 있어야 한다. 한 번에 뽑는 n개끼리는 겹치지 않는다
export function offerEquip(run, weights, n, { dupes = true } = {}) {
  const have = dupes ? new Set() : owned(run);
  const pool = Object.keys(EQUIP).filter((id) => !have.has(id) && weights[EQUIP[id].grade]);
  const out = [];
  while (out.length < n && pool.length) {
    const w = pool.map((id) => weights[EQUIP[id].grade]);
    let r = run.rng() * w.reduce((a, b) => a + b, 0), i = 0;
    while (r >= w[i]) r -= w[i++];
    out.push(...pool.splice(i, 1));
  }
  return out;
}

// 칸을 정해 하나 — 이벤트의 「무기 (희귀)」 따위. 이미 가진 것은 빼고, 없으면 같은 칸 다른 등급도 안 준다
export function offerEquipSlot(run, grade, slot) {
  const have = owned(run);
  const pool = Object.keys(EQUIP).filter((id) => !have.has(id) && EQUIP[id].grade === grade && EQUIP[id].slot === slot);
  return pool.length ? [pool[Math.floor(run.rng() * pool.length)]] : [];
}

// 싸움이 떨군 장비 — 하나(rollReward 가 하나만 굴린다)를 받는다. 받자마자 끼기 or 팔기 창(gainEquip)
export function takeEquip(run, equipId) {
  const rw = run.reward;
  if (!rw || !rw.equip || !rw.equip.includes(equipId) || rw.equipTaken) return "고를 수 없습니다";
  gainEquip(run, equipId);
  rw.equipTaken = equipId;
  return null;
}

// 다음 칸으로. 보스를 넘으면 층이 바뀐다(사도 교체는 없다).
export function advance(run) {
  const wasBoss = isBoss(run);
  if (!wasBoss) { run.node++; return { swap: false }; }
  // 층 보스의 몫(고유 카드 복제)은 층을 넘기 전에 보스를 잡은 화면에서 셋 중 하나를 고른다(main.js reward · bossCopyOffer). 여기서는 안 한다
  const copied = null;
  // 마지막 층의 보스 뒤에 마지막 싸움이 있으면 층을 넘지 않고 그리로(node 4) — 캠프 한 번을 거친다(main.js finalCamp)
  if (!isFinal(run) && run.floor === FLOORS.length - 1 && FLOORS[run.floor].final) { run.node = 4; return { swap: false, final: true, copied }; }
  run.floor++; run.node = 0;
  if (run.floor >= FLOORS.length) { run.done = "clear"; return { swap: false, copied }; }
  // 층 사이에 조금 쉰다 — 몸도 마음도(사도 한 명에 10 씩이던 몫을 파티에). 사도 교체는 없다(처음 고른 셋으로 끝까지 간다)
  run.partyHp = Math.min(run.partyMaxHp, run.partyHp + FLOOR_REST * run.party.length);
  return { swap: false, copied };
}

// 층 보스 보상 — 덱에 **가진** 사도 고유 카드 가운데 셋을 내놓고 하나를 고르게 한다(2026-10 사용자: 무작위 한 장 → 셋 중 하나, 보스를 잡은 화면에서).
// 유일(강화 카드 — 신탁으로 강화가 된 것 포함)은 뺀다. 고를 것이 없으면 빈 배열.
// 내놓은 셋은 판에 적어 둔다(run.copyOffer) — 고르다 새로고침해도 같은 셋이다
const copyable = (run) => [...new Set(run.deck)].filter((id) => {
  const c = CARDS[id];
  if (!c || !c.unique || !c.hero || c.copy) return false;   // 복제본은 다시 복제하지 않는다(2026-10 사용자) — 원본이 후보에 남는다
  return !R.isOnly(flashed(c, (run.flash || {})[id]));
});
export function bossCopyOffer(run) {
  if (isFinal(run)) return [];
  const at = `${run.floor}`;
  if (run.copyOffer && run.copyOffer.at === at) return run.copyOffer.ids.slice();
  const pool = copyable(run), ids = [];
  while (ids.length < 3 && pool.length) ids.push(...pool.splice(Math.floor(run.rng() * pool.length), 1));
  run.copyOffer = { at, ids };
  return ids.slice();
}
// 고른 카드를 한 장 더 넣는다. id 를 안 주면(옛 길 · 시험) 가진 것 가운데 무작위. 복제한 카드 id(없으면 null)
export function bossCopy(run, id) {
  const pool = copyable(run);
  if (id == null) id = pool.length ? pool[Math.floor(run.rng() * pool.length)] : null;
  run.copyOffer = null;
  if (!id || !pool.includes(id)) return null;
  return addCopy(run, id);
}

// 복제본을 덱에 — 원본(id)의 신탁 · 축복을 그대로 옮겨 받은 따로 된 카드(id + COPY, cardbook). 그림이 뒤집혀 보이고 다시는 빛나지 않는다.
// 복제본을 또 복제하면 같은 복제본이 한 장 더. 이미 다른 신탁의 복제본이 있으면 그것을 따른다(신탁은 카드 id 에 걸린다). 넣은 id
export function addCopy(run, id) {
  const cid = isCopy(id) ? id : baseId(id) + COPY;
  if (!run.deck.includes(cid)) {
    const f = (run.flash || {})[id], sh = (run.shin || {})[id];
    if (f) run.flash[cid] = f; else delete run.flash[cid];
    if (sh) (run.shin = run.shin || {})[cid] = sh; else if (run.shin) delete run.shin[cid];
  }
  run.deck.push(cid);
  return cid;
}

// 판 기록 — 우로스 앞에서 저장하겠냐고 묻는다(main.js). 내려받은 파일을 모아 밸런스를 잰다(tools/records.js).
// 판을 되살리는 저장(save.js)과 달리 읽기 좋은 모양 — 이름을 같이 적는다
export function recordOf(run, stage) {
  const nm = (id) => (CARDS[id] ? CARDS[id].name : id);
  const count = {};
  for (const id of run.deck) count[id] = (count[id] || 0) + 1;
  return {
    kind: "bolzena-record", v: 1, stage, at: new Date().toISOString(), seed: run.seed,
    party: run.party.map((k) => ({ key: k, ko: (HERO_DATA[k] || {}).ko || k, row: run.rows[k], gear: Object.fromEntries(Object.entries(gearOf(run, k)).map(([s, id]) => [s, (EQUIP[id] || {}).ko || id])) })),
    partyHp: run.partyHp, partyMaxHp: run.partyMaxHp, gold: run.gold, gauge: run.gauge || 0, removals: run.removals || 0,
    deck: Object.entries(count).map(([id, n]) => ({ id, name: nm(id), n, hero: (CARDS[id] || {}).hero || null, flash: (run.flash || {})[id] || null, shin: (run.shin || {})[id] || null })),
    bag: run.bag.map((id) => (EQUIP[id] || {}).ko || id),
    fights: run.hist || [],
  };
}

// 층 사이 쉼 — 사도 한 명 몫(파티에 × 사도 수)
export const FLOOR_REST = 10;

// 사도 교체 — 덱에서 그 사도의 카드를 빼고 새 사도의 기본 카드를 넣는다
export function swapHero(run, outKey, inKey) {
  if (!run.party.includes(outKey) || run.party.includes(inKey)) return false;
  run.party[run.party.indexOf(outKey)] = inKey;
  // 나가는 사도의 장비는 다시 「정할 차례」 로 — 남은 사도에게 끼거나 판다(사도 교체는 지금 판에 없다)
  const gearHp = Object.values(gearOf(run, outKey)).reduce((x, id) => x + statsOf(id, outKey).hp, 0);
  for (const id of Object.values(gearOf(run, outKey))) run.bag.push(id);
  delete run.gear[outKey];
  shiftHp(run, outKey, -gearHp);
  run.bench = Object.keys(HERO_DATA).filter((k) => !run.party.includes(k));
  run.deck = run.deck.filter((id) => CARDS[id].hero !== outKey);
  run.deck.push(...buildDeck([inKey]).filter((id) => CARDS[id].hero === inKey));
  // 위치는 고정이다 — 나간 사람 자리를 물려받지 않고 제 자리에 선다.
  run.rows[inKey] = base(inKey).row;
  delete run.rows[outKey];
  for (const id of Object.keys(run.flash || {})) if (CARDS[id] && CARDS[id].hero === outKey) delete run.flash[id];
  // 파티 최대 HP — 나간 사도 몫(기본 HP)을 빼고 들어온 사도 몫을 더한다(장비 HP 는 「정할 차례」 로 돌아갈 때 위에서 뺐다)
  shiftHp(run, inKey, base(inKey).hp - base(outKey).hp);
  return true;
}

// 판이 끝났나 — 파티 HP 가 0(쓰러지는 사도는 없다)
export function partyWiped(run) { return (run.partyHp || 0) <= 0; }

// 옛 저장 — 사도마다 hp · maxHp 였던 판을 파티 HP 하나로(더한다). 주말농장에 갔던 사도(0)는 0 을 더한다
export function migrateRun(run) {
  if (!run) return run;
  // 옛 판(강화 카드가 「판 내내」 이던 때) — 써 버려 덱에서 빠진 강화 카드(run.spent)는 덱으로 돌려놓고, 판에 적힌 버프(run.boons)는 버린다
  if (run.spent || run.boons) {
    for (const id of run.spent || []) if (typeof id === "string" && !(run.deck || []).includes(id)) (run.deck = run.deck || []).push(id);
    delete run.spent; delete run.boons;
  }
  // 옛 판의 가방 — 버리지 않는다. 그대로 「정할 차례」 줄이 되어 지도 · 캠프 · 상점에 들어오면 하나씩 끼기 or 팔기로 묻는다(ui.js settleGear)
  if (!Array.isArray(run.bag)) run.bag = [];
  if (run.partyMaxHp != null) return run;
  const hp = run.hp || {}, max = run.maxHp || {};
  run.partyMaxHp = Math.max(1, run.party.reduce((a, k) => a + (max[k] || base(k).hp || 0), 0));
  run.partyHp = Math.min(run.partyMaxHp, run.party.reduce((a, k) => a + Math.max(0, hp[k] || 0), 0));
  delete run.hp; delete run.maxHp;
  return run;
}
