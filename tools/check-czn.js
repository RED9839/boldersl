// 카제나 전투 체계 둘째 단계(docs/16-카제나전투.md) — 상태(겹 규칙) · 카드 키워드 · 처치 AP · 상태 카드 · 유일 · 약점 다시 고르기.
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
import { parsePassive } from "../js/passive.js";
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

console.log("");
console.log("글 읽기 — 상태 문법");
{
  const want = [
    ["사기 2", "status:사기:2:self"], ["아군 전원 불굴 2", "status:불굴:2:allAllies"], ["적 1명 취약 2", "status:취약:2:oneEnemy"],
    ["자신 사기 1", "status:사기:1:self"], ["적 1명 고통 3", "status:고통:3:oneEnemy"], ["아군 1명 반격 2", "status:반격:2:oneAlly"],
    ["적 전체 손상 1", "status:손상:1:allEnemies"], ["결의 2", "status:결의:2:self"], ["결정화 3", "status:결정화:3:self"], ["적 1명 표식 2", "status:표식:2:oneEnemy"],
    ["적 1명에게 공격력 100% 피해, 자신 약화 1", "dmg · status:약화:1:self"],
  ];
  for (const [t, w] of want) {
    const { fx, left } = parseEffect(t);
    const got = fx.map((f) => (f.k === "status" ? `status:${f.id}:${f.turns}:${f.target}` : f.k)).join(" · ");
    check(!left && got === w, `「${t}」 → ${got}${left ? ` (못 읽음 ${left})` : ""}`);
  }
  const kw = [["연계. 적 1명에게 공격력 50% 피해", "tag:연계"], ["천상. 드로우 1", "tag:천상"], ["신속. 드로우 1", "tag:신속"], ["증발. 드로우 1", "tag:증발"],
    ["유일. 드로우 1", "tag:유일"], ["잔광. 적 1명에게 공격력 50% 피해", "tag:잔광"], ["사용 불가. 증발.", "tag:사용불가"],
    ["드로우 1. 연속: AP +1", "ifChain"], ["드로우 1. 감응: AP +1", "when:draw"], ["소멸. 턴 끝에 손에 있으면: 아군 전원 HP 2 소모", "when:handEnd"]];
  for (const [t, w] of kw) {
    const { fx, left } = parseEffect(t);
    const got = fx.map((f) => (f.k === "tag" ? `tag:${f.id}` : f.k === "when" ? `when:${f.on}` : f.k));
    check(!left && got.includes(w), `「${t}」 → ${got.join(" · ")}`);
  }
  check(!parseEffect("사기진작").fx.length && !parseEffect("적 전체에 「늑대 표식」 +2").fx.some((f) => f.k === "status"), "낱말 속 · 사도 표식은 상태가 아니다(사기진작 · 「늑대 표식」)");
}

console.log("");
console.log("겹 — 더해지고, 한 번의 일에 1 씩 준다");
{
  const s = mk();
  play(s, A, "자신 사기 2", { type: "스킬", target: "없음" });
  play(s, A, "자신 사기 1", { type: "스킬", target: "없음" });
  check(st(hero(s, A), "사기") === 3, `사기 2 + 사기 1 = ${st(hero(s, A), "사기")} (중첩)`);
  C.endTurn(s);
  check(st(hero(s, A), "사기") === 3, "턴이 지나도 안 준다");
}

