// v4 전체 리뉴얼 — 묶음 작업이 사도마다 따로 쓴 글(.omc/v4/<사도>.md, 「### 이름 (…)」 한 덩어리)을 기획서에 끼운다.
// 여럿이 큰 기획서를 동시에 고치면 꼬이니, 각자는 자기 파일만 쓰고 합치기는 여기서 한 번에 한다.
//
//   node tools/merge-v4.js                     .omc/v4/*.md 를 기획서에 끼운다(제자리)
//   node tools/merge-v4.js --out 어디.md        기획서는 그대로 두고 합친 사본만 쓴다(묶음이 자기 글을 미리 볼 때)
//   node tools/merge-v4.js --only 란,셰럼       그 사도만
//   node tools/merge-v4.js --dry               무엇을 바꿀지만 말한다
import fs from "node:fs";
import path from "node:path";
import { DESIGN_DOC } from "./lib/paths.js";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const only = (opt("--only") || "").split(",").filter(Boolean);
const dir = opt("--dir") || ".omc/v4";
const out = opt("--out");
const dry = args.includes("--dry");

// 「다야(퓨어샤인) (…)」 — 이격 이름의 괄호는 이름에 붙어 있고, 머리 묶음(성격 · 종족 …) 괄호 앞에만 빈칸이 있다
const nameOf = (head) => head.replace(/^###\s+/, "").replace(/\s+\(.*$/, "").trim();
const doc = fs.readFileSync(DESIGN_DOC, "utf8").replace(/\r\n/g, "\n");
const lines = doc.split("\n");
// 기획서의 사도 덩어리 — 「### 」 줄부터 다음 「### 」 · 「## 」 줄 앞까지
const blocks = new Map();
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith("### ")) continue;
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith("### ") && !lines[j].startsWith("## ")) j++;
  blocks.set(nameOf(lines[i]), { from: i, to: j });
}

if (!fs.existsSync(dir)) { console.log(`${dir} 가 없습니다`); process.exit(1); }
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
const repl = [];
let bad = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").trim();
  const heads = text.split("\n").filter((l) => l.startsWith("### "));
  if (heads.length !== 1) { console.log(`  ✗ ${f} — 「### 」 줄이 하나여야 한다 (${heads.length})`); bad++; continue; }
  const ko = nameOf(heads[0]);
  if (only.length && !only.includes(ko)) continue;
  const b = blocks.get(ko);
  if (!b) { console.log(`  ✗ ${f} — 기획서에 「### ${ko}」 가 없다`); bad++; continue; }
  // 덩어리 끝의 빈 줄은 남긴다(다음 사도와 사이)
  let to = b.to; while (to > b.from && lines[to - 1].trim() === "") to--;
  repl.push({ ko, from: b.from, to, body: text.split("\n") });
}
repl.sort((a, b) => b.from - a.from);              // 뒤에서부터 바꿔야 앞 줄 번호가 안 밀린다
for (const r of repl) lines.splice(r.from, r.to - r.from, ...r.body);
console.log(`${dry ? "(미리 보기) " : ""}끼울 사도 ${repl.length}명${bad ? ` · 문제 ${bad}개` : ""}: ${repl.map((r) => r.ko).reverse().join(", ")}`);
if (dry || bad) process.exit(bad ? 1 : 0);
const target = out || DESIGN_DOC;
fs.writeFileSync(target, lines.join("\n").replace(/\n/g, doc.includes("\r\n") ? "\r\n" : "\n"));
console.log(`썼다: ${target}`);
