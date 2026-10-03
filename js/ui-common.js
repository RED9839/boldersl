// 화면들이 같이 쓰는 것 — 요소 만들기 · 화면 비우기 · 카드 꼴 · 낱말 쪽지 · 도움말 · 장비 아이콘.
// ui.js(지도 · 보상 · 캠프 · 상점 · 이벤트 · 끝) · party-screen.js · fight-screen.js 가 여기서 꺼내 쓴다. 여기는 그 셋을 부르지 않는다.
import { HEROES } from "./data/heroes.js";
import { HERO_DATA, EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { shortText, splitKeywords, cardParts, numParts, keywordLines } from "./card-text.js";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
import * as R from "./run.js";
import * as art from "./art.js";
import * as M from "./map.js";
import { toggleFullscreen } from "./stage.js";
import { 이가 } from "./ko.js";

// 사도 정보는 기획서가 원본이다. 빛깔만 옛 heroes.js 가 들고 있다.
export const HERO = (k) => HERO_DATA[k] || HEROES[k] || { ko: k, row: "mid", nature: null };
export const TINT = (k) => (HEROES[k] || {}).tint || "#8a8a9a";

const $ = (sel) => document.querySelector(sel);
export const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export let kwNote = null;                 // 낱말 풀이 쪽지 — 한 번에 하나만 뜬다
// 쪽지(낱말 풀이 · 카드 쪽지 · 더미 창)는 「닫기」 말고도 바깥을 누르거나 Esc 로 닫는다.
// 누르기 시작(pointerdown)에 닫으니, 다른 낱말을 누르면 앞의 쪽지가 닫히고 새 쪽지가 뜬다
if (typeof document === "object" && document.addEventListener) {
  document.addEventListener("pointerdown", (e) => {
    if (kwNote && !kwNote.contains(e.target)) { kwNote.remove(); kwNote = null; }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && kwNote) { kwNote.remove(); kwNote = null; }
  });
}
export function hint(t) { $("#hint").textContent = t || ""; }
export function screen() {
  // 화면이 바뀌면 아래 안내도 지운다 — 전투에서 뜬 「도울 아군을 고릅니다」 가
  // 끝 화면까지 따라와 있었다.
  hint("");
  // 낱말 쪽지도 같이 접는다 — 몸통에 붙어 있어서 저 혼자 남는다
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const s = $("#screen"); s.innerHTML = ""; s.className = ""; return s;
}
export const NTINT = { 순수: "#7fd3a8", 광기: "#d9737f", 냉정: "#7fd6f5", 우울: "#9a8cc0", 활발: "#f5dc5a", 공명: "#c9c9d6" };
// 카드 타입 — 원작 도감처럼 한 글자 표시와 빛깔을 준다
// 카드 종류는 셋(공격 · 스킬 · 강화, 2026-10). 쉴드 · 기술은 옛 손 카드(js/data/cards.js)의 것
// 저주(골칫거리 — 판의 덱에 남는다) · 상태(적이 이 전투에만 끼워 넣는다) — 주인 없는 방해 카드
export const TMARK = { 공격: "✕", 스킬: "◈", 쉴드: "⬢", 강화: "▲", 기술: "◆", 저주: "☠", 상태: "≋" };
export const TKIND = { 공격: "atk", 스킬: "skill", 쉴드: "def", 강화: "buff", 기술: "skill", 저주: "curse", 상태: "status" };

// 원작에서 꺼낸 작은 표들 — assets/uiicons/성격_순수.png 꼴이다.
// 그림이 없으면 글자 한 자로 떨어진다. 꺼낸 것이 없어도 화면은 그대로 돈다.
//
// 그림을 먼저 붙이고, 안 되면 글자로 되돌린다. 반대로 하면 안 된다 —
// 문서에 안 붙은 <img> 에 loading="lazy" 를 걸어 놓고 onload 를 기다린 적이 있는데,
// 화면 밖이라 브라우저가 아예 받아 오지를 않아서 아이콘이 한 장도 안 떴다.
export function uiIcon(kind, name, cls, fallback) {
  const n = el("i", cls);
  const im = document.createElement("img");
  im.src = `assets/uiicons/${kind}_${name}.png`;
  im.alt = name;
  im.onerror = () => { im.remove(); n.textContent = fallback; };
  n.appendChild(im);
  return n;
}

// 골드 — 원작 재화 아이콘(atlases/currencyicons 의 CurrencyIcon_0008, 잎사귀 금화 · tools/extract-currency-icons.py).
// 그림이 없으면 「✦」 로 떨어진다(uiIcon 과 같은 차례 — 그림을 먼저 붙이고 안 되면 글자)
const GOLD_ICON = "assets/currency/CurrencyIcon_0008.png";
export function goldIcon(cls = "gico") {
  const n = el("i", cls);
  const im = document.createElement("img");
  im.src = GOLD_ICON;
  im.alt = "골드";
  im.onerror = () => { im.remove(); n.textContent = "✦"; n.classList.add("noimg"); };
  n.appendChild(im);
  return n;
}
// 겨우살이 — 축복을 내려 주는 인물(이벤트 C11). 스탠딩을 한 장으로 구워 둔 전신 · 얼굴(tools/bake-npc.py, 원작 폴더 noone).
// 축복이 적힌 자리(✦)에 작은 얼굴을 붙인다. 그림이 없으면 「✦」 로 떨어진다(goldIcon 과 같은 차례)
export const MISTLETOE = { still: "assets/sd/npc/noone.png", face: "assets/sd/npc/noone_face.png" };
export function mistletoeIcon(cls = "mtico") {
  const n = el("i", cls);
  const im = document.createElement("img");
  im.src = MISTLETOE.face;
  im.alt = "겨우살이";
  im.onerror = () => { im.remove(); n.textContent = "✦"; n.classList.add("noimg"); };
  n.appendChild(im);
  return n;
}
// 골드 아이콘 + 글(「120 골드」 · 「+35」 따위)
export function goldLabel(tag, cls, text) {
  const n = el(tag, cls);
  n.appendChild(goldIcon());
  n.appendChild(document.createTextNode(text));
  return n;
}

