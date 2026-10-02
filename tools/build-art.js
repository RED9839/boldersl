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
import { ENEMIES, foeLook } from "../js/data/enemies.js";
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

// 미니미(minimi_*)는 tools/build-minimi.py 가 같은 목록에 적는다 — 새로 쓸 때 지우지 않게 이어받는다
const manifest = {};
try {
  const old = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  for (const [k, v] of Object.entries(old)) if (k.startsWith("minimi_")) manifest[k] = v;
} catch { /* 처음이면 없다 */ }
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

// 적 그림 — 싸움터에 서는 모습(enemies.js foeLook: 어느 스파인 · 어느 스킨)과 **같은 것만** 쓴다.
// 몬스터 아이콘은 스킨 꼬리표가 붙어 있다(icon_<이름><성격 · none>.png) — 꼬리표가 입는 스킨과 같은 것.
// 없으면 그 스파인을 그 스킨으로 찍어 둔 것(still_<이름>_<스킨>.png — tools/build-foe-stills.py). 둘 다 없으면 자리표시.
// 전에는 이름이 앞머리만 맞으면 아무 아이콘이나 집어서(성격 다른 것 · 종족 인형 아이콘) 싸움터의 모습과 색이 달랐다.
// 무엇을 골랐는지 foe-icons.json 에 적는다 — tools/check-spine.js 가 모습과 맞는지 본다.
const MSRC = path.join(AS, "monster");
let foes = 0;
const foeIcons = {}, noIcon = [];
if (fs.existsSync(MSRC)) {
  const all = new Set(fs.readdirSync(MSRC).filter((f) => f.endsWith(".png")));
  for (const key of Object.keys(ENEMIES)) {
    const { art, skin } = foeLook(key);
    const tail = (skin || "").replace(/^Skin_/, "").toLowerCase();
    const pick = [`icon_${art}${tail}.png`, `still_${art}_${tail || "default"}.png`].find((f) => all.has(f));
    if (!pick) { noIcon.push(key); continue; }
    fs.copyFileSync(path.join(MSRC, pick), path.join(OUT, key + ".png"));
    manifest[key] = key + ".png";
    foeIcons[key] = { from: pick, art, skin };
    foes++;
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, "foe-icons.json"), JSON.stringify(foeIcons, null, 1));
}

const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`사도 ${copied}장${skins ? ` · 스킨 ${skins}장` : ""} · 적 ${foes}장 · ${(size / 1048576).toFixed(1)}MB → assets/sd/`);
if (noIcon.length) console.log(`모습에 맞는 그림이 없는 적: ${noIcon.join(", ")} — python tools/build-foe-stills.py 로 찍어 두세요`);

if (missing.length) {
  console.log(`  그림을 못 찾은 사도 ${missing.length}: ${missing.slice(0, 6).join(", ")}`);
} else console.log(`  기획서 사도 ${Object.keys(ARTMAP.art).length}명 모두 그림이 있습니다.`);
