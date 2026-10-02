// 정리해 둔 스파인이 실제로 읽히는지 본다. 브라우저 없이 자료 쪽만 검사한다 —
// 아틀라스가 가리키는 텍스처가 다 있는지, .skel 이 스파인 4.x 인지, 미니미에 그 사도 스킨이 있는지.
//
// 그림이 안 나오는 사고는 대개 "파일은 있는데 안이 비었다" 쪽이라, 있는지만 봐서는 못 잡는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";
import D from "../js/data/design.js";
import { ENEMIES, foeLook } from "../js/data/enemies.js";

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

// vendor/spine-webgl.min.js 는 package.json 의 spine-webgl 을 그대로 옮겨 둔 것이다. 그 부 버전(4.1)만 본다.
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));
const RUNTIME = ((PKG.dependencies || {})["@esotericsoftware/spine-webgl"] || "").match(/4\.\d+/)?.[0] || null;

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
  // 4.x 는 앞쪽 어딘가에 버전 문자열 "4.1.08" 같은 것이 들어 있다
  const head = skel.subarray(0, 64).toString("latin1");
  const ver = head.match(/4\.\d+/);
  if (!ver) return fail(`${label} — 스파인 4.x 가 아닌 듯하다`);
  // 바이너리는 부 버전끼리도 안 읽힌다 — 4.3 런타임에 4.1 .skel 을 주면 "String in string table must not be null".
  // 이렇게 되면 화면은 조용히 그림 한 장으로 떨어져서 눈으로는 잘 안 보인다.
  if (RUNTIME && ver[0] !== RUNTIME) return fail(`${label} — .skel 은 ${ver[0]}, 런타임은 ${RUNTIME} (package.json)`);

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

// 적은 없어도 게임은 돈다(그림 한 장으로 떨어진다) — 없는 것은 실패가 아니라 알림만
console.log("적");
{
  const enemy = man.enemy || {};
  const keys = Object.keys(ENEMIES);
  // 다른 적의 그림을 빌려 쓰는 적(enemies.js art — 햇팽이 마녀 → hatsnail)은 그 그림으로 본다
  const artOf = (k) => foeLook(k).art;
  let good = 0;
  const noSkin = [];
  for (const k of keys) {
    const a = artOf(k);
    if (!enemy[a]) continue;
    const before = bad;
    const q = console.log; console.log = () => {};
    checkSet("enemy", k, enemy[a], path.join(ROOT, "enemy", a));
    console.log = q;
    if (bad === before) good++;
    // 싸움터에서 입는 스킨(적어 둔 것 · 성격 스킨)이 그 스파인에 정말 있나 — 없으면 기본 스킨으로 서서 아이콘 · 이름과 모습이 어긋난다
    const skin = foeLook(k).skin, skel = path.join(ROOT, "enemy", a, enemy[a].skel);
    if (skin && fs.existsSync(skel) && !fs.readFileSync(skel).includes(Buffer.from(skin))) noSkin.push(`${k}(${skin})`);
  }
  const miss = keys.filter((k) => !enemy[artOf(k)]);
  ok(`${good}/${keys.length}종이 읽힌다`);
  if (noSkin.length) fail(`스파인에 없는 스킨을 입는 적 ${noSkin.length}: ${noSkin.join(", ")}`);
  else ok("적마다 입는 스킨(적어 둔 것 · 성격)이 그 스파인에 있다");
  if (miss.length) console.log(`  알림 스파인 없는 적 ${miss.length}종 — 그림 한 장으로 나온다: ${miss.join(", ")}`);
}

// 적 아이콘(지도 · 「나오는 적」 · 적 정보 · 도감의 그림 한 장)이 싸움터의 모습과 같은가 — tools/build-art.js 가 고른 것(foe-icons.json)을 본다.
// 아이콘의 스킨 꼬리표(icon_<그림><스킨>) 또는 같은 스킨으로 찍은 것(still_<그림>_<스킨>)이어야 한다
console.log("");
console.log("적 아이콘");
{
  const sd = path.join(HERE, "..", "assets", "sd");
  const file = path.join(sd, "foe-icons.json");
  if (!fs.existsSync(file)) console.log("  알림 assets/sd/foe-icons.json 이 없다 — node tools/build-art.js 를 돌리면 생긴다");
  else {
    const got = JSON.parse(fs.readFileSync(file, "utf8"));
    const wrong = [];
    for (const k of Object.keys(ENEMIES)) {
      const { art, skin } = foeLook(k), tail = (skin || "").replace(/^Skin_/, "").toLowerCase();
      const g = got[k];
      if (!g) { wrong.push(`${k}: 아이콘 없음`); continue; }
      if (![`icon_${art}${tail}.png`, `still_${art}_${tail || "default"}.png`].includes(g.from)) wrong.push(`${k}: ${g.from} ≠ ${art} ${skin || "기본"}`);
      else if (!fs.existsSync(path.join(sd, k + ".png"))) wrong.push(`${k}: assets/sd/${k}.png 없음`);
    }
    if (wrong.length) fail(`싸움터 모습과 다른 적 아이콘 ${wrong.length} — python tools/build-foe-stills.py 와 node tools/build-art.js 를 다시: ${wrong.slice(0, 6).join(" · ")}`);
    else ok(`적 ${Object.keys(ENEMIES).length}종 아이콘이 모두 싸움터의 스파인 · 스킨과 같다 (아이콘 ${Object.values(got).filter((g) => g.from.startsWith("icon_")).length} · 찍은 것 ${Object.values(got).filter((g) => g.from.startsWith("still_")).length})`);
  }
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
