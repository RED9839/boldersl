// 카드에 앉히는 짧은 꼴. **뜻은 그대로 두고 말만 줄인다.**
//
// 기획서 글은 문장이다 — "공격력 100% 피해". 카드에 필요한 건 수치다 — "피해 100%".
// 1,080장 가운데 525장이 그 꼴이라 이 한 줄만으로도 크게 줄어든다.
//
// **숫자를 하나라도 잃으면 안 된다.** 규칙을 잘못 쓰면 배율이 사라져도 글은 멀쩡해 보인다 —
// tools/check-short.js 가 원문과 줄인 글의 숫자를 견줘서 그것만 본다(길이 「2턴」 을 뒤로 옮기니 차례는 안 보고 묶음으로 본다).
//
// 화면과 따로 둔 이유는 검사하려고다. ui.js 는 document 가 있어야 읽히지만 이 파일은 아니다.

// 길이를 뒤로 옮길 수 있는 꼴 — 대상 + 능력치 증감(「주는 피해 +10%」 「공격력 +10% · 방어력 +10%」)
const DUR_TGT = "(자신|아군 전원|아군 전체|아군 1명|파티 전원|적 전체|적 1명|무작위 적|HP 최저 아군)";
const DUR_STAT = "(?:주는 피해|받는 피해|공격력|방어력|치명(?: 확률)?|회복력) [+-]\\d+%";
const DUR_CHAIN = `${DUR_STAT}(?: · ${DUR_STAT})*`;

const SHORT = [
  [/공격력 (\d+)% 마법 피해/g, "마법 피해 $1%"],
  [/공격력 (\d+)% 피해/g, "피해 $1%"],
  [/방어력 (\d+)% 방어/g, "방어 $1%"],
  [/방어력 (\d+)% 실드/g, "실드 $1%"],
  [/실드\(방어력 (\d+)%\)/g, "실드 $1%"],
  [/방어\(방어력 (\d+)%\)/g, "방어 $1%"],
  [/HP 회복\((?:공격력|회복력) (\d+)%\)/g, "회복 $1%"],
  [/HP 회복 (?:공격력|회복력) (\d+)%/g, "회복 $1%"],
  [/회복\((?:공격력|회복력) (\d+)%\)/g, "회복 $1%"],
  [/(?:공격력|회복력) (\d+)% 회복/g, "회복 $1%"],
  // 대상 낱말 하나로 — 「HP 최저 아군」(풀이: 효과마다 그때 HP 비율이 가장 낮은 아군을 다시 고른다)
  [/HP\s*(?:비율이|가)\s*가장\s*낮은\s*아군/g, "HP 최저 아군"],
  // 길이는 늘 끝에 — 「약화 1턴」 「취약 2턴」 처럼 「아군 전원 주는 피해 +10% 2턴」.
  // 기획서 글의 「2턴간 …」 · 「이번 전투 동안 …」 · 「이번 턴 …」 을 뒤로 옮긴다(이어 적은 「공격력 +10% · 방어력 +10%」 는 통째로)
  [new RegExp(`(\\d+)턴간 ${DUR_TGT} (${DUR_CHAIN})`, "g"), "$2 $3 $1턴"],
  [new RegExp(`이번 전투 동안 ${DUR_TGT} (${DUR_CHAIN})`, "g"), "$1 $2 전투 내내"],
  [new RegExp(`판 내내 ${DUR_TGT} (${DUR_CHAIN})`, "g"), "$1 $2 판 내내"],       // 강화 카드(rules.js isPower)
  [new RegExp(`이번 턴 ${DUR_TGT} (${DUR_CHAIN})`, "g"), "$1 $2 이번 턴"],
  // 같은 것을 이어 한 번 더 — 「회복 70% → 회복 40%」 는 「회복 70% → 40%」(대상은 앞의 것 · 최저 아군은 그때 다시 고른다)
  [/(피해|회복|방어|실드) (\d+)% → \1 (\d+)%/g, "$1 $2% → $3%"],
  // ↓ main(ui/revive)의 줄이기 — 「HP 최저 아군」 은 낱말 풀이 이름이라 그대로 둔다
  // 패시브 · 키워드 풀이의 긴 말버릇(2026-10 「글이 많고 길다」) — 숫자는 하나도 건드리지 않는다
  [/적의 차례가 끝나면 (\d+) 감소/g, "적 차례 뒤 -$1"],
  [/적에게 거는 표식이다\.?/g, "적에게 거는 표식."],
  [/아군에게 거는 표식이다\.?/g, "아군에게 거는 표식."],
  [/(공격|스킬|강화) 카드를 낼 때마다/g, "$1 카드마다"],
  [/파티가 이번 턴 카드를 (\d+)장째 낼 때/g, "이번 턴 $1장째 카드에"],
  [/턴 종료 시 /g, "턴 끝에 "],
  [/턴 시작 시 /g, "턴 시작에 "],
  [/(\d+)개당 자신 /g, "$1개당 "],
  [/이번 턴 자신 /g, "이번 턴 "],
];

