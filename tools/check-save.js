// 판 이어하기(js/save.js)가 판을 그대로 되살리는지 본다 — 새로고침으로 굴림을 다시 굴릴 수 없어야 한다.
//
//   node tools/check-save.js
//
//   - 난수: rng.state 를 옮기면 다음 수가 같다
//   - 화면 없이 판을 끝까지 몬다(지도 → 싸움 · 이벤트 · 캠프 · 상점, main.js 의 흐름 그대로). 여러 자리에서
//     적기 → JSON 글 → 읽기 로 새 판을 만들고, 원래 판과 되살린 판을 같은 손으로 이어 가며 매 수 같은지 본다
//     (싸움 중 카드 몇 장 뒤 · 고르던 신탁 · 이벤트 선택지가 떠 있을 때 · 고른 뒤 · 싸움이 끝난 뒤 · 상점 · 캠프)
//   - 적을 수 없는 것(함수 · 정규식 · 무한대 따위)이 판에 섞이지 않는가 — 사도 135명 · 장비 전부의 패시브까지
//   - 깨진 저장 · 옛 판 · 모르는 카드는 버린다 · 저장소가 막혀도 터지지 않는다
import * as R from "../js/run.js";
import * as C from "../js/combat.js";
import * as EV from "../js/events.js";
import * as M from "../js/map.js";
import * as S from "../js/save.js";
import { HERO_DATA, CARDS, EQUIP } from "../js/cardbook.js";
import { ENEMIES, FLOORS } from "../js/data/enemies.js";
import * as RULES from "../js/rules.js";

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const fail = (m) => { console.log("  실패 " + m); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));

// 키 차례와 상관없이 같은 글 — 두 판을 견줄 때 쓴다
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));

// 적을 수 없는 것 — 함수(난수 rng 만 빼고) · 정규식 · Map · Set · 무한대 · NaN · 배열 속 undefined · 클래스 객체
function unsafe(x, path = "", out = [], seen = new Set()) {
  if (typeof x === "function") { if (!/\.rng$/.test(path)) out.push(`${path} 함수`); return out; }
  if (typeof x === "number" && !Number.isFinite(x)) { out.push(`${path} = ${x}`); return out; }
  if (!x || typeof x !== "object" || seen.has(x)) return out;
  seen.add(x);
  const proto = Object.getPrototypeOf(x);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) { out.push(`${path} ${proto && proto.constructor && proto.constructor.name}`); return out; }
  if (Array.isArray(x)) x.forEach((v, i) => { if (v === undefined) out.push(`${path}[${i}] undefined`); unsafe(v, `${path}[${i}]`, out, seen); });
  else for (const k of Object.keys(x)) unsafe(x[k], `${path}.${k}`, out, seen);
  return out;
}

// ── 난수 ───────────────────────────────────────────────────────────────
console.log("난수 — 상태를 옮기면 다음 수가 같다");
{
  const a = C.makeRng(12345);
  for (let i = 0; i < 37; i++) a();
  const b = C.makeRng(1);
  b.state = a.state;
  const xs = Array.from({ length: 200 }, () => a()), ys = Array.from({ length: 200 }, () => b());
  check(xs.every((v, i) => v === ys[i]), "rng.state 를 옮긴 난수가 200번 같은 수를 낸다");
  check(typeof a.state === "number" && a.state >= 0 && a.state <= 0xffffffff, `상태는 32비트 수 하나 (${a.state})`);
  const c = C.makeRng(0);
  check(c() > 0 && c.state !== 0, "씨앗 0 도 굴러간다(0 은 1 로)");
}