// 성격 상성 그림 — 광기 → 순수 → 냉정 → 광기 는 삼각형, 활발 ↔ 우울 은 세로 한 줄.
// 화살표가 가리키는 쪽에 강하다(rules.js BEATS). on: 빛낼 성격들(편성에 든 사도의 성격)
function natureChart(on = new Set()) {
  const W = 250, H = 150, R = 20;
  const at = { 광기: [62, 16], 순수: [114, 94], 냉정: [10, 94], 활발: [196, 16], 우울: [196, 94] };
  const box = el("div", "natchart");
  box.style.width = W + "px"; box.style.height = H + "px";
  const NS = "http://www.w3.org/2000/svg";
  const svg = typeof document === "object" && document.createElementNS ? document.createElementNS(NS, "svg") : el("svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
  svg.innerHTML = `<defs><marker id="natarr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#f6d58e"/></marker></defs>`;
  // 화살 — 원 둘레에서 둘레까지
  const arrow = (a, b, both) => {
    const [x1, y1] = at[a].map((v) => v + R), [x2, y2] = at[b].map((v) => v + R);
    const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    const hot = on.has(a) || on.has(b);
    const line = typeof document === "object" && document.createElementNS ? document.createElementNS(NS, "line") : el("line");
    line.setAttribute("x1", String(x1 + ux * (R + 3))); line.setAttribute("y1", String(y1 + uy * (R + 3)));
    line.setAttribute("x2", String(x2 - ux * (R + 5))); line.setAttribute("y2", String(y2 - uy * (R + 5)));
    line.setAttribute("class", hot ? "hot" : "");
    line.setAttribute("marker-end", "url(#natarr)");
    if (both) line.setAttribute("marker-start", "url(#natarr)");
    svg.appendChild(line);
  };
  arrow("광기", "순수"); arrow("순수", "냉정"); arrow("냉정", "광기"); arrow("활발", "우울", true);
  box.appendChild(svg);
  for (const [nat, [x, y]] of Object.entries(at)) {
    const n = el("div", "natnode" + (on.has(nat) ? " on" : on.size ? " off" : "") + (y < 50 ? " ntop" : ""));   // 위 줄은 이름을 원 위에
    n.style.left = x + "px"; n.style.top = y + "px";
    n.style.setProperty("--tint", NTINT[nat]);
    n.appendChild(uiIcon("성격", nat, "natico", nat.slice(0, 1)));
    n.appendChild(el("span", "natname", nat));
    box.appendChild(n);
  }
  return box;
}

// ── 도움말 모음 ─────────────────────────────────────────────────────────
// 규칙을 화면마다 흩어 적지 않고 여기 한 곳에 모은다. 편성 · 전투 · 지도의 메뉴에서 연다.
// 숫자는 rules.js 에서 바로 읽는다 — 규칙을 바꾸면 도움말도 같이 바뀐다.
const HELP = [
  ["상성", "성격 상성", () => {
    const d = el("div");
    d.appendChild(natureChart());
    d.appendChild(el("p", null, `화살표가 가리키는 쪽에 강합니다. 유리한 상대에게는 주는 피해 +${Math.round(RULES.NATURE_DMG * 100)}%, 받는 피해 -${Math.round(RULES.NATURE_DEF * 100)}%.`));
    d.appendChild(el("p", null, "광기 → 순수 → 냉정 → 광기로 돌고, 활발과 우울은 서로에게 강합니다. 공명은 어느 상성에서나 유리한 쪽입니다 — 어느 적이든 약점으로 치고, 상성 덕을 봅니다. 적에게도 성격이 있습니다."));
    return d;
  }],
  ["파티", "파티 HP · 파티 상태", () => helpList([
    "파티는 한 몸입니다(카제나처럼). 파티 HP 하나 = 세 사도의 최대 HP(장비 HP 포함)를 더한 것. 방어 · 실드도 파티에 하나씩입니다.",
    "적의 수는 모두 파티를 칩니다. 맞는 사도는 연출 자리일 뿐입니다 — 앞열 · 도발한 사도가 흔들립니다.",
    `전체 공격은 파티를 한 번 칩니다 — 적 머리 위 숫자가 이미 ×${RULES.FOE_ALL_X} 한 값입니다. 관통(↷)은 방어(턴 방어)를 무시하고 실드와 HP 를 칩니다.`,
    `도발 — 그 사도가 앞을 막아 섭니다. 도발이 걸린 동안 파티는 불굴 ${RULES.TAUNT_FORT}겹만큼 덜 받습니다(받는 피해 -${Math.round(RULES.STATUS_V.불굴 * RULES.TAUNT_FORT * 100)}%, 불굴과 합쳐 -${Math.round(RULES.STATUS_V.불굴Cap * 100)}% 까지).`,
    "상태는 두 층입니다. 파티 층 — 불굴 · 결의 · 결정화 · 반격 · 잔광 · 피해 감소 · 면역 · 실드 유지 · 저장 · 협공 · 고동 · 취약 · 약화 · 손상 · 고통과 적이 거는 것은 파티 막대 밑 한 줄입니다. 사도 층 — 사기는 그 사도의 카드에만, 초상 밑에 작게 붙습니다.",
    "대상 말 없이 쓴 버프는 파티에 겁니다 — 「사기 1」 은 셋 모두 사기 1(파티의 모든 공격에 붙습니다), 「불굴 2」 는 파티에 불굴 2. 「자신 사기」 · 「아군 1명 사기」 만 한 사도에게 겁니다. 회복 · 방어 · 실드는 파티에 한 번 붙습니다.",
    "반격(방어 기반 피해) · 결정화는 방어력이 가장 높은 사도로 셉니다. 카드의 피해 · 방어 · 실드 · 회복은 그 카드를 낸 사도의 능력치로 셉니다 — 피해는 공격력, 방어 · 실드 · 회복은 방어력, 방어 기반 피해는 방어력 210% + 공격력 30%.",
    "쓰러지는 사도는 없습니다. 파티 HP 가 0 이 되면 그 싸움에서 지고 판이 끝납니다.",
    "사도마다 전열 · 중열 · 후열이 정해져 있습니다(원작 배치). 열은 누가 맞는지가 아니라 열이 주는 효과 · 조건(「후열에 서 있으면」 따위)에만 쓰입니다. 「모든 열」 사도(티그(영웅) · 죠안)는 편성에서 설 열을 고릅니다.",
  ])],
  ["AP", "AP 와 고학년 게이지", () => helpList([
    `AP 는 파티 공용입니다. 매 턴 ${RULES.AP_PER_TURN}, 남으면 사라집니다.`,
    `카드에 AP 를 1 쓸 때마다 고학년 게이지 +${RULES.GAUGE_PER_AP}%(최대 ${RULES.GAUGE_MAX}%). 0코 카드는 게이지를 채우지 않습니다.`,
    `고학년 스킬은 사도마다 고학년 게이지 ${RULES.ULT_COSTS.join(" · ")}% 가운데 하나를 씁니다. 사도의 둥근 얼굴 단추가 빛나면 쓸 수 있습니다.`,
    `손패는 ${RULES.HAND_MAX}장까지입니다.`,
  ])],
  // 카드 글의 낱말 — 밑줄 풀이(js/data/keywords.js)와 같은 말을 한 곳에 모은다
  ["낱말", "카드 글 읽기", () => helpList([
    "방어 — 이번 턴만 막아 주는 보호막입니다. 적의 차례까지 버티고 다음 내 턴이 오면 사라집니다. 실드 — 사라지지 않고 남는 보호막입니다. 맞으면 방어가 먼저, 그다음 실드가 깎입니다.",
    "「방어 150%」 · 「실드 300%」 · 「회복 210%」 의 % 는 방어력(능력치)에 곱합니다 — 회복도 방어력 기준입니다. 「방어력 +15%」 는 그 능력치를 올리는 것이라 방어와 다릅니다.",
    `「방어 기반 피해 150%」 — 방어력 ${Math.round(RULES.DEF_DMG.def * 100)}% + 공격력 ${Math.round(RULES.DEF_DMG.atk * 100)}% 를 바탕으로 150%. 「고정 피해」 · 「고정 실드」 는 상태(사기 · 취약 · 불굴 · 결의 · 손상 …)를 안 탑니다. 방어력은 받는 피해를 직접 깎지 않습니다.`,
    "상태의 숫자는 겹입니다 — 횟수 상태(취약 · 약화 …)는 한 번 돌 때마다 1 줄고, 세기 상태(사기 · 불굴 …)는 겹마다 세지고 줄지 않습니다. 턴이 지나도 안 줍니다. 「상태」 · 「파티」 도움말에 모두 있습니다.",
    "턴으로 가는 것은 길이가 끝에 붙습니다 — 「자신 도발 1턴」 · 「적 1명 침묵 2턴」. 「이번 턴」 은 적의 차례가 끝날 때까지 갑니다. 강화 카드의 「전투 내내」 는 그 전투가 끝날 때까지 갑니다.",
    "「2회 × 피해 40%」 는 한 번에 두 대, 「회복 40% 2번」 은 같은 효과를 따로 두 번 냅니다.",
    "패시브의 「카드를 N장 낼 때마다」 는 0코 카드를 세지 않습니다 — 고학년 게이지와 같습니다.",
    "「파티」 · 「아군 전원」 · 「자신」 — 어느 말이든 회복 · 방어 · 실드 · 파티 층 상태는 파티에 한 번입니다(HP 가 하나라). 사기만 가리킨 사도에게 붙습니다.",
    "「「케이크」 1개당 …」 은 쌓인 개수만큼 뒤의 효과를 냅니다.",
    "즉시 행동 — 적 머리 위 ⚡숫자만큼 파티가 카드를 내면 적이 예고한 수를 바로 합니다. 「즉시 행동 1장 늦춤」 은 그 셈을 1장 되돌립니다.",
    `디버프 해제 — ${RULES.BAD_ST.join(" · ")} 가운데 걸린 것을 차례로 지웁니다.`,
  ])],
  // 강인도 · 격파(카제나) — 수치는 rules.js TOUGH · STATUS_V
  ["격파", "강인도 · 격파", () => helpList([
    `적 체력 막대 밑의 칸이 강인도입니다(보통 ${RULES.TOUGH.fight} · 엘리트 ${RULES.TOUGH.elite} · 보스 ${RULES.TOUGH.boss}). 카드의 타격 한 번마다 ${RULES.TOUGH.hit}칸 깎습니다 — 여러 번 치는 카드는 그만큼 더 깎습니다.`,
    `적 이름 옆의 「약점」 성격이 약점입니다. 약점 성격 사도의 공격은 피해 +${Math.round(RULES.NATURE_DMG * 100)}%, 강인도를 타격마다 ${RULES.TOUGH.hit + RULES.TOUGH.weak}칸 깎습니다.`,
    `강인도가 0칸이 되면 격파 — 파티 AP +${RULES.TOUGH.ap}, 그 적은 다음 차례에 움직이지 못합니다. 다음 내 턴 시작에 강인도가 다 찹니다. 덜 깎인 칸은 그대로 남습니다. 격파만으로 받는 피해가 늘지는 않습니다.`,
    `카드 키워드 — 분쇄(방어 · 실드가 남은 적에게 피해 +${Math.round(RULES.STATUS_V.분쇄 * 100)}%) · 「파괴: …」(대상이 처치됐을 때만 도는 효과) · 약점(성격과 상관없이 약점 공격) · 「강인도 피해 N」(N칸 깎기).`,
    `격파와 엮인 상태 — 잔불(적에게 쌓는다: 격파된 그 적을 치거나 쓰러뜨리면 겹마다 피해 +${Math.round(RULES.STATUS_V.잔불 * 100)}%, 그때 다 사라진다 · 최대 ${RULES.STATUS_V.잔불Max}) · 잔광(파티에: 공격 카드 강인도 ${RULES.TOUGH.glow}칸 더 · 격파된 적에게 피해 +${Math.round(RULES.STATUS_V.잔광 * 100)}%, 공격 카드 한 장에 1 준다).`,
    ...(RULES.KILL_AP ? [`적을 쓰러뜨리면 파티 AP +${RULES.KILL_AP}.`] : []),
  ])],
  // 카제나 상태 — 숫자는 겹(rules.js STATUS_V · docs/16)
  ["상태", "상태 — 겹", () => {
    const V = RULES.STATUS_V, P = (x) => Math.round(x * 100);
    return helpList([
      "상태의 숫자는 겹입니다. 갈래가 넷 있습니다 — 횟수 · 세기 · 지속 피해 · 잔불(카제나 효과 사전 그대로).",
      `횟수(한 번 돌 때마다 1 줄어든다 · 카드 한 장 · 적의 수 하나가 한 번) — 취약(받는 피해 +${P(V.취약)}%) · 약화(주는 피해 -${P(V.약화)}%) · 손상(얻는 방어 · 실드 -${P(V.손상)}%) · 피해 감소(받는 피해 -${P(V["피해 감소"])}%) · 반격(적에게 맞으면 방어 기반 피해 ${P(V.반격)}%, 다 막으면 ${P(V.반격Full)}% · 치명 적용 · 최대 ${V.반격Max}) · 표식(공격 카드에 맞으면 덤 타격 ${P(V.표식)}% · 강인도 1칸) · 잔광(공격 카드 강인도 +1 · 격파된 적 피해 +${P(V.잔광)}%) · 면역(해로운 효과 하나를 막는다) · 실드 유지(턴이 바뀔 때 방어 ${P(V["실드 유지"])}% 를 남긴다) · 저장(남은 AP 를 다음 턴으로) · 협공(아군 공격 카드에 다른 아군이 공격력 ${P(V.협공)}% 로 함께 친다) · 충격(공격 카드의 대상이 되면 고정 피해 ${P(V.충격)}%, 방어 · 실드가 있으면 +${P(V.충격Shield)}%) · 충격파(카드에 맞으면 그 적을 뺀 적 전체에 고정 피해 ${P(V.충격파)}%) · 그을림(즉시 행동 셈이 1 오를 때마다 지속 피해 ${P(V.그을림)}%, 턴 끝에 사라진다).`,
      `세기(겹마다 효과가 더해지고, 줄지 않는다 — 전투 내내) — 사기(주는 피해 +${P(V.사기)}%) · 불굴(받는 피해 -${P(V.불굴)}%) · 결의(얻는 방어 · 실드 +${V.결의}) · 결정화(턴 끝에 방어력 ${P(V.결정화)}% 고정 실드) · 고동(턴 끝에 적 전체에 고정 피해 ${P(V.고동)}%). 사기 3 이면 주는 피해 +${P(3 * V.사기)}% 입니다.`,
      `세기의 상한 — 겹은 ${V.사기Max}까지 쌓입니다. 불굴은 겹이 더 있어도 받는 피해 -${P(V.불굴Cap)}% 까지만(${Math.round(V.불굴Cap / V.불굴)}겹 몫). 적은 세기 상태를 ${RULES.FOE_INT_MAX}겹까지만 쌓습니다.`,
      `지속 피해 — 고통(턴 끝에 겹의 ${P(V.고통)}% 고정 지속 피해, 그 뒤 절반 · 최대 ${V.고통Max}) · 균열(턴 끝에 겹마다 지속 피해 ${P(V.균열)}%, 그 뒤 절반 · 최대 ${V.균열Max}). % 는 건 사람의 공격력에 곱합니다. 지속 피해는 방어 · 실드를 뚫습니다.`,
      `잔불 — 적에게 쌓는 표식(최대 ${V.잔불Max}). 격파된 그 적을 치거나 쓰러뜨리면 겹마다 피해 +${P(V.잔불)}%, 그 자리에서 다 사라집니다.`,
      "칩의 숫자가 겹입니다. 기절 · 침묵 · 감전은 그대로 턴입니다(칩에 동그란 숫자).",
      "두 층 — 사기만 사도마다(초상 밑), 나머지는 파티에 하나(파티 막대 밑). 공격력 · 치명을 올리는 일은 사도 전용 키워드(고유 효과)가 합니다. 「파티」 도움말에 자세히 있습니다.",
    ]);
  }],
  ["카드 키워드", "카제나 카드 키워드", () => helpList([
    "연계 — 손에 있을 때 다른 사도의 카드를 내면 공짜로 저절로 나갑니다. 천상 — 손에 있을 때 코스트 2 이상인 카드를 내면 저절로 나갑니다. 저절로 나간 카드가 또 다른 카드를 깨울 수 있지만, 한 사슬은 세 겹까지입니다.",
    "신속 — 내도 적의 즉시 행동 셈(⚡)이 늘지 않습니다. 증발 — 턴이 끝날 때 손에 있으면 사라집니다. 유일 — 덱에 한 장만(강화 카드도 유일입니다).",
    "「연속: …」 — 이번 턴 바로 앞에 낸 카드가 같은 성격 사도의 것이면 뒤가 돕니다. 「영감: …」 — 카드 · 패시브의 효과로 뽑힐 때 뒤가 돕니다(턴 시작에 뽑는 것은 아닙니다 — 적이 끼워 넣은 상태 카드만 늘 돕니다).",
    "「조율: …」 — 이 카드의 코스트가 남은 AP 와 꼭 같을 때 뒤가 돕니다. 「안식: …」 — 카드 효과로 버려질 때 뒤가 돕니다.",
    "소멸 N — 이 전투에서 N 번 내면 사라집니다. 회수(N) — 내고 나면 버린 더미 대신 손으로 돌아옵니다(한 전투에 N 번). 연결 — 직접 내면 손의 다른 연결 카드를 모두 버립니다.",
    "개막 — 전투가 시작되면 AP 를 써서 저절로 나갑니다(모자라면 안 나갑니다). 연쇄 — 다음 턴 시작에 같은 효과가 한 번 더 돕니다. 봉인 — 처음 내면 효과 없이 봉인만 풀립니다. 금기 — 신탁 · 복제 · 상점 제거가 안 됩니다.",
    "상태 카드 — 적이 이 전투에만 끼워 넣는 방해 카드입니다. 덱에는 남지 않습니다. 저주(골칫거리)는 이벤트의 대가로 판의 덱에 남습니다.",
  ])],
  // 장수를 누구 것으로 세는지 — 패시브 글이 「에르핀의 …」 「파티가 …」 로 밝힌다(js/passive.js)
  ["패시브", "패시브 — 장수 세기", () => helpList([
    "「에르핀의 공격 카드를 3장 낼 때마다」 — 그 사도가 낸 카드만 셉니다. 다른 아군의 카드는 세지 않습니다. 센 장수는 전투 내내 이어집니다(「한 턴에」 가 붙으면 턴마다 0 부터).",
    "「공격 카드를 낼 때마다」 처럼 이름이 없으면 그 사도 자신의 카드입니다. 장비는 「자신의 …」 — 낀 사도의 카드를 셉니다.",
    "「파티가 이번 턴 카드를 3장째 낼 때」 · 「파티가 이번 턴 카드를 3장 이상 냈으면」 — 누가 냈든 파티 셋이 이번 턴 낸 카드를 함께 셉니다. 「아군이 … 낼 때마다」 도 누구든입니다.",
    "사도 정보 창의 패시브 줄에 지금 센 수가 붙습니다 — 「에르핀 공격 1/3」 은 에르핀 것만, 「파티 2장」 은 파티 전체입니다.",
  ])],
  ["신탁", "은총 · 신탁 · 겨우살이의 축복", () => helpList([
    "싸우다 보면 카드가 빛납니다. 빛나는 카드를 내면 세계수의 뜻이 내립니다.",
    "은총 — 사도의 기본 카드가 빛납니다. 내면 그 사도의 고유 카드 하나가 손패로 옵니다(그 턴 0코). 고르지 않습니다. 한 번 뺀 고유 카드는 다시 오지 않습니다.",
    "신탁 — 고유 카드 · 교주 카드가 빛납니다. 내면 그 카드의 신탁 다섯 가운데 셋이 뜨고 하나를 고릅니다(카드의 원래 효과도 곁에 보입니다). 카드가 바로 바뀌고 이번에 내는 것은 0코입니다.",
    `겨우살이의 축복 — 신탁 선택지 하나에 드물게(${Math.round(RULES.DIVINE * 100)}%) 붙는 덤입니다. 카드 종류마다 다른 열세 가지(피해 ×1.3 · 코스트 -1 · 드로우 · AP · 회복 · 방어 · 취약 · 중독 …).`,
    "사도마다 따로 굴립니다 — 한 전투에 여러 사도, 운이 좋으면 셋 모두 은총이 빛납니다. 교주 카드 신탁은 사도와 별개로 한 번 더 굴립니다.",
    `사도 한 명당 — 은총: 일반 ${Math.round(RULES.EPI_HERO.fight * 100)}% · 엘리트 ${Math.round(RULES.EPI_HERO.elite * 100)}% · 보스 ${Math.round(RULES.EPI_HERO.boss * 100)}% / 신탁: 일반 ${Math.round(RULES.EPI_CARD.fight * 100)}% · 엘리트 ${Math.round(RULES.EPI_CARD.elite * 100)}% · 보스 ${Math.round(RULES.EPI_CARD.boss * 100)}%. 일반 · 엘리트 · 보스 전투는 은총이, 엘리트는 신탁도 적어도 하나는 빛납니다.`,
  ])],
  ["드랍", "드랍과 상점", () => helpList([
    "보상 화면은 없습니다. 쓰러진 적이 골드를 떨구고, 가장 센 적이 장비를 떨굽니다. 이기면 그대로 챙깁니다.",
    `장비 — 일반 싸움 ${Math.round(RULES.DROP.fight.equip * 100)}% · 엘리트 · 보스는 늘(마지막 보스 빼고). 층이 오를수록 등급이 오릅니다. 같은 장비도 다시 떨어집니다 — 상점 · 이벤트도 마찬가지라 두 사도가 같은 것을 낄 수 있습니다.`,
    "교주 카드는 싸움에서 떨어지지 않습니다 — 골디의 상점과 이벤트에서만 얻습니다.",
    `골디의 상점(휴식+상점 칸) — 교주 카드 셋 · 장비 ${RULES.SHOP_EQUIP_N}점 · 새로고침 · 카드 제거. 고유 카드는 팔지 않습니다(은총으로만). 골디는 깎아 주지 않습니다.`,
  ])],
  ["장비", "장비", () => helpList([
    `사도마다 무기 · 방어구 · 장신구 한 칸씩입니다. 전투 밖이면 어디서든(지도의 「장비」 · 캠프 · 상점) 끼고 빼고 바꿔 낍니다. 가방의 장비는 사는 값의 ${Math.round(RULES.EQUIP_SELL * 100)}% 에 팔 수 있습니다.`,
    "스탯 줄은 사도 스탯에 그대로 더합니다. 효과 줄은 낀 사도의 패시브가 됩니다.",
    "회복은 방어력 기준입니다 — 장비의 「방어력 +N」 은 방어 · 실드에 더해 회복 카드 · 패시브의 「HP 회복(방어력 N%)」 도 키웁니다.",
    "이름에 사도가 붙은 장비는 그 사도가 끼면 애착 줄과 작은 스탯이 더 붙습니다.",
    "등급 — 일반 · 고급 · 희귀 · 전설. 일반 몇 종은 스탯뿐입니다.",
  ])],
  ["지도", "지도", () => helpList([
    `한 층은 ${M.ROWS}칸 길입니다. 출발에서 오른쪽으로 가며 이어진 칸을 골라 들어갑니다. 끝은 보스, 그 앞은 늘 휴식+상점입니다.`,
    `칸 — ${["fight", "elite", "camp", "campshop", "event", "boss"].map((k) => M.KIND_KO[k]).join(", ")}.`,
    `엘리트는 한 단계 센 적(체력 ×${RULES.ELITE_HP})이고, 이기면 장비가 늘 떨어지고 신탁이 늘 뜹니다.`,
    `층이 오를수록 적의 체력과 피해가 커집니다(층마다 배율 — 적 위의 숫자는 이미 곱한 값입니다).`,
    `파티 HP 는 싸움이 끝나도 그대로 이어집니다. 0 이 되면 판이 끝납니다. 휴식 칸에서 쉬면 파티 최대 HP 의 ${Math.round(RULES.CAMP_HEAL * 100)}% 가 찹니다.`,
    "휴식 칸에서는 쉬거나(파티 HP 회복) 수련합니다. 처음 고른 셋으로 끝까지 갑니다 — 층을 넘어도 사도는 바뀌지 않습니다. 고학년 게이지는 전투가 끝나도 남은 만큼 다음 전투로 이어집니다.",
  ])],
];
function helpList(lines) {
  const ul = el("ul", "helplist");
  for (const t of lines) ul.appendChild(el("li", null, t));
  return ul;
}
// 도움말을 연다. key 로 그 갈피를 먼저 편다(예: "상성"). 바깥 · Esc · 닫기로 닫는다
export function openHelp(key = "상성") {
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const back = el("div", "helpmodal");
  const box = el("div", "helpbox");
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) { back.remove(); kwNote = null; } };
  const head = el("div", "helphead");
  head.appendChild(el("b", null, "도움말"));
  const x = el("button", "kwclose", "닫기");
  x.onclick = () => { back.remove(); kwNote = null; };
  head.appendChild(x);
  box.appendChild(head);
  const wrap = el("div", "helpwrap");
  const tabs = el("div", "helptabs");
  const page = el("div", "helppage");
  wrap.appendChild(tabs); wrap.appendChild(page);
  box.appendChild(wrap);
  const show = (k) => {
    tabs.innerHTML = ""; page.innerHTML = "";
    for (const [id, title] of HELP) {
      const t = el("button", "helptab" + (id === k ? " on" : ""), title);
      t.onclick = () => show(id);
      tabs.appendChild(t);
    }
    const [, title, make] = HELP.find((h) => h[0] === k) || HELP[0];
    page.appendChild(el("h3", null, title));
    page.appendChild(make());
  };
  show(key);
  document.body.appendChild(back);
  kwNote = back;
}

