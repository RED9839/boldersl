// 파티 HP · 파티 상태로 글을 옮긴다(2026-10 사용자 — 카제나처럼 파티가 한 몸, docs/16 §8).
//
//   node tools/convert-party.js          기획서 · .omc/v5/<사도>.md · js/data/status-cards.js 를 제자리에서 고친다
//   node tools/convert-party.js --dry    무엇을 바꿀지 세기만 한다
//
// 바꾸는 것 — 대상 말이 HP · 방어 · 실드 · 파티 층 상태에 걸린 곳만(사도 층 사기 · 열의 · 집중 · 강건 · 온정은 그대로 — 사도마다다):
//   「아군 전원 · 아군 1명 · HP 최저 아군 · 자신」 + 불굴 · 결의 · 결정화 · 반격 · 취약 · 약화 · 고통 · 손상  → 「파티 X N」
//   「아군 1명 · HP 최저 아군 · 자신」 + 방어력 N% 방어 · 실드 / HP 회복 / 무적 / 디버프 해제        → 「파티 …」
//   「아군 전원」 + 방어력 N% 방어 · 실드 / HP 회복(회복력 N%)                                    → 「파티 …」 에 배율 ×2
//     (옛 「아군 전원」 은 셋에게 따로 붙어 값어치 ×2 로 쳤다 — 파티에 한 번 붙으니 배율을 두 배로 옮겨 값을 지킨다.
//      대상 말 없이 앞의 「아군 전원」 을 물고 가던 방어 · 실드 · 회복도 같은 셈 — 원래 글을 읽어 그 효과가 아군 전원이었는지 본다)
//   「아군 전원 HP N 소모」 → 「파티 HP 3N 소모」(셋이 치르던 몫)
// 한 줄 안에서만 바꾼다 — 기획서와 .omc/v5 사본이 같은 줄을 같게 바꿔 다시 합쳐도 똑같다.
// 효과가 적힌 줄만 본다: 카드(「 — 」 앞) · 신탁 · 축복 · 패시브 · 키워드 · 고학년 · 교주 카드 · 장비 효과 · 애착.
import fs from "node:fs";
import { parseEffect } from "../js/effects.js";
import { DESIGN_DOC } from "./lib/paths.js";

const dry = process.argv.includes("--dry");
const PARTY_ST = "불굴|결의|결정화|반격|취약|약화|고통|손상";
const WHO = "아군 전원|아군 전체|파티 전원|아군 1명|HP 최저 아군|자신";
const stat = { status: 0, guard: 0, heal: 0, doubled: 0, invuln: 0, cleanse: 0, pay: 0, lines: 0, odd: [] };
const examples = [];

