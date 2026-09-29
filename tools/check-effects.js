// 효과 파서가 기획서를 몇 %나 읽었는지 본다.
//
// 파서는 조용히 틀린다 — 못 읽은 문장을 빈 효과로 넘기면 카드가 아무 일도 안 하면서
// 겉으로는 멀쩡해 보인다. 그래서 **읽은 만큼과 못 읽은 만큼을 따로 센다.**
//
//   node tools/check-effects.js          요약
//   node tools/check-effects.js --miss   못 읽은 문장 목록
import D from "../js/data/design.js";
import { parseEffect } from "../js/effects.js";

const SHOW_MISS = process.argv.includes("--miss");
const H = Object.values(D.heroes);

let total = 0, withFx = 0, clean = 0;
const leftovers = new Map();      // 못 읽은 조각 → 몇 번 나왔나
const empty = [];                 // 효과를 하나도 못 뽑은 문장

function look(where, text, hero) {
  if (!text) return;
  total++;
  const { fx, left } = parseEffect(text, { keyword: hero.keyword ? hero.keyword.ko : null });
  if (fx.length) withFx++;
  else empty.push(`${where}: ${text.slice(0, 60)}`);
  if (!left) clean++;
  else for (const w of left.split(/\s+/).filter((x) => x.length > 1)) leftovers.set(w, (leftovers.get(w) || 0) + 1);
}

for (const h of H) {
  for (const c of h.start) look(`${h.ko}/시작/${c.ko}`, c.text, h);
  for (const u of h.unique) {
    look(`${h.ko}/고유/${u.ko}`, u.text, h);
    for (const f of u.flash) look(`${h.ko}/${u.ko}/${f.kind}`, f.text, h);
  }
  if (h.ult) look(`${h.ko}/궁극기/${h.ult.ko}`, h.ult.text, h);
}

const pc = (n) => ((n / total) * 100).toFixed(1) + "%";
console.log(`효과 문장 ${total}개`);
console.log(`  효과를 하나라도 뽑은 것   ${withFx} (${pc(withFx)})`);
console.log(`  글자까지 다 읽은 것       ${clean} (${pc(clean)})`);
console.log(`  아무것도 못 뽑은 것       ${empty.length} (${pc(empty.length)})`);

console.log("");
console.log("가장 자주 남는 낱말 — 여기가 다음에 붙일 규칙이다");
const top = [...leftovers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [w, n] of top) console.log(`  ${String(n).padStart(4)}  ${w}`);

if (SHOW_MISS) {
  console.log("");
  console.log(`아무것도 못 뽑은 문장 ${empty.length}개`);
  for (const e of empty.slice(0, 60)) console.log(`  ${e}`);
  if (empty.length > 60) console.log(`  … 그 밖 ${empty.length - 60}개`);
}
