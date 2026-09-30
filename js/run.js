// 한 판(런)의 상태. 전투 바깥의 것들 — 편성·층·덱·체력·보상.
import { HEROES, ROSTER } from "./data/heroes.js";
import { HERO_DATA } from "./cardbook.js";

// 스탯은 기획서가 원본이다. 기획서에 없는 사도만 옛 heroes.js 를 본다.
const base = (k) => HERO_DATA[k] || HEROES[k] || { hp: 50, row: "mid" };
import { CARDS as OLD_CARDS, EXTRA } from "./data/cards.js";
import { CARDS, NEUTRAL_IDS, EQUIP } from "./cardbook.js";
import { FLOORS } from "./data/enemies.js";
import * as R from "./rules.js";
import { buildDeck, makeRng, partyBonds } from "./combat.js";

export function newRun(partyKeys, rows, seed = Date.now()) {
  const hp = {}, maxHp = {};
  for (const k of partyKeys) { hp[k] = base(k).hp; maxHp[k] = base(k).hp; }
  return {
    seed, rng: makeRng(seed),
    party: partyKeys.slice(), rows: { ...rows }, hp, maxHp,
    traits: [],                   // 옛 번뜩임 체계 — 지금은 안 쓴다(tools/sim.js 가 아직 잰다)
    flash: {},                    // 카드 id → 번뜩임 번호(1~5). 카드마다 하나만.
    reward: null,                 // 이번 보상에서 굴린 것 — 다시 그려도 안 바뀐다
    bag: [],                      // 얻었지만 안 낀 장비 id
    gear: {},                     // { 사도키: { 무기: id, 방어구: id, 장신구: id } }
    gold: R.GOLD_START,
    shop: null,                   // 이번 상점에서 굴린 진열 — 다시 그려도 안 바뀐다
    shopSeen: {},                 // 층마다 한 번 — { 0: true }
    removals: 0,                  // 카드 제거를 몇 번 했나 — 값이 오른다
    stops: {},                    // 들른 캠프 — { "0:camp": { used: "rest" } }
    camp: null,                   // 지금 캠프에서 굴린 수련 선택지
    deck: buildDeck(partyKeys),
    floor: 0, node: 0,            // node 0..2 전투, 3 보스
    bench: Object.keys(HERO_DATA).filter((k) => !partyKeys.includes(k)),
    met: {},                      // 함께 싸운 짝 — 다음 판에 '안면'이 된다
    done: null,
  };
}

export const currentFloor = (run) => FLOORS[run.floor];
export const isBoss = (run) => run.node >= 3;
export function currentEnemies(run) {
  if (run.eventFight) return run.eventFight.enemies;      // 이벤트가 연 전투(js/events.js)
  const f = currentFloor(run);
  return isBoss(run) ? f.boss : f.fights[run.node];
}

export function bonds(run) { return partyBonds(run.party); }

// 전투가 끝난 뒤 — 체력을 남기고, 만난 짝을 적어 둔다
export function afterFight(run, combat) {
  for (const u of combat.party) {
    run.hp[u.key] = u.dead ? 0 : u.hp;
    run.maxHp[u.key] = u.maxHp;
  }
  for (let i = 0; i < run.party.length; i++)
    for (let j = i + 1; j < run.party.length; j++)
      run.met[[run.party[i], run.party[j]].sort().join("|")] = true;
}

// 보상 — 편성한 사도의 카드 중 아직 없는 것에서 셋
// 보상으로 얻는 것은 **그 사도의 고유 카드**다.
// 기획서: 사도 1명당 카드 8장 = 시작 카드 4 + 고유 카드 4.
// 시작 덱에는 시작 카드 넉 장만 들어 있고, 고유 카드는 판을 돌며 하나씩 얻는다.
export function rewardCards(run) {
  const pool = [];
  for (const k of run.party)
    for (const id of uniqueIdsOf(k)) if (!run.deck.includes(id)) pool.push(id);
  const out = [];
  while (out.length < 3 && pool.length) out.push(...pool.splice(Math.floor(run.rng() * pool.length), 1));
  return out;
}

