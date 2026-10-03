// v6 — 카제나 눈금 · 카제나 바탕 단위로 글과 수치를 옮긴다(2026-10 사용자, docs/18-v6작성안내.md).
//
//   node tools/convert-v6.js          기획서 · .omc/v5/<사도>.md · .omc/gear/*.md · js/data(enemies · events · status-cards)를 제자리에서 고친다
//   node tools/convert-v6.js --dry    무엇을 바꿀지 세기만 한다
//
// 늘 하는 것(몇 번 돌려도 같다):
//   사도 스탯 줄 「**스탯** HP · 공격 · 방어 · 치명」 과 「사도 전체 목록」 표 — tools/lib/stat-formula.js 의 식으로 다시 쓴다
// 한 번만 하는 것(기획서에 옛 치유 글 「회복(회복력 N%)」 이 남아 있을 때만 — 옮긴 뒤 다시 돌려도 두 번 곱하지 않는다):
//   「HP 회복(회복력 N%)」 → 「HP 회복(방어력 3N%)」 — 치유는 방어력 기준(카제나). 사도 방어력이 옛 회복력의 ⅓ 언저리라 배율 ×3
//   「회복력 +N%」(판 내내) → 「방어력 +N%」 · 「온정 N」 → 「강건 N」(치유가 방어력이라 강건이 그 몫)
//   「잔불.」 → 「적 1명 잔불 1, 」(전체 피해 카드면 「적 전체 잔불 1, 」) · 「잔광.」 → 「자신 잔광 1, 」 — 카드 태그가 상태가 됐다
//   「감응: 」 → 「영감: 」 · 「HP N 소모」 → 「HP 10N 소모」(눈금 ×10)
//   장비 스탯 줄 · 애착 Lv.3 — 공격 · 방어 · HP ×10, 「회복력 +N」 → 「방어 +3N」
//   적(js/data/enemies.js) 체력 · 치는 수 · 방어 · 회복 · 가시 ×10 · 이벤트 「최대 HP +N」 · 공격 판정 ×10 · 상태 카드 HP ×10 · 감응 → 영감
// 한 줄 안에서만 바꾼다 — 기획서와 .omc/v5 · .omc/gear 사본이 같은 줄을 같게 바꿔 다시 합쳐도 똑같다.
import fs from "node:fs";
import { parseEffect } from "../js/effects.js";
import { DESIGN_DOC } from "./lib/paths.js";
import { statOf } from "./lib/stat-formula.js";
import DESIGN from "../js/data/design.js";

const dry = process.argv.includes("--dry");
const SC = 10;            // 눈금(js/rules.js SCALE)
const HEAL_X = 3;         // 옛 회복력 % → 방어력 %
const n = { stat2: 0, stat: 0, table: 0, heal: 0, healMod: 0, warm: 0, ember: 0, glow: 0, sense: 0, pay: 0, gearStat: 0, lv3: 0, lines: 0 };
const ex = [];
const note = (a, b) => { if (a !== b && ex.length < 30) ex.push([a, b]); };

const META = {};
for (const h of Object.values(DESIGN.heroes)) META[h.ko] = h;
const once = fs.readFileSync(DESIGN_DOC, "utf8").includes("회복(회복력");   // 한 번만 하는 옮기기를 할까 — 옛 치유 글이 남아 있을 때만
// 둘째 한 번(2026-10 사용자 「공용 버프는 카제나 것만」) — 우리가 지어낸 능력치 상태 열의 · 강건 · 집중이 글에 남아 있을 때만
//   열의 N → 사기 N · 강건 N → 결의 N · 집중 N → 사기 N(조건 「열의가 N 이상이면」 도 같은 셈). 다음 단계에 새로 쓰니 가장 가까운 것으로만
const STAT_RE = /(?<![가-힣「])(열의|강건|집중)(\s*\d|(?:이|가)\s*\d)/;
const once2 = STAT_RE.test(fs.readFileSync(DESIGN_DOC, "utf8"));
const TO_CZN = { 열의: "사기", 강건: "결의", 집중: "사기" };

