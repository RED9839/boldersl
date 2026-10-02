// 기획서의 카드 효과는 산문이다 — "무작위 적 4회 × 공격력 50% 피해".
// 여기가 그 산문을 실행할 수 있는 꼴로 읽는다.
//
// **읽히는 만큼만 돈다.** 못 읽은 문장은 조용히 빠지지 않고 unparsed 에 남아,
// tools/check-effects.js 가 몇 %를 읽었는지 보고한다. 읽은 척하는 것이 가장 나쁘다.
//
// 배율은 기획서대로 % 다 — 공격력 100% 는 ratio 1.0.

// 한 조각 = {k, ...}. combat 이 실행한다.
//   dmg    {ratio, target, hits}        공격력 × ratio 피해
//   block  {ratio, target}              방어력 × ratio 방어
//   shield {ratio, target}              방어력 × ratio 실드(유지)
//   heal   {ratio, target}              회복력 × ratio 회복 (회복력 = 공격력 + 역할 몫, rules.js)
//   draw   {v} · ap {v} · gauge {v}
//   status {id, v, turns, target}       취약·약화·기절·도발
//   stack  {id, v}                      사도 전용 키워드(간식·왕마력…)
//   tag    {id}                         보존·종극·주도·개전·소멸
//   nextCheaper {v}                     다음 카드 코스트 -v (이번 턴)

// 대상 말. 긴 것·구체적인 것부터 적는다.
const TARGETS = [
  [/적\s*전체|모든\s*적/g, "allEnemies"],
  [/무작위\s*적\s*1\s*명|무작위\s*적|무작위로?/g, "randomEnemy"],
  [/아군\s*(전원|전체)|파티\s*전원/g, "allAllies"],
  [/HP\s*(?:비율이\s*)?(?:가장\s*)?(?:최저|낮은)\s*아군/g, "lowAlly"],
  [/아군\s*1명|아군\s*한\s*명/g, "oneAlly"],
  [/자신|스스로/g, "self"],
  [/적\s*1명|적\s*한\s*명/g, "oneEnemy"],
  [/대상/g, "대상"],              // 문맥에 따라 적도 아군도 된다
];
const ALLY = new Set(["self", "oneAlly", "allAllies", "lowAlly"]);
const FOE = new Set(["allEnemies", "randomEnemy", "oneEnemy"]);
// 방어·실드·회복은 적에게 가지 않는다 — 적 말을 만나도 건너뛴다.
const ALLY_ONLY = new Set(["block", "shield", "heal", "atkMod", "defMod", "critMod", "healMod", "invuln"]);

// 효과가 놓인 마디(쉼표)와 문장(마침표).
function scopes(text, at) {
  const sStart = text.lastIndexOf(".", at - 1) + 1;
  let sEnd = text.indexOf(".", at); if (sEnd < 0) sEnd = text.length;
  const cStart = Math.max(sStart, text.lastIndexOf(",", at - 1) + 1);
  let cEnd = text.indexOf(",", at); if (cEnd < 0 || cEnd > sEnd) cEnd = sEnd;
  return [[cStart, cEnd], [sStart, sEnd], [0, text.length]];
}

function mentions(text, [a, b]) {
  const seg = text.slice(a, b);
  const out = [];
  for (const [re, t] of TARGETS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(seg))) out.push({ at: a + m.index, end: a + m.index + m[0].length, t });
  }
  // 겹치면 먼저 적힌 것(더 구체적인 것)만 남긴다 — 「HP 최저 아군」 안의 「아군」 따위
  // 나온 차례대로 — 표 차례로 두면 「파티 전원 … 대상」 에서 늘 「대상」 이 뒤로 가 이긴다
  out.sort((x, y) => x.at - y.at || (y.end - y.at) - (x.end - x.at));
  return out.filter((x, i) => !out.some((y, j) => j !== i && y.at <= x.at && x.end <= y.end && (y.end - y.at) > (x.end - x.at)));
}

