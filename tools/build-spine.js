// 꺼내 둔 스파인 가운데 게임이 쓰는 몫만 assets/spine/ 으로 골라낸다.
// 사도 데스크와 같은 방식이다 — .skel + .atlas + 텍스처를 그대로 두고 spine-webgl 이 굴린다.
//
//   node tools/build-spine.js            편성 여덟 (ingame · standing) + 미니미
//   node tools/build-spine.js --all      꺼내 둔 사도 전부
//
// ingame(전투 SD)·standing(이벤트·상점)은 사도마다 한 벌씩, minimi(맵 이동)는 모두가 한 아틀라스를 나눠 쓴다.
// enemy(적)는 enemies.js 에 있는 것만 — 먼저 python tools/extract-spine.py 로 꺼내 둔다.
// 원본(assets/ingame 등)은 건드리지 않는다. assets/ 는 통째로 .gitignore 라 저장소에도 안 들어간다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, HEROES } from "../js/data/heroes.js";
import ARTMAP from "../js/data/artmap.js";
import { ENEMIES, foeLook } from "../js/data/enemies.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AS = path.join(HERE, "..", "assets");
const OUT = path.join(AS, "spine");
const ALL = process.argv.includes("--all");

const mb = (n) => (n / 1048576).toFixed(1) + "MB";

// 한 벌 = .skel + .atlas + 아틀라스가 가리키는 텍스처들.
// 텍스처 이름은 아틀라스 안에 적혀 있으니 거기서 읽는다 — 파일 이름 짐작으로 고르면 언젠가 어긋난다.
function copySet(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return null;
  const files = fs.readdirSync(srcDir);
  const atlasName = files.find((f) => f.endsWith(".atlas"));
  const skelName = files.find((f) => f.endsWith(".skel"));
  if (!atlasName || !skelName) return null;

  const atlasText = fs.readFileSync(path.join(srcDir, atlasName), "utf8");
  const pages = atlasText.split("\n").map((l) => l.trim()).filter((l) => l.toLowerCase().endsWith(".png"));
  const missing = pages.filter((p) => !files.includes(p));
  if (missing.length) return { error: `텍스처 없음: ${missing.join(", ")}` };

  fs.mkdirSync(dstDir, { recursive: true });
  let bytes = 0;
  for (const f of [atlasName, skelName, ...pages]) {
    fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
    bytes += fs.statSync(path.join(srcDir, f)).size;
  }
  return { atlas: atlasName, skel: skelName, pages, bytes };
}

const manifest = { _meta: { built: new Date().toISOString().slice(0, 10) }, ingame: {}, standing: {}, minimi: null };
let total = 0;
const trouble = [];

for (const kind of ["ingame", "standing"]) {
  const src = path.join(AS, kind);
  if (!fs.existsSync(src)) { trouble.push(`${kind} 을 아직 안 꺼냈습니다`); continue; }
  // 기획서 사도는 이름 표(artmap)가 어느 폴더인지 안다. 추출물은 영문 이름이다.
  const names = ALL
    ? fs.readdirSync(src).filter((n) => fs.statSync(path.join(src, n)).isDirectory()).map((n) => [n, n])
    : Object.entries(ARTMAP.art);
  for (const [key, dir] of names) {
    const got = copySet(path.join(src, dir), path.join(OUT, kind, key));
    if (!got) { trouble.push(`${kind}/${key} — 한 벌이 안 갖춰졌습니다`); continue; }
    if (got.error) { trouble.push(`${kind}/${key} — ${got.error}`); continue; }
    manifest[kind][key] = { atlas: got.atlas, skel: got.skel, pages: got.pages };
    total += got.bytes;
  }
}
// 사도가 아닌 스탠딩 — 상점의 골디. 키는 영문 폴더 이름 그대로
for (const [key, dir] of Object.entries({ goldy: "goldy" })) {
  const got = copySet(path.join(AS, "standing", dir), path.join(OUT, "standing", key));
  if (!got || got.error) { trouble.push(`standing/${key} — ${got ? got.error : "한 벌이 안 갖춰졌습니다"}`); continue; }
  manifest.standing[key] = { atlas: got.atlas, skel: got.skel, pages: got.pages };
  total += got.bytes;
}

// 적 — tools/extract-spine.py 가 assets/monsterspine 에 꺼내 둔다. 폴더 이름이 곧 그림(foeLook(key).art)이다.
// 같은 몬스터의 성격 갈래 · 누루링의 종족 갈래는 그림 한 벌을 스킨으로 나눠 입는다 — 그림마다 한 번만 담는다(art.js 도 그림 이름으로 찾는다)
manifest.enemy = {};
const msrc = path.join(AS, "monsterspine");
if (!fs.existsSync(msrc)) trouble.push("적 스파인을 아직 안 꺼냈습니다 — python tools/extract-spine.py");
else {
  for (const key of new Set(Object.keys(ENEMIES).map((k) => foeLook(k).art))) {
    const got = copySet(path.join(msrc, key), path.join(OUT, "enemy", key));
    if (!got) { trouble.push(`enemy/${key} — 한 벌이 안 갖춰졌습니다`); continue; }
    if (got.error) { trouble.push(`enemy/${key} — ${got.error}`); continue; }
    manifest.enemy[key] = { atlas: got.atlas, skel: got.skel, pages: got.pages };
    total += got.bytes;
  }
}

// 미니미는 한 아틀라스를 모두가 나눠 쓴다
const mini = copySet(path.join(AS, "minimi"), path.join(OUT, "minimi"));
if (mini && !mini.error) {
  manifest.minimi = { atlas: mini.atlas, skel: mini.skel, pages: mini.pages };
  total += mini.bytes;
} else trouble.push("minimi — " + (mini ? mini.error : "아직 안 꺼냈습니다"));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

const ni = Object.keys(manifest.ingame).length, ns = Object.keys(manifest.standing).length;
const ne = Object.keys(manifest.enemy).length;
console.log(`전투 SD ${ni}명 · 스탠딩 ${ns}명 · 적 그림 ${ne}/${new Set(Object.keys(ENEMIES).map((k) => foeLook(k).art)).size}벌(${Object.keys(ENEMIES).length}종) · 미니미 ${manifest.minimi ? "있음" : "없음"} · ${mb(total)} → assets/spine/`);
for (const t of trouble) console.log(`  ! ${t}`);
if (!ALL) {
  const miss = Object.keys(ARTMAP.art).filter((k) => !manifest.ingame[k] || !manifest.standing[k]);
  if (miss.length) console.log(`  덜 갖춰진 사도 ${miss.length}명 — 그 자리는 그림 한 장으로 떨어집니다`);
  else console.log(`  기획서 사도 ${Object.keys(ARTMAP.art).length}명 모두 세 벌이 갖춰졌습니다.`);
}