// 한 조각(엔진이 한 번에 읽는 글) — 원래 글을 읽어 아군 전원 방어 · 실드 · 회복을 찾고, 배율을 두 배로 한 뒤 대상 말을 바꾼다
function piece(seg) {
  if (!seg || !/아군|자신|HP 최저/.test(seg)) return seg;
  let t = seg;
  const fx = parseEffect(seg, {}).fx.filter((f) => f.k === "block" || f.k === "shield" || f.k === "heal");
  // 「… 2번」 은 같은 효과를 또 낸 것 — 글자로는 하나다
  const fxOne = fx.filter((f, i) => !(i > 0 && fx[i - 1] && JSON.stringify(fx[i - 1]) === JSON.stringify(f) && /\d\s*번/.test(seg)));
  const RE = /방어력\s*(\d+)\s*%(?!\s*[+])|회복력\s*(\d+)\s*%|회복\s*\(\s*공격력\s*(\d+)\s*%/g;
  const ms = [...seg.matchAll(RE)];
  if (ms.length === fxOne.length) {
    for (let i = ms.length - 1; i >= 0; i--) {
      if (fxOne[i].target !== "allAllies") continue;
      const m = ms[i], n = Number(m[1] || m[2] || m[3]);
      const at = m.index + m[0].indexOf(String(n));
      t = t.slice(0, at) + String(n * 2) + t.slice(at + String(n).length);
      stat.doubled++;
    }
  } else if (fxOne.some((f) => f.target === "allAllies")) stat.odd.push(seg);
  const before = t;
  t = t.replace(new RegExp(`(?:${WHO})\\s*(${PARTY_ST})\\s*(\\d+)`, "g"), (_, id, n) => { stat.status++; return `파티 ${id} ${n}`; });
  t = t.replace(new RegExp(`(?:${WHO})\\s*방어력\\s*(\\d+)\\s*%\\s*(방어|실드)`, "g"), (_, n, k) => { stat.guard++; return `파티 방어력 ${n}% ${k}`; });
  t = t.replace(new RegExp(`(?:${WHO})\\s*HP\\s*회복`, "g"), () => { stat.heal++; return "파티 HP 회복"; });
  t = t.replace(new RegExp(`(?:${WHO})\\s*무적`, "g"), () => { stat.invuln++; return "파티 무적"; });
  t = t.replace(new RegExp(`(?:${WHO})\\s*디버프`, "g"), () => { stat.cleanse++; return "파티 디버프"; });
  t = t.replace(/(?:아군 전원|아군 전체|파티 전원)\s*HP\s*(\d+)\s*소모/g, (_, n) => { stat.pay++; return `파티 HP ${Number(n) * 3} 소모`; });
  if (t !== seg && examples.length < 40 && t !== before) examples.push([seg, t]);
  return t;
}
// 패시브 · 키워드 줄 — 엔진은 「 · 이름:」 과 문장(「. 」)마다 따로 읽는다. 그 경계로 잘라 조각마다
const passiveLine = (l) => l.split(/(\s·\s(?=[^:·.]{1,30}:)|(?<=[.。])\s+)/).map((x, i) => (i % 2 ? x : piece(x))).join("");
// 카드 줄 — 「 — 」 뒤는 맛글이라 안 건드린다
const cardLine = (l, head) => { const m = l.match(head); if (!m) return l; const rest = l.slice(m[0].length); const k = rest.indexOf(" — "); return m[0] + (k < 0 ? piece(rest) : piece(rest.slice(0, k)) + rest.slice(k)); };

export function convertLine(l) {
  if (/^\*\*(?:원작|스탯)\*\*/.test(l)) return l;
  if (/^\*\*패시브\*\*|^\*\*키워드\s/.test(l)) return passiveLine(l);
  if (/^\*\*고학년 스킬/.test(l)) { const k = l.indexOf(" — "); return k < 0 ? l : l.slice(0, k + 3) + piece(l.slice(k + 3)); }
  if (/^\s*- [①②③④⑤✦] \*[^*]+\*:/.test(l)) return cardLine(l, /^\s*- [①②③④⑤✦] \*[^*]+\*:\s*/);
  if (/^- \*\*[^*]+\*\*\s*\(/.test(l)) return cardLine(l, /^- \*\*[^*]+\*\*\s*\([^)]*\)\s*/);
  if (/^\*\*[^*]+\*\*\s*\([^)]*·[^)]*\)/.test(l)) return cardLine(l, /^\*\*[^*]+\*\*\s*\([^)]*\)\s*/);   // 교주 카드
  if (/^- \*\*(?:효과|애착)/.test(l)) return passiveLine(l);
  return l;
}
const convertText = (t) => t.split("\n").map((l) => { const o = convertLine(l); if (o !== l) stat.lines++; return o; }).join("\n");

const files = [DESIGN_DOC, ...fs.readdirSync(".omc/v5").filter((f) => f.endsWith(".md") && f !== "BRIEF.md").map((f) => `.omc/v5/${f}`)];
const out = new Map();
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const crlf = raw.includes("\r\n");
  const t = convertText(raw.replace(/\r\n/g, "\n"));
  out.set(f, crlf ? t.replace(/\n/g, "\r\n") : t);
  if (f === DESIGN_DOC) { console.log(`기획서 — 상태 ${stat.status} · 방어/실드 ${stat.guard} · 회복 ${stat.heal} · 배율 ×2 ${stat.doubled} · 무적 ${stat.invuln} · 해제 ${stat.cleanse} · HP 치르기 ${stat.pay} · 줄 ${stat.lines}`); for (const k of Object.keys(stat)) if (typeof stat[k] === "number") stat[k] = 0; }
}
// 상태 카드(js/data/status-cards.js) — 「text: "…"」
const SC = "js/data/status-cards.js";
const sc = fs.readFileSync(SC, "utf8").replace(/text: "([^"]*)"/g, (_, x) => `text: "${piece(x)}"`).replace(/blurb: "([^"]*)"/g, (_, x) => `blurb: "${x.replace(/아군 전원 (취약|약화|고통|손상)/g, "파티 $1").replace(/아군 전원/g, "파티")}"`);
out.set(SC, sc);

console.log(`예:`); for (const [a, b] of examples.slice(0, 25)) console.log(`  ${a}\n    → ${b}`);
if (stat.odd.length) { console.log(`짝이 안 맞아 배율을 못 고친 조각 ${stat.odd.length}:`); for (const x of stat.odd) console.log("  " + x); }
if (!dry) { for (const [f, t] of out) fs.writeFileSync(f, t); console.log("썼다"); }
