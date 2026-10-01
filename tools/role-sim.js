// 사도 한 명을 편성 여러 가지에 넣어 클리어율을 잰다 — 사도 리뉴얼(docs/11) 의 자.
//   node tools/role-sim.js 시온더다크불릿                  그 사도 역할이 들어간 편성 여섯 가지 × 신탁 없음·무작위·맞춤
//   node tools/role-sim.js 캬롯 --comps SSD,TSD --modes fit --parties 30 --runs 40
//   node tools/role-sim.js 캬롯 --root <다른 사본>          옛 판과 견줄 때
//
// 한 판 = 3층 12전 연속(체력 이어짐 · 전투 뒤 20% 회복 · 층 사이 완전 회복). 보상 · 장비 · 상점은 없다.
// 그래서 클리어율의 절대값보다 **편성끼리 · 판끼리의 차이**를 본다.
// 맞춤(fit) = 카드마다 다섯 갈래를 번갈아 끼워 보며 그 파티에 가장 잘 맞는 신탁을 고른 것(두 바퀴).
// 손(봇)은 운영을 한다 — 고학년은 차면 쓰고, 누가 절반 아래면 회복·방어부터, AP·드로우·키워드 쌓기를 먼저,
// 그 사도 키워드를 쓰는 카드는 키워드가 셋 이상일 때.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(opt("root", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const C = await import(pathToFileURL(path.join(ROOT, "js/combat.js")).href);
const B = await import(pathToFileURL(path.join(ROOT, "js/cardbook.js")).href);
const { FLOORS } = await import(pathToFileURL(path.join(ROOT, "js/data/enemies.js")).href);

const heroes = [...new Set(Object.keys(B.CARDS).filter((id) => /_u0$/.test(id) && B.CARDS[id].hero).map((id) => B.CARDS[id].hero))]
  .filter((k) => C.buildDeck([k]).length);
const want = argv[0];
const K = heroes.find((k) => k === want) || heroes.find((k) => (C.designOf(k) || {}).ko === want);
if (!K) { console.error(`사도 「${want}」 를 못 찾았다`); process.exit(1); }
const D0 = C.designOf(K);
const LETTER = { 탱커: "T", 서포터: "S", 딜러: "D" };
const me = LETTER[D0.role];
const KW = D0.keyword && D0.keyword.ko;
const U = ["u0", "u1", "u2", "u3"].map((u) => `${K}_${u}`).filter((id) => B.CARDS[id] && (B.CARDS[id].flash || []).length === 5);

// 그 사도 역할이 하나 이상 든 세 자리 편성 — 여섯 가지
const ALL = ["TTT", "TTS", "TTD", "TSS", "TSD", "TDD", "SSS", "SSD", "SDD", "DDD"];
const COMPS = (opt("comps") || ALL.filter((c) => c.includes(me)).join(",")).split(",");
const MODES = (opt("modes") || "base,rand,fit").split(",");
const P = +opt("parties", 30), N = +opt("runs", 40);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const POOL = { T: [], S: [], D: [] };
for (const k of heroes) { const l = LETTER[(C.designOf(k) || {}).role]; if (l && k !== K) POOL[l].push(k); }

function partiesOf(comp) {
  const r = rng(4242 + comp.charCodeAt(0) * 7 + comp.charCodeAt(1) * 13 + comp.charCodeAt(2));
  const rest = comp.split(""); rest.splice(rest.indexOf(me), 1);
  return Array.from({ length: P }, () => { const p = [K]; for (const l of rest) { let k; do k = POOL[l][Math.floor(r() * POOL[l].length)]; while (p.includes(k)); p.push(k); } return p; });
}

