// 사도 한 명을 다시 쓸 때 볼 것을 한 번에 보여 준다.
//
//   node tools/show-hero.js 네르
//
//   ① 지금 기획서의 글   ② 설정 요약(js/data/bible.js — 나무위키를 우리 말로 줄인 것)
//   ③ 나무위키 요약 파일 경로(.omc/research/namu/<키>.brief.md — 스킬·어사이드·평가)
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BIBLE from "../js/data/bible.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DESIGN = DESIGN_DOC;
const name = process.argv[2];
if (!name) { console.log("쓰는 법: node tools/show-hero.js 이름   (기획서 이름 그대로 — 에르핀(왕도))"); process.exit(2); }

const text = fs.readFileSync(DESIGN, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const at = lines.findIndex((l) => l.startsWith(`### ${name} (`));
if (at < 0) { console.log(`기획서에 「${name}」 이 없다`); process.exit(1); }
let end = at + 1;
while (end < lines.length && !lines[end].startsWith("### ") && !lines[end].startsWith("## ")) end++;
console.log("① 지금 기획서\n");
console.log(lines.slice(at, end).join("\n").trim());

const key = name.replace(/\s+/g, "").replace(/[()]/g, "_").replace(/_$/, "");
const base = name.replace(/\(.+\)$/, "");
const b = (BIBLE.heroes || {})[name] || (BIBLE.heroes || {})[key] || (BIBLE.heroes || {})[base];
console.log("\n② 설정 요약 (bible.js)\n");
if (b) {
  console.log(b.who || "");
  for (const f of b.facts || []) console.log("- " + f);
  if (b.quirk) console.log("말버릇: " + b.quirk);
} else console.log("(없음)");

const brief = path.join(ROOT, ".omc", "research", "namu", key + ".brief.md");
console.log(`\n③ 나무위키 요약: ${fs.existsSync(brief) ? brief : "(없음)"}`);
console.log(`   전문: ${path.join(ROOT, ".omc", "research", "namu", key + ".txt")}`);