// ── 화면 없이 한 판 ─────────────────────────────────────────────────────
// main.js 의 흐름을 그대로 따라 한 수씩 둔다. 손은 판 상태만 보고 정한다 — 같은 판이면 같은 수를 둔다.
// 이 손은 생각 없이 낸다 — 층마다 세기(rules.js foeScale) 그대로면 1층에서 지고 이벤트 · 신탁 자리를 못 본다.
// 적을 무르게(체력 · 피해에 더 곱하는 run-sim --hp · --dmg 와 같은 자리) 해서 판을 멀리 몬다. 되살린 판도 같은 값으로 연다
const SOFT = { hpx: 0.6, dmgx: 0.5 };
function openFight(g) {
  g.run.where = { k: "fight" };
  g.st = R.openFight(g.run, SOFT).st;
}
function finishFight(g) {
  const run = g.run, st = g.st;
  R.afterFight(run, st);
  const loot = run.eventFight ? null : run.reward;
  if (st.over === "win" && loot) {
    if (loot.equip && loot.equip.length && !loot.equipTaken) R.takeEquip(run, loot.equip[0]);
    R.takeReward(run, null);
  }
  run.where = { k: "fightDone", result: st.over };
  g.st = null;
}
function resolvePending(run) {
  const E = run.event, p = E.pending[0];
  const alive = run.party.filter((k) => (run.hp[k] || 0) > 0);
  const cands = {
    remove: run.deck.slice(0, 3), dupe: run.deck.filter(EV.dupeOk).slice(0, 3),
    shinPick: [EV.shinAble(run, p.kind)[0] ?? null], shinKind: [(p.options || [])[0]],
    card: [(p.cards || [])[0]], flash: [((p.offer || {}).picks || [])[0]],
    pickHero: alive, judgePick: alive, gambleChoice: [(p.options || [])[0]],
  }[p.k] || [null];
  for (const v of cands) if (!EV.resolve(run, v)) return;
  E.pending.shift();            // 고를 수 있는 것이 없다 — 화면의 「받지 않습니다」 와 같다
}
const shopHere = (run) => run.shop && run.shop.floor === run.floor && run.shop.at === (run.map && run.map.at);

