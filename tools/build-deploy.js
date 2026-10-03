// 웹 공개판을 dist/ 에 짓는다 — Cloudflare Pages 에 폴더째 올린다(npm run deploy).
//
//   node tools/build-deploy.js          dist/ 를 새로 짓고 크기 · 파일 수를 잰다
//
// 코드(index.html · css · js · vendor)와 **게임이 실제로 읽는 그림만** 싣는다. 추출 원본(assets/standing · ingame ·
// monsterspine … 1.7GB)은 빠진다. 목소리는 편성 대사(decksetting)만 — 사용자가 정한 범위다.
// dist/ 는 저장소에 넣지 않는다(.gitignore). 원작 파일이 공개 저장소에 쌓이지 않게.
//
// Cloudflare Pages 제한: 한 배포 파일 2만 개 · 파일 하나 25MB. 넘으면 여기서 멈춘다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const A = (p) => path.join(ROOT, "assets", p);

// 게임이 읽는 그림 폴더 — js/ 에서 assets/<폴더> 를 찾아 고른 것(spine-view · art · ui · data)
const ASSET_DIRS = ["spine", "bg", "skillicons", "gear", "spell", "cardart", "uiicons", "sd", "monster"];
// 폴더에서 몇 장만 — 재화 아이콘은 골드 하나
const ASSET_FILES = ["currency/CurrencyIcon_0008.png"];
// 목소리 — 편성 대사 · 고학년 대사(컷인, 2026-10 사용자). 스킨 전용(_skinN)은 게임이 안 쓰니 뺀다(js/voice.js voiceSet)
const VOICE_CATS = new Set(["decksetting", "ultimate"]);
const MAX_FILES = 20000, MAX_BYTES = 25 * 1024 * 1024;