const stackOf = (s) => (KW && ((s.stacks || {})[K] || {})[KW]) || 0;
const text = (s, id) => (C.cardOf(s, id) || {}).text || "";
function target(s) { let t = 0, best = 1e9; s.enemies.forEach((e, j) => { if (!e.dead && e.hp < best) { best = e.hp; t = j; } }); return t; }
const spendRe = KW ? new RegExp(`「${KW}」\\s*(전부|\\d)\\s*소모|「${KW}」\\s*1당`) : null;
function play(s, r) {
  let g = 0;
  while (!s.over && g++ < 80) {
    for (const u of s.party) if (!C.canUlt(s, u.key)) { C.useUlt(s, u.key, target(s)); if (s.over) return; }
    const ok = s.hand.map((id, i) => i).filter((i) => !C.canPlay(s, s.hand[i]));
    if (!ok.length) break;
    const hurt = s.party.some((u) => !u.dead && u.hp < u.maxHp * 0.5);
    const score = (i) => {
      const id = s.hand[i], t = text(s, id), cost = C.costOf(s, id);
      const spend = spendRe && (C.cardOf(s, id) || {}).hero === K && spendRe.test(t);
      if (hurt && /회복|방어|실드|받는 피해 -/.test(t)) return 120;
      if (spend) return stackOf(s) >= 3 ? 50 + stackOf(s) : -10;
      if (/AP\s*\+\d/.test(t)) return 100;
      if (/드로우/.test(t)) return 80;
      if (/「[^」]+」\s*\+\d/.test(t)) return 60 + cost;
      return 30 + cost * 5 + r();
    };
    // 적의 즉시 행동을 본다 — 다음 한 장이 피해 주는 수를 당길 때, 되돌리는 카드(「즉시 행동 -N」)가 있으면 그것부터,
    // 없으면 사람처럼 거기서 멈춘다(작은 수는 당겨도 낸다)
    const near = C.rushOf && s.enemies.some((e) => !e.dead && !e.sealed && e.intent && C.rushOf(e) && (e.rushCnt || 0) + 1 >= C.rushOf(e)
      && ["attack", "back", "multi", "attackAll"].includes(e.intent.t));
    const calms = (i) => ((C.cardOf(s, s.hand[i]) || {}).fx || []).some((f) => f.k === "rushDown" || (f.k === "status" && f.id === "기절"));
    ok.sort((a, b) => (near ? calms(b) - calms(a) : 0) || score(b) - score(a));
    if (near && !calms(ok[0])) break;
    if (!C.playCard(s, ok[0], target(s)).ok) break;
  }
}

const FULL = FLOORS.reduce((a, f) => a + f.fights.length + 1, 0);
function runOnce(party, seed, flash) {
  const r = rng(seed * 7919 + 13);
  const deck = [...C.buildDeck(party), ...party.flatMap((k) => ["u0", "u1", "u2", "u3"].map((u) => `${k}_${u}`).filter((id) => B.CARDS[id]))];
  let hp = null, maxHp = null, gauge = 0, fights = 0;
  for (const floor of FLOORS) {
    for (const ids of [...floor.fights, floor.boss]) {
      const s = C.newCombat({ partyKeys: party, rows: {}, deck, enemyIds: ids, hp, maxHp, seed: seed * 101 + fights, flash, gauge });
      let t = 0;
      while (!s.over && t++ < 40) { play(s, r); if (!s.over) C.endTurn(s); }
      if (s.over !== "win") return fights;
      fights++; gauge = s.gauge; hp = {}; maxHp = {};
      for (const u of s.party) { maxHp[u.key] = u.maxHp; hp[u.key] = u.dead ? 0 : Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.2)); }
    }
    for (const u of party) if (hp[u] > 0) hp[u] = maxHp[u];
  }
  return fights;
}
const avg = (party, flash, seeds) => { let c = 0, f = 0; for (const sd of seeds) { const x = runOnce(party, sd, flash); f += x; if (x === FULL) c++; } return { clear: c / seeds.length, fights: f / seeds.length }; };

const evalSeeds = Array.from({ length: N }, (_, i) => i + 1);
const tuneSeeds = Array.from({ length: 24 }, (_, i) => 5000 + i);
const out = { hero: K, ko: D0.ko, role: D0.role, rows: [] };
for (const comp of COMPS) {
  const parties = partiesOf(comp);
  for (const mode of MODES) {
    let clear = 0; const chosen = U.map(() => [0, 0, 0, 0, 0]);
    for (const [pi, party] of parties.entries()) {
      let flash = {};
      if (mode === "rand") { const r = rng(900 + pi); flash = Object.fromEntries(U.map((id) => [id, 1 + Math.floor(r() * 5)])); }
      if (mode === "fit") {
        flash = Object.fromEntries(U.map((id) => [id, 1]));
        for (let round = 0; round < 2; round++) for (const id of U) {
          let best = flash[id], bv = -1;
          for (let n = 1; n <= 5; n++) { const v = avg(party, { ...flash, [id]: n }, tuneSeeds).fights; if (v > bv) { bv = v; best = n; } }
          flash[id] = best;
        }
        U.forEach((id, i) => chosen[i][flash[id] - 1]++);
      }
      clear += avg(party, flash, evalSeeds).clear;
    }
    const row = { comp, mode, clear: +(clear / P * 100).toFixed(1) };
    if (mode === "fit") row.chosen = chosen;
    out.rows.push(row);
    if (!argv.includes("--json")) console.log(`${comp} ${mode.padEnd(4)} ${row.clear.toFixed(1)}%${row.chosen ? "  고른 갈래 " + row.chosen.map((c) => c.join("·")).join(" | ") : ""}`);
  }
}
if (argv.includes("--json")) console.log(JSON.stringify(out));
