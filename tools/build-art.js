// 꺼낸 것 가운데 게임이 실제로 쓰는 몫만 assets/sd/ 로 골라낸다.
// 1.8GB 를 그대로 웹에 물릴 수는 없다 — 편성 여덟의 아이콘 몇 장이면 된다.
//
//   node tools/build-art.js            편성 여덟만 (기본)
//   node tools/build-art.js --all      이름이 잡힌 사도 전부 (나중에 사도를 늘릴 때)
//   node tools/build-art.js --skins    스킨까지
//
// 원본(assets/heroicons 등)은 건드리지 않는다. assets/ 는 통째로 .gitignore 라 저장소에도 안 들어간다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, HEROES } from "../js/data/heroes.js";
import { ENEMIES } from "../js/data/enemies.js";
import ARTMAP from "../js/data/artmap.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AS = path.join(HERE, "..", "assets");
const SRC = path.join(AS, "heroicons");
const OUT = path.join(AS, "sd");

const argv = process.argv.slice(2);
const SKINS = argv.includes("--skins");

if (!fs.existsSync(SRC)) {
  console.log(`${SRC} 가 없습니다. 먼저 아이콘을 꺼내세요:`);
  console.log(`  python tools/extract-icons.py --out assets`);
  process.exit(1);
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".png"));
const have = new Set(files.map((f) => f.replace(/\.png$/i, "")));
const SKIN_TAIL = /(skin\d+)$/i;

const manifest = {};
let copied = 0, skins = 0;
const missing = [];

fs.mkdirSync(OUT, { recursive: true });

// ① 기획서 사도 — 이름 표(artmap)가 어느 그림인지 알고 있다.
//    기획서는 한글 이름, 그림은 영문 파일명이라 tools/link-art.js 가 둘을 이어 둔다.
for (const [key, art] of Object.entries(ARTMAP.art)) {
  if (!have.has(art)) { missing.push(`${key} → ${art}`); continue; }
  fs.copyFileSync(path.join(SRC, art + ".png"), path.join(OUT, key + ".png"));
  manifest[key] = key + ".png";
  copied++;
  // 스킨까지 — 같은 앞머리를 가진 것들
  if (SKINS) {
    for (const f of files) {
      const stem = f.replace(/\.png$/i, "");
      if (stem === art || !stem.startsWith(art) || !SKIN_TAIL.test(stem)) continue;
      const id = key + stem.slice(art.length);
      fs.copyFileSync(path.join(SRC, f), path.join(OUT, id + ".png"));
      manifest[id] = id + ".png";
      skins++;
    }
  }
}

// ② 기획서에 없지만 옛 이름으로 쓰던 여덟 명 — 이름이 같으면 이미 위에서 들어갔다.
for (const k of ROSTER) {
  if (manifest[k] || !have.has(k)) continue;
  fs.copyFileSync(path.join(SRC, k + ".png"), path.join(OUT, k + ".png"));
  manifest[k] = k + ".png";
  copied++;
}

if (!copied) {
  console.log("골라낼 것이 없습니다. --all 이나 --skins 를 붙여 보세요.");
  process.exit(1);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

// 적 그림 — 몬스터 아이콘은 성격 꼬리표가 붙어 있다(icon_<이름><성격>.png).
// 그 적의 성격에 맞는 것을 고른다. 없으면 아무거나, 그것도 없으면 자리표시로 떨어진다.
const MSRC = path.join(AS, "monster");
const NATURE_EN = { 순수: "naive", 광기: "mad", 냉정: "cool", 우울: "gloomy", 활발: "jolly" };
let foes = 0;
if (fs.existsSync(MSRC)) {
  const all = fs.readdirSync(MSRC).filter((f) => f.endsWith(".png"));
  for (const [key, e] of Object.entries(ENEMIES)) {
    const want = NATURE_EN[e.nature];
    const hits = all.filter((f) => f.startsWith(`icon_${key}`));
    if (!hits.length) continue;
    const pick = hits.find((f) => f === `icon_${key}${want}.png`) || hits.find((f) => f.endsWith("none.png")) || hits[0];
    fs.copyFileSync(path.join(MSRC, pick), path.join(OUT, key + ".png"));
    manifest[key] = key + ".png";
    foes++;
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
}

const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`사도 ${copied}장${skins ? ` · 스킨 ${skins}장` : ""} · 적 ${foes}장 · ${(size / 1048576).toFixed(1)}MB → assets/sd/`);
const noFoe = Object.keys(ENEMIES).filter((k) => !manifest[k]);
if (noFoe.length) console.log(`못 찾은 적: ${noFoe.join(", ")}`);

if (missing.length) {
  console.log(`  그림을 못 찾은 사도 ${missing.length}: ${missing.slice(0, 6).join(", ")}`);
} else console.log(`  기획서 사도 ${Object.keys(ARTMAP.art).length}명 모두 그림이 있습니다.`);