// **효과가 놓인 자리에서** 가장 가까운 대상 말을 찾는다.
// 전에는 카드 글 전체에서 표 순서대로 찾아서, 「무작위 적에게 … 자신 HP 회복」 처럼
// 한 카드에 대상이 둘이면 뒤의 회복까지 무작위 적에게 갔다(79군데가 그랬다).
// 마디 → 문장 → 글 전체 순으로 넓혀 가며, 효과보다 앞에 나온 말 가운데 가장 가까운 것을 쓴다.
function pickTarget(text, fallback, m, kind) {
  const allyOnly = ALLY_ONLY.has(kind) || (!kind && ALLY.has(fallback));
  const ok = (t) => !(allyOnly && FOE.has(t));
  const resolve = (t) => (t === "대상" ? (ALLY.has(fallback) || allyOnly ? "oneAlly" : "oneEnemy") : t);
  if (!m || typeof m.index !== "number") {
    for (const x of mentions(text, [0, text.length])) if (ok(resolve(x.t))) return resolve(x.t);
    return fallback;
  }
  const at = m.index, end = m.index + m[0].length;
  const [clause, sentence, whole] = scopes(text, at);
  for (const scope of [clause, sentence, whole]) {
    const ms = mentions(text, scope).filter((x) => ok(resolve(x.t)));
    const before = ms.filter((x) => x.at < end);
    if (before.length) return resolve(before[before.length - 1].t);
    // 마디 안에서만 뒤에 오는 말도 받는다 — 「방어력 80% 실드를 아군 전체에게」
    if (scope === clause) {
      const after = ms.filter((x) => x.at >= end);
      if (after.length) return resolve(after[0].t);
    }
  }
  return fallback;
}

// 체력 값을 치르는 쪽 — 바로 앞(같은 마디)에 「아군 1명」「아군 전원」 이 있으면 그쪽, 아니면 늘 자신.
// 전에는 가까운 대상 말(「적 1명에게 … 최대 HP 10% 소모」)을 따라가 적이 체력을 잃고 시전자는 안 치렀다(57곳)
function payer(text, m) {
  const before = text.slice(Math.max(0, m.index - 10), m.index);
  if (/아군\s*전원\s*$/.test(before)) return "allAllies";
  if (/아군\s*1\s*명\s*$/.test(before)) return "oneAlly";
  return "self";
}

// 그 효과가 놓인 마디 — 「회복」「실드」 같은 말을 카드 글 전체가 아니라 여기서 찾는다.
function near(text, m) {
  const [[a, b]] = scopes(text, m.index);
  return text.slice(a, b);
}

// "4회 × 공격력 50% 피해" 의 타수
function hitsOf(text) {
  const m = text.match(/(\d+)\s*회\s*[×x]/);
  return m ? Number(m[1]) : 1;
}

// X 코스트 카드의 타수 — 「(AP+왕마력)회」「(AP)회」「X회」.
// 남은 AP 를 전부 쓰고 그 수만큼(+키워드 스택만큼) 때린다. 전에는 못 읽어서 1회만 쳤다.
// 증감이 얼마나 가는가 — 「이번 전투」 는 끝까지, 「N턴간」 은 N턴, 아무 말 없으면 이번 턴
function durOf(t) {
  if (/이번\s*전투/.test(t)) return 999;   // 끝까지 — JSON 에 Infinity 가 안 들어가서 999 턴으로 둔다
  const m = t.match(/(\d+)\s*턴\s*(?:간|동안)?/);
  return m ? Number(m[1]) : 1;
}

function xOf(clause) {
  const m = clause.match(/\(\s*AP\s*(?:\+\s*([가-힣]+))?\s*\)\s*회|\bX\s*회/);
  return m ? { xHits: true, xStack: m[1] || null } : {};
}

