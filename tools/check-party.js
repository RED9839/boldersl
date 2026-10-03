// 파티 HP · 파티 상태(docs/16 §8, 2026-10 사용자 — 카제나처럼 파티가 한 몸)가 규칙대로 도는가.
//   node tools/check-party.js
// 보는 것: 파티 HP = 세 사도 최대 HP 합(장비 HP 포함) · 적의 수는 파티를 친다(관통 · 연타 · 전체 공격 한 번) ·
//          회복은 파티에(넘친 회복 포함) · 상태 두 층(파티 층 하나 · 사도 층 사도마다) · 반격 · 도발 · 쓰러짐 없음 · 0 이면 진다 · 옛 저장 옮기기
import * as C from "../js/combat.js";
import * as R from "../js/run.js";
import * as S from "../js/save.js";
import * as RULES from "../js/rules.js";
import { HERO_DATA, EQUIP } from "../js/cardbook.js";
import { ENEMIES } from "../js/data/enemies.js";
import { parseEffect } from "../js/effects.js";

let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const V = RULES.STATUS_V;
const keys = ["에르핀", "네르", "티그"].filter((k) => HERO_DATA[k]);
const rows = Object.fromEntries(keys.map((k) => [k, HERO_DATA[k].row]));
const FOE = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss && !(ENEMIES[k].passives || []).length);
// 시험 판 — 패시브 · 상성 · 치명을 끄고 상태만 본다
function mk(opt = {}) {
  const s = C.newCombat({ partyKeys: keys, rows, deck: [], enemyIds: [FOE], seed: 11, ...opt });
  s.passives = {}; s.kw = {}; s.always = {}; s.noNature = true;
  for (const u of s.party) { u.crit = 0; u.mods = []; u.pst = {}; }
  s.pool.status = {}; s.pool.block = 0; s.pool.shield = 0; s.pool.invuln = false; s.taunt = null; s.tauntLeft = null;
  for (const e of s.enemies) { e.hp = e.maxHp = 5000; e.dmgx = 1; e.status = {}; e.tough = e.toughMax = 99; e.intent = { t: "block", v: 0, say: "시험", rush: 0 }; }
  s.hand = []; s.draw = []; s.discard = []; s.ap = 50;
  return s;
}
// 카드 글 한 줄을 그 사도가 낸 것처럼 돌린다(엔진의 fxApi 를 그대로 쓰려고 손에 넣어 낸다)
let serial = 0;
async function play(s, hero, text) {
  const B = await import("../js/cardbook.js");
  const id = `시험_파티_${serial++}`;
  B.CARDS[id] = { id, name: id, cost: 0, type: "스킬", hero, built: true, text, fx: parseEffect(text, {}).fx, target: "없음" };
  s.hand.push(id);
  return C.playCard(s, s.hand.length - 1, 0);
}
const hero = (s, k) => s.party.find((u) => u.key === k);

console.log("파티 HP — 세 사도 최대 HP 합(장비 HP 포함)");
{
  const run = R.newRun(keys, rows, 1);
  const sum = keys.reduce((a, k) => a + HERO_DATA[k].hp, 0);
  check(run.partyMaxHp === sum && run.partyHp === sum && run.hp === undefined, `새 판 파티 HP ${run.partyHp}/${run.partyMaxHp} = ${keys.map((k) => HERO_DATA[k].hp).join(" + ")}`);
  const id = Object.keys(EQUIP).find((x) => EQUIP[x].stats.hp > 0 && EQUIP[x].affinity !== keys[0]);
  run.bag.push(id); R.equip(run, keys[0], id);
  check(run.partyMaxHp === sum + EQUIP[id].stats.hp, `장비 HP(${EQUIP[id].ko} +${EQUIP[id].stats.hp})는 파티 최대 HP 에`);
  const { st } = R.openFight(run);
  check(st.pool.maxHp === run.partyMaxHp && st.party.every((u) => u.hp === st.pool.hp && u.maxHp === st.pool.maxHp), "싸움의 파티 HP 는 판의 것 그대로 · 사도 셋이 같은 몸을 가리킨다");
  check(st.party.reduce((a, u) => a + u.share, 0) === st.pool.maxHp, `사도마다 보탠 몫(share)의 합 = 파티 최대 HP (${st.party.map((u) => u.share).join(" + ")})`);
  st.pool.hp = 50; R.afterFight(run, st);
  check(run.partyHp === 50, "싸움이 끝나면 남은 파티 HP 가 판으로");
}