// 전체화면 단추 — 사이트 머리 줄(전체화면 단추가 있는 곳)을 숨기는 화면들(편성 · 도감 · 상점 · 캠프 · 지도)의 머리에 단다
export function fsButton(cls = "") {
  const b = el("button", "fsmini" + (cls ? " " + cls : ""), "⛶");
  b.title = "전체화면";
  b.onclick = (e) => { e.stopPropagation(); toggleFullscreen(); };
  return b;
}

export function img(src, cls) {
  const n = el("img", cls);
  n.src = src; n.loading = "lazy"; n.alt = "";
  n.onerror = () => n.remove();
  return n;
}

// 글을 넣되 아는 낱말에는 밑줄을 긋고 풀이를 매단다.
// 짚으면 title 로, 누르면 풀이 쪽지로 뜬다 — 손가락으로도 볼 수 있어야 한다.
export function withKeywords(node, text, heroKey) {
  for (const part of splitKeywords(text, heroKey)) {
    if (!part.kw) { node.appendChild(document.createTextNode(part.t)); continue; }
    const b = el("button", "kw" + (part.kw.text ? "" : " nodef"), part.t);
    b.title = part.kw.text || `${part.kw.ko} — 기획서에 이름만 있고 풀이가 아직 없습니다`;
    b.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); showKeyword(part.kw); };
    node.appendChild(b);
  }
  return node;
}

