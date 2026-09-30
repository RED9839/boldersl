// 장비(아티팩트) · 중립 카드(스펠) 검사 — docs/13-장비와 중립.md 의 규칙대로 쓰였는가.
//
//   node tools/check-gear.js                     기획서 전체
//   node tools/check-gear.js 파일.md [파일.md …]  리뉴얼 중인 조각 파일(### 장비 / ### 중립 탭 모양 그대로)
//   --quiet                                      ✗ 만 보인다
//
// 장비의 효과 · 애착 줄은 패시브 문법(js/passive.js), 중립 카드는 카드 문법(js/effects.js)으로 읽는다.
// 한 글자라도 못 읽으면 게임이 그 줄을 켜지 않는다 — 여기서 ✓ 가 될 때까지 고친다.
import fs from "node:fs";
import { DESIGN_DOC } from "./lib/paths.js";
import { parseEquip } from "./lib/equip-block.js";
import { parseNeutral } from "./lib/neutral-block.js";
import { parsePassive } from "../js/passive.js";
import { parseEffect } from "../js/effects.js";
import { valueOf, baseValue } from "./lib/card-value.js";
import D from "../js/data/design.js";
// 애착 줄은 그 사도의 키워드(「간식」 따위)를 써도 된다 — 그 사도가 낄 때만 켜지니까
const KW = Object.fromEntries(Object.values(D.heroes).map((h) => [h.ko, h.keyword ? h.keyword.ko : null]));

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const files = args.filter((a) => !a.startsWith("--"));
const texts = (files.length ? files : [DESIGN_DOC]).map((f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
// 조각 파일은 탭 머리가 없을 수 있다 — 붙여서 읽는다
const wrap = (t, head) => (t.includes(head) ? t : `${head}\n\n${t}`);

// 등급별 한도 — 늘 켜진 증감(항상)의 최대 % · 조건부/한 턴 증감의 최대 %
const CAP = { 일반: { always: 4, burst: 10 }, 고급: { always: 6, burst: 15 }, 희귀: { always: 8, burst: 20 }, 전설: { always: 10, burst: 30 } };
const MODS = ["dealtMod", "takenMod", "atkMod", "defMod", "critMod"];
const RESOURCE = ["ap", "draw", "gauge"];

let ok = 0, bad = 0;
const report = (name, errs, notes) => {
  if (errs.length) { bad++; console.log(`✗ ${name}`); for (const e of errs) console.log(`    ${e}`); }
  else { ok++; if (!quiet) console.log(`✓ ${name}${notes.length ? "  — " + notes.join(" · ") : ""}`); }
};

function checkRules(text, where, grade, errs, { allowAlways, kw = [] }) {
  const rules = parsePassive(text.includes(":") ? text : `${where}: ${text}`, kw);
  if (!rules.length) { errs.push(`${where} — 비었다`); return rules; }
  for (const r of rules) {
    if (!r.fx.length) errs.push(`${where} — 효과를 하나도 못 읽었다: ${r.text}`);
    if (r.left) errs.push(`${where} — 못 읽은 말: 「${r.left}」 (${r.text})`);
    const cap = CAP[grade] || CAP.전설;
    for (const f of r.fx) {
      if (MODS.includes(f.k)) {
        const pct = Math.abs(Math.round((f.v || 0) * 100));
        const lim = r.when.on === "always" ? cap.always : cap.burst;
        if (pct > lim) errs.push(`${where} — ${f.k} ${pct}% 는 ${grade} 한도(${r.when.on === "always" ? "항상" : "발동"} ${lim}%)를 넘는다`);
      }
      if (RESOURCE.includes(f.k) && !r.limit && r.when.on !== "fightStart") errs.push(`${where} — AP · 드로우 · 게이지를 주면 (턴당 1회)·(전투당 1회)를 붙인다`);
    }
    if (r.when.on === "always" && !r.conds.length && r.fx.every((f) => MODS.includes(f.k)) && !allowAlways)
      errs.push(`${where} — 늘 켜진 % 증감뿐이다(${grade}). 언제 발동하는지(카드 N장마다 · 처치하면 · 맞으면 · HP N% 이하…)와 엮는다`);
  }
  return rules;
}

// ── 장비 ────────────────────────────────────────────────────────────────
const equips = {};
for (const t of texts) Object.assign(equips, parseEquip(wrap(t, "## 아티팩트 → 장비"), () => {}));
for (const e of Object.values(equips)) {
  const errs = [], notes = [];
  const eff = e.effect && !/^없음/.test(e.effect) ? e.effect.replace(/\s*\[[^\]]+\]/g, "").trim() : null;
  if (!eff && e.grade !== "일반") errs.push(`효과가 없다 — ${e.grade} 이상은 하는 일이 하나는 있어야 한다`);
  if (eff) {
    const rs = checkRules(eff, "효과", e.grade, errs, { allowAlways: e.grade === "일반" || e.grade === "고급" });
    notes.push(rs.map((r) => r.when.on).join("/"));
  }
  if (e.affinity) {
    const aff = (e.affinityText || "").replace(/\s*Lv\.3:.*$/, "").trim();
    if (!aff) errs.push("애착 장비인데 애착 효과가 없다");
    else checkRules(aff, `애착(${e.affinity})`, e.grade, errs, { allowAlways: false, kw: KW[e.affinity] ? [KW[e.affinity]] : [] });
    if (!e.affinityText || !/Lv\.3:/.test(e.affinityText)) errs.push("애착 줄 끝에 「Lv.3: 스탯」 이 없다");
  }
  report(`장비 ${e.ko} (${e.grade}·${e.slot})`, errs, notes);
}

// ── 중립 카드 ───────────────────────────────────────────────────────────
const neutral = {};
for (const t of texts) Object.assign(neutral, parseNeutral(wrap(t, "## 스펠 → 중립 카드"), () => {}));
for (const c of Object.values(neutral)) {
  const errs = [], notes = [];
  const { fx, left } = parseEffect(c.text, {});
  if (!fx.length) errs.push(`효과를 하나도 못 읽었다: ${c.text}`);
  if (left) errs.push(`못 읽은 말: 「${left}」 (${c.text})`);
  if (c.cost === 0) errs.push("기본 0코는 없다 — 1코 이상(0코는 신탁 ① 강화로)");
  const tags = [...(c.tags || []), ...fx.filter((f) => f.k === "tag").map((f) => f.id)];
  if (fx.some((f) => MODS.includes(f.k) && (f.turns || 1) >= 999) && !c.oneOnly) errs.push("이번 전투 동안 증감을 주는 카드는 「덱에 1장만.」");
  if (fx.some((f) => MODS.includes(f.k) && (f.turns || 1) >= 999) && !tags.includes("소멸")) errs.push("이번 전투 동안 증감을 주는 카드는 소멸");
  const v = valueOf(fx), base = baseValue(c.cost);
  notes.push(`값 ${v.toFixed(2)} / 기준 ${base.toFixed(1)}`);
  if (c.cost !== "X" && v > base * 1.6) errs.push(`값어치 ${v.toFixed(2)} 가 ${c.cost}코 기준(${base})의 1.6배를 넘는다 — 싸다`);
  if (c.cost !== "X" && v < base * 0.6 && !fx.some((f) => MODS.includes(f.k))) errs.push(`값어치 ${v.toFixed(2)} 가 ${c.cost}코 기준(${base})의 0.6배 아래 — 비싸다`);
  for (const f of c.flash || []) {
    const r = parseEffect(f.text, {});
    if (!r.fx.length) errs.push(`${f.kind} 「${f.ko}」 — 효과를 못 읽었다: ${f.text}`);
    if (r.left) errs.push(`${f.kind} 「${f.ko}」 — 못 읽은 말: 「${r.left}」`);
  }
  if ((c.flash || []).length !== 2) errs.push(`신탁은 ① 강화 · ④ 변형 둘 (${(c.flash || []).length})`);
  report(`중립 ${c.ko} (${c.grade}·${c.cost}·${c.type})`, errs, notes);
}

console.log(`\n장비 ${Object.keys(equips).length} · 중립 ${Object.keys(neutral).length} — ✓ ${ok} · ✗ ${bad}`);
process.exit(bad ? 1 : 0);
