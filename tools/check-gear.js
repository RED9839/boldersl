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
import { baseValue, flashCost, cardValue, tagsOf, oracleRules } from "./lib/card-value.js";
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
const MODS = ["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"];
// 스탯 줄의 옛 「회복력 +N」 은 v6 에 없앴다(치유도 방어력 — 「방어 +3N」 으로 옮겼다, tools/convert-v6.js)
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
  // 스탯 줄 — v6 카제나 눈금(옛 값 ×10). 「회복력」 은 없다(치유도 방어력)
  if (/회복력/.test(e.statLine || "")) errs.push("스탯 줄에 회복력이 있다 — v6 에 없앴다(방어 +N 으로)");
  if (e.affinity) {
    const aff = (e.affinityText || "").replace(/\s*Lv\.3:.*$/, "").trim();
    if (!aff) errs.push("애착 장비인데 애착 효과가 없다");
    else checkRules(aff, `애착(${e.affinity})`, e.grade, errs, { allowAlways: false, kw: KW[e.affinity] ? [KW[e.affinity]] : [] });
    if (!e.affinityText || !/Lv\.3:/.test(e.affinityText)) errs.push("애착 줄 끝에 「Lv.3: 스탯」 이 없다");
  }
  report(`장비 ${e.ko} (${e.grade}·${e.slot})`, errs, notes);
}

