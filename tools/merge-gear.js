// 장비 · 중립 카드 리뉴얼 조각(.omc/gear/*.md)을 기획서에 되돌려 넣는다.
//
//   node tools/merge-gear.js --split    기획서의 두 탭을 조각 파일로 나눈다(처음 한 번)
//   node tools/merge-gear.js            조각 파일의 「#### 이름」 덩어리를 기획서의 같은 이름 자리에 넣는다
//
// 이름으로 짝을 맞춘다 — 조각에 없는 이름은 기획서 그대로 둔다. 머리 · 원작 · 스탯 · 가격 줄이 바뀌었으면 멈춘다.
import fs from "node:fs";
import path from "node:path";
import { DESIGN_DOC } from "./lib/paths.js";

const DIR = path.join(path.dirname(DESIGN_DOC), ".omc", "gear");
const raw = fs.readFileSync(DESIGN_DOC, "utf8");
const nl = raw.includes("\r\n") ? "\r\n" : "\n";
const doc = raw.replace(/\r\n/g, "\n");

const section = (head) => {
  const a = doc.indexOf(head); if (a < 0) throw new Error("탭이 없다: " + head);
  const b = doc.indexOf("\n## ", a + 5);
  return [a, b < 0 ? doc.length : b];
};
// 「#### 이름」 덩어리 — 다음 「####」·「###」 앞까지
const blocks = (text) => {
  const out = {};
  const re = /^#### (.+)$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    let body = text.slice(m.index, end);
    const cut = body.search(/\n###? /); if (cut > 0) body = body.slice(0, cut + 1);
    out[m[1].trim()] = body.replace(/\s+$/, "") + "\n";
  });
  return out;
};

if (process.argv.includes("--split")) {
  fs.mkdirSync(DIR, { recursive: true });
  const [ea, eb] = section("## 아티팩트 → 장비"), [na, nb] = section("## 스펠 → 중립 카드");
  const eq = doc.slice(ea, eb), ne = doc.slice(na, nb);
  const bySub = (sec, subs) => subs.map((s) => { const a = sec.indexOf(s); const b = sec.indexOf("\n### ", a + 4); return sec.slice(a, b < 0 ? sec.length : b); }).join("\n");
  const files = {
    "장비_전설.md": bySub(eq, ["### 전설 ("]),
    "장비_희귀.md": bySub(eq, ["### 희귀"]),
    "장비_고급일반.md": bySub(eq, ["### 고급", "### 일반"]),
    "중립.md": ne.slice(ne.indexOf("### ")),
  };
  for (const [f, t] of Object.entries(files)) { fs.writeFileSync(path.join(DIR, f), t); console.log(`${f} — ${Object.keys(blocks(t)).length}개`); }
  process.exit(0);
}

// 합치기
const lock = (b) => b.split("\n").filter((l) => /^#### |^- \*\*스탯\*\*/.test(l) || (/^(전설|희귀|고급|일반)/.test(l))).join("\n");
let next = doc, n = 0, bad = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  for (const [name, body] of Object.entries(blocks(fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n")))) {
    const cur = blocks(next)[name];
    if (!cur) { bad.push(`${f}: 기획서에 없는 이름 「${name}」`); continue; }
    if (lock(cur) !== lock(body)) { bad.push(`${f}: 「${name}」 머리 · 원작 · 스탯 · 가격 줄이 바뀌었다`); continue; }
    if (cur !== body) { next = next.replace(cur, body); n++; }
  }
}
if (bad.length) { console.log(bad.join("\n")); process.exit(1); }
fs.writeFileSync(DESIGN_DOC, next.replace(/\n/g, nl));
console.log(`기획서에 ${n}개를 넣었습니다 → node tools/parse-design.js && node tools/build-cards.js && node tools/check-gear.js`);
