// 카제나 전투 체계 둘째 단계(docs/16-카제나전투.md) — 상태(겹 규칙 — 횟수 CHARGE_ST · 세기 INTENSITY_ST) · 카드 키워드 · 처치 AP · 상태 카드 · 유일 · 약점 다시 고르기.
//   node tools/check-czn.js
// 카드는 판의 장부(s.book)에 시험용으로 세운다 — 사도 카드에는 아직 새 키워드가 없다(v5 에서 쓴다)
import * as C from "../js/combat.js";
import * as R from "../js/rules.js";
import * as RUN from "../js/run.js";
import * as EV from "../js/events.js";
import { ENEMIES } from "../js/data/enemies.js";
import { STATUS_CARDS } from "../js/data/status-cards.js";
import { CURSES } from "../js/data/events.js";
import { CARDS, STATUS_CARD_ID, NEUTRAL_IDS } from "../js/cardbook.js";
import { parseEffect } from "../js/effects.js";
import { parsePassive, parseKeyword as parsePassiveKw } from "../js/passive.js";
import { packCombat, unpackCombat } from "../js/save.js";
import { makeBots } from "./lib/bot.js";
import B from "../js/data/built.js";

let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };
const V = R.STATUS_V;

// 성격이 서로 다른 사도 셋(연속 · 연계 시험) — 시작 카드가 있는 사도
const heroOf = (n) => Object.keys(B.heroes).find((k) => C.natureOf(k) === n && B.starter[k]);
const A = heroOf("순수"), Bh = heroOf("냉정"), Ch = heroOf("광기");
const A2 = Object.keys(B.heroes).find((k) => k !== A && C.natureOf(k) === "순수" && B.starter[k]);
// 패시브가 시험을 흐리지 않는 적 — 패시브 없는 보통 적
const FOE = Object.keys(ENEMIES).find((k) => !ENEMIES[k].boss && !(ENEMIES[k].passives || []).length && ENEMIES[k].nature);

function mk(opt = {}) {
  const s = C.newCombat({ partyKeys: opt.party || [A, Bh, Ch], deck: opt.deck || [], enemyIds: opt.foes || [FOE], seed: 21 });
  // 첫 턴 패시브가 이미 건 것(무적 · 도발 · 방어 · 상태)을 걷는다 — 상태만 본다
  for (const u of s.party) { u.crit = 0; u.hp = u.maxHp = 9999; u.def = 10; u.invuln = false; u.block = 0; u.shield = 0; u.status = {}; u.mods = []; }
  s.taunt = null; s.tauntLeft = null; s.stacks = {};
  for (const e of s.enemies) { e.hp = e.maxHp = 5000; e.dmgx = 1; e.intent = { t: "block", v: 0, say: "시험 — 가만히", rush: 0 }; if (opt.hard) e.tough = e.toughMax = 99; }
  s.passives = {}; s.kw = {}; s.always = {};          // 사도 패시브 · 키워드를 끈다 — 상태만 본다
  s.noNature = true;                                  // 상성을 끈다 — 수치를 바로 견준다
  s.hand = []; s.draw = []; s.discard = [];
  s.ap = 50;
  return s;
}
let nCard = 0;
function card(s, hero, text, extra = {}, where = "hand") {
  const id = `시험카드${++nCard}`;
  const { fx, left } = parseEffect(text);
  if (left) throw new Error(`못 읽음: ${text} → ${left}`);
  s.book[id] = { id, name: `시험 ${nCard}`, ko: `시험 ${nCard}`, cost: 1, type: "공격", hero, built: true, target: "적", text, fx, tags: [], ...extra };
  s[where].push(id);
  return id;
}
const idx = (s, id) => s.hand.indexOf(id);
const play = (s, hero, text, extra) => { const id = card(s, hero, text, extra); const r = C.playCard(s, idx(s, id), 0); if (!r.ok) throw new Error(r.why); return r; };
const lost = (e, f) => { const h0 = e.hp, b0 = e.block || 0, s0 = e.shield || 0; f(); return h0 - e.hp + (b0 - (e.block || 0)) + (s0 - (e.shield || 0)); };
const st = (u, id) => (u.status || {})[id] || 0;
const hero = (s, k) => s.party.find((u) => u.key === k);

console.log("수치 — 한 표(rules.js STATUS_V)");
check(V.취약 === 0.5 && V.약화 === 0.25 && V.사기 === 0.2 && V.불굴 === 0.2 && V.손상 === 0.5, `취약 +${V.취약 * 100}% · 약화 -${V.약화 * 100}% · 사기 +${V.사기 * 100}% · 불굴 -${V.불굴 * 100}% · 손상 -${V.손상 * 100}%`);
check(R.WEAK === undefined && R.FRAIL === undefined && V.격파 === undefined, "옛 상수(WEAK · FRAIL · 격파 덤)가 없다 — 엔진 · 봇은 STATUS_V 하나만 읽는다");
check(["취약", "약화", "손상", "피해 감소", "반격", "표식", "잔광", "면역", "실드 유지", "저장", "협공", "충격", "충격파", "그을림"].every((k) => R.CHARGE_ST.includes(k))
  && ["사기", "불굴", "결의", "결정화", "고동"].every((k) => R.INTENSITY_ST.includes(k)) && ["고통", "균열"].every((k) => R.DOT_ST.includes(k))
  && !R.CHARGE_ST.some((k) => R.INTENSITY_ST.includes(k)), `갈래 — 횟수 ${R.CHARGE_ST.join(" · ")} / 세기 ${R.INTENSITY_ST.join(" · ")} / 지속 ${R.DOT_ST.join(" · ")} / 잔불`);
check(["열의", "강건", "집중", "온정"].every((k) => !R.INTENSITY_ST.includes(k) && V[k] === undefined) && JSON.stringify(R.HERO_ST) === JSON.stringify(["사기"]),
  "공용 상태는 카제나 사전 것만 — 열의 · 강건 · 집중 · 온정이 없다, 사도 층은 사기 하나");
check(Math.abs(R.stackEff("사기", 3) - 3 * V.사기) < 1e-9 && R.stackEff("불굴", 4) === V.불굴Cap && R.stackEff("불굴", 9) === V.불굴Cap && V.불굴Cap === 0.8, `세기 셈 — 사기 3 = +${Math.round(R.stackEff("사기", 3) * 100)}% · 불굴 4 = 불굴 9 = -${Math.round(V.불굴Cap * 100)}%`);
check(R.INTENSITY_ST.every((k) => V[k + "Max"] === 10) && R.stackEff("사기", 15) === R.stackEff("사기", 10) && R.FOE_INT_MAX === 3, `세기 상한 — 사도 ${V.사기Max}겹 · 적 ${R.FOE_INT_MAX}겹`);

console.log("");
console.log("글 읽기 — 상태 문법");
{
  const want = [
    ["사기 2", "status:사기:2:party"], ["자신 사기 2", "status:사기:2:self"], ["아군 전원 불굴 2", "status:불굴:2:party"], ["적 1명 취약 2", "status:취약:2:oneEnemy"],
    ["자신 사기 1", "status:사기:1:self"], ["적 1명 고통 3", "status:고통:3:oneEnemy"], ["아군 1명 반격 2", "status:반격:2:oneAlly"],
    ["적 전체 손상 1", "status:손상:1:allEnemies"], ["결의 2", "status:결의:2:party"], ["결정화 3", "status:결정화:3:party"], ["적 1명 표식 2", "status:표식:2:oneEnemy"],
    ["적 1명에게 공격력 100% 피해, 자신 약화 1", "dmg · status:약화:1:self"],
  ];
  for (const [t, w] of want) {
    const { fx, left } = parseEffect(t);
    const got = fx.map((f) => (f.k === "status" ? `status:${f.id}:${f.turns}:${f.target}` : f.k)).join(" · ");
    check(!left && got === w, `「${t}」 → ${got}${left ? ` (못 읽음 ${left})` : ""}`);
  }
  const kw = [["연계. 적 1명에게 공격력 50% 피해", "tag:연계"], ["천상. 드로우 1", "tag:천상"], ["신속. 드로우 1", "tag:신속"], ["증발. 드로우 1", "tag:증발"],
    ["유일. 드로우 1", "tag:유일"], ["사용 불가. 증발.", "tag:사용불가"],
    ["드로우 1. 연속: AP +1", "ifChain"], ["드로우 1. 영감: AP +1", "when:draw"], ["소멸. 턴 끝에 손에 있으면: 아군 전원 HP 20 소모", "when:handEnd"]];
  for (const [t, w] of kw) {
    const { fx, left } = parseEffect(t);
    const got = fx.map((f) => (f.k === "tag" ? `tag:${f.id}` : f.k === "when" ? `when:${f.on}` : f.k));
    check(!left && got.includes(w), `「${t}」 → ${got.join(" · ")}`);
  }
  check(!parseEffect("사기진작").fx.length && !parseEffect("적 전체에 「늑대 표식」 +2").fx.some((f) => f.k === "status"), "낱말 속 · 사도 표식은 상태가 아니다(사기진작 · 「늑대 표식」)");
  check(!parseEffect("잔광. 적 1명에게 공격력 50% 피해").fx.some((f) => f.k === "tag") && !parseEffect("드로우 1. 감응: AP +1").fx.some((f) => f.k === "when"),
    "옛 카드 태그 「잔광.」 · 옛 「감응:」 은 이제 안 읽힌다(잔광은 상태 · 감응은 영감)");
}

