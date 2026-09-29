// 정리해 둔 스파인이 실제로 읽히는지 본다. 브라우저 없이 자료 쪽만 검사한다 —
// 아틀라스가 가리키는 텍스처가 다 있는지, .skel 이 스파인 4.x 인지, 미니미에 그 사도 스킨이 있는지.
//
// 그림이 안 나오는 사고는 대개 "파일은 있는데 안이 비었다" 쪽이라, 있는지만 봐서는 못 잡는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";
import D from "../js/data/design.js";

// 기획서 사도가 명단이다. 이름은 기획서 것을 쓴다.
const ROSTER = Object.keys(ARTMAP.art);
const HEROES = D.heroes;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "assets", "spine");

if (!fs.existsSync(path.join(ROOT, "manifest.json"))) {
  console.log("assets/spine 이 없습니다. 먼저 정리하세요: npm run spine");
  process.exit(1);
}
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let bad = 0;
const fail = (m) => { console.log(`  실패 ${m}`); bad++; };
const ok = (m) => console.log(`  ok   ${m}`);

// 아틀라스에서 영역 이름을 읽는다 (이 판은 속성 줄에 들여쓰기가 없다 — 콜론 유무로 가른다)
function atlasRegions(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.includes(":")) continue;
    if (line.toLowerCase().endsWith(".png")) continue;
    out.push(line);
  }
  return out;
}

function checkSet(kind, key, set, dir) {
  const label = kind === "minimi" ? "미니미" : `${kind}/${HEROES[key] ? HEROES[key].ko : key}`;
  for (const f of [set.atlas, set.skel, ...set.pages]) {
    if (!fs.existsSync(path.join(dir, f))) return fail(`${label} — ${f} 가 없다`);
  }
  // .skel 은 스파인 4.x 바이너리다. 안이 비었거나 다른 것이면 여기서 걸린다.
  const skel = fs.readFileSync(path.join(dir, set.skel));
  if (skel.length < 1000) return fail(`${label} — .skel 이 너무 작다 (${skel.length}B)`);
  // 4.x 는 앞쪽 어딘가에 버전 문자열 "4."이 들어 있다
  const head = skel.subarray(0, 64).toString("latin1");
  if (!/4\.\d/.test(head)) return fail(`${label} — 스파인 4.x 가 아닌 듯하다`);

  const text = fs.readFileSync(path.join(dir, set.atlas), "utf8");
  const regions = atlasRegions(text);
  if (regions.length < 2) return fail(`${label} — 아틀라스에 영역이 없다`);

  // 텍스처가 실제로 PNG 인지
  for (const p of set.pages) {
    const b = fs.readFileSync(path.join(dir, p)).subarray(0, 8);
    if (b[0] !== 0x89 || b.toString("latin1", 1, 4) !== "PNG") return fail(`${label} — ${p} 가 PNG 가 아니다`);
  }
  ok(`${label} — 영역 ${regions.length}개 · 텍스처 ${set.pages.length}장`);
  return regions;
}

// 135명을 한 줄씩 찍으면 읽을 수가 없다. 문제가 있는 것만 짚고 나머지는 세어 알린다.
for (const kind of ["ingame", "standing"]) {
  console.log(kind === "ingame" ? "전투 SD" : "스탠딩");
  let good = 0;
  for (const k of ROSTER) {
    const set = man[kind][k];
    if (!set) { fail(`${(HEROES[k] || {}).ko || k} — 없다`); continue; }
    const before = bad;
    const q = { log: console.log };
    console.log = () => {};                 // 한 명씩의 ok 는 삼킨다
    const r = checkSet(kind, k, set, path.join(ROOT, kind, k));
    console.log = q.log;
    if (bad === before) good++;
  }
  ok(`${good}/${ROSTER.length}명이 읽힌다`);
  console.log("");
}

console.log("");
console.log("미니미");
if (!man.minimi) fail("미니미가 없다");
else {
  const regions = checkSet("minimi", null, man.minimi, path.join(ROOT, "minimi"));
  // 미니미는 한 아틀라스를 모두가 나눠 쓴다 — 편성 여덟이 다 들어 있어야 한다
  if (regions) {
    // 아틀라스 영역은 영문 파스칼 표기(Erpin)고 우리 키는 기획서 한글 이름이다.
    // 이름 표(artmap)로 옮겨 견뤄야 한다 — 그냥 견주면 135명 전부 없다고 나온다(실제로 그랬다).
    const lower = new Set(regions.map((r) => r.toLowerCase()));
    const miss = ROSTER.filter((k) => !lower.has(String(ARTMAP.art[k] || k).toLowerCase()));
    if (miss.length) fail(`아틀라스에 없는 사도 ${miss.length}명: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? " 외" : ""}`);
    else ok(`기획서 ${ROSTER.length}명이 모두 아틀라스에 있다`);
  }
}

console.log("");
console.log(bad ? `문제 ${bad}개` : "정리해 둔 스파인이 모두 읽힌다");
process.exit(bad ? 1 : 0);
