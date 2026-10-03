// %-증감을 이름 붙은 상태로 바꾼다 — 「2턴간 주는 피해 +30%」 → 「사기 2」(2026-10 사용자 「받피증가 같은 거 사기2 불굴2 로 다 통일」).
// 기획서(트릭컬_기획서_전체.md)의 글을 고친다. 고친 뒤 parse-design · build-cards · build-keywords 를 다시 돌린다.
//   node tools/convert-mods.js            고치고 바뀐 양을 보고한다
//   node tools/convert-mods.js --dry      고치지 않고 보고만
//
// 바꾸는 것(rules.js STATUS_V · 겹 규칙 — 숫자는 횟수, 한 번 돌면 1 준다)
//   주는 피해 +N% → 사기 · 받는 피해 -N% → 불굴 · 받는 피해 +N% → 취약 · 주는 피해 -N% → 약화
//   옛 「취약 N턴」 · 「약화 N턴」(+10% · -10% 를 N턴) → 「취약 n」 · 「약화 n」
// 겹 수 = 옛 증감이 한 판에 낸 몫(N% × 턴 × 그 턴에 돌 횟수 r) ÷ 상태 한 번의 몫(V) — 반올림, 적어도 1
//   r — 한 턴에 그 상태가 몇 번 돌까: 사기(아군이 카드를 낸다) 0.7 · 불굴 · 취약(아군이 맞는다) 1 · 취약(적이 맞는다) 2 · 약화(적이 친다) 1 · 약화(아군) 0.7
//   턴 — 「N턴간」 · 뒤에 붙은 「N턴」 은 N, 「이번 턴」 · 아무 말 없으면 1, 「이번 전투 동안」 · 「전투 내내」 는 6(한 전투 평균 턴)
// 안 바꾸는 것 — 「판 내내」(강화 카드의 판 내내 버프) · 「항상」(늘 걸린 패시브) · 「1개당」 · 「겹마다」(키워드 세기에 비례).
//   공격력 · 방어력 · 치명 · 회복력 증감은 카제나에 맞는 상태가 없어 % 그대로 둔다(docs/16)
import fs from "node:fs";
import { DESIGN_DOC } from "./lib/paths.js";
import * as R from "../js/rules.js";

const DRY = process.argv.includes("--dry");
const V = R.STATUS_V;
const LONG = 6;                                    // 「이번 전투 동안」 — 한 전투 평균 턴
const R_OF = { 사기: { ally: 0.7, foe: 1 }, 불굴: { ally: 1, foe: 1 }, 취약: { ally: 1, foe: 2 }, 약화: { ally: 0.7, foe: 1 } };
const KIND = (word, sign) => (word === "주는" ? (sign === "+" ? "사기" : "약화") : (sign === "-" ? "불굴" : "취약"));
const DUR_LEAD = /(\d+)\s*턴\s*(?:간|동안)|이번\s*턴|이번\s*전투(?:\s*동안)?|전투\s*내내/g;
const DUR_TAIL = /^\s*(?:(\d+)\s*턴(?:\s*(?:간|동안))?|이번\s*턴|이번\s*전투(?:\s*동안)?|전투\s*내내)/;
const turnsOf = (t) => { const m = t.match(/(\d+)\s*턴/); return m ? Number(m[1]) : /전투/.test(t) ? LONG : 1; };
const MOD = /(주는|받는)\s*피해\s*([+\-])\s*(\d+)\s*%/g;
const OLD_ST = /(?<![가-힣「])(취약|약화)\s*(\d+)\s*턴(?!\s*(?:간|동안))/g;
// 안 바꾸는 자리 — 마디(쉼표 사이) 안의 「판 내내」 · 「N개당」 · 「겹마다」, 문장(규칙 하나)의 「항상」 · 첫머리 「1개당」(키워드 세기 규칙)
const SKIP = /개\s*당|1\s*당|겹마다|판\s*내내/;
const SKIP_SENT = /항상|^\s*1\s*개\s*당/;
const PCT_LEFT = /(?:공격력|방어력|치명(?:\s*확률)?|회복력|주는\s*피해|받는\s*피해)\s*[+\-]\s*\d+\s*%/;
const TGT_ONLY = /^\s*(?:아군\s*(?:전원|전체|1\s*명)|적\s*(?:전체|1\s*명)|무작위\s*적(?:\s*1\s*명)?|자신|파티\s*전원|HP\s*최저\s*아군)?\s*$/;
const FOE_WORD = /적\s*전체|적\s*1\s*명|무작위\s*적|모든\s*적/;
const ALLY_WORD = /아군|자신|파티\s*전원|HP\s*최저/;

