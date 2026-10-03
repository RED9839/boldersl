// 카드 글에 밑줄 칠 낱말과 그 풀이를 모은다.
//
// 세 군데에서 온다.
//   ① 사도 전용 키워드 135개 — 기획서(js/data/built.js) 의 hero.keyword
//   ② 상태와 규칙          — 기획서 「전투 규칙」 줄을 그대로 읽는다
//   ③ 이 게임이 실제로 하는 것 — js/rules.js · js/combat.js 에 몸이 있는 것
//
// **풀이가 없는 것은 없다고 적는다.** 기획서에 이름만 있고 뜻이 없는 낱말이 다섯 있다
// (개전·종극·주도·보존·소멸). 그럴듯한 풀이를 지어 넣으면 규칙이 조용히 생겨 버린다.
//
//   node tools/build-keywords.js
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import B from "../js/data/built.js";
import * as R from "../js/rules.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOC = process.argv[2] || DESIGN_DOC;

// ── ② 기획서 「상태」 줄을 읽는다 ──────────────────────────────────────
// 손으로 옮겨 적으면 기획서가 바뀌었을 때 어긋난다. 원문에서 읽는다.
const raw = fs.existsSync(DOC) ? fs.readFileSync(DOC, "utf8").replace(/\r\n/g, "\n") : "";
const statusLine = (raw.match(/^-\s*상태:\s*(.+)$/m) || [])[1] || "";
const fromDoc = {};
for (const m of statusLine.matchAll(/([가-힣]+)\(([^)]+)\)/g)) fromDoc[m[1]] = m[2];
for (const m of statusLine.split("·").map((s) => s.trim())) {
  // 줄 끝의 마침표까지 낱말로 셌더니 "실드." 가 생겼다
  const bare = m.replace(/\(.*\)/, "").replace(/[.,·\s]+$/, "").trim();
  if (bare && !(bare in fromDoc)) fromDoc[bare] = null;   // 이름만 있는 것
}

// ── 공용 키워드 — 기획서가 이름만 부른다 ──────────────────────────────
const commonLine = (raw.match(/공용 키워드:\s*(.+?)\./m) || [])[1] || "";
const commonNames = commonLine.split("·").map((s) => s.trim()).filter(Boolean);

// ── ③ 이 게임이 실제로 하는 것 ────────────────────────────────────────
// 기획서에 없고 엔진에만 있는 것은 그렇다고 밝힌다.
const ENGINE = {
  감전: "이 게임에서는 주는 피해 ×0.9. 턴마다 1씩 풀린다 (js/combat.js).",
  중독: "이 게임에서는 스택당 주는 피해 -2%, 최대 -30%. 천천히 풀린다 (js/combat.js).",
  기절: "적은 다음 수를 못 한다. 모으던 힘(큰 수 예고)도 흩어진다.",
  도발: "정한 턴 동안 적이 도발을 건 사도만 노린다 — 뒷줄을 노리던 수도.",
  침묵: "적은 공격이 아닌 수(방어·강화·방해·회복·힘 모으기)를 못 한다.",
  무적: "다음 내 턴이 올 때까지 피해를 받지 않는다 — 적의 차례까지 간다.",
  // 공용 키워드의 뜻(docs/07-스킬구성.md) — 보존 · 소멸 · 개전 · 주도 · 종극
  보존: "이 게임에서는 턴이 끝나도 버려지지 않고 손에 남는다.",
  소멸: "이 게임에서는 내면 이 전투에서 사라진다.",
  개전: "이 게임에서는 전투를 시작할 때 첫 손패에 든다.",
  // 주도 · 종극 — 카제나의 뜻 그대로(2026-10 사용자). 엔진: js/combat.js beginTurn · costOf · playCard
  주도: "턴 시작에 손에 있으면 반반의 확률로 이번 턴 비용 -1. 그 턴 다른 카드를 먼저 내면 원래 비용으로 돌아간다.",
  종극: "이 카드를 내면 효과가 끝난 뒤 턴이 끝난다.",
};