export function uniqueIdsOf(heroKey) {
  return Object.keys(CARDS).filter((id) => CARDS[id].hero === heroKey && CARDS[id].unique)
    .sort((a, b) => a.localeCompare(b));
}

// 보상은 **들어올 때 한 번만 굴린다.** 화면을 다시 그릴 때마다 굴리면
// 볼 때마다 카드가 바뀐다(전에 그랬다).
export function rollReward(run) {
  const [lo, hi] = R.GOLD_FIGHT;
  const gold = isBoss(run) ? R.GOLD_BOSS : lo + Math.floor(run.rng() * (hi - lo + 1)) + run.floor * 5;
  const lastBoss = isBoss(run) && run.floor >= FLOORS.length - 1;
  run.reward = {
    equip: isBoss(run) && !lastBoss ? offerEquip(run, R.BOSS_EQUIP[run.floor] || R.BOSS_EQUIP[0], 3) : null,
    equipTaken: null,
    gold, goldTaken: false,
    cards: rewardCards(run),
    // 프리클이 「다음 보상에서 몰래」 챙겨 둔 번뜩임(이벤트 B2)은 확률 없이 뜬다
    flash: run.rewardFlash || run.rng() < R.FLASH_CHANCE ? offerFlash(run) : null,
  };
  if (run.rewardFlash && run.reward.flash) run.rewardFlash = false;   // 몰래 챙긴 번뜩임은 한 번
  return run.reward;
}

export function takeReward(run, cardId) {
  if (cardId) run.deck.push(cardId);
  // 골드는 카드를 안 골라도 받는다 — 한 번만
  if (run.reward && !run.reward.goldTaken) { run.gold += run.reward.gold || 0; run.reward.goldTaken = true; }
}

// ── 골디의 상점 ──────────────────────────────────────────────────────────
// 층마다 보스 앞에서 한 번 들른다. 파는 것:
//   중립 카드 셋(효과가 다 도는 것만) · 파티 사도의 고유 카드 둘 · 카드 제거(한 번)
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
  const key = `${run.floor}:${kind}`;
  if (!run.stops[key]) {
    run.stops[key] = { used: null };
    run.camp = { key, train: offerFlash(run) };   // 수련 선택지는 들어올 때 한 번만 굴린다
  }
  return run.stops[key];
}

// 쉬기 — 살아 있는 사도만. 쓰러진 사도는 주말농장에서 쉬는 중이다
export function campRest(run) {
  const st = run.stops[run.camp && run.camp.key];
  if (!st || st.used) return "이번 캠프에서는 이미 골랐습니다";
  for (const k of run.party) {
    if ((run.hp[k] || 0) <= 0) continue;
    run.hp[k] = Math.min(run.maxHp[k], run.hp[k] + Math.round(run.maxHp[k] * R.CAMP_HEAL));
  }
  st.used = "rest";
  return null;
}

// 수련 — 가진 고유 카드 하나에 번뜩임(다섯 중 셋)
export function campTrain(run, pick) {
  const st = run.stops[run.camp && run.camp.key];
  if (!st || st.used) return "이번 캠프에서는 이미 골랐습니다";
  if (!takeFlash(run, pick)) return "수련할 카드가 없습니다";
  st.used = "train";
  return null;
}