const RULES = [
  // 「다음 카드 코스트 -1」 — 이번 턴에 다음에 내는 카드 한 장이 싸진다(combat nextCheaper). 「코스트 -1」(신탁 코스트)보다 먼저 읽는다
  { re: /다음\s*카드\s*(?:의\s*)?코스트\s*-\s*(\d+)/g, make: (m) => ({ k: "nextCheaper", v: Number(m[1]) }) },
  // 능력치 증감 — 「공격력 +10%」「방어력 +20%」「치명 확률 +10%」. 피해 규칙보다 먼저 읽는다
  // (「공격력 +10%」 는 피해가 아니다). 얼마나 가는지는 곁의 말(이번 턴 · N턴간 · 이번 전투)로 정한다.
  { re: /공격력\s*\+\s*(\d+)\s*%/g, make: (m, text) => ({ k: "atkMod", v: Number(m[1]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "self", m, "atkMod") }) },
  { re: /방어력\s*\+\s*(\d+)\s*%/g, make: (m, text) => ({ k: "defMod", v: Number(m[1]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "self", m, "defMod") }) },
  { re: /치명\s*(?:확률)?\s*\+\s*(\d+)\s*%/g, make: (m, text) => ({ k: "critMod", v: Number(m[1]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "self", m, "critMod") }) },
  // 「회복력 +20%」 — 회복을 주는 쪽의 회복력(run-fx healOf). 「HP 회복(회복력 40%)」 의 배율과는 + 로 갈린다
  { re: /회복력\s*\+\s*(\d+)\s*%/g, make: (m, text) => ({ k: "healMod", v: Number(m[1]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "self", m, "healMod") }) },
  // 피해 — 공격력 N% 피해
  {
    re: /공격력\s*(\d+)\s*%\s*(?:의\s*)?피해/g,
    make: (m, text) => ({ k: "dmg", ratio: Number(m[1]) / 100, target: pickTarget(text, "oneEnemy", m, "dmg"), hits: hitsOf(near(text, m)), ...xOf(near(text, m)) }),
  },
  // 타격당 공격력 N% — 신탁에서 타수는 그대로 두고 배율만 바꾸는 꼴
  {
    re: /타격당\s*공격력\s*(\d+)\s*%/g,
    make: (m, text) => ({ k: "dmg", ratio: Number(m[1]) / 100, target: pickTarget(text, "randomEnemy", m, "dmg"), hits: hitsOf(text), perHit: true }),
  },
  // 방어 / 실드 — 방어력 N%
  {
    re: /방어력\s*(\d+)\s*%\s*방어/g,
    make: (m, text) => ({ k: "block", ratio: Number(m[1]) / 100, target: pickTarget(text, "self", m, "block") }),
  },
  {
    re: /방어력\s*(\d+)\s*%\s*실드/g,
    make: (m, text) => ({ k: "shield", ratio: Number(m[1]) / 100, target: pickTarget(text, "self", m, "shield") }),
  },
  // 회복 — HP 회복(회복력 N%). 옛 글의 「회복(공격력 N%)」 도 같은 회복으로 읽는다
  {
    re: /회복\s*\(?\s*(?:공격력|회복력)\s*(\d+)\s*%\s*\)?/g,
    make: (m, text) => ({ k: "heal", ratio: Number(m[1]) / 100, target: pickTarget(text, "oneAlly", m, "heal") }),
  },
  // 드로우
  { re: /드로우\s*(\d+)/g, make: (m) => ({ k: "draw", v: Number(m[1]) }) },
  // AP
  { re: /AP\s*([+\-])\s*(\d+)/g, make: (m) => ({ k: "ap", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) }) },
  // 고학년 게이지
  { re: /게이지\s*([+\-])\s*(\d+)\s*%/g, make: (m) => ({ k: "gauge", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) }) },
  // 상태 — 취약·약화 (N턴)
  {
    re: /(취약|약화)\s*(\d+)?\s*턴?/g,
    make: (m, text) => ({ k: "status", id: m[1], v: 1, turns: Number(m[2] || 1), target: pickTarget(text, "oneEnemy", m, "status") }),
  },
  { re: /기절\s*(\d+)?\s*회?턴?/g, make: (m, text) => ({ k: "status", id: "기절", v: 1, turns: Number(m[1] || 1), target: pickTarget(text, "oneEnemy", m, "status") }) },
  // 즉시 행동 되돌리기 — 적이 예고한 수의 카운트를 N장 되돌린다(적 1명 · 적 전체). 새 적 규칙(docs/12)에 대한 답
  { re: /즉시\s*행동\s*-\s*(\d+)/g, make: (m, text) => ({ k: "rushDown", v: Number(m[1]), target: pickTarget(text, "oneEnemy", m, "status") }) },
  { re: /도발\s*(\d+)?\s*턴?/g, make: (m, text) => ({ k: "status", id: "도발", v: 1, turns: Number(m[1] || 1), target: "self" }) },
  // 공용 키워드
  // 「소멸 제거」 — 신탁 글은 바뀐 뒤의 전문이라 떼는 말은 그냥 안 쓰면 된다. 읽은 것으로만 친다
  { re: /(보존|종극|주도|개전|소멸)\s*(?:을|를)?\s*(?:제거|없앰|뗌)/g, make: () => null },
  { re: /(보존|종극|주도|개전|소멸)/g, make: (m) => ({ k: "tag", id: m[1] }) },

  // ── 못 읽은 문장에서 자주 나온 꼴들 ─────────────────────────────────
  // "방어력 440%" 처럼 방어/실드라는 말 없이 수치만 적힌 줄 (신탁 강화에 흔하다)
  {
    re: /방어력\s*(\d+)\s*%(?!\s*(방어|실드))/g,
    make: (m, text) => { const k = /실드/.test(near(text, m)) ? "shield" : "block"; return { k, ratio: Number(m[1]) / 100, target: pickTarget(text, "self", m, k) }; },
  },
  // "공격력 100%" 만 적힌 줄
  {
    re: /공격력\s*(\d+)\s*%(?!\s*(피해|회복))/g,
    make: (m, text) => { const k = /회복/.test(near(text, m)) ? "heal" : "dmg"; return { k, ratio: Number(m[1]) / 100, target: pickTarget(text, k === "heal" ? "oneAlly" : "oneEnemy", m, k), hits: hitsOf(near(text, m)) }; },
  },
  // "회복력 100%" 만 적힌 줄 — 늘 회복이다
  { re: /회복력\s*(\d+)\s*%/g, make: (m, text) => ({ k: "heal", ratio: Number(m[1]) / 100, target: pickTarget(text, "oneAlly", m, "heal") }) },
  // 코스트 — "코스트 -1" · "코스트 0" · "코스트 1"
  { re: /코스트\s*([+\-])\s*(\d+)/g, make: (m) => ({ k: "costDelta", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) }) },
  { re: /코스트\s*(\d+)(?!\s*[%p])/g, make: (m) => ({ k: "costSet", v: Number(m[1]) }) },
  // 배율 — "배율 +30%p"
  { re: /배율\s*([+\-])\s*(\d+)\s*%p/g, make: (m) => ({ k: "ratioDelta", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100 }) },
  // 주는/받는 피해 ±N%
  { re: /받는\s*피해\s*([+\-])\s*(\d+)\s*%/g, make: (m, text) => ({ k: "takenMod", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "auto", m, "takenMod") }) },
  { re: /주는\s*피해\s*([+\-])\s*(\d+)\s*%/g, make: (m, text) => ({ k: "dealtMod", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, turns: durOf(near(text, m)), target: pickTarget(text, "auto", m, "dealtMod") }) },
  // 카드 생성 — 「초고」 2장 생성
  { re: /「(.+?)」\s*(\d+)\s*장\s*생성/g, make: (m) => ({ k: "make", id: m[1], v: Number(m[2]) }) },
  // 무적 · 부활 · 디버프 해제
  // 무적은 제 편에 건다. 문장에 '적 전체'가 있어도 그건 피해 쪽 이야기다.
  // 무적 — 대상은 제자리에서 찾는다(아군 1명 · HP 최저 아군 · 아군 전원). 전에는 카드 어디든
  // 「아군 전원」 이 있으면 파티 전원, 아니면 늘 자신이었다
  { re: /무적/g, make: (m, text) => ({ k: "invuln", target: pickTarget(text, "self", m, "invuln") }) },
  { re: /부활/g, make: (m, text) => ({ k: "revive", target: pickTarget(text, "oneAlly", m, "revive") }) },
  { re: /디버프\s*(\d+)?\s*개?\s*해제/g, make: (m, text) => ({ k: "cleanse", v: Number(m[1] || 1), target: pickTarget(text, "self", m, "cleanse") }) },
  // 방어·실드 파괴
  { re: /(방어|실드)[·,\s]*(방어|실드)?\s*(전부\s*)?파괴/g, make: (m, text) => ({ k: "strip", target: pickTarget(text, "oneEnemy", m, "strip") }) },
  // 손패 버리기
  // 「무작위」가 앞에 붙으면(무작위 손패 1장 · 손패 무작위 1장) 알아서 버리고, 없으면 낸 사람이 고른다(fight-screen.js 버릴 카드 고르기)
  { re: /(무작위(?:로)?\s*)?손패\s*(무작위(?:로)?\s*)?(전부|\d+장?)\s*버리고?/g, make: (m) => ({ k: "discard", v: m[3] === "전부" ? "all" : Number(m[3].replace("장", "")), random: !!(m[1] || m[2]) }) },
  // 추가 턴
  { re: /추가\s*턴/g, make: () => ({ k: "extraTurn" }) },

  // ── HP ─────────────────────────────────────────────────────────────
  // "최대 HP 10% 잃고" · "HP 5 소모" — 제 체력을 값으로 치르는 꼴. 치르는 쪽은 payer(늘 자신 · 바로 앞의 아군 말만)
  { re: /최대\s*HP\s*(\d+)\s*%\s*(?:를\s*)?(?:잃|소모|지불)/g, make: (m, t) => ({ k: "payHpPct", v: Number(m[1]) / 100, target: payer(t, m) }) },
  { re: /HP\s*(\d+)\s*(?:를\s*)?(?:잃|소모|지불)/g, make: (m, t) => ({ k: "payHp", v: Number(m[1]), target: payer(t, m) }) },
  // "HP 최저 아군" — 대상 고르기
  { re: /HP\s*최저/g, make: () => null },      // 대상 말(lowAlly)이 이미 가져간다
  // "최대 HP N%" 만 적힌 꼴 (회복·피해의 기준이 되는 자리)
  { re: /최대\s*HP\s*(\d+)\s*%/g, make: (m, t) => ({ k: "maxHpPct", v: Number(m[1]) / 100, target: pickTarget(t, "self", m, "maxHpPct") }) },

  // ── 카드·손패 ──────────────────────────────────────────────────────
  // "카드 1장 버리" · "손패 전부 버리"
  { re: /(무작위(?:로)?\s*)?(?:카드|손패)\s*(무작위(?:로)?\s*)?(전부|\d+)\s*장?\s*버리/g, make: (m) => ({ k: "discard", v: m[3] === "전부" ? "all" : Number(m[3]), random: !!(m[1] || m[2]) }) },
  // "덱에서 카드 1장" · "카드 2장 뽑"
  { re: /카드\s*(\d+)\s*장\s*(?:을\s*)?(?:뽑|드로우)/g, make: (m) => ({ k: "draw", v: Number(m[1]) }) },
  // "다음 카드 코스트 -1" 은 이미 costDelta 가 잡는다. 여기선 "카드 사용 불가"
  { re: /카드\s*사용\s*불가/g, make: (m, t) => ({ k: "lockCards", target: pickTarget(t, "self", m, "lockCards") }) },
  // "소멸" 은 tag 가 잡는다. "이번 전투" 는 지속을 뜻한다
  { re: /이번\s*전투(?:\s*동안)?/g, make: () => null },   // 증감의 길이(999턴)로 이미 읽었다

  // ── 고학년 게이지를 쓰는 꼴 ────────────────────────────────────────
  // "게이지 300%를 써서" 는 비용 설명이다 — 비용은 ult.cost 가 이미 들고 있으니 효과로 세지 않는다
  { re: /게이지\s*\d+\s*%\s*(?:를\s*)?써/g, make: () => null },
  { re: /(?:고학년(?:\s*스킬)?|궁극기)\s*게이지/g, make: () => null },      // 설명말 — 못 읽은 것으로 세지 않는다
  { re: /AP\s*소모\s*없(?:음|이)/g, make: () => ({ k: "tag", id: "AP없음" }) },

  // ── 침묵·면역 ──────────────────────────────────────────────────────
  { re: /침묵\s*(\d+)?\s*턴?/g, make: (m, t) => ({ k: "status", id: "침묵", v: 1, turns: Number(m[1] || 1), target: pickTarget(t, "oneEnemy", m, "status") }) },
  { re: /(면역|무효)/g, make: (m, t) => ({ k: "immune", target: /아군\s*(전원|전체)/.test(t) ? "allAllies" : "self" }) },
];