// 기획서 한 줄(「방어(턴 종료 시 소멸) · 실드(유지)」)로는 둘이 어떻게 다른지 안 보인다 — 둘 다 '막는 것' 으로 읽힌다.
// 엔진이 실제로 하는 대로 풀어 쓴다(js/combat.js — 방어는 다음 내 턴 시작에 0, 맞을 때 방어 → 실드 차례로 깎인다).
// 「방어력」(능력치)은 다른 낱말이라 밑줄을 긋지 않고 여기서 밝힌다.
const CLEAR = {
  방어: "이번 턴만 막아 주는 보호막. 피해를 실드보다 먼저 막고, 적의 차례가 끝나 다음 내 턴이 오면 사라진다. 「방어 150%」 는 방어력(능력치)의 150% 만큼.",
  실드: "사라지지 않고 남는 보호막. 방어 다음에 깎이고, 다 깎일 때까지 턴이 지나도 남는다. 「실드 300%」 는 방어력(능력치)의 300% 만큼.",
};

// 기획서가 따로 풀지 않은 말 — 엔진이 하는 대로(js/combat.js · js/run-fx.js)
const MORE = {
  "즉시 행동": "적 머리 위의 ⚡숫자. 적이 수를 예고한 뒤 파티가 카드를 그 장수만큼 내면, 적은 턴 끝을 기다리지 않고 그 수를 바로 한다(한 적은 내 턴에 한 번). 「즉시 행동 1장 늦춤」 은 그 ⚡ 셈을 1장 되돌린다 — 카드를 1장 더 내야 당겨진다. 턴이 바뀌거나 새 수를 예고하면 0장부터 다시 센다.",
  디버프: "걸리면 손해인 상태 — 취약 · 약화 · 감전 · 중독 · 기절 따위. 「해제」 로 지울 수 있는 것은 취약 · 약화 · 감전 · 중독.",
  해제: "「디버프 N개 해제」 — 걸린 디버프를 N개 지운다. 취약 → 약화 → 감전 → 중독 차례로 걸려 있는 것부터.",
  "HP 최저 아군": "남은 HP 비율(HP ÷ 최대 HP)이 가장 낮은 아군. 효과마다 그때 다시 고른다 — 「→ 다시 최저 아군」 은 앞 효과 뒤에 가장 낮아진 아군이라 다른 사도일 수 있다.",
  "최저 아군": "남은 HP 비율(HP ÷ 최대 HP)이 가장 낮은 아군. 효과마다 그때 다시 고른다 — 앞 효과 뒤에 가장 낮아진 아군이라 다른 사도일 수 있다.",
};

// 강인도 · 격파(카제나) — 엔진이 하는 대로(js/rules.js TOUGH · STATUS_V · js/combat.js toughHit). 수치는 rules.js 에서 읽는다
const T = R.TOUGH, V = R.STATUS_V, pc = (v) => `${Math.round(v * 100)}%`;
const TOUGH_WORDS = {
  강인도: `적 체력 막대 밑의 칸(보통 ${T.fight} · 엘리트 ${T.elite} · 보스 ${T.boss}). 공격 카드 한 장이 적을 치면 ${T.hit}칸, 약점이면 ${T.hit + T.weak}칸 깎인다(여러 번 쳐도 한 장에 한 번). 0칸이 되면 격파. 덜 깎인 칸은 턴이 바뀌어도 남는다.`,
  격파: `강인도가 0칸이 된 상태. 그 순간 파티 AP +${T.ap}, 그 적의 즉시 행동 셈이 ${T.delay}장 늦춰진다. 다음 내 턴이 오면 강인도가 다 찬다(보스는 판이 바뀔 때도). 격파 자체로 받는 피해는 늘지 않는다 — 잔불 · 잔광 · 「파괴:」 카드가 더 아프다.`,
  약점: `적마다 약점 성격이 있다(대개 그 적의 성격을 이기는 성격 — 적 이름 옆 표시). 약점 성격 사도의 공격은 피해 +${pc(R.NATURE_DMG)}, 강인도를 ${T.weak}칸 더 깎는다. 카드의 「약점」 은 성격과 상관없이 약점 공격으로 친다.`,
  분쇄: `이 카드는 방어 · 실드가 남은 적에게 피해 +${pc(V.분쇄)}.`,
  잔불: `이 카드는 격파된 적에게 피해 +${pc(V.잔불)}.`,
  잔광: `이 카드는 강인도를 ${T.glow}칸 더 깎고, 격파된 적에게 피해 +${pc(V.잔광)}.`,
  파괴: "「파괴: …」 — 고른 적이 격파된 상태일 때만 뒤의 효과가 돈다. 이 카드의 앞선 타격으로 격파시켰어도 돈다.",
};