let files = 0, bytes = 0, biggest = { f: "", n: 0 };
function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const n = fs.statSync(dst).size;
  files++; bytes += n;
  if (n > biggest.n) biggest = { f: path.relative(DIST, dst), n };
}
function copyDir(src, dst, skip = () => false) {
  if (!fs.existsSync(src)) { console.log(`  ! 없음 — ${path.relative(ROOT, src)} (그 자리는 자리표시로 떨어진다)`); return; }
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (skip(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, skip); else copyFile(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// ① 코드
copyFile(path.join(ROOT, "index.html"), path.join(DIST, "index.html"));
for (const d of ["css", "js", "vendor"]) copyDir(path.join(ROOT, d), path.join(DIST, d));
const codeFiles = files, codeBytes = bytes;

// ② 그림
for (const d of ASSET_DIRS) copyDir(A(d), path.join(DIST, "assets", d));
for (const f of ASSET_FILES) if (fs.existsSync(A(f))) copyFile(A(f), path.join(DIST, "assets", f));

// ③ 목소리 — 편성 · 고학년 대사만, 색인도 그 갈래만 남긴다(없는 갈래는 게임이 조용히 넘어간다)
const vIndexPath = A("voice/index.json");
if (fs.existsSync(vIndexPath)) {
  const idx = JSON.parse(fs.readFileSync(vIndexPath, "utf8"));
  const out = {};
  for (const [hero, skins] of Object.entries(idx)) {
    const base = skins.base || {};
    const keep = Object.fromEntries(Object.entries(base).filter(([c]) => VOICE_CATS.has(c)).map(([c, l]) => [c, l.filter((f) => !/_skin\d/.test(f))]));
    if (!Object.keys(keep).length) continue;
    out[hero] = { base: keep };
    for (const list of Object.values(keep)) for (const f of list) copyFile(A("voice/" + f), path.join(DIST, "assets/voice", f));
  }
  fs.mkdirSync(path.join(DIST, "assets/voice"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "assets/voice/index.json"), JSON.stringify(out));
  files++;
  console.log(`  목소리 — 편성 대사 ${Object.keys(out).length}명`);
} else console.log("  ! 목소리 색인이 없다 — 목소리 없이 싣는다");

// ③-2 궁극기 이펙트 — 색인과 사도별 fx.json, 거기서 실제로 부르는 그림만(tools/extract-fx.py). 없으면 게임은 이펙트 없이 돈다
const fxIndexPath = A("fx/index.json");
if (fs.existsSync(fxIndexPath)) {
  const before = { files, bytes };
  const idx = JSON.parse(fs.readFileSync(fxIndexPath, "utf8"));
  copyFile(fxIndexPath, path.join(DIST, "assets/fx/index.json"));
  const pngs = new Set();
  for (const hero of new Set(Object.values(idx.effects).map((e) => e.hero))) {
    const fxPath = A(`fx/${hero}/fx.json`);
    if (!fs.existsSync(fxPath)) continue;
    copyFile(fxPath, path.join(DIST, `assets/fx/${hero}/fx.json`));
    for (const fx of Object.values(JSON.parse(fs.readFileSync(fxPath, "utf8")))) for (const e of fx.em) pngs.add(e.tex);
  }
  let miss = 0;
  for (const t of pngs) if (fs.existsSync(A("fx/" + t))) copyFile(A("fx/" + t), path.join(DIST, "assets/fx", t)); else miss++;
  console.log(`  이펙트 — 사도 ${Object.keys(idx.heroes).length}명 · 그림 ${pngs.size}장 · ${files - before.files}개 ${((bytes - before.bytes) / 1024 / 1024).toFixed(1)}MB${miss ? ` (그림 ${miss}장 없음)` : ""}`);
} else console.log("  ! 이펙트 색인이 없다 — 이펙트 없이 싣는다");

// ③-3 구운 이펙트 — 색인과 거기 적힌 시트 쪽만(tools/fx-baked.py). 없으면 그 이펙트는 위의 파티클 흉내로 돈다
const bakedIndexPath = A("fx-baked/index.json");
if (fs.existsSync(bakedIndexPath)) {
  const before = { files, bytes };
  const idx = JSON.parse(fs.readFileSync(bakedIndexPath, "utf8"));
  copyFile(bakedIndexPath, path.join(DIST, "assets/fx-baked/index.json"));
  let miss = 0;
  for (const e of Object.values(idx.effects)) for (const p of e.pages) {
    if (fs.existsSync(A("fx-baked/" + p.file))) copyFile(A("fx-baked/" + p.file), path.join(DIST, "assets/fx-baked", p.file)); else miss++;
  }
  console.log(`  구운 이펙트 — ${Object.keys(idx.effects).length}개 · ${files - before.files}개 ${((bytes - before.bytes) / 1024 / 1024).toFixed(1)}MB${miss ? ` (시트 ${miss}쪽 없음)` : ""}`);
}

// ③-4 효과음 — js/data/sfx-map.js 가 부르는 것만: 공용 갈래 + 사도 · 적의 제 소리(갈래 꼬리에 맞는 것). 색인도 그만큼만(tools/extract-sfx.py)
const sfxIndexPath = A("sfx/index.json");
if (fs.existsSync(sfxIndexPath)) {
  const before = { files, bytes };
  const { SFX, HERO_KINDS, ENEMY_KINDS, kindsIn, monsterDir, SLOT_GROUPS, slotsIn } = await import("../js/data/sfx-map.js");
  const { HERO_DATA } = await import("../js/cardbook.js");
  const { ENEMIES } = await import("../js/data/enemies.js");
  const ARTMAP = (await import("../js/data/artmap.js")).default;
  const idx = JSON.parse(fs.readFileSync(sfxIndexPath, "utf8"));
  const keys = Object.keys(idx), want = new Set();
  for (const e of Object.values(SFX)) for (const f of e.f) want.add(f);
  for (const k of Object.keys(HERO_DATA)) {
    const d = ARTMAP.art[k] && String(ARTMAP.art[k]).toLowerCase();
    if (d) for (const l of Object.values(kindsIn(keys, "hero", d, HERO_KINDS))) for (const f of l) want.add(f);
    if (d) for (const g of Object.keys(SLOT_GROUPS)) for (const f of slotsIn(keys, d, g).list) want.add(f);   // 동작 소리 칸(SFX 이벤트로 트는 것)
  }
  const mdirs = new Set(keys.filter((k) => k.startsWith("monster/")).map((k) => k.split("/")[1]));
  for (const k of Object.keys(ENEMIES)) {
    const d = monsterDir(k, mdirs);
    if (d) for (const l of Object.values(kindsIn(keys, "monster", d, ENEMY_KINDS))) for (const f of l) want.add(f);
  }
  const out = {};
  let miss = 0;
  for (const f of [...want].sort()) {
    if (!idx[f] || !fs.existsSync(A(`sfx/${f}.ogg`))) { miss++; continue; }
    copyFile(A(`sfx/${f}.ogg`), path.join(DIST, `assets/sfx/${f}.ogg`));
    out[f] = idx[f];
  }
  fs.mkdirSync(path.join(DIST, "assets/sfx"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "assets/sfx/index.json"), JSON.stringify(out));
  files++;
  console.log(`  효과음 — ${Object.keys(out).length}개 ${((bytes - before.bytes) / 1024 / 1024).toFixed(1)}MB${miss ? ` (${miss}개 없음)` : ""}`);
} else console.log("  ! 효과음 색인이 없다 — 효과음 없이 싣는다");

// ④ Cloudflare 설정 — 그림은 오래 붙들고(바뀌면 이름이 같아도 배포마다 새로), 코드는 늘 새로
fs.writeFileSync(path.join(DIST, "_headers"), [
  "/assets/*",
  "  Cache-Control: public, max-age=86400",
  "/js/*",
  "  Cache-Control: no-cache",
  "/css/*",
  "  Cache-Control: no-cache",
  "",
].join("\n"));
files++;

const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
console.log(`\ndist/ — 파일 ${files}개 · ${mb(bytes)} (코드 ${codeFiles}개 ${mb(codeBytes)})`);
console.log(`  가장 큰 파일 ${biggest.f} ${mb(biggest.n)}`);
let bad = false;
if (files > MAX_FILES) { console.log(`  ✗ 파일이 ${MAX_FILES}개를 넘는다`); bad = true; }
if (biggest.n > MAX_BYTES) { console.log(`  ✗ 25MB 를 넘는 파일이 있다`); bad = true; }
if (bad) process.exit(1);
console.log("  ✓ Cloudflare Pages 제한 안");
