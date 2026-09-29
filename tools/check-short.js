// 카드 글을 줄일 때 뜻을 잃지 않았는지 본다.
//
// 줄이는 일이 위험한 이유는 **틀려도 멀쩡해 보이기 때문이다.**
// "공격력 200% 피해" 를 "피해" 로 줄여 버려도 카드는 그럴듯하게 생겼다.
// 그래서 사람 눈으로 읽지 않고 **숫자를 센다** — 원문에 있던 숫자가 줄인 글에도
// 같은 차례로 다 있어야 한다.
//
//   node tools/check-short.js            얼마나 줄었나 · 뜻을 잃은 카드가 있나
//   node tools/check-short.js --list     줄어든 카드를 늘어놓는다
import B from "../js/data/built.js";
import { shortText, SHORT } from "../js/card-text.js";

const list = process.argv.includes("--list");
const cards = Object.values(B.cards);
const nums = (t) => (String(t).match(/\d+/g) || []).join(",");

let fails = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  실패 ${m}`); fails++; };

// ── 스스로 보는 검사 — 규칙이 무엇을 해야 하는지 박아 둔다 ────────────
console.log("규칙이 하는 일");
const CASES = [
  ["공격력 100% 피해", "피해 100%"],
  ["방어력 200% 방어", "방어 200%"],
  ["적 1명 공격력 220% 피해", "적 1명 피해 220%"],
  ["아군 1명 HP 회복(공격력 70%)", "아군 1명 회복 70%"],
  ["자신 실드(방어력 240%)", "자신 실드 240%"],
  ["무작위 적 4회 × 공격력 50% 피해", "무작위 적 4회 × 피해 50%"],
  ["공격력 80% 마법 피해", "마법 피해 80%"],
  ["간식 +1, 드로우 1", "간식 +1, 드로우 1"],          // 건드릴 것이 없으면 그대로
];
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