// 카드 글 — 전투 중이면 수치 조각(「피해 100%」)을 실제 숫자로: 「피해 14」 크게 · 「100%」 작게, 여러 번은 「6×4」.
// calc(kind, ratio) → 숫자(낸 사도의 지금 능력치 · fight-screen cardCalc). 없으면(싸움 밖 · 교주 카드) % 그대로
export function withNumbers(node, text, heroKey, calc) {
  if (!calc) return withKeywords(node, text, heroKey);
  for (const p of numParts(text)) {
    if (!p.kind) { withKeywords(node, p.t, heroKey); continue; }
    const v = calc(p.kind, p.pct / 100);
    if (v == null) { withKeywords(node, p.t, heroKey); continue; }
    const n = el("span", "cnum n-" + p.kind);
    if (p.label) withKeywords(n, p.label + " ", heroKey);
    n.appendChild(el("b", "cnv", p.hits ? `${v}×${p.hits}` : String(v)));
    n.appendChild(el("small", "cnp", `${p.pct}%`));
    n.title = `${p.t} — 지금 능력치로 센 값(맞는 쪽의 취약 · 상성은 빼고)`;
    node.appendChild(n);
  }
  return node;
}

// 풀이 쪽지. 한 번에 하나만 뜬다.
function showKeyword(kw) {
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const n = el("div", "kwnote");
  const head = el("div", "kwhead");
  head.appendChild(el("b", null, kw.ko));
  head.appendChild(el("span", "kwkind", kw.kind || ""));
  n.appendChild(head);
  if (kw.kind === "전용" && kw.text) n.appendChild(kwText(el("div", "kwbody"), kw.text));
  else n.appendChild(el("p", null, kw.text || "기획서에 이름만 있고 풀이가 아직 없습니다."));
  const x = el("button", "kwclose", "닫기");
  x.onclick = () => { n.remove(); kwNote = null; };
  n.appendChild(x);
  document.body.appendChild(n);
  kwNote = n;
}

