// 기획서에서 읽은 사도·카드를 게임이 쓰는 꼴로 만든다.
//
//   node tools/build-cards.js [--all]
//
// 기본은 편성에 쓰는 사도만, --all 이면 135명 전부.
// 효과는 js/effects.js 가 산문에서 읽는다. 못 읽은 것은 지우지 않고 unparsed 로 남긴다 —
// 카드가 아무 일도 안 하면서 멀쩡해 보이는 것이 가장 나쁘다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import D from "../js/data/design.js";
import { parseEffect } from "../js/effects.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 키는 **기획서의 한글 이름**으로 통일한다.
// 한때 여덟 명만 영문 키(erpin)를 쓰고 나머지는 한글이라 artmap·relations 와 어긋났다.
// 이격은 괄호가 붙는다 — 에르핀 · 에르핀(왕도) → 에르핀 · 에르핀_왕도
const seen = new Set();
function keyFor(ko) {
  let base = ko.replace(/\s+/g, "").replace(/[()]/g, "_").replace(/_$/, "");
  let key = base, n = 2;
  while (seen.has(key)) key = base + n++;
  seen.add(key);
  return key;
}

const ROW = { 전열: "front", 중열: "mid", 후열: "back" };

const heroes = {};
const cards = {};
const starter = {};
let nCard = 0, nUnparsed = 0;

const wanted = Object.values(D.heroes);   // 언제나 135명 전부

for (const h of wanted) {
  const key = keyFor(h.ko);
  const kw = h.keyword ? h.keyword.ko : null;

  heroes[key] = {
    ko: h.ko, nature: h.nature, race: h.race,
    row: h.row || ROW[h.rowKo], role: h.role, star: h.star, eldain: h.eldain,
    hp: h.hp, atk: h.atk, def: h.def, crit: h.crit, dmgType: h.dmgType,
    blurb: h.blurb, passive: h.passive, source: h.source || null,
    keyword: h.keyword || null,
    ult: h.ult ? { ...h.ult, ...parse(h.ult.text, kw, `${h.ko}/궁극기`) } : null,
  };

  const mine = [];
  // 시작 카드 — 같은 이름이 둘일 수 있다(기본공격 ×2)
  h.start.forEach((c, i) => {
    const id = `${key}_s${i}`;
    cards[id] = mk(id, key, c, kw, `${h.ko}/시작/${c.ko}`, { start: true });
    mine.push(id);
  });
  // 고유 카드 — 번뜩임 다섯을 함께 들고 있는다
  h.unique.forEach((u, i) => {
    const id = `${key}_u${i}`;
    cards[id] = {
      ...mk(id, key, u, kw, `${h.ko}/고유/${u.ko}`, { unique: true, signature: i === 0 }),
      tags: u.tags || [],
      flash: u.flash.map((f) => ({
        n: f.n, kind: f.kind, ko: f.ko, text: f.text,
        ...parse(f.text, kw, `${h.ko}/${u.ko}/${f.kind}`),
      })),
    };
  });
  starter[key] = mine;
}

function parse(text, kw, where) {
  const { fx, left } = parseEffect(text, { keyword: kw });
  if (left) nUnparsed++;
  return { fx, unparsed: left || null };
}

function mk(id, hero, c, kw, where, extra) {
  nCard++;
  return { id, hero, ko: c.ko, cost: c.cost, type: c.type, text: c.text, ...parse(c.text, kw, where), ...extra };
}

const out = {
  _meta: {
    source: "기획서(js/data/design.js) 에서 만든 것. 손으로 고치지 말 것 — 기획서를 고치고 다시 돌린다.",
    built: new Date().toISOString().slice(0, 10),
    note: "unparsed 가 있는 카드는 그만큼 효과가 덜 돈다. tools/check-effects.js 가 몇 %인지 센다.",
  },
  heroes, cards, starter,
};

const dst = path.join(HERE, "..", "js", "data", "built.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-cards.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const nH = Object.keys(heroes).length;
const withFx = Object.values(cards).filter((c) => c.fx.length).length;
console.log(`사도 ${nH}명 · 카드 ${nCard}장 → js/data/built.js (${(fs.statSync(dst).size / 1024).toFixed(0)}KB)`);
console.log(`  효과가 붙은 카드 ${withFx}/${nCard} (${((withFx / nCard) * 100).toFixed(1)}%)`);
console.log(`  글자를 다 못 읽은 곳 ${nUnparsed}`);