// 카제나 상태(js/rules.js STATUS_V · 겹 규칙 · docs/16) — 엔진이 하는 대로. 기획서 「상태:」 줄의 짧은 풀이 위에 덮어쓴다
const KILL = `적을 쓰러뜨리면 파티 AP +${R.KILL_AP}.`;
const STATUS_WORDS = {
  취약: `받는 피해 +${pc(V.취약)}. 숫자는 겹 — 맞을 때마다(카드 한 장 · 적의 수 하나) 1 준다. 턴이 지나도 안 준다. 다시 걸면 더해진다.`,
  약화: `주는 피해 -${pc(V.약화)}. 숫자는 겹 — 피해를 줄 때마다(카드 한 장 · 적의 공격 수 하나) 1 준다. 턴이 지나도 안 준다.`,
  사기: `겹마다 주는 피해 +${pc(V.사기)}(사기 3 = +${pc(3 * V.사기)}). 줄지 않는다 — 전투 내내. 다시 걸면 더해진다(최대 ${V.사기Max}겹 · 적은 ${R.FOE_INT_MAX}겹).`,
  불굴: `겹마다 받는 피해 -${pc(V.불굴)}. 줄지 않는다 — 전투 내내. 합쳐서 -${pc(V.불굴Cap)} 까지(${Math.round(V.불굴Cap / V.불굴)}겹 몫 — 그 넘는 겹은 하는 일이 없다).`,
  손상: `얻는 방어 · 실드 -${pc(V.손상)}. 숫자는 겹 — 방어나 실드를 얻을 때마다 1 준다.`,
  결의: `겹마다 얻는 방어 · 실드 +${V.결의}(한 번 얻을 때마다). 줄지 않는다 — 전투 내내(최대 ${V.결의Max}겹).`,
  결정화: `턴이 끝날 때 겹마다 방어력 ${pc(V.결정화)} 실드를 얻는다. 줄지 않는다 — 전투 내내(최대 ${V.결정화Max}겹).`,
  고통: `턴이 끝날 때 겹만큼 고정 피해(방어 · 실드를 뚫는다). 그 뒤 겹이 절반으로 준다(최대 ${V.고통Max}).`,
  반격: `적의 수에 맞으면 그 적에게 방어력 ${pc(V.반격)} 피해로 되친다(수 하나에 한 번). 그때 1 준다.`,
  열의: `겹마다 공격력 +${pc(V.열의)}(회복력도 공격력에서 나와 같이 오른다). 줄지 않는다 — 전투 내내(최대 ${V.열의Max}겹).`,
  강건: `겹마다 방어력 +${pc(V.강건)}. 줄지 않는다 — 전투 내내(최대 ${V.강건Max}겹).`,
  집중: `겹마다 치명 확률 +${pc(V.집중)}p. 줄지 않는다 — 전투 내내(최대 ${V.집중Max}겹).`,
  온정: `겹마다 회복력 +${pc(V.온정)}. 줄지 않는다 — 전투 내내(최대 ${V.온정Max}겹).`,
  표식: `공격 카드에 맞으면 덤으로 공격력 ${pc(V.표식)} 피해 한 번과 강인도 1칸. 그때 1 준다. 사도 전용 표식(「늑대 표식」 따위)과 다르다.`,
};
// 카제나 카드 키워드(js/combat.js handAuto · playCard · draw · endTurn, docs/16)
const CZN_WORDS = {
  연계: "손에 있을 때 다른 사도의 카드를 내면 비용 없이 저절로 나간다. 교주 카드는 깨우지 않는다.",
  천상: "손에 있을 때 비용 2 이상인 카드를 내면 비용 없이 저절로 나간다.",
  신속: "이 카드는 적의 즉시 행동 셈(⚡)을 늘리지 않는다.",
  연속: "「연속: …」 — 이번 턴 바로 앞에 낸 카드가 같은 속성(사도 성격)이면 뒤의 효과가 돈다.",
  감응: "「감응: …」 — 이 카드가 뽑힐 때 뒤의 효과가 돈다. 낼 때는 안 돈다.",
  증발: "턴이 끝날 때 손에 있으면 이 전투에서 사라진다(보존보다 앞선다).",
  유일: "덱에 한 장만. 이미 가졌으면 상점 · 이벤트 · 보상이 다시 내놓지 않고, 복제도 안 된다. 사도의 강화 카드도 유일이다.",
  "상태 카드": "적이 이 전투에만 더미에 끼워 넣는 방해 카드. 덱에는 남지 않는다.",
  저주: "골칫거리 카드 — 이벤트의 대가로 판의 덱에 남는 방해 카드. 카드 제거로만 뺀다.",
  처치: KILL,
};

