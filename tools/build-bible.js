// 사도 인물 사전 — 그림을 그릴 때 그 사람이 어떤 사람인지 알려고 쓴다.
//
// 사도 데스크의 bible.json 에서 **그림에 쓸 몫만** 가져온다.
//   who     어떤 사람인가
//   facts   확정 설정 (종족·성격·자리)
//   traits  버릇과 성미 — 장면을 짜는 데 가장 많이 쓴다
//   quirk   말버릇·몸짓
//   mood    감정 경향 — 표정을 정한다
//   react   상황별 반응 — 카드 타입마다 표정이 달라야 한다
//   never   하지 않는 것 — 그리면 안 되는 것
//
// 말투·관계·극장 줄거리는 안 가져온다. 글 쓸 때 쓰는 것이지 그림에 쓰는 것이 아니다.
//
// **출처와 라이선스.** bible.json 은 나무위키 트릭컬 리바이브 사도 문서
// (CC BY-NC-SA 2.0 KR)를 읽고 요약·재구성한 2차적 저작물이다. 원문을 옮긴 것이 아니다.
// 이 파일도 같은 라이선스를 따른다 — 저작자표시 · 비영리 · 동일조건변경허락.
//
//   node tools/build-bible.js [사도데스크/prototype/data 경로]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || "C:/projects/사도 데스크/prototype/data";
const file = path.join(SRC, "bible.json");
if (!fs.existsSync(file)) {
  console.log(`${file} 가 없습니다. 사도 데스크 경로를 알려 주세요.`);
  process.exit(1);
}
const B = JSON.parse(fs.readFileSync(file, "utf8"));

// 저쪽 이름은 영문(erpin), 우리 키는 기획서의 한글이다. 이름표를 뒤집어 쓴다.
const KO = {};
for (const [ko, en] of Object.entries(ARTMAP.art)) KO[en] = ko;

const KEEP = ["who", "facts", "traits", "quirk", "mood", "react", "never"];

const out = { _meta: {
  source: "사도 데스크 prototype/data/bible.json — 나무위키 트릭컬 리바이브 사도 문서를 읽고 요약·재구성한 것(원문 아님).",
  license: "CC BY-NC-SA 2.0 KR (저작자표시-비영리-동일조건변경허락). 원문과 같은 조건으로 쓴다.",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/2.0/kr/",
  tool: "tools/build-bible.js",
  built: new Date().toISOString().slice(0, 10),
  note: "그림을 그릴 때 그 사람이 어떤 사람인지 보려고 쓴다. 말투·관계·극장 줄거리는 안 들어 있다.",
}, heroes: {} };

let got = 0;
const thin = [];
for (const [en, key] of Object.entries(KO)) {
  const src = B[en];
  if (!src) { thin.push(key); continue; }
  const h = {};
  for (const k of KEEP) if (src[k] != null) h[k] = src[k];
  if (!Object.keys(h).length) { thin.push(key); continue; }
  out.heroes[key] = h;
  got++;
}

const dst = path.join(HERE, "..", "js", "data", "bible.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-bible.js. 손으로 고치지 말 것.",
  "// 나무위키 유래(CC BY-NC-SA 2.0 KR). _meta 에 출처와 조건이 적혀 있다.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const size = (fs.statSync(dst).size / 1024).toFixed(0);
console.log(`사도 ${got}/${Object.keys(KO).length}명 → js/data/bible.js (${size}KB)`);
const count = (k) => Object.values(out.heroes).filter((h) => h[k] != null).length;
for (const k of KEEP) console.log(`  ${k.padEnd(7)} ${count(k)}명`);
if (thin.length) console.log(`  ! 인물 사전에 없는 사도 ${thin.length}: ${thin.slice(0, 8).join(", ")}${thin.length > 8 ? " 외" : ""}`);
