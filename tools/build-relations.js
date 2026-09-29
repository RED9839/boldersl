// 사도 데스크의 relations.json / bible.json 에서 이 게임이 쓰는 몫만 추린다.
// 통계(동반 등장 횟수)와 호칭 낱말만 가져오고, 대사 원문은 가져오지 않는다.
//   node tools/build-relations.js [사도데스크/prototype/data 경로]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.argv[2] || "C:/projects/사도 데스크/prototype/data";

const R = JSON.parse(fs.readFileSync(path.join(SRC, "relations.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(SRC, "bible.json"), "utf8"));

// 편성이 135명이 됐으니 관계도 전부 뽑는다. bible.json 에 있는 사도를 모두 본다.
const ROSTER = Object.keys(B).filter((k) => k !== "_meta");

// 키는 기획서의 한글 이름으로 낸다.
// 사도 데스크 쪽 이름은 영문(gabia)이고 우리 사도 키는 한글이라, 그대로 내면
// pairCount 가 언제나 0 이 된다 — 실제로 그랬고 "사이가 없다"로 보였다.
// 이름 표(artmap)가 한글 → 영문이니 뒤집어 쓴다. 표에 없는 사도는 제 이름 그대로 둔다.
const KO = {};
for (const [ko, en] of Object.entries(ARTMAP.art)) KO[en] = ko;
const nm = (k) => KO[k] || k;

const out = {
  _meta: {
    source: "사도 데스크 relations.json (게임 음성 말뭉치 통계) — 횟수와 호칭 낱말만. 대사 원문 없음.",
    built: new Date().toISOString().slice(0, 10),
    roster: ROSTER.length,
  },
  ko: {}, nature: {}, pairs: {}, calls: {},
};

for (const k of ROSTER) out.ko[nm(k)] = (R[k] || B[k] || {}).ko || k;

// 성격 — 트릭컬의 실제 속성 체계(순수·광기·냉정·우울·활발).
// bible.json 의 facts 에 "성격 분류: X" 로 적혀 있다. 138명 중 126명.
// 게임 파일에서도 확인된다 — 몬스터 아이콘 227장이 naive/mad/cool/gloomy/jolly 꼬리표를 달고 있다.
out.nature = {};
for (const k of ROSTER) {
  const text = JSON.stringify(B[k] || {});
  const m = text.match(/성격 분류: ([^.,·"]+)/);
  if (m) out.nature[nm(k)] = m[1].trim();
}

const key = (a, b) => [a, b].sort().join("|");
for (let i = 0; i < ROSTER.length; i++) {
  for (let j = i + 1; j < ROSTER.length; j++) {
    const a = ROSTER[i], b = ROSTER[j];
    const n = ((R[a] || {}).with || {})[b] || ((R[b] || {}).with || {})[a] || 0;
    out.pairs[key(nm(a), nm(b))] = n;
  }
}

// 호칭: 가장 많이 쓴 형태 하나만. "(반말 호격)" 같은 주석은 떼어 낸다.
for (const a of ROSTER) {
  const c = (R[a] || {}).calls || {};
  for (const b of ROSTER) {
    if (a === b || !c[b] || !c[b].length) continue;
    const best = c[b].slice().sort((x, y) => y.n - x.n)[0];
    const form = String(best.form).replace(/\s*\(.*\)\s*$/, "").trim();
    if (form) (out.calls[nm(a)] = out.calls[nm(a)] || {})[nm(b)] = { form, n: best.n };
  }
}

// .js 로 내보낸다 — file:// 로 열어도 돌아가도록(모듈 import 는 되지만 fetch 는 막힌다)
const dst = path.join(__dirname, "..", "js", "data", "relations.js");
const body = [
  "// 자동 생성 — tools/build-relations.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out, null, 1) + ";",
  "",
].join("\n");
fs.writeFileSync(dst, body);

const nz = Object.values(out.pairs).filter((n) => n > 0).length;
const nc = Object.values(out.calls).reduce((a, o) => a + Object.keys(o).length, 0);
console.log(`짝 ${Object.keys(out.pairs).length}개 중 ${nz}개에 수치 · 호칭 ${nc}개 · 성격 ${Object.keys(out.nature).length}명 → ${path.relative(process.cwd(), dst)}`);
