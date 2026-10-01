// 카드 글의 밑줄이 제자리에 그어지는지 본다.
//
// 밑줄은 틀려도 멀쩡해 보인다 — "방어력" 안의 "방어" 에 밑줄이 그어져도 글은 그대로다.
// 그래서 걸리면 안 되는 자리를 예시로 박아 두고, 135명 전부를 훑어 몇 %에 붙는지 센다.
//
//   node tools/check-keywords.js
//   node tools/check-keywords.js --list    밑줄이 하나도 안 붙는 카드를 늘어놓는다
import B from "../js/data/built.js";
import KW from "../js/data/keywords.js";
import { shortText, splitKeywords, cardParts } from "../js/card-text.js";

const list = process.argv.includes("--list");
let fails = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  실패 ${m}`); fails++; };

const marks = (t, hero) => splitKeywords(t, hero).filter((p) => p.kw).map((p) => p.t);

// ── 걸려야 할 자리와 걸리면 안 될 자리 ────────────────────────────────
console.log("제자리에 긋는가");
const CASES = [
  ["적 전체 약화 1턴", "아야", ["약화"]],
  ["다음 동상 부여 +2", "아야", ["동상"]],
  ["간식 +1, 드로우 1", "에르핀", ["간식", "드로우"]],
  ["방어 400%, 다음 턴 AP +1", "네르", ["방어", "AP"]],
  // 걸리면 안 되는 자리
  ["방어력 200% 방어", "네르", ["방어"]],          // 앞의 '방어력' 은 건너뛴다
  ["공격력이 가장 높은 아군", "네르", []],
  ["고학년 게이지 300%", "에르핀", ["고학년 게이지"]],  // 긴 낱말이 이긴다
];
for (const [text, hero, want] of CASES) {
  const got = marks(text, hero);
  const same = got.length === want.length && got.every((g, i) => g === want[i]);
  same ? ok(`${text} → [${got.join(", ")}]`) : bad(`${text} → [${got.join(", ")}] ([${want.join(", ")}] 여야 한다)`);
}

// ── 카드 전부 ─────────────────────────────────────────────────────────
console.log("");
console.log("카드 전부");
const cards = Object.values(B.cards);
const none = [];
let hit = 0, total = 0;
for (const c of cards) {
  const m = marks(shortText(c.text), c.hero);
  total += m.length;
  if (m.length) hit++; else none.push(c);
}
ok(`${hit}/${cards.length}장에 밑줄이 붙는다 (${((hit / cards.length) * 100).toFixed(0)}%) · 모두 ${total}군데`);

// 사도 전용 키워드가 그 사도 카드에 실제로 나오는가
const silent = [];
for (const [key, kw] of Object.entries(KW.heroes)) {
  const mine = cards.filter((c) => c.hero === key);
  if (!mine.some((c) => shortText(c.text).includes(kw.ko))) silent.push(`${key}(${kw.ko})`);
}
check(silent.length < Object.keys(KW.heroes).length * 0.35,
  `전용 키워드가 제 카드에 나오는 사도 ${Object.keys(KW.heroes).length - silent.length}/${Object.keys(KW.heroes).length}`);
if (silent.length) console.log(`       나오지 않는 사도 ${silent.length}: ${silent.slice(0, 6).join(" · ")}${silent.length > 6 ? " 외" : ""}`);

// 곁말을 떼어 내면서 풀이를 잘라 먹지 않았는가.
// 문장 한가운데의 「」 까지 떼었더니 아멜리아 풀이가 "…받을 때마다" 에서 끊겼다.
// 사람 눈으로는 멀쩡해 보인다 — 그래서 **숫자를 센다**. 잘리면 숫자가 사라진다.
{
  const lost = [];
  for (const [key, h] of Object.entries(KW.heroes)) {
    const before = (B.heroes[key].keyword.text.match(/\d+/g) || []).join(",");
    const after = ([h.text, ...Object.values(h.subs || {})].join(" ").match(/\d+/g) || []).join(",");
    if (before !== after) lost.push(key);
  }
  check(!lost.length, lost.length
    ? `곁말을 떼며 풀이가 잘린 사도 ${lost.length}: ${lost.slice(0, 5).join(", ")}`
    : `곁말 ${Object.values(KW.heroes).reduce((a, h) => a + Object.keys(h.subs || {}).length, 0)}개를 떼어도 풀이가 안 잘렸다`);
}

// 카드를 '하는 일 + 낱말 풀이' 로 펼치는 것
{
  const snow = cards.find((c) => c.ko === "스노우포그");
  const p2 = cardParts({ ...snow, name: snow.ko }, snow.hero);
  // 사도 리뉴얼(docs/11) 뒤 스노우포그는 「깃발」 을 꽂고 광역으로 친다 — 하는 일이 읽히고 「깃발」 풀이가 붙는가
  check(/깃발/.test(p2.action) && /피해/.test(p2.action), `스노우포그 하는 일 \"${p2.action}\"`);
  check(p2.terms.some((t) => t.ko === "깃발"), `스노우포그 낱말 ${p2.terms.map((t) => t.ko).join(" · ")}`);

  // 이 카드에서만 쓰는 낱말을 가진 카드 — 지금은 하나뿐이다. 기획서가 늘리면 여기 숫자가 오른다.
  const local = cards.filter((c) => cardParts({ ...c, name: c.ko }, c.hero).terms.some((t) => t.kind === "이 카드"));
  ok(`글 안에 제 낱말을 품은 카드 ${local.length}장: ${local.map((c) => c.ko).join(" · ") || "없다"}`);

  // 펼쳐도 글을 잃지 않는가 — 숫자로 센다
  const lost2 = cards.filter((c) => {
    const q = cardParts({ ...c, name: c.ko }, c.hero);
    const a = (shortText(c.text).match(/\d+/g) || []).join(",");
    const b2 = ([q.action, ...q.terms.filter((t) => t.kind === "이 카드").map((t) => t.text)].join(" ").match(/\d+/g) || []).join(",");
    return a !== b2;
  });
  check(!lost2.length, lost2.length ? `펼치며 글을 잃은 카드 ${lost2.length}` : "펼쳐도 카드 글을 안 잃는다");
}

// 풀이가 없는 낱말 — 지어내지 않고 비워 둔 것이다. 몇인지는 알고 있어야 한다.
const thin = Object.values(KW.words).filter((w) => !w.text);
ok(`풀이가 없는 낱말 ${thin.length}: ${thin.map((w) => w.ko).join(" · ") || "없다"} (기획서에 이름만 있다)`);

function check(cond, m) { cond ? ok(m) : bad(m); }

if (list && none.length) {
  console.log("");
  console.log(`밑줄이 하나도 안 붙는 카드 ${none.length}`);
  for (const c of none.slice(0, 40)) console.log(`  ${c.hero} ${c.ko} — ${shortText(c.text)}`);
}

console.log("");
console.log(fails ? `문제 ${fails}개` : "밑줄이 제자리에 그어진다");
process.exit(fails ? 1 : 0);
