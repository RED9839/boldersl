// 패시브와 사도 전용 키워드 — 기획서의 산문을 읽어 전투에서 실제로 돌린다.
//
// 전에는 패시브가 글로만 있었다. 도감에 「간식 3개가 되면 자동으로 먹고 AP +1」 이라고 쓰여 있는데
// 전투에서는 아무 일도 없었다. 135명의 패시브를 사람마다 따로 짜면 끝이 없으니,
// **정해진 문법**으로 쓰고 여기서 읽는다. 개성은 어떤 조각을 어떻게 엮느냐와 이름에서 나온다.
// 문법은 docs/07-스킬구성.md 에 있다. 요약:
//
//   **패시브** 이름: [언제], [조건] 효과 (턴당 1회) · 이름2: …
//     언제  전투 시작 시 · 턴 시작 시 · 턴 종료 시 · 카드를 낼 때마다 · 공격|스킬|강화 카드를 낼 때마다 ·
//           에르핀의 (공격) 카드를 N장 낼 때마다(그 사도 것만) · 파티가 (공격) 카드를 N장 낼 때마다(누구 것이든) ·
//           파티가 이번 턴 카드를 N장째 낼 때 · 아군이 카드를 낼 때마다 · 시그니처 카드를 내면 ·
//           적을 처치하면 · 적이 쓰러지면 · 피해를 받으면 · 아군이 피해를 받으면 · 방어나 실드를 얻으면 ·
//           HP가 N% 이하가 되면 · 아군이 쓰러지면 · 고학년 스킬을 쓰면 · 적이 즉시 행동하면 ·
//           적에게 디버프를 걸면 · 회복량이 최대 HP를 초과하면 · 「X」가 N개가 되면 · 항상
//     조건  「X」가 있으면 · 「X」가 N개 이상이면 · HP가 N% 이하이면 · HP가 N% 이상이면 · 적이 N명 이상이면 ·
//           적이 N명뿐이면 · 파티가 이번 턴 카드를 N장 이상(이하로) 냈으면 · 이번 턴 에르핀의 카드를 내지 않았으면 ·
//           AP가 남았으면 · 고학년 게이지가 N% 이상이면 · 실드가 있으면 · 적이 즉시 행동했으면
//     효과  카드와 같은 말(공격력 N% 피해 · 방어력 N% 방어 · AP +1 · 드로우 1 · 「X」 +1 …) +
//           능력치 증감: 주는 피해 ±N% · 받는 피해 ±N% · 공격력 +N% · 방어력 +N% · 치명 확률 +N%
//           (이번 턴 · N턴간 · 이번 전투 동안 — 안 적으면 이번 턴, 「항상」 이면 내내)
//
//   **키워드 「X」** 설명. 최대 N. 적의 차례가 끝나면 N 감소. 적에게 거는 표식이다.
//                     1개당 자신 주는 피해 +N%. 1개당 턴 종료 시 공격력 N% 피해. 「X」가 N개가 되면: …

import { parseEffect } from "./effects.js";
import { healStat, STATUS_V, STAT_ST } from "./rules.js";

// ── 읽기 ───────────────────────────────────────────────────────────────

