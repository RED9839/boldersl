// 한 판을 처음부터 끝까지(지도 · 이벤트 · 캠프 · 상점 · 장비 · 3층 + 마지막 싸움) 봇에게 맡겨 완주율을 잰다.
// 손은 tools/lib/bot.js(전투) · tools/lib/run-bot.js(전투 밖). 옛 손(simple)과 사람만큼 하는 손(smart)을 같은 씨앗으로 견준다.
//   node tools/run-sim.js                          편성 열 가지 × 파티 6 × 판 3 — 두 손 견주기
//   node tools/run-sim.js --bot smart --parties 10 --runs 4
//   node tools/run-sim.js --heroes 에르핀,네르,티그  그 사도가 든 파티만(사도마다 --parties 개)
//   node tools/run-sim.js --hp 1.2 --dmg 1.15      적 체력 · 피해를 rules.js 의 층마다 값(foeScale) 위에 더 곱해 잰다(rules.js 는 그대로)
//   node tools/run-sim.js --log 에르핀 [--turns 3]  그 사도가 든 파티의 첫 싸움(--boss 면 1층 보스) 기록을 풀어 보인다
//   --depth 2  한 수 더 내다본다(느리다)  · --jobs N 작업 스레드(기본 2) · --json
//   --seed K   파티 · 판 씨앗을 다른 벌로(기본 0) — 고른 값이 우연이 아닌지 두 번째 벌로 다시 잰다
// 결과는 스레드 수와 상관없이 같다(씨앗이 정해져 있다).
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import * as C from "../js/combat.js";
import * as B from "../js/cardbook.js";
import * as R from "../js/run.js";
import * as RULES from "../js/rules.js";
import * as M from "../js/map.js";
import * as EV from "../js/events.js";
import { ENEMIES, FLOORS } from "../js/data/enemies.js";
import { makeBots } from "./lib/bot.js";
import { makeRunner } from "./lib/run-bot.js";
// 오래 돈다 — 낮은 우선순위로 돌아 컴퓨터를 막지 않게
try { os.setPriority(19); } catch {}

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
const BOTS = (opt("bot", "simple,smart")).split(",");
const P = +opt("parties", 6), N = +opt("runs", 3), DEPTH = +opt("depth", 1);
const HPX = +opt("hp", 1);       // 「1.2」 = 지금 값(rules.js foeScale)의 1.2배
const DMGX = +opt("dmg", 1);     // 적의 치는 수 — 같은 자리(e.dmgx)에 더 곱한다. 즉시 행동 장수는 그대로
const SEED = +opt("seed", 0);
const HEROES = opt("heroes") ? opt("heroes").split(",") : null;

const bots = makeBots({ C, B, R: RULES, ENEMIES });
const runner = makeRunner({ C, B, R, RULES, M, EV, ENEMIES, FLOORS, bots });
const CFG = {
  simple: { smartFight: false, smartOut: false },
  smart: { smartFight: true, smartOut: true, depth: DEPTH },
  smartfight: { smartFight: true, smartOut: false, depth: DEPTH },   // 전투만 사람 손 — 어느 쪽이 얼마나 보태는지 가를 때
};

const LETTER = { 탱커: "T", 서포터: "S", 딜러: "D" };
const heroes = Object.keys(B.HERO_DATA).filter((k) => C.buildDeck([k]).length);
const POOL = { T: [], S: [], D: [] };
for (const k of heroes) { const l = LETTER[B.HERO_DATA[k].role]; if (l) POOL[l].push(k); }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ALL = ["TTT", "TTS", "TTD", "TSS", "TSD", "TDD", "SSS", "SSD", "SDD", "DDD"];
const compOf = (party) => party.map((k) => LETTER[B.HERO_DATA[k].role]).sort((a, b) => "TSD".indexOf(a) - "TSD".indexOf(b)).join("");
function parties() {
  const out = [];
  if (HEROES) {
    for (const h of HEROES) {
      const r = rng(777 + SEED * 1009 + [...h].reduce((a, c) => a + c.charCodeAt(0), 0));
      for (let i = 0; i < P; i++) { const p = [h]; while (p.length < 3) { const k = heroes[Math.floor(r() * heroes.length)]; if (!p.includes(k)) p.push(k); } out.push({ party: p, tag: h }); }
    }
    return out;
  }
  for (const comp of ALL) {
    const r = rng(4242 + SEED * 1009 + comp.charCodeAt(0) * 7 + comp.charCodeAt(1) * 13 + comp.charCodeAt(2));
    for (let i = 0; i < P; i++) { const p = []; for (const l of comp) { let k; do k = POOL[l][Math.floor(r() * POOL[l].length)]; while (p.includes(k)); p.push(k); } out.push({ party: p, tag: comp }); }
  }
  return out;
}

