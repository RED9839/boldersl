// 카드 글을 줄일 때 뜻을 잃지 않았는지 본다.
//
// 줄이는 일이 위험한 이유는 **틀려도 멀쩡해 보이기 때문이다.**
// "공격력 200% 피해" 를 "피해" 로 줄여 버려도 카드는 그럴듯하게 생겼다.
// 그래서 사람 눈으로 읽지 않고 **숫자를 센다** — 원문에 있던 숫자가 줄인 글에도
// 다 있어야 한다. 차례는 보지 않는다 — 길이(「2턴간 …」 → 「… 2턴」)를 뒤로 옮기는 규칙이 있어서다.
// 숫자 묶음이 그대로면 하나도 잃지 않은 것이다.
//
//   node tools/check-short.js            얼마나 줄었나 · 뜻을 잃은 카드가 있나
//   node tools/check-short.js --list     줄어든 카드를 늘어놓는다
import B from "../js/data/built.js";
import { shortText, SHORT } from "../js/card-text.js";

const list = process.argv.includes("--list");
const cards = Object.values(B.cards);
const nums = (t) => (String(t).match(/\d+/g) || []).sort().join(",");

let fails = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  실패 ${m}`); fails++; };

// ── 스스로 보는 검사 — 규칙이 무엇을 해야 하는지 박아 둔다 ────────────
console.log("규칙이 하는 일");
const CASES = [
  ["공격력 100% 피해", "피해 100%"],
  ["방어력 200% 방어", "방어 200%"],
  ["적 1명 공격력 220% 피해", "적 1명 피해 220%"],
  // 치유는 방어력 기준(v6 카제나) — 「HP 회복(방어력 N%)」
  ["파티 HP 회복(방어력 210%)", "파티 회복 210%"],
  ["적 1명에게 공격력 80% 고정 피해", "적 1명에게 고정 피해 80%"],
  ["파티 방어력 150% 고정 실드", "파티 고정 실드 150%"],
  ["적 1명에게 방어 기반 피해 150%", "적 1명에게 방어 기반 피해 150%"],   // 바탕이 다른 피해라 그대로(카드 면은 cardCalc 가 「방어 기반 피해」 로 센다)
  ["자신 실드(방어력 240%)", "자신 실드 240%"],
  ["무작위 적 4회 × 공격력 50% 피해", "무작위 적 4회 × 피해 50%"],
  ["공격력 80% 마법 피해", "마법 피해 80%"],
  ["간식 +1, 드로우 1", "간식 +1, 드로우 1"],          // 건드릴 것이 없으면 그대로
  // 길이는 끝에 — 「약화 1턴」 과 같은 자리
  ["2턴간 아군 전원 주는 피해 +10%", "아군 전원 주는 피해 +10% 2턴"],
  ["이번 턴 자신 받는 피해 -20%, 드로우 1", "자신 받는 피해 -20% 이번 턴, 드로우 1"],
  ["이번 전투 동안 자신 공격력 +10% · 방어력 +10%", "자신 공격력 +10% · 방어력 +10% 전투 내내"],
  ["2턴간 안개: 적 전체 매 턴 공격력 50% 피해", "2턴간 안개: 적 전체 매 턴 피해 50%"],   // 이름표는 그대로(cardParts 가 읽는다)
  ["HP 비율이 가장 낮은 아군 HP 회복(방어력 150%)", "HP 최저 아군 회복 150%"],
  ["아군 전원 HP 회복(방어력 120%) 2번", "아군 전원 회복 120% 2번"],
];
// 카드 면의 수치 조각 — 방어 기반 · 고정 피해 · 고정 실드는 제 갈래로(fight-screen cardCalc)
{
  const { numParts } = await import("../js/card-text.js");
  const kinds = (t) => numParts(shortText(t)).filter((p) => p.kind).map((p) => `${p.kind}:${p.pct}`).join(" ");
  for (const [from, want] of [["적 1명에게 방어 기반 피해 150%", "ddmg:150"], ["적 1명에게 공격력 80% 고정 피해", "fdmg:80"], ["파티 방어력 150% 고정 실드", "fshield:150"], ["파티 HP 회복(방어력 210%)", "heal:210"], ["적 1명에게 공격력 120% 피해", "dmg:120"]]) {
    const got = kinds(from);
    got === want ? ok(`카드 면 「${from}」 → ${got}`) : bad(`카드 면 「${from}」 → ${got} (${want} 여야 한다)`);
  }
}
for (const [from, want] of CASES) {
  const got = shortText(from);
  got === want ? ok(`${from} → ${got}`) : bad(`${from} → ${got} (${want} 여야 한다)`);
}

// ── 1,080장 전부 ───────────────────────────────────────────────────────
console.log("");
console.log("카드 전부");
const lost = [];
let before = 0, after = 0, changed = 0;
for (const c of cards) {
  const s = shortText(c.text);
  before += c.text.length;
  after += s.length;
  if (s !== c.text) changed++;
  if (nums(c.text) !== nums(s)) lost.push(c);
}
lost.length
  ? bad(`숫자를 잃은 카드 ${lost.length}: ${lost.slice(0, 5).map((c) => c.ko).join(", ")}`)
  : ok(`${cards.length}장 모두 숫자를 그대로 지녔다`);

// 두 번 줄여도 같아야 한다. 아니면 규칙이 제 결과를 또 갉아먹는다는 뜻이다.
const unstable = cards.filter((c) => shortText(shortText(c.text)) !== shortText(c.text));
unstable.length
  ? bad(`두 번 줄이면 달라지는 카드 ${unstable.length}: ${unstable.slice(0, 3).map((c) => c.ko).join(", ")}`)
  : ok("두 번 줄여도 같다");

// 늘어나면 줄이는 것이 아니다
const grew = cards.filter((c) => shortText(c.text).length > c.text.length);
grew.length ? bad(`길어진 카드 ${grew.length}`) : ok("길어진 카드가 없다");

console.log("");
console.log("전체");
const pc = ((1 - after / before) * 100).toFixed(1);
console.log(`  평균 ${(before / cards.length).toFixed(1)}자 → ${(after / cards.length).toFixed(1)}자 (${pc}% 줄었다)`);
console.log(`  손댄 카드 ${changed}/${cards.length} (${((changed / cards.length) * 100).toFixed(0)}%)`);
console.log(`  규칙 ${SHORT.length}개`);

if (list) {
  console.log("");
  for (const c of cards) {
    const s = shortText(c.text);
    if (s !== c.text) console.log(`  ${c.ko}\n    ${c.text}\n    ${s}`);
  }
}

console.log("");
console.log(fails ? `문제 ${fails}개` : "줄인 글이 뜻을 잃지 않았다");
process.exit(fails ? 1 : 0);