// 한 수 — 무엇을 했는지 이름을 돌려준다. 판이 끝났으면 null
function step(g) {
  const run = g.run, w = run.where;
  if (g.end || run.done) return null;
  if (w.k === "map") {
    const reach = M.reachable(run);
    const node = M.enterNode(run, reach[(run.step || 0) % reach.length]);
    if (["fight", "elite", "boss"].includes(node.type)) { openFight(g); return "지도→싸움"; }
    if (node.type === "event") {
      if (!EV.eventLeft(run)) return "지도→빈 이벤트";
      EV.enterEvent(run); run.where = { k: "event" }; return "지도→이벤트";
    }
    if (node.type === "camp" || node.type === "campshop") { R.enterCamp(run, node.type); run.where = { k: "camp", kind: node.type }; return "지도→캠프"; }
    return "지도";
  }
  if (w.k === "fight") {
    const st = g.st;
    if (st.turn > 50 && !st.over) st.over = "lose";        // 끝나지 않는 싸움은 진 것으로
    if (st.over) { finishFight(g); return "싸움 끝"; }
    // 고르던 신탁 — 화면은 이 자리를 st.pendingEpi 로 적는다. 셋 중 마지막 것을 고른다
    if (st.pendingEpi) {
      const p = st.pendingEpi; delete st.pendingEpi;
      const gl = C.glowOf(st, p.cardId);
      C.applyEpiphany(st, p.cardId, gl.options.length - 1);
      return "신탁 고름";
    }
    const ult = st.party.find((u) => !u.dead && C.canUlt(st, u.key) === null);
    if (ult) { C.useUlt(st, ult.key, 0); return "고학년 스킬"; }
    const idx = st.hand.findIndex((id) => !C.canPlay(st, id));
    if (idx < 0 || (st.playedThisTurn || 0) >= 6) { C.endTurn(st); return "턴 넘김"; }
    const id = st.hand[idx], gl = C.glowOf(st, id);
    if (gl && gl.kind === "card") { st.pendingEpi = { cardId: id, targetIdx: 0 }; return "신탁 창"; }
    if (gl) C.applyEpiphany(st, id, 0);                    // 은총 — 고르지 않고 곧장
    const foes = C.alive(st.enemies);
    const target = foes.length ? foes[st.turn % foes.length].idx : 0;
    const at = st.hand.indexOf(id);
    const need = C.discardChoice(st, at);
    const opts = need ? { discard: st.hand.filter((_, i) => i !== at).slice(0, need) } : {};
    const r = C.playCard(st, at, target, opts);
    if (!r.ok) { C.endTurn(st); return "턴 넘김"; }
    return "카드";
  }
  if (w.k === "fightDone") {
    if (w.result !== "win") { run.eventFight = null; g.end = "lose"; return "짐"; }
    if (run.eventFight) { EV.afterEventFight(run, true); EV.enterEvent(run); run.where = { k: "event" }; return "이벤트 싸움 이김"; }
    run.elite = false;
    if (R.isBoss(run)) {
      const next = R.advance(run);
      if (run.done === "clear") { g.end = "clear"; return "완주"; }
      // 마지막 층의 보스 뒤 — 캠프 한 번 뒤 마지막 싸움(main.js camp("final"))
      if (next.final) { R.enterCamp(run, "final"); run.where = { k: "camp", kind: "final" }; return "마지막 캠프"; }
    }
    run.where = { k: "map" };
    return "싸움 이김";
  }
  if (w.k === "event") {
    const E = run.event;
    if (!E.id) { EV.pickEvent(run, E.choices[E.choices.length - 1]); return "이벤트 갈림길"; }
    if (E.phase === "choose") {
      const opts = EV.optionsOf(run, EV.eventById(E.id));
      let i = (run.step || 0) % opts.length;
      for (let k = 0; k < opts.length && EV.lockOf(run, opts[i]); k++) i = (i + 1) % opts.length;
      const r = EV.choose(run, i);
      if (r.fight) { openFight(g); return "이벤트→싸움"; }
      return "이벤트 고름";
    }
    if (E.pending.length) { resolvePending(run); return "이벤트 받음"; }
    EV.leaveEvent(run); run.where = { k: "map" };
    return "이벤트 떠남";
  }
  if (w.k === "camp") {
    const stop = run.stops[run.camp && run.camp.key];
    if (stop && !stop.used) {
      if (run.camp.train && (run.step || 0) % 2) R.campTrain(run, { cardId: run.camp.train.cardId, n: run.camp.train.picks[0] });
      else R.campRest(run);
      return "캠프 고름";
    }
    // 가방의 장비를 빈 칸에 낀다
    for (const id of run.bag) for (const k of run.party) if (!R.equip(run, k, id)) return "장비 낌";
    if (w.kind === "campshop" && !shopHere(run)) { R.rollShop(run); run.shop.at = run.map.at; run.where = { k: "shop", kind: w.kind }; return "캠프→상점"; }
    if (w.kind === "final") { openFight(g); return "마지막 싸움"; }
    run.where = { k: "map" };
    return "캠프 떠남";
  }
  if (w.k === "shop") {
    const i = run.shop.items.findIndex((it) => !it.sold && it.price <= run.gold);
    if (i >= 0) { R.buy(run, i); return "상점 삼"; }
    if (!run.shop.removeUsed && run.gold >= R.removePrice(run) && run.deck.length > 8) { R.removeCard(run, run.deck[0]); return "상점 뺌"; }
    if (!run.shop.rerolls && run.gold >= R.rerollPrice(run)) { R.rerollShop(run); return "상점 새로고침"; }
    run.where = { k: "camp", kind: w.kind };
    return "상점 떠남";
  }
  throw new Error(`모르는 자리 ${w.k}`);
}

// 적기 → JSON 글 → 읽기. 브라우저가 하는 것과 같은 길
const saveText = (g) => JSON.stringify(S.pack(g.run, g.st));
function restore(g) {
  const got = S.unpack(JSON.parse(saveText(g)));
  if (!got) throw new Error("되살리지 못했다");
  return { run: got.run, st: got.combat, end: g.end };
}
const state = (g) => canon(S.pack(g.run, g.st));

