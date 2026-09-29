// 카드 일러스트를 그리기 전에 알아야 할 것을 한 장으로 뽑는다.
//
//   node tools/art-brief.js 에르핀          그 사도의 카드 여덟 장 + 궁극기
//   node tools/art-brief.js 에르핀_s2       카드 한 장
//   node tools/art-brief.js --todo          아직 그림이 없는 자리 (사도별로 센다)
//   node tools/art-brief.js --todo --list   그 자리를 다 늘어놓는다
//   node tools/art-brief.js 에르핀 --json   기계가 읽을 꼴
//   node tools/art-brief.js 에르핀 --short   인물 사전은 빼고 짧게
//
// 자료를 여기저기서 긁어 오면 언젠가 어긋난다. 기획서·이름표·그림 목록을 한 곳에서 본다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import B from "../js/data/built.js";
import ARTMAP from "../js/data/artmap.js";
import CARDART from "../js/data/cardart.js";
import BIBLE from "../js/data/bible.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const has = (rel) => rel && fs.existsSync(path.join(ROOT, rel));

const ROW_KO = { front: "전열", mid: "중열", back: "후열" };
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const target = argv.find((a) => !a.startsWith("--"));

// ── 한 사도의 카드 아홉 자리 ───────────────────────────────────────────
function slotsOf(key) {
  const h = B.heroes[key];
  if (!h) return null;
  const out = [];
  (B.starter[key] || []).forEach((id, i) => out.push({ id, kind: "시작", n: i, card: B.cards[id] }));
  Object.entries(B.cards)
    .filter(([, c]) => c.hero === key && c.unique)
    .forEach(([id, c], i) => out.push({ id, kind: i === 0 ? "고유·시그니처" : "고유", n: i, card: c }));
  if (h.ult) out.push({ id: `${key}_ult`, kind: "궁극기", n: 0, card: { ko: h.ult.ko, cost: h.ult.cost + "%", type: "궁극기", text: h.ult.text } });
  return out;
}

// ── 참고로 쓸 그림 ─────────────────────────────────────────────────────
// 얼굴과 옷을 잃지 않으려면 참고 그림을 넣어야 한다. 큰 것부터 적는다.
function refsOf(key) {
  const en = ARTMAP.art[key];
  const list = [
    [`assets/spine/standing/${key}/${cap(en)}.png`, "스탠딩 아틀라스 1528×1024 — 옷·소품이 조각으로 다 들어 있다. 색과 장식을 여기서 본다"],
    [`assets/sd/${key}.png`, "SD 초상 252×252 — 얼굴과 머리 모양이 한 장으로 붙어 있다. 신원 참고로 이것을 먼저 넣는다"],
    [`assets/heroicons/${en}.png`, "도감 아이콘 252×252 — 위와 같은 그림인 경우가 많다"],
    [`assets/sd/minimi_${key}.png`, "미니미 — 키와 몸 비율"],
  ];
  return list.filter(([p]) => has(p));
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function briefOf(key) {
  const h = B.heroes[key];
  const slots = slotsOf(key).map((s) => ({
    ...s,
    pic: CARDART.pic[s.id] || null,
    // 원작 아이콘은 임시 자리메움이다. 그것도 '그려야 할 자리'로 센다.
    // 궁극기만 빼 둔다 — 인게임 고학년 스킬 아이콘을 그대로 쓴다(기획서). 그려도 안 바뀐다.
    fixed: s.kind === "궁극기",
    drawn: (CARDART.pic[s.id] || "").startsWith("assets/cardart/"),
    out: `assets/cardart/${key}/${s.id}.png`,
  }));
  // 인물 사전 — 나무위키 요약(CC BY-NC-SA 2.0 KR). 이격은 아직 안 실린 것이 있어
  // 그럴 때는 기본 사도의 것을 **빌려 온 것이라고 밝히고** 보여 준다.
  const base = key.split("_")[0];
  const who = BIBLE.heroes[key] || null;
  const borrowed = who ? null : (BIBLE.heroes[base] ? base : null);

  return {
    hero: {
      key, ko: h.ko, 성격: h.nature, 종족: h.race, 열: ROW_KO[h.row], 역할: h.role,
      등급: h.star, 피해: h.dmgType, 소개: h.blurb, 패시브: h.passive,
      키워드: h.keyword ? `${h.keyword.ko} — ${h.keyword.text}` : null,
    },
    bible: who || (borrowed ? BIBLE.heroes[borrowed] : null),
    borrowed,
    refs: refsOf(key),
    slots,
  };
}

// ── 인물 사전 ──────────────────────────────────────────────────────────
// 옷과 얼굴은 참고 그림에서 보고, **무엇을 하는 사람인가**는 여기서 본다.
// 장면이 안 떠오를 때 버릇(traits)을 읽으면 대개 거기 있다.
function wrap(text, indent) {
  const pad = " ".repeat(indent);
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if ((line + " " + word).trim().length > 92 - indent) { out.push(pad + line.trim()); line = word; }
    else line += " " + word;
  }
  if (line.trim()) out.push(pad + line.trim());
  return out.join("\n");
}