// 사도 전용 키워드는 사도마다 이름이 다르다(간식·왕마력·수집품…).
// heroes 의 keyword 이름을 넘기면 그 낱말의 ±N 을 집어낸다.
function stackRule(word) {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");   // 낱말에 특수문자가 있을 수 있다
  const R = (body, make) => ({ re: new RegExp(body, "g"), make });
  return [
    // 「간식 +1」 — 쌓기
    R(`${w}\\s*([+\\-])\\s*(\\d+)`, (m, t) => ({ k: "stack", id: word, v: (m[1] === "-" ? -1 : 1) * Number(m[2]), target: pickTarget(t, "auto", m, "stack") })),
    // 「기록 3 소모」 · 「저장 전부 소모」 — 쓰기
    R(`${w}\\s*(전부|\\d+)\\s*(?:개\\s*)?소모`, (m) => ({ k: "spend", id: word, v: m[1] === "전부" ? "all" : Number(m[1]) })),
    R(`${w}\\s*소모`, () => ({ k: "spend", id: word, v: 1 })),
    // 「수은막이 이미 있으면」 — 조건
    R(`${w}(?:이|가)?\\s*(?:이미\\s*)?있으면`, () => ({ k: "ifStack", id: word, v: 1 })),
    // 「재채기 2회」 — 낱말 뒤에 횟수
    R(`${w}\\s*(\\d+)\\s*회`, (m) => ({ k: "trigger", id: word, v: Number(m[1]) })),
    // 「간식 1당」 — 스택 비례
    R(`${w}\\s*1?\\s*당`, () => ({ k: "perStack", id: word })),
    // 「저장 최대 10」 · 「획득 상한 5」 — 상한
    R(`${w}[^.]{0,8}(?:최대치?|상한)\\s*(\\d+)`, (m) => ({ k: "capStack", id: word, v: Number(m[1]) })),
    // 낱말만 남은 꼴 — 못 읽은 것으로 세지 않도록 마지막에 걷는다
    R(w, () => null),
  ];
}