// ── 규칙 낱말 ─────────────────────────────────────────────────────────
const RULES = {
  AP: "파티가 함께 쓴다. 매 턴 3, 남으면 사라진다. 카드 코스트가 곧 AP다.",
  드로우: "덱에서 카드를 뽑는다.",
  치명: "피해 150% 고정. 확률은 딜러 10%, 그 밖은 5%.",
  신탁: "고유 카드마다 다섯(①강화 ②경량 ③연계 ④변형 ⑤각성). 하나를 골라 그 카드가 바뀐다.",
  기적: "겨우살이의 축복(옛 이름). 신탁 위에 드물게 한 줄 더.",
  "겨우살이의 축복": "신탁 위에 드물게 한 줄 더 — 카드 종류마다 다른 열세 가지(피해 ×1.3 · 비용 -1 · 드로우 · AP · 회복 · 방어 · 취약 · 중독 · 이번 전투 공격력/방어력 +10%).",
  "고학년 게이지": "파티 공용 0~300%. 카드에 AP 를 1 쓸 때마다 +10%(0코 카드는 안 찬다). 고학년 스킬이 이것을 쓴다. 전투가 끝나도 남은 만큼 다음 전투로 이어진다.",
  // 장수를 누구 것으로 세나 — 패시브 글이 밝힌다(js/passive.js TRIGGERS · CONDS)
  "낼 때마다": "이름이 붙으면(「에르핀의 공격 카드를 3장 낼 때마다」) 그 사도가 낸 카드만 센다 — 다른 아군의 카드는 안 센다. 이름이 없어도 그 사도 자신의 카드다. 장비의 「자신의 …」 는 낀 사도의 카드. 「아군이 …」 · 「파티가 …」 면 누가 냈든 센다. N장은 전투 내내 이어 세고, 「한 턴에」 가 붙으면 턴마다 0 부터.",
  파티가: "파티 셋이 낸 카드를 함께 센다 — 누가 냈든. 「파티가 이번 턴 카드를 3장째 낼 때」 는 그 턴 세 번째 카드, 「파티가 이번 턴 카드를 3장 이상 냈으면」 은 그 턴 낸 장수. 턴이 바뀌면 0 부터.",
  // 강화 카드 — 사도마다 한 장(js/rules.js isPower · docs/15 §7)
  "강화 카드": "사도마다 한 장뿐인 고유 카드(종류 「강화」). 덱에 한 장만 들고(복제할 수 없다), 내면 이 전투에서 사라지고 판의 덱에서도 빠져 이 판에서는 다시 얻지 못한다. 대신 그 버프는 「판 내내」 — 판이 끝날 때까지 다음 전투마다 다시 걸린다. 신탁 · 축복을 받아도 같다.",
  "판 내내": "판이 끝날 때까지. 이 전투뿐 아니라 다음 전투마다 처음부터 걸려 있고, 판을 이어해도 남는다. 사도 정보 창에 출처 카드와 함께 「판 내내」 로 보인다.",
  회복력: "공격력 + 역할 몫(서포터 +12 · 탱커 +7 · 딜러 0). 장비의 「회복력 +N」 은 여기에만 더해지고, 「회복력 +N%」 는 곱해진다. 「HP 회복(회복력 40%)」 은 이 값의 40% 를 채운다.",
};

const words = {};
const add = (ko, text, kind, owner) => {
  if (!words[ko]) words[ko] = { ko, text: text || null, kind, owner: owner || null };
};