function job(j) {
  const t0 = Date.now();
  const r = runner.runFull(j.party, j.seed, { ...CFG[j.bot], hpx: HPX, dmgx: DMGX });
  return { ...r, ms: Date.now() - t0 };
}

// ── 기록 풀어 보기 ──────────────────────────────────────────────────────
if (isMainThread && opt("log")) {
  const who = opt("log"), TURNS = +opt("turns", 3);
  const k = heroes.find((x) => x === who) || heroes.find((x) => B.HERO_DATA[x].ko === who);
  const r0 = rng(99);
  const party = [k]; while (party.length < 3) { const x = heroes[Math.floor(r0() * heroes.length)]; if (!party.includes(x)) party.push(x); }
  const run = R.newRun(party, Object.fromEntries(party.map((x) => [x, B.HERO_DATA[x].row])), 12345);
  if (argv.includes("--boss")) { run.node = 3; }
  else { M.mapOf(run); M.enterNode(run, M.reachable(run)[0]); }
  const { st } = R.openFight(run, { hpx: HPX, dmgx: DMGX });
  const hp = (u) => `${u.ko} ${u.hp}/${u.maxHp}${u.block ? ` 방${u.block}` : ""}${u.shield ? ` 실${u.shield}` : ""}`;
  const intent = (e) => { const it = e.intent || {}; const n = C.rushOf(e); return `${e.ko} ${e.hp}/${e.maxHp} [${it.say || it.t || "-"}${C.intentHit(e) != null ? ` ${C.intentHit(e)}${it.t === "multi" ? "×" + it.n : ""}` : ""}${n ? ` · 즉시 ${e.rushCnt || 0}/${n}` : ""}]`; };
  console.log(`편성: ${party.map((x) => B.HERO_DATA[x].ko).join(" · ")}  적: ${st.enemies.map((e) => e.ko).join(" · ")}`);
  let lastTurn = 0;
  const show = () => {
    if (st.turn !== lastTurn) {
      lastTurn = st.turn;
      const inc = bots.incoming(st);
      console.log(`\n── ${st.turn}턴 · AP ${st.ap} · 게이지 ${st.gauge}% · 손 ${st.hand.map((id) => C.cardOf(st, id).name).join(", ")}`);
      console.log(`   아군: ${st.party.map(hp).join(" · ")}`);
      console.log(`   적:   ${st.enemies.filter((e) => !e.dead).map(intent).join(" · ")}`);
      console.log(`   예상 피해(지금 그대로 넘기면): ${[...inc.pool].map(([u, p]) => `${u.ko} -${p.lost}`).join(" · ")}`);
    }
  };
  let t = 0;
  while (!st.over && t++ < TURNS) {
    show();
    bots.smartPlay(st, { depth: DEPTH, trace: (m, v, s0) => console.log(`   → ${m}   (점수 ${s0.toFixed(0)} → ${v.toFixed(0)})`) });
    const before = st.log.length;
    if (!st.over) C.endTurn(st);
    const enemyLines = st.log.slice(before).filter((l) => / → |\(|즉시|쓰러짐|주말농장/.test(l) && !/"/.test(l)).slice(0, 8);
    console.log(`   턴 끝 → ${enemyLines.join(" / ")}`);
  }
  console.log(`\n${st.over || "진행 중"} · ${st.turn}턴 · ${st.party.map(hp).join(" · ")}`);
  process.exit(0);
}

if (!isMainThread) {
  parentPort.on("message", (j) => parentPort.postMessage({ i: j.i, ...job(j) }));
} else {
  const ps = parties();
  const jobs = [];
  for (const bot of BOTS) for (let pi = 0; pi < ps.length; pi++) for (let n = 0; n < N; n++)
    jobs.push({ i: jobs.length, bot, pi, party: ps[pi].party, tag: ps[pi].tag, seed: 1000 + SEED * 104729 + pi * 37 + n * 7919 });
  const J = Math.max(1, Math.min(+opt("jobs", 2), jobs.length));
  const res = new Array(jobs.length);
  const t0 = Date.now();
  if (J === 1) jobs.forEach((j) => { res[j.i] = job(j); });
  else await new Promise((done, fail) => {
    let next = 0, left = jobs.length;
    for (let w = 0; w < J; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { argv });
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.terminate(); };
      wk.on("message", (m) => { res[m.i] = m; if (--left === 0) done(); feed(); });
      wk.on("error", fail);
      feed();
    }
  });
  const wall = (Date.now() - t0) / 1000;

  // ── 모으기 ──
  const out = { hpx: HPX, dmgx: DMGX, parties: ps.length, runs: N, bots: {} };
  for (const bot of BOTS) {
    const rs = jobs.filter((j) => j.bot === bot).map((j) => ({ ...res[j.i], tag: j.tag, comp: compOf(j.party) }));
    const n = rs.length, cl = rs.filter((r) => r.clear).length;
    const deaths = [0, 0, 0, 0];
    for (const r of rs) if (!r.clear) deaths[r.floor]++;
    const where = {};
    for (const r of rs) if (!r.clear) where[r.where] = (where[r.where] || 0) + 1;
    const fights = rs.reduce((a, r) => a + r.fights, 0), turns = rs.reduce((a, r) => a + r.turns, 0);
    const kinds = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.kinds || {})) { const a = (kinds[k] = kinds[k] || { n: 0, turns: 0, win: 0 }); a.n += v.n; a.turns += v.turns; a.win += v.win; }
    const byTag = {}, byComp = {};
    for (const r of rs) {
      (byTag[r.tag] = byTag[r.tag] || []).push(r.clear);
      (byComp[r.comp] = byComp[r.comp] || []).push(r.clear);
    }
    const pct = (a) => +(a.filter(Boolean).length / a.length * 100).toFixed(1);
    out.bots[bot] = {
      clear: +(cl / n * 100).toFixed(1), n,
      deathFloor: deaths.map((d) => +(d / n * 100).toFixed(1)),
      deathAt: where,
      turnsPerFight: +(turns / Math.max(1, fights)).toFixed(2),
      fightsPerRun: +(fights / n).toFixed(2),
      msPerRun: Math.round(rs.reduce((a, r) => a + r.ms, 0) / n),
      byTag: Object.fromEntries(Object.entries(byTag).map(([k, a]) => [k, pct(a)])),
      byComp: Object.fromEntries(Object.entries(byComp).map(([k, a]) => [k, pct(a)])),
      // 칸 갈래마다(「2:boss」 = 2층 보스 · F = 마지막) 싸운 수 · 싸움당 턴 · 이긴 비율
      kinds: Object.fromEntries(Object.entries(kinds).sort().map(([k, a]) => [k, { n: a.n, turns: +(a.turns / a.n).toFixed(2), win: +(a.win / a.n * 100).toFixed(1) }])),
    };
  }
  out.wall = +wall.toFixed(1);
  if (argv.includes("--json")) console.log(JSON.stringify(out));
  else {
    console.log(`판 ${ps.length}파티 × ${N}판${SEED ? ` · 씨앗 ${SEED}` : ""} · 적 체력 ×${out.hpx} · 피해 ×${DMGX} · ${wall.toFixed(0)}초`);
    for (const [bot, b] of Object.entries(out.bots)) {
      console.log(`\n[${bot}] 완주 ${b.clear}% (${b.n}판) · 판당 ${b.fightsPerRun}전 · 전투당 ${b.turnsPerFight}턴 · 판당 ${b.msPerRun}ms`);
      console.log(`  쓰러진 층  1층 ${b.deathFloor[0]}% · 2층 ${b.deathFloor[1]}% · 3층 ${b.deathFloor[2]}% · 마지막 ${b.deathFloor[3]}%   (칸: ${Object.entries(b.deathAt).map(([k, v]) => `${k} ${v}`).join(" · ")})`);
      console.log(`  칸  ${Object.entries(b.kinds).map(([k, a]) => `${k} ${a.turns}턴·${a.win}%(${a.n})`).join(" · ")}`);
      console.log(`  ${HEROES ? "사도" : "편성"}  ${Object.entries(b.byTag).map(([k, v]) => `${HEROES ? (B.HERO_DATA[k] || {}).ko || k : k} ${v}%`).join(" · ")}`);
      if (HEROES) console.log(`  역할  ${Object.entries(b.byComp).sort().map(([k, v]) => `${k} ${v}%`).join(" · ")}`);
    }
  }
}