// 지금 자리의 이름 — 어디서 되살려 봤는지 센다
function spot(g) {
  const w = g.run.where, st = g.st, E = g.run.event;
  if (w.k === "fight") {
    if (st.pendingEpi) return "고르던 신탁";
    if (st.turn > 1 && !st.playedThisTurn) return "적의 차례 뒤(턴 넘긴 뒤)";
    if ((st.playedThisTurn || 0) >= 2) return "싸움 중 — 카드 두 장 넘게 낸 뒤";
    if (st.turn === 1 && !st.playedThisTurn) return "싸움을 막 연 때(보상 · 신탁 굴린 직후)";
    return "싸움 중";
  }
  if (w.k === "fightDone") return w.result === "win" ? "이긴 뒤(전리품 챙긴 뒤)" : "진 뒤";
  if (w.k === "event") return !E.id ? "이벤트 갈림길" : E.phase === "choose" ? "이벤트 선택지가 떠 있을 때" : E.pending.length ? "이벤트 — 받을 것을 고르는 중" : "이벤트 고른 뒤";
  if (w.k === "shop") return "상점";
  if (w.k === "camp") return "캠프";
  return "지도";
}

console.log("");
console.log("한 판을 몰며 여러 자리에서 되살려 본다");
const byKo = (ko) => Object.keys(HERO_DATA).find((k) => HERO_DATA[k].ko === ko);
const keys = Object.keys(HERO_DATA);
const PARTIES = [
  ["에르핀", "네르", "티그"].map(byKo),
  ["마요", "엘레나", "아멜리아"].map(byKo),
  [keys[3], keys[47], keys[101]],
  [keys[12], keys[66], keys[130]],
].filter((p) => p.every(Boolean));
const seen = {};
let forks = 0, lockSteps = 0, bad = [], dirty = [], raws = 0, ident = 0;
const ends = [];
for (const [pi, party] of PARTIES.entries()) {
  const rows = Object.fromEntries(party.map((k) => [k, HERO_DATA[k].row]));
  const g = { run: R.newRun(party, rows, 9001 + pi * 7919), st: null, end: null };
  g.run.where = { k: "map" };
  for (let i = 0; i < 4000; i++) {
    if (g.end || g.run.done) break;
    const where = spot(g);
    // 되살려 본다 — 처음 보는 자리는 꼭, 그 밖에는 몇 수마다
    if ((seen[where] || 0) < 3 || i % 9 === 0) {
      seen[where] = (seen[where] || 0) + 1;
      forks++;
      const u = unsafe(g.run, "run").concat(g.st ? unsafe(g.st, "combat") : []);
      if (u.length) dirty.push(`${where}: ${u.slice(0, 3).join(", ")}`);
      const h = restore(g);
      // 적의 수는 같은 객체여야 한다(힘을 모은 수를 알아보는 데 쓴다)
      if (g.st) {
        for (const [k, e] of g.st.enemies.entries()) { if (e.intent !== h.st.enemies[k].intent) ident++; }
        raws += S.pack(g.run, g.st).combat.enemies.filter((e) => e.intent && e.intent.raw).length;
      }
      if (state(h) !== state(g)) bad.push(`${where}: 되살린 판이 처음부터 다르다`);
      // 난수 — 두 판의 다음 수가 같은가(복사본으로 굴려 본다)
      const peek = (rng) => { const r = C.makeRng(1); r.state = rng.state; return [r(), r(), r()].join(); };
      if (peek(g.run.rng) !== peek(h.run.rng) || (g.st && peek(g.st.rng) !== peek(h.st.rng))) bad.push(`${where}: 난수가 다르다`);
      // 같은 손으로 이어 간다 — 매 수 같은 판이어야 한다
      for (let j = 0; j < 14; j++) {
        const a = step(g), b = step(h);
        lockSteps++;
        if (a !== b) { bad.push(`${where} +${j}: 둔 수가 다르다 (${a} / ${b})`); break; }
        if (state(g) !== state(h)) { bad.push(`${where} +${j}: ${a} 뒤 판이 다르다`); break; }
        if (!a) break;
      }
      continue;
    }
    if (!step(g)) break;
  }
  ends.push(`${party.map((k) => HERO_DATA[k].ko).join("·")} ${g.end || g.run.done || "끝까지 못 감"} (${g.run.floor + 1}층)`);
}
console.log(`  판 ${PARTIES.length}개 — ${ends.join(" / ")}`);
check(!bad.length, bad.length ? `되살린 판이 갈라진다 ${bad.length}: ${bad.slice(0, 4).join(" · ")}` : `${forks}자리에서 되살려 ${lockSteps}수를 같이 두었다 — 매 수 같은 판`);
check(!dirty.length, dirty.length ? `적을 수 없는 것: ${dirty.slice(0, 3).join(" · ")}` : "판 · 싸움에 적을 수 없는 것이 없다");
check(!ident, ident ? `되살린 적의 수가 다른 객체 ${ident}` : "되살린 적의 수는 적 데이터의 그 객체다");
check(!raws, raws ? `적 데이터 밖의 수 ${raws}` : "적의 수는 모두 적 데이터 안의 길로 적힌다");
for (const need of ["싸움을 막 연 때(보상 · 신탁 굴린 직후)", "싸움 중 — 카드 두 장 넘게 낸 뒤", "적의 차례 뒤(턴 넘긴 뒤)", "고르던 신탁",
  "이벤트 선택지가 떠 있을 때", "이벤트 고른 뒤", "이긴 뒤(전리품 챙긴 뒤)", "상점", "캠프", "지도"]) {
  check((seen[need] || 0) > 0, `${need} — ${seen[need] || 0}번 되살렸다`);
}
console.log(`  (그 밖: ${Object.entries(seen).filter(([k]) => !/막 연|두 장|턴 넘긴|고르던|선택지가|고른 뒤|이긴 뒤|^상점$|^캠프$|^지도$/.test(k)).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"})`);