// ── 효과 한 조각 ─────────────────────────────────────────────────────────
function piece(seg) {
  if (!seg) return seg;
  if (once2) seg = seg.replace(/(?<![가-힣「])(열의|강건|집중)(?:(이|가)(\s*\d)|(\s*\d))/g, (_, w, j, d1, d2) => { n.stat2++; const to = TO_CZN[w]; return j ? `${to}${to === "결의" ? "가" : "가"}${d1}` : `${to}${d2}`; });
  if (!once) return seg;
  let t = seg;
  t = t.replace(/회복\(\s*회복력\s*(\d+)\s*%\s*\)/g, (_, v) => { n.heal++; return `회복(방어력 ${Number(v) * HEAL_X}%)`; });
  t = t.replace(/회복력\s*(\d+)\s*%/g, (_, v) => { n.heal++; return `방어력 ${Number(v) * HEAL_X}%`; });
  t = t.replace(/회복력\s*\+\s*(\d+)\s*%/g, (_, v) => { n.healMod++; return `방어력 +${v}%`; });
  t = t.replace(/(?<![가-힣「])온정\s*(\d+)/g, (_, v) => { n.warm++; return `강건 ${v}`; });
  t = t.replace(/감응\s*[:：]/g, () => { n.sense++; return "영감:"; });
  t = t.replace(/(?<![\d.])HP\s*(\d+)\s*소모/g, (_, v) => { n.pay++; return `HP ${Number(v) * SC} 소모`; });
  // 잔불 · 잔광 태그 → 상태(글 맨 앞 태그들 뒤에 넣는다 — 이 카드의 피해에도 붙게)
  const TAG = /(?<![가-힣「]\s?)(잔불|잔광)\s*\.\s*/g;
  const tags = [...t.matchAll(TAG)].map((m) => m[1]);
  if (tags.length) {
    let body = t.replace(TAG, "");
    const fx = parseEffect(body, {}).fx;
    const d = fx.find((f) => f.k === "dmg");
    const add = [];
    if (tags.includes("잔불")) { add.push(`${d && d.target === "allEnemies" ? "적 전체" : "적 1명"} 잔불 1`); n.ember++; }
    if (tags.includes("잔광")) { add.push("자신 잔광 1"); n.glow++; }
    // 앞머리의 낱말 태그(약점. 연계. …)와 「코스트 N.」 뒤에
    const head = body.match(/^\s*(?:(?:코스트\s*\d+|강화\s*카드|[가-힣]{2}(?:\s*\d+)?)\s*\.\s*)*/)[0];
    const okHead = head.split(".").map((x) => x.trim()).filter(Boolean).every((w) => /^(코스트\s*\d+|강화\s*카드|분쇄|약점|연계|천상|신속|증발|유일|보존|개전|소멸|종극|주도)$/.test(w));
    const at = okHead ? head.length : 0;
    const rest = body.slice(at).trim();
    body = body.slice(0, at) + add.join(", ") + (rest ? `, ${rest}` : "");
    t = body;
  }
  if (t !== seg) note(seg, t);
  return t;
}
const passiveLine = (l) => l.split(/(\s·\s(?=[^:·.]{1,30}:)|(?<=[.。])\s+)/).map((x, i) => (i % 2 ? x : piece(x))).join("");
const cardLine = (l, head) => { const m = l.match(head); if (!m) return l; const rest = l.slice(m[0].length); const k = rest.indexOf(" — "); return m[0] + (k < 0 ? piece(rest) : piece(rest.slice(0, k)) + rest.slice(k)); };

