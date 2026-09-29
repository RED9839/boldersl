// 카드 코스트가 효과에 비해 싼지 본다 — "고유 카드가 너무 싸다" 는 말을 숫자로 재려고 만들었다.
//
//   node tools/cost-audit.js [--list]
//
// 카드 한 장의 값을 대충 「1코 공격 한 명 120%」 를 1 로 잡은 단위(가치)로 센다. 기준은 docs/07-스킬구성.md §7 표.
//   피해   한 명 100% = 0.83 · 전체는 ×1.6 · 무작위는 ×0.9
//   방어·실드 200% = 0.8 · 아군 전원 ×2 · 회복 80% = 0.8 · 아군 전원 ×2
//   드로우 1 = 0.4 · AP 1 = 0.9 · 게이지 10% = 0.1 · 기절 = 0.8 · 취약·약화 1턴 = 0.2 · 증감 10%·1턴 = 0.2
//   키워드 +1 = 0.3 (사도마다 다르지만 평균값)
// 코스트 c 카드의 기준 가치 ≈ 0.5 + c (0코 0.5 · 1코 1.5 · 2코 2.5 · 3코 3.5). 이보다 1.4배 넘게 크면 「싸다」.
import B from "../js/data/built.js";

const V = (fx) => {
  let v = 0;
  for (const f of fx || []) {
    const n = f.hits || 1;
    const area = (t) => (t === "allEnemies" || t === "allAllies" ? 1.6 : t === "randomEnemy" ? 0.9 : 1);
    switch (f.k) {
      case "dmg": v += f.ratio * n * 0.83 * area(f.target) * (f.xHits ? 3 : 1); break;
      case "block": case "shield": v += (f.ratio / 2) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "heal": v += (f.ratio / 0.8) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "draw": v += 0.4 * (f.v || 1); break;
      case "ap": v += 0.9 * f.v; break;
      case "gauge": v += f.v / 100; break;
      case "status": v += f.id === "기절" ? 0.8 : f.id === "도발" ? 0.3 : 0.2 * (f.turns || 1) * area(f.target); break;
      case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod":
        v += Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target); break;
      case "stack": if (f.v > 0) v += 0.3 * f.v; break;
      case "strip": v += 0.3; break;
      case "invuln": v += f.target === "allAllies" ? 2.5 : 1.2; break;
      case "cleanse": v += 0.2; break;
    }
  }
  return v;
};
const base = (c) => 0.5 + c;

const rows = [];
for (const c of Object.values(B.cards)) {
  if (!c.unique) continue;
  const cost = c.cost === "X" ? 3 : c.cost;
  rows.push({ id: c.id, hero: B.heroes[c.hero].ko, ko: c.ko, cost, costRaw: c.cost, v: V(c.fx), r: V(c.fx) / base(cost) });
}
const dist = {};
for (const r of rows) dist[r.costRaw] = (dist[r.costRaw] || 0) + 1;
const start = Object.values(B.cards).filter((c) => c.start);
const sd = {}; for (const c of start) sd[c.cost] = (sd[c.cost] || 0) + 1;
console.log(`고유 카드 ${rows.length}장 · 코스트 분포 ${Object.entries(dist).map(([k, v]) => `${k}코 ${v}`).join(" · ")}`);
console.log(`  (시작 카드 ${start.length}장 · ${Object.entries(sd).map(([k, v]) => `${k}코 ${v}`).join(" · ")})`);
const avgC = rows.reduce((a, r) => a + r.cost, 0) / rows.length;
console.log(`  평균 코스트 ${avgC.toFixed(2)}`);
const cheap = rows.filter((r) => r.r > 1.4).sort((a, b) => b.r - a.r);
const fair = rows.filter((r) => r.r >= 0.7 && r.r <= 1.4).length;
const weak = rows.filter((r) => r.r < 0.7).length;
console.log(`\n코스트 대비 가치 — 싸다(1.4배 넘음) ${cheap.length}장 · 맞다 ${fair}장 · 비싸다(0.7배 밑) ${weak}장`);
for (const c of [0, 1, 2, 3]) {
  const g = rows.filter((r) => r.cost === c);
  if (!g.length) continue;
  const avg = g.reduce((a, r) => a + r.r, 0) / g.length;
  console.log(`  ${c}코 ${g.length}장 — 평균 ${avg.toFixed(2)}배, 싼 것 ${g.filter((r) => r.r > 1.4).length}장`);
}
console.log(`\n가장 싼 열`);
for (const r of cheap.slice(0, 15)) console.log(`  ${r.r.toFixed(1)}배  ${r.costRaw}코  ${r.hero} 「${r.ko}」`);
if (process.argv.includes("--list")) for (const r of cheap) console.log(`${r.id}\t${r.r.toFixed(2)}\t${r.costRaw}\t${r.hero}\t${r.ko}`);