function printBible(b) {
  const w = b.bible;
  if (!w) return;
  console.log("");
  if (b.borrowed) {
    console.log(`  ── 어떤 사람인가 (인물 사전에 이 이격이 아직 없어 **${b.borrowed}** 것을 빌려 왔다)`);
    console.log("     이격은 옷도 성미도 달라질 수 있다. 참고 그림을 먼저 믿는다.");
  } else {
    console.log("  ── 어떤 사람인가 (나무위키 요약 · CC BY-NC-SA 2.0 KR)");
  }
  if (w.who) { console.log(""); console.log(wrap(w.who, 5)); }
  if (w.facts && w.facts.length) {
    console.log("");
    console.log("     설정");
    for (const f of w.facts.slice(0, 6)) console.log(wrap("· " + f, 7));
  }
  if (w.traits && w.traits.length) {
    console.log("");
    console.log("     버릇과 성미 — 장면은 대개 여기서 나온다");
    for (const t of w.traits.slice(0, 8)) console.log(wrap("· " + t, 7));
  }
  if (w.quirk) { console.log(""); console.log(wrap("말버릇  " + w.quirk, 5)); }
  if (w.mood) { console.log(""); console.log(wrap("감정    " + w.mood, 5)); }
  if (w.react) {
    console.log("");
    console.log("     상황별 표정 — 카드 타입마다 얼굴이 달라야 한다");
    for (const [k, v] of Object.entries(w.react).slice(0, 6)) console.log(wrap(`· ${k}: ${v}`, 7));
  }
  if (w.never && w.never.length) {
    console.log("");
    console.log("     하지 않는 것 — 그리면 안 되는 것");
    for (const n of w.never.slice(0, 5)) console.log(wrap("· " + n, 7));
  }
}

// ── 화면에 적기 ────────────────────────────────────────────────────────
function printBrief(b, only) {
  const h = b.hero;
  console.log("");
  console.log(`■ ${h.ko}  (${h.key})`);
  console.log(`  ${h.성격} · ${h.종족} · ${h.열} ${h.역할} · ${h.피해} · ★${h.등급}`);
  console.log(`  ${h.소개}`);
  if (h.패시브) console.log(`  패시브  ${h.패시브}`);
  if (h.키워드) console.log(`  키워드  ${h.키워드}`);

  if (!flag("--short")) printBible(b);
  console.log("");
  console.log("  참고 그림 (앞의 것부터 넣는다)");
  for (const [p, why] of b.refs) console.log(`    ${p}\n      ${why}`);
  console.log("");
  console.log("  그릴 자리");
  for (const s of b.slots) {
    if (only && s.id !== only) continue;
    const mark = s.fixed ? "—" : s.drawn ? "✔" : s.pic ? "△" : "·";   // — 안 그림 · ✔ 그렸다 · △ 임시 아이콘 · · 빈 자리
    const state = s.fixed ? "원작 고학년 스킬 아이콘 고정 — 그리지 않는다"
                : s.drawn ? "그렸다" : s.pic ? "임시 — 원작 아이콘. 다시 그린다" : "비었다";
    console.log(`    ${mark} ${s.id}  [${s.kind}] ${s.card.cost}코 ${s.card.ko} (${s.card.type}) — ${state}`);
    console.log(`        효과  ${s.card.text}`);
    console.log(`        낼 곳  ${s.out}`);
  }
}

const STYLE = `[언제나 붙이는 말 — 그림마다 똑같이 쓴다]
  스타일   Polished hand-drawn 2D anime game card illustration, bold clean warm-brown
           contours, rich cel shading, softly painted simplified background,
           luminous cream highlights. Chibi proportions with a large round head —
           never realistic adult anatomy. Whimsical storybook collectible-card look.
  구도     Portrait 2:3, single character only, face unobscured and readable at
           thumbnail size, quieter lower third for later UI overlay, edge-to-edge art.
  금지     No text, no numbers, no card frame, no UI, no watermark, no extra characters.
           Do not change the reference's hair colour, eye colour, costume or props.
  크기     1024×1536 PNG`;