// 한 문장을 읽는다. { fx, left } — left 는 읽고 남은 글자다(못 읽은 만큼).
export function parseEffect(text, { keyword, keywords } = {}) {
  if (!text) return { fx: [], left: "" };
  // 「2턴간 안개: …」 — 카드 화면이 「하는 일(2턴간 안개) + 안개 풀이」 로 펼치는 이름표다.
  // 이름표는 효과가 아니다. 길이 말(2턴간)은 남겨 두어 뒤의 증감이 읽게 한다
  // 앞에 「코스트 0.」「보존.」 이 붙은 신탁 글에서도 걷는다(그윈 스노우포그 ② 경량)
  text = text.replace(/^(\s*(?:코스트\s*\d+\s*\.\s*|(?:보존|소멸|개전)\s*\.\s*)*(?:\d+\s*턴간|이번 전투 동안|이번 턴)\s*)[가-힣]{2,5}\s*:\s*/, "$1");
  // 낫표(「간식」)는 사람이 읽으라고 두른 것이다 — 효과 읽기는 맨 낱말로 한다
  const words = [...new Set([...(keywords || []), ...(keyword ? [keyword] : [])])];
  for (const w of words) text = text.split(`「${w}」`).join(w);
  const rules = words.length ? [...words.flatMap(stackRule), ...RULES] : RULES;
  const fx = [];
  let left = text;

  // 한 글자는 한 번만 읽는다. 규칙이 겹치면 먼저 온 쪽이 가져간다 —
  // 안 그러면 "손패 전부 버리고" 가 두 규칙에 잡혀 같은 효과가 둘 나온다(실제로 그랬다).
  const taken = [];                                  // [시작, 끝]
  const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);

  for (const r of rules) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text))) {
      const from = m.index, to = m.index + m[0].length;
      if (overlaps(from, to)) continue;
      taken.push([from, to]);
      const got = r.make(m, text);
      if (got) { got._at = from; fx.push(got); }
      left = left.slice(0, from) + " ".repeat(to - from) + left.slice(to);
    }
  }

  // 대상 말(적 1명·아군 전원…)과 타수(4회 ×)는 효과가 이미 가져갔다 — 못 읽은 것으로 세지 않는다
  for (const [re] of TARGETS) left = left.replace(new RegExp(re.source, "g"), (x) => " ".repeat(x.length));
  // 길이 말(2턴간 · 이번 턴 · 이번 전투 동안)은 증감·상태가 이미 가져갔다
  left = left.replace(/\(\s*AP\s*(?:\+\s*[가-힣 ]+?)?\s*\)\s*회\s*[×x]?|\bX\s*회\s*[×x]?|\d+\s*회\s*[×x]|\bHP\b|\d+\s*턴\s*(?:간|동안)?|이번\s*전투\s*동안|이번\s*턴/g, (x) => " ".repeat(x.length));

  // 남은 글자에서 조사·이음말을 걷어 내면, 진짜로 못 읽은 것만 남는다
  const rest = left
    .replace(/[,.·—()「」『』%×x]/g, " ")
    .replace(/(그리고|추가로|대신|이번|다음|사용|직전|하고|한다|된다|있으면|없으면|마다|만큼|전부|전원|전체|아군|적|자신|대상|무작위|매|턴|번|개|장|명|회|시|후|의|를|을|이|가|에게|에|로|으로|과|와|는|은|도|씩|최대|추가|동안|처음|그|더|및|또는|수|것|때|까지|부터|중|내|외)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 글에 적힌 차례대로 — 「간식이 있으면」 같은 조건은 **그 뒤의 효과만** 막아야 한다.
  // 규칙 차례로 두면 조건이 늘 맨 앞에 와서 카드 전체를 막았다.
  fx.sort((a, b) => a._at - b._at);
  for (const f of fx) delete f._at;
  return { fx, left: rest };
}

