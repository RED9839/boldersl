// 카드 글에 밑줄 칠 낱말과 그 풀이를 모은다.
//
// 세 군데에서 온다.
//   ① 사도 전용 키워드 135개 — 기획서(js/data/built.js) 의 hero.keyword
//   ② 상태와 규칙          — 기획서 「전투 규칙」 줄을 그대로 읽는다
//   ③ 이 게임이 실제로 하는 것 — js/rules.js · js/combat.js 에 몸이 있는 것
//
// **풀이가 없는 것은 없다고 적는다.** 기획서에 이름만 있고 뜻이 없는 낱말이 다섯 있다
// (개전·종극·주도·보존·소멸). 그럴듯한 풀이를 지어 넣으면 규칙이 조용히 생겨 버린다.
//
//   node tools/build-keywords.js
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import B from "../js/data/built.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOC = process.argv[2] || DESIGN_DOC;

// ── ② 기획서 「상태」 줄을 읽는다 ──────────────────────────────────────
// 손으로 옮겨 적으면 기획서가 바뀌었을 때 어긋난다. 원문에서 읽는다.
const raw = fs.existsSync(DOC) ? fs.readFileSync(DOC, "utf8").replace(/\r\n/g, "\n") : "";
const statusLine = (raw.match(/^-\s*상태:\s*(.+)$/m) || [])[1] || "";
const fromDoc = {};
for (const m of statusLine.matchAll(/([가-힣]+)\(([^)]+)\)/g)) fromDoc[m[1]] = m[2];
for (const m of statusLine.split("·").map((s) => s.trim())) {
  // 줄 끝의 마침표까지 낱말로 셌더니 "실드." 가 생겼다
  const bare = m.replace(/\(.*\)/, "").replace(/[.,·\s]+$/, "").trim();
  if (bare && !(bare in fromDoc)) fromDoc[bare] = null;   // 이름만 있는 것
}

// ── 공용 키워드 — 기획서가 이름만 부른다 ──────────────────────────────
const commonLine = (raw.match(/공용 키워드:\s*(.+?)\./m) || [])[1] || "";
const commonNames = commonLine.split("·").map((s) => s.trim()).filter(Boolean);

// ── ③ 이 게임이 실제로 하는 것 ────────────────────────────────────────
// 기획서에 없고 엔진에만 있는 것은 그렇다고 밝힌다.
const ENGINE = {
  감전: "이 게임에서는 주는 피해 ×0.9. 턴마다 1씩 풀린다 (js/combat.js).",
  중독: "이 게임에서는 스택당 주는 피해 -2%, 최대 -30%. 천천히 풀린다 (js/combat.js).",
  기절: "적은 다음 수를 못 한다. 모으던 힘(큰 수 예고)도 흩어진다.",
  도발: "정한 턴 동안 적이 도발을 건 사도만 노린다 — 뒷줄을 노리던 수도.",
  침묵: "적은 공격이 아닌 수(방어·강화·방해·회복·힘 모으기)를 못 한다.",
  무적: "다음 내 턴이 올 때까지 피해를 받지 않는다 — 적의 차례까지 간다.",
  // 공용 키워드 가운데 셋은 이 게임에서 뜻을 정했다(docs/07-스킬구성.md). 주도·종극은 아직 풀이가 없다.
  보존: "이 게임에서는 턴이 끝나도 버려지지 않고 손에 남는다.",
  소멸: "이 게임에서는 내면 이 전투에서 사라진다.",
  개전: "이 게임에서는 전투를 시작할 때 첫 손패에 든다.",
};

// ── 규칙 낱말 ─────────────────────────────────────────────────────────
const RULES = {
  AP: "파티가 함께 쓴다. 매 턴 3, 남으면 사라진다. 카드 코스트가 곧 AP다.",
  드로우: "덱에서 카드를 뽑는다.",
  치명: "피해 150% 고정. 확률은 딜러 10%, 그 밖은 5%.",
  번뜩임: "고유 카드마다 다섯(①강화 ②경량 ③연계 ④변형 ⑤각성). 하나를 골라 그 카드가 바뀐다.",
  신뜩임: "번뜩임 위에 드물게 한 줄 더. 배율에 ×1.3 곱한다.",
  "궁극기 게이지": "파티 공용 0~300%. 카드에 쓴 AP 1당 +10%. 0코 카드는 안 찬다. 전투가 끝나면 0%.",
};

const words = {};
const add = (ko, text, kind, owner) => {
  if (!words[ko]) words[ko] = { ko, text: text || null, kind, owner: owner || null };
};

for (const [ko, text] of Object.entries(RULES)) add(ko, text, "규칙");
for (const [ko, text] of Object.entries(fromDoc)) add(ko, text ? `${text}.` : null, "상태");
for (const [ko, text] of Object.entries(ENGINE)) {
  if (words[ko] && !words[ko].text) words[ko].text = text;
  else add(ko, text, "상태");
}
for (const ko of commonNames) add(ko, null, "공용");