const WORLD = `[세계 규칙 — 어기면 tools/world-check.js 에 걸린다]
  · 지성체는 모두 여성이다. 남성을 그리지 않는다 (엘프만 산타를 안다).
  · 죽음이 지워진 세계다. 피·주검·무덤을 그리지 않는다. 쓰러지면 '주말농장'으로 간다.
  · 지명은 정해져 있다 — 에르피엔(요정·세계수 주변) · 모나티엄(엘프·동부) ·
    벨리티엔(마녀·세계수 뿌리) · 수인 부락 · 정령산 · 유령 늪 · 불길과 물길의 터.
  · 엘리아스 밖(안개·황무지·바다)은 아무나 드나들지 못한다. 배경은 안쪽으로 둔다.
  · 낱말도 트릭컬 것으로 쓴다 — 세력이 아니라 종족, 열이 아니라 위치, 등급이 아니라 성급.
  · 자세한 것은 docs/03-세계관.md · docs/05-카드일러스트.md · docs/06-낱말.md.`;

// ── 아직 안 그린 자리 ──────────────────────────────────────────────────
if (flag("--todo")) {
  // 자리는 사도당 아홉 — 시작 넷 · 고유 넷 · 궁극기 하나. 전부 그린다.
  // 원작 아이콘이 박혀 있는 자리도 '그린 것'이 아니다. 임시로 메워 둔 것이라 똑같이 센다.
  const rows = [];
  for (const key of Object.keys(ARTMAP.art)) {
    const b = briefOf(key);
    const todo = b.slots.filter((s) => !s.drawn && !s.fixed);
    if (todo.length) rows.push({ key, todo, done: b.slots.length - todo.length, all: b.slots.length });
  }
  const nTodo = rows.reduce((a, r) => a + r.todo.length, 0);
  const nAll = Object.keys(ARTMAP.art).length * 8;   // 사도당 여덟 장. 궁극기는 안 그린다.
  console.log(`그릴 자리 ${nTodo} / ${nAll} · 아직 남은 사도 ${rows.length}명`);
  console.log(`  그 가운데 ${rows.reduce((a, r) => a + r.todo.filter((s) => s.pic).length, 0)} 자리는 원작 아이콘이 임시로 박혀 있다 — 그것도 다시 그린다.`);
  console.log(`  궁극기 ${Object.keys(ARTMAP.art).length}장은 원작 고학년 스킬 아이콘을 그대로 쓴다 — 그릴 자리가 아니다.`);
  console.log("");
  console.log("한 사도를 여덟 장 통째로 끝내는 편이 결이 고르다. 참고 그림을 한 번만 물리면 되고,");
  console.log("같은 손과 같은 빛으로 여덟 장이 나오기 때문이다.");
  console.log("");
  for (const r of rows.slice(0, flag("--list") ? rows.length : 12)) {
    console.log(`  ${r.key.padEnd(14)} ${r.done}/${r.all} 그림`);
    if (flag("--list")) for (const s of r.todo)
      console.log(`      ${s.id.padEnd(16)} [${s.kind}] ${s.card.cost}코 ${s.card.ko} (${s.card.type}) — ${s.card.text}`);
  }
  if (!flag("--list") && rows.length > 12) console.log(`  … 외 ${rows.length - 12}명. 다 보려면 --list`);
  console.log("");
  console.log(STYLE);
  console.log("");
  console.log(WORLD);
  process.exit(0);
}

if (!target) {
  console.log("쓰는 법: node tools/art-brief.js <사도이름|카드id> [--json]");
  console.log("         node tools/art-brief.js --todo [--list]");
  process.exit(1);
}

// 카드 id 로 들어왔으면 그 한 장만
const key = B.heroes[target] ? target : target.replace(/_(s\d|u\d|ult)$/, "");
if (!B.heroes[key]) {
  const near = Object.keys(B.heroes).filter((k) => k.includes(target)).slice(0, 8);
  console.log(`'${target}' 라는 사도가 없습니다.${near.length ? " 비슷한 것: " + near.join(", ") : ""}`);
  process.exit(1);
}
const brief = briefOf(key);

if (flag("--json")) {
  console.log(JSON.stringify(brief, null, 1));
  process.exit(0);
}
printBrief(brief, key === target ? null : target);
console.log("");
console.log(STYLE);
console.log("");
console.log(WORLD);