for (const [ko, text] of Object.entries(RULES)) add(ko, text, "규칙");
for (const [ko, text] of Object.entries(fromDoc)) add(ko, text ? `${text}.` : null, "상태");
for (const [ko, text] of Object.entries(ENGINE)) {
  if (words[ko] && !words[ko].text) words[ko].text = text;
  else add(ko, text, "상태");
}
for (const ko of commonNames) add(ko, null, "공용");
for (const [ko, text] of Object.entries(CLEAR)) if (words[ko]) words[ko].text = text;
for (const [ko, text] of Object.entries(MORE)) add(ko, text, "규칙");
for (const [ko, text] of Object.entries(TOUGH_WORDS)) add(ko, text, "규칙");
for (const [ko, text] of Object.entries(STATUS_WORDS)) { if (words[ko]) { words[ko].text = text; words[ko].kind = "상태"; } else add(ko, text, "상태"); }
for (const [ko, text] of Object.entries(CZN_WORDS)) add(ko, text, "규칙");

// ── ① 사도 전용 ───────────────────────────────────────────────────────
//
// 기획서가 한 칸에 두 가지를 적어 둔 사도가 있다. 그윈이 그렇다 —
//   깃발: "적 1명에 꽂는 표식… 「동상」: 스택형 둔화…"
// 그대로 두면 깃발을 눌렀는데 동상 풀이까지 같이 뜬다(실제로 그랬다).
// 「」 로 묶인 낱말을 **곁말**로 떼어 제 풀이를 준다.
//
// 다만 「」 안이 늘 낱말은 아니다. 카드 이름일 때도 있고(「최강의 수집품임」),
// 풀이에만 나오고 카드 글에는 안 나오는 말도 있다(「꽁꽁」).
// 그래서 **그 사도의 카드 글에 실제로 나오는 것만** 곁말로 친다.
const cardsOf = {};
for (const c of Object.values(B.cards)) (cardsOf[c.hero] = cardsOf[c.hero] || []).push(c);

function splitNested(key, text) {
  const mine = cardsOf[key] || [];
  const subs = {};
  // **문장 첫머리에 선 것만** 곁말로 친다.
  //   그윈  "… 드로우1. 「동상」: 스택형 둔화…"      → 앞이 마침표다. 딴 풀이다
  //   아멜리아 "…받을 때마다 「감전」 1을 공격자에게"  → 문장 한가운데다. 그냥 가리키는 말이다
  // 가운데 것까지 떼었더니 풀이가 "…받을 때마다" 에서 끊겼다(실제로 그랬다).
  const marks = [...text.matchAll(/「([^」]{2,8})」\s*[는은이가]?\s*[:：]?\s*/g)]
    .filter((m) => m.index === 0 || /[.。]\s*$/.test(text.slice(0, m.index)));
  let main = text;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const word = m[1].trim();
    if (/\d/.test(word)) continue;
    // 키워드 제 이름이다 — 「「물보라」가 5개가 되면: …」 은 그 키워드의 규칙이지 딴 풀이가 아니다.
    // 떼어 냈더니 밑줄 풀이가 「최대 5.」 에서 끊겨 다 찼을 때 무엇을 하는지가 안 보였다(실제로 그랬다)
    if (word === (B.heroes[key].keyword || {}).ko) continue;
    if (mine.some((c) => c.ko === word)) continue;            // 카드 이름이다
    if (!mine.some((c) => c.text.includes(word))) continue;   // 카드 글에 안 나온다
    const from = m.index + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
    subs[word] = text.slice(from, to).trim().replace(/^[,.\s]+/, "");
    if (m.index < main.length) main = text.slice(0, m.index).trim();
  }
  return { main: main.trim(), subs };
}

const heroes = {};
let nSub = 0;
for (const [key, h] of Object.entries(B.heroes)) {
  if (!h.keyword) continue;
  const { main, subs } = splitNested(key, h.keyword.text);
  nSub += Object.keys(subs).length;
  heroes[key] = { ko: h.keyword.ko, text: main, subs };
}

// 밑줄을 칠 때 긴 낱말부터 찾아야 한다 — "고학년 게이지" 가 "고학년 스킬" 에 먹히면 안 된다.
const order = Object.keys(words).sort((a, b) => b.length - a.length);