console.log("");
console.log("적의 수 — 모두 파티를 친다");
{
  const s = mk(), e = s.enemies[0];
  const h0 = s.pool.hp;
  e.intent = { t: "attack", v: 10, say: "시험 — 친다", rush: 0 };
  C.endTurn(s);
  check(h0 - s.pool.hp === 10 && s.party.every((u) => u.hp === s.pool.hp), `공격 10 — 파티 HP -${h0 - s.pool.hp}, 셋 모두 같은 값`);
  const b = mk(); b.pool.block = 6; b.pool.shield = 3;
  b.enemies[0].intent = { t: "back", v: 10, say: "시험 — 관통", rush: 0 };
  const hb = b.pool.hp; C.endTurn(b);
  check(b.pool.shield === 0 && hb - b.pool.hp === 7, `관통 10 — 방어(6)는 건너뛰고 실드 3 → HP -${hb - b.pool.hp}`);
  const m = mk(); m.pool.block = 5;
  m.enemies[0].intent = { t: "multi", v: 4, n: 3, say: "시험 — 연타", rush: 0 };
  const hm = m.pool.hp; C.endTurn(m);
  check(hm - m.pool.hp === 12 - 5, `연타 4×3 — 방어 5 를 먼저 벗기고 HP -${hm - m.pool.hp}`);
  const a = mk(); a.enemies[0].intent = { t: "attackAll", v: 10, id: "취약", n: 1, say: "시험 — 전체", rush: 0 };
  const ha = a.pool.hp; a.fx = []; C.endTurn(a);
  const hits = a.fx.filter((f) => f.k === "hurt" && f.side === "party").length;
  check(ha - a.pool.hp === Math.round(10 * RULES.FOE_ALL_X) && hits === 1, `전체 공격 10 — 파티를 한 번, ×${RULES.FOE_ALL_X} = ${ha - a.pool.hp} (맞은 대 ${hits})`);
  check((a.pool.status.취약 || 0) === 0 || (a.pool.status.취약 || 0) === 1, "전체 공격의 상태도 파티에 한 번");
  check(C.intentHit({ ...a.enemies[0], intent: { t: "attackAll", v: 10 }, status: {} }) === Math.round(10 * RULES.FOE_ALL_X), "머리 위 숫자도 ×FOE_ALL_X 한 값");
  const d = mk(); d.enemies[0].intent = { t: "debuff", id: "약화", v: 2, say: "시험 — 약화", rush: 0 };
  C.endTurn(d);
  check(d.pool.status.약화 === 2 && d.party.every((u) => u.status.약화 === 2), `적이 거는 약화 2 — 파티에 한 번(셋이 2 를 본다, 6 이 아니다)`);
}

console.log("");
console.log("회복 · 방어 · 실드 — 파티에 한 번");
{
  const s = mk(); s.pool.hp = 100;
  await play(s, keys[0], "아군 전원 HP 회복(방어력 50%)");
  const u = hero(s, keys[0]);
  const want = Math.max(1, Math.round(u.def * 0.5));   // 치유는 방어력 기준(v6 카제나)
  check(s.pool.hp === 100 + want, `「아군 전원 HP 회복(방어력 50%)」 — 파티에 한 번 +${s.pool.hp - 100} (방어력 ${u.def} 의 50% = ${want}, 세 번이 아니다)`);
  const g = mk();
  await play(g, keys[1], "HP 최저 아군 방어력 100% 방어, 아군 1명 방어력 100% 실드");
  const nu = hero(g, keys[1]);
  check(g.pool.block === nu.def && g.pool.shield === nu.def, `「HP 최저 아군 · 아군 1명」 방어 · 실드도 파티에 (방어 ${g.pool.block} · 실드 ${g.pool.shield})`);
  // 넘친 회복 — 파티 최대 HP 를 넘친 만큼이 「회복량이 최대 HP를 초과하면」 에 간다
  const o = mk(); o.pool.hp = o.pool.maxHp - 2; o.fx = [];
  o.passives = { [keys[0]]: [{ name: "시험", when: { on: "overheal" }, conds: [], fx: [{ k: "draw", v: 0 }], limit: null }] };
  await play(o, keys[0], "파티 HP 회복(방어력 100%)");
  const h = o.fx.find((f) => f.k === "heal");
  check(o.pool.hp === o.pool.maxHp && h && h.over > 0, `넘친 회복 — 파티 HP 가 가득 차고 넘친 ${h && h.over} 이 쪽지에 남는다`);
  check(o.log.some((l) => l.includes("시험")), "넘친 회복이 「회복량이 최대 HP를 초과하면」 패시브를 깨운다");
}