// ── 사도 · 장비마다 — 패시브를 읽은 것도 적을 수 있는가 ───────────────────
console.log("");
console.log("사도 135명 · 장비의 패시브가 적히는가");
{
  const foes = FLOORS[0].fights[0];
  const badHero = [];
  for (const k of keys) {
    const st = C.newCombat({ partyKeys: [k], deck: C.buildDeck([k]), enemyIds: foes, seed: 3 });
    const u = unsafe(st, "combat");
    if (u.length) { badHero.push(`${HERO_DATA[k].ko}: ${u[0]}`); continue; }
    const back = S.unpackCombat(S.packCombat(st));
    if (canon(S.packCombat(back)) !== canon(S.packCombat(st))) badHero.push(`${HERO_DATA[k].ko}: 되살리면 다르다`);
  }
  check(!badHero.length, badHero.length ? `${badHero.length}명: ${badHero.slice(0, 3).join(" · ")}` : `사도 ${keys.length}명 모두`);
  const badGear = [];
  const k0 = byKo("에르핀") || keys[0];
  for (const id of Object.keys(EQUIP)) {
    const run = R.newRun([k0], { [k0]: HERO_DATA[k0].row }, 5);
    run.gear[k0] = { [EQUIP[id].slot]: id };
    const st = C.newCombat({ partyKeys: [k0], deck: C.buildDeck([k0]), enemyIds: foes, seed: 3, gearFx: R.gearPassives(run), gear: R.gearStats(run) });
    const u = unsafe(st, "combat");
    if (u.length) badGear.push(`${EQUIP[id].ko}: ${u[0]}`);
  }
  check(!badGear.length, badGear.length ? `${badGear.length}점: ${badGear.slice(0, 3).join(" · ")}` : `장비 ${Object.keys(EQUIP).length}점 모두`);
}

