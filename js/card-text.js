// 카드에 앉히는 짧은 꼴. **뜻은 그대로 두고 말만 줄인다.**
//
// 기획서 글은 문장이다 — "공격력 100% 피해". 카드에 필요한 건 수치다 — "피해 100%".
// 1,080장 가운데 525장이 그 꼴이라 이 한 줄만으로도 크게 줄어든다.
//
// **숫자를 하나라도 잃으면 안 된다.** 규칙을 잘못 쓰면 배율이 사라져도 글은 멀쩡해 보인다 —
// tools/check-short.js 가 원문과 줄인 글의 숫자를 견줘서 그것만 본다.
//
// 화면과 따로 둔 이유는 검사하려고다. ui.js 는 document 가 있어야 읽히지만 이 파일은 아니다.

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
];

export function shortText(t) {
  let out = String(t || "");
  for (const [re, to] of SHORT) out = out.replace(re, to);
  return out;
}

export { SHORT };

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

export function cardParts(card, heroKey) {
  const full = shortText(card.text).replace(COST_HEAD, "");
  const m = full.match(LOCAL);
  const action = m ? `${m[1]} ${m[2]}` : full;
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