// 사도 전용 키워드 풀이 — 소개 한 줄(흐리게) + 규칙 줄(최대 · 1개당 · 다 차면). card-text keywordLines
export function kwText(node, text) {
  const { flavor, rules } = keywordLines(text);
  if (flavor) node.appendChild(el("p", "kwflav", flavor));
  if (rules.length) {
    const ul = el("ul", "kwrules");
    for (const r of rules) ul.appendChild(el("li", null, r));
    node.appendChild(ul);
  }
  return node;
}

// 카드 한 장을 펼친 쪽지 — 하는 일 한 줄과 그 아래 낱말 풀이.
export function showCard(c, heroKey) {
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const { action, terms } = cardParts(c, heroKey);
  const n = el("div", "kwnote cardnote");
  const head = el("div", "kwhead");
  head.appendChild(el("span", "kwcost", c.xcost ? "X" : String(c.cost)));
  head.appendChild(el("b", null, c.name));
  head.appendChild(el("span", "kwkind", c.type));
  n.appendChild(head);
  n.appendChild(withKeywords(el("p", "cardact"), action, heroKey));
  if (terms.length) {
    const box = el("dl", "terms");
    for (const t of terms) {
      box.appendChild(el("dt", "t" + (t.kind === "이 카드" ? " here" : ""), t.ko));
      box.appendChild(t.kind === "전용" && t.text ? kwText(el("dd"), t.text) : el("dd", null, t.text || "기획서에 이름만 있고 풀이가 아직 없습니다."));
    }
    n.appendChild(box);
  }
  const x = el("button", "kwclose", "닫기");
  x.onclick = () => { n.remove(); kwNote = null; };
  n.appendChild(x);
  document.body.appendChild(n);
  kwNote = n;
}

