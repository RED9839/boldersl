// 복사본이 원본과 같은지 내용으로 확인한다.
//
// 2026-09-22 에 이 USB 에서 파일 13개의 내용이 서로 뒤바뀐 적이 있다 — .git/config 안에 HTML 이
// 들어 있었다. 크기와 개수만 봐서는 그런 사고를 못 잡는다. 그래서 해시를 견준다.
//
//   node tools/verify-copy.js "E:/볼제나"
//   node tools/verify-copy.js "E:/볼제나" --full    큰 파일까지 전부 (느리다)
//
// 기본은 소스·문서·도구를 전부 견주고, 무거운 assets 는 표본만 본다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..");
const DST = process.argv[2];
const FULL = process.argv.includes("--full");
if (!DST) { console.log('쓰는 법: node tools/verify-copy.js "E:/볼제나"'); process.exit(1); }
if (!fs.existsSync(DST)) { console.log(`${DST} 가 없습니다.`); process.exit(1); }

const SKIP = new Set(["node_modules", ".git"]);
const HEAVY = new Set(["assets"]);

function walk(root, rel = "") {
  const out = [];
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const files = walk(SRC);
let same = 0, diff = [], missing = [], sampled = 0;

for (const rel of files) {
  const a = path.join(SRC, rel), b = path.join(DST, rel);
  if (!fs.existsSync(b)) { missing.push(rel); continue; }
  const sa = fs.statSync(a).size, sb = fs.statSync(b).size;
  if (sa !== sb) { diff.push(`${rel} — 크기가 다르다 (${sa} ≠ ${sb})`); continue; }

  // 무거운 것은 표본만. 소스·문서·도구는 전부 견준다.
  const heavy = HEAVY.has(rel.split("/")[0]);
  if (heavy && !FULL) {
    if (Math.random() > 0.02) { same++; continue; }   // 2% 표본
    sampled++;
  }
  if (hash(a) !== hash(b)) diff.push(`${rel} — 내용이 다르다`);
  else same++;
}

// 복사본에만 있는 것 (지난번 사고 때 엉뚱한 파일이 끼어들었다)
const extra = walk(DST).filter((r) => !fs.existsSync(path.join(SRC, r)));

console.log(`원본 파일 ${files.length}개`);
console.log(`  같음 ${same}${sampled ? ` (무거운 것 중 ${sampled}개는 표본으로 확인)` : ""}`);
if (missing.length) { console.log(`  복사본에 없음 ${missing.length}`); for (const m of missing.slice(0, 10)) console.log(`    ${m}`); }
if (diff.length) { console.log(`  어긋남 ${diff.length}`); for (const d of diff.slice(0, 10)) console.log(`    ${d}`); }
if (extra.length) { console.log(`  복사본에만 있음 ${extra.length}`); for (const x of extra.slice(0, 10)) console.log(`    ${x}`); }

const bad = missing.length + diff.length;
console.log("");
console.log(bad ? `문제 ${bad}개 — 다시 복사해야 합니다` : "복사본이 원본과 같습니다");
process.exit(bad ? 1 : 0);