const src = fs.readFileSync(DESIGN_DOC, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const lines = src.split(/\r?\n/);
const start = lines.findIndex((l) => /^##\s*사도 전체 목록/.test(l));

// 어느 갈래의 글인가 — 바뀐 양을 갈래마다 센다
let section = "규칙";
function catOf(line) {
  if (/^##\s*아티팩트|^##\s*.*장비/.test(line)) section = "장비";
  else if (/^##\s*스펠|^##\s*.*교주 카드/.test(line)) section = "교주";
  else if (/^##\s*겨우살이/.test(line)) section = "축복(공용)";
  else if (/^##\s*.*사도/.test(line)) section = "사도";
  if (section === "교주") return /^-\s*[①②③④⑤]/.test(line) ? "교주 신탁" : /^\*\*[^*]+\*\*\s*\(/.test(line) ? "교주 카드" : "교주";
  if (section !== "사도") return section;
  if (/^\*\*패시브\*\*/.test(line)) return "패시브";
  if (/^\*\*키워드/.test(line)) return "키워드";
  if (/^\*\*고학년/.test(line)) return "고학년";
  if (/^\s+-\s*✦/.test(line)) return "축복(사도)";
  if (/^\s+-\s*[①②③④⑤]/.test(line)) return "신탁";
  if (/^-\s*\*\*/.test(line)) return "사도 카드";
  return "사도(기타)";
}

const stat = {};          // 갈래 → { n, exact, got, byKind }
const KEEP = new Set(["장비", "교주", "교주 카드", "교주 신탁"]);
let base = {};            // 지금 카드(기본)의 상태별 { exact, n } — 신탁이 기본보다 못하지 않게
const kept = [];
const samples = [];
function note(cat, kind, exact, n, before, after) {
  const s = (stat[cat] = stat[cat] || { n: 0, exact: 0, got: 0, kinds: {} });
  s.n++; s.exact += exact; s.got += n; s.kinds[kind] = (s.kinds[kind] || 0) + 1;
  if (samples.length < 400) samples.push({ cat, before, after });
}

// 마디 하나(쉼표 · 마침표 · 쌍점 사이)를 바꾼다. sentence — 그 마디가 든 문장의 앞부분(항상 · 판 내내를 본다)
function convertClause(clause, sentencePre, cat) {
  if (SKIP_SENT.test(sentencePre + clause.split(MOD)[0]) || SKIP.test(clause.split(MOD)[0])) return clause;
  MOD.lastIndex = 0;
  if (!MOD.test(clause)) return clause;
  MOD.lastIndex = 0;
  // 앞의 길이 말 — 마디 안에서 증감 앞
  const firstMod = clause.search(/(주는|받는)\s*피해\s*[+\-]\s*\d+\s*%/);
  let lead = null;
  for (const m of clause.slice(0, firstMod).matchAll(DUR_LEAD)) lead = { at: m.index, end: m.index + m[0].length, text: m[0] };
  let out = "", last = 0;
  const before = clause;
  for (const m of clause.matchAll(MOD)) {
    const pre = clause.slice(0, m.index);
    if (SKIP.test(pre)) { continue; }
    const kind = KIND(m[1], m[2]);
    const X = Number(m[3]);
    // 뒤에 붙은 길이 말
    const tail = clause.slice(m.index + m[0].length).match(DUR_TAIL);
    const T = tail ? turnsOf(tail[0]) : lead ? turnsOf(lead.text) : 1;
    // 누구에게 거나 — 마디에서 가장 가까운 앞의 대상 말, 없으면 문장, 그래도 없으면 상태의 기본(취약 · 약화는 적, 사기 · 불굴은 자신)
    const near = (t) => { const f = [...t.matchAll(new RegExp(FOE_WORD.source, "g"))].pop(), a = [...t.matchAll(new RegExp(ALLY_WORD.source, "g"))].pop(); if (!f && !a) return null; return (f ? f.index : -1) > (a ? a.index : -1) ? "foe" : "ally"; };
    const side = near(pre) || near(sentencePre) || (kind === "취약" || kind === "약화" ? "foe" : "ally");
    const r = R_OF[kind][side];
    const exact = (X / 100) * T * r / V[kind];
    let n = Math.max(1, Math.round(exact));
    // 신탁은 기본 카드보다 나아야 한다 — 반올림으로 기본과 같은 겹이 되면 한 겹 더(「-20%」 → 불굴 1, 신탁 「-30%」 도 불굴 1 이던 것)
    if (/^신탁|^교주 신탁/.test(cat) && base[kind] && exact > base[kind].exact + 1e-9 && n <= base[kind].n) n = base[kind].n + 1;
    if (/카드$/.test(cat) && !base[kind]) base[kind] = { exact, n };
    // 장비 · 교주 카드는 값이 가까이 남아야 한다 — 한 겹(적어도 1)이 옛 몫의 두 배를 넘으면 % 그대로 둔다(자주 도는 작은 증감)
    if (KEEP.has(cat) && exact < 0.5) { kept.push(`[${cat}] ${m[0]}${tail ? tail[0] : ""} (옛 몫 ${exact.toFixed(2)}겹)`); continue; }
    out += clause.slice(last, m.index) + `${kind} ${n}`;
    last = m.index + m[0].length + (tail ? tail[0].length : 0);
    note(cat, kind, exact, n, m[0] + (tail ? tail[0] : ""), `${kind} ${n}`);
  }
  out += clause.slice(last);
  if (out === before) return clause;
  // 앞의 길이 말을 걷어 낸다 — 남은 % 증감이 없고, 길이 말과 상태 사이에 대상 말만 있을 때(「2턴간 안개: …」 같은 이름표는 둔다)
  if (lead) {
    const after = out.slice(lead.end);
    const stIdx = after.search(/(사기|불굴|취약|약화)\s*\d/);
    if (!PCT_LEFT.test(out) && stIdx >= 0 && TGT_ONLY.test(after.slice(0, stIdx)) && !/^\s*[가-힣]{2,5}\s*[:：]/.test(after))
      out = (out.slice(0, lead.at) + after.replace(/^\s+/, "")).replace(/(\S)\s{2,}/g, "$1 ");
  }
  return out;
}

// 옛 「취약 N턴」 · 「약화 N턴」 — 그때는 ±10% 를 N턴. 같은 셈으로 겹을 정한다
function convertOldStatus(text, cat) {
  return text.replace(OLD_ST, (all, id, t, at) => {
    const pre = text.slice(Math.max(0, text.lastIndexOf(",", at), text.lastIndexOf(".", at)), at);
    const side = FOE_WORD.test(pre) ? "foe" : ALLY_WORD.test(pre) ? "ally" : "foe";
    const exact = 0.10 * Number(t) * R_OF[id][side] / V[id];
    const n = Math.max(1, Math.round(exact));
    note(cat, id + "(옛 N턴)", exact, n, all, `${id} ${n}`);
    return `${id} ${n}`;
  });
}

// 같은 대상의 같은 상태가 잇달면 하나로 — 「적 전체 약화 1, 적 전체 약화 1」(옛 「약화 N턴」 과 「주는 피해 -N%」 가 한 카드에 같이 있던 곳)
const merge = (t) => {
  let prev;
  do { prev = t; t = t.replace(/((?:아군\s*전원|아군\s*1\s*명|적\s*전체|적\s*1\s*명|자신)\s*)(사기|불굴|취약|약화)\s*(\d+)\s*,\s*\1\2\s*(\d+)/g, (a, who, id, x, y) => `${who}${id} ${Number(x) + Number(y)}`); } while (t !== prev);
  return t;
};
function convertLine(line, cat) {
  // 교주 카드 「덱에 1장만.」 → 카제나 키워드 「유일.」(rules.js isOnly — 한 개념 · 한 길)
  if (/^교주/.test(cat)) line = line.replace(/덱에 1장만\./g, "유일.");
  // 문장 → 마디. 구분자를 남겨 둔다
  const parts = line.split(/([,.:;。]\s*|\s·\s(?=[^·:]{1,30}:))/);
  let sentence = "";
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) { out += p; if (/[.:。;]/.test(p) || /·/.test(p)) sentence = ""; else sentence += p; continue; }
    out += convertClause(p, sentence, cat);
    sentence += p;
  }
  return merge(convertOldStatus(out, cat));
}

let changed = 0;
const next = lines.map((l, i) => {
  const cat = catOf(l);
  if (cat === "사도 카드" || cat === "교주 카드") base = {};
  // 전투 규칙의 「상태:」 줄 — 카제나 상태로(tools/build-keywords.js 가 이 줄에서 낱말을 읽는다. 수치 · 겹 규칙 풀이는 js/rules.js STATUS_V 에서 붙인다)
  if (/^-\s*상태:/.test(l)) return "- 상태: 약화(주는 피해 -25%) · 취약(받는 피해 +50%) · 사기(주는 피해 +20%) · 불굴(받는 피해 -20%) · 손상(얻는 방어와 실드 -50%) · 결의(턴 끝 실드) · 결정화(턴 끝 실드) · 고통(턴 끝 고정 피해) · 반격(맞으면 되친다) · 표식(공격 카드에 덤 타격) · 기절 · 도발 · 방어(턴 종료 시 소멸) · 실드(유지)." + eol + "- 상태의 숫자는 겹이다 — 효과가 한 번 돌 때마다 1 줄고, 다시 걸면 더해진다(docs/16-카제나전투.md).";
  if (i < start) return l;
  if (/^\*\*원작\*\*/.test(l)) return l;          // 원작 메모 — 기획 근거 글이다
  if (/^\*\*원작 대조\*\*/.test(l)) return l.replace("「덱에 1장만」이다", "「유일」(덱에 1장만)이다");
  if (/^(전설|희귀|고급|일반)\s*·/.test(l)) return l;   // 장비 · 교주 카드 머리줄(등급 · 원작 대조) — 근거 글이다
  const t = convertLine(l, cat);
  if (t !== l) changed++;
  return t;
});

console.log(`줄 ${changed}개를 고쳤다${DRY ? " (--dry: 쓰지 않음)" : ""}`);
console.log("갈래 · 바꾼 곳 · 옛 몫(겹으로 셈) → 새 겹 · 비율");
let te = 0, tg = 0;
for (const [cat, s] of Object.entries(stat)) {
  te += s.exact; tg += s.got;
  console.log(`  ${cat.padEnd(8)} ${String(s.n).padStart(4)}곳 · ${s.exact.toFixed(1)} → ${s.got} · ×${(s.got / s.exact).toFixed(2)}  (${Object.entries(s.kinds).map(([k, n]) => `${k} ${n}`).join(" · ")})`);
}
console.log(`  합       ${te.toFixed(1)} → ${tg} · ×${(tg / te).toFixed(2)}`);
if (kept.length) { console.log(`% 그대로 둔 곳 ${kept.length} — 한 겹이 옛 몫의 두 배를 넘는 장비 · 교주의 작은 증감`); for (const k of kept) console.log("    " + k); }
if (process.argv.includes("--samples")) for (const x of samples.slice(0, 60)) console.log(`    [${x.cat}] ${x.before} → ${x.after}`);
if (!DRY) fs.writeFileSync(DESIGN_DOC, next.join(eol));

// ── 신탁 고르기 값 지키기(--fix) ─────────────────────────────────────────
// 바꾼 뒤 반올림 탓에 신탁이 기본 카드보다 못해진 곳(tools/lib/card-value.js oracleRules — 「기본보다 낫지 않다」 · 「코스트를 올렸으면」)이 생긴다.
// 그 신탁 글의 상태 겹을 하나씩 올려 규칙을 다시 지키게 한다(셋까지). 바꾼 곳을 적어 둔다
if (process.argv.includes("--fix")) {
  const { parseHeroBlock } = await import("./lib/hero-block.js");
  const { parseEffect } = await import("../js/effects.js");
  const { oracleRules, tagsOf } = await import("./lib/card-value.js");
  let doc = fs.readFileSync(DESIGN_DOC, "utf8");
  // 손으로 고친 곳 — 반올림이 사도 규칙(tools/check-hero.js: 엘다인 체급 · 3코 값 · 축복 덤 크기)을 깬 곳. 신탁 맞추기 앞에 건다
  const HAND = [
    ["- **만년설의 현자** (2·스킬) 적 전체에 「동상」 +2, 아군 전원 사기 1 · 불굴 1", "- **만년설의 현자** (2·스킬) 적 전체에 「동상」 +2, 아군 전원 사기 2 · 불굴 1"],
    ["- **궁극의 유희** (2·스킬, 시그니처) 적 전체 취약 1,", "- **궁극의 유희** (2·스킬, 시그니처) 적 전체 취약 2,"],
    ["- **극적인 연출** (3·스킬, 시그니처) 아군 전원 사기 1,", "- **극적인 연출** (3·스킬, 시그니처) 아군 전원 사기 2,"],
    ["- **달바라기** (2·스킬, 시그니처) 「달의 영역」 +2, 적 전체에 공격력 90% 피해, 적 전체 약화 1", "- **달바라기** (2·스킬, 시그니처) 「달의 영역」 +2, 적 전체에 공격력 90% 피해, 적 전체 약화 2"],
    ["- **웹트래핑** (3·스킬, 시그니처) 적 1명에게 「홀로그램」 +7, 적 1명 취약 1,", "- **웹트래핑** (3·스킬, 시그니처) 적 1명에게 「홀로그램」 +7, 적 1명 취약 2,"],
    ["- **장갑 던지기** (2·스킬) 적 전체 약화 1, 적 전체 취약 1,", "- **장갑 던지기** (2·스킬) 적 전체 약화 2, 적 전체 취약 2,"],
    ["*수은 정화*: 코스트 3. 적 전체 약화 1, 적 전체 취약 1,", "*수은 정화*: 코스트 3. 적 전체 약화 3, 적 전체 취약 3,"],
    ["*공포의 유령*: 적 1명 약화 1", "*공포의 유령*: 적 1명 약화 2"],
    ["*눈가림 탄*: 적 1명 약화 1", "*눈가림 탄*: 적 1명 약화 2"],
    ["*맹세의 무게*: 적 1명에게 「언약의 매듭」 +1, 적 1명 약화 1", "*맹세의 무게*: 적 1명 약화 1"],
    ["*장물 넘기기*: 적 1명에게 「화상」 +1, 방어력 100% 방어", "*장물 넘기기*: 적 1명에게 「화상」 +1, 방어력 60% 방어"],
    ["*관객의 동정*: 무작위 적에게 「푸른 장미」 +1, 드로우 1", "*관객의 동정*: 무작위 적에게 「푸른 장미」 +1, 자신 불굴 1"],
    ["*들키면 딴청*: 보존. 「쇠팽이」 +2, 드로우 2", "*들키면 딴청*: 보존. 「쇠팽이」 +2, 드로우 2, 자신 사기 1"],
    ["*만화 계약서*: 「돈까스 배달」 +2, 드로우 2, 고학년 게이지 +20%", "*만화 계약서*: 「돈까스 배달」 +2, 드로우 2, 고학년 게이지 +40%"],
  ];
  for (const [a, b] of HAND) { if (doc.includes(a)) { doc = doc.replace(a, b); } else console.log(`  ! 손으로 고칠 곳을 못 찾았다: ${a}`); }
  fs.writeFileSync(DESIGN_DOC, doc);
  const ST = /(사기|불굴|취약|약화)\s*(\d+)/g;
  const fixes = [];
  const rulesOf = (u, kws, list) => {
    const pe = (t) => parseEffect(t, { keywords: kws }).fx;
    const fx = pe(u.text);
    return oracleRules({ fx, cost: u.cost, tags: [...u.tags, ...tagsOf(fx)] }, list.map((f, i) => ({ fx: pe(f.text), at: String(i) })))
      .filter((e) => /기본보다 낫지 않다|코스트를 올렸으면/.test(e)).map((e) => Number(e.split(" ")[0]));
  };
  for (const raw of doc.replace(/\r\n/g, "\n").split(/^### /m).slice(1)) {
    const h = parseHeroBlock(raw, () => {});
    if (!h) continue;
    const kws = h.keyword ? [h.keyword.ko] : [];
    for (const u of h.unique) {
      const list = u.flash.map((f) => ({ ...f }));
      let bad = rulesOf(u, kws, list);
      for (const i of bad) {
        const f = list[i], text0 = f.text;
        // 올릴 자리 — 상태 겹(+1 씩, 셋까지)이 먼저, 상태가 없으면 배율(공격력 · 방어력 · 회복력 N% — +10%p 씩, 다섯까지).
        // 기본 카드의 작은 증감이 한 겹(적어도 1)으로 올라 기본이 비싸진 탓에, 상태 없는 신탁이 뒤처진 곳이다
        const sts = [...f.text.matchAll(ST)].map((m) => ({ m, step: 1, max: 3, put: (n) => `${m[1]} ${n}`, v: Number(m[2]) }));
        const pcts = [...f.text.matchAll(/(공격력|방어력|회복력)\s*(\d+)\s*%/g)].map((m) => ({ m, step: 10, max: 5, put: (n) => `${m[1]} ${n}%`, v: Number(m[2]) }));
        const spots = sts.length ? sts : pcts;
        if (!spots.length) continue;
        let ok = false;
        for (let round = 1; round <= Math.max(...spots.map((x) => x.max)) && !ok; round++) {
          for (const x of spots) {
            if (round > x.max) continue;
            const t = f.text.slice(0, x.m.index) + x.put(x.v + round * x.step) + f.text.slice(x.m.index + x.m[0].length);
            const trial = list.map((y, j) => (j === i ? { ...y, text: t } : y));
            if (!rulesOf(u, kws, trial).includes(i)) { f.text = t; ok = true; break; }
          }
        }
        if (ok && f.text !== text0) {
          const from = `*${f.ko}*: ${text0}`, to = `*${f.ko}*: ${f.text}`;
          if (doc.includes(from)) { doc = doc.replace(from, to); fixes.push(`「${u.ko}」 「${f.ko}」: ${text0} → ${f.text}`); }
        }
      }
    }
  }
  // 교주 카드 — 등급 값(tools/check-gear.js GRADE_MIN)과 신탁 규칙. 상태 겹만 올린다(교주 카드는 스탯 배율이 없다)
  {
    const { parseNeutral } = await import("./lib/neutral-block.js");
    const { cardValue, baseValue, flashCost } = await import("./lib/card-value.js");
    const GRADE_MIN = { 일반: 0.6, 고급: 0.75, 희귀: 0.85, 전설: 1.0 };
    const head = "## 스펠 → 교주 카드";
    const at = doc.indexOf(head);
    const neutral = parseNeutral(doc.slice(at).replace(/\r\n/g, "\n"), () => {});
    const bumpAll = (t, k) => t.replace(ST, (all, id, n) => `${id} ${Number(n) + k}`);
    for (const c of Object.values(neutral)) {
      const pe = (t) => parseEffect(t, {}).fx;
      const val = (t) => { const fx = pe(t); return cardValue(fx, [...(c.tags || []), ...tagsOf(fx)]); };
      const base = baseValue(c.cost), lo = base * (GRADE_MIN[c.grade] || 0.6);
      let text = c.text;
      if (c.cost !== "X" && val(text) < lo && ST.test(text)) {
        for (let k = 1; k <= 3; k++) { const t = bumpAll(c.text, k); if (val(t) >= lo) { text = t; break; } }
        if (text !== c.text && val(text) <= base * 1.6) { doc = doc.replace(c.text, text); fixes.push(`교주 「${c.ko}」: ${c.text} → ${text}`); }
        else text = c.text;
      }
      ST.lastIndex = 0;
      const fx = pe(text), tags = [...(c.tags || []), ...tagsOf(fx)];
      const list = (c.flash || []).map((f) => ({ ...f }));
      const badOf = (l) => oracleRules({ fx, cost: c.cost, tags }, l.map((f, i) => ({ fx: pe(f.text), at: String(i) })))
        .filter((e) => /기본보다 낫지 않다|코스트를 올렸으면/.test(e)).map((e) => Number(e.split(" ")[0]));
      for (const i of [...new Set(badOf(list))]) {
        const f = list[i], text0 = f.text;
        if (!ST.test(text0)) { ST.lastIndex = 0; continue; }
        ST.lastIndex = 0;
        // 상태 하나씩 올려 보고(+1~3), 안 되면 모두 함께. 신탁 값 위 한도(코스트 기준 1.9배 — check-gear)는 넘지 않게
        const cheapOk = (t) => { const ffx = pe(t), fc = flashCost(c.cost, ffx); return c.cost === "X" || cardValue(ffx.filter((x) => x.k !== "costSet" && x.k !== "costDelta"), tagsOf(ffx)) <= baseValue(fc) * 1.9; };
        const tries = [];
        for (let k = 1; k <= 3; k++) {
          for (const m of text0.matchAll(ST)) tries.push(text0.slice(0, m.index) + `${m[1]} ${Number(m[2]) + k}` + text0.slice(m.index + m[0].length));
          tries.push(bumpAll(text0, k));
        }
        for (const t of tries) if (cheapOk(t) && !badOf(list.map((y, j) => (j === i ? { ...y, text: t } : y))).includes(i)) { f.text = t; break; }
        if (f.text !== text0 && doc.includes(`*${f.ko}*: ${text0}`)) { doc = doc.replace(`*${f.ko}*: ${text0}`, `*${f.ko}*: ${f.text}`); fixes.push(`교주 「${c.ko}」 「${f.ko}」: ${text0} → ${f.text}`); }
      }
    }
  }
  console.log(`신탁 값 지키기 ${fixes.length}곳 (상태 겹 · 없으면 배율을 올림)`);
  for (const x of fixes) console.log("    " + x);
  if (!DRY) fs.writeFileSync(DESIGN_DOC, doc);
}