// 더미를 열어 본다 — 이름만 늘어놓으면 무엇을 하는 카드인지 모른다(실제로 그런 말을 들었다).
// 손패와 같은 카드 꼴로 펼치고, 뽑을 더미 · 버린 더미 · 사라진 카드 · 덱 전체를 오간다.
// piles: [{ key, label, ids, why }] · pick: 처음 열 칸 · cardFor: id → 이 판에서의 카드(신탁 반영)
// onDetail: id → 카드를 누르면 가운데에 자세히(전투의 카드 창). 없으면 보기만 한다
// numFor: id → 그 카드의 수치 셈(전투 중만, bigCard calc)
export function showPiles(piles, pick, cardFor, onDetail, numFor) {
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const back = el("div", "pilemodal");
  const box = el("div", "pilebox");
  back.appendChild(box);
  back.onclick = (e) => { if (e && e.target === back) close(); };
  const close = () => { back.remove(); kwNote = null; };

  const head = el("div", "pilehead");
  const tabs = el("div", "piletabs");
  head.appendChild(tabs);
  const x = el("button", "kwclose", "닫기");
  x.onclick = close;
  head.appendChild(x);
  box.appendChild(head);
  const why = el("p", "pwhy");
  box.appendChild(why);
  const grid = el("div", "pilegrid");
  box.appendChild(grid);

  let cur = pick;
  function draw() {
    tabs.innerHTML = "";
    for (const pl of piles) {
      const t = el("button", "ptab" + (pl.key === cur ? " on" : ""));
      t.appendChild(el("span", null, pl.label));
      t.appendChild(el("b", null, String(pl.ids.length)));
      t.onclick = () => { cur = pl.key; draw(); };
      tabs.appendChild(t);
    }
    const pl = piles.find((q) => q.key === cur) || piles[0];
    why.textContent = pl.why || "";
    grid.innerHTML = "";
    // 같은 카드는 한 장으로 묶고 ×n 을 붙인다. id 가 달라도(마력탄 두 장) 글이 같으면 같은 카드다.
    const bag = new Map();
    const first = new Map();
    for (const id of pl.ids) {
      const c = cardFor(id) || {};
      const sig = [c.hero, c.name, c.cost, c.text].join("|");
      if (!first.has(sig)) first.set(sig, id);
      const rep = first.get(sig);
      bag.set(rep, (bag.get(rep) || 0) + 1);
    }
    // 사도별로 묶는다 — 사도는 덱에 처음 나온 차례(파티 차례), 그 안에서 기본 카드 → 고유 카드, 코스트 · 이름 순.
    // 주인 없는 카드(교주 · 골칫거리)는 맨 뒤(2026-10 사용자: 「사도별로, 기본 카드 고유 카드 순으로」)
    const heroAt = new Map();
    for (const id of pl.ids) { const h = (cardFor(id) || {}).hero || ""; if (!heroAt.has(h)) heroAt.set(h, h ? heroAt.size : 999); }
    const order = [...bag.keys()].sort((a, b) => {
      const ca = cardFor(a) || {}, cb = cardFor(b) || {};
      return (heroAt.get(ca.hero || "") - heroAt.get(cb.hero || "")) || (!!ca.unique - !!cb.unique)
        || (ca.cost || 0) - (cb.cost || 0) || String(ca.name).localeCompare(String(cb.name));
    });
    let secHero = null;
    for (const id of order) {
      const c = cardFor(id);
      if (!c) continue;
      const h = c.hero || "";
      if (h !== secHero) {
        secHero = h;
        const n = pl.ids.filter((x) => ((cardFor(x) || {}).hero || "") === h).length;
        const sec = el("div", "pilesec");
        if (h) {
          sec.appendChild(art.portrait(h, { ko: HERO(h).ko, tint: TINT(h), size: 28, slot: "battle", still: true }));
          sec.appendChild(el("b", null, HERO(h).ko));
        } else sec.appendChild(el("b", null, "교주 카드 · 그 밖"));
        sec.appendChild(el("span", "psn", `${n}장`));
        grid.appendChild(sec);
      }
      const cell = el("div", "pilecell");
      const who = el("div", "rwho");
      who.appendChild(el("b", null, !h ? (c.type || "카드") : c.unique ? "고유 카드" : "기본 카드"));
      if (bag.get(id) > 1) who.appendChild(el("span", "pn", `×${bag.get(id)}`));
      cell.appendChild(who);
      const card = bigCard(c, CARDART.pic[id] || null, numFor ? numFor(id) : null);
      card.onclick = onDetail ? () => onDetail(id) : null;   // 누르면 자세히 — 더미 창 위에 뜬다
      card.title = onDetail ? "눌러서 자세히 보기" : "";
      if (onDetail) card.classList.add("canzoom");
      if (c.flashOn) card.appendChild(el("span", "pflash", c.flashKind || c.flashKo || "신탁"));
      cell.appendChild(card);
      // 카드에는 줄여서 앉혔으니, 아래에 전문을 붙인다
      cell.appendChild(withKeywords(el("p", "pfull"), c.text, c.hero));
      grid.appendChild(cell);
    }
    if (!pl.ids.length) grid.appendChild(el("p", "pwhy", "비어 있습니다."));
  }
  draw();
  document.body.appendChild(back);
  kwNote = back;
}

// 사도 카드는 그 사도의 성격(순수·광기·냉정·우울·활발) 색을 입는다 — 속성이 카드 색으로 읽힌다.
// 주인 없는 카드(교주·골칫거리)는 종류(공격·방어…) 색 그대로.
export function natureClass(c) {
  const nat = c && c.hero ? C.natureOf(c.hero) : null;
  return nat ? " p-" + nat : "";
}

// 신탁을 고를 때 견줄 카드의 효과 — 「원래 효과」(아직 신탁이 없다) · 「지금」(이미 붙은 신탁을 바꾼다).
// 카드 그림 위 글은 작아서, 고르는 창마다 같은 상자로 한 번 더 읽히게 한다(전투 · 이벤트 · 캠프 · 보상)
export function effectBox(c, label, head) {
  const box = el("div", "fbase");
  const top = el("span", "fbaselab", label);
  if (head) top.appendChild(el("em", null, head));
  box.appendChild(top);
  box.appendChild(withKeywords(el("p", "fbasetext"), shortText(c.text), c.hero));
  return box;
}

// 한 장의 카드. 도감 상세에서도 쓰고, 나중에 다른 곳에서도 쓸 수 있게 여기 한 번만 쓴다.
// calc — 전투 중이면 수치를 실제 숫자로(withNumbers). 싸움 밖(도감 · 덱 · 보상)은 넘기지 않는다 — % 그대로
export function bigCard(c, pic, calc) {
  // 우리가 그린 일러스트는 카드를 꽉 채우고, 글자가 그 위에 얹힌다.
  // 원작에서 꺼낸 스킬 아이콘은 128px 라 늘리면 뭉개진다 — 가운데에 작게 둔다.
  const full = !!pic && pic.includes("/cardart/");
  const n = el("article", "gcard k-" + (TKIND[c.type] || "skill") + natureClass(c) + (full ? " full" : ""));
  const head = el("div", "ghead");
  head.appendChild(el("span", "gcost", c.xcost ? "X" : String(c.cost)));
  const t = el("div", "gtitle");
  t.appendChild(el("b", null, c.name));
  const ty = el("span", "gtype");
  ty.appendChild(el("i", null, TMARK[c.type] || "◈"));
  ty.appendChild(el("span", null, c.type));
  t.appendChild(ty);
  head.appendChild(t);
  n.appendChild(head);

  const artBox = el("div", "gart");
  if (pic) artBox.appendChild(img(pic, "gpic"));
  // 그린 것이 없으면 그 사도의 인게임 그림을 깐다. 무늬만 있는 것보다 낫다 —
  // 어차피 그 사도의 카드라, 누구 카드인지도 같이 읽힌다.
  else if (c.hero) { artBox.classList.add("heroart"); artBox.appendChild(art.portrait(c.hero, { ko: "", slot: "battle", still: true, size: 0 })); }
  else artBox.appendChild(el("span", "gglyph", TMARK[c.type] || "◈"));
  n.appendChild(artBox);

  const body = el("p", "gtext");
  withNumbers(body, cardParts(c, c.hero).action, c.hero, calc);
  n.appendChild(body);
  n.onclick = () => showCard(c, c.hero);
  n.title = "눌러서 낱말 풀이 보기";
  return n;
}