// 장비 스탯 — 「공격 +2 · 치명 +6% · 회복력 +6」 → 「공격 +20 · 치명 +6% · 방어 +18」
function gearStats(s) {
  if (!once) return s;
  const got = {};
  const order = [];
  for (const m of s.matchAll(/(HP|공격|방어|치명|회복력)\s*\+\s*(\d+)\s*(%?)/g)) {
    let k = m[1], v = Number(m[2]);
    if (k === "회복력") { k = "방어"; v *= HEAL_X; }
    else if (k !== "치명") v *= SC;
    if (!(k in got)) { got[k] = 0; order.push(k); }
    got[k] += v;
  }
  return order.map((k) => `${k} +${got[k]}${k === "치명" ? "%" : ""}`).join(" · ");
}

function convertLine(l) {
  if (/^\*\*원작\*\*/.test(l)) return l;
  if (/^\*\*스탯\*\*/.test(l)) return l;                        // 사도 스탯 줄은 statLine 이
  if (/^- \*\*스탯\*\*\s+(?:HP|공격|방어|치명|회복력)\s*\+/.test(l)) { const o = l.replace(/^(- \*\*스탯\*\*\s*)(.+)$/, (_, h, s) => h + gearStats(s)); if (o !== l) n.gearStat++; return o; }
  if (/^- \*\*애착/.test(l)) {
    let o = passiveLine(l.replace(/\s*Lv\.3:.*$/, ""));
    const lv = l.match(/(\s*Lv\.3:\s*)(.+?)(\.?)\s*$/);
    if (lv) { o += lv[1] + gearStats(lv[2]) + lv[3]; n.lv3++; }
    return o;
  }
  if (/^\*\*패시브\*\*|^\*\*키워드\s/.test(l)) return passiveLine(l);
  if (/^\*\*고학년 스킬/.test(l)) { const k = l.indexOf(" — "); return k < 0 ? l : l.slice(0, k + 3) + piece(l.slice(k + 3)); }
  if (/^\s*- [①②③④⑤✦] \*[^*]+\*:/.test(l)) return cardLine(l, /^\s*- [①②③④⑤✦] \*[^*]+\*:\s*/);
  if (/^- \*\*[^*]+\*\*\s*\(/.test(l)) return cardLine(l, /^- \*\*[^*]+\*\*\s*\([^)]*\)\s*/);
  if (/^\*\*[^*]+\*\*\s*\([^)]*·[^)]*\)/.test(l)) return cardLine(l, /^\*\*[^*]+\*\*\s*\([^)]*\)\s*/);   // 교주 카드
  if (/^- \*\*효과/.test(l)) return passiveLine(l);
  return l;
}