export function shortText(t) {
  let out = String(t || "");
  for (const [re, to] of SHORT) out = out.replace(re, to);
  return out;
}

export { SHORT };

// 카드 면의 수치 조각 — 「피해 100%」 「4회 × 피해 30%」 「방어 200%」 「실드 …」 「회복 …」(줄인 글 기준).
// 전투 화면은 낸 사도의 지금 능력치로 숫자를 크게, % 를 작게 얹는다(ui-common withNumbers). 싸움 밖은 % 그대로.
// 돌려주는 것: [{ t } | { t, kind: dmg · block · shield · heal, label, pct, hits }] — t 를 이으면 원래 글
// 「회복 70% → 40%」 — 화살표 뒤의 숫자는 앞과 같은 갈래(줄인 글이 낱말을 한 번만 적는다)
const NUM = /(?:(\d+)회 × )?(마법 피해|피해|방어|실드|회복) (\d+)%|(?<=→ )(\d+)%/g;
const NUM_KIND = { "마법 피해": "dmg", 피해: "dmg", 방어: "block", 실드: "shield", 회복: "heal" };
export function numParts(text) {
  const t = String(text || ""), out = [];
  let at = 0;
  let last = null;
  for (const m of t.matchAll(NUM)) {
    if (m[4] && !last) continue;                     // 앞에 갈래가 없는 「→ N%」 는 글 그대로
    if (m.index > at) out.push({ t: t.slice(at, m.index) });
    if (m[4]) out.push({ t: m[0], kind: last.kind, label: "", pct: Number(m[4]), hits: 0 });
    else { last = { kind: NUM_KIND[m[2]] }; out.push({ t: m[0], kind: last.kind, label: m[2], pct: Number(m[3]), hits: m[1] ? Number(m[1]) : 0 }); }
    at = m.index + m[0].length;
  }
  if (at < t.length) out.push({ t: t.slice(at) });
  return out;
}

// ── 밑줄 칠 낱말 가르기 ──────────────────────────────────────────────
//
// 글을 조각으로 가른다. [{ t: "피해 " }, { t: "취약", kw: {...} }, { t: " 1턴" }]
// 화면은 kw 가 붙은 조각에만 밑줄을 긋고 풀이를 매단다.
//
// **잘못 걸리는 자리가 있다.** "방어" 는 "방어력" 안에도 있고, "고학년 스킬" 는
// "고학년 게이지" 안에도 있다. 그래서 긴 낱말부터 찾고, 뒤에 붙으면 안 되는
// 글자를 따로 적어 둔다(keywords.js 의 notAfter).
import KW from "./data/keywords.js";