const TRIGGERS = [
  [/전투\s*시작\s*시/, () => ({ on: "fightStart" })],
  [/턴\s*시작\s*시/, () => ({ on: "turnStart" })],
  [/턴\s*종료\s*시/, () => ({ on: "turnEnd" })],
  // 장수를 누구 것으로 세나 — 글에 밝힌다(2026-10, 사용자: 「카드를 3장 낼 때마다」 가 파티 전체로 읽혔다).
  //   「파티가 …」            파티 누구의 카드든 센다(who: "any")
  //   「에르핀의 …」 「자신의 …」 그 사도(장비면 낀 사도)가 낸 카드만 센다. 이름 없는 옛 글도 이쪽으로 읽는다
  // 「파티가 이번 턴 카드를 3장째 낼 때」 — 파티가 그 턴 세 번째 카드를 낼 때(옛 글 「한 턴에 카드를 3장째 낼 때」)
  [/(?:파티가\s*)?(?:한\s*턴에|이번\s*턴)\s*카드를\s*(\d+)\s*장째\s*낼\s*때/, (m) => ({ on: "play", nth: Number(m[1]), who: "any" })],
  // 「파티가 공격 카드를 4장 낼 때마다」 — 누가 냈든 센다
  [/파티가\s*(한\s*턴에\s*)?(공격|스킬|강화)?\s*카드를\s*(\d+)\s*장\s*낼\s*때마다/, (m) => ({ on: "play", who: "any", every: Number(m[3]), type: m[2] || null, ...(m[1] ? { perTurn: true } : {}) })],
  // 「에르핀의 공격 카드를 3장 낼 때마다」 — 이름은 규칙 첫머리에만 온다(그래야 앞의 조건 말을 이름으로 삼키지 않는다).
  // 「1코 이상」 — 적힌 코스트가 N 이상인 카드만 센다(0코 순환 카드가 장수 패시브를 공짜로 돌리지 않게)
  // 「한 턴에」 — 센 장수가 턴마다 0 으로 돌아간다(perTurn). 안 적으면 전투 내내 이어 센다
  [/^\s*(?:([^\s「」:,.·][^「」:,.·]{0,11}?)의\s+)?(한\s*턴에\s*)?(?:(\d+)\s*코\s*이상\s*)?(공격|스킬|강화)?\s*카드를\s*(한\s*턴에\s*)?(\d+)\s*장\s*낼\s*때마다/,
    (m) => ({ on: "play", every: Number(m[6]), type: m[4] || null, minCost: m[3] ? Number(m[3]) : 1,   // N장마다는 0코를 안 센다(게이지와 같다)
      ...(m[2] || m[5] ? { perTurn: true } : {}), ...(m[1] ? { by: m[1].trim() } : {}) })],
  [/(한\s*턴에\s*)?(?:(\d+)\s*코\s*이상\s*)?(공격|스킬|강화)?\s*카드를\s*(\d+)\s*장\s*낼\s*때마다/, (m) => ({ on: "play", every: Number(m[4]), type: m[3] || null, minCost: m[2] ? Number(m[2]) : 1, ...(m[1] ? { perTurn: true } : {}) })],
  [/아군이\s*(공격|스킬|강화)?\s*카드를\s*낼\s*때마다/, (m) => ({ on: "play", who: "any", type: m[1] || null })],
  // 「시그니처 카드를 내면」 — 그 사도의 시그니처(원작 저학년). 신탁으로 바뀐 것도 시그니처다
  [/시그니처\s*카드를\s*(?:낼\s*때마다|내면)/, () => ({ on: "play", sig: true })],
  [/^\s*(?:([^\s「」:,.·][^「」:,.·]{0,11}?)의\s+)?(?:(\d+)\s*코\s*이상\s*)?(공격|스킬|강화)\s*카드를\s*낼\s*때마다/, (m) => ({ on: "play", type: m[3], ...(m[2] ? { minCost: Number(m[2]) } : {}), ...(m[1] ? { by: m[1].trim() } : {}) })],
  [/(공격|스킬|강화)\s*카드를\s*낼\s*때마다/, (m) => ({ on: "play", type: m[1] })],
  [/카드를\s*낼\s*때마다/, () => ({ on: "play" })],
  // 「방어나 실드를 얻으면」 「실드를 얻으면」 — 이 사도에게 방어 · 실드가 붙을 때(제 카드 · 아군이 준 것 · 패시브 모두).
  // 「아군이 …」 면 누구에게 붙든
  [/(아군이\s*)?(방어나\s*실드|방어|실드)를\s*얻으면/, (m) => ({ on: "guard", kind: m[2] === "방어" ? "block" : m[2] === "실드" ? "shield" : null, ...(m[1] ? { who: "any" } : {}) })],
  [/적을\s*처치하면/, () => ({ on: "kill", mine: true })],
  [/적이\s*쓰러지면/, () => ({ on: "kill" })],
  [/아군이\s*피해를\s*받으면/, () => ({ on: "hurt", who: "any" })],
  [/피해를\s*받으면/, () => ({ on: "hurt" })],
  [/HP가\s*(\d+)\s*%\s*이하가\s*되면/, (m) => ({ on: "lowHp", pct: Number(m[1]) / 100 })],
  [/아군이\s*쓰러지면/, () => ({ on: "allyDown" })],
  // 새 적 규칙(docs/12) — 아군이 카드를 내다 적의 즉시 행동을 당겼을 때
  [/적이\s*즉시\s*행동하면/, () => ({ on: "rush" })],
  [/(?:고학년\s*스킬을|궁극기를)\s*쓰면/, () => ({ on: "ult" })],   // 옛 이름(궁극기)도 읽는다
  [/적에게\s*(?:취약|약화|기절|디버프)을?를?\s*걸면/, () => ({ on: "debuff" })],
  // 「회복량이 최대 HP를 초과하면」(옛 글 「회복이 넘치면」 도 읽는다) — 이 사도의 회복이 대상의 최대 HP 를 넘었을 때(넘친 만큼이 있을 때). 회복 효과 하나 · 대상 하나에 한 번(나이아, v4)
  [/회복량이\s*최대\s*HP\s*를?\s*초과하면|회복이\s*넘치면/, () => ({ on: "overheal" })],
  [/「(.+?)」\s*(?:이|가)?\s*(\d+)\s*개?\s*가?\s*되면/, (m) => ({ on: "stackReach", id: m[1], n: Number(m[2]) })],
  [/항상/, () => ({ on: "always" })],
];

