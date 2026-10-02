// 장비(아티팩트) · 교주 카드(스펠) 검사 — docs/13-장비와 중립.md 의 규칙대로 쓰였는가.
//
//   node tools/check-gear.js                     기획서 전체
//   node tools/check-gear.js 파일.md [파일.md …]  리뉴얼 중인 조각 파일(### 장비 / ### 중립 탭 모양 그대로)
//   --quiet                                      ✗ 만 보인다
//
// 장비의 효과 · 애착 줄은 패시브 문법(js/passive.js), 교주 카드는 카드 문법(js/effects.js)으로 읽는다.
// 한 글자라도 못 읽으면 게임이 그 줄을 켜지 않는다 — 여기서 ✓ 가 될 때까지 고친다.
import fs from "node:fs";
import { DESIGN_DOC } from "./lib/paths.js";
import { parseEquip } from "./lib/equip-block.js";
import { parseNeutral } from "./lib/neutral-block.js";
import { parsePassive } from "../js/passive.js";
import { parseEffect } from "../js/effects.js";
import { valueOf, baseValue, flashCost } from "./lib/card-value.js";
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

// ── 교주 카드 ───────────────────────────────────────────────────────────
const neutral = {};
for (const t of texts) Object.assign(neutral, parseNeutral(wrap(t, "## 스펠 → 교주 카드"), () => {}));
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
  // 신탁 다섯 — 고유 카드와 같은 자리(docs/07-스킬구성.md §7 · docs/13-장비와 중립.md §2)
  const KINDS = ["강화", "경량", "연계", "변형", "각성"];
  const got = (c.flash || []).map((f) => f.n).join("");
  // 새 틀(2026-10) — 사도 고유 카드와 같은 자유 신탁 다섯(분류 낱말 없음). 교주 카드는 0코로 내리지 않는다(원작 SP 사도만 0코, docs/11 §3-2)
  const freeForm = (c.flash || []).length && (c.flash || []).every((f) => !f.kind);
  if (got !== "12345") errs.push(`신탁은 다섯 (지금 ${got || "없음"})`);
  if (freeForm) {
    for (const f of c.flash) {
      const r = parseEffect(f.text, {});
      const at = `${"①②③④⑤"[f.n - 1]} 「${f.ko}」`;
      if (!r.fx.length) { errs.push(`${at} — 효과를 못 읽었다: ${f.text}`); continue; }
      if (r.left) errs.push(`${at} — 못 읽은 말: 「${r.left}」`);
      // 신탁을 고른 카드는 신탁 글이 전문이다 — 머리 태그(소멸 등)는 엔진이 보지 않는다(js/combat.js hasTag). 그래서 여기서도 신탁 글의 태그만 본다
      const fc = flashCost(c.cost, r.fx), ftags = r.fx.filter((x) => x.k === "tag").map((x) => x.id);
      const body = r.fx.filter((x) => x.k !== "costSet" && x.k !== "costDelta");
      const fv = valueOf(body), gone = ftags.includes("소멸");
      if (c.cost !== "X" && fc === 0) errs.push(`${at} — 교주 카드 신탁은 0코로 내리지 않는다`);
      if (typeof fc === "number" && fc > 3) errs.push(`${at} — 3코 위로 올리지 않는다`);
      if (c.cost !== "X" && fc > c.cost && gone) errs.push(`${at} — 코스트를 올린 신탁에 소멸을 같이 붙이지 않는다`);
      if (c.cost !== "X" && fc > c.cost && fv < valueOf(fx) * 1.6) errs.push(`${at} — 코스트를 올렸으면 기본의 1.6배 이상 (지금 ${(fv / Math.max(0.01, valueOf(fx))).toFixed(2)}배)`);
      if (typeof fc === "number" && fc >= 2 && body.some((x) => x.k === "draw" && x.v > 0)) errs.push(`${at} — 2코 이상에 드로우를 붙이지 않는다`);
      if (body.some((x) => MODS.includes(x.k) && (x.turns || 1) >= 999) && !(c.oneOnly && gone)) errs.push(`${at} — 이번 전투 동안 증감은 덱에 1장만 카드 + 소멸`);
      if (body.some((x) => x.k === "ap" && x.v > 1)) errs.push(`${at} — 교주 카드는 AP +1 까지`);
      if (body.some((x) => x.k === "gauge" && x.v > 100)) errs.push(`${at} — 게이지는 한 장에 +100% 까지`);
      const fb = baseValue(fc);
      if (c.cost !== "X" && fv > fb * 1.9) errs.push(`${at} — 값어치 ${fv.toFixed(2)} 가 ${fc}코 기준(${fb})에 비해 너무 싸다`);
    }
  }
  if (!freeForm) {
  const givesAp = fx.some((f) => f.k === "ap" && f.v > 0);
  for (const f of c.flash || []) {
    const r = parseEffect(f.text, {});
    const at = `${"①②③④⑤"[f.n - 1]} ${f.kind} 「${f.ko}」`;
    if (f.kind !== KINDS[f.n - 1]) errs.push(`${at} — ${f.n}번 자리는 ${KINDS[f.n - 1]}`);
    if (!r.fx.length) { errs.push(`${at} — 효과를 못 읽었다: ${f.text}`); continue; }
    if (r.left) errs.push(`${at} — 못 읽은 말: 「${r.left}」`);
    const fc = flashCost(c.cost, r.fx), ftags = [...tags, ...r.fx.filter((x) => x.k === "tag").map((x) => x.id)];
    const body = r.fx.filter((x) => x.k !== "costSet" && x.k !== "costDelta");
    const fv = valueOf(body), gone = ftags.includes("소멸");
    if (f.n === 2) {
      if (!/^코스트\s*\d+\./.test(f.text) && !(givesAp && /보존|개전/.test(f.text))) errs.push(`${at} — 경량은 「코스트 N.」 으로 시작한다(AP 를 주는 카드는 대신 보존 · 개전)`);
      else if (c.cost !== "X" && fc >= c.cost && !givesAp) errs.push(`${at} — 경량인데 코스트가 안 내려갔다 (${c.cost} → ${fc})`);
    }
    if (fc === 0 && body.some((x) => x.k === "ap" && x.v > 0)) errs.push(`${at} — AP 를 주는 카드는 0코가 안 된다(무한 고리)`);
    if (fc === 0 && body.some((x) => x.k === "draw" && x.v >= 2) && !gone) errs.push(`${at} — 0코에 드로우 2 이상이면 소멸`);
    if (fc === 0 && fv > 1.0 && !gone) errs.push(`${at} — 0코 값어치 ${fv.toFixed(2)} 가 1.0 을 넘으면 소멸`);
    if (body.some((x) => MODS.includes(x.k) && (x.turns || 1) >= 999) && !(c.oneOnly && gone)) errs.push(`${at} — 이번 전투 동안 증감은 덱에 1장만 카드 + 소멸`);
    if (f.n === 3 && !body.some((x) => ["status", "draw", "gauge", "ap", "dealtMod", "atkMod", "defMod", "critMod", "takenMod", "strip", "cleanse"].includes(x.k)))
      errs.push(`${at} — 연계는 다른 카드와 맞물려야 한다(상태 · 드로우 · 게이지 · 이번 턴 증감 …)`);
    if (f.n === 5 && !(gone || body.some((x) => ["payHp", "payHpPct", "spend"].includes(x.k) || (x.k === "takenMod" && x.v > 0))))
      errs.push(`${at} — 각성은 벌칙이 있다(소멸 · HP 소모 · 받는 피해 +)`);
    // 등급 한도 — 이번 전투 동안 증감(하나당) · 파티 전원 무적은 희귀부터
    const NCAP = { 전설: 15, 희귀: 10, 고급: 8, 일반: 5 };
    for (const x of body) if (MODS.includes(x.k) && (x.turns || 1) >= 999 && Math.round(Math.abs(x.v) * 100) > (NCAP[c.grade] || 15))
      errs.push(`${at} — 이번 전투 동안 ${x.k} ${Math.round(Math.abs(x.v) * 100)}% 는 ${c.grade} 한도(${NCAP[c.grade]}%)를 넘는다`);
    if (body.some((x) => x.k === "invuln" && x.target === "allAllies") && ["일반", "고급"].includes(c.grade)) errs.push(`${at} — 아군 전원 무적은 희귀 · 전설만`);
    if (body.some((x) => x.k === "gauge" && x.v > 100)) errs.push(`${at} — 게이지는 한 장에 +100% 까지`);
    const fb = baseValue(fc);
    if (c.cost !== "X" && fv > fb * (f.n === 5 ? 2.4 : 1.9) && !(fc === 0 && gone)) errs.push(`${at} — 값어치 ${fv.toFixed(2)} 가 ${fc}코 기준(${fb})에 비해 너무 싸다`);
  }
  }
  report(`교주 ${c.ko} (${c.grade}·${c.cost}·${c.type})`, errs, notes);
}

console.log(`\n장비 ${Object.keys(equips).length} · 교주 ${Object.keys(neutral).length} — ✓ ${ok} · ✗ ${bad}`);
process.exit(bad ? 1 : 0);
