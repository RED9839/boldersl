// 기획서 사도 135명을 꺼내 둔 그림에 잇는다.
//
// 기획서는 한글 이름을 쓰고(에르핀 · 에르핀(왕도)), 그림은 영문 파일명이다(erpin · erpinroyale).
// bible.json 이 그 둘을 잇는 다리다 — { "erpin": { "ko": "에르핀" } }.
//
//   node tools/link-art.js [사도데스크/prototype/data 경로]
//
// 이 파일이 만드는 것은 이름 표 하나뿐이다. 그림을 고르고 옮기는 것은 build-art.js 가 한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import D from "../js/data/design.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || "C:/projects/사도 데스크/prototype/data";
const B = JSON.parse(fs.readFileSync(path.join(SRC, "bible.json"), "utf8"));

// 이격은 bible 과 기획서의 표기가 다르다. 이름으로 못 이은 것만 여기 적는다.
// (왜 다른지: bible 은 "우이"만 두고, 기획서는 "우이(기억)"처럼 이격을 따로 센다)
const BY_HAND = {
  "우이(기억)": "uimemory",
  "비비(신성)": "vividivine",
  "시온 더 다크불릿": "xxionx",
};

// bible 의 ko → 영문 키
const ko2key = {};
for (const [k, v] of Object.entries(B)) {
  if (k === "_meta" || !v.ko) continue;
  (ko2key[v.ko] = ko2key[v.ko] || []).push(k);
}

// 실제로 꺼내 둔 그림 (heroicons 가 원본이다)
const iconDir = path.join(HERE, "..", "assets", "heroicons");
const icons = fs.existsSync(iconDir)
  ? new Set(fs.readdirSync(iconDir).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")))
  : new Set();

const map = {};
const miss = [];

for (const [key, h] of Object.entries(D.heroes)) {
  // ① 손으로 적어 둔 것
  let art = BY_HAND[h.ko];
  // ② bible 의 이름으로
  if (!art) {
    const cands = ko2key[h.ko] || [];
    art = cands.find((c) => icons.has(c)) || cands[0];
  }
  if (!art) { miss.push(`${h.ko} — bible 에 이름이 없다`); continue; }
  if (icons.size && !icons.has(art)) { miss.push(`${h.ko} → ${art} — 그림이 없다`); continue; }
  map[key] = art;
}

const out = {
  _meta: {
    note: "기획서 사도 → 꺼내 둔 그림 파일 이름. tools/link-art.js 가 bible.json 으로 이었다.",
    built: new Date().toISOString().slice(0, 10),
    byHand: Object.keys(BY_HAND).length,
  },
  art: map,
};

const dst = path.join(HERE, "..", "js", "data", "artmap.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/link-art.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out, null, 1) + ";",
  "",
].join("\n"));

const n = Object.keys(map).length, all = Object.keys(D.heroes).length;
console.log(`${n}/${all} 명을 그림에 이었다 → js/data/artmap.js`);
if (icons.size) console.log(`  꺼내 둔 아이콘 ${icons.size}장 중 ${n}장을 쓴다`);
if (miss.length) { console.log(`  못 이은 ${miss.length}:`); for (const m of miss) console.log(`    ${m}`); }
process.exit(miss.length ? 1 : 0);