// 화면 뒤에 그 싸움의 배경을 깐다 — 전투와, 이긴 뒤의 보상 화면이 같은 그림을 쓴다.
// 변수에 담긴 url() 은 그 변수를 쓰는 css 파일 기준으로 풀린다 — 그래서 문서 기준 절대 주소로 넘긴다
export function setStageBg(s, run) {
  const floor = R.currentFloor(run);
  const bg = BATTLE_BG[floor.n] || BATTLE_BG[1];
  const bgFile = `assets/bg/${run.eventFight ? bg.event : R.isBoss(run) ? bg.boss : bg.fight}.jpg`;
  s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bgFile, location.href).href : bgFile}")`);
}

// 싸움터 배경 — assets/bg (tools/extract-bg.py 가 게임에서 뽑은 16:9 그림)
// 에르피엔은 숲속 버섯 마을, 모나티엄은 엘프 도시, 벨리티엔은 마녀 왕국의 보랏빛 숲
export const BATTLE_BG = {
  1: { fight: "stage3_2", boss: "stage3_3", event: "stage2_1" },
  2: { fight: "stage8_1", boss: "stage9_1", event: "stage4_1" },
  3: { fight: "stage23_1", boss: "stage25_1", event: "stage16_1" },
};

// ── 장비 ────────────────────────────────────────────────────────────────
// 칸은 사도당 무기·방어구·장신구. 기획서: 얻는 곳은 보상·상점·이벤트, **바꿔 끼기는 휴식 노드(캠프)에서.**
//   mode "empty" — 보상·상점: 가방의 장비를 **빈 칸에만** 끼운다
//   mode "camp"  — 캠프: 바꿔 끼고 뺄 수 있다
// 지금 도는 것은 스탯 줄과 애착 Lv.3 스탯뿐이다. 효과 줄은 글만 보여 주고 「아직 안 돈다」고 적는다.
const STAT_KO = { hp: "HP", atk: "공격력", def: "방어력", crit: "치명" };
export const statText = (st) => Object.entries(st || {}).filter(([, v]) => v).map(([k, v]) => `${STAT_KO[k]} +${v}${k === "crit" ? "%" : ""}`).join(" · ");

// ── 장비 아이콘 ─────────────────────────────────────────────────────────
// 장비 그림은 게임에서 꺼낸 것이 없다(장비는 기획서가 지은 것이다). 이름에서 종류를 읽어 그린다 —
// 지팡이 · 검 · 활 · 낫 · 주먹 · 총 / 모자 · 로브 · 갑옷 · 장갑 / 반지 · 왕관 · 책 · 병 · 보석.
// 테두리는 등급 색, 애착 장비는 그 사도의 얼굴이 모서리에 붙는다.
const GEAR_GLYPH = {
  staff: '<path d="M17 2.5a4 4 0 0 1 2.8 6.8L18 11l-1.6-1.6L7 18.8l-.6 2.6-2.4.6-.9-.9.6-2.4 2.6-.6 9.4-9.4L14.1 7l1.7-1.8A4 4 0 0 1 17 2.5z"/><circle cx="17.3" cy="6.6" r="1.7" fill="#fffc"/>',
  sword: '<path d="M20 3v3.5L9.5 17 12 19.5 10.5 21 8 18.5 5.5 21 3 18.5 5.5 16 3 13.5 4.5 12 7 14.5 17.5 4H20z"/>',
  dagger: '<path d="M19 4l-1 4-8 8-2-2 8-8 3-2zM7.5 14.5l2 2-1.5 1.5 1 1-1.5 1.5-1-1L4 22l-2-2 2.5-2.5-1-1L5 15l1 1 1.5-1.5z"/>',
  bow: '<path d="M5 3c7 1.5 14.5 9 16 16l-2 .5C17.8 13.4 10.6 6.2 4.5 5L5 3zM4 20L18 6l1.5-1.5L21 3l-.5 3.5L19 8 5 22z"/>',
  scythe: '<path d="M3 21L14 10l1.4 1.4L4.4 22.4zM13 4c4-2 9-1 9 1-3-1-6-.5-8 1.5l-2.5 2.5L10 7.5z"/>',
  fist: '<path d="M7 9V6a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v.5a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7h-1c-3.5 0-6-2.5-6-6v-3a1.5 1.5 0 0 1 2-1.4z"/>',
  gun: '<path d="M3 8h16l2 2v3h-5l-1 2h-3l-1 3H7l1-4H3z"/>',
  hat: '<path d="M8 4h8l1 9h3v3H4v-3h3z"/><rect x="7" y="10" width="10" height="2" fill="#0005"/>',
  robe: '<path d="M8 3l4 3 4-3 5 4-3 3v11H6V10L3 7z"/>',
  armor: '<path d="M12 2l8 3v6c0 5.5-3.4 9.3-8 11-4.6-1.7-8-5.5-8-11V5z"/><path d="M12 5v14" stroke="#0005" stroke-width="1.6"/>',
  glove: '<path d="M6 11V6a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v5-3a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6-6 6h-2c-3 0-5-2-5-5v-3a1.5 1.5 0 0 1 1-1.4z"/>',
  ring: '<circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M9 4h6l2 3-5 4-5-4z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  book: '<path d="M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3z"/><path d="M8 18h11" stroke="#0005" stroke-width="1.6"/>',
  potion: '<path d="M9 2h6v2h-1v4.5l5 7.5a4 4 0 0 1-3.4 6H8.4A4 4 0 0 1 5 16l5-7.5V4H9z"/><path d="M7 15h10" stroke="#fff6" stroke-width="1.6"/>',
  gem: '<path d="M7 3h10l4 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 6 3-6M12 9v12" stroke="#0004" stroke-width="1.2"/>',
};
const GEAR_WORDS = [
  [/지팡이|요술봉|깃발|가지/, "staff"], [/대검|검|칼|커터/, "sword"], [/비수|단검|단도|송곳|수리검/, "dagger"], [/활|화살|바람살/, "bow"],
  [/낫/, "scythe"], [/글러브|케틀벨|메이스|뽀개기/, "fist"], [/물총|건$/, "gun"],
  [/모자|페도라|감투|머리띠/, "hat"], [/망토|로브|미라주|간호복|보자기/, "robe"], [/건틀릿|장갑|골무/, "glove"], [/갑옷|조끼|견갑|벨트|쿠션/, "armor"],
  [/반지|팔찌/, "ring"], [/왕관|티아라|머리핀/, "crown"], [/비급|교본|지침서|기록서|마법서|카드|액자|패드|E-Pad/, "book"],
  [/물약|주스|성배|향로|램프|호롱불|머핀/, "potion"],
];
function gearKind(e) {
  for (const [re, k] of GEAR_WORDS) if (re.test(e.ko)) return k;
  return e.slot === "무기" ? "sword" : e.slot === "방어구" ? "armor" : "gem";
}
export const GRADE_COLOR = { 전설: "#f0b94a", 희귀: "#9a7cf0", 고급: "#4fc08a", 일반: "#a8adbf" };
export function equipIcon(e, size = 48) {
  const n = el("span", "eicon g-" + (e ? e.grade : "none"));
  n.style.width = n.style.height = size + "px";
  if (!e) return n;
  n.style.setProperty("--gc", GRADE_COLOR[e.grade] || "#a8adbf");
  const gp = CARDART.pic[e.id];
  if (gp) { n.classList.add("haspic"); n.appendChild(img(gp)); }
  else n.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${GEAR_GLYPH[gearKind(e)]}</svg>`;
  if (e.affinity) {
    const pic = CARDART.pic[e.affinity + "_ult"];
    if (pic) { const f = el("span", "eaffface"); f.appendChild(img(pic)); f.title = `${e.affinityKo} 애착`; n.appendChild(f); }
  }
  n.title = `${e.ko} · ${e.slot} · ${e.grade}${statText(e.stats) ? `\n${statText(e.stats)}` : ""} — 누르면 자세히`;
  return n;
}
// 빈 칸 — 그 칸의 모양만 흐리게
const SLOT_GLYPH = { 무기: "sword", 방어구: "armor", 장신구: "gem" };
export function emptySlotIcon(slot, size = 48) {
  const n = el("span", "eicon empty");
  n.style.width = n.style.height = size + "px";
  n.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${GEAR_GLYPH[SLOT_GLYPH[slot] || "gem"]}</svg>`;
  return n;
}

