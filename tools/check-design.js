// 파서가 기획서를 제대로 읽었는지 본다.
//
// 파서는 조용히 틀린다 — 정규식이 한 줄을 못 잡으면 그 카드가 그냥 없어진다.
// 그래서 개수와 규칙을 견준다. 기획서가 원본이니, 어긋나면 파서나 기획서 둘 중 하나가 틀린 것이다.
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import D from "../js/data/design.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || DESIGN_DOC;
const raw = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");

let bad = 0;
const fail = (m) => { console.log(`  실패 ${m}`); bad++; };
const ok = (m) => console.log(`  ok   ${m}`);

const H = Object.values(D.heroes);

// ── 개수 ───────────────────────────────────────────────────────────────
console.log("개수");
// 기획서의 사도 머리를 직접 센다
const heads = (raw.match(/^### .+ \((순수|광기|냉정|우울|활발|공명) · /gm) || []).length;
H.length === heads ? ok(`사도 ${H.length}명 — 기획서와 같다`) : fail(`사도 ${H.length}명인데 기획서엔 ${heads}명`);

const cards = H.reduce((a, h) => a + h.start.length + h.unique.length, 0);
cards === H.length * 8 ? ok(`카드 ${cards}장 — 사도당 여덟`) : fail(`카드 ${cards}장 (${H.length * 8} 이어야 한다)`);

const flash = H.reduce((a, h) => a + h.unique.reduce((b, u) => b + u.flash.length, 0), 0);
flash === H.length * 20 ? ok(`신탁 ${flash}개 — 고유 카드마다 다섯`) : fail(`신탁 ${flash}개 (${H.length * 20} 이어야 한다)`);

// ── 빠진 것 ────────────────────────────────────────────────────────────
console.log("");
console.log("빠진 것");
for (const [field, ko] of [["hp", "HP"], ["atk", "공격"], ["def", "방어"], ["crit", "치명"], ["passive", "패시브"], ["ult", "고학년 스킬"], ["blurb", "설명"]]) {
  const miss = H.filter((h) => h[field] == null || h[field] === "");
  miss.length ? fail(`${ko} 없는 사도 ${miss.length}: ${miss.slice(0, 3).map((h) => h.ko).join(", ")}`) : ok(`${ko} — 135명 모두 있다`);
}

// ── 기획서의 규칙과 맞는가 ─────────────────────────────────────────────
console.log("");
console.log("기획서의 규칙");

// 기본 스탯 표 (태생 3성) — 성급·개성 보정이 있으니 범위로 본다
const RANGE = { hp: [300, 1300], atk: [40, 200], def: [15, 100], crit: [0, 30] };   // v6 카제나 눈금(옛 값 ×10 언저리 — docs/18 §2)
for (const [k, [lo, hi]] of Object.entries(RANGE)) {
  const out = H.filter((h) => h[k] < lo || h[k] > hi);
  out.length ? fail(`${k} 가 ${lo}~${hi} 를 벗어난 사도 ${out.length}: ${out.slice(0, 3).map((h) => `${h.ko} ${h[k]}`).join(", ")}`)
             : ok(`${k} ${Math.min(...H.map((h) => h[k]))}~${Math.max(...H.map((h) => h[k]))} — 표 범위 안`);
}

// 고학년 스킬 비용은 150/200/250/300 중 하나
const COSTS = [150, 200, 250, 300];
const badUlt = H.filter((h) => h.ult && !COSTS.includes(h.ult.cost));
badUlt.length ? fail(`고학년 스킬 비용이 규칙 밖인 사도 ${badUlt.length}: ${badUlt.slice(0, 3).map((h) => `${h.ko} ${h.ult.cost}%`).join(", ")}`)
              : ok("고학년 스킬 비용이 모두 150/200/250/300%");

// 신탁은 ①강화 ②경량 ③연계 ④변형 ⑤각성 순서
const KIND = ["강화", "경량", "연계", "변형", "각성"];
const badFlash = [];
for (const h of H) for (const u of h.unique)
  u.flash.forEach((f, i) => { if (f.n !== i + 1 || (u.flash.some((x) => x.kind) && f.kind !== KIND[i])) badFlash.push(`${h.ko}/${u.ko} ${f.n}${f.kind}`); });   // 자유 신탁(분류 없음)은 차례만 본다
badFlash.length ? fail(`신탁 순서가 어긋난 곳 ${badFlash.length}: ${badFlash.slice(0, 3).join(", ")}`)
                : ok("신탁이 모두 ①강화 ②경량 ③연계 ④변형 ⑤각성 순서");

// 시작 카드는 역할별 구성이 정해져 있다(딜러 기본2·강1·방어1 / 서포터 기본2·회복2 / 탱커 기본2·방어2)
const roleBad = H.filter((h) => h.start.length !== 4);
roleBad.length ? fail(`시작 카드가 넷이 아닌 사도 ${roleBad.length}`) : ok("시작 카드가 모두 넷");

// 첫 고유 카드는 시그니처
const noSig = H.filter((h) => !h.unique[0] || !(h.unique[0].tags || []).some((t) => t.includes("시그니처")));
noSig.length ? fail(`첫 고유 카드가 시그니처가 아닌 사도 ${noSig.length}: ${noSig.slice(0, 3).map((h) => h.ko).join(", ")}`)
             : ok("첫 고유 카드가 모두 시그니처");

// ── 표본 대조 — 기획서 원문과 글자까지 같은가 ──────────────────────────
console.log("");
console.log("원문과 대조");
const SAMPLE = ["에르핀", "네르", "티그", "마요"];
for (const ko of SAMPLE) {
  const h = H.find((x) => x.ko === ko);
  if (!h) { fail(`${ko} 를 못 찾았다`); continue; }
  const block = raw.split(/^### /m).find((b) => b.startsWith(`${ko} (`));
  if (!block) { fail(`${ko} 의 원문을 못 찾았다`); continue; }
  const sigName = h.unique[0].ko;
  const inRaw = block.includes(`**${sigName}**`);
  const ultIn = block.includes(`**${h.ult.ko}**`);
  inRaw && ultIn ? ok(`${ko} — 시그니처 「${sigName}」·고학년 스킬 「${h.ult.ko}」가 원문에 있다`)
                 : fail(`${ko} — 원문과 안 맞는다 (시그니처 ${inRaw} · 고학년 스킬 ${ultIn})`);
}

console.log("");
console.log(bad ? `문제 ${bad}개` : "파서가 기획서를 제대로 읽었다");
process.exit(bad ? 1 : 0);
