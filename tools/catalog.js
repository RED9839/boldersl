// 꺼낸 것을 훑어 무엇이 있는지 적는다. assets/catalog.json 하나만 만들고, 파일은 건드리지 않는다.
// 1.8GB 가 통째로 필요한 게 아니라 "누구 것이 어떤 형태로 있는가"가 필요하기 때문이다.
//   node tools/catalog.js [assets 경로]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, HEROES } from "../js/data/heroes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AS = process.argv[2] || path.join(HERE, "..", "assets");

if (!fs.existsSync(AS)) { console.log(`${AS} 가 없습니다. 먼저 추출하세요 — README 참고.`); process.exit(1); }

const dirSize = (d) => {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
};
const mb = (n) => (n / 1048576).toFixed(1) + "MB";

// 종류마다 이름 짜임이 다르다. 사도 이름이 어디 박혀 있는지 종류별로 알려 준다.
//   heroicons/ingame/standing/voice  erpinskin3       → erpin
//   skillicons                       icon_graduateskill_erpin / aside_skill_erpin_1 → erpin
const STRIP = [/^aside_skill_/, /^icon_(graduate|admission|user)skill_/, /^icon_userprofile_/, /^icon_/];
function heroName(kind, raw) {
  let n = String(raw).toLowerCase();
  if (kind === "monster") return null;   // 몬스터는 사도가 아니다 — 개수만 세고 사도 목록엔 넣지 않는다
  if (kind === "skillicons") {
    let hit = false;
    for (const re of STRIP) if (re.test(n)) { n = n.replace(re, ""); hit = true; break; }
    if (!hit) return null;              // 사도와 무관한 UI 아이콘
    n = n.replace(/_\d+$/, "");
  }
  // 스킨·별형 꼬리를 떼어 기본형으로 모은다
  return n.replace(/(skin\d+|_alba|awaken|r\d+|graduate|sister|chaos)$/i, "") || null;
}

const cat = { _meta: { built: new Date().toISOString().slice(0, 10), root: path.resolve(AS) }, kinds: {}, heroes: {} };

for (const kind of ["heroicons", "skillicons", "monster", "ingame", "standing", "minimi", "voice", "sfx"]) {
  const d = path.join(AS, kind);
  if (!fs.existsSync(d)) { cat.kinds[kind] = { 있음: false }; continue; }
  const entries = fs.readdirSync(d, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  cat.kinds[kind] = { 있음: true, 폴더: dirs.length, 파일: files.length, 용량: mb(dirSize(d)) };

  // 누구 것인지 — 폴더 이름 또는 파일 이름(확장자 뺀 것)
  const names = dirs.length ? dirs : files.map((f) => f.replace(/\.[^.]+$/, ""));
  for (const n of names) {
    const base = heroName(kind, n);
    if (!base) continue;
    const h = (cat.heroes[base] = cat.heroes[base] || {});
    (h[kind] = h[kind] || []).push(n);
  }
}

// 편성에 쓰는 여덟은 따로 본다 — 빠진 것이 있으면 바로 알아야 한다
const need = ["heroicons", "ingame", "standing"];
cat.roster = {};
for (const k of ROSTER) {
  const h = cat.heroes[k] || {};
  cat.roster[k] = { ko: HEROES[k].ko };
  for (const kind of need) cat.roster[k][kind] = (h[kind] || []).length;
}

fs.writeFileSync(path.join(AS, "catalog.json"), JSON.stringify(cat, null, 1));

console.log("종류별");
for (const [k, v] of Object.entries(cat.kinds))
  console.log(v.있음 ? `  ${k.padEnd(11)} ${String(v.폴더 || v.파일).padStart(5)}개 · ${v.용량}` : `  ${k.padEnd(11)} 없음`);

const withIcon = Object.keys(cat.heroes).filter((k) => (cat.heroes[k].heroicons || []).length);
const withSpine = Object.keys(cat.heroes).filter((k) => (cat.heroes[k].ingame || []).length);
console.log("");
console.log(`사도 — 아이콘 ${withIcon.length}명 · 인게임 스파인 ${withSpine.length}명 (스킨은 기본형으로 묶음)`);
const iconOnly = withIcon.filter((k) => !(cat.heroes[k].ingame || []).length);
if (iconOnly.length) console.log(`  아이콘만 있는 것 ${iconOnly.length}: ${iconOnly.slice(0, 10).join(", ")}${iconOnly.length > 10 ? " 외" : ""}`);
console.log("\n편성 여덟");
let missing = 0;
for (const k of ROSTER) {
  const r = cat.roster[k];
  const line = need.map((n) => `${n} ${r[n]}`).join(" · ");
  const bad = need.some((n) => !r[n]);
  if (bad) missing++;
  console.log(`  ${bad ? "!" : " "} ${r.ko.padEnd(5)} ${line}`);
}
console.log(missing ? `\n${missing}명이 뭔가 빠졌습니다` : "\n여덟 다 갖춰졌습니다");
console.log(`\n→ ${path.join(AS, "catalog.json")}`);
