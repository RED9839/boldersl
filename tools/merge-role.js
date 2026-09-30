// 다시 쓴 사도 몇 명(.omc/redesign-role/*.md)을 기획서에 끼우고, 윗부분의 사도 표를 사도 블록에 맞춘다.
//
//   node tools/merge-role.js            끼우기 + 표 맞추기 (기획서를 고친다 — git 이 백업이다)
//   node tools/merge-role.js --table    표만 맞추기
//
// 끼우기: 파일마다 「### 이름 (…」 머리 줄이 기획서와 **한 글자도 다르지 않은** 덩어리를 찾아 통째로 바꾼다.
//   머리가 다르면 끼우지 않고 알린다. 덩어리는 다음 「### 」 나 「## 」 앞에서 끝난다.
// 표 맞추기: 표(| 이름 | 성격 | … | 고학년 스킬 (비용) |)는 파서가 읽지 않는 요약이라 블록과 어긋나곤 했다
//   (우이(기억)의 고학년 비용이 표 200% · 블록 250%). 그래서 js/data/design.js(블록을 읽은 것)로 다시 쓴다.
//   먼저 node tools/parse-design.js 를 돌린 뒤에 표를 맞춘다 — 이 도구가 순서대로 부른다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DESIGN_DOC } from "./lib/paths.js";

const ROOT = path.dirname(DESIGN_DOC);
const DIR = path.join(ROOT, ".omc", "redesign-role");
const onlyTable = process.argv.includes("--table");
const raw = fs.readFileSync(DESIGN_DOC, "utf8");
const nl = raw.includes("\r\n") ? "\r\n" : "\n";
let doc = raw.replace(/\r\n/g, "\n");

if (!onlyTable) {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md")) : [];
  let n = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n").trim() + "\n";
    const head = text.split("\n")[0];
    if (!head.startsWith("### ")) { console.log(`  ! ${f} — 「### 」 로 시작하지 않는다`); continue; }
    const a = doc.indexOf(head + "\n");
    if (a < 0) { console.log(`  ! ${f} — 기획서에 같은 머리가 없다: ${head}`); continue; }
    const rest = doc.slice(a + head.length + 1);
    const m = rest.match(/\n(?=###? )/);
    const b = m ? a + head.length + 1 + m.index + 1 : doc.length;
    doc = doc.slice(0, a) + text + "\n" + doc.slice(b).replace(/^\n+/, "");
    n++;
  }
  fs.writeFileSync(DESIGN_DOC, doc.replace(/\n/g, nl));
  console.log(`사도 ${n}명을 끼웠습니다`);
}

// 표 맞추기 — 블록을 새로 읽은 뒤
execFileSync("node", [path.join(ROOT, "tools", "parse-design.js")], { stdio: "ignore" });
const D = (await import(`../js/data/design.js?t=${Date.now()}`)).default;
const byKo = Object.fromEntries(Object.values(D.heroes).map((h) => [h.ko, h]));
doc = fs.readFileSync(DESIGN_DOC, "utf8").replace(/\r\n/g, "\n");
let fixed = 0;
doc = doc.replace(/^\| ([^|\n]+?) \| (순수|광기|냉정|우울|활발|공명) \|[^\n]*$/gm, (line, name) => {
  const h = byKo[name.trim()];
  if (!h) return line;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  const pos = h.anyRow ? `모든 열 ${h.role}` : `${h.rowKo} ${h.role}`;
  const ult = h.ult ? `${h.ult.ko} (${h.ult.cost}%)` : cells[12];
  const next = [h.ko, h.nature, h.race, pos, `${h.star}성`, h.eldain ? "○" : cells[5], String(h.hp), String(h.atk), String(h.def), `${h.crit}%`, h.dmgType || cells[10], h.keyword ? h.keyword.ko : cells[11], ult];
  const out = `| ${next.join(" | ")} |`;
  if (out !== line) fixed++;
  return out;
});
fs.writeFileSync(DESIGN_DOC, doc.replace(/\n/g, nl));
console.log(`표 ${fixed}줄을 블록에 맞췄습니다 → node tools/build-cards.js`);
