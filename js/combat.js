// 전투 규칙. 화면을 모른다 — 상태를 받아 상태를 바꾸고 기록(log)을 남긴다.
// 그래서 tools/sim.js 가 화면 없이 그대로 돌려 볼 수 있다.

import { HEROES } from "./data/heroes.js";
import { CARDS, starterOf, HERO_DATA, hasBuilt, flashed } from "./cardbook.js";
import { STARTER } from "./data/cards.js";
import { runFx } from "./run-fx.js";
import * as P from "./passive.js";
import { ENEMIES } from "./data/enemies.js";
import REL from "./data/relations.js";
import DESIGN from "./data/design.js";
import { traitSum } from "./data/traits.js";
import * as R from "./rules.js";
import TALK from "./data/talk.js";
import { 이가, 을를 } from "./ko.js";

// 사도 정보는 기획서가 원본이다. 기획서에 없는 사도만 옛 heroes.js 를 본다.
const HERO = (k) => HERO_DATA[k] || HEROES[k] || { ko: k, row: "mid" };

export const ROWS = ["front", "mid", "back"];
export const ROW_KO = (r) => (r === "front" ? "앞" : r === "mid" ? "가운데" : "뒤");

// 사이(관계 · 연계 · 각별한 짝의 첫 턴 AP)는 걷어 냈다 — 음성 대사에 함께 나온 횟수로 매겼는데,
// 135명 가운데 짝이 있는 사도가 몰려 있고(각별 7짝 · 초면 95%) 그걸 풀어 줄 이벤트도 없었다.
// ── 성격 (원작의 속성 체계) ────────────────────────────────────────────
// 기획서는 **상성**이다 — 광기 → 순수 → 냉정 → 광기, 활발 ↔ 우울.
// (한때 "같은 성격을 모을수록 강해진다"는 시너지로 만들었는데, 기획서가 시너지를 없애고
//  상성으로 정했다. 기획서가 원본이다.)
export const natureOf = (k) => (designOf(k) || {}).nature || REL.nature[k] || null;
export const natureEdge = R.natureEdge;


// ── 난수 (씨앗을 주면 같은 판이 재현된다) ───────────────────────────────
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => ((s ^= s << 13), (s ^= s >>> 17), (s ^= s << 5), (s >>> 0) / 4294967296);
}

// ── 상태 이상 ──────────────────────────────────────────────────────────
const BAD = ["취약", "약화", "감전", "중독"];
const st = (u, id) => u.status[id] || 0;
const addSt = (u, id, v) => { u.status[id] = Math.max(0, st(u, id) + v); if (!u.status[id]) delete u.status[id]; };

// ── 전투 시작 ──────────────────────────────────────────────────────────
// gauge — 지난 전투에서 남은 고학년 게이지(run.gauge). 전투가 끝나도 이어진다
export function newCombat({ partyKeys, rows, deck, enemyIds, hp, maxHp, seed, noNature, traits, gear, gearFx, flash, enemyHp, next, shin, glow, gauge }) {
  const rng = makeRng(seed);
  const party = partyKeys.map((key, i) => {
    // 스탯은 기획서가 원본이다. 기획서에 없는 사도만 옛 heroes.js 를 본다.
    const d = HERO_DATA[key] || null;
    const base = d || HEROES[key] || {};
    const baseHp = d ? d.hp : (HEROES[key] || {}).hp || 50;
    // 장비 스탯 줄 — 공격·방어·치명은 여기서 더한다(HP 는 한 판의 최대 HP 에 이미 들어 있다)
    const g = (gear && gear[key]) || { atk: 0, def: 0, crit: 0 };
    return {
      key, side: "party",
      ko: base.ko || key, role: base.role || null,
      tint: (HEROES[key] || {}).tint || "#8a8a9a",
      maxHp: (maxHp && maxHp[key]) || baseHp,
      hp: hp && hp[key] != null ? hp[key] : (maxHp && maxHp[key]) || baseHp,
      atk: (d ? d.atk : 10) + (g.atk || 0), def: (d ? d.def : 3) + (g.def || 0), crit: (d ? d.crit : 5) + (g.crit || 0),
      row: (rows && rows[key]) || base.row || "mid",
      block: 0, shield: 0, status: {}, idx: i, dead: false,
    };
  });
  // 적 체력 — 난이도 배율(rules.js ENEMY_HP). 재는 도구는 enemyHp 로 바꿔 가며 잰다
  const hpx = enemyHp || R.ENEMY_HP || 1;
  const enemies = enemyIds.map((id, i) => {
    const e = ENEMIES[id];
    const ehp = Math.round(e.hp * hpx);
    return { key: id, side: "enemy", ko: e.ko, tint: e.tint, maxHp: ehp, hp: ehp,
      row: e.row, block: 0, status: {}, idx: i, dead: false, boss: !!e.boss, step: 0, intent: null };
  });

  const s = {
    rng, party, enemies,
    // AP — 파티 공용, 매 턴 3, **남으면 사라진다**(기획서).
    turn: 0, ap: 0, apPerTurn: R.AP_PER_TURN, apJam: 0, tentacles: 0,
    // 고학년 게이지 — 파티 공용 0~300%. 카드에 쓴 AP 1당 +10%. 0코는 충전 없음.
    gauge: Math.max(0, Math.min(R.GAUGE_MAX, gauge || 0)), lastUlt: null,
    partyDmg: 0, crit: 0, rearBuff: 0, overdrive: false,
    draw: shuffle(rng, deck.slice()), hand: [], discard: [], gone: [],
    lastHero: null, nextCheaper: 0, taunt: null,
    poisonKills: 0, log: [], over: null,
    traits: (traits || []).slice(),
  };
  // 이 판에서 고른 신탁을 얹은 장부. 카드를 읽는 곳은 전부 cardOf 를 쓴다.
  s.flash = { ...(flash || {}) };
  s.book = {};
  for (const [id, n] of Object.entries(s.flash)) if (CARDS[id]) s.book[id] = flashed(CARDS[id], n);

  // 위치는 기획서가 정한 제 자리로 고정이다. 옮길 수 없다 —
  // 기본 스탯이 위치에서 나오기 때문이다(전열 탱커 HP 90 · 후열 딜러 HP 55).

  s.noNature = !!noNature;   // 상성을 끄고 재려면 필요하다

  // 첫 턴에 더 받는 AP — 이벤트의 「다음 전투: 첫 턴 AP +1」만 얹는다
  s.startSp = 0;
  // 신탁 '눈치' — 첫 손패가 한 장 많다
  s.opening = tr(s, "opening");
  // 전투를 열며 한 명이 말한다
  const opener = s.party[Math.floor(rng() * s.party.length)];
  if (opener) speak(s, opener.key, "start");

  // 패시브와 키워드 — 기획서의 글을 js/passive.js 가 읽어 둔 것을 건다
  P.setupPassives(s, (k) => HERO_DATA[k], gearFx || {});   // 장비 효과 · 애착도 그 사도의 패시브로
  for (const kw of Object.values(s.kw)) if (kw.carrier === "self" && kw.cap != null) {
    s.stackCap = s.stackCap || {};
    (s.stackCap[kw.owner] = s.stackCap[kw.owner] || {})[kw.id] = kw.cap;
  }
  P.collectAlways(s);
  // 개전 카드는 첫 손패에 든다 — 뽑을 더미는 끝에서부터 뽑으니 끝으로 옮긴다
  const opening = s.draw.filter((id) => hasTag(cardOf(s, id), "개전"));
  if (opening.length) s.draw = [...s.draw.filter((id) => !opening.includes(id)), ...opening];
  // 기적이 붙은 카드 — 피해 배율 ×1.3(rules.js SHIN). 이벤트에서 얻는다
  s.shin = { ...(shin || {}) };
  // 신탁 — 빛나는 카드(run.js rollEpiphany). 내는 순간 화면이 셋 중 하나를 고르게 하고 applyEpiphany 로 건다
  s.glow = JSON.parse(JSON.stringify(glow || {}));
  s.gained = { cards: [], flash: [] };     // 이 전투에서 얻은 것 — 끝나면 run.js afterFight 가 판에 남긴다
  s.freeOnce = {};                          // 신탁이 붙은 카드 — 이번에 내는 것은 비용 0
  s.freeTurn = {};                          // 은총으로 얻은 카드 — 그 턴 비용 0
  // 이벤트가 걸어 둔 「다음 전투」 효과(docs/08-이벤트.md) — 이 전투에서 한 번
  if (next) {
    if (next.ap) { s.startSp += next.ap; say(s, `이벤트 — 첫 턴 AP ${next.ap > 0 ? "+" : ""}${next.ap}`); }
    if (next.gauge) { s.gauge = Math.min(R.GAUGE_MAX, s.gauge + next.gauge); say(s, `이벤트 — 고학년 게이지 +${next.gauge}%`); }
    if (next.hand) { s.opening = (s.opening || 0) + next.hand; say(s, `이벤트 — 첫 손패 +${next.hand}`); }
    if (next.weak) { for (const u of s.party) if (!u.dead) addSt(u, "약화", next.weak); say(s, `이벤트 — 아군 전원 약화 ${next.weak}턴`); }
    if (next.hpCut) { for (const u of s.party) if (!u.dead) u.hp = Math.max(1, u.hp - Math.round(u.maxHp * next.hpCut)); say(s, `이벤트 — 시작하자마자 오작동, HP -${Math.round(next.hpCut * 100)}%`); }
  }
  emit(s, "fightStart", {});
  foePassives(s, "fightStart");
  beginTurn(s);
  return s;
}