export function equipCard(id, extra) {
  const e = EQUIP[id];
  const n = el("div", "ecard g-" + e.grade);
  const head = el("div", "ehead");
  head.appendChild(equipIcon(e, 44));
  head.appendChild(el("span", "eslot", e.slot));
  head.appendChild(el("b", null, e.ko));
  head.appendChild(el("span", "egrade", e.grade));
  n.appendChild(head);
  n.appendChild(el("p", "eqstat", statText(e.stats) || "스탯 없음"));
  if (e.effect) n.appendChild(effLine(e, "효과", e.effect, e.effectRead));
  if (e.affinityKo) {
    n.appendChild(el("p", "eaff", `애착: ${e.affinityKo}${e.affinityLv3 ? ` — 끼면 ${statText(e.affinityLv3)} 더` : ""}`));
    if (e.affinityPassive) n.appendChild(effLine(e, `애착 · ${e.affinityKo}`, e.affinityPassive, e.affinityRead));
  }
  if (e.blurb) n.appendChild(el("p", "eblurb", e.blurb));
  if (extra) n.appendChild(extra);
  return n;
}
// 효과 · 애착은 낀 사도의 패시브가 된다(docs/13-장비와 중립.md). 다 읽히지 않는 줄은 「아직 안 돕니다」로 흐리게
function effLine(e, label, text, on) {
  const p = el("p", "eeff" + (on ? " on" : ""));
  p.appendChild(el("span", "eoff", on ? label : `${label} · 아직 안 돕니다`));
  p.appendChild(withKeywords(el("span"), " " + shortText(String(text).replace(/\s*\[[^\]]+\]/g, "")), e.affinity || null));
  return p;
}

// ── 장비 자세히 ─────────────────────────────────────────────────────────
// 장비 아이콘 · 장비 칸은 어디서든 누르면 이 창이 뜬다(지도 · 캠프 · 상점 · 보상 · 전투). 휴대폰은 마우스 올리기가 없다.
// 가운데 창(.bmodal 80) 위에 뜬다 — 장비 창 안에서 눌러도 뒤에 숨지 않게. 한 번에 하나, 바깥 · Esc · 닫기로 닫는다.
// heroKey: 낀(낄) 사도 — 그 사도 기준 스탯 · 애착. note: 한 줄 덧말. acts: [{ label, cls, run }] — 누르면 창을 닫고 run()
let eqPop = null;
export function closeEqPop() { if (eqPop) { eqPop.remove(); eqPop = null; } }
if (typeof document === "object" && document.addEventListener) {
  // 잡는 쪽(capture)에서 먼저 — 밑의 창(지도 장비 창 · 캠프 · 상점 시트)까지 Esc 로 같이 닫히지 않게
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && eqPop) { closeEqPop(); e.stopPropagation(); } }, true);
}
function popBox(cls) {
  closeEqPop();
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const back = el("div", "bmodal eqpop " + cls);
  const box = el("div", "bmbox");
  box.setAttribute("role", "dialog");
  back.appendChild(box);
  back.onclick = (ev) => { if (ev.target === back) closeEqPop(); };
  document.body.appendChild(back);
  eqPop = back;
  return box;
}
const STAT_FULL = { atk: "공격력", def: "방어력", hp: "HP", crit: "치명" };
export function showEquip(id, { heroKey = null, note = "", acts = [] } = {}) {
  const e = EQUIP[id];
  if (!e) return;
  const box = popBox("eqdetail g-" + e.grade);
  const face = el("div", "eqface");
  face.appendChild(equipIcon(e, 104));
  box.appendChild(face);
  const body = el("div", "bmbody");
  body.appendChild(el("span", "bmkind", `${e.slot} · ${e.grade}${e.affinityKo ? ` · 애착 ${e.affinityKo}` : ""}`));
  body.appendChild(el("h3", "bmname", e.ko));
  // 스탯 — 낀 사도가 있으면 그 사도 기준(애착이면 Lv.3 스탯까지 더해서)
  const st = heroKey ? R.statsOf(id, heroKey) : { hp: 0, atk: 0, def: 0, crit: 0, ...e.stats };
  const dl = el("dl", "bmterms eqstats");
  for (const k of ["atk", "def", "hp", "crit"]) {
    if (!st[k]) continue;
    dl.appendChild(el("dt", null, STAT_FULL[k]));
    // 방어는 방어 · 실드 · 치유(v6 — 치유도 방어력)에 붙는다
    dl.appendChild(el("dd", null, `+${st[k]}${k === "crit" ? "%" : ""}`));
  }
  if (!dl.children.length) { dl.appendChild(el("dt", null, "스탯")); dl.appendChild(el("dd", null, "없음")); }
  body.appendChild(dl);
  if (heroKey) body.appendChild(el("p", "eqwho", `${HERO(heroKey).ko || heroKey} 기준${e.affinity === heroKey ? " — 애착 보너스 포함" : ""}`));
  if (e.effect) body.appendChild(effLine(e, "효과", e.effect, e.effectRead));
  if (e.affinityKo) {
    const on = !!heroKey && e.affinity === heroKey;
    body.appendChild(el("p", "eaff" + (on ? " on" : ""), `애착 ${e.affinityKo}${e.affinityLv3 ? ` — ${이가(e.affinityKo)} 끼면 ${statText(e.affinityLv3)} 더` : ""}${on ? " · 받는 중" : ""}`));
    if (e.affinityPassive) body.appendChild(effLine(e, `애착 · ${e.affinityKo}`, e.affinityPassive, e.affinityRead));
  }
  if (e.blurb) body.appendChild(el("p", "eblurb", e.blurb));
  body.appendChild(goldLabel("p", "eqsell", `팔면 +${R.sellPrice(id)} 골드`));
  if (note) body.appendChild(el("p", "eqnote", note));
  const row = el("div", "bmbtns");
  for (const a of acts) {
    const b = el("button", a.cls || "bmuse", a.label);
    b.onclick = () => { closeEqPop(); a.run(); };
    row.appendChild(b);
  }
  const x = el("button", "bmclose", "닫기");
  x.onclick = closeEqPop;
  row.appendChild(x);
  body.appendChild(row);
  box.appendChild(body);
}
// 묻고 한다 — 되돌릴 수 없는 일(장비 바꿔 끼기 = 옛 장비 팔기). 장비 자세히와 같은 자리에 뜬다
export function confirmPop({ title, text, ok, onOk }) {
  const box = popBox("eqconfirm");
  const body = el("div", "bmbody");
  body.appendChild(el("h3", "bmname", title));
  body.appendChild(el("p", "bmtext", text));
  const row = el("div", "bmbtns");
  const y = el("button", "bmuse", ok);
  y.onclick = () => { closeEqPop(); onOk(); };
  const x = el("button", "bmclose", "그만둡니다");
  x.onclick = closeEqPop;
  row.appendChild(y); row.appendChild(x);
  body.appendChild(row);
  box.appendChild(body);
}