// 카드 한 장 — 시작·고유·신탁·고학년 스킬 모두 같은 꼴로 읽는다
export function parseCard(card, hero) {
  const keyword = hero && hero.keyword ? hero.keyword.ko : null;
  const { fx, left } = parseEffect(card.text, { keyword });
  return { ...card, fx, unparsed: left || null };
}

// ── 겨우살이의 축복(사도 고유) ─────────────────────────────────────────
// 「✦ *이름*: 효과」 — 신탁 위에 한 줄. 앞머리에 배율 하나(피해 ×1.3 · 회복 ×1.3 · 방어·실드 ×1.3 ·
// 코스트 -1 · 취약인 적에게 피해 ×1.3)를 둘 수 있고, 그 뒤는 카드를 낼 때 덤으로 도는 효과다.
// 돌려주는 것: { kind: "power"|"heal"|"guard"|"cost"|"weakSpot"|null, fx, left }
const BLESS_KIND = [
  [/^취약(?:\s*상태)?인\s*적에게\s*피해\s*×\s*1\.3\s*[.,]?\s*/, "weakSpot"],
  [/^피해\s*×\s*1\.3\s*[.,]?\s*/, "power"],
  [/^회복(?:량)?\s*×\s*1\.3\s*[.,]?\s*/, "heal"],
  [/^(?:방어\s*·\s*실드|방어|실드)(?:량)?\s*×\s*1\.3\s*[.,]?\s*/, "guard"],
  [/^코스트\s*-\s*1\s*[.,]?\s*/, "cost"],
];
export function parseBless(text, opts = {}) {
  let t = (text || "").trim(), kind = null;
  for (const [re, k] of BLESS_KIND) { const m = t.match(re); if (m) { kind = k; t = t.slice(m[0].length).trim(); break; } }
  if (!t) return { kind, fx: [], left: "" };
  const { fx, left } = parseEffect(t, opts);
  return { kind, fx, left };
}
