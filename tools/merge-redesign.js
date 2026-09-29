// 새로 쓴 사도 글(.omc/redesign/*.md)을 기획서에 끼워 넣는다.
//
//   node tools/merge-redesign.js                 사본(.omc/redesign/_기획서.md)에 — 원본은 안 건드린다
//   node tools/merge-redesign.js --write         바탕화면 기획서에 (먼저 _스킬재구성전.md 로 백업)
//
// 사도는 「### 이름 (성격 · …)」 머리로 찾는다. 이름이 기획서와 한 글자라도 다르면 끼우지 않고 알린다.
// 기획서는 LF 다 — 줄 끝을 바꾸지 않는다(한 번 CRLF 로 바꿨다가 파서가 0장을 읽은 적이 있다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DESIGN = "C:/Users/User/Desktop/볼더슬/트릭컬_기획서_전체.md";
const DIR = path.join(ROOT, ".omc", "redesign");
const write = process.argv.includes("--write");

const src = fs.readFileSync(DESIGN, "utf8");
// 「에르핀(왕도) (순수 …」 — 이름 뒤 빈칸이 경계다. 빈칸 없이 괄호까지 자르면 에르핀(왕도)가 에르핀이 된다(실제로 그랬다)
const nameOf = (block) => (block.match(/^###\s+(.+?)\s+\(/) || [])[1];

// 기획서를 ### 덩어리로 가른다 — 덩어리는 다음 ### 이나 ## 앞에서 끝난다
const lines = src.split("\n");
const spans = [];
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith("### ")) continue;
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith("### ") && !lines[j].startsWith("## ")) j++;
  spans.push({ name: nameOf(lines[i]), from: i, to: j });
}
const byName = new Map(spans.filter((s) => s.name).map((s) => [s.name, s]));

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_")) : [];
const repl = new Map();
const trouble = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n").trim();
  for (const block of text.split(/^(?=### )/m).filter((b) => b.startsWith("### "))) {
    const name = nameOf(block);
    if (!byName.has(name)) { trouble.push(`${f}: 기획서에 「${name}」 이 없다`); continue; }
    if (repl.has(name)) trouble.push(`${f}: 「${name}」 이 두 번 나온다 — 뒤의 것을 쓴다`);
    repl.set(name, block.trim());
  }
}

// 뒤에서부터 바꿔 끼워야 앞의 줄 번호가 안 밀린다
const out = lines.slice();
for (const sp of [...spans].sort((a, b) => b.from - a.from)) {
  if (!repl.has(sp.name)) continue;
  // 덩어리 끝의 빈 줄은 살린다
  let end = sp.to;
  while (end > sp.from && out[end - 1].trim() === "") end--;
  out.splice(sp.from, end - sp.from, ...repl.get(sp.name).split("\n"));
}
const merged = out.join("\n");

const dst = write ? DESIGN : path.join(DIR, "_기획서.md");
if (write) {
  const bak = DESIGN.replace(/\.md$/, "_스킬재구성전.md");
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, src);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, merged);
console.log(`${repl.size}명 끼움 / 기획서 ${byName.size}명 → ${dst}`);
for (const t of trouble) console.log(`  ! ${t}`);
process.exit(trouble.length ? 1 : 0);