export function splitKeywords(text, heroKey) {
  const t = String(text || "");
  const mine = heroKey ? KW.heroes[heroKey] : null;
  // 그 사도의 낱말을 먼저 찾는다 — 전용 키워드와, 그 풀이에 딸린 곁말(그윈의 깃발·동상).
  // 긴 것부터 봐야 짧은 것에 먹히지 않는다.
  const own = mine ? [mine.ko, ...Object.keys(mine.subs || {})].sort((a, b) => b.length - a.length) : [];
  const words = [...own, ...KW.order];

  const out = [];
  let i = 0, plain = "";
  outer: while (i < t.length) {
    for (const w of words) {
      if (!t.startsWith(w, i)) continue;
      const after = t[i + w.length] || "";
      if ((KW.notAfter[w] || []).includes(after)) continue;
      if (plain) { out.push({ t: plain }); plain = ""; }
      const kw = mine && w === mine.ko ? { ko: mine.ko, text: mine.text, kind: "전용" }
        : mine && mine.subs && w in mine.subs ? { ko: w, text: mine.subs[w], kind: "전용" }
        : KW.words[w];
      out.push({ t: w, kw: kw || { ko: w, text: null, kind: "?" } });
      i += w.length;
      continue outer;
    }
    plain += t[i];
    i++;
  }
  if (plain) out.push({ t: plain });
  return out;
}


// ── 카드 한 장을 '하는 일 + 낱말 풀이' 로 펼친다 ──────────────────────
//
// 카드 글에 낱말 풀이가 섞여 있는 것이 있다. 그윈의 스노우포그가 그렇다 —
//   "2턴간 안개: 적 전체 매 턴 피해 50%·동상 1, 적이 주는 피해 -5%. 동상 3 이상 적은 기절"
// 한 줄로 읽으면 무엇이 하는 일이고 무엇이 안개의 뜻인지 갈라지지 않는다. 이렇게 펼친다 —
//   하는 일   2턴간 안개
//   안개      적 전체 매 턴 피해 50%·동상 1, 적이 주는 피해 -5%. 동상 3 이상 적은 기절
//   동상      스택형 둔화(…), 3스택 이상 적은 스노우포그에 기절.
//   기절      그 턴에 아무것도 못 한다.
//
// **말을 지어내지 않는다.** 기획서 글을 자르기만 한다. "적 전체에 안개 부여" 같은
// 매끄러운 문장은 사람이 쓴 것이라 도구가 흉내 내면 없던 뜻이 생긴다.

// 그 카드에서만 쓰는 낱말 — "N턴간 <낱말>: <풀이>" 꼴로 글머리에 선 것만 본다.
// 신탁 글은 「코스트 0.」 로 시작할 수 있다 — 그 뒤의 이름표를 본다(코스트는 카드 머리에 따로 보인다)
const LOCAL = /^(?:코스트\s*\d+\s*\.\s*)?(\d+턴간|이번 전투 동안|이번 턴)\s*([가-힣]{2,5})\s*:\s*/;

// 한다체 → 합니다체 — 문장 끝 「…다」 만 바꾼다(「산다」 → 「삽니다」 · 「듣는다」 → 「듣습니다」 · 「했다」 → 「했습니다」).
// 이벤트 선택지처럼 설계 문서의 말(한다체)을 화면 안내(합니다체)로 올릴 때 쓴다. 「마다」 는 조사라 건드리지 않는다.
const SYL = (ch, jong) => String.fromCharCode(0xac00 + Math.floor((ch.charCodeAt(0) - 0xac00) / 28) * 28 + jong);
export function polite(t) {
  return String(t).replace(/[가-힣]+다(?=$|[\s.!?)…,·—(」])/g, (s) => {
    if (s.endsWith("마다")) return s;
    const head = s.slice(0, -1);
    if (head.length >= 2 && head.endsWith("는")) return head.slice(0, -1) + "습니다";
    const ch = head[head.length - 1];
    if (ch === "니") return s;                                   // 이미 합니다체
    const jong = (ch.charCodeAt(0) - 0xac00) % 28;
    if (jong === 4 || jong === 0) return head.slice(0, -1) + SYL(ch, 17) + "니다";   // 한다 → 합니다 · 크다 → 큽니다
    return head + "습니다";                                       // 했다 · 없다 → 했습니다 · 없습니다
  });
}