// 화면이 칩에 쓰는 값 — 버프·「항상」 패시브·키워드 1개당을 합친 것
export const statOf = (s, u, stat) => P.statMod(s, u, stat);

// 패시브를 부른다 — 누가 일으켰는지(acting)를 잠깐 바꿔 두어야 「적을 처치하면」 이 제 사람을 찾는다
function emit(s, ev, info) {
  P.emit(s, ev, info, (owner, fx, ctx, label) => {
    say(s, label);
    const prev = s.acting;
    s.acting = owner.key;
    runFx(s, fx, ctx, fxApi(s));
    s.acting = prev;
    checkOver(s);
  });
}

// 신탁 값 — 없으면 0
const tr = (s, at) => traitSum(s.traits, at);

function shuffle(rng, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const say = (s, t) => s.log.push(t);

// 사도가 말한다. 그 순간에 맞는 줄이 없으면 아무 말도 안 한다 — 틀린 대사보다 없는 편이 낫다.
// 한 전투에서 같은 순간을 되풀이하지 않는다(같은 말을 두 번 들으면 대사가 아니라 소리가 된다).
export function speak(s, heroKey, moment) {
  const lines = ((TALK.lines || {})[heroKey] || {})[moment];
  if (!lines || !lines.length) return null;
  s.said = s.said || {};
  const key = `${heroKey}:${moment}`;
  if (s.said[key]) return null;
  s.said[key] = true;
  const t = lines[Math.floor(s.rng() * lines.length)];
  s.bubble = { hero: heroKey, text: t, turn: s.turn };
  say(s, `${HERO(heroKey).ko}: "${t}"`);
  return t;
}
export const alive = (arr) => arr.filter((u) => !u.dead);

// ── 턴 ─────────────────────────────────────────────────────────────────
function beginTurn(s) {
  s.turn++;
  // AP 는 **이월되지 않는다**(기획서). 매 턴 새로 받는다.
  const gain = Math.max(0, s.apPerTurn - s.apJam)
    + (s.turn === 1 ? s.startSp : 0);
  if (s.apJam) say(s, `방해로 AP -${s.apJam}`);
  s.apJam = 0;
  s.ap = gain;
  s.lastHero = null; s.nextCheaper = 0; s.erpinSp = 0; s.nerWorked = false;
  s.playedThisTurn = 0;
  // 무적은 적의 차례까지 간다 — 전에는 적이 치기 전에 풀려서 아무것도 막지 못했다
  for (const u of s.party) u.invuln = false;
  for (const u of alive(s.party)) u.block = 0;
  // 「이번 턴」 버프는 적의 차례까지 간다 — 막아 주는 버프가 적이 치기 전에 풀리면 안 된다.
  // 그래서 다음 내 턴이 시작될 때 줄인다(방어도 여기서 사라진다).
  if (s.turn > 1) { P.tickMods(s); P.decayKeywords(s); }   // 버프 시간 · 키워드 겹 — 적의 차례가 끝난 뒤에 줄인다

  // 원작의 중독은 지속 피해가 아니라 공격력을 깎는 것이다. 그래서 턴 시작에 아무 일도 안 한다.
  // 촉수는 턴이 끝날 때 때린다(프리클) — 아래 endTurn 에 있다.
  for (const e of alive(s.enemies)) { rollIntent(s, e); e.rushCnt = 0; }
  resetFoePassives(s);
  foePassives(s, "turnStart");

  // 신탁 '성급한 손' — SP 를 더 받는 대신 손패가 한 장 적다
  draw(s, 5 + (s.turn === 1 ? (s.opening || 0) : 0) - tr(s, "handdown"));
  emit(s, "turnStart", {});
  checkOver(s);
}

// 적의 다음 수를 고른다. 규칙은 data/enemies.js 머리말에 있다.
// fresh: 수를 흐트러뜨릴 때(예지 따위) — 모아 둔 힘(charge)도 흩어진다.
function rollIntent(s, e, fresh) {
  const d = ENEMIES[e.key];
  e.hist = e.hist || [];
  // 지난 턴에 힘을 모았다면 이번 턴엔 그것을 쏟는다 — 예고한 대로
  if (!fresh && e.intent && e.intent.next) { e.intent = e.intent.next; return; }
  // 체력이 떨어지면 판이 바뀐다(한 번)
  if (d.phase && !e.phased && e.hp <= e.maxHp * d.phase.at) {
    e.phased = true; e.step = 0;
    say(s, `${e.ko}: ${d.phase.say}`);
  }
  const list = e.phased ? d.phase.intents : d.intents;
  let it;
  if (!e.phased && e.step === 0 && d.open) it = d.open;
  else if (d.pick === "shuffle") {
    // 같은 종류를 세 번 잇지 않는다 — 운이 나빠 세 번 연속 몰려오면 억울하다
    const [a, b] = e.hist.slice(-2);
    let pool = list.filter((x) => !(a && a === b && x.t === a));
    if (!pool.length) pool = list;
    const total = pool.reduce((n, x) => n + (x.w || 1), 0);
    let r = s.rng() * total;
    it = pool.find((x) => (r -= x.w || 1) < 0) || pool[pool.length - 1];
  } else it = list[(e.step - (d.open && !e.phased ? 1 : 0)) % list.length];
  e.intent = it;
  e.hist.push(it.t);
  e.step++;
}

// 머리 위에 보여 줄 수치 — 힘·약화가 들어간 값. 화면이 날것의 v 를 보이면 실제와 달랐다.
export function intentHit(e) {
  const it = e.intent;
  if (!it || !["attack", "back", "attackAll", "multi"].includes(it.t)) return null;
  return dealt(e, it.v);
}

export function endTurn(s) {
  s.freeTurn = {};                          // 은총으로 얻은 카드의 「그 턴 비용 0」은 여기까지
  if (s.over) return s;
  emit(s, "turnEnd", {});
  P.tickTurnEnd(s, (t, v, o) => hurt(s, t, v, o), (t) => say(s, t));
  checkOver(s); if (s.over) return s;

  // 네르의 보호 — 체력이 가장 적은 아군을 감싼다
  const ner = s.party.find((u) => u.key === "ner" && !u.dead);
  if (ner) {
    // 네르는 게임에서 하나뿐인 서포터다 — 파티에 SP 를 대 준다.
    // 다만 **그 턴에 네르가 일했을 때만**. 그냥 매 턴 주게 뒀더니 네르 없는 편성이 0.4% 가 됐다.
    if (s.nerWorked) { s.ap += 1; say(s, "네르가 AP를 대 준다 (+1)"); }
    const target = alive(s.party).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const v = s.party.some((u) => u.key === "erpin" && !u.dead) ? 5 : 3;
    if (target) { target.block += v; say(s, `네르가 ${을를(target.ko)} 감싼다 (방어도 +${v})`); }
  }
  // 프리클의 가시 촉수 — 소멸 전까지 근처의 적을 친다(원작 그대로)
  if (s.tentacles > 0) {
    for (let i = 0; i < s.tentacles; i++) {
      const t = alive(s.enemies)[0]; if (!t) break;
      hurt(s, t, 4);
    }
    say(s, `가시 촉수 ${s.tentacles}개가 ${을를(alive(s.enemies)[0] ? alive(s.enemies)[0].ko : "적")} 친다`);
  }

  // 보존 카드는 손에 남는다
  const keep = s.hand.filter((id) => hasTag(cardOf(s, id), "보존"));
  s.discard.push(...s.hand.splice(0).filter((id) => !cardOf(s, id).temp && !hasTag(cardOf(s, id), "보존")));
  s.hand.push(...keep);
  checkOver(s); if (s.over) return s;

  foePassives(s, "turnEnd");
  checkOver(s); if (s.over) return s;
  enemyPhase(s);
  checkOver(s); if (s.over) return s;
  for (const e of s.enemies) if (e.stunGuard) e.stunGuard--;
  // 도발은 정한 턴만큼 간다
  if (s.taunt && s.tauntLeft != null && --s.tauntLeft <= 0) { s.taunt = null; s.tauntLeft = null; }

  for (const u of [...alive(s.party), ...alive(s.enemies)]) {
    for (const id of ["취약", "약화", "감전", "침묵"]) if (st(u, id) > 0) addSt(u, id, -1);
    // 중독은 천천히 풀린다. 안 풀리게 뒀더니 쌓이기만 해서 적이 내내 반토막 났다(완주율 76%).
    // 이제는 계속 덧발라야 한다 — 그게 마요를 굴리는 맛이기도 하다.
    if (st(u, "중독") > 0) addSt(u, "중독", -1);
  }
  beginTurn(s);
  return s;
}

function enemyPhase(s) {
  for (const e of alive(s.enemies)) {
    e.block = 0;
    if (e.sealed) {
      e.sealed = false;
      say(s, `${e.ko}: 봉인되어 움직이지 못한다${e.intent && e.intent.next ? " — 모은 힘이 흩어졌다" : ""}`);
      if (e.intent && e.intent.next) e.intent = null;
      continue;
    }
    actEnemy(s, e);
    if (s.over) return;
  }
}

// 즉시 행동 장수 — **지금 예고한 수**마다 다르다. 수에 rush 가 적혀 있으면 그것, 없으면 그 적의 rush,
// 그것도 없으면 수의 값어치로 정한다: 센 수일수록 많이 내야 당겨진다(큰 한 방이 한 턴에 두 번 오면 막을 길이 없다).
// 0 이면 당겨지지 않는다 — 힘을 모으는 수(charge)와 모아서 쏟는 수는 기본이 0.
// 최소 3장(ENEMY_RUSH_MIN) — 2장이면 한 턴 보통 3장 안에 늘 당겨져 그 적이 매 턴 두 번 움직였다.
export function intentRush(it, d = {}) {
  if (!it) return 0;
  const floor = (n) => (n ? Math.max(R.ENEMY_RUSH_MIN || 3, n) : 0);
  if (it.rush != null) return floor(it.rush);
  if (d.rush != null) return floor(d.rush);
  const moves = [...(d.intents || []), ...((d.phase && d.phase.intents) || []), ...(d.open ? [d.open] : [])];
  if (it.t === "charge" || moves.some((x) => x.t === "charge" && x.next === it)) return 0;
  const threat = it.t === "attack" || it.t === "back" ? it.v
    : it.t === "multi" ? it.v * (it.n || 1)
    : it.t === "attackAll" ? it.v * 2.5
    : 0;                                   // 방어 · 회복 · 강화 · 방해 · 약화 — 작은 수
  if (!threat) return R.ENEMY_RUSH_SMALL || 3;
  return threat <= 6 ? 3 : threat <= 12 ? 4 : threat <= 20 ? 5 : 6;
}
export const rushOf = (e) => intentRush(e.intent, ENEMIES[e.key] || {});

// 즉시 행동 — 지금 수가 예고된 뒤로 파티가 카드를 그 수의 장수만큼 내면, 수를 당겨서 하고 새 수를 예고한다.
// 새 수는 다시 0장부터 센다. 턴이 바뀌어도 0부터(beginTurn).
// 봉인된 적은 하지 않는다(봉인은 턴 끝의 행동을 막는 것이라 여기서 풀지 않는다). 방어도는 지우지 않는다.
function rushEnemies(s) {
  for (const e of alive(s.enemies)) {
    const n = rushOf(e);
    if (!n || e.sealed || !e.intent) continue;
    e.rushCnt = (e.rushCnt || 0) + 1;
    if (e.rushCnt < n) continue;
    e.rushCnt = 0;
    say(s, `${e.ko}: 카드 ${n}장 — 즉시 행동!`);
    actEnemy(s, e);
    emit(s, "rush", { enemy: e });
    if (s.over) return;
    if (!e.dead) { foePassives(s, "rushed", { target: e }); rollIntent(s, e); }
    if (s.over) return;
  }
}

// ── 적 패시브 ────────────────────────────────────────────────────────────
// 적 데이터의 passives: [{ name, on, do, ...조건 }]. 규칙은 data/enemies.js 머리말.
//   on   fightStart · turnStart · turnEnd · hurt(이 적이 맞음) · lowHp(at 비율 아래로 처음) · allyDown(동료가 쓰러짐)
//        card(파티가 카드를 냄 — type 이 있으면 그 종류만, every 가 있으면 이번 턴 N장째마다) · rushed(즉시 행동으로 당겨짐)
//        debuffed(이 적에게 디버프가 걸림)
//   do   수와 같은 모양({t, v, …} — attack · back · attackAll · multi · block · guard · heal · buff · debuff · jam)
//        + thorns v(때린 사도에게 그대로 v) · selfHeal v(자기 회복)
//   limit  한 턴에 몇 번(기본 1). fightStart · lowHp 는 한 번뿐. 0 이면 제한 없음
const FOE_ONCE = new Set(["fightStart", "lowHp"]);
function foePassives(s, ev, info = {}) {
  for (const e of alive(s.enemies)) {
    const ps = (ENEMIES[e.key] || {}).passives; if (!ps) continue;
    for (const p of ps) {
      if (p.on !== ev) continue;
      if ((ev === "hurt" || ev === "lowHp" || ev === "rushed" || ev === "debuffed") && info.target !== e) continue;
      if (ev === "allyDown" && info.target === e) continue;
      if (ev === "lowHp" && !(info.before > p.at && info.after <= p.at)) continue;
      if (ev === "card" && ((p.type && info.type !== p.type) || (p.every && info.nth % p.every !== 0))) continue;
      e.pUsed = e.pUsed || {};
      const k = p.name, lim = FOE_ONCE.has(ev) ? 1 : (p.limit ?? 1);
      if (lim && (e.pUsed[k] || 0) >= lim) continue;
      e.pUsed[k] = (e.pUsed[k] || 0) + 1;
      say(s, `${e.ko} · ${p.name}`);
      // 가시는 방어 · 실드에 막힌다 — 「가시엔 실드」 가 답이 되게(전에는 pure 라 다 뚫었다)
      if (p.do.t === "thorns") { if (info.from && !info.from.dead && info.from.side === "party") hurt(s, info.from, p.do.v); }
      else if (p.do.t === "selfHeal") { const v = Math.min(p.do.v, e.maxHp - e.hp); e.hp += v; }
      else actEnemy(s, e, { say: p.name, ...p.do }, true);
      if (s.over) return;
    }
  }
}
// 턴이 바뀌면 「한 턴에 몇 번」 을 다시 센다. fightStart · lowHp 는 남긴다
function resetFoePassives(s) {
  for (const e of s.enemies) if (e.pUsed) for (const k of Object.keys(e.pUsed)) {
    const p = ((ENEMIES[e.key] || {}).passives || []).find((x) => x.name === k);
    if (!p || !FOE_ONCE.has(p.on)) delete e.pUsed[k];
  }
}

// 적 하나가 수를 한다 — 턴 끝(enemyPhase) · 즉시 행동(rushEnemies) · 적 패시브(foePassives)가 같이 쓴다.
// it 을 안 주면 예고해 둔 수. passive 면 침묵에 막히지 않는다(몸에 붙은 성질이라).
function actEnemy(s, e, it = e.intent, passive = false) {
  if (!it) return;
  if (!passive && st(e, "침묵") > 0 && !["attack", "back", "attackAll", "multi"].includes(it.t)) {
    say(s, `${e.ko}: 침묵 — ${it.say} 을(를) 못 했다`);
    if (it.next) e.intent = null;          // 모으던 힘도 흩어진다
    return;
  }
  if (it.t === "attack" || it.t === "back") {
    const t = pickTarget(s, it.t === "back");
    if (t) {
      const d = dealt(e, it.v); hurt(s, t, d, { from: e });
      say(s, `${e.ko}: ${it.say} → ${t.ko} (${d})`);
      // 맞은 사람에게 상태를 건다 — 「창끝으로 찌른다」 취약 따위
      if (it.id && !t.dead) { addSt(t, it.id, it.n || 1); say(s, `${t.ko}: ${it.id} +${it.n || 1}`); }
    }
  } else if (it.t === "multi") {
    // 한 번마다 새로 고른다 — 앞사람이 쓰러지면 다음 사람에게 간다
    const d = dealt(e, it.v);
    for (let k = 0; k < (it.n || 1); k++) { const t = pickTarget(s, false); if (!t) break; hurt(s, t, d, { from: e }); }
    say(s, `${e.ko}: ${it.say} (${d}×${it.n})`);
  } else if (it.t === "charge") {
    say(s, `${e.ko}: ${it.say} — 다음 턴 ${it.next.say}`);
  } else if (it.t === "guard") {
    for (const x of alive(s.enemies)) x.block += it.v;
    say(s, `${e.ko}: ${it.say} (적 전체 방어 +${it.v})`);
  } else if (it.t === "heal") {
    const x = alive(s.enemies).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
    if (x) { const v = Math.min(it.v, x.maxHp - x.hp); x.hp += v; say(s, `${e.ko}: ${it.say} (${x.ko} +${v})`); }
  } else if (it.t === "attackAll") {
    for (const t of alive(s.party)) { const d = dealt(e, it.v); hurt(s, t, d, { from: e }); }
    say(s, `${e.ko}: ${it.say} (${it.v})`);
  } else if (it.t === "block") { e.block += it.v; say(s, `${e.ko}: ${it.say}`); }
  else if (it.t === "buff") { addSt(e, it.id, it.v); say(s, `${e.ko}: ${it.say} (${it.id} +${it.v})`); }
  else if (it.t === "jam") {
    // 원작의 감전이 공격·이동속도를 늦추듯, 방해는 SP 수급을 늦춘다
    s.apJam += it.v;
    say(s, `${e.ko}: ${it.say} (다음 턴 AP -${it.v})`);
  }
  else if (it.t === "debuff") {
    for (const t of alive(s.party)) addSt(t, it.id, it.v);
    say(s, `${e.ko}: ${it.say} (${it.id} +${it.v})`);
  }
}

// 앞줄이 먼저 맞는다. 뒤를 노리는 수(back)는 거꾸로 뒷줄부터.
// 같은 열이면 **적 쪽에 선 사도가 먼저** 맞는다 — 편성에서 ⇄ 로 정한 자리(파티 순서가 뒤일수록 적 쪽).
// 뒤를 노리는 수는 같은 열에서도 가장 안쪽(파티 순서가 앞)부터. 열이 주는 효과 · 조건은 자리와 상관없이 열만 본다.
// 도발이 걸려 있으면 어느 쪽이든 그 사도가 맞는다.
function pickTarget(s, fromBack) {
  const live = alive(s.party); if (!live.length) return null;
  if (s.taunt) { const t = live.find((u) => u.key === s.taunt); if (t) return t; }
  const order = fromBack ? ROWS.slice().reverse() : ROWS;
  for (const r of order) {
    const inRow = live.filter((u) => u.row === r);
    if (inRow.length) return inRow.reduce((a, b) => (fromBack ? (b.idx < a.idx ? b : a) : (b.idx > a.idx ? b : a)));
  }
  return live[0];
}

// ── 피해 ───────────────────────────────────────────────────────────────
// 감전과 중독은 원작에서 공격력을 깎는 디버프다. 약화와 함께 곱해 준다.
// 감전·중독·약화는 셋 다 공격력을 깎는다. 그냥 곱하면 적이 18%만 때리게 돼서(실제로 그랬다)
// 셋을 합친 뒤 바닥을 둔다 — 아무리 깎아도 절반 아래로는 안 내려간다.
const CUT_FLOOR = 0.5;
function dealt(from, v) {
  let m = 1;
  if (st(from, "약화") > 0) m *= 1 - R.WEAK;
  if (st(from, "감전") > 0) m *= 0.9;
  if (st(from, "중독") > 0) m *= Math.max(0.7, 1 - 0.02 * st(from, "중독"));
  return Math.max(0, Math.round((v + st(from, "힘")) * Math.max(CUT_FLOOR, m)));
}

// 성격 상성 — 유리하면 주는 피해 +10%, 받는 피해 -5%
function natureMod(s, from, to) {
  if (s.noNature || !from || !to) return 1;
  const e = R.natureEdge(natureOf(from.key), natureOf(to.key));
  if (e > 0) return 1 + R.NATURE_DMG;
  if (e < 0) return 1 - R.NATURE_DEF;
  return 1;
}
// 기획서: 취약 받는 피해 +10% · 약화 주는 피해 -10% (전에는 +50%/-25% 로 내가 정했었다)
const taken = (to, v) => Math.max(0, Math.round(st(to, "취약") > 0 ? v * (1 + R.FRAIL) : v));

function hurt(s, u, v, { from, pure } = {}) {
  if (u.invuln && !pure) { say(s, `${u.ko}에게 닿지 않는다`); return; }
  let d = pure ? v : taken(u, v);
  // 성격 상성 — 때리는 쪽이 유리하면 +10%, 맞는 쪽이 유리하면 -5%
  if (!pure && from) d = Math.round(d * natureMod(s, from, u));
  // 패시브·키워드·카드가 건 증감 — 주는 피해(때리는 쪽) × 받는 피해(맞는 쪽). 아무리 깎여도 10% 는 들어간다
  if (!pure) {
    const m = (1 + (from ? P.statMod(s, from, "dealt") : 0)) * (1 + P.statMod(s, u, "taken"));
    d = Math.max(0, Math.round(d * Math.max(0.1, m)));
  }
  if (!pure && u.block > 0) { const a = Math.min(u.block, d); u.block -= a; d -= a; }
  // 실드는 방어 다음에 깎인다. 전에는 쌓이기만 하고 한 번도 안 깎였다 — 있어도 없는 것이었다.
  if (!pure && u.shield > 0) { const a = Math.min(u.shield, d); u.shield -= a; d -= a; }
  const before = u.hp / u.maxHp;
  u.hp -= d;
  if (u.side === "party" && d > 0) speak(s, u.key, "hit");
  if (u.hp <= 0) { kill(s, u, pure); return; }
  if (u.side === "party" && d > 0 && !pure) {
    emit(s, "hurt", { who: u, from });
    emit(s, "lowHp", { who: u, before, after: u.hp / u.maxHp });
  }
  if (u.side === "enemy" && d > 0 && !pure) {
    foePassives(s, "hurt", { target: u, from });
    if (!u.dead) foePassives(s, "lowHp", { target: u, before, after: u.hp / u.maxHp });
  }
}

function kill(s, u, byPoison) {
  if (u.dead) return;
  // 엘리아스에는 죽음이 없다 — 쓰러진 사도는 주말농장에 간다(docs/03-세계관.md)
  u.hp = 0; u.dead = true;
  if (u.side === "party") speak(s, u.key, "down");
  say(s, u.side === "party" ? `${u.ko} 주말농장으로` : `${u.ko} 쓰러짐`);
  if (u.side === "party") emit(s, "allyDown", { who: u });
  else { emit(s, "kill", { by: s.acting, target: u }); foePassives(s, "allyDown", { target: u }); }
  if (u.side === "enemy") {
    if (s.lastHero) speak(s, s.lastHero, "kill");
    if (st(u, "중독") > 0 && s.party.some((p) => p.key === "mayo" && !p.dead)) {
      s.poisonKills++; say(s, "마요: 수집품이 하나 늘었음");
    }
    const tig = s.party.find((p) => p.key === "tig" && !p.dead);
    if (tig) { addSt(tig, "힘", 1); say(s, "티그 기세 (힘 +1)"); }
  }
  checkOver(s);
}

function checkOver(s) {
  if (!alive(s.enemies).length) {
    if (s.over !== "win") { const w = alive(s.party); if (w.length) speak(s, w[Math.floor(s.rng() * w.length)].key, "win"); }
    s.over = "win";
  }
  else if (!alive(s.party).length) s.over = "lose";
}

// ── 카드 ───────────────────────────────────────────────────────────────
// 이 판에서 그 카드가 실제로 무엇인가 — 신탁을 골랐으면 바뀐 쪽이다.
export const cardOf = (s, id) => (s.book && s.book[id]) || CARDS[id];

// 카드의 태그 — 개전(첫 손패에 든다) · 보존(턴이 끝나도 손에 남는다) · 소멸(내면 이 전투에서 사라진다).
// 신탁을 고른 카드는 신탁 글이 전문이다 — 머리의 태그는 기본 카드의 것이라 보지 않는다.
// (주도·종극은 기획서에 풀이가 없어 아직 아무 일도 안 한다)
export function hasTag(c, id) {
  if (!c) return false;
  if ((c.fx || []).some((f) => f.k === "tag" && f.id === id)) return true;
  return !c.flashOn && (c.tags || []).includes(id);
}

export function draw(s, n) {
  let burned = 0;
  for (let i = 0; i < n; i++) {
    if (!s.draw.length) {
      if (!s.discard.length) break;
      s.draw = shuffle(s.rng, s.discard.splice(0));
    }
    const id = s.draw.pop();
    // 손에는 열 장까지. 넘치면 그 카드는 사라진다 — 덱으로 돌려보내면
    // 손이 찬 채로 같은 카드를 무한히 다시 뽑게 된다.
    if (s.hand.length >= R.HAND_MAX) { s.gone.push(id); burned++; continue; }
    s.hand.push(id);
  }
  if (burned) say(s, `손이 가득 차 ${burned}장이 사라졌다 (최대 ${R.HAND_MAX}장)`);
}

// ── 고학년 스킬 — 덱 밖에 따로 있고, 게이지를 비용만큼 써서 AP 없이 쓴다(기획서) ──────
// 같은 사도의 고학년 스킬은 연속으로 쓸 수 없다. 전투가 끝나면 게이지는 0 이 된다.
// 기획서는 한글 이름을 키로 쓰고(에르핀·에르핀_왕도), 게임은 영문 키를 쓴다(erpin).
// HEROES 의 ko 로 이어 준다 — 사도를 늘릴 때 손으로 표를 적지 않아도 되게.
const DESIGN_KEY = {};
for (const [k, h] of Object.entries(HEROES)) if (DESIGN.heroes[h.ko]) DESIGN_KEY[k] = h.ko;

export const designOf = (heroKey) => DESIGN.heroes[DESIGN_KEY[heroKey] || heroKey] || null;

export function ultOf(heroKey) {
  // 읽어 둔 효과(fx)가 있는 쪽을 먼저 — design.js 에는 글만 있다
  const b = HERO_DATA[heroKey];
  if (b && b.ult) return b.ult;
  const h = designOf(heroKey);
  return h && h.ult ? h.ult : null;
}

export function canUlt(s, heroKey) {
  const u = s.party.find((x) => x.key === heroKey);
  if (!u || u.dead) return "나설 수 없습니다";
  const ult = ultOf(heroKey);
  if (!ult) return "고학년 스킬이 없습니다";
  if (s.lastUlt === heroKey) return "같은 사도의 고학년 스킬은 연속으로 쓸 수 없습니다";
  if (s.gauge < ult.cost) return `게이지가 모자랍니다 (${s.gauge}% / ${ult.cost}%)`;
  return null;
}

export function useUlt(s, heroKey, targetIdx = 0) {
  const why = canUlt(s, heroKey);
  if (why) return { ok: false, why };
  const ult = ultOf(heroKey);
  s.gauge -= ult.cost;
  s.lastUlt = heroKey;
  const owner = s.party.find((x) => x.key === heroKey);
  say(s, `${owner.ko} 고학년 스킬 — ${ult.ko} (게이지 ${ult.cost}%)`);
  speak(s, heroKey, "ego");
  // 효과는 아직 산문이다(기획서 그대로). 효과 파서가 붙기 전까지는 게이지만 돈다.
  // 전에는 옛 효과 실행기(applyFx)로 돌려서 아무 일도 없었다 — 고학년 스킬은 게이지만 먹었다.
  if (ult.fx && ult.fx.length) {
    const prev = s.acting; s.acting = heroKey;
    runFx(s, ult.fx, { owner, combo: null, targetIdx }, fxApi(s));
    s.acting = prev;
  } else s.ultPending = (s.ultPending || 0) + 1;
  emit(s, "ult", { hero: heroKey });
  checkOver(s);
  return { ok: true, ult };
}

export function costOf(s, cardId) {
  const c = cardOf(s, cardId);
  if ((s.freeOnce && s.freeOnce[cardId]) || (s.freeTurn && s.freeTurn[cardId])) return 0;
  const divine = s.shin && s.shin[cardId] === "cost" ? 1 : 0;      // 기적 「비용 -1」
  return Math.max(0, c.cost - divine - s.nextCheaper);
}

// ── 신탁 ─────────────────────────────────────────────────────────────
export const glowOf = (s, cardId) => (s.glow && s.glow[cardId]) || null;
// 고른 것을 건다 — choice 는 options 의 번호. 카드 신탁은 그 카드가 바로 바뀌고 이번에는 비용 0,
// 은총은 고른 고유 카드가 손에 들어온다(그 턴 비용 0). 빛나던 카드는 그대로 낸다.
export function applyEpiphany(s, cardId, choice) {
  const g = glowOf(s, cardId);
  if (!g) return null;
  const opt = g.options[choice];
  if (opt == null) return null;
  delete s.glow[cardId];
  if (g.kind === "card") {
    s.flash[cardId] = opt.n;
    s.book[cardId] = flashed(CARDS[cardId], opt.n);
    if (opt.shin) s.shin[cardId] = opt.shin;
    s.freeOnce[cardId] = true;
    s.gained.flash.push({ cardId, n: opt.n, shin: opt.shin || null });
    const f = (CARDS[cardId].flash || [])[opt.n - 1] || {};
    say(s, `신탁! 「${CARDS[cardId].name}」 → ${f.kind || ""} ${f.ko || ""}${opt.shin ? " · 기적" : ""}`);
  } else {
    if (s.hand.length < R.HAND_MAX) s.hand.push(opt); else s.discard.push(opt);
    s.freeTurn[opt] = true;
    s.gained.cards.push(opt);
    say(s, `은총! ${HERO(g.hero).ko} — 「${CARDS[opt].name}」`);
  }
  return g.kind;
}

// 낼 수 있는가 — 낼 수 없으면 왜인지 돌려준다(화면이 그대로 보여 준다)
export function canPlay(s, cardId) {
  const c = cardOf(s, cardId);
  if (costOf(s, cardId) > s.ap) return "AP가 모자랍니다";
  const owner = c.hero ? s.party.find((u) => u.key === c.hero) : null;
  if (c.hero && (!owner || owner.dead)) return `${이가(HERO(c.hero).ko)} 나설 수 없습니다`;
  if (c.need && c.need.row && owner && owner.row !== c.need.row)
    return `${이가(owner.ko)} ${c.need.row === "front" ? "앞" : c.need.row === "mid" ? "가운데" : "뒤"}줄에 있어야 합니다`;
  return null;
}

// 살아 있는 아군 중 그 스탯이 가장 높은 사람 — 중립 카드의 기준
function bestAlly(s, stat) {
  const up = s.party.filter((u) => !u.dead);
  return up.length ? up.reduce((a, b) => ((b[stat] || 0) > (a[stat] || 0) ? b : a)) : null;
}

// opts.discard — 이 카드의 「손패 N장 버리」에 버릴 카드 id(낸 사람이 고른 것 · ui.js). 없으면 손 끝에서부터(모의전 · 미리보기)
export function playCard(s, handIdx, targetIdx, opts = {}) {
  if (s.over) return { ok: false, why: "전투가 끝났습니다" };
  const cardId = s.hand[handIdx];
  if (!cardId) return { ok: false, why: "그런 카드가 없습니다" };
  const why = canPlay(s, cardId);
  if (why) return { ok: false, why };

  const c = cardOf(s, cardId);
  // 중립 카드는 주인이 없다 — 기획서: 따로 적지 않으면 **공격력·방어력이 가장 높은 아군 기준**
  const owner = c.hero ? s.party.find((u) => u.key === c.hero) : c.neutral ? bestAlly(s, "atk") : null;

  // X 코스트는 남은 AP 를 전부 쓴다. 그 수가 곧 X 다.
  const paid = c.xcost ? s.ap : costOf(s, cardId);
  s.ap -= paid;
  // 고학년 게이지 — 카드에 쓴 AP 1당 +10%. 0코 카드는 충전하지 않는다.
  if (paid > 0) {
    s.gauge = Math.min(R.GAUGE_MAX, s.gauge + paid * R.GAUGE_PER_AP);
  }
  s.nextCheaper = 0;
  if (s.freeOnce) delete s.freeOnce[cardId];
  s.hand.splice(handIdx, 1);
  s.discardPick = Array.isArray(opts.discard) ? opts.discard.slice() : null;

  // 기적 — true(이벤트의 옛 값) · "power" 는 피해 ×1.3
  const sh = s.shin && s.shin[cardId];
  // opts.ally — 적과 아군을 둘 다 고르는 카드(「적 1명 …, 아군 1명 …」)의 아군 쪽. 화면이 한 번 더 묻는다
  const ctx = { owner, combo: null, targetIdx, allyIdx: opts.ally, x: c.xcost ? paid : 0, defOwner: c.neutral ? bestAlly(s, "def") : null, shin: sh === true || sh === "power" };
  s.acting = c.hero || null;
  try {
    if (c.built) {
      // 기획서에서 읽은 카드 — 효과 조각을 run-fx 가 실행한다(스탯 기반 %)
      runFx(s, c.fx, ctx, fxApi(s));
    } else {
      for (const f of c.fx) applyFx(s, c, f, ctx);
    }
  } finally { s.discardPick = null; }       // 고른 버릴 카드는 이 카드의 효과에서만 쓴다
  // 티그의 오버드라이브 — 평타 계수를 바꾸고 공속을 올린다(원작). 여기선 한 번 더 들어간다.
  if (s.overdrive && c.hero === "tig" && c.type === "공격") {
    say(s, "오버드라이브 — 한 번 더");
    if (c.built) runFx(s, c.fx.filter((f) => f.k === "dmg"), ctx, fxApi(s));
    else for (const f of c.fx) if (f.k === "damage" || f.k === "aoe") applyFx(s, c, f, ctx);
  }

  // 에르핀의 강화 평타 — 원작에서 '강화 평타 부가 효과로 SP를 수급하는 사도'다.
  // 카드마다 SP 를 붙였더니 자가 기준의 3~5배로 튀어서(실제로 그랬다) 사도 성질로 옮겼다.
  // 한 턴에 두 번까지만 — 안 막으면 무한 기력이 된다.
  if (c.type === "공격" && c.hero === "erpin") {
    s.erpinChain = (s.lastHero === "erpin" ? (s.erpinChain || 0) + 1 : 0);
    if ((s.erpinSp || 0) < 2) { s.erpinSp = (s.erpinSp || 0) + 1; s.ap += 1; say(s, "에르핀: 강화 평타 (AP +1)"); }
  } else if (c.hero !== "erpin") s.erpinChain = 0;

  // 에르핀의 간식 — 먹으면 힘이 난다
  if (c.snack) {
    const erpin = s.party.find((u) => u.key === "erpin" && !u.dead);
    if (erpin) { addSt(erpin, "힘", 1); say(s, "에르핀: 잘 먹었다 (힘 +1)"); }
    const coffer = tr(s, "snacksp");          // 신탁 '곳간'
    if (coffer) { s.ap += coffer; say(s, `곳간 — AP +${coffer}`); }
  }

  if (c.temp || hasTag(c, "소멸")) s.gone.push(cardId); else s.discard.push(cardId);
  if (sh === "draw") draw(s, 1);                 // 기적 「내면 드로우 +1」
  // 패시브 — 「카드를 낼 때마다」「한 턴에 N장째」
  s.playedThisTurn = (s.playedThisTurn || 0) + 1;
  const tgt = s.enemies.find((e) => e.idx === targetIdx && !e.dead) || null;
  emit(s, "play", { hero: c.hero, type: c.type, nth: s.playedThisTurn, target: tgt, cost: c.xcost ? paid : c.cost });
  s.acting = null;
  if (c.ego && c.hero) speak(s, c.hero, "ego");
  if (c.hero === "ner") s.nerWorked = true;
  if (c.hero) s.lastHero = c.hero;
  checkOver(s);
  // 적 패시브 「카드를 낼 때마다」, 그다음 즉시 행동 — 이 카드로 수의 장수를 채웠으면 적이 예고한 수를 당겨서 한다
  if (!s.over) { foePassives(s, "card", { type: c.type, nth: s.playedThisTurn }); checkOver(s); }
  if (!s.over) { rushEnemies(s); checkOver(s); }
  return { ok: true };
}

// 이 카드를 내면 버릴 카드를 골라야 하나 — 고를 장수(「무작위」 · 「전부」 · 남은 손패가 모자라면 0)
export function discardChoice(s, handIdx) {
  const id = s.hand[handIdx];
  const c = id && cardOf(s, id);
  if (!c) return 0;
  const f = (c.fx || []).find((x) => x.k === "discard" && !x.random && x.v !== "all");
  if (!f) return 0;
  const rest = s.hand.length - 1;
  return rest > f.v ? f.v : 0;               // 남은 손패가 그 장수 이하면 고를 것 없이 전부 버린다
}

// ── 미리보기 ───────────────────────────────────────────────────────────
// 카드를 고르면 적마다 얼마나 들어가는지 보여 준다.
// 계산식을 따로 베끼면 언젠가 실제와 어긋나니, 판을 통째로 복사해 거기서 실제로 내 본다 —
// 취약·상성·방어·실드·X 코스트·키워드 스택이 전부 그대로 들어간다.
// 치명타는 빼고, 무작위 대상은 그 적에게 전부 몰렸을 때(최대)로 센다.
// 돌려주는 것: 적 idx 마다 { hp: 깎일 체력, guard: 깎일 방어·실드, kill, max } 또는 null
export function previewCard(s, handIdx, targetIdx) {
  const id = s.hand[handIdx];
  if (!id || s.over || canPlay(s, id)) return null;
  const c = cardOf(s, id);
  const random = (c.fx || []).some((f) => f.k === "dmg" && f.target === "randomEnemy");
  const once = (pickIdx) => {
    const { rng, ...rest } = s;
    const sh = structuredClone(rest);
    sh.rng = makeRng(1);
    sh.preview = true;
    sh.previewPick = pickIdx;
    playCard(sh, handIdx, targetIdx);
    return sh.enemies;
  };
  let runs;
  try {
    runs = random ? alive(s.enemies).map((e) => [e.idx, once(e.idx)]) : [[null, once(null)]];
  } catch (err) { return null; }
  return s.enemies.map((e) => {
    if (e.dead) return null;
    const after = (random ? runs.find(([i]) => i === e.idx) : runs[0])[1][e.idx];
    const hp = e.hp - Math.max(0, after.hp);
    const guard = Math.max(0, (e.block || 0) - (after.block || 0) + (e.shield || 0) - (after.shield || 0));
    if (hp <= 0 && guard <= 0 && !after.dead) return null;
    return { hp, guard, kill: !!after.dead, max: random };
  });
}


// 아군 미리보기 — 이 카드를 내면 아군마다 회복 · 방어 · 실드가 얼마나 붙고 체력이 얼마나 빠지나(자해 · 대가).
// 적 미리보기와 같이 판을 복사해 실제로 내 본다 — 시전자 능력치 · 역할 보정 · 패시브가 전부 그대로 들어간다.
// 돌려주는 것: 아군 idx 마다 { heal, block, shield, lose } 또는 null
export function previewAllies(s, handIdx, targetIdx) {
  const id = s.hand[handIdx];
  if (!id || s.over || canPlay(s, id)) return null;
  let after;
  try {
    const { rng, ...rest } = s;
    const sh = structuredClone(rest);
    sh.rng = makeRng(1);
    sh.preview = true;
    playCard(sh, handIdx, targetIdx);
    after = sh.party;
  } catch (err) { return null; }
  return s.party.map((u, i) => {
    const a = after[i];
    if (!a || u.dead) return null;
    const heal = Math.max(0, a.hp - u.hp);
    const lose = Math.max(0, u.hp - a.hp);
    const block = Math.max(0, (a.block || 0) - (u.block || 0));
    const shield = Math.max(0, (a.shield || 0) - (u.shield || 0));
    if (!heal && !lose && !block && !shield) return null;
    return { heal, block, shield, lose };
  });
}

const boost = (v, combo, owner, s) => {
  let out = v;
  if (owner) out = dealt(owner, out);
  // 사도별 보정 (강화 평타)
  if (owner && owner.key === "erpin" && s.erpinChain > 0) out += 4;
  if (owner) {
    if (owner.row === "back") out += s.rearBuff;                 // 에르핀 '뒷줄에 호령'
  }
  out += s.partyDmg;                                             // 네르 '사제장의 축복'
  if (s.crit) out *= 1 + s.crit / 100;                           // 네르 '치명의 기도'
  out += tr(s, "attack");                                        // 신탁 '날 선 손끝'
  if (s.ap <= 2) out += tr(s, "brink");                           // 신탁 '막판 힘'

  // 아멜리아의 집착 — 엘레나가 옆에 있으면 더 쏜다
  if (owner && owner.key === "amelia" && s.party.some((u) => u.key === "elena" && !u.dead)) out += 3;
  return Math.round(out);
};

function applyFx(s, c, f, ctx) {
  const { owner, combo, targetIdx } = ctx;
  const foes = alive(s.enemies);
  const reachable = c.pierce ? foes : (foes.filter((e) => e.row === "front").length ? foes.filter((e) => e.row === "front") : foes);
  const one = () => reachable.find((e) => e.idx === targetIdx) || reachable[0];
  const ally = () => alive(s.party)[targetIdx] || s.party.find((u) => u.idx === targetIdx && !u.dead) || owner || alive(s.party)[0];

  switch (f.k) {
    case "damage": { const t = one(); if (t) hurt(s, t, boost(f.v, combo, owner, s), { from: owner }); break; }
    case "aoe": { const d = boost(f.v, combo, owner, s); for (const t of reachable.slice()) hurt(s, t, d, { from: owner }); break; }
    case "block": if (owner) owner.block += Math.round(f.v) + tr(s, "block"); break;
    case "blockAlly": { const t = ally(); if (t) { t.block += f.v; speak(s, t.key, "heal"); } break; }
    case "blockAll": for (const u of alive(s.party)) u.block += f.v; break;
    case "heal": if (owner) owner.hp = Math.min(owner.maxHp, owner.hp + f.v); break;
    case "healAlly": { const t = ally(); if (t) { t.hp = Math.min(t.maxHp, t.hp + f.v); speak(s, t.key, "heal"); } break; }
    case "selfHurt": if (owner) { owner.hp -= f.v; if (owner.hp <= 0) kill(s, owner); } break;
    case "draw": draw(s, f.v); break;
    case "sp": s.ap += f.v; say(s, `AP +${f.v}`); break;
    case "nextCheaper": s.nextCheaper += f.v; break;
    case "taunt": s.taunt = "tig"; break;
    case "cleanse": if (owner) { const bad = BAD.find((b) => st(owner, b) > 0); if (bad) delete owner.status[bad]; } break;
    case "addCard": for (let i = 0; i < f.v; i++) if (s.hand.length < 10) s.hand.push(f.id); break;
    case "foresee": { const t = one(); if (t) { rollIntent(s, t, true); say(s, `${t.ko}의 수가 흐트러졌다`); } break; }
    case "poisonBurst": { const t = one(); if (t) hurt(s, t, boost(st(t, "중독") * 2, combo, owner, s), { from: owner }); break; }

    // 에르핀 — 고학년을 쓰는 동안 무적
    case "invuln": if (owner) { owner.invuln = true; say(s, `${owner.ko}: 이번 턴은 안 맞는다`); } break;
    // 에르핀 리더 — 후열 아군 강화
    case "rearBuff": s.rearBuff = Math.min(6, s.rearBuff + f.v); say(s, `뒷줄 아군의 공격 +${f.v}`); break;
    // 네르 — 하나뿐인 딜링 버프 서포터
    case "partyDmg": s.partyDmg = Math.min(8, s.partyDmg + f.v); say(s, `아군 전체의 공격 +${f.v}`); break;
    case "crit": s.crit = Math.min(50, s.crit + f.v); say(s, `아군 피해 +${f.v}%`); break;
    // 티그 — 오버드라이브
    case "overdrive": s.overdrive = true; say(s, "티그: 오버드라이브"); break;

    // 프리클 — 가시 촉수
    case "tentacle": s.tentacles += f.v; say(s, `가시 촉수 ${s.tentacles}개`); break;
    case "tentacleBurst": {
      if (!s.tentacles) { say(s, "터뜨릴 촉수가 없다"); break; }
      const d = boost(f.v * s.tentacles, combo, owner, s);
      say(s, `촉수 ${s.tentacles}개가 소멸하며 터진다`);
      s.tentacles = 0;
      for (const t of reachable.slice()) hurt(s, t, d, { from: owner });
      break;
    }

    // 엘레나 — 감전을 터뜨린다
    case "shockBurst": {
      for (const t of reachable.slice()) {
        const sh = st(t, "감전");
        if (sh > 0) hurt(s, t, boost(sh * f.v, combo, owner, s), { from: owner });
      }
      break;
    }
    // 아멜리아 — 감전된 적을 기절시킨다 (원작 고학년)
    case "shockStun": {
      let n = 0;
      for (const t of reachable) if (st(t, "감전") > 0) { t.sealed = true; n++; }
      say(s, n ? `감전된 적 ${n}이(가) 기절했다` : "감전된 적이 없다");
      break;
    }
    // 에슈르 — 광역 기절
    case "stunAll": for (const t of reachable) t.sealed = true; say(s, "전부 멈춰 섰다"); break;
    // 마요 — 공격력이 가장 높은 대상 우선 (원작 저학년)
    case "poisonTop": {
      const live = alive(s.enemies);
      if (!live.length) break;
      const t = live.slice().sort((a, b) => (b.intent?.v || 0) - (a.intent?.v || 0))[0];
      addSt(t, "중독", f.v + s.poisonKills + tr(s, "poison"));
      say(s, `${t.ko}에게 값을 매겼다`);
      break;
    }



    // 아멜리아 — 입 모양만 보고 말을 읽는다
    case "foreseeAll": for (const t of alive(s.enemies)) rollIntent(s, t, true); say(s, "적의 수를 전부 다시 읽었다"); break;

    // 에슈르 — 낼 때마다 오르는 월세
    case "rentDue": {
      const t = one();
      s.rent = (s.rent || 0);
      if (t) hurt(s, t, boost(f.v + s.rent, combo, owner, s), { from: owner });
      s.rent += 3;
      break;
    }


    // 티그 — 눈앞의 것도 다 거짓이 아니냐
    case "purge": {
      const t = one();
      if (t) { for (const k of ["힘", "가시"]) if (st(t, k) > 0) delete t.status[k]; t.block = 0; say(s, `${t.ko}이(가) 쌓아 둔 것이 지워졌다`); }
      break;
    }

    // 프리클 — 계획을 짜 함정으로 몰아 봉인시킨다
    case "seal": { const t = one(); if (t) { t.sealed = true; say(s, `${t.ko}을(를) 봉인했다`); } break; }


    case "healAll": for (const u of alive(s.party)) u.hp = Math.min(u.maxHp, u.hp + f.v); break;
    case "status": {
      let v = f.v
        + (f.id === "중독" ? s.poisonKills + tr(s, "poison") : 0);   // 신탁 '독한 마음'
      // 아멜리아가 있으면 엘레나의 감전이 한 턴 더 간다 (원작: 4초 → 8초)
      if (f.id === "감전" && s.party.some((u) => u.key === "amelia" && !u.dead)) v += 1;
      if (f.who === "self") { if (owner) addSt(owner, f.id, f.v); }
      else if (c.target === "전체") for (const t of reachable) addSt(t, f.id, v);
      else { const t = one(); if (t) addSt(t, f.id, v); }
      break;
    }
    default: say(s, `(알 수 없는 효과: ${f.k})`);
  }
}

// run-fx 가 쓰는 손잡이 — 엔진 속을 그쪽에 통째로 넘기지 않으려고 좁게 연다
function fxApi(s) {
  return {
    hurt: (t, v, o) => hurt(s, t, v, o),
    draw: (n) => draw(s, n),
    // 상태 — 「취약 2턴」 은 2턴 간다(전에는 몇 턴이든 1턴이었다).
    // 기절은 적의 다음 수를 막고, 도발은 적이 그 사도만 치게 하고, 침묵은 적의 공격 아닌 수를 막는다.
    // 전에는 기획서 카드에서 건 기절·도발·침묵이 아무 일도 안 했다.
    addStatus: (t, id, v, turns) => {
      const n = Math.max(1, turns || v || 1);
      if (id === "기절") {
        // 보스는 기절한 다음 한 턴은 버틴다 — 안 막으면 기절 카드를 가진 사도가 보스를 내내 묶었다
        // (마카샤 혼자 완주율 97%, 평균 21%). 보스는 적어도 두 턴에 한 번은 움직인다.
        if (t.side === "enemy" && t.boss && (t.sealed || (t.stunGuard || 0) > 0)) say(s, `${t.ko}: 기절을 버텨 냈다`);
        else if (t.side === "enemy") { t.sealed = true; if (t.boss) t.stunGuard = 2; say(s, `${t.ko}: 기절`); }
      } else if (id === "도발") {
        if (t.side === "party") { s.taunt = t.key; s.tauntLeft = n; say(s, `${t.ko}: 도발 — 적이 이쪽을 본다`); }
      } else addSt(t, id, n);
      if (t.side === "enemy" && v > 0) { emit(s, "debuff", { by: s.acting, target: t, id }); foePassives(s, "debuffed", { target: t }); }
    },
    statOf: (u, stat) => P.statMod(s, u, stat),
    addMod: (t, stat, v, turns) => {
      P.addMod(t, stat, v, turns);
      if (t.side === "enemy" && ((stat === "taken" && v > 0) || (stat === "dealt" && v < 0))) { emit(s, "debuff", { by: s.acting, target: t, id: stat }); foePassives(s, "debuffed", { target: t }); }
    },
    stackChanged: (owner, id, before, after, holder) => emit(s, "stackReach", { id, before, after, owner, target: holder }),
    cleanse: (t, n) => { for (let i = 0; i < (n || 1); i++) { const bad = BAD.find((b) => st(t, b) > 0); if (bad) delete t.status[bad]; } },
    trigger: () => {},          // 사도 전용 발동(재채기 등) — 아직 몸이 없다
    // 버리기 — 낸 사람이 고른 카드(s.discardPick)부터. 「무작위」면 무작위로, 고른 것이 없으면(모의전 · 미리보기) 손 끝에서부터
    discard: (n, random) => {
      const many = n === "all" ? s.hand.length : Math.min(n, s.hand.length);
      const pick = !random && Array.isArray(s.discardPick) ? s.discardPick : null;
      for (let i = 0; i < many && s.hand.length; i++) {
        let at = -1;
        if (pick && pick.length) at = s.hand.indexOf(pick.shift());
        if (at < 0) at = random ? Math.floor(s.rng() * s.hand.length) : s.hand.length - 1;
        const [id] = s.hand.splice(at, 1);
        if (id) s.discard.push(id);
      }
    },
  };
}

// 적을 고를 때 run-fx 가 쓰는 것 — 관통이면 뒷줄까지
function reachableFor(s, pierce) {
  const foes = alive(s.enemies);
  if (pierce) return foes;
  const front = foes.filter((e) => e.row === "front");
  return front.length ? front : foes;
}

// ── 덱 만들기 ──────────────────────────────────────────────────────────
// 기획서: "덱은 사도 3명의 카드를 합친 것이다" — 사도당 시작 카드 넉 장, 모두 열두 장.
// 교주 카드(지시·비호·호령)는 넣지 않는다. 세계관 규칙에도
// "교주는 카드를 내는 사람이지 싸우는 사람이 아니다" 라고 적혀 있다(docs/03-세계관.md).
export function buildDeck(partyKeys) {
  const deck = [];
  for (const k of partyKeys) {
    // 기획서에 있으면 기획서의 시작 카드 4장, 없으면 옛 시작덱
    const built = starterOf(k);
    if (built) deck.push(...built);
    else if (STARTER[k]) deck.push(...STARTER[k]);
  }
  if (partyKeys.includes("ashur") && !starterOf("ashur")) deck.push("bread", "bread");
  return deck;
}
