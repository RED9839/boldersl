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
import { parsePassive } from "../js/passive.js";

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
    ult: h.ult ? { ...h.ult, ...parse(h.ult.text, kw, `${h.ko}/고학년 스킬`) } : null,
  };

  const mine = [];
  // 시작 카드 — 같은 이름이 둘일 수 있다(기본공격 ×2)
  h.start.forEach((c, i) => {
    const id = `${key}_s${i}`;
    cards[id] = mk(id, key, c, kw, `${h.ko}/시작/${c.ko}`, { start: true });
    mine.push(id);
  });
  // 고유 카드 — 신탁 다섯을 함께 들고 있는다
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

// ── 중립 카드 — 어느 사도에도 속하지 않는다. 골디의 상점에서 판다 ─────────────
// cards 와 따로 둔다: 사도 카드 1,080장을 세는 검사들이 이것까지 세지 않게.
// **다 읽힌 것만 판다**(playable). 반쯤 읽힌 카드는 사면 반만 도는데 멀쩡해 보인다 — 가장 나쁜 경우다.
const neutral = {};
let nNeutral = 0, nPlayable = 0;
for (const c of Object.values(D.neutral || {})) {
  const id = "중립_" + c.ko.replace(/\s+/g, "").replace(/[\[\]()]/g, "");
  const { fx, left } = parseEffect(c.text);
  // 남은 글자가 문장 부호뿐이어야 다 읽힌 것이다. 「고학년 게이지」 의 「고학년 스킬」 만 예외(게이지 규칙이 뒤쪽만 먹는다).
  // 한 글자라도 남으면 판에서 빼는 이유 — 「전열 아군」 에서 「전열」 을 못 읽으면 전원에게 걸리고,
  // 「물리 아군」 을 못 읽으면 아무에게나 걸린다. 반쯤 읽힌 카드는 틀리게 돈다.
  const rest = (left || "").replace(/고학년(?:\s*스킬)?|궁극기/g, "").replace(/[\s.,·()%+\-]/g, "");
  const playable = fx.length > 0 && rest.length === 0;
  nNeutral++; if (playable) nPlayable++;
  neutral[id] = {
    id, hero: null, neutral: true, ko: c.ko, cost: c.cost, type: c.type, tags: c.tags,
    text: c.text, grade: c.grade, price: c.price, oneOnly: c.oneOnly, blurb: c.blurb,
    fx, unparsed: left && rest.length ? left : null, playable,
    flash: c.flash,
  };
}

// ── 장비 — 스탯 줄은 늘 돈다. 효과 줄은 **다 읽힐 때만** 켠다(effectOn) ─────────────
// 지금 게임이 켜는 것은 스탯 줄과 애착 Lv.3 스탯뿐이다. 효과·애착 카드 강화는 규칙이 붙는 대로 켠다.
const equip = {};
let nEquip = 0, nEffRead = 0;
const heroByKo = Object.fromEntries(Object.entries(heroes).map(([k, h]) => [h.ko, k]));
for (const e of Object.values(D.equip || {})) {
  const id = "장비_" + e.ko.replace(/\s+/g, "").replace(/[\[\]()]/g, "");
  // 효과 · 애착은 패시브 문법이다(docs/13-장비와 중립.md). 한 글자라도 못 읽으면 켜지 않는다 — tools/check-gear.js 가 막는다
  const strict = (t, kw = []) => { if (!t) return false; const rs = parsePassive(t.includes(":") ? t : "효과: " + t, kw); return rs.length > 0 && rs.every((r) => r.fx.length && !r.left); };
  const effect = e.effect && !/^없음/.test(e.effect) ? e.effect.replace(/\s*\[[^\]]+\]/g, "").trim() : null;
  const affinityPassive = e.affinityText ? e.affinityText.replace(/\s*Lv\.3:.*$/, "").trim() || null : null;
  const affKw = e.affinity && heroes[heroByKo[e.affinity]] && heroes[heroByKo[e.affinity]].keyword ? [heroes[heroByKo[e.affinity]].keyword.ko] : [];
  const effectRead = strict(effect), affinityRead = strict(affinityPassive, affKw);
  nEquip++; if (effectRead) nEffRead++;
  equip[id] = {
    id, ko: e.ko, grade: e.grade, global: e.global, slot: e.slot, blurb: e.blurb,
    affinity: e.affinity ? heroByKo[e.affinity] || null : null, affinityKo: e.affinity,
    stats: e.stats, effect, effectRead, affinityText: e.affinityText, affinityPassive, affinityRead, affinityLv3: e.affinityLv3,
  };
}

const out = {
  _meta: {
    source: "기획서(js/data/design.js) 에서 만든 것. 손으로 고치지 말 것 — 기획서를 고치고 다시 돌린다.",
    built: new Date().toISOString().slice(0, 10),
    note: "unparsed 가 있는 카드는 그만큼 효과가 덜 돈다. tools/check-effects.js 가 몇 %인지 센다.",
  },
  heroes, cards, starter, neutral, equip,
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
console.log(`  장비 ${nEquip}종 — 스탯 줄 전부 · 효과가 전투에서 켜지는 것 ${nEffRead}종(나머지는 스탯만)`);
console.log(`  중립 카드 ${nNeutral}장 중 효과가 다 도는 것 ${nPlayable}장 — 상점은 이것만 판다`);