const CONDS = [
  [/「(.+?)」\s*(?:이|가)?\s*(\d+)\s*개?\s*이상이면/, (m) => ({ c: "stack", id: m[1], n: Number(m[2]) })],
  [/「(.+?)」\s*(?:이|가)?\s*(?:이미\s*)?있으면/, (m) => ({ c: "stack", id: m[1], n: 1 })],
  [/HP가\s*(\d+)\s*%\s*이하이면/, (m) => ({ c: "hp", pct: Number(m[1]) / 100 })],
  [/적이\s*(\d+)\s*명\s*이상이면/, (m) => ({ c: "foes", n: Number(m[1]) })],
  [/혼자\s*남으면/, () => ({ c: "alone" })],
  // 덱 무게(docs/11 §3-3) — 이번 턴 **파티가** 낸 카드 장수. 장수로 세니 신탁으로 코스트가 내려간 카드도 같다.
  // 글은 「파티가 이번 턴 카드를 3장 이상 냈으면」(누구 것을 세는지 밝힌다). 「파티가」 없는 옛 글도 읽는다
  [/(?:파티가\s*)?이번\s*턴\s*카드를\s*(\d+)\s*장\s*이하로?\s*냈으면/, (m) => ({ c: "playedMax", n: Number(m[1]) })],
  [/(?:파티가\s*)?이번\s*턴\s*카드를\s*(\d+)\s*장\s*이상\s*냈으면/, (m) => ({ c: "playedMin", n: Number(m[1]) })],
  // 「이번 턴 에르핀의 카드를 내지 않았으면」 「이번 턴 자신의 카드를 내지 않았으면」 — 그 사도가 이번 턴 한 장도 안 냈을 때(쉬어 가는 턴)
  [/이번\s*턴\s*(?:[^\s「」:,.·][^「」:,.·]{0,11}?의\s+)?카드를\s*내지\s*않았으면/, () => ({ c: "ownNone" })],
  // 「AP가 남았으면」 「AP가 2 이상 남았으면」 — 턴 종료 시 쓰지 않고 남긴 AP(남은 AP 는 사라진다 — 아껴 둔 값어치)
  [/AP가\s*(?:(\d+)\s*이상\s*)?남았으면/, (m) => ({ c: "apLeft", n: m[1] ? Number(m[1]) : 1 })],
  // 「고학년 게이지가 100% 이상이면」 — 파티 공용 게이지
  [/(?:고학년\s*)?게이지가\s*(\d+)\s*%\s*이상이면/, (m) => ({ c: "gauge", n: Number(m[1]) })],
  // 「실드가 있으면」 「방어나 실드가 있으면」 — 이 사도에게 지금 붙어 있는 것
  [/(방어나\s*실드|방어|실드)가\s*있으면/, (m) => ({ c: "guarded", kind: m[1] === "방어" ? "block" : m[1] === "실드" ? "shield" : null })],
  // 「HP가 70% 이상이면」 — 멀쩡할 때
  [/HP가\s*(\d+)\s*%\s*이상이면/, (m) => ({ c: "hpMin", pct: Number(m[1]) / 100 })],
  // 「적이 1명뿐이면」 — 마지막 하나 남았을 때
  [/적이\s*(\d+)\s*명\s*(?:뿐이면|이하이면)/, (m) => ({ c: "foesMax", n: Number(m[1]) })],
  // 「적이 즉시 행동했으면」 — 이번 턴 적이 한 번이라도 당겨서 움직였으면(턴 종료 시와 엮는다)
  [/(?:이번\s*턴\s*)?적이\s*즉시\s*행동했으면/, () => ({ c: "rushed" })],
  // 「지난 턴에 (아군이) 피해를 받았으면」 · 「지난 턴 적을 처치했으면」 — 턴 시작 시와 엮는다. 맞을 때마다 · 처치할 때마다 도는 대신
  // 한 턴에 한 번만 돈다(턴당 N회 제한을 없앤 뒤 AP · 게이지 · 큰 반격을 여기로 옮겼다 — docs/07 §4)
  [/지난\s*턴에?\s*아군이\s*피해를\s*받았으면/, () => ({ c: "hurtLastAny" })],
  [/지난\s*턴에?\s*피해를\s*받았으면/, () => ({ c: "hurtLast" })],
  [/지난\s*턴에?\s*적을\s*처치했으면/, () => ({ c: "killedLast" })],
  // 「첫 턴이면」 — 전투를 여는 한 번(턴 시작 시 AP 는 전투 시작 시에 주면 첫 턴 AP 에 덮이므로 이렇게 쓴다)
  [/첫\s*턴이면/, () => ({ c: "firstTurn" })],
  // 선 열 — 「모든 열」 사도가 편성에서 고른 열에 따라 다른 줄이 켜진다
  [/(전열|중열|후열)에\s*서\s*있으면/, (m) => ({ c: "row", row: { 전열: "front", 중열: "mid", 후열: "back" }[m[1]] })],
];

