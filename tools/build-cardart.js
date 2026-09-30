// 카드마다 쓸 그림을 정해 둔다. 카드 하나에 그림 하나다.
//
// 두 군데를 본다. **그린 것이 있으면 그것이 이긴다.**
//   ① assets/cardart/<사도키>/<카드id>.png   우리가 그린 카드 일러스트
//   ② assets/skillicons/…                    원작에서 꺼낸 스킬 아이콘 (임시 자리메움)
//
// ②는 원작 그림이다. 임시로 자리를 메우는 것이고, ①이 채워지는 만큼 물러난다.
// 자리 맞춤은 이렇다 —
//   icon_graduateskill_<이름>   졸업 스킬  → 고학년 스킬     (<키>_ult)
//   icon_admissionskill_<이름>  입학 스킬  → 시그니처   (<키>_u0)
//   aside_skill_<이름>_1..3     어사이드   → 고유 나머지 (<키>_u1..u3)
// 시작 카드(<키>_s0..s3)는 원작에 그림이 없다. 그린 것이 없으면 타입 무늬로 떨어진다.
//
// **고학년 스킬만 예외다.** 고학년 스킬은 인게임 고학년 스킬이고(기획서), 그 아이콘이 곧 그 사도의
// 고학년 스킬 표다. 육각 틀에 작게 들어가는 자리라 일러스트를 넣으면 잘려서 무엇인지 안 보인다.
// 그래서 <키>_ult 는 언제나 icon_graduateskill 을 쓴다 — 그려도 안 바뀐다.
//
//   node tools/build-cardart.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";
import B from "../js/data/built.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const ICONS = path.join(ROOT, "assets", "skillicons");
const DRAWN = path.join(ROOT, "assets", "cardart");

const icons = fs.existsSync(ICONS) ? new Set(fs.readdirSync(ICONS)) : new Set();
const icon = (name) => (icons.has(name + ".png") ? "assets/skillicons/" + name + ".png" : null);
// 웹에 나가는 것은 webp 를 먼저 본다. png 는 원본으로 남겨 두고,
// tools/shrink-cardart.py 가 옆에 webp 를 만들어 둔다 — 카드는 화면에서 152px 밖에 안 된다.
const drawn = (key, id) => {
  for (const ext of ["webp", "png"]) {
    const rel = `assets/cardart/${key}/${id}.${ext}`;
    if (fs.existsSync(path.join(ROOT, rel))) return rel;
  }
  return null;
};
const weigh = (rel) => { try { return fs.statSync(path.join(ROOT, rel)).size; } catch { return 0; } };

const pic = {};
const from = { drawn: 0, icon: 0, ult: 0, none: 0 };
let bytes = 0;
const missing = [];           // 아직 아무 그림도 없는 카드
const stillIcon = [];         // 아직 원작 아이콘을 쓰는 카드

for (const [key, en] of Object.entries(ARTMAP.art)) {
  // 카드 id 는 build-cards.js 가 붙인 그대로다 — <키>_s0..s3 · <키>_u0..u3, 고학년 스킬은 <키>_ult
  // 고학년 스킬은 그린 것이 있어도 원작 고학년 스킬 아이콘을 쓴다
  const ult = icon(`icon_graduateskill_${en}`);
  if (ult) { pic[`${key}_ult`] = ult; from.ult++; }
  else { from.none++; missing.push(`${key}_ult`); }

  const slots = [
    [`${key}_u0`, icon(`icon_admissionskill_${en}`)],
    [`${key}_u1`, icon(`aside_skill_${en}_1`)],
    [`${key}_u2`, icon(`aside_skill_${en}_2`)],
    [`${key}_u3`, icon(`aside_skill_${en}_3`)],
    [`${key}_s0`, null], [`${key}_s1`, null], [`${key}_s2`, null], [`${key}_s3`, null],
  ];
  for (const [id, fallback] of slots) {
    const mine = drawn(key, id);
    if (mine) { pic[id] = mine; from.drawn++; bytes += weigh(mine); continue; }
    if (fallback) { pic[id] = fallback; from.icon++; stillIcon.push(id); continue; }
    from.none++;
    missing.push(id);
  }
}

const out = {
  _meta: {
    source: "assets/cardart(우리가 그린 것) 이 먼저, 없으면 assets/skillicons(원작 아이콘).",
    tool: "tools/build-cardart.js",
    built: new Date().toISOString().slice(0, 10),
    note: "없는 자리는 아예 빠진다. 화면은 타입 무늬로 떨어진다 — 남의 카드 그림을 끌어다 쓰지 않는다.",
    drawn: from.drawn, icon: from.icon, ult: from.ult, none: from.none,
  },
  pic,
};

const dst = path.join(ROOT, "js", "data", "cardart.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-cardart.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const total = from.drawn + from.icon + from.ult + from.none;
const pc = (n) => ((n / total) * 100).toFixed(1) + "%";
console.log(`카드 자리 ${total}개 → js/data/cardart.js`);
console.log(`  고학년 스킬 ${from.ult} — 원작 고학년 스킬 아이콘 고정. 그릴 자리가 아니다`);
console.log(`  우리가 그린 것 ${from.drawn} (${pc(from.drawn)})`);
console.log(`  원작 아이콘으로 메운 것 ${from.icon} (${pc(from.icon)}) — 그린 것이 생기면 물러난다`);
console.log(`  아직 아무것도 없는 것 ${from.none} (${pc(from.none)})`);
// 무게를 잰다. 카드는 도감에서 152px, 상세에서도 그만하다.
// 장당 300KB 를 넘으면 135명 × 9장이 곧 몇 기가가 된다 — 미리 알린다.
if (from.drawn) {
  const mb = bytes / 1048576;
  const per = bytes / from.drawn / 1024;
  const all = (bytes / from.drawn) * total / 1073741824;
  console.log(`  그린 것 무게 ${mb.toFixed(1)}MB · 장당 ${per.toFixed(0)}KB · 이 속도면 ${total}장에 ${all.toFixed(1)}GB`);
  if (per > 300) console.log(`  ! 장당 300KB 가 넘습니다. 카드는 화면에서 152px 입니다 — python tools/shrink-cardart.py`);
}
if (missing.length) {
  const s = missing.filter((id) => id.includes("_s")).length;
  const u = missing.length - s;
  console.log(`    시작 카드 ${s} · 고유 카드 ${u}`);
  console.log(`    다음에 그릴 것: node tools/art-brief.js --todo`);
}
