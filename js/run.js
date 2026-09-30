// 한 판(런)의 상태. 전투 바깥의 것들 — 편성·층·덱·체력·보상.
import { HEROES, ROSTER } from "./data/heroes.js";
import { HERO_DATA } from "./cardbook.js";

// 스탯은 기획서가 원본이다. 기획서에 없는 사도만 옛 heroes.js 를 본다.
const base = (k) => HERO_DATA[k] || HEROES[k] || { hp: 50, row: "mid" };
import { offerRelics, countOn } from "./data/relics.js";
import { CARDS as OLD_CARDS, EXTRA } from "./data/cards.js";
import { CARDS } from "./cardbook.js";
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
    relics: [],                   // 얻은 유물 [{id, hero|null}] — 사도당 3개까지
    gold: 0,
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
  run.reward = {
    cards: rewardCards(run),
    flash: run.rng() < R.FLASH_CHANCE ? offerFlash(run) : null,
  };
  return run.reward;
}

export function takeReward(run, cardId) { if (cardId) run.deck.push(cardId); }

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

// 유물 — 원작 아티팩트. 사도에게 붙는 것은 사도당 3개까지.
export function offerRelic(run) { return offerRelics(run.rng, run.relics, run.party); }
export function takeRelic(run, relicId, heroKey) {
  if (!relicId) return false;
  if (heroKey && countOn(run.relics, heroKey) >= 3) return false;
  run.relics.push({ id: relicId, hero: heroKey || null });
  return true;
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