const LIMIT = /\(?\s*(턴당|전투당)\s*(\d+)\s*회\s*\)?/;

// 「간식」 처럼 낫표를 두르면 사람이 읽기 좋지만 효과 읽기는 맨 낱말을 본다
const bare = (t) => t.replace(/「([^」]+)」/g, "$1");

function durationOf(t) {
  if (/이번\s*전투|전투\s*내내/.test(t)) return 999;   // 끝까지 — JSON 에 Infinity 가 안 들어가서 999 턴으로 둔다
  const m = t.match(/(\d+)\s*턴\s*(?:간|동안)?/);
  if (m) return Number(m[1]);
  return 1;
}

// 한 문장 → 규칙 하나. 못 읽은 글자는 left 에 남긴다.
function readRule(sentence, keywords, prevTrigger) {
  let t = sentence.trim();
  const rule = { text: t, when: null, conds: [], fx: [], limit: null };
  for (const [re, make] of TRIGGERS) {
    const m = t.match(re);
    if (m) { rule.when = make(m); t = t.replace(m[0], " "); break; }
  }
  if (!rule.when) rule.when = prevTrigger || { on: "always" };
  for (const [re, make] of CONDS) {
    const m = t.match(re);
    if (m) { rule.conds.push(make(m)); t = t.replace(m[0], " "); }
  }
  const lm = t.match(LIMIT);
  if (lm) { rule.limit = { per: lm[1] === "턴당" ? "turn" : "fight", n: Number(lm[2]) }; t = t.replace(lm[0], " "); }
  if (rule.when.on === "lowHp" && !rule.limit) rule.limit = { per: "fight", n: 1 };

  const turns = rule.when.on === "always" ? 999 : durationOf(t);
  const { fx, left } = parseEffect(bare(t), { keywords });
  for (const f of fx) if (["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"].includes(f.k)) f.turns = turns;
  rule.fx = fx.filter((f) => f.k !== "scope");
  rule.left = left;
  return rule;
}

// 「이름: 규칙 · 이름2: 규칙2」 를 가른다. 효과 안의 「·」 와 헷갈리지 않게, 뒤에 「이름:」 이 오는 곳만 자른다.
export function parsePassive(text, keywords = []) {
  if (!text) return [];
  const parts = text.split(/\s·\s(?=[^:·.]{1,30}:)/);
  const out = [];
  for (const part of parts) {
    const i = part.indexOf(":");
    const name = i > 0 ? part.slice(0, i).trim() : "패시브";
    const body = i > 0 ? part.slice(i + 1) : part;
    let prev = null;
    for (const s of body.split(/(?<=[.。])\s+|;\s*/).filter((x) => x.trim())) {
      const r = readRule(s.replace(/[.。]\s*$/, ""), keywords, prev);
      r.name = name;
      prev = r.when;
      out.push(r);
    }
  }
  return out;
}

// 키워드 한 줄 → { id, cap, decay, carrier, per: [...], rules: [...] }
const PER_STATS = [
  [/주는\s*피해\s*([+\-])\s*(\d+)\s*%/, "dealt"],
  [/받는\s*피해\s*([+\-])\s*(\d+)\s*%/, "taken"],
  [/공격력\s*([+\-])\s*(\d+)\s*%/, "atk"],
  [/방어력\s*([+\-])\s*(\d+)\s*%/, "def"],
  [/치명\s*(?:확률)?\s*([+\-])\s*(\d+)\s*%/, "crit"],
];