console.log("");
console.log("상태 두 층 — 파티 층은 하나, 사도 층은 사도마다");
{
  const s = mk();
  await play(s, keys[0], "아군 전원 불굴 1");
  check(s.pool.status.불굴 === 1 && s.party.every((u) => u.status.불굴 === 1), `「아군 전원 불굴 1」 — 파티 불굴 1(셋이 1 을 본다, 3 이 아니다)`);
  await play(s, keys[1], "자신 불굴 1");
  check(s.pool.status.불굴 === 2, "「자신 불굴 1」 도 파티 층 — 파티 불굴 2");
  await play(s, keys[0], "자신 사기 2");
  check(hero(s, keys[0]).status.사기 === 2 && !hero(s, keys[1]).status.사기 && !s.pool.status.사기, "「자신 사기 2」 — 그 사도에게만(사도 층)");
  await play(s, keys[1], "아군 전원 사기 1");
  check(hero(s, keys[0]).status.사기 === 3 && hero(s, keys[1]).status.사기 === 1 && hero(s, keys[2]).status.사기 === 1, "「아군 전원 사기 1」 — 사도마다 +1");
  await play(s, keys[2], "파티 사기 1");
  check(hero(s, keys[0]).status.사기 === 4 && hero(s, keys[2]).status.사기 === 2 && !s.pool.status.사기, "「파티 사기 1」 — 사도 층(사기)이면 사도 모두에게");
  check(JSON.stringify(RULES.HERO_ST) === JSON.stringify(["사기"]), "사도 층은 사기 하나(v6 — 열의 · 강건 · 집중 · 온정은 없앴다)");
  // 상한 — 사도 층은 사도마다 10 · 불굴은 파티에서 -80%
  const c = mk();
  await play(c, keys[0], "자신 사기 9"); await play(c, keys[0], "자신 사기 9");
  check(hero(c, keys[0]).status.사기 === V.사기Max && !hero(c, keys[1]).status.사기, `사기는 사도마다 ${V.사기Max}겹까지`);
  c.pool.status.불굴 = 7; c.enemies[0].intent = { t: "attack", v: 100, say: "시험", rush: 0 };
  const hc = c.pool.hp; C.endTurn(c);
  check(hc - c.pool.hp === Math.round(100 * (1 - V.불굴Cap)), `불굴 7 — 파티 받는 피해 -${Math.round(V.불굴Cap * 100)}% 까지 (${hc - c.pool.hp})`);
  // 사도 층은 그 사도의 카드에만 — 사기 2 인 사도의 피해만 커진다
  const d = mk(), e = d.enemies[0];
  hero(d, keys[0]).status.사기 = 2;
  const f0 = e.hp; await play(d, keys[0], "적 1명에게 공격력 100% 피해"); const mine = f0 - e.hp;
  const f1 = e.hp; await play(d, keys[1], "적 1명에게 공격력 100% 피해"); const other = f1 - e.hp;
  check(mine === Math.round(hero(d, keys[0]).atk * (1 + 2 * V.사기)) && other === hero(d, keys[1]).atk, `사기 2 — 그 사도의 카드만 +40% (${mine} · 다른 사도 ${other})`);
  // 적이 건 약화는 파티 층 — 누구 카드든 약해지고 한 장에 1 준다
  const w = mk(); w.pool.status.약화 = 1;
  const w0 = w.enemies[0].hp; await play(w, keys[2], "적 1명에게 공격력 100% 피해");
  check(w0 - w.enemies[0].hp === Math.round(hero(w, keys[2]).atk * (1 - V.약화)) && !w.pool.status.약화, "적이 건 약화(파티 층) — 누구 카드든 -25%, 한 장에 1 준다");
}