// ── 주말농장 · 층마다 세기 — 되살려도 그대로 ─────────────────────────────
// 쓰러진 사도는 쓰러진 채로 싸움에 들고 카드가 빠진다 · 캠프에서 쉬면 30% · 보스를 이기면 20% 로 돌아온다 · 이벤트 엘리트도 체력 ×1.5
console.log("");
console.log("주말농장 · 층마다 적 세기 — 되살려도 그대로");
{
  const party = PARTIES[0];
  const rows = Object.fromEntries(party.map((k) => [k, HERO_DATA[k].row]));
  const run = R.newRun(party, rows, 4242);
  run.floor = 1; run.hp[party[0]] = 0;
  run.where = { k: "fight" };
  const { st } = R.openFight(run);
  const mine = (id) => (C.cardOf(st, id) || {}).hero === party[0];
  const h = S.unpack(JSON.parse(JSON.stringify(S.pack(run, st))));
  const u = h.combat.party.find((x) => x.key === party[0]);
  check(u.dead && ![...h.combat.hand, ...h.combat.draw, ...h.combat.discard].some(mine) && h.combat.gone.some(mine),
    "쓰러진 채로 연 싸움 — 되살려도 그 사도는 쓰러져 있고 카드는 빠져 있다");
  const fs = RULES.foeScale(1);
  check(h.combat.enemies.every((e) => e.dmgx === fs.dmg && e.maxHp === Math.round(ENEMIES[e.key].hp * fs.hp)),
    `되살린 적도 2층 세기 그대로 (체력 ×${fs.hp.toFixed(2)} · 피해 ×${fs.dmg})`);
  // 캠프 — 되살린 판에서 쉬어도 같은 HP 로 돌아온다
  const r2 = R.newRun(party, rows, 4243);
  r2.hp[party[1]] = 0;
  R.enterCamp(r2, "camp"); r2.where = { k: "camp", kind: "camp" };
  const h2 = S.unpack(JSON.parse(JSON.stringify(S.pack(r2)))).run;
  R.campRest(r2); R.campRest(h2);
  const want = Math.round(r2.maxHp[party[1]] * RULES.CAMP_REVIVE);
  check(r2.hp[party[1]] === want && h2.hp[party[1]] === want, `캠프에서 쉬면 주말농장에 간 사도가 ${Math.round(RULES.CAMP_REVIVE * 100)}% 로 돌아온다 — 되살린 판도 (${want})`);
  // 보스를 이기면 20%
  const r3 = R.newRun(party, rows, 4244);
  r3.node = 3; r3.hp[party[2]] = 0;
  const h3 = S.unpack(JSON.parse(JSON.stringify(S.pack({ ...r3, where: { k: "map" } })))).run;
  const a3 = R.advance(r3); R.advance(h3);
  const w3 = Math.min(r3.maxHp[party[2]], Math.round(r3.maxHp[party[2]] * RULES.BOSS_REVIVE) + 10);
  check(a3.revived.includes(party[2]) && r3.hp[party[2]] === w3 && h3.hp[party[2]] === w3, `보스를 이기면 ${Math.round(RULES.BOSS_REVIVE * 100)}% 로 돌아온다(층 사이 +10 까지 ${w3})`);
  // 이벤트가 연 엘리트 싸움 — 체력 ×ELITE_HP 가 저장에도 실린다
  const r4 = R.newRun(party, rows, 4245);
  r4.eventFight = { name: "시험", enemies: ["droneg_repair", "drones"], elite: true, win: null, winGamble: null };
  r4.where = { k: "fight" };
  const s4 = R.openFight(r4).st;
  const h4 = S.unpack(JSON.parse(JSON.stringify(S.pack(r4, s4))));
  const fe = RULES.foeScale(0, { elite: true });
  check(h4.combat.enemies.every((e) => e.maxHp === Math.round(ENEMIES[e.key].hp * fe.hp)) && h4.run.eventFight.elite,
    `이벤트 엘리트 싸움 — 체력 ×${RULES.ELITE_HP} 그대로 되살아난다 (${h4.combat.enemies.map((e) => e.maxHp).join(" · ")})`);
}