// 잘못 걸리는 자리를 막는다. "방어" 는 "방어력" 안에도 있다.
const NOT_AFTER = { 방어: ["력"], 공격: ["력"],
  // 강인도 낱말은 카드 키워드로 선 자리에만 — 「방어·실드 전부 파괴 후」 · 「대지 분쇄:」 · 「약점 공략」(축복 이름) · 「잔불 조심」 은 다른 말이다
  파괴: [" ", ",", ")", "로", "후", "하", "된", "\""], 분쇄: [":", "」"], 약점: [" ", "을", "만", "이", "에"], 잔불: [" ", "」"], 잔광: [" ", "」"],
  // 카제나 상태 · 키워드 — 낱말 속(「사기진작」 · 「고통에」 · 「표식이다」 · 「처치하면」)은 아니다
  사기: ["진", "꾼", "를", "가", "도"], 집중: ["포", "해", "하", "적", "력"], 고통: ["에", "을", "이", "스", "받"], 표식: ["이", "을", "은", "과", "에", "도"], 손상: ["되", "된", "을", "이"],
  반격: ["자", "꾼", "을", "이"], 결의: ["를", "가", "에"], 연계: ["되", "된", "해"], 유일: ["한", "하"], 처치: ["하", "한", "되", "된", "할", "해", "도", "시"],
  저주: ["가", "를", "의", "문", "에", "받"], 연속: ["으", "해", "된", "되", "이", "으로"], 신속: ["히", "한", "하"] };
// 뒤에 숫자(겹)가 와야만 밑줄 — 흔한 낱말이라(「집중포화」 · 「모든 열의 영웅」 · 「강건한」)
const NUM_AFTER = ["열의", "강건", "집중", "온정"];
// 앞 글자로 막는 것 — 「충격파」 안의 「격파」
const NOT_BEFORE = { 격파: ["충"] };

const out = {
  _meta: {
    source: "사도 전용 키워드는 기획서(js/data/built.js), 상태·공용 키워드는 기획서 「전투 규칙」 원문, 나머지는 이 게임의 엔진(js/rules.js·js/combat.js).",
    tool: "tools/build-keywords.js",
    built: new Date().toISOString().slice(0, 10),
    note: "text 가 null 이면 기획서에 이름만 있고 풀이가 없다는 뜻이다. 지어내지 않는다.",
  },
  words, order, notAfter: NOT_AFTER, notBefore: NOT_BEFORE, numAfter: NUM_AFTER, heroes,
};

const dst = path.join(HERE, "..", "js", "data", "keywords.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-keywords.js. 손으로 고치지 말 것.",
  "export default " + JSON.stringify(out) + ";",
  "",
].join("\n"));

const thin = Object.values(words).filter((w) => !w.text);
console.log(`낱말 ${Object.keys(words).length}개 · 사도 전용 ${Object.keys(heroes).length}개 (곁말 ${nSub}개) → js/data/keywords.js`);
for (const kind of ["규칙", "상태", "공용"]) {
  const mine = Object.values(words).filter((w) => w.kind === kind);
  console.log(`  ${kind} ${mine.length} — ${mine.map((w) => w.ko + (w.text ? "" : "(풀이 없음)")).join(" · ")}`);
}
// 이름이 겹치는 낱말 — 뜻이 서로 다르면 사람이 한 번 봐야 한다
{
  const byName = {};
  for (const [key, h] of Object.entries(heroes)) {
    (byName[h.ko] = byName[h.ko] || []).push([key, h.text]);
    for (const [w, t] of Object.entries(h.subs)) (byName[w] = byName[w] || []).push([key, t]);
  }
  const clash = Object.entries(byName).filter(([, v]) => v.length > 1 && new Set(v.map((x) => x[1])).size > 1);
  if (clash.length) {
    console.log("");
    console.log(`  ! 이름은 같은데 뜻이 다른 낱말 ${clash.length}`);
    for (const [w, v] of clash) console.log(`    ${w} — ${v.map(([k]) => k).join(" · ")}`);
    console.log("    사도마다 제 풀이를 보여 주니 화면은 안 틀린다. 기획서 쪽에서 볼 일이다.");
  }
}

if (thin.length) {
  console.log("");
  console.log(`  ! 풀이가 없는 낱말 ${thin.length}: ${thin.map((w) => w.ko).join(" · ")}`);
  console.log("    기획서에 이름만 있습니다. 지어내지 않고 비워 둡니다 — 화면에도 그렇게 뜹니다.");
}