// ── ① 사도 전용 ───────────────────────────────────────────────────────
//
// 기획서가 한 칸에 두 가지를 적어 둔 사도가 있다. 그윈이 그렇다 —
//   깃발: "적 1명에 꽂는 표식… 「동상」: 스택형 둔화…"
// 그대로 두면 깃발을 눌렀는데 동상 풀이까지 같이 뜬다(실제로 그랬다).
// 「」 로 묶인 낱말을 **곁말**로 떼어 제 풀이를 준다.
//
// 다만 「」 안이 늘 낱말은 아니다. 카드 이름일 때도 있고(「최강의 수집품임」),
// 풀이에만 나오고 카드 글에는 안 나오는 말도 있다(「꽁꽁」).
// 그래서 **그 사도의 카드 글에 실제로 나오는 것만** 곁말로 친다.
const cardsOf = {};
for (const c of Object.values(B.cards)) (cardsOf[c.hero] = cardsOf[c.hero] || []).push(c);

function splitNested(key, text) {
  const mine = cardsOf[key] || [];
  const subs = {};
  // **문장 첫머리에 선 것만** 곁말로 친다.
  //   그윈  "… 드로우1. 「동상」: 스택형 둔화…"      → 앞이 마침표다. 딴 풀이다
  //   아멜리아 "…받을 때마다 「감전」 1을 공격자에게"  → 문장 한가운데다. 그냥 가리키는 말이다
  // 가운데 것까지 떼었더니 풀이가 "…받을 때마다" 에서 끊겼다(실제로 그랬다).
  const marks = [...text.matchAll(/「([^」]{2,8})」\s*[는은이가]?\s*[:：]?\s*/g)]
    .filter((m) => m.index === 0 || /[.。]\s*$/.test(text.slice(0, m.index)));
  let main = text;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const word = m[1].trim();
    if (/\d/.test(word)) continue;
    if (mine.some((c) => c.ko === word)) continue;            // 카드 이름이다
    if (!mine.some((c) => c.text.includes(word))) continue;   // 카드 글에 안 나온다
    const from = m.index + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
    subs[word] = text.slice(from, to).trim().replace(/^[,.\s]+/, "");
    if (m.index < main.length) main = text.slice(0, m.index).trim();
  }
  return { main: main.trim(), subs };
}

const heroes = {};
let nSub = 0;
for (const [key, h] of Object.entries(B.heroes)) {
  if (!h.keyword) continue;
  const { main, subs } = splitNested(key, h.keyword.text);
  nSub += Object.keys(subs).length;
  heroes[key] = { ko: h.keyword.ko, text: main, subs };
}

// 밑줄을 칠 때 긴 낱말부터 찾아야 한다 — "궁극기 게이지" 가 "궁극기" 에 먹히면 안 된다.
const order = Object.keys(words).sort((a, b) => b.length - a.length);

// 잘못 걸리는 자리를 막는다. "방어" 는 "방어력" 안에도 있다.
const NOT_AFTER = { 방어: ["력"], 공격: ["력"] };

const out = {
  _meta: {
    source: "사도 전용 키워드는 기획서(js/data/built.js), 상태·공용 키워드는 기획서 「전투 규칙」 원문, 나머지는 이 게임의 엔진(js/rules.js·js/combat.js).",
    tool: "tools/build-keywords.js",
    built: new Date().toISOString().slice(0, 10),
    note: "text 가 null 이면 기획서에 이름만 있고 풀이가 없다는 뜻이다. 지어내지 않는다.",
  },
  words, order, notAfter: NOT_AFTER, heroes,
};

const dst = path.join(HERE, "..", "js", "data", "keywords.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-keywords.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const thin = Object.values(words).filter((w) => !w.text);
console.log(`낱말 ${Object.keys(words).length}개 · 사도 전용 ${Object.keys(heroes).length}개 (곁말 ${nSub}개) → js/data/keywords.js`);
for (const kind of ["규칙", "상태", "공용"]) {
  const mine = Object.values(words).filter((w) => w.kind === kind);
  console.log(`  ${kind} ${mine.length} — ${mine.map((w) => w.ko + (w.text ? "" : "(풀이 없음)")).join(" · ")}`);
}
// 이름이 겹치는 낱말 — 뜻이 서로 다르면 사람이 한 번 봐야 한다
{
  const byName = {};
  for (const [key, h] of Object.entries(heroes)) {
    (byName[h.ko] = byName[h.ko] || []).push([key, h.text]);
    for (const [w, t] of Object.entries(h.subs)) (byName[w] = byName[w] || []).push([key, t]);
  }
  const clash = Object.entries(byName).filter(([, v]) => v.length > 1 && new Set(v.map((x) => x[1])).size > 1);
  if (clash.length) {
    console.log("");
    console.log(`  ! 이름은 같은데 뜻이 다른 낱말 ${clash.length}`);
    for (const [w, v] of clash) console.log(`    ${w} — ${v.map(([k]) => k).join(" · ")}`);
    console.log("    사도마다 제 풀이를 보여 주니 화면은 안 틀린다. 기획서 쪽에서 볼 일이다.");
  }
}

if (thin.length) {
  console.log("");
  console.log(`  ! 풀이가 없는 낱말 ${thin.length}: ${thin.map((w) => w.ko).join(" · ")}`);
  console.log("    기획서에 이름만 있습니다. 지어내지 않고 비워 둡니다 — 화면에도 그렇게 뜹니다.");
}