export function parseKeyword(id, text, keywords = []) {
  const kw = { id, cap: null, decay: 0, carrier: "self", per: [], rules: [], left: [] };
  if (!text) return kw;
  if (/적에게\s*(?:거는|붙는|쌓는|새기는)/.test(text)) kw.carrier = "enemy";
  else if (/아군에게\s*(?:거는|주는|나눠\s*주는|씌우는)/.test(text)) kw.carrier = "ally";
  const cap = text.match(/최대\s*(\d+)/);
  if (cap) kw.cap = Number(cap[1]);
  // 줄어드는 때 — 「적의 차례가 끝나면 N 감소」(지금 글) · 「턴 종료 시 N 감소」(옛 글). 둘 다 적의 차례 뒤에 줄인다(decayKeywords)
  const WHEN = String.raw`(?:턴\s*종료\s*시|적의\s*차례가\s*끝나면)\s*`;
  if (new RegExp(WHEN + "(?:전부|모두)\\s*사라").test(text)) kw.decay = "all";
  else { const d = text.match(new RegExp(WHEN + "(\\d+)\\s*(?:씩\\s*)?(?:감소|줄어)")); if (d) kw.decay = Number(d[1]); }

  // 첫 문장은 설명(사람이 읽는 말)이다. 그 뒤 문장은 모두 규칙이어야 한다 — 못 읽으면 left 에 남긴다.
  const sentences = text.split(/(?<=[.。])\s+/).map((x) => x.replace(/[.。]\s*$/, "").trim()).filter(Boolean);
  sentences.forEach((s, i) => {
    if (i === 0) return;
    const meta = /최대\s*\d+|(?:턴\s*종료\s*시|적의\s*차례가\s*끝나면)\s*(?:\d+\s*(?:씩\s*)?(?:감소|줄어)|(?:전부|모두)\s*사라)|(?:적|아군)에게\s*(?:거는|붙는|쌓는|새기는|주는|나눠\s*주는|씌우는)/;
    // 「1개당 …」 으로 시작하는 문장만 — 「턴 종료 시 「드론」 1개당 …」 은 규칙 문장이다(뒤의 피해를 쌓인 수만큼)
    const per = s.match(/^1\s*개\s*당\s*(.+)/);
    if (per) {
      const body = per[1];
      const who = /아군\s*(?:전원|전체)/.test(body) ? "allies" : "holder";
      for (const [re, stat] of PER_STATS) {
        const m = body.match(re);
        if (m) kw.per.push({ stat, v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, who });
      }
      const dot = body.match(/턴\s*종료\s*시\s*공격력\s*(\d+)\s*%\s*피해/);
      if (dot) kw.per.push({ stat: "dot", ratio: Number(dot[1]) / 100 });
      const heal = body.match(/턴\s*종료\s*시\s*(?:HP\s*)?회복\s*\(?\s*(?:공격력|회복력)\s*(\d+)\s*%/);
      if (heal) kw.per.push({ stat: "hot", ratio: Number(heal[1]) / 100 });
      const n = kw.per.length;
      if (!PER_STATS.some(([re]) => re.test(body)) && !dot && !heal) kw.left.push(s);
      return;
    }
    // 규칙 문장(언제 ~ 하면: …) — 「X」가 N개가 되면 따위
    if (TRIGGERS.some(([re]) => re.test(s) && !/^항상/.test(s)) && !(meta.test(s) && !/되면|마다|시\s*[,:]/.test(s.replace(meta, "")))) {
      const r = readRule(s.replace(/:\s*/, " "), keywords, null);
      r.name = id;
      if (r.when.on !== "always" && r.fx.length) { kw.rules.push(r); if (r.left) kw.left.push(`${s} ⟶ 못 읽은 말: ${r.left}`); return; }
    }
    if (meta.test(s)) return;
    kw.left.push(s);
  });
  return kw;
}

// ── 돌리기 ─────────────────────────────────────────────────────────────
// combat.js 가 이 함수들을 부른다. 실제 효과 실행은 combat 이 넘겨 주는 run(owner, fx, ctx) 로 한다.

// 사도 key → { rules, kw } 를 전투 시작에 한 번 만든다
// gearFx — { 사도키: "이름: 효과 · 이름: 효과" } 낀 장비의 효과 · 애착(run.js gearPassives). 그 사도의 패시브로 붙는다
export function setupPassives(s, heroOf, gearFx = {}) {
  s.passives = {};
  s.kw = {};
  for (const u of s.party) {
    const h = heroOf(u.key);
    if (!h) continue;
    const kws = h.keyword ? [h.keyword.ko] : [];
    const kw = h.keyword ? (h.keywordRules || parseKeyword(h.keyword.ko, h.keyword.text, kws)) : null;
    const gearRules = gearFx[u.key] ? parsePassive(gearFx[u.key], kws).filter((r) => r.fx.length && !r.left).map((r) => ({ ...r, gear: true })) : [];
    // 키워드 규칙에는 표식이 어디 붙는지(kwOf)를 달아 둔다 — 아군에게 거는 표식의 「카드를 낼 때마다 「X」가 있으면」 은
    // 그 표식을 든 아군이 낼 때다(matches · condOk). 주인 혼자 낼 때만 보던 것을 고쳤다(실비아 「초청객」)
    const rules = [...(h.passiveRules || parsePassive(h.passive, kws)), ...(kw ? kw.rules.map((r) => ({ ...r, kwOf: kw.carrier })) : []), ...gearRules];
    s.passives[u.key] = rules;
    if (kw) s.kw[kw.id] = { ...kw, owner: u.key };
  }
  s.fired = {};            // "사도|규칙번호" → 이번 턴·전투에 몇 번
  s.counts = {};           // "사도|규칙번호" → 카드 N장마다
  s.depth = 0;
}

// 스택이 어디에 있는가 — 자기 것(사도 주머니) · 적에게 · 아군에게
export function stackOn(s, holder, id, owner) {
  const kw = (s.kw || {})[id];
  if (kw && kw.carrier !== "self" && holder) return (holder.status || {})[id] || 0;
  const key = owner ? owner.key : holder && holder.key;
  return (((s.stacks || {})[key] || {})[id]) || 0;
}

// 능력치 증감 — 붙어 있는 버프(mods) + 「항상」 패시브 + 키워드 1개당
export function statMod(s, u, stat) {
  if (!u) return 0;
  let v = 0;
  // 능력치 상태(열의 · 강건 · 집중 · 온정) — 겹이 있으면, 또는 지금 이 일에서 막 쓴 것이면(같은 카드의 다음 타격도 덕을 본다 · combat charge)
  const sid = STAT_ST[stat];
  if (sid && (((u.status || {})[sid] || 0) > 0 || (s.actSeq && (u.stUse || {})[sid] === s.actSeq))) v += STATUS_V[sid];
  for (const m of u.mods || []) if (m.stat === stat) v += m.v;
  // 「항상 HP가 50% 이하이면 …」 처럼 조건이 붙은 항상은 조건이 맞을 때만(주인 기준으로 본다)
  if (u.side === "party" && s.always) for (const m of s.always[u.key] || []) {
    if (m.stat !== stat) continue;
    if (m.cond && m.cond.length) { const owner = s.party.find((x) => x.key === m.owner); if (!owner || !condOk(s, owner, { conds: m.cond }, {})) continue; }
    v += m.v;
  }
  for (const kw of Object.values(s.kw || {})) {
    for (const p of kw.per) {
      if (p.stat !== stat) continue;
      if (kw.carrier === "self") {
        const owner = s.party.find((x) => x.key === kw.owner);
        const n = (((s.stacks || {})[kw.owner] || {})[kw.id]) || 0;
        if (!n || !owner) continue;
        if (p.who === "allies" ? u.side === "party" : u === owner) v += n * p.v;
      } else {
        const n = (u.status || {})[kw.id] || 0;
        if (n) v += n * p.v;
      }
    }
  }
  return v;
}

// 「항상」 규칙의 능력치 증감을 모아 둔다 — 매번 돌지 않고 늘 걸려 있는 것
export function collectAlways(s) {
  s.always = {};
  for (const [key, rules] of Object.entries(s.passives || {})) {
    for (const r of rules) {
      if (r.when.on !== "always") continue;
      for (const f of r.fx) {
        const stat = { dealtMod: "dealt", takenMod: "taken", atkMod: "atk", defMod: "def", critMod: "crit", healMod: "heal" }[f.k];
        if (!stat) continue;
        const who = f.target === "allAllies" ? s.party.map((u) => u.key) : [key];
        for (const k of who) (s.always[k] = s.always[k] || []).push({ stat, v: f.v, cond: r.conds, owner: key, name: r.name });
      }
    }
  }
}

function condOk(s, owner, r, info) {
  for (const c of r.conds) {
    if (c.c === "stack") {
      // 누구의 것을 세나 — 적 표식은 일을 당한 적, 아군 표식의 키워드 규칙(카드를 낼 때마다 「X」가 있으면)은 그 카드를 낸 아군,
      // 그 밖(패시브의 「「X」가 N개 이상이면」)은 그 사도 자신. 실비아 「어머니의 특별 강의」 의 「초청객이 2개 이상」 은
      // 실비아 자신이 든 수다 — 파티 합으로 세면 셋이 하나씩만 들어도 3 이라 늘 켜졌다
      const kc = s.kw[c.id] && s.kw[c.id].carrier;
      const holder = kc === "enemy" ? info.target
        : kc === "ally" && r.kwOf === "ally" && info.actor ? (s.party.find((u) => u.key === info.actor) || owner)
        : owner;
      if (stackOn(s, holder, c.id, owner) < c.n) return false;
    }
    if (c.c === "hp" && owner.hp / owner.maxHp > c.pct) return false;
    if (c.c === "foes" && s.enemies.filter((e) => !e.dead).length < c.n) return false;
    if (c.c === "alone" && s.party.filter((u) => !u.dead && u !== owner).length) return false;
    if (c.c === "row" && owner.row !== c.row) return false;
    if (c.c === "playedMax" && (s.playedThisTurn || 0) > c.n) return false;
    if (c.c === "playedMin" && (s.playedThisTurn || 0) < c.n) return false;
    if (c.c === "ownNone" && ((s.playedBy || {})[owner.key] || 0) > 0) return false;
    if (c.c === "apLeft" && (s.ap || 0) < c.n) return false;
    if (c.c === "gauge" && (s.gauge || 0) < c.n) return false;
    if (c.c === "guarded" && !(c.kind === "block" ? owner.block > 0 : c.kind === "shield" ? owner.shield > 0 : owner.block > 0 || owner.shield > 0)) return false;
    if (c.c === "hpMin" && owner.hp / owner.maxHp < c.pct) return false;
    if (c.c === "foesMax" && s.enemies.filter((e) => !e.dead).length > c.n) return false;
    if (c.c === "rushed" && !s.rushedThisTurn) return false;
    if (c.c === "hurtLast" && !(s.hurtPrev || {})[owner.key]) return false;
    if (c.c === "hurtLastAny" && !Object.keys(s.hurtPrev || {}).length) return false;
    if (c.c === "killedLast" && !(s.killPrev || {})[owner.key]) return false;
    if (c.c === "firstTurn" && s.turn !== 1) return false;
  }
  return true;
}

function matches(s, owner, w, ev, info, kwOf) {
  if (w.on !== ev) return false;
  switch (ev) {
    case "play":
      // 아군에게 거는 표식의 규칙은 표식을 든 누가 내도 본다(든 수는 condOk 가 낸 사람에게서 센다)
      if (w.who !== "any" && kwOf !== "ally" && info.hero !== owner.key) return false;
      if (w.type && info.type !== w.type) return false;
      if (w.nth && info.nth !== w.nth) return false;
      if (w.minCost && (info.cost || 0) < w.minCost) return false;
      if (w.sig && !info.sig) return false;
      return true;
    case "guard": return (w.who === "any" ? info.who.side === "party" : info.who === owner) && (!w.kind || info.k === w.kind);
    case "kill": return !w.mine || info.by === owner.key;
    case "hurt": return w.who === "any" ? info.who.side === "party" : info.who === owner;
    case "lowHp": return info.who === owner && info.before > w.pct && info.after <= w.pct;
    case "allyDown": return info.who !== owner;
    case "ult": return info.hero === owner.key || (info.heroes || []).includes(owner.key);
    case "debuff": return info.by === owner.key;
    case "overheal": return info.by === owner.key;
    case "stackReach": return w.id === info.id && info.before < w.n && info.after >= w.n && (!info.owner || info.owner === owner.key);
    default: return true;
  }
}

// 지금 돌고 있는 규칙 — 판(s)에 두지 않는다(저장 · save.js 가 다룰 수 없는 Set 이다). 판마다 따로
const FIRING = new WeakMap();
const NONE = new Set();

// 일이 났다 — 맞는 규칙을 모두 돌린다. run(owner, fx, ctx, label)
export function emit(s, ev, info, run) {
  if (!s.passives || s.over) return;
  if (s.depth > 4) return;                 // 패시브가 패시브를 부르는 고리를 끊는다
  s.depth++;
  try {
    for (const owner of s.party) {
      if (owner.dead) continue;
      const rules = s.passives[owner.key] || [];
      rules.forEach((r, i) => {
        if (!matches(s, owner, r.when, ev, info, r.kwOf)) return;
        const id = `${owner.key}|${i}`;
        if ((FIRING.get(s) || NONE).has(id)) return;
        // 「적에게 디버프를 걸면」 — 한 번의 일(카드 한 장 · 패시브 한 번)에 한 번. 적 전체에 걸어도 적 수만큼 돌지 않는다
        if (ev === "debuff" && info.seq != null) { const dk = `${id}|debuff`; if (s.counts[dk] === info.seq) return; s.counts[dk] = info.seq; }
        // 「N장 낼 때마다 「X」가 …이면」 — 장수는 조건과 상관없이 세고, N장째에 조건을 본다.
        // 전에는 조건이 맞을 때만 세서, 앞 턴에 하나 세 둔 것이 다음 턴 첫 장에 터졌다(실비아 AP 가 아무 때나 났다).
        // 「한 턴에」(perTurn)면 턴마다 0 에서 센다
        if (r.when.every) {
          const ck = r.when.perTurn ? `${id}|${s.turn}` : id;
          s.counts[ck] = (s.counts[ck] || 0) + 1;
          if (s.counts[ck] % r.when.every) return;
        }
        if (!condOk(s, owner, r, info)) return;
        if (r.limit) {
          const key = `${id}|${r.limit.per === "turn" ? s.turn : "f"}`;
          if ((s.fired[key] || 0) >= r.limit.n) return;
          s.fired[key] = (s.fired[key] || 0) + 1;
        }
        if (!r.fx.length) return;
        const target = info.target && info.target.side === "enemy" ? info.target : null;
        const holder = ev === "stackReach" && info.target && info.target !== owner ? info.target : null;
        const ally = info.who && info.who.side === "party" && !info.who.dead ? info.who : owner;
        // 규칙이 스스로를 다시 부르지 않는다 — 「디버프를 걸면 … 적 1명 주는 피해 -10%」 · 「방어를 얻으면 … 방어」 가 제 효과로 또 돌던 고리
        if (!FIRING.has(s)) FIRING.set(s, new Set());
        const firing = FIRING.get(s);
        firing.add(id);
        try { run(owner, r.fx, { owner, combo: null, targetIdx: target ? target.idx : 0, passive: r.name, holder, ally }, `${owner.ko} · ${r.name}`); }
        finally { firing.delete(id); }
      });
    }
  } finally { s.depth--; }
}

// 턴 끝 — 키워드의 지속 피해·회복, 줄어들기, 버프 시간 줄이기
export function tickTurnEnd(s, hurt, say) {
  for (const kw of Object.values(s.kw || {})) {
    const owner = s.party.find((x) => x.key === kw.owner);
    for (const p of kw.per) {
      if (p.stat === "dot" && owner) {
        const holders = kw.carrier === "enemy" ? s.enemies : kw.carrier === "ally" ? s.party : [];
        for (const e of holders) {
          const n = (e.status || {})[kw.id] || 0;
          if (!n || e.dead) continue;
          const v = Math.max(1, Math.round(owner.atk * p.ratio * n));
          hurt(e, v, { from: owner });
          say(`${e.ko}: ${kw.id} ${n} — ${v} 피해`);
        }
      }
      if (p.stat === "hot" && owner) {
        const holders = kw.carrier === "self" ? [owner] : s.party;
        for (const u of holders) {
          const n = kw.carrier === "self" ? (((s.stacks || {})[kw.owner] || {})[kw.id] || 0) : (u.status || {})[kw.id] || 0;
          if (!n || u.dead) continue;
          const v = Math.max(1, Math.round(healStat(owner.atk, owner.role, owner.healPlus) * (1 + statMod(s, owner, "heal")) * p.ratio * n));   // 회복력(rules.js) · 장비 회복력 · 회복력 증감
          u.hp = Math.min(u.maxHp, u.hp + v);
        }
      }
    }
  }
}

// 키워드 겹 줄이기(「적의 차례가 끝나면 N 감소」) — 버프 시간처럼 **다음 내 턴이 시작될 때** 부른다.
// 전에는 내 턴 끝(적의 차례 앞)에 줄여서, 「받는 피해 -8%」 같은 막는 표식이 적이 치기 전에 한 겹씩 빠졌다 —
// 한 겹짜리는 한 번도 막지 못했다(우이(기억)의 세잎클로버). 공격 쪽 표식은 내 턴에만 쓰이니 달라지지 않는다
export function decayKeywords(s) {
  for (const kw of Object.values(s.kw || {})) {
    if (!kw.decay) continue;
    const cut = (n) => (kw.decay === "all" ? 0 : Math.max(0, n - kw.decay));
    if (kw.carrier === "self") {
      const pool = (s.stacks || {})[kw.owner];
      if (pool && pool[kw.id]) pool[kw.id] = cut(pool[kw.id]);
    } else {
      for (const u of [...s.party, ...s.enemies]) if (u.status && u.status[kw.id]) {
        u.status[kw.id] = cut(u.status[kw.id]);
        if (!u.status[kw.id]) delete u.status[kw.id];
      }
    }
  }
}

// 버프 시간 줄이기 — 다음 내 턴이 시작될 때 부른다(「이번 턴」 이 적의 차례까지 가도록)
export function tickMods(s) {
  for (const u of [...s.party, ...s.enemies]) {
    if (!u.mods) continue;
    for (const m of u.mods) m.left -= 1;
    u.mods = u.mods.filter((m) => m.left > 0);
  }
}

// src — 어디서 왔나(「실비아 「궁극의 유희」」 따위). 사도 정보 창이 버프 · 디버프마다 출처를 적는다
// run — 강화 카드의 「판 내내」 버프(run.boons). 정보 창이 「판 내내」 로 적는다
export function addMod(u, stat, v, turns, src, run) {
  u.mods = u.mods || [];
  u.mods.push({ stat, v, left: turns == null ? 1 : turns, ...(src ? { src } : {}), ...(run ? { run: true } : {}) });
}