// ── 못 쓰는 저장 ───────────────────────────────────────────────────────
console.log("");
console.log("못 쓰는 저장은 버린다");
{
  const party = PARTIES[0];
  const run = R.newRun(party, Object.fromEntries(party.map((k) => [k, HERO_DATA[k].row])), 31);
  run.where = { k: "map" };
  const good = S.pack(run);
  const clone = () => JSON.parse(JSON.stringify(good));
  check(!!S.unpack(clone()), "멀쩡한 저장은 읽힌다");
  check(S.unpack({ ...clone(), v: S.SAVE_V + 1 }) === null, "판 번호(v)가 다르면 버린다");
  { const d = clone(); d.run.deck.push("없는_카드"); check(S.unpack(d) === null, "모르는 카드가 있으면 버린다"); }
  { const d = clone(); d.run.party[0] = "없는_사도"; check(S.unpack(d) === null, "모르는 사도가 있으면 버린다"); }
  { const d = clone(); d.run.bag = ["없는_장비"]; check(S.unpack(d) === null, "모르는 장비가 있으면 버린다"); }
  { const d = clone(); delete d.run.rngState; check(S.unpack(d) === null, "난수 상태가 없으면 버린다"); }
  { const d = clone(); d.run.where = { k: "fight" }; check(S.unpack(d) === null, "싸움 중이라는데 싸움이 없으면 버린다"); }
  { const d = clone(); d.run.where = { k: "어딘가" }; check(S.unpack(d) === null, "모르는 화면이면 버린다"); }
  check(S.unpack(null) === null && S.unpack("글") === null && S.unpack({}) === null, "빈 것 · 글 · 빈 객체는 버린다");
  // 싸움 — 모르는 적 · 모르는 카드 · 찾을 수 없는 수
  run.where = { k: "fight" };
  const { st } = R.openFight(run);
  const fight = S.pack(run, st);
  check(!!S.unpack(JSON.parse(JSON.stringify(fight))), "싸움이 든 저장도 읽힌다");
  { const d = JSON.parse(JSON.stringify(fight)); d.combat.hand.push("없는_카드"); check(S.unpack(d) === null, "손패에 모르는 카드가 있으면 버린다"); }
  { const d = JSON.parse(JSON.stringify(fight)); d.combat.enemies[0].key = "없는_적"; check(S.unpack(d) === null, "모르는 적이 있으면 버린다"); }
  { const d = JSON.parse(JSON.stringify(fight)); const e = d.combat.enemies.find((x) => x.intent); if (e) e.intent = { path: ["intents", "99"] }; check(!e || S.unpack(d) === null, "적의 수를 데이터에서 못 찾으면 버린다"); }
}

// ── 브라우저 저장소 ─────────────────────────────────────────────────────
console.log("");
console.log("브라우저 저장소");
{
  const party = PARTIES[1];
  const run = R.newRun(party, Object.fromEntries(party.map((k) => [k, HERO_DATA[k].row])), 77);
  run.where = { k: "map" };
  check(S.writeSave(run) === false && S.readSave() === null, "저장소가 없으면(node) 조용히 넘어간다");
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  check(S.writeSave(run) === true && typeof mem[S.SAVE_KEY] === "string", `「${S.SAVE_KEY}」 에 적는다`);
  const back = S.readSave();
  check(!!back && canon(S.pack(back.run)) === canon(S.pack(run)), "읽으면 같은 판");
  check(JSON.parse(mem[S.SAVE_KEY]).v === S.SAVE_V, `판 번호 v = ${S.SAVE_V}`);
  mem[S.SAVE_KEY] = "{깨진 글";
  check(S.readSave() === null && !(S.SAVE_KEY in mem), "깨진 저장은 읽지 않고 지운다");
  S.writeSave(run); S.clearSave();
  check(!(S.SAVE_KEY in mem), "지우면 없다");
  run.done = "clear";
  check(S.writeSave(run) === false && !(S.SAVE_KEY in mem), "끝난 판은 적지 않는다");
  run.done = null;
  globalThis.localStorage = { getItem() { throw new Error("막힘"); }, setItem() { throw new Error("막힘"); }, removeItem() { throw new Error("막힘"); } };
  let threw = null;
  try { check(S.writeSave(run) === false && S.readSave() === null, "막힌 저장소 — 적지도 읽지도 못하지만 터지지 않는다"); S.clearSave(); } catch (e) { threw = e; }
  check(!threw, `막힌 저장소에서 예외가 새지 않는다${threw ? " — " + threw.message : ""}`);
  delete globalThis.localStorage;
}

console.log(fails ? `\n실패 ${fails}개` : "\n이어하기가 판을 그대로 되살린다");
process.exit(fails ? 1 : 0);