console.log("");
console.log("반격 · 도발 · 결정화");
{
  const s = mk();
  const defs = s.party.map((u) => u.def);
  s.pool.status.반격 = 1;
  s.enemies[0].intent = { t: "multi", v: 1, n: 3, say: "시험 — 연타", rush: 0 };
  const e0 = s.enemies[0].hp; C.endTurn(s);
  const g = s.party.reduce((a, b) => (b.def > a.def ? b : a));
  const ctr = Math.round(RULES.defDmgStat(g.atk, g.def) * V.반격);
  check(e0 - s.enemies[0].hp === ctr && !s.pool.status.반격, `반격 — 방어력이 가장 높은 사도(${g.ko} 방어 ${g.def})의 방어 기반 피해 ${V.반격 * 100}% 를 연타 수 하나에 한 번 (${e0 - s.enemies[0].hp} · 기대 ${ctr})`);
  const t = mk(), n = mk();
  await play(t, keys[1], "자신 도발 1턴");
  check(t.taunt === keys[1], "도발 — 그 사도가 앞을 막아 선다");
  for (const x of [t, n]) x.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 };
  const ht = t.pool.hp, hn = n.pool.hp; C.endTurn(t); C.endTurn(n);
  check(ht - t.pool.hp === Math.round(50 * (1 - V.불굴 * RULES.TAUNT_FORT)) && hn - n.pool.hp === 50 && !t.taunt, `도발 1턴 — 그 턴 파티 받는 피해 -${Math.round(V.불굴 * RULES.TAUNT_FORT * 100)}% (${ht - t.pool.hp} · 도발 없이 ${hn - n.pool.hp}), 턴이 지나면 풀린다`);
  const k = mk(); k.pool.status.결정화 = 2; k.fx = [];
  C.endTurn(k);
  check(k.pool.shield === Math.round(Math.max(...k.party.map((u) => u.def)) * V.결정화 * 2) && k.fx.filter((f) => f.k === "shield").length === 1, `결정화 2 — 턴 끝 실드 한 번(${k.pool.shield}), 방어력이 가장 높은 사도 기준`);
}

console.log("");
console.log("쓰러짐 없음 · 0 이면 진다");
{
  const s = mk();
  s.pool.hp = 5;
  s.enemies[0].intent = { t: "attack", v: 4, say: "시험", rush: 0 };
  C.endTurn(s);
  check(!s.over && s.party.every((u) => !u.dead) && s.pool.hp === 1, "파티 HP 가 남으면 아무도 쓰러지지 않는다");
  s.enemies[0].intent = { t: "attack", v: 99, say: "시험", rush: 0 };
  C.endTurn(s);
  check(s.over === "lose" && s.pool.hp === 0 && s.pool.dead, "파티 HP 0 — 그 싸움에서 진다");
  check(!s.log.some((l) => /주말농장|이번 전투에서 빠진다/.test(l)), "주말농장 · 카드 빠짐이 없다");
  const run = R.newRun(keys, rows, 3); run.partyHp = 0;
  check(R.partyWiped(run), "판 — 파티 HP 0 이면 끝(partyWiped)");
  check(RULES.CAMP_REVIVE === undefined && RULES.BOSS_REVIVE === undefined && R.reviveDown === undefined, "되살리기 규칙(CAMP_REVIVE · BOSS_REVIVE · reviveDown)이 없다");
}

console.log("");
console.log("옛 저장 — 사도마다 HP 를 더해 파티 HP 로");
{
  const run = R.newRun(keys, rows, 9);
  run.where = { k: "fight" };
  const { st } = R.openFight(run);
  const old = JSON.parse(JSON.stringify(S.pack(run, st)));
  const max = Object.fromEntries(keys.map((k) => [k, HERO_DATA[k].hp])), hp = { [keys[0]]: 20, [keys[1]]: 0, [keys[2]]: 5 };
  delete old.run.partyHp; delete old.run.partyMaxHp; old.run.hp = hp; old.run.maxHp = max;
  delete old.combat.pool;
  old.combat.party.forEach((u) => { u.hp = hp[u.key]; u.maxHp = max[u.key]; u.dead = hp[u.key] <= 0; u.block = 1; u.shield = 2; u.status = { 취약: 1, 사기: u.key === keys[0] ? 3 : 0 }; delete u.pst; });
  const got = S.unpack(old);
  const sum = keys.reduce((a, k) => a + max[k], 0);
  check(got && got.run.partyHp === 25 && got.run.partyMaxHp === sum, `판 — 파티 HP 25/${sum} (${got && got.run.partyHp}/${got && got.run.partyMaxHp})`);
  check(got && got.combat.pool.hp === 25 && got.combat.pool.block === 3 && got.combat.pool.shield === 6 && got.combat.pool.status.취약 === 1, "싸움 — HP · 방어 · 실드는 더하고 파티 층 상태는 하나로");
  check(got && got.combat.party[0].status.사기 === 3 && !got.combat.party[1].status.사기 && got.combat.party.every((u) => !u.dead), "싸움 — 사도 층(사기)은 그 사도에게 · 쓰러진 사도 없음");
  const again = S.unpack(JSON.parse(JSON.stringify(S.pack(got.run, got.combat))));
  check(again && again.combat.pool.hp === 25 && again.run.partyHp === 25, "옮긴 판을 다시 적고 읽어도 그대로");
}

console.log(bad ? `\n실패 ${bad}개` : "\n파티가 한 몸으로 돈다");
process.exit(bad ? 1 : 0);