console.log("");
console.log("겹 — 더해진다. 세기(사기 …)는 줄지 않는다");
{
  const s = mk();
  play(s, A, "자신 사기 2", { type: "스킬", target: "없음" });
  play(s, A, "자신 사기 1", { type: "스킬", target: "없음" });
  check(st(hero(s, A), "사기") === 3, `사기 2 + 사기 1 = ${st(hero(s, A), "사기")} (중첩)`);
  C.endTurn(s);
  check(st(hero(s, A), "사기") === 3, "턴이 지나도 안 준다");
  // 세기는 일(카드 · 적의 수 · 턴)을 몇 번 거쳐도 그대로
  const u = hero(s, A);
  Object.assign(u.status, { 불굴: 2, 결의: 2, 고동: 1 });
  s.ap = 50;
  play(s, A, "적 1명에게 3회 × 공격력 10% 피해");
  play(s, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  play(s, A, "자신 HP 회복(방어력 10%)", { type: "스킬", target: "없음" });
  play(s, A, "적 1명에게 공격력 10% 피해");
  s.enemies[0].intent = { t: "attack", v: 5, say: "시험 — 친다", rush: 0 }; s.taunt = A; s.tauntLeft = 9;
  C.endTurn(s); C.endTurn(s);
  const keep = { 사기: 3, 불굴: 2, 결의: 2, 고동: 1 };
  check(Object.entries(keep).every(([k, n]) => st(u, k) === n), `세기 — 카드 네 장 · 적의 수 · 턴 둘을 거쳐도 그대로 (${Object.keys(keep).map((k) => `${k} ${st(u, k)}`).join(" · ")})`);
  // 사도는 10겹까지 · 적은 FOE_INT_MAX 겹까지
  s.ap = 50;
  play(s, A, "자신 사기 9", { type: "스킬", target: "없음" });
  check(st(u, "사기") === V.사기Max, `사도 사기는 ${V.사기Max}겹까지 (${st(u, "사기")})`);
  const e = s.enemies[0];
  for (let i = 0; i < 5; i++) { e.intent = { t: "buff", id: "사기", v: 1, say: "시험 — 성난다", rush: 0 }; C.endTurn(s); }
  check(st(e, "사기") === R.FOE_INT_MAX, `적은 턴마다 사기 1 을 쌓아도 ${R.FOE_INT_MAX}겹까지 (${st(e, "사기")})`);
}

console.log("");
console.log("취약 · 약화(횟수 — 1 씩 준다) · 사기 · 불굴(세기 — 겹마다, 안 준다)");
{
  // 취약 — 받는 피해 +50%, 여러 번 치는 카드 한 장에 1
  const a = mk(), b = mk();
  b.enemies[0].status.취약 = 2;
  const da = lost(a.enemies[0], () => play(a, A, "적 1명에게 3회 × 공격력 100% 피해"));
  const db = lost(b.enemies[0], () => play(b, A, "적 1명에게 3회 × 공격력 100% 피해"));
  check(Math.abs(db - da * (1 + V.취약)) <= 3, `취약 — 받는 피해 +${V.취약 * 100}% (${da} → ${db})`);
  check(st(b.enemies[0], "취약") === 1, `세 번 치는 카드 한 장에 취약 1 만 준다 (2 → ${st(b.enemies[0], "취약")})`);
  play(b, A, "적 1명에게 공격력 10% 피해");
  const d3 = lost(b.enemies[0], () => play(b, A, "적 1명에게 3회 × 공격력 100% 피해"));
  check(st(b.enemies[0], "취약") === 0 && d3 === da, `다 쓰면 그대로 (${d3})`);
  // 사기 — 세기: 겹마다 주는 피해 +20%(사기 3 = +60%), 카드를 내도 줄지 않는다
  const c = mk(), d = mk(), m3 = mk();
  hero(d, A).status.사기 = 1; hero(m3, A).status.사기 = 3;
  const dc = lost(c.enemies[0], () => play(c, A, "적 1명에게 공격력 300% 피해"));
  const dd = lost(d.enemies[0], () => play(d, A, "적 1명에게 공격력 300% 피해"));
  check(Math.abs(dd - dc * (1 + V.사기)) <= 1 && st(hero(d, A), "사기") === 1, `사기 1 — 주는 피해 +${V.사기 * 100}% (${dc} → ${dd}), 줄지 않는다`);
  const dd3 = lost(m3.enemies[0], () => play(m3, A, "적 1명에게 공격력 300% 피해"));
  const dd3b = lost(m3.enemies[0], () => play(m3, A, "적 1명에게 공격력 300% 피해"));
  check(Math.abs(dd3 - dc * (1 + 3 * V.사기)) <= 1 && dd3b === dd3 && st(hero(m3, A), "사기") === 3, `사기 3 — 주는 피해 +${Math.round(3 * V.사기 * 100)}% (${dc} → ${dd3} → 다음 장도 ${dd3b}), 3 그대로`);
  check(st(hero(d, Bh), "사기") === 0, "사기는 그 사도의 카드에만");
  // 약화(사도) — 주는 피해 -25%
  const e = mk(); hero(e, A).status.약화 = 1;
  const de = lost(e.enemies[0], () => play(e, A, "적 1명에게 공격력 300% 피해"));
  check(Math.abs(de - dc * (1 - V.약화)) <= 1 && st(hero(e, A), "약화") === 0, `약화(사도) — 주는 피해 -${V.약화 * 100}% (${dc} → ${de}), 1 준다`);
  // 약화(적) — 머리 위 숫자 · 실제 피해 -25%, 공격 수 하나에 1
  const f = mk(), g = mk();
  for (const x of [f, g]) x.enemies[0].intent = { t: "multi", v: 20, n: 3, say: "시험 — 연타", rush: 0 };
  g.enemies[0].status.약화 = 2;
  check(C.intentHit(g.enemies[0]) === Math.round(20 * (1 - V.약화)), `약화(적) — 머리 위 숫자 ${C.intentHit(f.enemies[0])} → ${C.intentHit(g.enemies[0])}`);
  const tank = (x) => x.party.reduce((a2, u) => a2 + u.hp, 0);
  const hf = tank(f), hg = tank(g);
  C.endTurn(f); C.endTurn(g);
  check(hg - tank(g) < hf - tank(f) && st(g.enemies[0], "약화") === 1, `약화(적) — 세 번 치는 수 하나에 1 (${hf - tank(f)} → ${hg - tank(g)}, 남은 겹 ${st(g.enemies[0], "약화")})`);
  // 불굴 — 세기: 겹마다 받는 피해 -20%, 맞아도 줄지 않는다. 합쳐서 불굴Cap(-80%, 4겹 몫)까지
  const h = mk(), k = mk(), k4 = mk(), k7 = mk();
  for (const x of [h, k, k4, k7]) x.enemies[0].intent = { t: "attack", v: 50, say: "시험 — 친다", rush: 0 };   // 도발은 걸지 않는다 — 도발은 파티 불굴 +1 이다(rules.js TAUNT_FORT)
  hero(k, A).status.불굴 = 2; hero(k4, A).status.불굴 = 4; hero(k7, A).status.불굴 = 7;
  const hh = hero(h, A).hp, hk = hero(k, A).hp, h4 = hero(k4, A).hp, h7 = hero(k7, A).hp;
  for (const x of [h, k, k4, k7]) C.endTurn(x);
  const lh = hh - hero(h, A).hp, lk = hk - hero(k, A).hp, l4 = h4 - hero(k4, A).hp, l7 = h7 - hero(k7, A).hp;
  check(Math.abs(lk - lh * (1 - 2 * V.불굴)) <= 1 && st(hero(k, A), "불굴") === 2, `불굴 2 — 받는 피해 -${Math.round(2 * V.불굴 * 100)}% (${lh} → ${lk}), 줄지 않는다`);
  check(Math.abs(l4 - lh * (1 - V.불굴Cap)) <= 1 && l7 === l4 && l7 > 0 && st(hero(k7, A), "불굴") === 7, `불굴 상한 — 4겹 · 7겹 모두 -${Math.round(V.불굴Cap * 100)}% (${l4} · ${l7}), 면역은 없다`);
  // 취약(사도) — 적이 건 것도 같은 규칙
  const m = mk(); m.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 };
  hero(m, A).status.취약 = 1;
  const hm = hero(m, A).hp; C.endTurn(m);
  check(Math.abs((hm - hero(m, A).hp) - lh * (1 + V.취약)) <= 1 && st(hero(m, A), "취약") === 0, `취약(사도) — 받는 피해 +${V.취약 * 100}% (${hm - hero(m, A).hp})`);
}

