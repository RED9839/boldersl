// 사도마다 얼마나 센지 잰다 — 스킬을 다시 짠 뒤 튀는 사람을 찾으려고 만들었다.
//
//   node tools/hero-power.js [판 수=40]
//
// 사도 한 명을 넣고, 나머지 둘은 돌아가며 바꾼다(한 사람 운에 휘둘리지 않게).
// 덱은 여덟 장 전부(시작 4 + 고유 4) — 판 중반의 모습이다. 1층(전투 셋 + 보스)을 무작위 손으로 싸운다.
// 결과: 완주율이 높은/낮은 사도 열 명씩, 그리고 전체 분포.
import { newCombat, endTurn, playCard, canPlay, useUlt, canUlt } from "../js/combat.js";
import { kitOf, HERO_DATA } from "../js/cardbook.js";
import { FLOORS } from "../js/data/enemies.js";

const N = +(process.argv[2] || 40);
// --hp 1.8 — 적 체력 배율. 너무 쉬우면 다들 100%에 붙어 차이가 안 보인다 — 단단하게 해서 가른다
const HPX = process.argv.includes("--hp") ? +process.argv[process.argv.indexOf("--hp") + 1] : undefined;
const keys = Object.keys(HERO_DATA);
// --start — 시작 카드 넉 장만(판 처음의 모습). 기본은 여덟 장 전부(판 중반)
const START = process.argv.includes("--start");
const kit = (k) => { const x = kitOf(k); return [...x.start, ...(START ? [] : x.unique)].map((c) => c.id); };

function fight(party, enemyIds, hp, seed) {
  const s = newCombat({ partyKeys: party, rows: {}, deck: party.flatMap(kit), enemyIds, hp, seed, enemyHp: HPX });
  let t = 0;
  while (!s.over && t++ < 30) {
    let g = 0;
    while (!s.over && g++ < 30) {
      const i = s.hand.findIndex((id) => !canPlay(s, id));
      if (i < 0) break;
      const e = s.enemies.find((x) => !x.dead);
      if (!playCard(s, i, e ? e.idx : 0).ok) break;
    }
    for (const u of s.party) if (!canUlt(s, u.key)) useUlt(s, u.key, 0);
    endTurn(s);
  }
  return s;
}

function floor(party, seed) {
  let hp = null;
  const f = FLOORS[0];
  for (const [i, ids] of [...f.fights, f.boss].entries()) {
    const s = fight(party, ids, hp, seed + i * 977);
    if (s.over !== "win") return false;
    // 전투 사이에 조금 회복한다(sim.js 와 같게 — 잃은 체력의 30%)
    hp = Object.fromEntries(s.party.map((u) => [u.key, u.dead ? 1 : Math.min(u.maxHp, u.hp + Math.round((u.maxHp - u.hp) * 0.3))]));
  }
  return true;
}

const rows = [];
const out = process.argv.includes('--all');
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  let win = 0;
  for (let n = 0; n < N; n++) {
    const a = keys[(i + 1 + n * 7) % keys.length], b = keys[(i + 50 + n * 13) % keys.length];
    const party = [k, a === k ? keys[(i + 2) % keys.length] : a, b === k || b === a ? keys[(i + 3) % keys.length] : b];
    if (floor(party, 101 + n * 31)) win++;
  }
  rows.push([HERO_DATA[k].ko, win / N, HERO_DATA[k].role]);
}
rows.sort((a, b) => b[1] - a[1]);
const pct = (v) => (v * 100).toFixed(0).padStart(3) + "%";
const avg = rows.reduce((a, r) => a + r[1], 0) / rows.length;
console.log(`사도 ${rows.length}명 · 한 사람당 ${N}판 · 평균 완주 ${pct(avg)}`);
console.log("\n센 쪽 열");
for (const r of rows.slice(0, 10)) console.log(`  ${pct(r[1])}  ${r[0]} (${r[2]})`);
console.log("\n약한 쪽 열");
for (const r of rows.slice(-10)) console.log(`  ${pct(r[1])}  ${r[0]} (${r[2]})`);
const byRole = {};
for (const r of rows) (byRole[r[2]] = byRole[r[2]] || []).push(r[1]);
console.log("\n역할별 평균");
for (const [k, v] of Object.entries(byRole)) console.log(`  ${k} ${pct(v.reduce((a, b) => a + b, 0) / v.length)} (${v.length}명)`);

// 엘다인은 체급이 한 단계 위여야 한다(docs/07-스킬구성.md) — 얼마나 위인지 본다
const eld = rows.filter((r) => Object.values(HERO_DATA).find((h) => h.ko === r[0] && h.eldain));
const nor = rows.filter((r) => !eld.includes(r));
const mean = (x) => x.reduce((a, r) => a + r[1], 0) / x.length;
console.log(`\n엘다인 ${eld.length}명 평균 ${pct(mean(eld))} · 보통 ${nor.length}명 평균 ${pct(mean(nor))}`);
if (process.argv.includes("--eldain")) for (const r of eld) console.log(`  ${pct(r[1])}  ${r[0]} (${r[2]})`);
