// 기획서(마크다운)를 읽어 게임 데이터로 만든다.
//
// 기획서가 원본이고 이 파일이 만든 js/data/design.js 는 그 사본이다.
// **기획서를 고치면 다시 돌리면 된다.** 손으로 옮기면 6,703줄이 곧 어긋난다.
//
//   node tools/parse-design.js [기획서 경로]
//
// 사도 한 명은 이렇게 생겼다 — 135명 모두 같은 꼴이다(확인했다).
//
//   ### 에르핀 (순수 · 요정 · 후열 딜러 · 태생 3성)
//   (설명 한 줄)
//   **스탯** HP 55 · 공격 15 · 방어 2 · 치명 10% · 마법
//   **패시브** 여왕의 식탐: 간식 3개가 되면 자동으로 먹고 AP +1
//   **키워드 「간식」** 스택당 다음 공격 카드 배율 +30%p
//   **시작 카드 4장** (기본공격 2 · 강공격 1 · 쉴드 1)
//   - **마력탄**(1·공격) 공격력 100% 피해
//   **고유 카드 4장**
//   - **마력탄 폭주** (1·공격, 시그니처) …
//       - ① 강화 *마력탄 대난사*: …
//   **궁극기 (고학년 · 덱 밖 · 비용 300%)** **돌겨어어어!!! 억⋯?** — …
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHeroBlock, slug } from "./lib/hero-block.js";
import { parseNeutral } from "./lib/neutral-block.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || DESIGN_DOC;
const text = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");   // CRLF 여도 읽는다(0장 사고)


const trouble = [];
const warn = (m) => trouble.push(m);

// ── 사도 블록 가르기 ───────────────────────────────────────────────────
const blocks = text.split(/^### /m).slice(1);
const heroes = {};
let nCard = 0, nFlash = 0;

for (const raw of blocks) {
  const h = parseHeroBlock(raw, warn);
  if (!h) continue;
  nCard += h.start.length + h.unique.length;
  nFlash += h.unique.reduce((a, u) => a + u.flash.length, 0);
  const key = slug(h.ko);
  if (heroes[key]) warn(`키가 겹친다: ${h.ko} → ${key}`);
  heroes[key] = h;
}

// ── 중립 카드 — 골디의 상점에서 판다 ─────────────────────────────────
const neutral = parseNeutral(text, warn);

// ── 내보내기 ───────────────────────────────────────────────────────────
const out = {
  _meta: {
    source: path.basename(SRC),
    note: "기획서에서 자동으로 읽은 것이다. 기획서가 원본이고 이 파일은 사본이다 — 손으로 고치지 말 것.",
    built: new Date().toISOString().slice(0, 10),
  },
  heroes,
  neutral,
};

const dst = path.join(HERE, "..", "js", "data", "design.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/parse-design.js. 손으로 고치지 말 것.",
  "// 원본은 저장소 맨 위의 기획서(트릭컬_기획서_전체.md)다. 기획서를 고치고 다시 돌리면 된다.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const n = Object.keys(heroes).length;
const byNature = {};
for (const h of Object.values(heroes)) byNature[h.nature] = (byNature[h.nature] || 0) + 1;
console.log(`사도 ${n}명 · 카드 ${nCard}장 · 번뜩임 ${nFlash}개 → js/data/design.js (${(fs.statSync(dst).size / 1024).toFixed(0)}KB)`);
console.log(`  중립 카드 ${Object.keys(neutral).length}장 (상점용)`);
console.log(`  성격: ${Object.entries(byNature).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
if (trouble.length) {
  console.log(`  못 읽은 것 ${trouble.length}:`);
  for (const t of trouble.slice(0, 20)) console.log(`    ${t}`);
  if (trouble.length > 20) console.log(`    … 그 밖 ${trouble.length - 20}개`);
}
process.exit(trouble.length ? 1 : 0);