console.log("");
console.log("손상 · 결의 · 결정화 · 고통 · 반격 · 표식");
{
  const s = mk(), u = hero(s, A);
  u.status.손상 = 1;
  play(s, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(u.block === Math.round(u.def * 1 * (1 - V.손상)) && st(u, "손상") === 0, `손상 — 얻는 방어 -${V.손상 * 100}% (${u.block}), 1 준다`);
  play(s, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(u.block === Math.round(u.def * 0.5) + u.def, "다 쓰면 그대로");
  // 결의 — 세기: 겹마다 얻는 방어 · 실드 +결의(얻을 때마다), 줄지 않는다. 결정화 — 턴 끝에 겹마다 방어력 20% 실드(결의도 붙는다)
  const t = mk(), w = hero(t, A);
  w.status.결의 = 2;
  play(t, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(w.block === w.def + 2 * V.결의 && st(w, "결의") === 2, `결의 2 — 방어 ${w.block} (방어력 ${w.def} + ${2 * V.결의}), 줄지 않는다`);
  w.status.결정화 = 3;
  const sh0 = w.shield || 0;
  C.endTurn(t);
  const want = Math.round(w.def * V.결정화 * 3);   // 결정화는 고정 실드 — 결의 · 손상을 안 탄다(v6 카제나)
  check((w.shield || 0) - sh0 === want && st(w, "결의") === 2 && st(w, "결정화") === 3, `결정화 3겹 ${V.결정화 * 100}%씩 — 턴 끝 고정 실드 +${(w.shield || 0) - sh0}(결의 2 를 안 탄다, 둘 다 그대로)`);
  // 고통(v6 카제나) — 턴 끝에 겹의 50% 고정 지속 피해(건 사람 공격력 기준 — 바탕을 안 적었으면 FOE_DOT), 그 뒤 절반
  const p = mk(), e = p.enemies[0];
  e.status.고통 = 7;
  const h0 = e.hp;
  C.endTurn(p);
  const pain = (n) => Math.round(n * V.고통 * R.FOE_DOT);
  check(V.고통 === 0.5 && h0 - e.hp === pain(7) && st(e, "고통") === 3, `고통 7 — 턴 끝 고정 피해 ${h0 - e.hp}(7 × ${V.고통 * 100}% × ${R.FOE_DOT}), 겹 절반(${st(e, "고통")})`);
  e.block = 100; const h1 = e.hp; C.endTurn(p);
  check(h1 - e.hp === pain(3) && e.block >= 0, "고통은 방어 · 실드를 뚫는다");
  const pa = mk(); play(pa, A, "적 1명 고통 2", { type: "스킬" });
  const pe = pa.enemies[0], ph0 = pe.hp, pu = hero(pa, A).atk; C.endTurn(pa);
  check(ph0 - pe.hp === Math.round(2 * V.고통 * pu), `사도가 건 고통 — 바탕은 건 사도의 공격력(${pu}) — ${ph0 - pe.hp}`);
  const q = mk(); play(q, A, "적 1명 고통 30", { type: "스킬" });
  check(st(q.enemies[0], "고통") === V.고통Max, `고통은 최대 ${V.고통Max}`);
  // 반격(v6 카제나) — 적의 수 하나에 한 번(연타라도), 방어 기반 피해 150%(방어력 210% + 공격력 30%) · 다 막으면 300% · 치명 적용
  const r = mk(), ru = hero(r, A);
  r.taunt = A; r.tauntLeft = 9; ru.status.반격 = 2;
  r.enemies[0].intent = { t: "multi", v: 5, n: 3, say: "시험 — 연타", rush: 0 };
  const eh = r.enemies[0].hp;
  C.endTurn(r);
  const g0 = C.partyGuard(r), base = R.defDmgStat(g0.atk, g0.def);
  check(eh - r.enemies[0].hp === Math.round(base * V.반격) && st(ru, "반격") === 1, `반격 — 연타 수 하나에 한 번 방어 기반 피해 ${V.반격 * 100}% (${eh - r.enemies[0].hp} · 바탕 ${base}), 1 준다`);
  const r2 = mk(); r2.pool.status.반격 = 1; r2.pool.block = 999;
  r2.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 };
  const eh2 = r2.enemies[0].hp; C.endTurn(r2);
  const g2 = C.partyGuard(r2);
  check(eh2 - r2.enemies[0].hp === Math.round(R.defDmgStat(g2.atk, g2.def) * V.반격Full), `반격 — 방어 · 실드로 다 막으면 ${V.반격Full * 100}% (${eh2 - r2.enemies[0].hp})`);
  const r3 = mk(); r3.pool.status.반격 = 1; for (const u of r3.party) u.crit = 100;
  r3.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 };
  const eh3 = r3.enemies[0].hp; C.endTurn(r3);
  const g3 = C.partyGuard(r3);
  check(eh3 - r3.enemies[0].hp === Math.round(R.defDmgStat(g3.atk, g3.def) * V.반격 * R.CRIT_MULT), `반격 — 치명이 붙는다(치명 100% 사도 — ${eh3 - r3.enemies[0].hp})`);
  const r4 = mk(); play(r4, A, "파티 반격 30", { type: "스킬", target: "없음" });
  check(st(r4.pool, "반격") === V.반격Max, `반격은 최대 ${V.반격Max}`);
  // 표식 — 공격 카드에 덤 타격 + 강인도 1, 스킬 카드는 안 돈다
  const a = mk(), b = mk();
  b.enemies[0].status.표식 = 1;
  const t0 = b.enemies[0].tough;
  const da = lost(a.enemies[0], () => play(a, A, "적 1명에게 공격력 100% 피해"));
  const db = lost(b.enemies[0], () => play(b, A, "적 1명에게 공격력 100% 피해"));
  const one = Math.round(hero(b, A).atk * V.표식);
  check(db === da + one && t0 - b.enemies[0].tough === R.TOUGH.hit + 1 && st(b.enemies[0], "표식") === 0, `표식 — 덤 타격 ${db - da} · 강인도 ${t0 - b.enemies[0].tough}칸 · 1 준다`);
  const c = mk(); c.enemies[0].status.표식 = 1;
  play(c, A, "적 1명에게 공격력 50% 피해, 방어력 50% 방어", { type: "스킬" });
  check(st(c.enemies[0], "표식") === 1, "표식 — 스킬 카드에는 안 돈다(공격 카드만)");
}

console.log("");
console.log("잔광(파티 상태) · 처치 AP · 격파 덤 없음");
{
  // 잔광(v6 — 상태, 횟수) — 공격 카드 한 장에 1 쓴다: 강인도 +1, 격파된 적이면 피해 +50%
  const a = mk(), e = a.enemies[0];
  play(a, A, "자신 잔광 2, 적 1명에게 공격력 10% 피해");
  check(e.tough === e.toughMax - R.TOUGH.hit - R.TOUGH.glow && st(a.pool, "잔광") === 1, `잔광 — 공격 카드 강인도 ${R.TOUGH.hit + R.TOUGH.glow}칸, 1 준다 (${e.tough}/${e.toughMax} · 남은 ${st(a.pool, "잔광")})`);
  play(a, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(st(a.pool, "잔광") === 1, "잔광 — 스킬 카드는 안 쓴다");
  const b = mk(), c = mk();
  for (const x of [b, c]) { x.enemies[0].broken = true; x.enemies[0].tough = 0; }
  c.pool.status.잔광 = 1;
  const db = lost(b.enemies[0], () => play(b, A, "적 1명에게 3회 × 공격력 100% 피해"));
  const dc = lost(c.enemies[0], () => play(c, A, "적 1명에게 3회 × 공격력 100% 피해"));
  check(Math.abs(dc - db * (1 + V.잔광)) <= 3 && !st(c.pool, "잔광"), `잔광 — 격파된 적에게 세 대 모두 +${V.잔광 * 100}%, 한 장에 1 (${db} → ${dc})`);
  const k = mk({ foes: [FOE, FOE] }); k.enemies[0].hp = 1;
  const ap0 = k.ap;
  play(k, A, "적 1명에게 공격력 100% 피해");
  check(k.enemies[0].dead && k.ap === ap0 - 1 + R.KILL_AP, `적 처치 — AP +${R.KILL_AP} (${ap0} → ${k.ap})`);
  const last = mk(); last.enemies[0].hp = 1; play(last, A, "적 1명에게 공격력 100% 피해");
  check(last.over === "win", "마지막 적이면 그대로 이긴다");
  const f = mk({ foes: [FOE, FOE] }); f.enemies[0].hp = 1; f.enemies[0].status.고통 = 5;
  const apf = f.ap; C.endTurn(f);
  check(f.enemies[0].dead && f.ap === R.AP_PER_TURN + R.KILL_AP, `턴 끝(고통)에 쓰러뜨린 AP 는 다음 턴으로 (${apf} → ${f.ap})`);
}

console.log("");
console.log("연계 · 천상 — 손에서 저절로, 고리 없이");
{
  const s = mk({ hard: true });                         // 강인도를 크게 — 격파 AP 가 셈을 흐리지 않게
  const link = card(s, Bh, "연계. 적 1명에게 공격력 50% 피해");
  const ap0 = s.ap;
  play(s, Bh, "적 1명에게 공격력 10% 피해");
  check(s.hand.includes(link), "같은 사도의 카드로는 안 깨어난다");
  play(s, A, "적 1명에게 공격력 10% 피해");
  check(!s.hand.includes(link) && s.ap === ap0 - 2, `다른 사도의 카드 — 비용 없이 저절로 (AP ${ap0} → ${s.ap})`);
  check(s.log.some((l) => l.includes("연계!")), "기록에 「연계!」");
  const n = mk(); const l2 = card(n, Bh, "연계. 드로우 1", { type: "스킬" });
  play(n, null, "드로우 1", { type: "스킬", target: "없음" });
  check(n.hand.includes(l2), "교주 카드는 연계를 안 깨운다");
  const h = mk();
  const hv = card(h, A, "천상. 적 1명에게 공격력 50% 피해");
  play(h, Bh, "적 1명에게 공격력 10% 피해");
  check(h.hand.includes(hv), "비용 1 카드로는 천상이 안 깬다");
  play(h, Bh, "적 1명에게 공격력 10% 피해", { cost: 2 });
  check(!h.hand.includes(hv), "비용 2 카드 — 천상이 저절로");
  // 연출 쪽지 — 화면이 「연계!」 와 날아가는 카드를 띄운다
  const v = mk(); v.fx = [];
  card(v, Bh, "연계. 적 1명에게 공격력 50% 피해");
  play(v, A, "적 1명에게 공격력 10% 피해");
  const cueA = v.fx.find((x) => x.k === "auto");
  check(cueA && cueA.label === "연계!" && cueA.name && cueA.tag === "연계", `연출 쪽지 auto — ${cueA && cueA.label} 「${cueA && cueA.name}」`);
  // 고리 — 서로를 깨우는 연계 여섯 장(두 사도씩 번갈아) + 천상(비용 2) 셋. 한 장이 일으킨 사슬이 끝나고, 같은 카드는 한 번만
  const g = mk({ hard: true });
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(card(g, i % 2 ? Bh : Ch, "연계. 적 1명에게 공격력 10% 피해"));
  for (let i = 0; i < 3; i++) ids.push(card(g, Bh, "천상. 연계. 적 1명에게 공격력 10% 피해", { cost: 2 }));
  const apg = g.ap, logN = g.log.length;
  play(g, A, "적 1명에게 공격력 10% 피해", { cost: 2 });
  const fired = g.log.slice(logN).filter((l) => /손에서 저절로/.test(l)).length;
  const once = ids.every((id) => g.discard.filter((x) => x === id).length <= 1);
  check(!g.autoDepth && fired <= ids.length && once && g.ap === apg - 2, `고리 없음 — 아홉 장 가운데 ${fired}장이 한 번씩, 사슬 깊이 ${C.AUTO_DEPTH}까지, AP 는 낸 카드 값만(${apg} → ${g.ap})`);
  // 깊이 — 사슬은 AUTO_DEPTH 겹에서 멈춘다(A → B → C → B … 가 끝없이 깨우지 않는다)
  const d = mk();
  for (let i = 0; i < 8; i++) card(d, i % 2 ? Bh : Ch, "연계. 드로우 1", { type: "스킬", target: "없음" });
  play(d, A, "드로우 1", { type: "스킬", target: "없음" });
  check(d.autoDepth === 0, "깊이 셈은 끝나면 0 으로");
}

console.log("");
console.log("신속 · 연속 · 영감 · 증발");
{
  const s = mk(), e = s.enemies[0];
  e.intent = { t: "attack", v: 5, say: "시험", rush: 9 };
  const r0 = e.rushCnt || 0;
  play(s, A, "신속. 드로우 1", { type: "스킬", target: "없음" });
  check((e.rushCnt || 0) === r0, `신속 — 즉시 행동 셈 그대로 (${r0} → ${e.rushCnt || 0})`);
  play(s, A, "드로우 1", { type: "스킬", target: "없음" });
  check((e.rushCnt || 0) === r0 + 1, "여느 카드는 한 장 센다");
  // 연속 — 바로 앞 카드가 같은 성격(사도)이면
  const c = mk({ party: [A, A2, Bh] });
  const apc = c.ap;
  play(c, A, "드로우 1. 연속: AP +3", { type: "스킬", target: "없음" });
  check(c.ap === apc - 1, "연속 — 이번 턴 첫 카드면 안 돈다");
  play(c, A2, "드로우 1. 연속: AP +3", { type: "스킬", target: "없음" });
  check(c.ap === apc - 2 + 3, `연속 — 앞 카드가 같은 성격(${C.natureOf(A)})이면 돈다`);
  play(c, Bh, "드로우 1. 연속: AP +3", { type: "스킬", target: "없음" });
  check(c.ap === apc - 3 + 3, "연속 — 다른 성격이면 안 돈다");
  C.endTurn(c);
  check(c.prevNat === null, "턴이 바뀌면 앞 카드가 없다");
  // 영감(v6 — 옛 감응을 합쳤다) — 능력으로 뽑힐 때만. 턴 시작의 뽑기에는 안 돈다
  const d = mk();
  const sense = card(d, A, "드로우 1. 영감: AP +2", { type: "스킬", target: "없음" }, "draw");
  const apd = d.ap;
  C.draw(d, 1);
  check(d.hand.includes(sense) && d.ap === apd + 2, `영감 — 능력으로 뽑히자 AP +2 (${apd} → ${d.ap})`);
  const r = C.playCard(d, d.hand.indexOf(sense), 0);
  check(r.ok && d.ap === apd + 2 - 1, "영감 — 낼 때는 안 돈다");
  const d2 = mk(); const s2 = card(d2, A, "드로우 1. 영감: AP +2", { type: "스킬", target: "없음" }, "draw"); const ap2 = d2.ap;
  C.draw(d2, 1, { ability: false });
  check(d2.hand.includes(s2) && d2.ap === ap2, "영감 — 턴 시작의 뽑기에는 안 돈다");
  // 증발 — 턴 끝 손에 있으면 사라진다(보존이 있어도)
  const v = mk();
  const ev = card(v, A, "증발. 보존. 드로우 1", { type: "스킬", target: "없음" });
  C.endTurn(v);
  check(v.gone.includes(ev) && !v.discard.includes(ev) && !v.hand.includes(ev), "증발 — 턴 끝에 손에 있으면 사라진다(보존보다 앞선다)");
}

console.log("");
console.log("유일 — 한 개념 · 한 길(rules.js isOnly)");
{
  const only = NEUTRAL_IDS.find((id) => CARDS[id].oneOnly);
  const power = Object.keys(CARDS).find((id) => R.isPower(CARDS[id]));
  check(only && R.isOnly(CARDS[only]) && /^유일\./.test(CARDS[only].text), `교주 「${CARDS[only].name}」 — 「유일.」 (옛 「덱에 1장만.」)`);
  check(R.isOnly(CARDS[power]), `사도 강화 카드 「${CARDS[power].name}」 도 유일`);
  check(R.isOnly({ fx: parseEffect("유일. 드로우 1").fx }), "카드 키워드 「유일.」");
  check(!EV.dupeOk(only) && !EV.dupeOk(power), "복제 안 됨(events.js dupeOk)");
  const fakeRun = { deck: [only], flash: {}, spent: [] };
  check(!!RUN.powerWhy(fakeRun, only) && /유일/.test(RUN.powerWhy(fakeRun, only)), `이미 가졌으면 다시 안 든다 — 「${RUN.powerWhy(fakeRun, only)}」`);
}

console.log("");
console.log("상태 카드 · 저주");
{
  for (const [ko, c] of Object.entries(STATUS_CARDS)) {
    const x = CARDS[c.id];
    check(x && x.status && x.type === "상태" && !x.unparsed && STATUS_CARD_ID[ko] === c.id, `상태 카드 「${ko}」 — 장부에 있고 글을 다 읽는다`);
  }
  check(Object.values(CURSES).every((c) => CARDS[c.id].curse && CARDS[c.id].type === "저주"), "골칫거리는 종류 「저주」");
  const users = Object.entries(ENEMIES).filter(([, d]) => [...(d.intents || []), ...((d.phase || {}).intents || [])].some((it) => it.t === "addCard"));
  check(users.length >= 3 && users.every(([, d]) => [...d.intents].filter((it) => it.t === "addCard").every((it) => STATUS_CARD_ID[it.id])), `상태 카드를 넣는 적 ${users.length} — ${users.map(([, d]) => d.ko).join(" · ")}`);
  // 넣기 — 버린 더미 · 뽑을 더미 · 손
  const s = mk();
  s.enemies[0].intent = { t: "addCard", id: "끈적한 점액", n: 2, to: "discard", say: "시험", rush: 0 };
  C.endTurn(s);
  const slime = STATUS_CARD_ID["끈적한 점액"];
  check([...s.hand, ...s.draw, ...s.discard].filter((x) => x === slime).length === 2 && s.log.some((l) => l.includes("버린 더미")), "「끈적한 점액」 2장 → 버린 더미(다음 턴 뽑을 더미로 섞인다)");
  const t = mk(); t.enemies[0].intent = { t: "addCard", id: "왁자지껄", n: 1, to: "hand", say: "시험", rush: 0 };
  C.endTurn(t);
  const noisy = STATUS_CARD_ID["왁자지껄"];
  check(t.hand.includes(noisy) && !!C.canPlay(t, noisy), "「왁자지껄」 — 손에 들어오고 낼 수 없다");
  C.endTurn(t);
  check(!t.hand.includes(noisy) && t.gone.includes(noisy), "턴이 끝나면 증발");
  // 모자 속 쪽지 — 손에 든 채 넘기면 파티 HP 90(v6 눈금 — 옛 9 × 10)
  const u = mk(); const note = STATUS_CARD_ID["모자 속 쪽지"]; u.hand.push(note);
  const hp0 = u.pool.hp;
  C.endTurn(u);
  check(hp0 - u.pool.hp === 90, `「모자 속 쪽지」 — 턴 끝에 손에 있으면 파티 HP -90 (${hp0 - u.pool.hp})`);
  const w = mk(); w.hand.push(note); w.ap = 5;
  check(C.playCard(w, w.hand.indexOf(note), 0).ok && w.gone.includes(note), "AP 1 을 내면 치운다(소멸)");
  // 어지럼 — 뽑히면 AP -1(상태 카드의 영감은 턴 시작에 뽑혀도 돈다 — 적이 끼워 넣은 방해라 피할 수 없게)
  const z = mk(); z.draw.push(STATUS_CARD_ID["어지럼"]); const apz = z.ap; C.draw(z, 1, { ability: false });
  check(z.ap === apz - 1, `「어지럼」 — 턴 시작에 뽑혀도 AP -1 (${apz} → ${z.ap})`);
  // 판의 덱에는 안 들어간다 — 싸움이 끝나도
  const run = { deck: ["a", "b"], flash: {}, shin: {}, hp: {}, maxHp: {}, spent: [], gauge: 0 };
  const deck0 = run.deck.slice();
  s.gained = { cards: [], flash: [] };
  RUN.afterFight(run, s);
  check(JSON.stringify(run.deck) === JSON.stringify(deck0), "전투가 끝나도 판의 덱(run.deck)에 상태 카드가 없다");
}

console.log("");
console.log("저장 — 새 상태 · 상태 카드가 이어하기에 남는다");
{
  const s = mk({ foes: [FOE, FOE] });
  const u = hero(s, A);
  Object.assign(u.status, { 사기: 2, 불굴: 1, 결의: 2, 결정화: 3, 반격: 1, 손상: 1 });
  Object.assign(s.enemies[0].status, { 취약: 2, 약화: 1, 고통: 7, 표식: 2 });
  s.hand.push(STATUS_CARD_ID["왁자지껄"]); s.draw.push(STATUS_CARD_ID["어지럼"]); s.discard.push(STATUS_CARD_ID["끈적한 점액"]);
  s.prevNat = "순수";
  s.book = {};                                          // 시험 카드는 장부에만 있다 — 저장은 신탁에서 장부를 다시 만든다
  s.hand = s.hand.filter((id) => CARDS[id]); s.discard = s.discard.filter((id) => CARDS[id]);
  const back = unpackCombat(packCombat(s));
  const bu = back.party.find((x) => x.key === A);
  check(JSON.stringify(bu.status) === JSON.stringify(u.status) && JSON.stringify(back.enemies[0].status) === JSON.stringify(s.enemies[0].status), "상태 겹이 그대로");
  check(back.hand.includes(STATUS_CARD_ID["왁자지껄"]) && back.draw.includes(STATUS_CARD_ID["어지럼"]) && back.discard.includes(STATUS_CARD_ID["끈적한 점액"]) && back.prevNat === "순수", "상태 카드 · 연속의 앞 카드가 그대로");
  C.endTurn(back);
  check(!back.over && bu.shield > 0, "이어서 턴이 돈다(결의 · 결정화 실드)");
}

console.log("");
console.log("약점 — 원작 설정에서 다시 고름(enemies.js weak)");
{
  const w = (k) => C.weakOf(k).join("·");
  check(w("nururingtanker") === "우울" || Object.keys(ENEMIES).filter((k) => /Skin_Fairy/.test(ENEMIES[k].skin || "")).every((k) => w(k) === "우울"), "누루링-요정 — 우울(당이 오른 들뜬 무리 · 활발 꼴)");
  check(Object.keys(ENEMIES).filter((k) => /Skin_Elf/.test(ENEMIES[k].skin || "") && !ENEMIES[k].nature).every((k) => w(k) === "광기"), "누루링-엘프 — 광기(규율의 무리 · 순수 꼴)");
  check(Object.keys(ENEMIES).filter((k) => /Skin_Witch/.test(ENEMIES[k].skin || "")).every((k) => w(k) === "순수"), "누루링-마녀 — 순수(냉정한 마녀의 땅)");
  const meow = Object.keys(ENEMIES).find((k) => ENEMIES[k].ko === "M.E.O.W"), uros = Object.keys(ENEMIES).find((k) => ENEMIES[k].ko === "우로스");
  check(w(meow) === "순수" && w(uros) === "활발", `M.E.O.W 순수 · 우로스 활발 (${w(meow)} · ${w(uros)})`);
}

console.log("");
console.log("v6 — 카제나 바탕 단위(피해 · 방어 기반 피해 · 고정 피해 · 고정 실드 · 치유)");
{
  const atkA = (s) => hero(s, A).atk, defA = (s) => hero(s, A).def;
  const a = mk();
  const d0 = lost(a.enemies[0], () => play(a, A, "적 1명에게 방어 기반 피해 150%"));
  check(d0 === Math.round(R.defDmgStat(atkA(a), defA(a)) * 1.5) && R.DEF_DMG.def === 2.1 && R.DEF_DMG.atk === 0.3,
    `방어 기반 피해 150% = (방어력 ${defA(a)} × 210% + 공격력 ${atkA(a)} × 30%) × 150% = ${d0}`);
  // 고정 피해 — 사기 · 취약 · 약화를 안 탄다
  const b = mk(); hero(b, A).status.사기 = 3; b.enemies[0].status.취약 = 2; b.pool.status.약화 = 2;
  const d1 = lost(b.enemies[0], () => play(b, A, "적 1명에게 공격력 80% 고정 피해"));
  check(d1 === Math.round(atkA(b) * 0.8) && st(b.enemies[0], "취약") === 2, `고정 피해 80% — 사기 3 · 취약 · 약화가 있어도 ${d1}(공격력 × 80%), 취약도 안 쓴다`);
  // 고정 실드 — 결의 · 손상을 안 탄다
  const c = mk(); c.pool.status.결의 = 3; c.pool.status.손상 = 1;
  play(c, A, "파티 방어력 200% 고정 실드", { type: "스킬", target: "없음" });
  check(c.pool.shield === Math.round(defA(c) * 2) && st(c.pool, "손상") === 1, `고정 실드 200% — 결의 3 · 손상이 있어도 ${c.pool.shield}`);
  const c2 = mk(); c2.pool.status.결의 = 2;
  play(c2, A, "파티 방어력 100% 실드", { type: "스킬", target: "없음" });
  check(V.결의 === 20 && c2.pool.shield === defA(c2) + 2 * V.결의, `결의 2 — 실드 획득량 +${2 * V.결의}(카제나 그대로 겹마다 +20) → ${c2.pool.shield}`);
  // 치유 = 방어력 × 배율
  const h = mk(); h.pool.hp = 100;
  play(h, A, "파티 HP 회복(방어력 300%)", { type: "스킬", target: "없음" });
  check(h.pool.hp === 100 + Math.round(defA(h) * 3), `치유 — 방어력 ${defA(h)} × 300% = +${h.pool.hp - 100}`);
  check(R.healStat === undefined && R.HEAL_BONUS === undefined, "회복력(healStat · HEAL_BONUS)이 없다");
  check(!parseEffect("파티 HP 회복(회복력 70%)").fx.some((f) => f.k === "heal"), "옛 「회복(회복력 N%)」 는 이제 안 읽힌다");
  // 방어력은 받는 피해를 직접 깎지 않는다
  const p1 = mk(), p2 = mk(); for (const u of p2.party) u.def = 500;
  for (const x of [p1, p2]) x.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 };
  const q1 = p1.pool.hp, q2 = p2.pool.hp; C.endTurn(p1); C.endTurn(p2);
  check(q1 - p1.pool.hp === q2 - p2.pool.hp && q1 - p1.pool.hp > 0, `방어력은 받는 피해를 깎지 않는다 (방어 10 · 500 모두 ${q1 - p1.pool.hp})`);
}

console.log("");
console.log("v6 — 잔불(적 상태) · 파괴(처치)");
{
  const a = mk(), e = a.enemies[0]; e.broken = true; e.tough = 0;
  const b = mk(); b.enemies[0].broken = true; b.enemies[0].tough = 0;
  const d0 = lost(b.enemies[0], () => play(b, A, "적 1명에게 2회 × 공격력 100% 피해"));
  e.status.잔불 = 3;
  const d1 = lost(e, () => play(a, A, "적 1명에게 2회 × 공격력 100% 피해"));
  check(Math.abs(d1 - d0 * (1 + 3 * V.잔불)) <= 2 && !st(e, "잔불"), `잔불 3 — 격파된 적을 치면 두 대 모두 +${Math.round(3 * V.잔불 * 100)}%, 다 사라진다 (${d0} → ${d1})`);
  const k = mk({ foes: [FOE, FOE] }), ke = k.enemies[0]; ke.status.잔불 = 2; ke.hp = 50;
  play(k, A, "적 1명에게 공격력 100% 피해");
  check(ke.dead && k.log.some((l) => l.includes("잔불 2")), "잔불 — 격파 전이라도 이 한 대로 쓰러뜨리면 터진다");
  const n = mk();
  play(n, A, "적 1명 잔불 9", { type: "스킬" });
  check(st(n.enemies[0], "잔불") === V.잔불Max, `잔불은 최대 ${V.잔불Max}`);
  // 파괴 — 대상이 처치된 상태일 때만(격파가 아니다)
  const p = mk({ foes: [FOE, FOE] }); p.enemies[0].hp = 1; const ap0 = p.ap;
  play(p, A, "적 1명에게 공격력 50% 피해. 파괴: AP +2");
  check(p.ap === ap0 - 1 + R.KILL_AP + 2, `파괴 — 처치했으면 돈다 (AP ${ap0} → ${p.ap})`);
  const q = mk(); q.enemies[0].tough = R.TOUGH.hit; const ap1 = q.ap;
  play(q, A, "적 1명에게 공격력 50% 피해. 파괴: AP +2");
  check(q.enemies[0].broken && q.ap === ap1 - 1 + R.TOUGH.ap, "파괴 — 격파만 했으면 안 돈다");
  const r = mk({ foes: [FOE, FOE] }); r.enemies[1].hp = 1; const ap2 = r.ap;
  play(r, A, "적 전체에 공격력 50% 피해. 파괴: AP +2");
  check(r.ap === ap2 - 1 + R.KILL_AP + 2, "파괴 — 전체 카드는 하나라도 쓰러뜨렸으면 돈다");
}

console.log("");
console.log("v6 — 새 상태(피해 감소 · 면역 · 실드 유지 · 저장 · 협공 · 균열 · 고동 · 그을림 · 충격 · 충격파)");
{
  // 피해 감소 — 받는 피해 -15%, 맞는 일 하나에 1
  const a = mk(), b = mk(); b.pool.status["피해 감소"] = 1;
  for (const x of [a, b]) x.enemies[0].intent = { t: "attack", v: 100, say: "시험", rush: 0 };
  const ha = a.pool.hp, hb = b.pool.hp; C.endTurn(a); C.endTurn(b);
  check(hb - b.pool.hp === Math.round(100 * (1 - V["피해 감소"])) && !st(b.pool, "피해 감소"), `피해 감소 — 받는 피해 -${V["피해 감소"] * 100}% (${ha - a.pool.hp} → ${hb - b.pool.hp}), 1 준다`);
  // 면역 — 해로운 상태 하나를 막고 1 준다
  const c = mk(); c.pool.status.면역 = 1;
  c.enemies[0].intent = { t: "debuff", id: "취약", v: 2, say: "시험", rush: 0 };
  C.endTurn(c);
  check(!st(c.pool, "취약") && !st(c.pool, "면역"), "면역 — 적이 건 취약을 막고 1 준다");
  const c2 = mk(); c2.enemies[0].status.면역 = 1;
  play(c2, A, "적 1명 취약 2", { type: "스킬" });
  check(!st(c2.enemies[0], "취약") && !st(c2.enemies[0], "면역"), "면역 — 사도가 건 디버프도 막는다(적)");
  // 실드 유지 — 턴이 바뀔 때 방어 반을 남긴다
  const d = mk(); d.pool.status["실드 유지"] = 1;
  play(d, A, "파티 방어력 1000% 방어", { type: "스킬", target: "없음" });
  const blk = d.pool.block; C.endTurn(d);
  check(d.pool.block === Math.floor(blk * V["실드 유지"]) && !st(d.pool, "실드 유지"), `실드 유지 — 방어 ${blk} → ${d.pool.block}, 1 준다`);
  // 저장 — 남은 AP 를 다음 턴으로
  const e = mk(); e.pool.status.저장 = 1; e.ap = 2; C.endTurn(e);
  check(e.ap === R.AP_PER_TURN + 2 && !st(e.pool, "저장"), `저장 — 남긴 AP 2 를 가져온다 (${e.ap}), 1 준다`);
  const e2 = mk(); e2.ap = 2; C.endTurn(e2);
  check(e2.ap === R.AP_PER_TURN, "저장이 없으면 AP 는 사라진다");
  // 협공 — 사도가 공격 카드를 내면 다른 아군이 공격력 100% 로 함께 친다
  const f = mk(), g = mk(); g.pool.status.협공 = 1;
  const d0 = lost(f.enemies[0], () => play(f, A, "적 1명에게 공격력 10% 피해"));
  const d1 = lost(g.enemies[0], () => play(g, A, "적 1명에게 공격력 10% 피해"));
  const mate = Math.max(...g.party.filter((u) => u.key !== A).map((u) => u.atk));
  check(d1 - d0 === Math.round(mate * V.협공) && !st(g.pool, "협공"), `협공 — 다른 아군 공격력 ${mate} × ${V.협공 * 100}% 덤 (${d1 - d0}), 1 준다`);
  play(g, A, "드로우 1", { type: "스킬", target: "없음" });
  // 균열 — 턴 끝에 겹마다 40%(건 사람 공격력), 그 뒤 절반
  const h = mk(); play(h, A, "적 1명 균열 4", { type: "스킬" });
  const he = h.enemies[0], h0 = he.hp; C.endTurn(h);
  check(h0 - he.hp === Math.round(4 * V.균열 * hero(h, A).atk) && st(he, "균열") === 2, `균열 4 — 턴 끝 ${h0 - he.hp}(4 × ${V.균열 * 100}% × 공격력), 겹 절반`);
  // 고동 — 턴 끝에 겹마다 모든 적에게 고정 피해 70%(줄지 않는다)
  const k = mk({ foes: [FOE, FOE] }); play(k, A, "파티 고동 2", { type: "스킬", target: "없음" });
  const k0 = k.enemies.map((x) => x.hp); C.endTurn(k);
  const kv = Math.round(2 * V.고동 * hero(k, A).atk);
  check(k.enemies.every((x, i) => k0[i] - x.hp === kv) && st(k.pool, "고동") === 2, `고동 2 — 턴 끝 적 전체 고정 피해 ${kv}, 줄지 않는다`);
  // 그을림 — 즉시 행동 셈이 1 오를 때마다 지속 피해 80%, 1 준다, 턴 끝에 사라진다
  const m = mk(); play(m, A, "적 1명 그을림 3", { type: "스킬" });
  const me = m.enemies[0]; me.intent = { t: "attack", v: 5, say: "시험", rush: 9 };
  const m0 = me.hp; play(m, A, "드로우 1", { type: "스킬", target: "없음" });
  check(m0 - me.hp === Math.round(hero(m, A).atk * V.그을림) && st(me, "그을림") === 2, `그을림 — 카드 한 장(셈 +1)에 ${m0 - me.hp}, 1 준다 (남은 ${st(me, "그을림")})`);
  C.endTurn(m);
  check(!st(me, "그을림"), "그을림 — 턴 끝에 사라진다");
  // 충격 — 공격 카드의 대상이 되면 고정 피해 80%(방어 · 실드가 있으면 +50%)
  const n = mk(), n2 = mk(); play(n, A, "적 1명 충격 1", { type: "스킬" }); play(n2, A, "적 1명 충격 1", { type: "스킬" });
  n2.enemies[0].block = 9999;
  const nd = lost(n.enemies[0], () => play(n, A, "적 1명에게 공격력 10% 피해"));
  const base = Math.round(hero(n, A).atk * 0.1);
  check(nd - base === Math.round(hero(n, A).atk * V.충격) && !st(n.enemies[0], "충격"), `충격 — 공격 카드에 고정 피해 ${nd - base}, 1 준다`);
  const nb0 = n2.enemies[0].block; play(n2, A, "적 1명에게 공격력 10% 피해");
  check(nb0 - n2.enemies[0].block === Math.round(hero(n2, A).atk * V.충격 * (1 + V.충격Shield)) + base, `충격 — 방어가 있으면 +${V.충격Shield * 100}%`);
  // 충격파 — 카드에 맞으면 다른 모든 적에게 고정 피해 300%
  const o = mk({ foes: [FOE, FOE, FOE] }); play(o, A, "적 1명 충격파 1", { type: "스킬" });
  const o1 = o.enemies[1].hp, o2 = o.enemies[2].hp;
  play(o, A, "적 1명에게 공격력 10% 피해");
  const ov = Math.round(hero(o, A).atk * V.충격파);
  check(o1 - o.enemies[1].hp === ov && o2 - o.enemies[2].hp === ov && !st(o.enemies[0], "충격파"), `충격파 — 다른 적 모두 고정 피해 ${ov}, 1 준다`);
}

console.log("");
console.log("v6 — 새 카드 태그(소멸 N · 연결 · 안식 · 개막 · 금기 · 봉인 · 회수 · 조율 · 연쇄)");
{
  // 소멸 N — N 번 내면 소멸
  const a = mk(); const id = card(a, A, "소멸 2. 드로우 1", { type: "스킬", target: "없음" });
  C.playCard(a, a.hand.indexOf(id), 0);
  check(a.discard.includes(id) && !a.gone.includes(id), "소멸 2 — 한 번 내면 버린 더미로");
  a.discard.splice(a.discard.indexOf(id), 1); a.hand.push(id);
  C.playCard(a, a.hand.indexOf(id), 0);
  check(a.gone.includes(id), "소멸 2 — 두 번째에 소멸");
  // 연결 — 직접 내면 다른 연결 카드를 모두 버린다
  const b = mk(); const l1 = card(b, A, "연결. 드로우 1", { type: "스킬", target: "없음" }), l2 = card(b, Bh, "연결. AP +1", { type: "스킬", target: "없음" }), l3 = card(b, Ch, "드로우 1", { type: "스킬", target: "없음" });
  b.draw.push(Object.keys(CARDS).find((k) => CARDS[k].hero === Ch));   // 뽑을 더미가 비면 버린 더미가 섞여 돌아온다
  C.playCard(b, b.hand.indexOf(l1), 0);
  check(!b.hand.includes(l2) && b.discard.includes(l2) && b.hand.includes(l3), "연결 — 다른 연결 카드는 버리고, 아닌 카드는 남긴다");
  // 안식 — 효과로 버려질 때 돈다
  const c = mk(); const rest = card(c, A, "드로우 1. 안식: AP +3", { type: "스킬", target: "없음" });
  c.draw.push(Object.keys(CARDS).find((k) => CARDS[k].hero === Ch)); const ap0 = c.ap; play(c, Bh, "손패 1장 버리고 드로우 1", { type: "스킬", target: "없음" });
  check(c.discard.includes(rest) && c.ap === ap0 - 1 + 3, `안식 — 버려지자 AP +3 (${ap0} → ${c.ap}), 버린 더미에 머문다`);
  // 개막 — 전투 시작에 AP 를 써서 저절로
  const deckId = Object.keys(CARDS).find((k) => CARDS[k].hero === A && CARDS[k].type === "스킬" && CARDS[k].cost === 1);
  CARDS["시험_개막"] = { ...CARDS[deckId], id: "시험_개막", name: "시험 개막", fx: parseEffect("개막. 드로우 1").fx, text: "개막. 드로우 1", tags: [] };
  const op2 = C.newCombat({ partyKeys: [A, Bh, Ch], deck: ["시험_개막", deckId, deckId, deckId, deckId, deckId, deckId], enemyIds: [FOE], seed: 3 });
  check(op2.log.some((l) => l.includes("개막!")) && op2.ap === R.AP_PER_TURN - CARDS[deckId].cost && !op2.draw.includes("시험_개막") && !op2.hand.includes("시험_개막"), `개막 — 전투 시작에 AP ${CARDS[deckId].cost} 를 써서 저절로 나간다(남은 AP ${op2.ap})`);
  delete CARDS["시험_개막"];
  // 금기 — 신탁 · 복제 · 상점 제거가 안 된다
  CARDS["시험_금기"] = { id: "시험_금기", name: "시험 금기", cost: 1, type: "스킬", hero: A, unique: true, built: true, text: "금기. 드로우 1", fx: parseEffect("금기. 드로우 1").fx, tags: [], flash: [{}, {}, {}, {}, {}] };
  const fakeRun = { deck: ["시험_금기"], flash: {}, gold: 999, shop: { removeUsed: false } };
  check(R.isTaboo(CARDS["시험_금기"]) && !EV.dupeOk("시험_금기") && !RUN.flashTargets(fakeRun).includes("시험_금기") && /금기/.test(RUN.removeCard(fakeRun, "시험_금기") || ""), "금기 — 신탁 · 복제 · 상점 제거가 안 된다");
  delete CARDS["시험_금기"];
  // 봉인 — 처음 내면 효과 없이 풀린다
  const d = mk(); const sl = card(d, A, "봉인. AP +5", { type: "스킬", target: "없음" });
  const apd = d.ap; C.playCard(d, d.hand.indexOf(sl), 0);
  check(d.ap === apd - 1, "봉인 — 처음엔 효과 없이 봉인만 풀린다");
  d.discard.splice(d.discard.indexOf(sl), 1); d.hand.push(sl); C.playCard(d, d.hand.indexOf(sl), 0);
  check(d.ap === apd - 2 + 5, "봉인 — 풀린 뒤에는 돈다");
  // 회수 — 내면 손으로 돌아온다(N 번)
  const e = mk(); const rc = card(e, A, "회수. 드로우 1", { type: "스킬", target: "없음" });
  C.playCard(e, e.hand.indexOf(rc), 0);
  check(e.hand.includes(rc), "회수 — 내고 나면 손으로");
  C.playCard(e, e.hand.indexOf(rc), 0);
  check(!e.hand.includes(rc) && e.discard.includes(rc), "회수 — 한 번뿐(회수 N 은 N 번)");
  // 조율 — 비용 = 남은 AP 면
  const f = mk(); f.ap = 2; const tu = card(f, A, "드로우 1. 조율: AP +3", { type: "스킬", target: "없음", cost: 2 });
  C.playCard(f, f.hand.indexOf(tu), 0);
  check(f.ap === 3, `조율 — 비용 2 · 남은 AP 2 → 돈다 (AP ${f.ap})`);
  const f2 = mk(); f2.ap = 3; const tu2 = card(f2, A, "드로우 1. 조율: AP +3", { type: "스킬", target: "없음", cost: 2 });
  C.playCard(f2, f2.hand.indexOf(tu2), 0);
  check(f2.ap === 1, "조율 — 남은 AP 가 다르면 안 돈다");
  // 연쇄 — 다음 턴 시작에 같은 효과가 한 번 더
  const g = mk(); play(g, A, "연쇄. 적 1명에게 공격력 100% 피해");
  const g0 = g.enemies[0].hp; C.endTurn(g);
  check(g0 - g.enemies[0].hp === hero(g, A).atk && g.log.some((l) => l.includes("연쇄")), `연쇄 — 다음 턴 시작에 한 번 더 (${g0 - g.enemies[0].hp})`);
}

console.log("");
console.log("v6 — 사도 전용 키워드(고유 효과) 문법 — 1개당 % · 발동하면 사라진다 · 카드 만들기");
{
  const kw = parsePassiveKw("장전", "총알을 재 둔다. 최대 3. 1개당 피해 +50%. 발동하면 사라진다.");
  check(!kw.left.length && kw.cap === 3 && kw.consume === "all" && kw.per.some((p) => p.stat === "dealt" && p.v === 0.5), "「1개당 피해 +50%」 · 「발동하면 사라진다」 · 「최대 3」 을 읽는다");
  const s = mk(), u = hero(s, A);
  s.kw = { 장전: { ...kw, owner: A } }; s.stacks = { [A]: { 장전: 2 } };
  const b = mk(); const d0 = lost(b.enemies[0], () => play(b, A, "적 1명에게 공격력 100% 피해"));
  const d1 = lost(s.enemies[0], () => play(s, A, "적 1명에게 공격력 100% 피해"));
  check(Math.abs(d1 - d0 * 2) <= 1 && !s.stacks[A].장전, `장전 2 — 공격 카드 피해 +100% (${d0} → ${d1}), 발동하자 사라진다`);
  const kw2 = parsePassiveKw("조준", "한 점을 노린다. 1개당 공격력 +10%. 발동하면 1 감소.");
  check(kw2.consume === 1 && kw2.per.some((p) => p.stat === "atk"), "「1개당 공격력 +10%」 · 「발동하면 1 감소」");
  const kw3 = parsePassiveKw("탄창", "쌓인 탄. 최대 5. 「탄창」이 5개가 되면: 「탄창」 전부 소모, 「" + CARDS[Object.keys(CARDS).find((k) => CARDS[k].hero === A)].name + "」 1장 생성.", ["탄창"]);
  check(!kw3.left.length && kw3.rules.some((r) => r.fx.some((f) => f.k === "make")), "「N개가 되면: 「카드」 1장 생성」 — 카드 만들기");
  const m = mk(); const nm = CARDS[Object.keys(CARDS).find((k) => CARDS[k].hero === A)].name;
  play(m, A, `「${nm}」 2장 생성`, { type: "스킬", target: "없음" });
  check(m.hand.filter((x) => CARDS[x] && CARDS[x].name === nm).length === 2, `카드 만들기 — 「${nm}」 2장이 손에(이 전투만)`);
  // 자기 주머니의 「1개당 턴 종료 시 공격력 N% 피해」(물결 꼴) — 전에는 적 · 아군 표식만 쳤다
  const kw4 = parsePassiveKw("물결", "밀려오는 물. 최대 4. 1개당 턴 종료 시 공격력 20% 피해. 턴 끝에 사라진다.");
  const w = mk(); w.kw = { 물결: { ...kw4, owner: A } }; w.stacks = { [A]: { 물결: 3 } };
  const wd = lost(w.enemies[0], () => C.endTurn(w));
  const want = Math.round(hero(w, A).atk * 0.2 * 3);
  check(wd >= want * 0.9 && w.log.some((l) => l.includes("물결 3")), `자기 「물결」 3 — 턴 끝에 무작위 적 하나에 공격력 60% (${wd} · 기대 ${want})`);
  // 「「X」 1개당 …」 은 실드 · 회복에도 붙는다 · 적 표식은 고른 적이 든 수를 센다
  const kw5 = parsePassiveKw("세트", "반복 횟수. 최대 4.");
  const g = mk(); g.kw = { 세트: { ...kw5, owner: A } }; g.stacks = { [A]: { 세트: 3 } };
  const id5 = `시험카드${++nCard}`; const pe5 = parseEffect("「세트」 1개당 파티 방어력 50% 실드", { keywords: ["세트"] });
  g.book[id5] = { id: id5, name: "시험 실드", ko: "시험 실드", cost: 1, type: "스킬", hero: A, built: true, target: "없음", text: "", fx: pe5.fx, tags: [] }; g.hand.push(id5);
  const sh0 = g.pool.shield || 0; C.playCard(g, g.hand.indexOf(id5), 0);
  const per1 = Math.round(hero(g, A).def * 0.5);
  check(pe5.fx[0].k === "perStack" && Math.abs((g.pool.shield - sh0) - per1 * 3) <= 2, `「세트」 3 × 방어력 50% 실드 (${g.pool.shield - sh0} · 한 개 ${per1})`);
  const kw6 = parsePassiveKw("수은", "독. 적에게 거는 표식이다. 최대 5.");
  const q = mk(); q.kw = { 수은: { ...kw6, owner: A } }; q.enemies[0].status.수은 = 2;
  const id6 = `시험카드${++nCard}`; const pe6 = parseEffect("「수은」 1개당 적 1명에게 공격력 50% 피해", { keywords: ["수은"] });
  q.book[id6] = { id: id6, name: "시험 수은", ko: "시험 수은", cost: 1, type: "공격", hero: A, built: true, target: "적", text: "", fx: pe6.fx, tags: [] }; q.hand.push(id6);
  const one = mk(); const d1x = lost(one.enemies[0], () => play(one, A, "적 1명에게 공격력 50% 피해"));
  const d2x = lost(q.enemies[0], () => C.playCard(q, q.hand.indexOf(id6), q.enemies[0].idx));
  check(Math.abs(d2x - d1x * 2) <= 3, `적 표식 「수은」 2 — 그 적이 든 수만큼 친다 (${d1x} × 2 ≈ ${d2x})`);
}

console.log("");
console.log("v6 — 스탯 식(tools/lib/stat-formula.js)이 기획서 스탯과 같다");
{
  const { statOf, BASE } = await import("./lib/stat-formula.js");
  const D = (await import("../js/data/design.js")).default;
  const all = Object.values(D.heroes);
  const off = all.filter((h) => { const x = statOf(h); return x.hp !== h.hp || x.atk !== h.atk || x.def !== h.def || x.crit !== h.crit; });
  check(all.length === 135 && !off.length, `135명 모두 식 그대로${off.length ? " — 어긋남 " + off.slice(0, 4).map((h) => h.ko).join(", ") : ""}`);
  for (const ko of ["비비", "에르핀", "가비아", "이드", "나이아"]) {
    const h = all.find((x) => x.ko === ko); if (!h) continue;
    const b = BASE[`${h.role}|${h.row}`];
    check(h.hp >= 300 && h.atk >= 40 && h.def >= 15, `${ko}(${h.role} · ${h.row} · ${h.star}성${h.eldain ? " · 엘다인" : ""}) — HP ${h.hp} · 공격 ${h.atk} · 방어 ${h.def} · 치명 ${h.crit}% (기본 ${b.hp}/${b.atk}/${b.def})`);
  }
  const party = all.filter((h) => h.role === "탱커").slice(0, 1).concat(all.filter((h) => h.role === "딜러").slice(0, 1), all.filter((h) => h.role === "서포터").slice(0, 1));
  const sum = party.reduce((a, h) => a + h.hp, 0);
  check(sum >= 1500 && sum <= 3000, `카제나 눈금 — 탱커 · 딜러 · 서포터 파티 HP ${sum}`);
}

console.log("");
console.log("docs/18 베껴 쓰는 줄 — 엔진이 모두 읽는다");
{
  const fs = await import("node:fs");
  const t = fs.readFileSync(new URL("../docs/18-v6작성안내.md", import.meta.url), "utf8");
  const sec = t.slice(t.indexOf("## 9."), t.indexOf("## 10."));
  // 블록 첫 줄이 「패시브」 면 패시브 문법, 「키워드」 면 사도 전용 키워드 문법(이름|글), 「사용 불가」 면 못 읽혀야 하는 줄, 아니면 카드 글
  const blocks = sec.split("```").filter((_, i) => i % 2).map((b) => b.split(/\r?\n/));
  const head = (b) => b[0].trim();
  const lines = blocks.filter((b) => !["패시브", "키워드", "적", "이벤트"].includes(head(b))).flatMap((b) => b.filter(Boolean));
  const pas = blocks.filter((b) => head(b) === "패시브").flatMap((b) => b.slice(1).filter(Boolean));
  const kws = blocks.filter((b) => head(b) === "키워드").flatMap((b) => b.slice(1).filter(Boolean));
  const badL = lines.filter((l) => { const r = parseEffect(l); return r.left || !r.fx.length; });
  check(lines.length >= 80 && !badL.length, `카드 글 ${lines.length}줄 모두 읽힌다${badL.length ? " — 못 읽음: " + badL.join(" | ") : ""}`);
  const badP = pas.filter((l) => { const rs = parsePassive(l); return !rs.length || rs.some((r) => r.left || !r.fx.length || r.when.on === "always" || !r.when.on); });
  check(pas.length >= 8 && !badP.length, `패시브 ${pas.length}줄 모두 읽힌다${badP.length ? " — 못 읽음: " + badP.join(" | ") : ""}`);
  const badK = kws.filter((l) => { const [nm, txt] = l.split("|").map((x) => x.trim()); const k = parsePassiveKw(nm, txt, [nm]); return k.left.length || (!k.per.length && !k.rules.length); });
  check(kws.length >= 5 && !badK.length, `전용 키워드 ${kws.length}줄 모두 읽힌다${badK.length ? " — 못 읽음: " + badK.join(" | ") : ""}`);
  const pct = lines.filter((l) => /(주는 피해|받는 피해|공격력|방어력|치명 확률|회복력)\s*[+\-]\s*\d+\s*%/.test(l) && !/전투 내내/.test(l));
  check(!pct.length, `% 증감은 「전투 내내」(강화 카드) 밖에 없다(카드 글 — 전용 키워드의 1개당은 따로)${pct.length ? " — " + pct.join(" | ") : ""}`);
  const old = [...lines, ...pas].filter((l) => /회복력|온정|열의|강건|집중\s*\d|감응|잔불\.|잔광\./.test(l));
  check(!old.length, `옛 낱말(회복력 · 온정 · 열의 · 강건 · 집중 · 감응 · 잔불. · 잔광.)이 없다${old.length ? " — " + old.join(" | ") : ""}`);
  // 적 · 이벤트 블록 — 적의 수(JSON 꼴)와 이벤트 결과 낱말이 엔진에 읽힌다
  const foes = blocks.filter((b) => head(b) === "적").flatMap((b) => b.slice(1).filter(Boolean));
  const KNOWN = new Set(["attack", "back", "attackAll", "multi", "charge", "block", "guard", "heal", "buff", "debuff", "jam", "addCard"]);
  const badF = foes.filter((l) => { try { const o = Function(`return (${l})`)(); return !KNOWN.has(o.t); } catch { return true; } });
  check(foes.length >= 6 && !badF.length, `적의 수 ${foes.length}줄 — 엔진이 아는 꼴${badF.length ? " — " + badF.join(" | ") : ""}`);
  const evs = blocks.filter((b) => head(b) === "이벤트").flatMap((b) => b.slice(1).filter(Boolean));
  const badE = evs.filter((l) => EV.parseOut(l).some((o) => o.k === "unknown"));
  check(evs.length >= 6 && !badE.length, `이벤트 결과 ${evs.length}줄 — 모두 읽힌다${badE.length ? " — " + badE.join(" | ") : ""}`);
}

console.log("");
console.log("적의 새 수 — 깃발 · 강인도 되찾기 · 결의/손상 · 한 대마다 상태 · 고통 바탕 · 격파로 끊기 · 격파/일어섬 패시브(v5 적)");
{
  // 데이터 — 패시브의 때 · brk 는 모으기에만 · 상태 카드 이름(판 · 둘째 판 · 패시브까지)
  const KNOWN_ON = new Set(["fightStart", "turnStart", "turnEnd", "hurt", "lowHp", "allyDown", "card", "rushed", "debuffed", "broken", "recover"]);
  const moves = (d) => [...(d.intents || []), ...(d.open ? [d.open] : []), ...((d.phase || {}).intents || []), ...((d.phase2 || {}).intents || [])];
  const wrong = [];
  for (const d of Object.values(ENEMIES)) {
    for (const p of d.passives || []) if (!KNOWN_ON.has(p.on)) wrong.push(`${d.ko} 때 ${p.on}`);
    for (const it of moves(d)) if (it.brk && it.t !== "charge") wrong.push(`${d.ko} brk ${it.say}`);
    for (const x of [...moves(d).flatMap((it) => [it, it.next]), ...(d.passives || []).map((p) => p.do)].filter(Boolean))
      if (x.t === "addCard" && !STATUS_CARD_ID[x.id]) wrong.push(`${d.ko} 카드 ${x.id}`);
  }
  check(!wrong.length, `적 데이터 — 패시브 때 · brk 는 모으기에만 · 상태 카드 이름${wrong.length ? " — " + wrong.join(" | ") : ""}`);
  const pull = (s, e, it) => { e.intent = it; e.rushCnt = 2; e.rushedTurn = false; play(s, A, "방어력 100% 방어", { type: "스킬", target: "없음" }); };
  // 깃발 — buff all: 적 전체에 건다
  const a = mk({ foes: [FOE, FOE] });
  pull(a, a.enemies[0], { t: "buff", id: "사기", v: 2, all: true, say: "시험 — 깃발", rush: 3 });
  check(a.enemies.every((e) => st(e, "사기") === 2), `깃발(all) — 적 전체 사기 2 (${a.enemies.map((e) => st(e, "사기")).join(" · ")})`);
  // 강인도 되찾기 — tough N(guard 면 적 전체). 격파된 동안은 안 찬다
  const b = mk({ foes: [FOE, FOE] });
  b.enemies[0].tough = 1; b.enemies[1].tough = 0; b.enemies[1].broken = true;
  pull(b, b.enemies[0], { t: "guard", v: 5, tough: 1, say: "시험 — 굳히기", rush: 3 });
  check(b.enemies[0].tough === 2 && b.enemies[1].tough === 0 && b.enemies[1].broken, `tough 1 — 강인도 1 → ${b.enemies[0].tough}, 격파된 동료는 그대로 (${b.enemies[1].tough})`);
  // 적이 얻는 방어 — 결의 +20(세기 — 줄지 않는다) · 손상 -50%(횟수 — 한 번에 1 준다). 옛 적 강건은 결의로 옮겼다(v6)
  const c = mk({ foes: [FOE, FOE, FOE] });
  c.enemies[1].status.결의 = 1; c.enemies[2].status.손상 = 1;
  pull(c, c.enemies[0], { t: "guard", v: 100, say: "시험 — 벽", rush: 3 });
  check(c.enemies.map((e) => e.block).join(",") === `100,${100 + V.결의},${Math.round(100 * (1 - V.손상))}` && st(c.enemies[1], "결의") === 1 && !st(c.enemies[2], "손상"),
    `적 방어 — 그대로 · 결의 · 손상 (${c.enemies.map((e) => e.block).join(" · ")})`);
  // 연타 id — 한 대마다 상태 1. 고통의 바탕은 적의 「공격력」 FOE_DOT × 층 피해 배율(겹은 그대로)
  const d = mk(); d.enemies[0].dmgx = 2; d.taunt = A; d.tauntLeft = 9;
  pull(d, d.enemies[0], { t: "multi", v: 1, n: 3, id: "고통", say: "시험 — 긁기", rush: 3 });
  check(st(hero(d, A), "고통") === 3 && d.pool.dotU.고통 === R.FOE_DOT * 2, `연타 고통 — 세 대 = 고통 ${st(hero(d, A), "고통")}, 바탕 ${d.pool.dotU.고통}(FOE_DOT × 층 피해 배율 2)`);
  const g = mk();
  pull(g, g.enemies[0], { t: "attackAll", v: 1, id: "손상", n: 2, say: "시험 — 전체", rush: 3 });
  check(g.party.every((u) => st(u, "손상") === 2), `전체 공격 id — 맞은 사람마다 손상 2 (${g.party.map((u) => st(u, "손상")).join(" · ")})`);
  const g2 = mk(); g2.enemies[0].dmgx = 3;
  pull(g2, g2.enemies[0], { t: "debuff", id: "고통", v: 2, say: "시험 — 저주", rush: 3 });
  check(g2.party.every((u) => st(u, "고통") === 2) && g2.pool.dotU.고통 === R.FOE_DOT * 3, `디버프 고통 2 — 바탕 ${g2.pool.dotU.고통}(FOE_DOT × 층 피해 배율 3)`);
  const hp0 = g2.pool.hp; g2.enemies[0].intent = { t: "block", v: 0, say: "시험", rush: 0 }; C.endTurn(g2);
  check(hp0 - g2.pool.hp === Math.round(2 * V.고통 * R.FOE_DOT * 3), `적이 건 고통 2 — 턴 끝 파티 고정 피해 ${hp0 - g2.pool.hp}`);
  // 격파로 끊기 — brk 가 붙은 모으기는 그 턴에 격파하면 흩어지고, 안 붙은 것은 그대로
  const h = mk({ foes: ["nururingwarrior_fairy"] }), he = h.enemies[0];
  const ch = ENEMIES.nururingwarrior_fairy.intents.find((x) => x.t === "charge");
  he.intent = ch; he.tough = R.TOUGH.hit;
  play(h, A, "적 1명에게 공격력 10% 피해");
  check(he.broken && he.intent === null, `brk — 「${ch.say}」 를 격파로 끊는다`);
  C.endTurn(h);
  check(he.intent !== ch.next && hero(h, A).hp === 9999 && h.party.every((u) => u.hp === u.maxHp), "끊긴 큰 수는 다음 턴에 오지 않는다");
  const n = mk({ foes: ["droneg_sentry"] }), ne = n.enemies[0];
  const ch2 = ENEMIES.droneg_sentry.intents.find((x) => x.t === "charge");
  ne.intent = ch2; ne.tough = R.TOUGH.hit; ne.block = 0;
  play(n, A, "적 1명에게 공격력 10% 피해");
  check(ne.broken && ne.intent === ch2, `brk 없는 모으기(「${ch2.say}」)는 격파로 안 끊긴다 — 기절 · 봉인`);
  // 패시브 — 격파되면(broken) · 격파에서 일어서면(recover)
  const m = mk({ foes: ["marshmallowtanker"] }), me = m.enemies[0];
  me.tough = R.TOUGH.hit;
  play(m, A, "적 1명에게 공격력 10% 피해");
  check(me.broken && st(me, "취약") === 2, `격파되면 — 탱탱 멜로 「푹 꺼진다」 취약 ${st(me, "취약")}`);
  const r = mk({ foes: ["elfsoldiercloserange_honor"] }), re = r.enemies[0];
  re.tough = R.TOUGH.hit;
  play(r, A, "적 1명에게 공격력 10% 피해");
  check(re.broken && !st(re, "사기"), "의장대 격파 — 아직 사기 없음");
  C.endTurn(r);
  check(!re.broken && st(re, "사기") === 1, `격파에서 일어서면 — 「의장대의 체면」 사기 ${st(re, "사기")}`);
  // 상태 카드 — 새로 넣은 볼제나 카드도 장부에 있고 글을 다 읽는다(위 「상태 카드 · 저주」 가 하나하나 본다). 쓰는 적이 있다
  const used = new Set(Object.values(ENEMIES).flatMap((d2) => moves(d2).filter((it) => it.t === "addCard").map((it) => it.id)));
  const idle = Object.keys(STATUS_CARDS).filter((ko) => !used.has(ko));
  check(!idle.length, `상태 카드 ${Object.keys(STATUS_CARDS).length}장 모두 쓰는 적이 있다${idle.length ? " — 안 쓰임: " + idle.join(" · ") : ""}`);
}

console.log("");
console.log("v6 적 — 파티 충격(방어 위로 맞으면 더 아프다) · 판마다 도는 패시브(phase)");
{
  // 충격(파티) — 적의 치는 수에 맞으면 고정 피해 80%(FOE_DOT × 층 피해 배율 바탕), 방어 · 실드가 받아 냈으면 +50%. 방어를 뚫는다. 수 하나에 1
  const hit = (shock, block, it = { t: "attack", v: 50, say: "시험 — 친다", rush: 0 }) => {
    const s = mk();
    if (shock) { s.pool.status.충격 = shock; s.pool.dotU = { 충격: R.FOE_DOT * 2 }; }
    s.pool.block = block;
    s.enemies[0].intent = it;
    const h0 = s.pool.hp; C.endTurn(s);
    return { lost: h0 - s.pool.hp, left: st(s.pool, "충격"), s };
  };
  const base = hit(0, 0), plain = hit(2, 0), guarded = hit(2, 9999);
  const one = Math.round(R.FOE_DOT * 2 * V.충격);
  check(plain.lost - base.lost === one && plain.left === 1, `충격 — 맞으면 고정 피해 ${plain.lost - base.lost}(FOE_DOT × 2 × ${V.충격 * 100}%), 1 준다`);
  check(guarded.lost === Math.round(R.FOE_DOT * 2 * V.충격 * (1 + V.충격Shield)) && guarded.left === 1, `충격 — 방어가 다 받아 내도 뚫고 +${V.충격Shield * 100}% (${guarded.lost})`);
  const multi = hit(2, 0, { t: "multi", v: 10, n: 3, say: "시험 — 연타", rush: 0 });
  check(multi.left === 1, `충격 — 연타 수 하나에 한 번만 (남은 ${multi.left})`);
  // 적이 거는 충격 — 드론의 방전 사격(attackAll id 충격)이 파티에 충격을 건다
  const dr = ENEMIES.drones.intents.find((x) => x.id === "충격");
  const z = mk(); z.enemies[0].dmgx = 2; z.enemies[0].intent = dr; C.endTurn(z);
  check(st(z.pool, "충격") === dr.n && z.pool.dotU.충격 === R.FOE_DOT * 2, `드론 S형 「${dr.say}」 — 파티 충격 ${st(z.pool, "충격")}, 바탕 ${z.pool.dotU.충격}`);
  // 판마다 도는 패시브 — 커버러스: 앞판의 「셋째 머리」(세 장째 공격)는 둘째 판에서 안 돌고, 둘째 판의 「깨어난 머리」(턴 끝 사기)는 앞판에서 안 돈다
  const third = (phased) => {
    const s = mk({ foes: ["curburus"] }), e = s.enemies[0]; e.phased = phased; e.tough = e.toughMax = 99;
    for (let i = 0; i < 3; i++) play(s, A, "적 1명에게 공격력 10% 피해");
    return s.log.some((l) => l.includes("셋째 머리"));
  };
  check(third(false) && !third(true), "커버러스 「셋째 머리」 — 앞판에서만 돈다");
  const wake = (phased) => { const s = mk({ foes: ["curburus"] }), e = s.enemies[0]; e.phased = phased; C.endTurn(s); return st(e, "사기"); };
  check(wake(false) === 0 && wake(true) === 1, `커버러스 「깨어난 머리」 — 둘째 판에서만 턴 끝 사기 (앞판 ${wake(false)} · 둘째 판 ${wake(true)})`);
  // 스킬 감시 — 햇팽이 마녀 둘째 판: 한 턴 두 장째 스킬마다 파티 균열 2
  const w = mk({ foes: ["hatsnailwitch"] }); w.enemies[0].phased = true;
  play(w, A, "방어력 100% 방어", { type: "스킬", target: "없음" }); play(w, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(st(w.pool, "균열") === 2, `햇팽이 마녀 「마녀의 낙인」 — 스킬 두 장째에 파티 균열 ${st(w.pool, "균열")}`);
}

console.log("");
console.log("스마트 봇 — 새 수를 셈한다");
{
  const bot = makeBots({ C, B, R, ENEMIES });
  // 신속 — 적이 한 장만 더 보면 당겨 치는 참. 신속 카드로 길을 열고 다음 카드로 쓰러뜨리면 맞지 않는다(봇의 두 수 읽기가 보는 차이)
  const s = mk();
  const e = s.enemies[0];
  e.hp = 30; e.intent = { t: "attack", v: 60, say: "시험 — 크게 친다", rush: 3 }; e.rushCnt = 2;
  for (const u of s.party) u.hp = u.maxHp = 200;
  const fast = card(s, A, "신속. 방어력 100% 방어", { type: "스킬", target: "없음" }), slow = card(s, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  const kill = card(s, A, "적 1명에게 공격력 900% 피해");
  const line = (first) => { const sh = bot.clone(s); sh.book = s.book; C.playCard(sh, sh.hand.indexOf(first), 0); C.playCard(sh, sh.hand.indexOf(kill), 0); return bot.score(sh, false); };
  check(line(fast) > line(slow), `신속 — 당겨지기 직전엔 신속으로 셈을 넘기고 쓰러뜨린다 (${line(fast).toFixed(0)} > ${line(slow).toFixed(0)})`);
  // 버프 · 디버프 — 사기 · 불굴 · 취약을 값으로 친다
  const a = mk(), b = mk();
  hero(b, A).status.사기 = 2; b.enemies[0].status.취약 = 2;
  check(bot.score(b, false) > bot.score(a, false), "사기 · 취약은 판 점수를 올린다");
  // 연계 — 손에 들고 있으면 공짜로 나갈 몫이 남은 수의 값에 든다
  const c = mk(), d = mk();
  card(d, Bh, "연계. 적 1명에게 공격력 100% 피해");
  c.ap = d.ap = 0;
  check(bot.score(d, true) > bot.score(c, true), "연계 카드를 쥐고 있으면 AP 가 없어도 값이 남는다");
  // 상태 카드 — 턴 끝에 아픈 카드를 쥐고 있으면 점수가 깎인다
  const x = mk(), y = mk(); y.hand.push(STATUS_CARD_ID["모자 속 쪽지"]);
  check(bot.score(y, false) < bot.score(x, false), "「모자 속 쪽지」 를 쥐고 넘기면 손해로 본다");
}

console.log("");
console.log("치명 키워드 — 치명타가 터졌을 때만 1 준다(「은총」 · 2026-10 사용자)");
{
  const atk = Object.keys(CARDS).find((k) => CARDS[k].hero === "티그" && CARDS[k].type === "공격");
  for (const [crit, want] of [[0, 3], [100, 2]]) {
    const s = C.newCombat({ partyKeys: ["비비_신성", "티그", "네르"], deck: [atk], enemyIds: ["buseuleogi"], seed: 5 });
    for (const u of s.party) u.crit = crit;
    s.enemies[0].hp = s.enemies[0].maxHp = 99999;
    s.pool.status["은총"] = 3; s.hand = [atk]; s.ap = 9;
    C.playCard(s, 0, 0);
    check((s.pool.status["은총"] || 0) === want, `치명 ${crit}% 로 공격 — 은총 3 → ${s.pool.status["은총"] || 0}(기대 ${want})`);
  }
}

console.log("은총으로 얻은 카드의 「그 턴 비용 0」 은 그 한 장만(2026-10 사용자: 시온 「진혼의 탄환」)");
{
  const id = "시온더다크불릿_u3";
  const s = C.newCombat({ partyKeys: ["시온더다크불릿", "티그", "네르"], deck: [], enemyIds: ["buseuleogi"], seed: 5 });
  s.enemies[0].hp = s.enemies[0].maxHp = 99999;
  s.hand = [id]; s.freeTurn = { [id]: 1 }; s.ap = 5;
  s.hand.push(id);                                   // 패시브가 같은 카드를 한 장 더 넣었다
  check(C.costOf(s, id, 0) === 0 && C.costOf(s, id, 1) === CARDS[id].cost, `은총 카드만 0, 새로 들어온 같은 카드는 ${CARDS[id].cost} (${C.costOf(s, id, 0)} · ${C.costOf(s, id, 1)})`);
  C.playCard(s, 0, 0);
  check(s.ap === 5 && !s.freeTurn[id], `은총 카드를 내면 AP 그대로(${s.ap}) · 공짜가 끝난다`);
  const i = s.hand.indexOf(id);
  check(i >= 0 && C.costOf(s, id, i) === CARDS[id].cost, "남은 같은 카드는 제 비용");
}

console.log("만든 카드는 맨 카드 — 덱의 같은 카드에 붙은 신탁을 따라가지 않는다(2026-10 사용자: 시온 「마탄」 → 「진혼의 탄환」)");
{
  const id = "시온더다크불릿_u3";
  const atk = Object.keys(CARDS).find((k) => CARDS[k].hero === "시온더다크불릿" && CARDS[k].type === "공격" && k !== id);
  const s = C.newCombat({ partyKeys: ["시온더다크불릿", "티그", "네르"], deck: [atk], enemyIds: ["buseuleogi"], seed: 5, flash: { [id]: 1 } });
  s.enemies[0].hp = s.enemies[0].maxHp = 99999;
  s.stacks = { 시온더다크불릿: { 마탄: 4 } }; s.hand = [atk]; s.ap = 9;
  C.playCard(s, 0, 0);
  const made = [...s.hand, ...s.discard].find((x) => x.startsWith(id));
  check(!!made && made !== id, `「마탄」 5 — 「진혼의 탄환」 이 맨 카드로 들어온다 (${made})`);
  check(made && C.cardOf(s, made).text === CARDS[id].text && C.cardOf(s, id).text !== CARDS[id].text, "만든 카드는 원래 글, 덱의 카드는 신탁 글");
  check(!Object.keys(CARDS).some((k) => k.endsWith("~")), "맨 카드는 카드 목록(보상 · 상점 · 도감)에 안 나온다");
}

console.log("키워드가 최대를 넘게 한 번에 쌓이면 그만큼 터진다 · AP 한 턴 한 번 제한 없음(2026-10 사용자: 우이 「개굴비」)");
{
  const RF = await import("../js/run-fx.js");
  const s = C.newCombat({ partyKeys: ["우이", "티그", "네르"], deck: [], enemyIds: ["buseuleogi"], seed: 3 });
  s.enemies[0].hp = s.enemies[0].maxHp = 99999;
  s.ap = 0;
  const owner = s.party.find((u) => u.key === "우이");
  const api = C.fxApiFor(s);
  {
    RF.runFx(s, [{ k: "stack", id: "개굴비", v: 6, target: "auto" }], { owner, targetIdx: 0 }, api);
    check(s.ap === 2, `「개굴비」 +6 (최대 3) — 두 번 터져 AP +2 (${s.ap})`);
  }
}

console.log("강화 카드는 「소멸」 없이도 내면 사라진다 · 신탁 글에 「소멸」 · 「소멸 N」 을 적지 않는다(카제나 강화 카드처럼 — 2026-10 사용자)");
{
  const id = "중립_자기계발";
  const mk = (n) => { const s = C.newCombat({ partyKeys: ["우이", "티그", "네르"], deck: [], enemyIds: ["buseuleogi"], seed: 3, flash: n ? { [id]: n } : {} }); s.enemies[0].hp = s.enemies[0].maxHp = 99999; s.hand = [id]; s.ap = 9; return s; };
  for (const n of [0, 2, 3]) { const s = mk(n); C.playCard(s, 0, 0); check(s.gone.includes(id), `신탁 ${n || "없음"} — 내면 사라진다`); }
  check(!Object.values(CARDS).some((c) => c.type === "강화" && (c.flash || []).some((f) => /소멸/.test(f.text || ""))), "강화 카드 신탁 글에 「소멸」 · 「소멸 N」 이 없다");
}

console.log(bad ? `실패 ${bad}개` : "카제나 전투 체계가 규칙대로 돈다");
process.exit(bad ? 1 : 0);