console.log("");
console.log("취약 · 약화 · 사기 · 불굴 — 수치와 줄어드는 때");
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
  // 사기 — 피해 카드 한 장에 1, 피해 없는 카드는 안 쓴다
  const c = mk(), d = mk();
  hero(d, A).status.사기 = 2;
  const dc = lost(c.enemies[0], () => play(c, A, "적 1명에게 공격력 300% 피해"));
  play(d, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(st(hero(d, A), "사기") === 2, "사기 — 피해 없는 카드는 겹을 안 쓴다");
  const dd = lost(d.enemies[0], () => play(d, A, "적 1명에게 공격력 300% 피해"));
  check(Math.abs(dd - dc * (1 + V.사기)) <= 1 && st(hero(d, A), "사기") === 1, `사기 — 주는 피해 +${V.사기 * 100}% (${dc} → ${dd}), 1 준다`);
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
  // 불굴 — 받는 피해 -20%, 적의 수 하나에 1
  const h = mk(), k = mk();
  for (const x of [h, k]) { x.enemies[0].intent = { t: "attack", v: 50, say: "시험 — 친다", rush: 0 }; x.taunt = A; x.tauntLeft = 9; }
  hero(k, A).status.불굴 = 2;
  const hh = hero(h, A).hp, hk = hero(k, A).hp;
  C.endTurn(h); C.endTurn(k);
  const lh = hh - hero(h, A).hp, lk = hk - hero(k, A).hp;
  check(Math.abs(lk - lh * (1 - V.불굴)) <= 1 && st(hero(k, A), "불굴") === 1, `불굴 — 받는 피해 -${V.불굴 * 100}% (${lh} → ${lk}), 1 준다`);
  // 취약(사도) — 적이 건 것도 같은 규칙
  const m = mk(); m.enemies[0].intent = { t: "attack", v: 50, say: "시험", rush: 0 }; m.taunt = A; m.tauntLeft = 9;
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
  const t = mk(), w = hero(t, A);
  w.status.결의 = 2; w.status.결정화 = 3;
  const sh0 = w.shield || 0;
  C.endTurn(t);
  const want = Math.round(w.def * V.결의) + Math.round(w.def * V.결정화 * 3);
  check((w.shield || 0) - sh0 === want && st(w, "결의") === 1 && st(w, "결정화") === 3, `결의 ${V.결의 * 100}% · 결정화 3겹 ${V.결정화 * 100}%씩 — 턴 끝 실드 +${(w.shield || 0) - sh0} (결의 1 남음 · 결정화 그대로)`);
  const p = mk(), e = p.enemies[0];
  e.status.고통 = 7;
  const h0 = e.hp;
  C.endTurn(p);
  check(h0 - e.hp === 7 && st(e, "고통") === 3, `고통 7 — 턴 끝 고정 피해 ${h0 - e.hp}, 겹 절반(${st(e, "고통")})`);
  e.block = 100; const h1 = e.hp; C.endTurn(p);
  check(h1 - e.hp === 3 && e.block >= 0, "고통은 방어 · 실드를 뚫는다");
  const q = mk(); play(q, A, "적 1명 고통 30", { type: "스킬" });
  check(st(q.enemies[0], "고통") === V.고통Max, `고통은 최대 ${V.고통Max}`);
  // 반격 — 적의 수 하나에 한 번(연타라도), 방어력 150%
  const r = mk(), ru = hero(r, A);
  r.taunt = A; r.tauntLeft = 9; ru.status.반격 = 2;
  r.enemies[0].intent = { t: "multi", v: 5, n: 3, say: "시험 — 연타", rush: 0 };
  const eh = r.enemies[0].hp;
  C.endTurn(r);
  check(eh - r.enemies[0].hp === Math.round(ru.def * V.반격) && st(ru, "반격") === 1, `반격 — 연타 수 하나에 한 번 방어력 ${V.반격 * 100}% (${eh - r.enemies[0].hp}), 1 준다`);
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
console.log("잔광 · 처치 AP · 격파 덤 없음");
{
  const a = mk(), e = a.enemies[0];
  play(a, A, "잔광. 적 1명에게 공격력 10% 피해");
  check(e.tough === e.toughMax - R.TOUGH.hit - R.TOUGH.glow, `잔광 — 강인도 ${R.TOUGH.hit + R.TOUGH.glow}칸 (${e.tough}/${e.toughMax})`);
  const b = mk(), c = mk();
  for (const x of [b, c]) { x.enemies[0].broken = true; x.enemies[0].tough = 0; }
  const db = lost(b.enemies[0], () => play(b, A, "적 1명에게 공격력 300% 피해"));
  const dc = lost(c.enemies[0], () => play(c, A, "잔광. 적 1명에게 공격력 300% 피해"));
  check(Math.abs(dc - db * (1 + V.잔광)) <= 1, `잔광 — 격파된 적에게 +${V.잔광 * 100}% (${db} → ${dc})`);
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
console.log("신속 · 연속 · 감응 · 증발");
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
  // 감응 — 뽑힐 때만
  const d = mk();
  const sense = card(d, A, "드로우 1. 감응: AP +2", { type: "스킬", target: "없음" }, "draw");
  const apd = d.ap;
  C.draw(d, 1);
  check(d.hand.includes(sense) && d.ap === apd + 2, `감응 — 뽑히자 AP +2 (${apd} → ${d.ap})`);
  const r = C.playCard(d, d.hand.indexOf(sense), 0);
  check(r.ok && d.ap === apd + 2 - 1, "감응 — 낼 때는 안 돈다");
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
  // 모자 속 쪽지 — 손에 든 채 넘기면 아군 전원 HP 3
  const u = mk(); const note = STATUS_CARD_ID["모자 속 쪽지"]; u.hand.push(note);
  const hp0 = u.party.map((x) => x.hp);
  C.endTurn(u);
  check(u.party.every((x, i) => hp0[i] - x.hp === 3), "「모자 속 쪽지」 — 턴 끝에 손에 있으면 아군 전원 HP -3");
  const w = mk(); w.hand.push(note); w.ap = 5;
  check(C.playCard(w, w.hand.indexOf(note), 0).ok && w.gone.includes(note), "AP 1 을 내면 치운다(소멸)");
  // 어지럼 — 뽑히면 AP -1
  const z = mk(); z.draw.push(STATUS_CARD_ID["어지럼"]); const apz = z.ap; C.draw(z, 1);
  check(z.ap === apz - 1, `「어지럼」 — 뽑히자 AP -1 (${apz} → ${z.ap})`);
  // 판의 덱에는 안 들어간다 — 싸움이 끝나도
  const run = { deck: ["a", "b"], flash: {}, shin: {}, hp: {}, maxHp: {}, spent: [], gauge: 0 };
  const deck0 = run.deck.slice();
  s.gained = { cards: [], flash: [], spent: [], boons: [] };
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
console.log("능력치 상태 — 열의 · 강건 · 집중 · 온정(옛 공격력 · 방어력 · 치명 · 회복력 +N%)");
{
  check(V.열의 === 0.2 && V.강건 === 0.2 && V.집중 === 0.2 && V.온정 === 0.2, "열의 공격력 +20% · 강건 방어력 +20% · 집중 치명 +20%p · 온정 회복력 +20%");
  for (const [t, w] of [["자신 열의 2", "열의:2:self"], ["아군 전원 강건 1", "강건:1:allAllies"], ["아군 1명 집중 2", "집중:2:oneAlly"], ["HP 최저 아군 온정 1", "온정:1:lowAlly"]]) {
    const { fx, left } = parseEffect(t); const f = fx[0] || {};
    check(!left && `${f.id}:${f.turns}:${f.target}` === w, `「${t}」 → ${f.id} ${f.turns} (${f.target})`);
  }
  check(!parseEffect("집중포화").fx.length && !parseEffect("모든 열의 영웅").fx.length, "낱말 속은 상태가 아니다(집중포화 · 모든 열의)");
  // 열의 — 피해 카드 한 장(여러 번 쳐도)에 1, 그 장의 모든 타격이 덕을 본다
  const a = mk(), b = mk();
  hero(b, A).status.열의 = 2;
  const da = lost(a.enemies[0], () => play(a, A, "적 1명에게 3회 × 공격력 100% 피해"));
  const db = lost(b.enemies[0], () => play(b, A, "적 1명에게 3회 × 공격력 100% 피해"));
  const atk0 = hero(a, A).atk, atk1 = Math.round(atk0 * (1 + V.열의));
  check(db === Math.round(da / atk0 * atk1) || Math.abs(db - da * atk1 / atk0) <= 3, `열의 — 공격력 +${V.열의 * 100}% (${da} → ${db})`);
  check(st(hero(b, A), "열의") === 1, "세 번 치는 카드 한 장에 열의 1 만 준다");
  play(b, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(st(hero(b, A), "열의") === 1, "피해 · 회복 없는 카드는 열의를 안 쓴다");
  // 강건 — 방어 카드에 1, 방어력 +20%
  const c = mk(), u = hero(c, A); u.status.강건 = 1;
  play(c, A, "방어력 100% 방어", { type: "스킬", target: "없음" });
  check(u.block === Math.round(u.def * (1 + V.강건)) && st(u, "강건") === 0, `강건 — 방어 ${u.block} (방어력 ${u.def} +${V.강건 * 100}%), 1 준다`);
  // 집중 — 치명 확률 +20%p(statMod)
  const d = mk(), w = hero(d, A); w.status.집중 = 1;
  check(Math.abs(C.statOf(d, w, "crit") - V.집중) < 1e-9, `집중 — 치명 확률 +${V.집중 * 100}%p`);
  play(d, A, "적 1명에게 공격력 10% 피해");
  check(st(w, "집중") === 0, "피해 카드 한 장에 집중 1 준다");
  // 온정 — 회복 카드에 1(열의도 같이 쓴다)
  const e = mk(), x = hero(e, A); x.status.온정 = 1; x.hp = 100;
  play(e, A, "자신 HP 회복(회복력 100%)", { type: "스킬", target: "없음" });
  const want = Math.round(R.healStat(x.atk, x.role, x.healPlus) * (1 + V.온정));
  check(x.hp - 100 === want && st(x, "온정") === 0, `온정 — 회복 ${x.hp - 100} (회복력 +${V.온정 * 100}%), 1 준다`);
  // 저장
  const f = mk(); Object.assign(hero(f, A).status, { 열의: 2, 강건: 1, 집중: 3, 온정: 1 }); f.book = {};
  const back = unpackCombat(packCombat(f));
  check(JSON.stringify(back.party.find((y) => y.key === A).status) === JSON.stringify(hero(f, A).status), "저장했다 이어도 능력치 상태가 그대로");
  // 기획서에 옛 능력치 증감이 「판 내내」 · 「1개당」 · 「항상」 밖에 안 남았다(장비 · 교주의 작은 증감 몇 곳 빼고)
  const left = [];
  for (const c2 of Object.values(B.cards)) for (const t2 of [c2.text, ...(c2.flash || []).map((y) => y.text)])
    for (const cl of t2.split(/[,.]/)) if (/(공격력|방어력|치명 확률|회복력|주는 피해|받는 피해)\s*[+\-]\s*\d+\s*%/.test(cl) && !/판 내내|개당|항상/.test(cl)) left.push(cl.trim());
  check(left.length === 0, `사도 카드 · 신탁에 옛 % 증감이 없다 (${left.length}${left.length ? " — " + left.slice(0, 3).join(" | ") : ""})`);
}

console.log("");
console.log("docs/16 베껴 쓰는 줄 — 엔진이 모두 읽는다");
{
  const fs = await import("node:fs");
  const t = fs.readFileSync(new URL("../docs/16-카제나전투.md", import.meta.url), "utf8");
  const sec = t.slice(t.indexOf("## 6."), t.indexOf("## 7."));
  // 블록 첫 줄이 「패시브」 면 패시브 문법(js/passive.js — 「적을 격파하면」 · 「자신 사기가 N 이상이면」), 아니면 카드 글
  const blocks = sec.split("```").filter((_, i) => i % 2).map((b) => b.split(/\r?\n/));
  const lines = blocks.filter((b) => b[0].trim() !== "패시브").flatMap((b) => b.filter(Boolean));
  const pas = blocks.filter((b) => b[0].trim() === "패시브").flatMap((b) => b.slice(1).filter(Boolean));
  const bad = lines.filter((l) => { const r = parseEffect(l); return r.left || !r.fx.length; });
  check(lines.length >= 50 && !bad.length, `${lines.length}줄 모두 읽힌다${bad.length ? " — 못 읽음: " + bad.join(" | ") : ""}`);
  const badP = pas.filter((l) => { const rs = parsePassive(l); return !rs.length || rs.some((r) => r.left || !r.fx.length || r.when.on === "always" || !r.when.on); });
  check(pas.length >= 4 && !badP.length, `패시브 ${pas.length}줄 모두 읽힌다${badP.length ? " — 못 읽음: " + badP.join(" | ") : ""}`);
  const pct = lines.filter((l) => /(주는 피해|받는 피해|공격력|방어력|치명 확률|회복력)\s*[+\-]\s*\d+\s*%/.test(l) && !/판 내내/.test(l));
  check(!pct.length, `% 증감은 「판 내내」 밖에 없다${pct.length ? " — " + pct.join(" | ") : ""}`);
}

console.log("");
console.log("적의 새 수 — 깃발 · 강인도 되찾기 · 강건/손상 · 한 대마다 상태 · 고통 눈금 · 격파로 끊기 · 격파/일어섬 패시브(v5 적)");
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
  // 적이 얻는 방어 — 강건 +20% · 손상 -50%, 한 번에 1 준다
  const c = mk({ foes: [FOE, FOE, FOE] });
  c.enemies[1].status.강건 = 1; c.enemies[2].status.손상 = 1;
  pull(c, c.enemies[0], { t: "guard", v: 10, say: "시험 — 벽", rush: 3 });
  check(c.enemies.map((e) => e.block).join(",") === `10,${Math.round(10 * (1 + V.강건))},${Math.round(10 * (1 - V.손상))}` && !st(c.enemies[1], "강건") && !st(c.enemies[2], "손상"),
    `적 방어 — 그대로 · 강건 · 손상 (${c.enemies.map((e) => e.block).join(" · ")})`);
  // 연타 id — 한 대마다 상태 1, 고통은 층 피해 배율을 곱한다
  const d = mk(); d.enemies[0].dmgx = 2; d.taunt = A; d.tauntLeft = 9;
  pull(d, d.enemies[0], { t: "multi", v: 1, n: 3, id: "고통", say: "시험 — 긁기", rush: 3 });
  check(st(hero(d, A), "고통") === 6, `연타 고통 — 세 대 × 1 × 층 피해 배율 2 = ${st(hero(d, A), "고통")}`);
  const g = mk();
  pull(g, g.enemies[0], { t: "attackAll", v: 1, id: "손상", n: 2, say: "시험 — 전체", rush: 3 });
  check(g.party.every((u) => st(u, "손상") === 2), `전체 공격 id — 맞은 사람마다 손상 2 (${g.party.map((u) => st(u, "손상")).join(" · ")})`);
  const g2 = mk(); g2.enemies[0].dmgx = 3;
  pull(g2, g2.enemies[0], { t: "debuff", id: "고통", v: 2, say: "시험 — 저주", rush: 3 });
  check(g2.party.every((u) => st(u, "고통") === 6), `디버프 고통 2 × 층 피해 배율 3 = ${st(g2.party[0], "고통")} (다른 상태는 그대로)`);
  // 격파로 끊기 — brk 가 붙은 모으기는 그 턴에 격파하면 흩어지고, 안 붙은 것은 그대로
  const h = mk({ foes: ["nururingwarrior_fairy"] }), he = h.enemies[0];
  const ch = ENEMIES.nururingwarrior_fairy.intents.find((x) => x.t === "charge");
  he.intent = ch; he.tough = 1;
  play(h, A, "적 1명에게 공격력 10% 피해");
  check(he.broken && he.intent === null, `brk — 「${ch.say}」 를 격파로 끊는다`);
  C.endTurn(h);
  check(he.intent !== ch.next && hero(h, A).hp === 9999 && h.party.every((u) => u.hp === u.maxHp), "끊긴 큰 수는 다음 턴에 오지 않는다");
  const n = mk({ foes: ["droneg_sentry"] }), ne = n.enemies[0];
  const ch2 = ENEMIES.droneg_sentry.intents.find((x) => x.t === "charge");
  ne.intent = ch2; ne.tough = 1; ne.block = 0;
  play(n, A, "적 1명에게 공격력 10% 피해");
  check(ne.broken && ne.intent === ch2, `brk 없는 모으기(「${ch2.say}」)는 격파로 안 끊긴다 — 기절 · 봉인`);
  // 패시브 — 격파되면(broken) · 격파에서 일어서면(recover)
  const m = mk({ foes: ["marshmallowtanker"] }), me = m.enemies[0];
  me.tough = 1;
  play(m, A, "적 1명에게 공격력 10% 피해");
  check(me.broken && st(me, "취약") === 2, `격파되면 — 탱탱 멜로 「푹 꺼진다」 취약 ${st(me, "취약")}`);
  const r = mk({ foes: ["elfsoldiercloserange_honor"] }), re = r.enemies[0];
  re.tough = 1;
  play(r, A, "적 1명에게 공격력 10% 피해");
  check(re.broken && !st(re, "사기"), "의장대 격파 — 아직 사기 없음");
  C.endTurn(r);
  check(!re.broken && st(re, "사기") === 2, `격파에서 일어서면 — 「의장대의 체면」 사기 ${st(re, "사기")}`);
  // 상태 카드 — 새로 넣은 볼제나 카드도 장부에 있고 글을 다 읽는다(위 「상태 카드 · 저주」 가 하나하나 본다). 쓰는 적이 있다
  const used = new Set(Object.values(ENEMIES).flatMap((d2) => moves(d2).filter((it) => it.t === "addCard").map((it) => it.id)));
  const idle = Object.keys(STATUS_CARDS).filter((ko) => !used.has(ko));
  check(!idle.length, `상태 카드 ${Object.keys(STATUS_CARDS).length}장 모두 쓰는 적이 있다${idle.length ? " — 안 쓰임: " + idle.join(" · ") : ""}`);
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

console.log(bad ? `실패 ${bad}개` : "카제나 전투 체계가 규칙대로 돈다");
process.exit(bad ? 1 : 0);