// ── 교주 카드 ───────────────────────────────────────────────────────────
// 교주 카드는 교주님의 힘이다(2026-10 사용자 「공격력·방어력이 가장 높은 카드 기준으로 돈다 — 없애라」) —
// 사도 스탯을 빌리지 않는다. 피해 · 방어 · 실드 · 회복(스탯 %)과 「자신」(주인이 없다), 사도 키워드는 쓰지 않는다.
// 하는 일: AP · 드로우 · 버리기 · 보존 · 개전 · 다음 카드 코스트 · 게이지 · 즉시 행동 -N · 취약 · 약화 · 기절 · 침묵 ·
// 정해진 % 증감(주는 · 받는 피해 · 공격력 · 방어력 · 치명 · 회복력) · 디버프 해제 · 무적 · 방어 · 실드 파괴
const neutral = {};
// 0코 교주 카드 — 사용자가 정한 예외(2026-10): 「소다맛 캡슐」 은 0코에 AP +1 만 돌려주는 카드(원작: 모든 사도 SP 회복 1회용).
// 값 · 0코 규칙은 보지 않고, 신탁도 0코 · 소멸 · AP +1 을 지키는지만 본다
const ZERO_OK = new Set(["소다맛 캡슐"]);
// 스탯을 빌리는 조각 · 주인이 있어야 도는 조각
const STAT_FX = ["dmg", "block", "shield", "heal", "stack", "spend", "perStack", "ifStack", "trigger", "maxHpPct"];
// 등급별 값어치 — 코스트 기준(0.5 + 코스트)의 몇 배인가. 아래는 등급마다, 위는 모두 1.6배
const GRADE_MIN = { 일반: 0.6, 고급: 0.75, 희귀: 0.85, 전설: 1.0 };
// 「이번 전투 동안」 증감 하나의 한도
const FIGHT_CAP = { 전설: 15, 희귀: 10, 고급: 8, 일반: 5 };
for (const t of texts) Object.assign(neutral, parseNeutral(wrap(t, "## 스펠 → 교주 카드"), () => {}));
for (const c of Object.values(neutral)) {
  const errs = [], notes = [];
  const { fx, left } = parseEffect(c.text, {});
  if (!fx.length) errs.push(`효과를 하나도 못 읽었다: ${c.text}`);
  if (left) errs.push(`못 읽은 말: 「${left}」 (${c.text})`);
  const zero = ZERO_OK.has(c.ko);
  if (c.cost === 0 && !zero) errs.push("기본 0코는 없다 — 1코 이상(0코는 신탁 ① 강화로)");
  const tags = [...(c.tags || []), ...tagsOf(fx)];
  // 교주의 힘 — 스탯 % · 「자신」 · 키워드 없이. 기본 · 신탁 모두
  const statFree = (list, at) => {
    const bad = list.filter((f) => STAT_FX.includes(f.k));
    if (bad.length) errs.push(`${at}스탯을 빌리는 효과(${[...new Set(bad.map((f) => f.k))].join(" · ")}) — 교주 카드는 사도 스탯을 쓰지 않는다`);
    if (list.some((f) => f.target === "self" || (f.k === "status" && f.id === "도발"))) errs.push(`${at}「자신」 · 도발 — 교주 카드에는 주인이 없다. 아군 전원 · 파티로`);
    // 한 명을 고르는 아군 효과는 두지 않는다(2026-10 사용자 — 불굴 · 결의 따위는 파티 공용이라 「아군 1명」 만 사기에 걸려 헷갈린다)
    if (list.some((f) => f.target === "oneAlly" || f.target === "lowAlly")) errs.push(`${at}아군 1명 · HP 최저 아군 — 교주 카드는 한 명을 고르지 않는다. 아군 전원 · 파티로`);
  };
  statFree(fx, "");
  const fightMods = (list, at) => {
    for (const x of list) if (MODS.includes(x.k) && (x.turns || 1) >= 999 && Math.round(Math.abs(x.v) * 100) > (FIGHT_CAP[c.grade] || 15))
      errs.push(`${at}이번 전투 동안 ${x.k} ${Math.round(Math.abs(x.v) * 100)}% 는 ${c.grade} 한도(${FIGHT_CAP[c.grade]}%)를 넘는다`);
  };
  fightMods(fx, "");
  if (fx.some((f) => MODS.includes(f.k) && (f.turns || 1) >= 999) && !c.oneOnly) errs.push("이번 전투 동안 증감을 주는 카드는 「덱에 1장만.」");
  if (fx.some((f) => MODS.includes(f.k) && (f.turns || 1) >= 999) && !tags.includes("소멸")) errs.push("이번 전투 동안 증감을 주는 카드는 소멸");
  if (fx.some((x) => x.k === "ap" && x.v > 1)) errs.push("교주 카드는 AP +1 까지");
  if (typeof c.cost === "number" && c.cost >= 2 && fx.some((x) => x.k === "draw" && x.v > 0)) errs.push("2코 이상에 드로우를 붙이지 않는다");
  const v = cardValue(fx, tags), base = baseValue(c.cost);
  notes.push(`값 ${v.toFixed(2)} / 기준 ${base.toFixed(1)} (${(v / base).toFixed(2)}배)`);
  if (c.cost !== "X" && !zero && v > base * 1.6) errs.push(`값어치 ${v.toFixed(2)} 가 ${c.cost}코 기준(${base})의 1.6배를 넘는다 — 싸다`);
  if (c.cost !== "X" && !zero && v < base * (GRADE_MIN[c.grade] || 0.6)) errs.push(`값어치 ${v.toFixed(2)} 가 ${c.grade} ${c.cost}코 기준(${base})의 ${GRADE_MIN[c.grade]}배 아래 — 비싸다`);
  // 신탁 다섯 — 사도 고유 카드와 같은 자유 신탁(분류 낱말 없음 · docs/13-장비와 중립.md §2). 0코로 내리지 않는다(원작 SP 사도만, docs/11 §3-2)
  const got = (c.flash || []).map((f) => f.n).join("");
  if (got !== "12345") errs.push(`신탁은 다섯 (지금 ${got || "없음"})`);
  if ((c.flash || []).some((f) => f.kind)) errs.push("신탁은 분류 낱말 없이(자유 신탁) — ① 강화 *이름* 이 아니라 ① *이름*");
  const ofx = [];
  for (const f of c.flash || []) {
    const r = parseEffect(f.text, {});
    const at = `${"①②③④⑤"[f.n - 1]} 「${f.ko}」 — `;
    if (!r.fx.length) { errs.push(`${at}효과를 못 읽었다: ${f.text}`); continue; }
    if (r.left) errs.push(`${at}못 읽은 말: 「${r.left}」`);
    ofx.push({ fx: r.fx, at: at.slice(0, -3) });
    // 신탁을 고른 카드는 신탁 글이 전문이다 — 머리 태그(소멸 등)는 엔진이 보지 않는다(js/combat.js hasTag). 그래서 여기서도 신탁 글의 태그만 본다
    const fc = flashCost(c.cost, r.fx), ftags = tagsOf(r.fx);
    const body = r.fx.filter((x) => x.k !== "costSet" && x.k !== "costDelta");
    const fv = cardValue(body, ftags), gone = ftags.includes("소멸");
    statFree(body, at);
    fightMods(body, at);
    if (c.cost !== "X" && fc === 0 && !zero) errs.push(`${at}교주 카드 신탁은 0코로 내리지 않는다`);
    if (zero && (fc !== 0 || !gone || !body.some((x) => x.k === "ap" && x.v === 1))) errs.push(`${at}0코 예외 카드의 신탁은 0코 · 소멸 · AP +1 그대로`);
    if (typeof fc === "number" && fc > 3) errs.push(`${at}3코 위로 올리지 않는다`);
    // 기본 카드가 이미 소멸이면 소멸은 새로 붙인 벌이 아니다 — 코스트를 올린 큰 한 방 신탁을 허락한다(장비 작성자 바람, 2026-10)
    if (c.cost !== "X" && fc > c.cost && gone && !tags.includes("소멸")) errs.push(`${at}코스트를 올린 신탁에 소멸을 같이 붙이지 않는다`);
    // 연계 · 천상은 비용 없이 저절로 나간다 — 신탁 글에 붙어 있으면 코스트를 올리지 않는다(사도 고유 카드와 같은 규칙, check-hero)
    { const auto = r.fx.find((x) => x.k === "tag" && (x.id === "연계" || x.id === "천상"));
      if (auto && typeof c.cost === "number" && typeof fc === "number" && fc > c.cost) errs.push(`${at}${auto.id} 카드는 코스트를 올리는 신탁을 두지 않는다(비용 없이 나간다)`); }
    if (typeof fc === "number" && fc >= 2 && body.some((x) => x.k === "draw" && x.v > 0)) errs.push(`${at}2코 이상에 드로우를 붙이지 않는다`);
    if (body.some((x) => MODS.includes(x.k) && (x.turns || 1) >= 999) && !(c.oneOnly && gone)) errs.push(`${at}이번 전투 동안 증감은 덱에 1장만 카드 + 소멸`);
    if (body.some((x) => x.k === "ap" && x.v > 1)) errs.push(`${at}교주 카드는 AP +1 까지`);
    if (body.some((x) => x.k === "gauge" && x.v > 100)) errs.push(`${at}게이지는 한 장에 +100% 까지`);
    if (body.some((x) => x.k === "invuln" && x.target === "allAllies") && ["일반", "고급"].includes(c.grade)) errs.push(`${at}아군 전원 무적은 희귀 · 전설만`);
    const fb = baseValue(fc);
    if (c.cost !== "X" && !zero && fv > fb * 1.9) errs.push(`${at}값어치 ${fv.toFixed(2)} 가 ${fc}코 기준(${fb})에 비해 너무 싸다(1.9배까지)`);
  }
  // 신탁은 기본보다 나아야 한다 — 사도 고유 카드와 같은 규칙(tools/lib/card-value.js oracleRules)
  for (const e of oracleRules({ fx, cost: c.cost, tags }, ofx)) errs.push(e);
  report(`교주 ${c.ko} (${c.grade}·${c.cost}·${c.type})`, errs, notes);
}

console.log(`\n장비 ${Object.keys(equips).length} · 교주 ${Object.keys(neutral).length} — ✓ ${ok} · ✗ ${bad}`);
process.exit(bad ? 1 : 0);