// 신탁 글머리의 「코스트 N.」 — 카드 머리의 코스트 칸이 같은 값을 보이니 카드 면에서는 뺀다(데이터는 그대로)
const COST_HEAD = /^코스트\s*\d+\s*\.\s*/;

// 사도의 강화 카드(rules.js isPower) — 카드 면 맨 앞에 규칙 꼬리표. 「강화 카드」 는 낱말 풀이가 붙는다(build-keywords)
export const POWER_TAG = "강화 카드: 한 장만 · 쓰면 사라짐 · 판 내내.";
export function cardParts(card, heroKey) {
  const full = shortText(card.text).replace(COST_HEAD, "");
  const m = full.match(LOCAL);
  const power = !!(card.unique && card.hero && card.type === "강화");
  const action = (power ? POWER_TAG + " " : "") + (m ? `${m[1]} ${m[2]}` : full);
  const terms = [];
  const seen = new Set();
  const push = (ko, text, kind) => { if (ko && !seen.has(ko)) { seen.add(ko); terms.push({ ko, text, kind }); } };

  if (m) push(m[2], full.slice(m[0].length), "이 카드");

  // 하는 일과 풀이에 나온 낱말을 차례대로 모은다
  const hunt = (t) => { for (const p of splitKeywords(t, heroKey)) if (p.kw) push(p.kw.ko, p.kw.text, p.kw.kind); };
  hunt(action);
  for (const t of terms.slice()) if (t.text) hunt(t.text);

  return { action, terms };
}

// ── 사도 전용 키워드 풀이를 「소개 + 규칙 줄」 로 ──────────────────────
//
// 기획서의 키워드 칸은 한 덩어리다 — "친구 몰래 챙겨 둔 케이크. 최대 5. 「케이크」가 5개가 되면: …".
// 첫 문장은 소개(사람이 읽는 말, js/passive.js parseKeyword 도 첫 문장은 건너뛴다)이고 그 뒤가 규칙이다.
// 화면은 소개를 한 줄로, 규칙(최대 · 1개당 · 다 차면)을 줄마다 따로 놓아 훑어 읽게 한다.
// **글은 자르기만 한다.** 규칙 줄은 카드처럼 줄인 꼴(shortText)이다.
export function keywordLines(text) {
  const ss = String(text || "").split(/(?<=[.。])\s+/).map((s) => s.trim()).filter(Boolean);
  const rule = (s) => shortText(s.replace(/[.。]$/, "")).replace(/^최대 (\d+)$/, "최대 $1개");
  if (ss.length < 2) return { flavor: "", rules: ss.map(rule) };
  const [flavor, ...rest] = ss;
  return { flavor, rules: rest.map(rule) };
}

// ── 겨우살이의 축복 한 줄 ─────────────────────────────────────────────
//
// 축복 글은 「피해 ×1.3」 「보존」 「개전」 처럼 앞머리만 있는 것이 많다. 카드 아래 따로 놓이면
// 무엇에 붙는 말인지 안 보인다 — 「이 카드 피해 ×1.3」 · 「이 카드: 보존」 으로 밝힌다(데이터는 그대로).
const BLESS_HEAD = /^(?:취약(?:\s*상태)?인\s*적에게\s*피해|피해|회복(?:량)?|방어\s*·\s*실드|방어|실드)\s*×\s*[\d.]+|^코스트\s*-\s*\d+/;
const BLESS_TAG = /^(?:보존|개전|소멸)(?=$|[\s.,])/;
export function blessLine(b) {
  const t = shortText(String((b && b.text) || "").trim());
  if (BLESS_HEAD.test(t)) return "이 카드 " + t;
  if (BLESS_TAG.test(t)) return "이 카드: " + t;
  return t;
}