// 사도 스탯 줄 — 블록 머리(「### 이름」 · 「### 이름 (…)」)의 이름으로 식을 돌린다
function statLines(text) {
  let cur = null;
  return text.split("\n").map((l) => {
    const h = l.match(/^###\s+(.+?)(?:\s+\(.*\))?\s*$/);
    if (h) cur = META[h[1].trim()] || null;
    if (cur && /^\*\*스탯\*\*/.test(l)) {
      const s = statOf(cur);
      const o = l.replace(/HP\s*\d+/, `HP ${s.hp}`).replace(/공격\s*\d+/, `공격 ${s.atk}`).replace(/방어\s*\d+/, `방어 ${s.def}`).replace(/치명\s*\d+\s*%/, `치명 ${s.crit}%`);
      if (o !== l) n.stat++;
      return o;
    }
    return l;
  }).join("\n");
}
// 「사도 전체 목록」 표 — | 이름 | 성격 | 종족 | 위치 · 역할 | 성급 | 엘다인 | HP | 공격 | 방어 | 치명 | …
function listTable(text) {
  return text.split("\n").map((l) => {
    const c = l.split("|");
    if (c.length < 12 || !META[c[1].trim()] || !/^\s*\d+\s*$/.test(c[7])) return l;
    const s = statOf(META[c[1].trim()]);
    c[7] = ` ${s.hp} `; c[8] = ` ${s.atk} `; c[9] = ` ${s.def} `; c[10] = ` ${s.crit}% `;
    const o = c.join("|");
    if (o !== l) n.table++;
    return o;
  }).join("\n");
}

const convertText = (t) => listTable(statLines(t.split("\n").map((l) => { const o = convertLine(l); if (o !== l) n.lines++; return o; }).join("\n")));

const v5 = fs.readdirSync(".omc/v5").filter((f) => f.endsWith(".md") && f !== "BRIEF.md").map((f) => `.omc/v5/${f}`);
const gear = fs.existsSync(".omc/gear") ? fs.readdirSync(".omc/gear").filter((f) => f.endsWith(".md")).map((f) => `.omc/gear/${f}`) : [];
const out = new Map();
for (const f of [DESIGN_DOC, ...v5, ...gear]) {
  const raw = fs.readFileSync(f, "utf8");
  const crlf = raw.includes("\r\n");
  const t = convertText(raw.replace(/\r\n/g, "\n"));
  out.set(f, crlf ? t.replace(/\n/g, "\r\n") : t);
  if (f === DESIGN_DOC) { console.log(`기획서 — ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(" · ")}`); for (const k of Object.keys(n)) n[k] = 0; }
}
console.log(`사본(.omc/v5 ${v5.length} · .omc/gear ${gear.length}) — ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

// ── js/data — 적 · 이벤트 · 상태 카드 ──────────────────────────────────────
const ENEMY = "js/data/enemies.js", EVENTS = "js/data/events.js", SCARD = "js/data/status-cards.js";
{
  const raw = fs.readFileSync(ENEMY, "utf8");
  // 옛 눈금인지 — 적 체력이 대개 두 자리면 옛 것
  const hps = [...raw.matchAll(/\bhp:\s*(\d+)/g)].map((m) => Number(m[1]));
  const old = hps.length && hps.filter((v) => v < 100).length > hps.length / 2;
  let k = 0;
  const t = !old ? raw : raw
    .replace(/\bhp:\s*(\d+)/g, (_, v) => { k++; return `hp: ${Number(v) * SC}`; })
    .replace(/(\{\s*t:\s*"(?:attack|back|attackAll|multi|block|guard|heal|thorns|selfHeal)"\s*,\s*v:\s*)(\d+)/g, (_, a, v) => { k++; return a + Number(v) * SC; });
  // 적이 얻는 강건(옛 「방어 +20%」)도 결의로(둘째 한 번 — 카제나 상태만)
  const t2 = once2 ? t.replace(/(t:\s*"buff",\s*id:\s*)"강건"/g, (_, a) => { k++; return a + "\"결의\""; }) : t;
  console.log(`적 — ${old ? `수치 ×${SC}` : "이미 새 눈금"} · ${k}곳`);
  out.set(ENEMY, t2);
}
{
  const raw = fs.readFileSync(EVENTS, "utf8");
  let k = 0;
  const t = !once ? raw : raw
    .replace(/최대 HP \+(\d+)/g, (_, v) => { k++; return `최대 HP +${Number(v) * SC}`; })
    .replace(/(by:\s*"atk-max",\s*at:\s*)(\d+)/g, (_, a, v) => { k++; return a + Number(v) * SC; });
  console.log(`이벤트 — ${k}곳`);
  out.set(EVENTS, t);
}
{
  const raw = fs.readFileSync(SCARD, "utf8");
  let k = 0;
  const t = !once ? raw : raw
    .replace(/HP\s*(\d+)\s*소모/g, (_, v) => { k++; return `HP ${Number(v) * SC} 소모`; })
    .replace(/감응\s*[:：]/g, () => { k++; return "영감:"; })
    .replace(/감응/g, () => { k++; return "영감"; });
  console.log(`상태 카드 — ${k}곳`);
  out.set(SCARD, t);
}

if (dry) { for (const [a, b] of ex.slice(0, 14)) console.log(`  ${a}\n→ ${b}`); process.exit(0); }
for (const [f, t] of out) fs.writeFileSync(f, t);
console.log("썼다");
