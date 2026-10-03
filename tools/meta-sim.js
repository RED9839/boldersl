// 메타 통계 — 사도별 · 역할별 · 편성별 · 같이 든 짝별 완주율(smart 봇, 판 전체). 평균 완주율 하나로는 편차가 안 보인다.
// 135명이 고르게 나오게 판을 짠다 — 한 바퀴마다 사도를 섞어 셋씩 묶는다(한 바퀴 45판, 사도마다 한 번).
//   node tools/meta-sim.js                 30바퀴(1350판, 사도마다 30판)
//   node tools/meta-sim.js --rounds 60     더 많이(좁은 오차)
//   --jobs N 작업 스레드(기본 2) · --seed K 다른 벌 · --hp · --dmg 적 배율(run-sim 과 같다) · --json 파일로
// 결과는 스레드 수와 상관없이 같다(씨앗이 정해져 있다).
import os from "node:os";
import fs from "node:fs";
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
const ROUNDS = +opt("rounds", 30), SEED = +opt("seed", 0);
const HPX = +opt("hp", 1), DMGX = +opt("dmg", 1);

const bots = makeBots({ C, B, R: RULES, ENEMIES });
const runner = makeRunner({ C, B, R, RULES, M, EV, ENEMIES, FLOORS, bots });
const HEROES = Object.keys(B.HERO_DATA);
const LETTER = { 탱커: "T", 서포터: "S", 딜러: "D" };
const roleOf = (k) => B.HERO_DATA[k].role;
const compOf = (p) => p.map((k) => LETTER[roleOf(k)]).sort((a, b) => "TSD".indexOf(a) - "TSD".indexOf(b)).join("");

function job(j) {
  const r = runner.runFull(j.party, j.seed, { smartFight: true, smartOut: true, depth: 1, hpx: HPX, dmgx: DMGX });
  return { i: j.i, clear: !!r.clear, floor: r.floor, where: r.where };
}

if (!isMainThread) {
  parentPort.on("message", (j) => parentPort.postMessage(job(j)));
} else {
  // 판 짜기 — 바퀴마다 섞어 셋씩. 남는 사도(135 는 3 으로 나뉘니 없다)는 다음 바퀴로
  let s = (777 + SEED * 104729) >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const jobs = [];
  for (let r = 0; r < ROUNDS; r++) {
    const pool = HEROES.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (let i = 0; i + 3 <= pool.length; i += 3) jobs.push({ i: jobs.length, party: pool.slice(i, i + 3), seed: 20000 + SEED * 7919 + jobs.length * 37 });
  }
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

  // ── 모으기 ──
  const pct = (w, n) => (n ? (w / n) * 100 : 0);
  const add = (map, key, win) => { const x = (map[key] = map[key] || [0, 0]); x[0]++; if (win) x[1]++; };
  const hero = {}, comp = {}, pair = {};
  let wins = 0;
  for (const j of jobs) {
    const win = res[j.i].clear;
    if (win) wins++;
    for (const k of j.party) add(hero, k, win);
    add(comp, compOf(j.party), win);
    const p = j.party.slice().sort();
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) add(pair, `${p[a]}|${p[b]}`, win);
  }
  const all = pct(wins, jobs.length);
  const rows = Object.entries(hero).map(([k, [n, w]]) => ({ k, ko: B.HERO_DATA[k].ko, role: roleOf(k), n, win: pct(w, n) }));
  // 오차 — 사도마다 판 수가 적다. 95% 구간의 반폭(정규 근사)으로 대략 보인다
  const half = (p, n) => (n ? 1.96 * Math.sqrt((p / 100) * (1 - p / 100) / n) * 100 : 0);

  const out = {
    runs: jobs.length, rounds: ROUNDS, hpx: HPX, dmgx: DMGX, clear: +all.toFixed(1), sec: Math.round((Date.now() - t0) / 1000),
    heroes: rows.sort((a, b) => b.win - a.win).map((r) => ({ ...r, win: +r.win.toFixed(1) })),
    comps: Object.fromEntries(Object.entries(comp).sort().map(([k, [n, w]]) => [k, { n, win: +pct(w, n).toFixed(1) }])),
  };

  if (argv.includes("--json")) {
    const file = opt("json") && !opt("json").startsWith("--") ? opt("json") : "meta.json";
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`→ ${file}`);
  }

  const bar = (p) => "█".repeat(Math.round(p / 10)).padEnd(10, "·");
  console.log(`메타 통계 — smart 봇 ${jobs.length}판(사도마다 ${ROUNDS}판) · 전체 완주 ${all.toFixed(1)}% · ${out.sec}초${HPX !== 1 || DMGX !== 1 ? ` · 적 체력 ×${HPX} 피해 ×${DMGX}` : ""}`);
  console.log(`  사도 한 명의 값은 ±${half(all, ROUNDS).toFixed(0)}%p 쯤 흔들린다(${ROUNDS}판) — 순위의 가운데는 믿지 말고 양 끝만 본다\n`);

  // 퍼짐 — 몇 명이 어디에 몰려 있나
  const bands = [[70, 101, "70% 이상"], [50, 70, "50~70%"], [30, 50, "30~50%"], [15, 30, "15~30%"], [0, 15, "15% 미만"]];
  console.log("퍼짐");
  for (const [lo, hi, name] of bands) {
    const n = rows.filter((r) => r.win >= lo && r.win < hi).length;
    console.log(`  ${name.padEnd(8)} ${String(n).padStart(3)}명 ${"■".repeat(n)}`);
  }

  console.log("\n편성(역할 셋)");
  for (const [k, v] of Object.entries(out.comps).sort((a, b) => b[1].win - a[1].win)) console.log(`  ${k}  ${bar(v.win)} ${v.win.toFixed(0).padStart(3)}%  (${v.n}판)`);

  for (const role of ["탱커", "서포터", "딜러"]) {
    const rs = rows.filter((r) => r.role === role).sort((a, b) => b.win - a.win);
    const avg = rs.reduce((a, r) => a + r.win, 0) / (rs.length || 1);
    console.log(`\n${role} ${rs.length}명 · 평균 ${avg.toFixed(0)}%`);
    console.log(`  위  ${rs.slice(0, 6).map((r) => `${r.ko} ${r.win.toFixed(0)}`).join(" · ")}`);
    console.log(`  아래 ${rs.slice(-6).reverse().map((r) => `${r.ko} ${r.win.toFixed(0)}`).join(" · ")}`);
  }

  // 짝 — 같이 들었을 때 따로보다 훨씬 잘하는(못하는) 둘. 판이 적으니 4판 이상만, 기대(둘의 평균)와 차이로
  const pr = Object.entries(pair).filter(([, [n]]) => n >= 4).map(([k, [n, w]]) => {
    const [a, b] = k.split("|");
    const exp = (pct(hero[a][1], hero[a][0]) + pct(hero[b][1], hero[b][0])) / 2;
    return { a: B.HERO_DATA[a].ko, b: B.HERO_DATA[b].ko, n, win: pct(w, n), lift: pct(w, n) - exp };
  });
  if (pr.length) {
    console.log(`\n같이 들면 기대보다 잘하는 짝(4판 이상 ${pr.length}쌍 가운데 — 짝은 판이 적어 --rounds 를 크게 줘야 믿을 만하다)`);
    for (const x of pr.sort((p, q) => q.lift - p.lift).filter((x) => x.lift > 0).slice(0, 5)) console.log(`  ${x.a} + ${x.b}  ${x.win.toFixed(0)}% (기대보다 ${x.lift >= 0 ? "+" : ""}${x.lift.toFixed(0)}, ${x.n}판)`);
  }
}