export function rollShop(run) {
  const has = new Set(run.deck);
  const pool = NEUTRAL_IDS.filter((id) => CARDS[id].playable && !(CARDS[id].oneOnly && has.has(id)));
  const neutral = [];
  while (neutral.length < R.SHOP_NEUTRAL && pool.length) {
    const w = pool.map((id) => R.SHOP_GRADE_WEIGHT[CARDS[id].grade] || 1);
    let r = run.rng() * w.reduce((a, b) => a + b, 0), i = 0;
    while (r >= w[i]) r -= w[i++];
    neutral.push(...pool.splice(i, 1));
  }
  const upool = [];
  for (const k of run.party) for (const id of uniqueIdsOf(k)) if (!has.has(id)) upool.push(id);
  const unique = [];
  while (unique.length < R.SHOP_UNIQUE && upool.length) unique.push(...upool.splice(Math.floor(run.rng() * upool.length), 1));
  run.shop = {
    floor: run.floor,
    items: [
      ...neutral.map((id) => ({ id, kind: "neutral", price: CARDS[id].price, sold: false })),
      ...unique.map((id) => ({ id, kind: "unique", price: R.PRICE_UNIQUE + (CARDS[id].signature ? 35 : 0), sold: false })),
      ...offerEquip(run, R.SHOP_EQUIP, 1).map((id) => ({ id, kind: "equip", price: R.EQUIP_PRICE[EQUIP[id].grade], sold: false })),
    ],
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
    const gp = NEUTRAL_IDS.filter((id) => CARDS[id].playable && ["일반", "고급"].includes(CARDS[id].grade) && !neutral.includes(id));
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
  if (it.kind === "equip") run.bag.push(it.id); else run.deck.push(it.id);
  return null;
}

// 카드 제거 — 한 번 들를 때 한 번. 덱에서 한 장(같은 카드가 여럿이면 하나만) 뺀다
export function removeCard(run, cardId) {
  if (!run.shop || run.shop.removeUsed) return "이번에는 더 뺄 수 없습니다";
  const price = removePrice(run);
  if (run.gold < price) return "골드가 모자랍니다";
  const i = run.deck.indexOf(cardId);
  if (i < 0) return "덱에 없는 카드입니다";
  run.gold -= price;
  run.deck.splice(i, 1);
  run.removals = (run.removals || 0) + 1;
  run.shop.removeUsed = true;
  if (run.flash) delete run.flash[cardId];
  return null;
}

// 번뜩임 — **이미 가진 고유 카드**에만 붙는다(기획서: 고유 카드마다 번뜩임 다섯).
// 번뜩임 자리에서 그중 한 장을 골라, 다섯 중 **무작위 셋**을 보여 주고 하나를 고르게 한다.
// 한 카드에 하나만 붙는다 — 이미 붙은 카드는 다시 안 나온다.
export function flashTargets(run) {
  return run.deck.filter((id, i) => run.deck.indexOf(id) === i)
    .filter((id) => CARDS[id] && CARDS[id].unique && (CARDS[id].flash || []).length && !run.flash[id]);
}

export function offerFlash(run) {
  const able = flashTargets(run);
  if (!able.length) return null;                       // 고유 카드가 없으면 번뜩임도 없다
  const cardId = able[Math.floor(run.rng() * able.length)];
  const all = [1, 2, 3, 4, 5];
  const picks = [];
  while (picks.length < 3 && all.length) picks.push(...all.splice(Math.floor(run.rng() * all.length), 1));
  return { cardId, picks: picks.sort((a, b) => a - b) };
}

export function takeFlash(run, pick) {
  if (!pick || !pick.cardId || !pick.n) return false;
  run.flash[pick.cardId] = pick.n;
  return true;
}

// ── 장비 ────────────────────────────────────────────────────────────────
// 칸은 사도당 무기·방어구·장신구 하나씩. 스탯 줄은 사도 스탯에 그대로 더한다.
// 애착 장비를 그 사도가 끼면 Lv.3 스탯이 더 붙는다(기획서: Lv.3 보너스는 작은 스탯 가산).
// HP 는 한 판의 최대 HP 에 바로 넣고, 공격·방어·치명은 전투를 열 때 넣는다(gearStats).
export function statsOf(equipId, heroKey) {
  const e = EQUIP[equipId];
  const out = { hp: 0, atk: 0, def: 0, crit: 0 };
  if (!e) return out;
  for (const k in out) out[k] += e.stats[k] || 0;
  if (e.affinity && e.affinity === heroKey && e.affinityLv3) for (const k in out) out[k] += e.affinityLv3[k] || 0;
  return out;
}
export function gearOf(run, heroKey) { return (run.gear && run.gear[heroKey]) || {}; }
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

// 최대 HP 가 바뀌면 지금 HP 도 같이 — 늘면 그만큼 차고, 줄면 넘치는 만큼만 깎인다. 주말농장에 간 사도는 그대로 0
function shiftHp(run, k, d) {
  if (!d) return;
  run.maxHp[k] = Math.max(1, (run.maxHp[k] || 1) + d);
  if ((run.hp[k] || 0) > 0) run.hp[k] = Math.max(1, Math.min(run.maxHp[k], run.hp[k] + Math.max(0, d)));
}

// 낀다 — swap 이 아니면 빈 칸에만(바꿔 끼기는 캠프에서)
export function equip(run, heroKey, equipId, { swap = false } = {}) {
  const e = EQUIP[equipId];
  if (!e) return "그런 장비가 없습니다";
  if (!run.party.includes(heroKey)) return "파티에 없는 사도입니다";
  const i = run.bag.indexOf(equipId);
  if (i < 0) return "가방에 없는 장비입니다";
  const g = (run.gear[heroKey] = run.gear[heroKey] || {});
  const old = g[e.slot];
  if (old && !swap) return `${e.slot} 칸이 차 있습니다 — 바꿔 끼기는 캠프에서`;
  run.bag.splice(i, 1);
  if (old) { shiftHp(run, heroKey, -statsOf(old, heroKey).hp); run.bag.push(old); }
  g[e.slot] = equipId;
  shiftHp(run, heroKey, statsOf(equipId, heroKey).hp);
  return null;
}

// 뺀다 — 캠프에서만
export function unequip(run, heroKey, slot) {
  const g = gearOf(run, heroKey);
  const id = g[slot];
  if (!id) return "빈 칸입니다";
  shiftHp(run, heroKey, -statsOf(id, heroKey).hp);
  delete g[slot];
  run.bag.push(id);
  return null;
}

// 무작위로 n개 — 등급 가중치 { 희귀: 3, 전설: 1 }, 이미 가진 것은 빼고
export function offerEquip(run, weights, n) {
  const have = owned(run);
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

// 보스 보상의 장비 — 셋 중 하나를 가방에 넣는다(보상 화면이 빈 칸에 바로 끼게 해 준다)
export function takeEquip(run, equipId) {
  const rw = run.reward;
  if (!rw || !rw.equip || !rw.equip.includes(equipId) || rw.equipTaken) return "고를 수 없습니다";
  run.bag.push(equipId);
  rw.equipTaken = equipId;
  return null;
}

// 다음 칸으로. 층을 넘으면 사도를 한 명 바꿀 수 있다.
export function advance(run) {
  const wasBoss = isBoss(run);
  if (!wasBoss) { run.node++; return { swap: false }; }
  run.floor++; run.node = 0;
  if (run.floor >= FLOORS.length) { run.done = "clear"; return { swap: false }; }
  // 층 사이에 조금 쉰다 — 몸도 마음도
  for (const k of run.party) {
    run.hp[k] = Math.min(run.maxHp[k], run.hp[k] + 10);
  }
  return { swap: true };
}

// 사도 교체 — 덱에서 그 사도의 카드를 빼고 새 사도의 기본 카드를 넣는다
export function swapHero(run, outKey, inKey) {
  if (!run.party.includes(outKey) || run.party.includes(inKey)) return false;
  run.party[run.party.indexOf(outKey)] = inKey;
  // 나가는 사도의 장비는 가방으로 돌아온다
  for (const id of Object.values(gearOf(run, outKey))) run.bag.push(id);
  delete run.gear[outKey];
  run.bench = Object.keys(HERO_DATA).filter((k) => !run.party.includes(k));
  run.deck = run.deck.filter((id) => CARDS[id].hero !== outKey);
  run.deck.push(...buildDeck([inKey]).filter((id) => CARDS[id].hero === inKey));
  // 위치는 고정이다 — 나간 사람 자리를 물려받지 않고 제 자리에 선다.
  run.rows[inKey] = base(inKey).row;
  delete run.rows[outKey];
  for (const id of Object.keys(run.flash || {})) if (CARDS[id] && CARDS[id].hero === outKey) delete run.flash[id];
  run.hp[inKey] = base(inKey).hp;
  run.maxHp[inKey] = base(inKey).hp;
  delete run.hp[outKey];
  delete run.maxHp[outKey];
  return true;
}

export function partyWiped(run) { return run.party.every((k) => (run.hp[k] || 0) <= 0); }
