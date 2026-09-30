// 화면. 규칙은 combat.js 가 쥐고 있고, 여기는 그리고 누른 것을 넘긴다.
import { HEROES, ROSTER } from "./data/heroes.js";
import { CARDS, flashed } from "./cardbook.js";
import { TRAITS } from "./data/traits.js";
import { ENEMIES, FLOORS } from "./data/enemies.js";
import { HERO_DATA, kitOf, EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { shortText, splitKeywords, cardParts, polite } from "./card-text.js";

// 사도 정보는 기획서가 원본이다. 빛깔만 옛 heroes.js 가 들고 있다.
const HERO = (k) => HERO_DATA[k] || HEROES[k] || { ko: k, row: "mid", nature: null };
const TINT = (k) => (HEROES[k] || {}).tint || "#8a8a9a";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import { spineView } from "./spine-view.js";
import * as M from "./map.js";
import { getZoom, toggleFullscreen } from "./stage.js";
import { getSettings, setSetting } from "./settings.js";
import { settingsPanel } from "./settings-panel.js";
import { speak } from "./voice.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
// 위치 — 기획서 낱말이다. 기본 스탯 표 머리가 "위치 · 역할" 이다.
const ROW_KO = { front: "전열", mid: "중열", back: "후열" };

let kwNote = null;                 // 낱말 풀이 쪽지 — 한 번에 하나만 뜬다
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
function screen() {
  // 화면이 바뀌면 아래 안내도 지운다 — 전투에서 뜬 「도울 아군을 고릅니다」 가
  // 끝 화면까지 따라와 있었다.
  hint("");
  // 낱말 쪽지도 같이 접는다 — 몸통에 붙어 있어서 저 혼자 남는다
  if (kwNote) { kwNote.remove(); kwNote = null; }
  const s = $("#screen"); s.innerHTML = ""; s.className = ""; return s;
}

// ── 편성 ───────────────────────────────────────────────────────────────
// 카제나의 「요원 도감 → 상세 정보」 얼개다.
//   도감   왼쪽 종족 레일 · 초상 격자(이격까지 135명) · 위에 정렬 · 아래 고른 셋
//   정보   왼쪽 갈피(능력치·카드·신탁·고학년 스킬) · 오른쪽 내용
// 카드는 실제 카드 꼴로 세워 그린다 — 코스트·이름·타입·그림·효과·태그.
// 그림은 꺼내 둔 스킬 아이콘을 쓴다(고학년 스킬=졸업, 시그니처=입학, 나머지=어사이드).

const NATURES = ["순수", "광기", "냉정", "우울", "활발", "공명"];
const ROWS_KO = { front: "전열", mid: "중열", back: "후열" };
// 명단 · 도감에 적는 자리 — 「모든 열」 사도는 그렇게 적는다
const rowLabel = (h) => (h && h.anyRow ? "모든 열" : ROWS_KO[h && h.row] || "");
const ROLES = ["탱커", "딜러", "서포터"];
const NTINT = { 순수: "#7fd3a8", 광기: "#d9737f", 냉정: "#7fd6f5", 우울: "#9a8cc0", 활발: "#f5dc5a", 공명: "#c9c9d6" };
// 카드 타입 — 원작 도감처럼 한 글자 표시와 빛깔을 준다
const TMARK = { 공격: "✕", 스킬: "◈", 방어: "⬢", 쉴드: "⬢", 회복: "✚", 강화: "▲", 기술: "◆" };
const TKIND = { 공격: "atk", 스킬: "skill", 방어: "def", 쉴드: "def", 회복: "heal", 강화: "buff", 기술: "skill" };

const isEcho = (k) => k.includes("_");            // 이격 — 에르핀_왕도
const baseName = (k) => k.split("_")[0];

// 원작에서 꺼낸 작은 표들 — assets/uiicons/성격_순수.png 꼴이다.
// 그림이 없으면 글자 한 자로 떨어진다. 꺼낸 것이 없어도 화면은 그대로 돈다.
//
// 그림을 먼저 붙이고, 안 되면 글자로 되돌린다. 반대로 하면 안 된다 —
// 문서에 안 붙은 <img> 에 loading="lazy" 를 걸어 놓고 onload 를 기다린 적이 있는데,
// 화면 밖이라 브라우저가 아예 받아 오지를 않아서 아이콘이 한 장도 안 떴다.
function uiIcon(kind, name, cls, fallback) {
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
function goldIcon(cls = "gico") {
  const n = el("i", cls);
  const im = document.createElement("img");
  im.src = GOLD_ICON;
  im.alt = "골드";
  im.onerror = () => { im.remove(); n.textContent = "✦"; n.classList.add("noimg"); };
  n.appendChild(im);
  return n;
}
// 골드 아이콘 + 글(「120 골드」 · 「+35」 따위)
function goldLabel(tag, cls, text) {
  const n = el(tag, cls);
  n.appendChild(goldIcon());
  n.appendChild(document.createTextNode(text));
  return n;
}

// 두 단계 고르기 — 눌러서 고르고(빛남 · .picked), 아래 단추로 정한다. 한 번 눌러 바로 넘어가는 실수를 막는다.
// 같은 것을 다시 누르면 풀린다. 이벤트 · 상점 카드 제거 · 캠프 수련이 같이 쓴다.
// 돌려주는 것: { bar(확인 줄 — 원하는 곳에 붙인다), pick(node, value, name) }
function twoStep(onConfirm, { verb = "이것으로 합니다", danger = false } = {}) {
  const bar = el("div", "twostep");
  const label = el("span", "tsl", "하나를 눌러 고르세요");
  const ok = el("button", "tsok" + (danger ? " danger" : ""), verb);
  ok.disabled = true;
  bar.appendChild(label); bar.appendChild(ok);
  let cur = null, curEl = null;
  const pick = (node, value, name) => {
    if (curEl) curEl.classList.remove("picked");
    if (curEl === node) { cur = null; curEl = null; label.textContent = "하나를 눌러 고르세요"; ok.disabled = true; bar.classList.remove("ready"); return; }
    cur = { value }; curEl = node;
    node.classList.add("picked");
    label.textContent = name ? `「${name}」 을(를) 골랐습니다` : "골랐습니다";
    ok.disabled = false;
    bar.classList.add("ready");
  };
  let busy = false;
  ok.onclick = () => {
    if (!cur || busy) return;
    busy = true; ok.disabled = true;
    try { onConfirm(cur.value); }
    finally {
      // 정해져서 화면을 다시 그렸으면 이 줄은 떨어져 나갔다. 아직 붙어 있으면 거절된 것(골드 부족 · 조건) — 다시 누를 수 있게
      setTimeout(() => { busy = false; if (bar.isConnected && cur) ok.disabled = false; }, 0);
    }
  };
  return { bar, pick };
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
    d.appendChild(el("p", null, "광기 → 순수 → 냉정 → 광기로 돌고, 활발과 우울은 서로에게 강합니다. 공명은 상성이 없습니다. 적에게도 성격이 있습니다."));
    return d;
  }],
  ["열", "열과 맞는 순서", () => helpList([
    "사도마다 전열 · 중열 · 후열이 정해져 있습니다(원작 배치 그대로). 바꿀 수 없습니다.",
    "적은 가장 앞 열부터 노립니다. 전열이 비면 중열, 그다음 후열입니다. 뒤를 노리는 수는 거꾸로 후열부터입니다.",
    "같은 열에 둘 이상이면 적 쪽(오른쪽)에 선 사도가 먼저 맞습니다. 편성 무대의 ⇄ 로 자리를 바꿉니다.",
    "열이 주는 효과 · 조건(후열 버프 · 「뒷줄에 있어야」)은 자리와 상관없이 열만 봅니다.",
    "도발이 걸리면 어느 열이든 그 사도가 맞습니다.",
    "「모든 열」 사도(티그(영웅) · 죠안)는 편성에서 설 열을 고르고, 선 열에 따라 패시브가 달라집니다.",
  ])],
  ["AP", "AP 와 고학년 게이지", () => helpList([
    `AP 는 파티 공용입니다. 매 턴 ${RULES.AP_PER_TURN}, 남으면 사라집니다.`,
    `카드에 쓴 AP 1당 고학년 게이지 +${RULES.GAUGE_PER_AP}%(최대 ${RULES.GAUGE_MAX}%). 0코 카드는 게이지를 채우지 않습니다.`,
    `고학년 스킬은 사도마다 게이지 ${RULES.ULT_COSTS.join(" · ")}% 가운데 하나를 씁니다. 사도의 둥근 얼굴 단추가 빛나면 쓸 수 있습니다.`,
    `손패는 ${RULES.HAND_MAX}장까지입니다.`,
  ])],
  ["신탁", "은총 · 신탁 · 기적", () => helpList([
    "싸우다 보면 카드가 빛납니다. 빛나는 카드를 내면 세계수의 뜻이 내립니다.",
    "은총 — 사도의 기본 카드가 빛납니다. 내면 그 사도의 고유 카드 하나가 손패로 옵니다(그 턴 0코). 고르지 않습니다. 한 번 뺀 고유 카드는 다시 오지 않습니다.",
    "신탁 — 고유 카드 · 중립 카드가 빛납니다. 내면 신탁 다섯(① 강화 ② 경량 ③ 연계 ④ 변형 ⑤ 각성) 가운데 셋이 뜨고 하나를 고릅니다. 카드가 바로 바뀌고 이번에 내는 것은 0코입니다.",
    `기적 — 신탁 선택지 하나에 드물게(${Math.round(RULES.DIVINE * 100)}%) 붙는 덤입니다(비용 -1 · 드로우 · 피해 ×1.3 따위).`,
    "사도마다 따로 굴립니다 — 한 전투에 여러 사도, 운이 좋으면 셋 모두 은총이 빛납니다. 중립 카드 신탁은 사도와 별개로 한 번 더 굴립니다.",
    `사도 한 명당 — 은총: 일반 ${Math.round(RULES.EPI_HERO.fight * 100)}% · 엘리트 ${Math.round(RULES.EPI_HERO.elite * 100)}% · 보스 ${Math.round(RULES.EPI_HERO.boss * 100)}% / 신탁: 일반 ${Math.round(RULES.EPI_CARD.fight * 100)}% · 엘리트 ${Math.round(RULES.EPI_CARD.elite * 100)}% · 보스 ${Math.round(RULES.EPI_CARD.boss * 100)}%. 엘리트 · 보스는 은총이, 엘리트는 신탁도 적어도 하나는 빛납니다.`,
  ])],
  ["드랍", "드랍과 상점", () => helpList([
    "보상 화면은 없습니다. 쓰러진 적이 골드를 떨구고, 가장 센 적이 장비를 떨굽니다. 이기면 그대로 챙깁니다.",
    `장비 — 일반 싸움 ${Math.round(RULES.DROP.fight.equip * 100)}% · 엘리트 · 보스는 늘(마지막 보스 빼고). 층이 오를수록 등급이 오릅니다. 같은 장비도 다시 떨어집니다 — 상점 · 이벤트도 마찬가지라 두 사도가 같은 것을 낄 수 있습니다.`,
    "중립 카드는 싸움에서 떨어지지 않습니다 — 골디의 상점과 이벤트에서만 얻습니다.",
    `골디의 상점(휴식+상점 칸) — 중립 카드 셋 · 장비 ${RULES.SHOP_EQUIP_N}점 · 새로고침 · 카드 제거. 고유 카드는 팔지 않습니다(은총으로만). 골디는 깎아 주지 않습니다.`,
  ])],
  ["장비", "장비", () => helpList([
    `사도마다 무기 · 방어구 · 장신구 한 칸씩입니다. 전투 밖이면 어디서든(지도의 「장비」 · 캠프 · 상점) 끼고 빼고 바꿔 낍니다. 가방의 장비는 사는 값의 ${Math.round(RULES.EQUIP_SELL * 100)}% 에 팔 수 있습니다.`,
    "스탯 줄은 사도 스탯에 그대로 더합니다. 효과 줄은 낀 사도의 패시브가 됩니다.",
    "이름에 사도가 붙은 장비는 그 사도가 끼면 애착 줄과 작은 스탯이 더 붙습니다.",
    "등급 — 일반 · 고급 · 희귀 · 전설. 일반 몇 종은 스탯뿐입니다.",
  ])],
  ["지도", "지도", () => helpList([
    `한 층은 ${M.ROWS}칸 길입니다. 출발에서 오른쪽으로 가며 이어진 칸을 골라 들어갑니다. 끝은 보스, 그 앞은 늘 휴식+상점입니다.`,
    `칸 — ${["fight", "elite", "camp", "campshop", "event", "boss"].map((k) => M.KIND_KO[k]).join(", ")}.`,
    `엘리트는 한 단계 센 적(체력 ×${RULES.ELITE_HP})이고, 이기면 장비가 늘 떨어지고 신탁이 늘 뜹니다.`,
    "휴식 칸에서는 쉬거나(HP 회복) 수련합니다. 처음 고른 셋으로 끝까지 갑니다 — 층을 넘어도 사도는 바뀌지 않습니다. 고학년 게이지는 전투가 끝나도 남은 만큼 다음 전투로 이어집니다.",
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
function fsButton(cls = "") {
  const b = el("button", "fsmini" + (cls ? " " + cls : ""), "⛶");
  b.title = "전체화면";
  b.onclick = (e) => { e.stopPropagation(); toggleFullscreen(); };
  return b;
}
// 지금 칸 다음이 보스인가 — 휴식(상점) 칸은 층 중간에도 있다. 보스 바로 앞 칸(1-11)에서만 「보스에게 갑니다」
const bossNext = (run) => { const n = M.currentNode(run); return !!(n && n.row === M.ROWS - 1); };

function img(src, cls) {
  const n = el("img", cls);
  n.src = src; n.loading = "lazy"; n.alt = "";
  n.onerror = () => n.remove();
  return n;
}

// 글을 넣되 아는 낱말에는 밑줄을 긋고 풀이를 매단다.
// 짚으면 title 로, 누르면 풀이 쪽지로 뜬다 — 손가락으로도 볼 수 있어야 한다.
function withKeywords(node, text, heroKey) {
  for (const part of splitKeywords(text, heroKey)) {
    if (!part.kw) { node.appendChild(document.createTextNode(part.t)); continue; }
    const b = el("button", "kw" + (part.kw.text ? "" : " nodef"), part.t);
    b.title = part.kw.text || `${part.kw.ko} — 기획서에 이름만 있고 풀이가 아직 없습니다`;
    b.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); showKeyword(part.kw); };
    node.appendChild(b);
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
  n.appendChild(el("p", null, kw.text || "기획서에 이름만 있고 풀이가 아직 없습니다."));
  const x = el("button", "kwclose", "닫기");
  x.onclick = () => { n.remove(); kwNote = null; };
  n.appendChild(x);
  document.body.appendChild(n);
  kwNote = n;
}

// 카드 한 장을 펼친 쪽지 — 하는 일 한 줄과 그 아래 낱말 풀이.
function showCard(c, heroKey) {
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
      box.appendChild(el("dd", null, t.text || "기획서에 이름만 있고 풀이가 아직 없습니다."));
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
function showPiles(piles, pick, cardFor, onDetail) {
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
    const order = [...bag.keys()].sort((a, b) => {
      const ca = cardFor(a) || {}, cb = cardFor(b) || {};
      return String(ca.hero || "").localeCompare(String(cb.hero || "")) || (ca.cost || 0) - (cb.cost || 0) || String(ca.name).localeCompare(String(cb.name));
    });
    for (const id of order) {
      const c = cardFor(id);
      if (!c) continue;
      const cell = el("div", "pilecell");
      const who = el("div", "rwho");
      if (c.hero) {
        who.appendChild(art.portrait(c.hero, { ko: HERO(c.hero).ko, tint: TINT(c.hero), size: 22, slot: "battle", still: true }));
        who.appendChild(el("b", null, HERO(c.hero).ko));
      } else who.appendChild(el("b", null, "공용"));
      if (bag.get(id) > 1) who.appendChild(el("span", "pn", `×${bag.get(id)}`));
      cell.appendChild(who);
      const card = bigCard(c, CARDART.pic[id] || null);
      card.onclick = onDetail ? () => onDetail(id) : null;   // 누르면 자세히 — 더미 창 위에 뜬다
      card.title = onDetail ? "눌러서 자세히 보기" : "";
      if (onDetail) card.classList.add("canzoom");
      if (c.flashOn) card.appendChild(el("span", "pflash", `${"①②③④⑤"[c.flashOn - 1]} ${c.flashKind}`));
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
// 주인 없는 카드(중립·교주·골칫거리)는 종류(공격·방어…) 색 그대로.
function natureClass(c) {
  const nat = c && c.hero ? C.natureOf(c.hero) : null;
  return nat ? " p-" + nat : "";
}

// 한 장의 카드. 도감 상세에서도 쓰고, 나중에 다른 곳에서도 쓸 수 있게 여기 한 번만 쓴다.
function bigCard(c, pic) {
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
  withKeywords(body, cardParts(c, c.hero).action, c.hero);
  n.appendChild(body);
  n.onclick = () => showCard(c, c.hero);
  n.title = "눌러서 낱말 풀이 보기";
  return n;
}

// opts.view — "도감" 이면 도감부터 연다(로비의 「사도 도감」). 그때 도감에서 나가면 로비(onBack)로 돌아간다
export function partyScreen(onStart, onBack, opts = {}) {
  const s = screen();
  s.classList.add("dexscreen");

  const roster = Object.entries(HERO_DATA);
  const RACES = [...new Set(roster.map(([, h]) => h.race))].sort();
  // 성급 — 기획서 낱말이다. 등급은 장비 희귀도(일반·고급·희귀·전설)에 쓴다.
  const SORTS = {
    성급: (a, b) => b[1].star - a[1].star || a[1].ko.localeCompare(b[1].ko),
    이름: (a, b) => a[1].ko.localeCompare(b[1].ko),
    공격: (a, b) => b[1].atk - a[1].atk,
    체력: (a, b) => b[1].hp - a[1].hp,
  };

  let picked = [];
  let view = opts.view || null;          // null 편성 · "도감" 도감 · 사도 키면 사도 정보
  let dexHome = opts.view === "도감";      // 로비에서 곧장 연 도감 — 편성으로 넘어가면 풀린다(그 뒤 도감의 ◁ 은 편성으로)
  let cameFrom = null;                   // 사도 정보에서 나가면 들어온 곳으로 돌아간다
  let tab = "능력치";                    // 사도 정보에서 먼저 뜨는 갈피
  const rows = {};
  const filter = { race: null, nature: null, role: null, q: "" };
  let sort = "성급", desc = true;

  // ── 도감 ─────────────────────────────────────────────────────────────
  // 틀은 한 번만 세우고 바뀌는 것만 다시 채운다 —
  // 한 글자 칠 때마다 통째로 다시 그리면 입력칸이 새로 생겨 커서가 날아간다.
  function dexScreen() {
    s.innerHTML = "";
    s.className = "dexscreen";
    stageBg();

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { if (dexHome && onBack) return onBack(); view = null; render(); };   // 도감에서 나가면 편성으로(로비에서 왔으면 로비로)
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", "사도 도감"));
    bar.appendChild(fsButton("fsright"));

    const search = el("input", "dsearch");
    search.placeholder = "이름";
    search.value = filter.q;
    search.oninput = () => { filter.q = search.value.trim(); fill(); };
    bar.appendChild(search);

    const sortBtn = el("button", "sortbtn");
    const sortLabel = el("span", null, sort);
    const sortArrow = el("i", "arrow", desc ? "↓" : "↑");
    sortBtn.appendChild(sortLabel);
    sortBtn.appendChild(sortArrow);
    sortBtn.onclick = () => {
      const keys = Object.keys(SORTS);
      const i = keys.indexOf(sort);
      if (desc) desc = false; else { desc = true; sort = keys[(i + 1) % keys.length]; }
      fill();
    };
    bar.appendChild(sortBtn);
    s.appendChild(bar);

    const body = el("div", "dbody");

    // 왼쪽 종족 레일 — 기획서에 세력이라는 구분은 없다. 종족 여덟이 그 자리다.
    const rail = el("nav", "rail");
    const railBtns = {};
    const mk = (label, val) => {
      const b = el("button", "railbtn");
      const emb2 = el("span", "remb");
      if (val === "ALL") emb2.textContent = "◎";
      else emb2.appendChild(uiIcon("종족", label, "rico", label.slice(0, 1)));
      b.appendChild(emb2);
      b.appendChild(el("span", "rname", label));
      b.onclick = () => { filter.race = val === "ALL" ? null : val; fill(); };
      railBtns[val] = b;
      return b;
    };
    rail.appendChild(mk("ALL", "ALL"));
    for (const r of RACES) rail.appendChild(mk(r, r));
    body.appendChild(rail);

    const right = el("div", "dright");

    // 거르개 — 성격과 역할
    const chips = el("div", "chiprow");
    const chipBtns = { nature: {}, role: {} };
    const chipGroup = (vals, key) => {
      const all = el("button", "chip", "전체");
      all.onclick = () => { filter[key] = null; fill(); };
      chipBtns[key].__all = all;
      chips.appendChild(all);
      for (const v of vals) {
        const b = el("button", "chip" + (key === "nature" ? " n" + v : ""));
        if (key === "nature") b.appendChild(uiIcon("성격", v, "cico", ""));
        b.appendChild(el("span", null, v));
        b.onclick = () => { filter[key] = filter[key] === v ? null : v; fill(); };
        chipBtns[key][v] = b;
        chips.appendChild(b);
      }
      chips.appendChild(el("span", "chipgap"));
    };
    chipGroup(NATURES, "nature");
    chipGroup(ROLES, "role");
    right.appendChild(chips);

    const head = el("div", "dhead2");
    const emb = el("span", "hemb");
    head.appendChild(emb);
    const ht = el("div");
    const hname = el("b");
    const cnt = el("span", "hcount");
    ht.appendChild(hname);
    ht.appendChild(cnt);
    head.appendChild(ht);
    right.appendChild(head);

    const grid = el("div", "dexgrid");
    right.appendChild(grid);
    body.appendChild(right);
    s.appendChild(body);

    // 아래 — 고른 셋을 알려 주고 편성으로 돌아가는 길
    const foot = el("div", "dfoot");
    const backToForm = el("button", "go", "편성으로");
    backToForm.onclick = () => { dexHome = false; view = null; render(); };
    const said = el("span", "dsaid");
    foot.appendChild(said);
    foot.appendChild(backToForm);
    s.appendChild(foot);

    function fill() {
      for (const [v, b] of Object.entries(railBtns)) b.classList.toggle("on", (filter.race || "ALL") === v);
      for (const key of ["nature", "role"]) {
        chipBtns[key].__all.classList.toggle("on", !filter[key]);
        for (const [v, b] of Object.entries(chipBtns[key])) if (v !== "__all") b.classList.toggle("on", filter[key] === v);
      }
      sortLabel.textContent = sort;
      sortArrow.textContent = desc ? "↓" : "↑";
      emb.innerHTML = "";
      if (filter.race) emb.appendChild(uiIcon("종족", filter.race, "rico", filter.race.slice(0, 1)));
      else emb.textContent = "◎";
      hname.textContent = filter.race || "모든 종족";

      const list = roster
        .filter(([k, h]) => {
          // 이격도 한자리에 깐다. 탭으로 갈라 두면 "에르핀" 을 찾았을 때
          // 에르핀(왕도) 가 뒤에 숨어, 찾는 사람은 그 사도가 없다고 본다.
          if (filter.race && h.race !== filter.race) return false;
          if (filter.nature && h.nature !== filter.nature) return false;
          if (filter.role && h.role !== filter.role) return false;
          if (filter.q && !h.ko.includes(filter.q)) return false;
          return true;
        })
        .sort((x, y) => (desc ? 1 : -1) * SORTS[sort](x, y));

      cnt.textContent = `${list.length}/${roster.length}`;

      grid.innerHTML = "";
      for (const [k, h] of list) grid.appendChild(dexCard(k, h));
      if (!list.length) grid.appendChild(el("div", "more", "맞는 사도가 없습니다."));

      said.textContent = picked.length
        ? `${picked.map((k) => HERO_DATA[k].ko).join(" · ")} — ${picked.length}/3`
        : "아직 아무도 안 골랐습니다";
    }
    fill();
  }

  // 도감 · 사도 정보도 편성과 같은 1층 싸움터를 깐다 — 흐리고 어둡게는 css 가(czn.css 끝)
  function stageBg() {
    const bg = `assets/bg/${BATTLE_BG[1].fight}.jpg`;
    s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bg, location.href).href : bg}")`);
  }

  // ── 팀 편성 ──────────────────────────────────────────────────────────
  // 카제나 얼개다 — 큰 세로 카드 셋을 가운데 세우고, 오른쪽에 이번 싸움을 적는다.
  // 트릭컬 쪽을 얹는다: 카드마다 정해진 위치(전열·중열·후열)를 보여 준다. 고르는 것이 아니다.
  // 빈 자리를 누르면 사도를 고르는 서랍이 열린다.

  // ── 편성 — 위는 무대(고른 셋이 싸움터에 선다), 아래는 명단(늘 펼쳐 둔다) ─────────────
  // 전투 화면과 같은 옷: 1층 싸움터 배경 · 어두운 유리 · 금선. 사도는 전투처럼 스파인으로 같은 배율.
  // 무대의 자리는 전투와 같다 — 후열이 왼쪽, 전열이 가운데 쪽(적을 본다). 자리는 기획서가 정한 대로(고르지 않는다).
  function formScreen() {
    s.innerHTML = "";
    s.className = "teamscreen3";
    stageBg();

    // ① 머리
    const head = el("div", "tf-head");
    if (onBack) { const b = el("button", "tm-fback", "◁"); b.title = "처음으로"; b.onclick = onBack; head.appendChild(b); }
    const title = el("div", "tf-title");
    title.appendChild(el("b", null, "팀 편성"));
    const count = el("span", "tf-count");
    title.appendChild(count);
    head.appendChild(title);
    head.appendChild(fsButton());
    const helpBtn = el("button", "tm-fhelp", "도움말");
    helpBtn.onclick = () => openHelp("상성");
    head.appendChild(helpBtn);
    const dexBtn = el("button", "tm-fdex", "사도 도감");
    dexBtn.onclick = () => { filter.q = ""; view = "도감"; render(); };
    head.appendChild(dexBtn);
    s.appendChild(head);

    // ② 왼쪽 — 사도 칸 셋(멈춘 스탠딩 그림). 누르면 사도 고르기 창
    const main = el("div", "tf-main");
    const slots = el("div", "tf-slots");
    main.appendChild(slots);

    // ③ 오른쪽 — 첫 층 · 파티 성격 · 시작 덱 · 떠납니다
    const side = el("aside", "tf-side");
    const floor = FLOORS[0];
    const where = el("section", "tf-floor");
    const wt = el("div", "tf-ftop");
    wt.appendChild(el("small", null, "첫 층"));
    wt.appendChild(el("b", null, `${floor.n}층 · ${floor.name}`));
    wt.appendChild(el("span", null, `${floor.sub} — 지도에서 길을 골라 12칸 끝의 보스까지`));
    where.appendChild(wt);
    const bossRow = el("div", "tf-boss");
    for (const id of floor.boss) {
      const e = ENEMIES[id]; if (!e) continue;
      const b = el("div", "tf-bossone");
      b.appendChild(art.portrait(id, { ko: e.ko, tint: e.tint, size: 0, slot: "foe", still: true }));
      const t = el("div");
      t.appendChild(el("small", null, "보스"));
      t.appendChild(el("b", null, e.ko));
      b.appendChild(t);
      bossRow.appendChild(b);
    }
    where.appendChild(bossRow);
    const foesHead = el("div", "tf-label", "나오는 적");
    where.appendChild(foesHead);
    // 나오는 적 — 작은 그림 + 이름 칩. 그림이 없는 적(엘리트 몇)은 이름만 — 이름 앞 세 글자만 떠서 「마시멜」 같은 낱말로 읽혔다
    const foes = el("div", "tf-foes");
    const seen = new Set();
    const elites = new Set((floor.elites || []).flat());
    for (const id of [...(floor.fights || []).flat(), ...(floor.elites || []).flat()]) {
      if (seen.has(id) || !ENEMIES[id]) continue; seen.add(id);
      const f = el("div", "tf-foe" + (elites.has(id) ? " elite" : ""));
      f.title = elites.has(id) ? `엘리트 · ${ENEMIES[id].ko}` : ENEMIES[id].ko;
      const pic = art.portrait(id, { ko: ENEMIES[id].ko, tint: ENEMIES[id].tint, size: 0, slot: "foe", still: true });
      if (!pic.classList.contains("art-ph")) f.appendChild(pic);
      if (elites.has(id)) f.appendChild(el("i", "tf-elite", "엘리트"));
      f.appendChild(el("span", null, ENEMIES[id].ko));
      foes.appendChild(f);
    }
    where.appendChild(foes);
    side.appendChild(where);
    const synBox = el("section", "tf-syn");
    side.appendChild(synBox);
    const deckSec = el("section", "tf-decksec");
    const deckHead = el("div", "tf-label");
    const deckBox = el("div", "tm-fdeck2");
    deckSec.appendChild(deckHead);
    deckSec.appendChild(deckBox);
    side.appendChild(deckSec);
    const go = el("button", "tm-fgo tf-go", "떠납니다");
    go.onclick = () => { for (const k of picked) rows[k] = rows[k] || HERO_DATA[k].row; onStart(picked, rows); };
    side.appendChild(go);
    main.appendChild(side);
    s.appendChild(main);

    // 선 열 — 「모든 열」 사도는 편성에서 고른 열, 나머지는 기획서의 제 열
    const rowOf = (k) => rows[k] || HERO_DATA[k].row;
    const ROW_ORDER = [...C.ROWS].reverse();            // 후열 · 중열 · 전열 — 전투처럼 후열이 왼쪽, 전열이 적 쪽
    const add = (key) => { picked.push(key); rows[key] = rows[key] || HERO_DATA[key].row; speak(key, ["decksetting", "greeting"]); };
    const remove = (key) => { const i = picked.indexOf(key); if (i >= 0) picked.splice(i, 1); delete rows[key]; };

    // 칸 하나 — 사도가 있으면 그 사도, 없으면 「+ 사도 넣기」
    function slotOf(key, i) {
      if (!key) {
        const n = el("button", "tf-slot empty");
        n.appendChild(el("span", "tf-plus", "+"));
        n.appendChild(el("b", null, "사도 넣기"));
        n.appendChild(el("span", null, `${i + 1}번째 자리 · 눌러서 명단`));
        n.onclick = () => openPicker(null);
        return n;
      }
      const h = HERO_DATA[key];
      const n = el("button", "tf-slot");
      n.style.setProperty("--tint", NTINT[h.nature]);
      n.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      n.appendChild(el("div", "tf-fade"));
      const badges = el("div", "tf-badges");
      badges.appendChild(uiIcon("위치", ROWS_KO[rowOf(key)], "tf-b", ROWS_KO[rowOf(key)].slice(0, 1)));
      badges.appendChild(uiIcon("성격", h.nature, "tf-b", h.nature.slice(0, 1)));
      badges.appendChild(uiIcon("역할", h.role, "tf-b", h.role.slice(0, 1)));
      n.appendChild(badges);
      const tools = el("div", "tf-tools");
      const info = el("span", "tf-tool tf-info", "🔍");
      info.title = "사도 정보";
      info.onclick = (e) => { e.stopPropagation(); cameFrom = null; view = key; tab = "능력치"; render(); };
      const x = el("span", "tf-tool tf-x", "✕");
      x.title = "빼기";
      x.onclick = (e) => { e.stopPropagation(); remove(key); fill(); };
      tools.appendChild(info); tools.appendChild(x);
      n.appendChild(tools);
      // 「모든 열」 사도 — 어느 열에 설지 고른다. 선 열에 따라 패시브의 다른 줄이 켜진다
      if (h.anyRow) {
        const pick = el("div", "tf-rowpick");
        for (const r of ROW_ORDER) {
          const b = el("span", "tf-rowb" + (rowOf(key) === r ? " on" : ""), ROWS_KO[r]);
          const line = (h.passive || "").split(" · ").filter((t) => t.includes(`${ROWS_KO[r]}에 서 있으면`)).join(" · ");
          b.title = line ? `${ROWS_KO[r]}에 서면 — ${line}` : `${ROWS_KO[r]}에 선다`;
          b.onclick = (e) => { e.stopPropagation(); rows[key] = r; fill(); };
          pick.appendChild(b);
        }
        n.appendChild(pick);
      }
      const plate = el("div", "tf-plate");
      plate.appendChild(el("span", "tf-star", "★".repeat(h.star)));
      plate.appendChild(el("b", null, h.ko));
      plate.appendChild(el("span", "tf-sub", `${ROWS_KO[rowOf(key)]} ${h.role} · ${h.race}${h.anyRow ? " · 모든 열" : ""}`));
      const st = el("div", "tf-stats");
      for (const [k, v] of [["HP", h.hp], ["공격", h.atk], ["방어", h.def]]) { const d = el("span"); d.appendChild(el("small", null, k)); d.appendChild(el("b", null, String(v))); st.appendChild(d); }
      plate.appendChild(st);
      n.appendChild(plate);
      n.title = `${h.ko} — 눌러서 다른 사도로 바꾸기`;
      n.onclick = () => openPicker(key);
      return n;
    }
    // 같은 열의 두 사도 사이 — 누르면 둘의 자리를 바꾼다(편성 순서 = 전투에서 선 순서 · 손패 순서)
    function swapBtn(a, b) {
      const n = el("button", "tm-fswap tf-swap", "⇄");
      n.title = `${HERO_DATA[a].ko} ↔ ${HERO_DATA[b].ko} 자리 바꾸기 — 같은 열은 오른쪽(적 쪽)이 먼저 맞는다`;
      n.onclick = (e) => {
        e.stopPropagation();
        const i = picked.indexOf(a), j = picked.indexOf(b);
        [picked[i], picked[j]] = [picked[j], picked[i]];
        fill();
      };
      return n;
    }

    // ── 사도 고르기 창 — 칸을 누르면 뜬다. target 이 있으면 그 자리를 바꾸고, 없으면 빈 자리에 넣는다 ──
    let sheet = null, target = null, chips = null, grid = null, search = null;
    function closePicker() { if (sheet) { sheet.remove(); sheet = null; } document.removeEventListener?.("keydown", escPick); }
    function escPick(e) { if (e.key === "Escape") { e.stopPropagation(); closePicker(); } }
    function openPicker(key) {
      closePicker();
      target = key;
      sheet = el("div", "tf-pick");
      sheet.onclick = (e) => { if (e.target === sheet) closePicker(); };
      const box = el("div", "tf-pickbox");
      const hd = el("div", "tf-pickhead");
      const tt = el("div");
      tt.appendChild(el("b", null, key ? `${HERO_DATA[key].ko} 자리 — 다른 사도로 바꿉니다` : "빈 자리에 넣을 사도"));
      tt.appendChild(el("span", null, "눌러서 고릅니다 · 이미 편성한 사도를 고르면 서로 자리를 바꿉니다 · 오른쪽 클릭은 사도 정보"));
      hd.appendChild(tt);
      if (key) {
        const out = el("button", "tf-out", "이 자리 비우기");
        out.onclick = () => { remove(key); closePicker(); fill(); };
        hd.appendChild(out);
      }
      const x = el("button", "tf-close", "×");
      x.onclick = closePicker;
      hd.appendChild(x);
      box.appendChild(hd);
      const bar = el("div", "tm-fbar");
      chips = el("div", "tm-fchips");
      bar.appendChild(chips);
      search = el("input", "tm-fsearch");
      search.placeholder = "이름으로 찾기";
      search.value = filter.q;
      search.oninput = () => { filter.q = search.value.trim(); fillRoster(); };
      bar.appendChild(search);
      box.appendChild(bar);
      grid = el("div", "tm-froster tf-roster");
      box.appendChild(grid);
      sheet.appendChild(box);
      s.appendChild(sheet);
      document.addEventListener?.("keydown", escPick);
      fillChips(); fillRoster();
      search.focus && search.focus();
    }
    function choose(key) {
      if (target) {
        if (key !== target) {
          const j = picked.indexOf(key), i = picked.indexOf(target);
          if (j >= 0) [picked[i], picked[j]] = [picked[j], picked[i]];      // 이미 편성한 사도 — 둘이 자리를 바꾼다
          else { picked[i] = key; delete rows[target]; rows[key] = rows[key] || HERO_DATA[key].row; speak(key, ["decksetting", "greeting"]); }
        }
      } else if (!picked.includes(key)) {
        if (picked.length >= 3) return hint("셋까지만 데려갈 수 있습니다 — 칸을 눌러 바꾸거나 비워 주세요");
        add(key);
      }
      if (filter.q) filter.q = "";
      hint("");
      closePicker();
      fill();
    }

    // 명단 한 장
    function rosterCard(key, h) {
      const at = picked.indexOf(key);
      const n = el("button", "tm-fcard" + (at >= 0 ? " on" : "") + (key === target ? " cur" : ""));
      n.style.setProperty("--tint", NTINT[h.nature]);
      n.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      n.appendChild(el("div", "tm-ffade"));
      const badges = el("div", "tm-fbadges");
      badges.appendChild(uiIcon("성격", h.nature, "tm-fb", h.nature.slice(0, 1)));
      badges.appendChild(uiIcon("역할", h.role, "tm-fb", h.role.slice(0, 1)));
      n.appendChild(badges);
      const plate = el("div", "tm-fcp");
      plate.appendChild(el("b", null, h.ko));
      plate.appendChild(el("span", null, `${rowLabel(h)} · ${h.race}`));
      n.appendChild(plate);
      if (at >= 0) n.appendChild(el("span", "tm-fnum", String(at + 1)));
      if (isEcho(key)) n.appendChild(el("span", "tm-fecho", "이격"));
      n.onclick = () => choose(key);
      n.oncontextmenu = (e) => { e.preventDefault(); closePicker(); cameFrom = null; view = key; tab = "능력치"; render(); };
      n.title = `${h.ko} — 눌러서 고르기 · 오른쪽 클릭으로 사도 정보`;
      return n;
    }
    function fillChips() {
      if (!chips) return;
      chips.innerHTML = "";
      const group = (vals, key, icon) => {
        const all = el("button", "tm-fchip" + (filter[key] ? "" : " on"), "전체");
        all.onclick = () => { filter[key] = null; fillChips(); fillRoster(); };
        chips.appendChild(all);
        for (const v of vals) {
          const b = el("button", "tm-fchip" + (filter[key] === v ? " on" : ""));
          b.appendChild(uiIcon(icon, v, "tm-fci", ""));
          b.appendChild(el("span", null, v));
          b.onclick = () => { filter[key] = filter[key] === v ? null : v; fillChips(); fillRoster(); };
          chips.appendChild(b);
        }
        chips.appendChild(el("span", "tm-fgap"));
      };
      group(NATURES, "nature", "성격");
      group(ROLES, "role", "역할");
    }
    function fillRoster() {
      if (!grid) return;
      grid.innerHTML = "";
      const list = roster.filter(([k, h]) => {
        if (filter.nature && h.nature !== filter.nature) return false;
        if (filter.role && h.role !== filter.role) return false;
        if (filter.q && !h.ko.includes(filter.q)) return false;
        return true;
      }).sort(SORTS.성급);
      for (const [k, h] of list) grid.appendChild(rosterCard(k, h));
      if (!list.length) grid.appendChild(el("div", "tm-fnone", "맞는 사도가 없습니다."));
    }

    function fill() {
      // 칸 — 고른 사도를 열 차례(후열 → 전열)로, 같은 열은 편성 순서대로. 빈 자리는 뒤에
      slots.innerHTML = "";
      const order = ROW_ORDER.flatMap((r) => picked.filter((k) => rowOf(k) === r));
      order.forEach((k, i) => {
        if (i && rowOf(order[i - 1]) === rowOf(k)) slots.appendChild(swapBtn(order[i - 1], k));
        else if (i) slots.appendChild(el("span", "tf-gap"));
        slots.appendChild(slotOf(k, i));
      });
      for (let i = order.length; i < 3; i++) { if (i) slots.appendChild(el("span", "tf-gap")); slots.appendChild(slotOf(null, i)); }
      count.textContent = `${picked.length} / 3`;
      go.disabled = picked.length !== 3;
      go.textContent = picked.length === 3 ? "떠납니다" : `사도 ${3 - picked.length}명 더`;

      // 파티 성격 — 상성 보기
      synBox.innerHTML = "";
      const synHead = el("div", "tf-label");
      synHead.appendChild(el("span", null, "파티 성격"));
      const natBtn = el("button", "tm-fdkbig tm-fnatbtn", "상성 보기");
      natBtn.onclick = (e) => { e.stopPropagation(); openHelp("상성"); };
      synHead.appendChild(natBtn);
      synBox.appendChild(synHead);
      if (!picked.length) synBox.appendChild(el("p", "tm-fnote", "사도를 고르면 셋의 성격이 여기 뜹니다."));
      else {
        const nat = el("div", "tm-fnats");
        for (const k of picked) {
          const t = el("span", "tm-fnatc");
          t.style.setProperty("--tint", NTINT[HERO_DATA[k].nature]);
          t.appendChild(uiIcon("성격", HERO_DATA[k].nature, "tm-fci", ""));
          t.appendChild(el("span", null, `${HERO_DATA[k].ko} · ${HERO_DATA[k].nature}`));
          nat.appendChild(t);
        }
        synBox.appendChild(nat);
      }

      // 시작 덱
      deckBox.innerHTML = "";
      let n = 0;
      for (const k of picked) {
        const row = el("div", "tm-fdkrow");
        row.appendChild(el("span", "tm-fdkwho", HERO_DATA[k].ko));
        const cards = el("div", "tm-fdkcards");
        for (const c of kitOf(k).start) {
          const chip = el("button", "tm-fdk t" + (c.type || ""));
          chip.appendChild(el("i", null, c.xcost ? "X" : String(c.cost)));
          chip.appendChild(el("span", null, c.name));
          chip.title = `${c.text} — 눌러서 자세히`;
          chip.onclick = (e) => { e.stopPropagation(); showCard(c, k); };
          cards.appendChild(chip);
          n++;
        }
        row.appendChild(cards);
        deckBox.appendChild(row);
      }
      deckHead.innerHTML = "";
      deckHead.appendChild(el("span", null, n ? `시작 덱 ${n}장` : "시작 덱"));
      if (n) {
        const big = el("button", "tm-fdkbig", "크게 보기");
        const ids = picked.flatMap((k) => kitOf(k).start.map((c) => c.id));
        big.onclick = (e) => {
          e.stopPropagation();
          showPiles([{ key: "start", label: "시작 덱", ids, why: "사도마다 시작 카드 넉 장 — 고유 카드는 싸우며 은총으로 얻습니다." }], "start", (id) => CARDS[id], null);
        };
        deckHead.appendChild(big);
      }
      if (!n) deckBox.appendChild(el("p", "tm-fnote", "사도마다 시작 카드 넉 장. 고유 카드는 싸우며 은총으로 얻습니다."));
      if (sheet) fillRoster();
    }
    fill();
  }

  function dexCard(key, h) {
    const on = picked.includes(key);
    const b = el("button", "dex" + (on ? " on" : ""));
    b.style.setProperty("--tint", NTINT[h.nature]);
    const badges = el("div", "dbadges");
    badges.appendChild(uiIcon("역할", h.role, "brole", h.role.slice(0, 1)));
    const bn = uiIcon("성격", h.nature, "bnat n" + h.nature, h.nature.slice(0, 1));
    bn.style.setProperty("--tint", NTINT[h.nature]);
    badges.appendChild(bn);
    b.appendChild(badges);
    b.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
    b.appendChild(el("div", "dfade"));
    if (on) b.appendChild(el("span", "dmark", "편성"));
    const plate = el("div", "dplate");
    plate.appendChild(el("span", "dname", h.ko));
    plate.appendChild(el("span", "dsub", `${rowLabel(h)} · ${h.race}`));
    if (isEcho(key)) b.appendChild(el("span", "decho", "이격"));
    b.appendChild(plate);
    b.onclick = () => { cameFrom = "도감"; view = key; tab = "능력치"; render(); };
    return b;
  }

  // ── 사도 정보 ────────────────────────────────────────────────────────
  function detailScreen(key) {
    const h = HERO_DATA[key];
    s.innerHTML = "";
    s.className = "detailscreen";
    stageBg();
    s.style.setProperty("--tint", NTINT[h.nature]);

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { view = cameFrom; render(); };
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", "사도 정보"));
    bar.appendChild(fsButton("fsright"));
    bar.appendChild(el("span", "dwho", h.ko));
    bar.appendChild(el("span", "dcount", `${picked.length}/3`));
    const on = picked.includes(key);
    const take = el("button", "takebtn" + (on ? " on" : ""), on ? "편성에서 빼기" : "편성에 넣기");
    take.onclick = () => {
      const i = picked.indexOf(key);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length < 3) { picked.push(key); speak(key, ["decksetting", "greeting"]); }
      else return hint("셋까지만 데려갈 수 있습니다");
      hint("");
      render();
    };
    bar.appendChild(take);
    s.appendChild(bar);

    const body = el("div", "dbody");

    const side = el("nav", "side");
    const emb = el("div", "semb");
    emb.appendChild(uiIcon("종족", h.race, "sico", h.race.slice(0, 1)));
    emb.appendChild(el("span", null, h.race));
    emb.appendChild(el("i", null, h.nature));
    side.appendChild(emb);
    for (const t of ["능력치", "카드", "신탁", "고학년 스킬"]) {
      const b = el("button", "sidebtn" + (tab === t ? " on" : ""), t);
      b.onclick = () => { tab = t; render(); };
      side.appendChild(b);
    }
    body.appendChild(side);

    const main = el("div", "dmain");
    const kit = kitOf(key);
    // 그림은 카드 id 로 찾는다 — 자리 셈으로 맞추면 카드가 하나 늘 때 통째로 어긋난다
    const CA = { ult: CARDART.pic[key + "_ult"] || null };
    const picFor = (c) => CARDART.pic[c.id] || null;

    if (tab === "능력치") main.appendChild(statsPane(key, h));
    else if (tab === "카드") main.appendChild(cardPane(key, h, kit, CA, picFor));
    else if (tab === "신탁") main.appendChild(flashPane(kit, CA, picFor));
    else main.appendChild(ultPane(key, h, CA));

    body.appendChild(main);
    s.appendChild(body);
  }

  // 카제나 요원 화면처럼 — 왼쪽에 사도가 크게 서고(편성 무대와 같은 스파인), 오른쪽에 이름과 능력치
  function statsPane(key, h) {
    const w = el("div", "pane dt-stpane");
    const top = el("div", "sthero");
    const shot = el("div", "stshot");
    shot.appendChild(el("span", "dt-glow"));
    shot.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 200, slot: "battle", flip: true }));
    top.appendChild(shot);
    const info = el("div", "stinfo");
    const t = el("div", "sttop");
    t.appendChild(el("h2", null, h.ko));
    t.appendChild(el("span", "star", "★".repeat(h.star)));
    if (h.eldain) t.appendChild(el("span", "eldain", "엘다인"));
    info.appendChild(t);
    const meta = el("div", "stmeta");
    for (const [kind, name] of [["성격", h.nature], ["종족", h.race], ["위치", rowLabel(h)], ["역할", h.role]]) {
      const tag = el("span", "mtag");
      tag.appendChild(uiIcon(kind, name, "mico", ""));
      tag.appendChild(el("span", null, name));
      meta.appendChild(tag);
    }
    if (h.dmgType) meta.appendChild(el("span", "mtag plain", h.dmgType));
    info.appendChild(meta);
    info.appendChild(el("p", "stblurb", h.blurb));
    const g = el("div", "statgrid");
    for (const [ko, v] of [["체력", h.hp], ["공격", h.atk], ["방어", h.def], ["치명", h.crit + "%"]]) {
      const c = el("div", "statc");
      c.appendChild(el("small", null, ko));
      c.appendChild(el("strong", null, String(v)));
      g.appendChild(c);
    }
    info.appendChild(g);
    top.appendChild(info);
    w.appendChild(top);

    // 능력 글은 오른쪽 기둥에 잇는다 — 입상은 왼쪽에 서 있고 글만 내려 읽는다
    if (h.passive) info.appendChild(line("패시브", h.passive, "", key));
    if (h.keyword) info.appendChild(line(h.keyword.ko, h.keyword.text, "key", key));
    // 원작 대조(h.source)와 고른 사도와의 사이는 싣지 않는다 — 사이는 편성 화면 「함께 가면」에 있다
    return w;
  }

  function line(label, text, cls, heroKey) {
    const d = el("section", "ability " + (cls || ""));
    d.appendChild(el("h3", null, label));
    d.appendChild(withKeywords(el("p"), shortText(text), heroKey));
    return d;
  }

  function cardPane(key, h, kit, CA, picFor) {
    const w = el("div", "pane");
    const wrap = el("div", "cardwrap");
    const left = el("div", "cardcols");

    left.appendChild(sec("◎", "시작 카드", kit.start.length));
    const g1 = el("div", "cardrow");
    kit.start.forEach((c) => g1.appendChild(bigCard(c, picFor(c))));
    left.appendChild(g1);

    left.appendChild(sec("◈", "고유 카드", kit.unique.length));
    const g2 = el("div", "cardrow");
    kit.unique.forEach((c) => g2.appendChild(bigCard(c, picFor(c))));
    left.appendChild(g2);
    wrap.appendChild(left);

    // 오른쪽 — 고학년 스킬. 인게임 고학년 스킬이고, 그 아이콘을 그대로 쓴다(기획서).
    if (h.ult) {
      const side = el("aside", "egoside");
      const hex = el("div", "hex");
      hex.appendChild(el("span", "hexcost", String(h.ult.cost) + "%"));
      if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
      side.appendChild(hex);
      side.appendChild(el("div", "egoname", h.ult.ko));
      side.appendChild(el("div", "egolabel", "고학년 스킬"));
      side.appendChild(withKeywords(el("p", "egotext"), shortText(h.ult.text), key));
      wrap.appendChild(side);
    }
    w.appendChild(wrap);
    return w;
  }

  function sec(mark, label, n) {
    const d = el("div", "csec");
    d.appendChild(el("i", null, mark));
    d.appendChild(el("b", null, label));
    d.appendChild(el("span", "csn", String(n)));
    return d;
  }

  function flashPane(kit, CA, picFor) {
    const w = el("div", "pane");
    w.appendChild(el("p", "note", "고유 카드는 신탁 다섯 가운데 하나를 골라 바뀝니다 — ①강화 ②경량 ③연계 ④변형 ⑤각성."));
    kit.unique.forEach((c) => {
      const box = el("section", "flashbox");
      const head = el("div", "fhead");
      const pic = picFor(c);
      if (pic) head.appendChild(img(pic, "fpic"));
      head.appendChild(el("b", null, `${c.xcost ? "X" : c.cost}코 ${c.name}`));
      head.appendChild(el("span", "ftype", c.type));
      box.appendChild(head);
      box.appendChild(withKeywords(el("p", "ftext"), shortText(c.text), c.hero));
      const g = el("div", "flashgrid");
      for (const f of c.flash || []) {
        const n = el("div", "flash f" + f.n);
        n.appendChild(el("span", "fkind", `${"①②③④⑤"[f.n - 1] || ""} ${f.kind}`));
        n.appendChild(el("b", null, f.ko));
        n.appendChild(withKeywords(el("p"), shortText(f.text), c.hero));
        g.appendChild(n);
      }
      box.appendChild(g);
      w.appendChild(box);
    });
    return w;
  }

  function ultPane(key, h, CA) {
    const w = el("div", "pane");
    if (!h.ult) { w.appendChild(el("p", "note", "이 사도는 고학년 스킬이 없습니다.")); return w; }
    const big = el("div", "ultbig");
    const hex = el("div", "hex big");
    hex.appendChild(el("span", "hexcost", h.ult.cost + "%"));
    if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
    big.appendChild(hex);
    const info = el("div");
    info.appendChild(el("div", "egolabel", "고학년 스킬"));
    info.appendChild(el("h2", null, h.ult.ko));
    info.appendChild(withKeywords(el("p", "egotext"), shortText(h.ult.text), key));
    info.appendChild(el("p", "note", `게이지 ${h.ult.cost}% 를 씁니다. 게이지는 파티가 함께 채우고(코스트 1당 10%), 같은 사도가 잇달아 쓸 수 없습니다.`));
    big.appendChild(info);
    w.appendChild(big);
    return w;
  }

  function render() {
    if (view && view !== "도감") detailScreen(view);
    else if (view === "도감") dexScreen();
    else formScreen();
  }
  render();
  return s;
}

// ── 전투 ───────────────────────────────────────────────────────────────
// 카제나의 전투 화면을 따라 네 구역으로 짠다 — 적 · 아군 상태창 · 손패 · 코스트 창.
// 손패는 사도 배치 순서를 따른다(앞줄 사도의 카드가 왼쪽에 온다).
// onQuit — 메뉴의 「메인화면으로」. 없으면 그 줄을 안 보인다
export function fightScreen(run, onDone, onQuit) {
  const s = screen();
  s.classList.add("battle");
  const enemyIds = R.currentEnemies(run);
  const floor = R.currentFloor(run);
  // 싸움터 배경 — 층마다 한 장, 보스·이벤트 전투는 따로. 그림이 없으면(assets 는 저장소에 없다) 어두운 바탕이 남는다.
  setStageBg(s, run);
  const st = C.newCombat({
    partyKeys: run.party, rows: run.rows, deck: run.deck.slice(),
    enemyIds, hp: run.hp, maxHp: run.maxHp, traits: run.traits, gear: R.gearStats(run), gearFx: R.gearPassives(run), flash: run.flash,
    enemyHp: run.elite && !run.eventFight ? RULES.ENEMY_HP * RULES.ELITE_HP : undefined,   // 엘리트 칸 — 체력 ×1.5
    // 이벤트가 걸어 둔 「다음 전투」 효과는 여기서 한 번 가져간다 · 기적이 붙은 카드
    next: EV.takeNextFight(run), shin: run.shin, gauge: run.gauge || 0,   // 고학년 게이지는 전투 사이에 이어진다
    glow: run.forceGlow || R.rollEpiphany(run),   // 신탁 — 이 전투에서 빛날 카드(카제나). forceGlow 는 시험 도구가 정해 넣는 것
    seed: (run.seed + run.floor * 101 + run.node * 7 + (run.step || 0) * 13 + (run.eventFight ? 555 : 0)) >>> 0,
  });

  // 전리품 — 싸움을 열 때 정해 둔다(골드 · 엘리트 · 보스의 장비). 적이 쓰러질 때마다 골드를 나눠 떨군다.
  // 보상 화면은 없다 — 떨어진 것은 오른쪽 「얻은 것」 목록에 쌓이고, 이기면 그대로 챙긴다.
  const loot = run.eventFight ? null : R.rollReward(run);
  const goldShare = (() => {
    if (!loot || !loot.gold) return [];
    const n = st.enemies.length, base = Math.floor(loot.gold / n), out = st.enemies.map(() => base);
    out[n - 1] += loot.gold - base * n;
    return out;
  })();
  // 장비는 가장 센(체력이 가장 많은) 적이 들고 있다가 쓰러질 때 떨군다
  const carrier = st.enemies.reduce((a, b) => (b.maxHp > a.maxHp ? b : a), st.enemies[0]).idx;
  let itemsDropped = false;

  // ① 머리 — 어디서 싸우는가
  const head = el("div", "bhead");
  head.appendChild(el("span", "bwhere", `${floor.n}층 · ${floor.name}`));
  const mapNode = M.currentNode(run);
  const stageTag = mapNode ? `${M.stageName(run, mapNode)} ${M.KIND_KO[mapNode.type]}` : `${run.node + 1}번째 싸움`;
  head.appendChild(el("span", "bsub", `${floor.sub} · ${run.eventFight ? `이벤트 — ${run.eventFight.name}` : R.isBoss(run) ? `${mapNode ? M.stageName(run, mapNode) + " " : ""}층의 끝` : stageTag}`));
  const flashBox = el("span", "bflash");
  for (const id of run.traits) { const t = TRAITS[id]; const c = el("span", "flash", t.ko); c.title = t.text; flashBox.appendChild(c); }
  head.appendChild(flashBox);
  s.appendChild(head);

  // 오른쪽 위 메뉴 — 이어하기 · 설정 · 메인화면으로
  const menuBtn = el("button", "bmenu");
  menuBtn.title = "메뉴";
  for (let k = 0; k < 3; k++) menuBtn.appendChild(el("i"));
  menuBtn.onclick = () => openMenu();
  s.appendChild(menuBtn);

  // 위쪽 안내는 두지 않는다 — 고르고 끄는 법은 해 보면 안다. 막혔을 때(AP 모자람 등)만 잠깐 띄우고 지운다
  let sayT = 0;
  const say = (m) => { hint(m); clearTimeout(sayT); if (m) sayT = setTimeout(() => hint(""), 1800); };

  // ② 싸움터 — 왼쪽에 아군, 오른쪽에 적. 가장자리에 덱과 버린 더미.
  const field = el("div", "field");
  const drawPile = el("div", "pile2 draw");
  const allyField = el("div", "afield");
  const foeZone = el("div", "foes");
  const discPile = el("div", "pile2 disc");
  field.appendChild(drawPile);
  field.appendChild(allyField);
  field.appendChild(foeZone);
  field.appendChild(discPile);
  const turnTag = el("div", "turntag");
  field.appendChild(turnTag);
  s.appendChild(field);

  // ③ 고학년 게이지 — 파티 공용
  const gaugeBox = el("div", "gauge");
  const gaugeBar = el("div", "gbar");
  const gaugeFill = el("i");
  gaugeBar.appendChild(gaugeFill);
  // 비용 눈금 150·200·250·300 — 어디까지 차야 누가 쓸 수 있는지 한눈에 보인다
  for (const cost of RULES.ULT_COSTS) {
    const tick = el("i", "tick");
    tick.style.left = (cost / 300) * 100 + "%";
    tick.style.setProperty("--at", (cost / 300) * 100 + "%");   // 세로 게이지에서는 아래에서부터
    tick.dataset.cost = String(cost);
    gaugeBar.appendChild(tick);
  }
  gaugeBox.appendChild(el("span", "glabel", "고학년"));
  gaugeBox.appendChild(gaugeBar);
  // 누가 어디까지 차면 쓰는가 — 사도의 고학년 아이콘을 그 비용 높이에 붙인다
  const gaugeWho = el("div", "gwho");
  gaugeBar.appendChild(gaugeWho);
  const gaugeNum = el("span", "gnum");
  gaugeBox.appendChild(gaugeNum);
  s.appendChild(gaugeBox);

  // ④ 아군 상태창
  const allyZone = el("div", "allies");
  s.appendChild(allyZone);

  // ⑤ 코스트 창 + 손패 + 턴 종료
  const deckRow = el("div", "deckrow");
  const apBox = el("div", "apbox");
  const piles = el("span", "pile");
  const endBtn = el("button", "endturn", "턴 넘기기");
  deckRow.appendChild(apBox);
  deckRow.appendChild(piles);
  deckRow.appendChild(endBtn);
  s.appendChild(deckRow);

  const hand = el("div", "hand");
  s.appendChild(hand);

  // 기록은 접어 둔다 — 가장 최근 한 줄만 보이고, 누르면 펼친다.
  // 늘 다 펼쳐 두면 손패를 밀어내 한 화면에 안 들어왔다.
  const logWrap = el("div", "logwrap");
  const logLast = el("button", "loglast");
  const logBox = el("div", "log");
  logLast.onclick = () => logWrap.classList.toggle("open");
  logWrap.appendChild(logLast);
  logWrap.appendChild(logBox);
  // 기록 줄은 화면에 두지 않는다 — 싸움터에서 다 보이고(패시브 이름 · 피해 숫자) 자리만 먹었다. 만들어는 둔다(draw 가 채운다)

  let selCard = -1;
  const goneFoes = new Set();              // 쓰러져 골드를 떨군 적 — 한 번만

  // ── 얻은 것 — 오른쪽 목록 ─────────────────────────────────────────────
  const lootBox = el("div", "lootbox");
  lootBox.appendChild(el("div", "lthead", "얻은 것"));
  const lootList = el("div", "ltlist");
  lootBox.appendChild(lootList);
  s.appendChild(lootBox);
  let lootGold = 0, goldRow = null;
  const ground = [];                        // 바닥에 떨어진 금화 { node, x, y, gold, taken }
  s._st = st;                              // 시험 도구가 판을 읽는다(적 체력을 낮춰 승리 연출 보기 등)
  const groundOk = typeof document === "object" && !!document.body && typeof innerWidth === "number";
  const zNow = () => (typeof getZoom === "function" && getZoom()) || 1;
  // 떨어진 것이 목록으로 날아간다 — from 은 화면 좌표(getBoundingClientRect)
  function flyTo(node, from) {
    if (typeof document !== "object" || !lootBox.getBoundingClientRect) return;
    const z = zNow(), to = lootBox.getBoundingClientRect();
    node.style.left = from.x / z + "px"; node.style.top = from.y / z + "px";
    node.style.setProperty("--dx", ((to.left + 30) - from.x) / z + "px");
    node.style.setProperty("--dy", ((to.top + 40) - from.y) / z + "px");
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1200);
  }
  function addLoot(row) {
    lootBox.classList.add("on");
    row.classList.add("ltnew");
    lootList.appendChild(row);
    setTimeout(() => row.classList.remove("ltnew"), 900);
  }
  function dropGold(node, u) {
    const r = node.getBoundingClientRect ? node.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    if (u.idx === carrier) dropItems({ x: r.left + r.width / 2, y: r.top + r.height * 0.45 });
    const g = goldShare[u.idx] || 0;
    if (!g) return;
    // 진짜 화면이면 쓰러진 자리(발밑)에 금화가 떨어져 남는다 — 이기면 사도들이 오른쪽으로 달려가며 줍는다(walkOut).
    // 가짜 DOM(시험)처럼 자리를 잴 수 없으면 예전처럼 바로 목록으로
    if (!groundOk || !r.width) { addGold(g); return; }
    const z = zNow(), n = 3 + Math.min(3, Math.floor(g / 15));
    for (let k = 0; k < n; k++) {
      const c = goldIcon("groundcoin");
      const x = r.left + r.width / 2 + (k - (n - 1) / 2) * 22 + (Math.random() - 0.5) * 10;
      const y = r.top + r.height * 0.86 + (Math.random() - 0.5) * 14;
      c.style.left = x / z + "px"; c.style.top = y / z + "px";
      c.style.setProperty("--k", String(k));
      document.body.appendChild(c);
      ground.push({ node: c, x, y, gold: Math.round(g / n) + (k === 0 ? g - Math.round(g / n) * n : 0) });
    }
  }
  // 목록의 골드 줄 — 주운 만큼 오른다
  function addGold(g) {
    lootGold += g;
    if (!goldRow) { goldRow = el("div", "ltrow ltgold"); addLoot(goldRow); }
    else { goldRow.classList.add("ltnew"); setTimeout(() => goldRow.classList.remove("ltnew"), 900); }
    goldRow.innerHTML = "";
    goldRow.appendChild(goldIcon("lticon coin"));
    goldRow.appendChild(el("b", null, `+${lootGold} 골드`));
  }
  // 바닥의 금화 하나를 줍는다 — 목록으로 날아가고 골드 줄이 오른다
  function pickCoin(c) {
    if (c.taken) return;
    c.taken = true;
    const z = zNow();
    c.node.remove();
    const fly = goldIcon("dropcoin");
    fly.style.setProperty("--k", "0");
    flyTo(fly, { x: c.x, y: c.y });
    addGold(c.gold);
  }
  // 이겼다 — 사도들이 달리는 동작으로 오른쪽 끝까지 가며 바닥의 금화를 줍는다. 다 가면 then()
  function walkOut(then) {
    const heroes = [...standEls.values()].filter((n) => !n.classList.contains("dead"));
    if (!groundOk || !heroes.length || typeof requestAnimationFrame !== "function") { for (const c of ground) pickCoin(c); return then(); }
    s.classList.add("victory");
    const z = zNow(), W = innerWidth || 1600;
    const DUR = 1900;
    heroes.forEach((n, i) => {
      const v = n.querySelector(".art") && n.querySelector(".art").spine;
      if (v) v.play("Move", true) || v.play("Run", true);
      const r = n.getBoundingClientRect();
      n.style.transition = `transform ${DUR}ms cubic-bezier(.45, 0, .7, 1) ${i * 120}ms`;
      n.style.transform = `translateX(${(W - r.left) / z + 160}px)`;
      n.classList.add("walking");
    });
    const t0 = performance.now();
    const tick = () => {
      // 누구든 금화를 지나가면 줍는다
      const xs = heroes.map((n) => { const r = n.getBoundingClientRect(); return r.left + r.width * 0.65; });
      for (const c of ground) if (!c.taken && xs.some((x) => x >= c.x)) pickCoin(c);
      if (performance.now() - t0 < DUR + heroes.length * 120 + 150) requestAnimationFrame(tick);
      else { for (const c of ground) pickCoin(c); then(); }
    };
    requestAnimationFrame(tick);
  }
  // 들고 있던 것 — 장비 아이콘이 적 자리에서 목록으로 날아간다
  function dropItems(from) {
    if (itemsDropped || !loot) return;
    itemsDropped = true;
    if (loot.equip && loot.equip[0]) {
      const id = loot.equip[0], ic = equipIcon(EQUIP[id], 64);
      ic.classList.add("dropequip");
      setTimeout(() => { flyTo(ic, from); dropEquip(id); }, 250);
    }
  }
  function lootCard(id, label, from) {
    const c = CARDS[id];
    const card = bigCard(c, CARDART.pic[id] || null);
    card.classList.add("dropcard");
    const z = zNow();
    flyTo(card, from || { x: (innerWidth || 1600) / 2, y: (innerHeight || 900) * 0.4 });
    const row = el("div", "ltrow");
    const th = el("span", "ltthumb");
    const pic = CARDART.pic[id];
    if (pic) th.appendChild(img(pic)); else th.appendChild(el("b", null, c.name.slice(0, 1)));
    row.appendChild(th);
    const t = el("div");
    t.appendChild(el("b", null, c.name));
    t.appendChild(el("span", null, label));
    row.appendChild(t);
    row.onclick = () => showCard(c, c.hero);
    addLoot(row);
  }
  function dropEquip(id) {
    const e = EQUIP[id];
    const row = el("div", "ltrow");
    row.appendChild(equipIcon(e, 34));
    const t = el("div");
    t.appendChild(el("b", null, e.ko));
    t.appendChild(el("span", null, `${e.slot} · ${e.grade} — 가방으로`));
    row.appendChild(t);
    addLoot(row);
  }
  // 적 칸 — 미리보기를 그 위에 얹으려고 idx 로 들고 있는다
  const foeEls = new Map();
  const allyPv = new Map();          // 아군 idx → 미리보기 자리(싸움터에 선 모습)
  // 싸움터에 선 아군 — 패시브가 발동하면 그 위에 이름을 띄우려고 key 로 들고 있는다
  const standEls = new Map();
  let shownTurn = 0;
  let logShown = 0;

  // 사도 배치 순서 — 앞줄부터. 손패를 이 순서로 줄 세운다(카제나가 그렇게 한다).
  const orderOf = (heroKey) => {
    const u = st.party.find((x) => x.key === heroKey);
    if (!u) return 99;                       // 교주 카드는 맨 뒤
    return C.ROWS.indexOf(u.row) * 10 + u.idx;
  };

  // ── 적 칸 ────────────────────────────────────────────────────────────
  function foeNode(u, clickable, onPick) {
    // 쓰러진 적에게는 표적 표시를 안 한다 — 눌러도 아무 일이 없는데 누를 수 있어 보였다.
    const pick = clickable && !u.dead;
    const fresh = u.dead && !goneFoes.has(u.idx);
    const n = el("div", "foe" + (u.dead ? (fresh ? " dying" : " dead") : "") + (pick ? " tgt" : "") + (u.boss ? " boss" : ""));
    if (fresh) { goneFoes.add(u.idx); setTimeout(() => dropGold(n, u), 30); }
    n.dataset.idx = String(u.idx);          // 카드를 끌어 놓을 때 누구인지
    if (u.sealed) n.classList.add("sealed");

    // 의도 — 무엇을 하려는가. 카제나도 적 위에 붙인다.
    // 치는 수는 마름모에 숫자를 크게(힘·약화가 들어간 값) — 다음 턴에 얼마나 맞는지가 가장 먼저 읽혀야 한다.
    if (u.intent && !u.dead) {
      const it = u.intent;
      const hitV = C.intentHit(u);
      const hit = hitV != null;
      const icon = { block: "🛡", guard: "🛡", buff: "▲", debuff: "▼", jam: "✖", heal: "✚", charge: "!" }[it.t] || "·";
      const tag = el("div", "intent i-" + (hit ? "hit" : it.t));
      const gem = el("span", "igem");
      gem.appendChild(el("b", null, hit ? (it.t === "multi" ? `${hitV}×${it.n}` : String(hitV)) : icon));
      tag.appendChild(gem);
      const more = it.t === "attackAll" ? " · 전체" : it.t === "back" ? " · 뒷줄" : it.t === "guard" ? " · 적 전체"
        : it.t === "charge" ? ` → 다음 턴 ${it.next.say} ${it.next.v}${it.next.t === "attackAll" ? " 전체" : ""}`
        : it.id && hit ? ` · ${it.id} ${it.n || 1}` : "";
      tag.appendChild(el("span", "isay", it.say + more));
      tag.title = INTENT_HELP[it.t] || "";
      n.appendChild(tag);
    }

    const nat = (ENEMY_NATURE[u.key] || null);
    n.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: u.boss ? 148 : 116, slot: "foe", skin: NATURE_SKIN[nat] }));

    const name = el("div", "fname");
    name.appendChild(el("span", null, u.ko));
    if (nat) name.appendChild(el("span", "nature n" + nat, nat));
    n.appendChild(name);

    const hb = hpBar(u);
    n.appendChild(hb);
    n.appendChild(chips(u));
    n.onclick = () => openFoe(u);              // 누르면 적 정보 — 카드는 끌어서만 낸다
    n.title = "눌러서 적 정보 보기";
    // 카드를 고른 채 적에 올리면 그 적을 쳤을 때의 결과를 모두에게 보여 준다(광역 곁가지까지)
    n.onmouseenter = () => { if (selCard >= 0 && !u.dead) paintPreview(selCard, u.idx); };
    n.onmouseleave = () => paintPreview(selCard, null);
    const pv = el("div", "pv");
    n.appendChild(pv);
    foeEls.set(u.idx, { n, pv, ghost: hb.ghost });
    return n;
  }

  // ── 싸움터에 선 아군 ─────────────────────────────────────────────────
  // 전열이 앞, 후열이 뒤. 줄이 곧 서는 자리다.
  function standNode(u, clickable, onPick) {
    const pick = clickable && !u.dead;
    const n = el("div", "stand r" + u.row + (u.dead ? " dead" : "") + (pick ? " tgt" : ""));
    n.dataset.idx = String(u.idx);
    if (u.sealed) n.classList.add("sealed");
    n.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 104, slot: "battle", flip: true }));
    const tag = el("div", "sname");
    tag.appendChild(el("span", null, u.ko));
    n.appendChild(tag);
    const hb = hpBar(u);
    n.appendChild(hb);
    n.appendChild(chips(u));
    if (st.bubble && st.bubble.hero === u.key) n.appendChild(el("div", "bubble", st.bubble.text));
    n.onclick = () => openHero(u);              // 누르면 사도 정보
    n.title = "눌러서 사도 정보 보기";
    // 아군 미리보기 — 회복 · 방어 · 실드가 얼마나 붙는지(시전자 능력치로 엔진이 센 값)
    const pv = el("div", "pv apv");
    n.appendChild(pv);
    allyPv.set(u.idx, { n, pv, gain: hb.gain });
    n.onmouseenter = () => { if (selCard >= 0 && !u.dead && targetsNeeded(st.hand[selCard]) === "party") paintPreview(selCard, u.idx); };
    n.onmouseleave = () => { if (selCard >= 0) paintPreview(selCard, null); };
    return n;
  }

  // ── 아군 상태창 ──────────────────────────────────────────────────────
  function allyNode(u, clickable, onPick) {
    // 체력은 싸움터에 서 있는 모습 아래에 있다. 여기 또 두면 같은 숫자가 두 번 뜬다.
    const n = el("div", "ally" + (u.dead ? " dead" : "") + (clickable ? " tgt" : ""));
    const ultPic = CARDART.pic[u.key + "_ult"];
    if (!ultPic || !C.ultOf(u.key)) n.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 44, slot: "battle", flip: true }));

    const box = el("div", "abody");
    const top = el("div", "atop");
    top.appendChild(el("span", "nm", u.ko));
    const nat = C.natureOf(u.key);
    if (nat) top.appendChild(el("span", "nature n" + nat, nat));
    top.appendChild(el("span", "row", ROW_KO[u.row]));
    box.appendChild(top);
    box.appendChild(chips(u));

    // 고학년 스킬 — 게이지가 차면 누를 수 있다
    const ult = C.ultOf(u.key);
    if (ult && !u.dead) {
      const why = C.canUlt(st, u.key);
      const b = el("button", "ultbtn" + (why ? " no" : "") + (ultPic ? " grad" : ""));
      if (ultPic) {
        // 고학년 스킬 단추 — 둥근 얼굴 아이콘. 둘레 고리가 게이지만큼 차고, 다 차면 빛난다
        const face = el("span", "uface");
        face.appendChild(img(ultPic));
        face.style.setProperty("--pct", Math.min(100, (st.gauge / ult.cost) * 100).toFixed(1));   // 둘레 고리가 이만큼 찬다
        b.appendChild(face);
      }
      b.appendChild(el("span", "ucost", `${ult.cost}%`));
      b.appendChild(el("span", "uname", ult.ko));
      b.title = "눌러서 고학년 스킬 보기";
      b.onclick = () => openUlt(u);
      box.appendChild(b);
    }

    n.appendChild(box);
    return n;
  }

  function hpBar(u) {
    // 실드·방어가 있으면 막대에 테를 두른다 — 숫자를 안 읽어도 누가 막혀 있는지 보인다
    const wrap = el("div", "hpwrap" + (u.shield > 0 ? " shielded" : "") + (u.block > 0 ? " blocked" : ""));
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%";
    bar.appendChild(fill);
    // 미리보기 — 깎일 만큼을 막대 끝에 그림자로
    wrap.ghost = el("s", "ghost");
    bar.appendChild(wrap.ghost);
    wrap.gain = el("s", "gain");                // 회복 미리보기 — 찰 만큼을 초록으로
    bar.appendChild(wrap.gain);
    wrap.appendChild(bar);
    const nums = el("div", "nums");
    nums.appendChild(el("span", null, `${Math.max(0, u.hp)} / ${u.maxHp}`));
    if (u.block > 0) nums.appendChild(el("span", "b", `방어 ${u.block}`));
    if (u.shield > 0) nums.appendChild(el("span", "sh", `실드 ${u.shield}`));
    wrap.appendChild(nums);
    return wrap;
  }

  function chips(u) {
    const box = el("div", "chips");
    for (const [k, v] of Object.entries(u.status || {})) {
      if (!v) continue;
      // 적에게 거는 표식·아군에게 씌우는 키워드(늑대 표식·계시)는 키워드 빛으로
      const isKw = !!(st.kw || {})[k];
      box.appendChild(el("span", "chip" + (isKw ? " key" : ["취약", "약화", "감전", "중독", "기절", "침묵"].includes(k) ? " bad" : ""), `${k} ${v}`));
    }
    // 걸려 있는 증감 — 같은 종류는 합쳐서 한 칸. 패시브의 「항상」 과 키워드 1개당도 들어간 값이다
    const MODS = [["dealt", "주는 피해"], ["taken", "받는 피해"], ["atk", "공격력"], ["def", "방어력"], ["crit", "치명"]];
    for (const [stat, ko] of MODS) {
      const v = Math.round(C.statOf(st, u, stat) * 100);
      if (!v) continue;
      const good = stat === "taken" ? v < 0 : v > 0;
      box.appendChild(el("span", "chip mod " + (good ? "up" : "down"), `${ko} ${v > 0 ? "+" : ""}${v}%`));
    }
    // 사도 전용 키워드(간식·수은막…)도 여기 보인다
    const stk = (st.stacks || {})[u.key];
    if (stk) for (const [k, v] of Object.entries(stk)) if (v) box.appendChild(el("span", "chip key", `${k} ${v}`));
    return box;
  }

  // ── 피해 미리보기 ────────────────────────────────────────────────────
  // 카드를 고르거나 손패에서 카드에 올리면, 적마다 얼마나 깎이는지 적 위에 띄운다.
  // 한 명을 고르는 카드는 적마다 "이 적을 치면" 의 값을, 적에 올리면 그 적을 쳤을 때의 전부를 보여 준다.
  // 계산은 엔진이 한다(C.previewCard) — 판을 복사해 실제로 내 보는 것이라 실제와 어긋나지 않는다.
  function paintPreview(handIdx, hoverIdx) {
    for (const [, { n, pv, ghost }] of foeEls) {
      n.classList.remove("pvon"); n.classList.remove("pvkill");
      pv.innerHTML = "";
      if (ghost) ghost.style.width = "0";
    }
    for (const [, { n, pv, gain }] of allyPv) {
      n.classList.remove("pvon");
      pv.innerHTML = "";
      if (gain) gain.style.width = "0";
    }
    if (handIdx == null || handIdx < 0 || st.over) return;
    const id = st.hand[handIdx]; if (!id) return;
    const need = targetsNeeded(id);
    const res = {};
    if (need === "enemy" && hoverIdx == null) {
      for (const e of st.enemies) {
        if (e.dead) continue;
        const p = C.previewCard(st, handIdx, e.idx);
        if (p && p[e.idx]) res[e.idx] = p[e.idx];
      }
    } else {
      const p = C.previewCard(st, handIdx, hoverIdx == null ? 0 : hoverIdx);
      if (p) p.forEach((x, i) => { if (x) res[i] = x; });
    }
    paintAllies(handIdx, need, hoverIdx);
    for (const [i, x] of Object.entries(res)) {
      const slot = foeEls.get(Number(i)); const u = st.enemies[i];
      if (!slot || !u) continue;
      const { n, pv, ghost: g } = slot;
      n.classList.add("pvon");
      if (x.kill) n.classList.add("pvkill");
      if (x.max) pv.appendChild(el("small", null, "최대"));
      pv.appendChild(el("b", null, x.kill ? "처치" : `-${x.hp}`));
      if (x.kill && x.hp) pv.appendChild(el("span", "pvhp", `-${x.hp}`));
      if (x.guard) pv.appendChild(el("span", "pvg", `🛡-${x.guard}`));
      if (g) {
        const left = Math.max(0, u.hp - x.hp);
        g.style.left = (left / u.maxHp) * 100 + "%";
        g.style.width = (Math.min(u.hp, x.hp) / u.maxHp) * 100 + "%";
      }
    }
  }

  // 아군 미리보기 — 아군에게 놓는 카드는 「이 사도에게 놓으면」 을 사도마다, 올린 사도가 있으면 그때의 전부를.
  // 그 밖의 카드(자신 · 아군 전원 · 적에게 내는 카드의 곁가지)는 한 번 내 본 결과를 모두에게
  function paintAllies(handIdx, need, hoverIdx) {
    const res = {};
    if (need === "party" && hoverIdx == null) {
      for (const u of st.party) {
        if (u.dead) continue;
        const p = C.previewAllies(st, handIdx, u.idx);
        if (p && p[u.idx]) res[u.idx] = p[u.idx];
      }
    } else {
      const p = C.previewAllies(st, handIdx, hoverIdx == null ? 0 : hoverIdx);
      if (p) p.forEach((x, i) => { if (x) res[i] = x; });
    }
    // 아군에게 놓는 회복 카드인데 체력이 가득한 사도 — 아무것도 안 뜨면 헷갈리니 「HP 가득」
    const c = C.cardOf(st, st.hand[handIdx]);
    if (need === "party" && c && (c.fx || []).some((f) => f.k === "heal")) {
      for (const u of st.party) {
        if (u.dead || res[u.idx] || u.hp < u.maxHp) continue;
        if (hoverIdx != null && hoverIdx !== u.idx) continue;
        const slot = allyPv.get(u.idx);
        if (!slot) continue;
        slot.n.classList.add("pvon");
        slot.pv.appendChild(el("span", "pvfull", "HP 가득"));
      }
    }
    for (const [i, x] of Object.entries(res)) {
      const slot = allyPv.get(Number(i)); const u = st.party[i];
      if (!slot || !u) continue;
      slot.n.classList.add("pvon");
      if (x.heal) slot.pv.appendChild(el("b", "pvheal", `+${x.heal}`));
      if (x.block) slot.pv.appendChild(el("span", "pvblk", `방어 +${x.block}`));
      if (x.shield) slot.pv.appendChild(el("span", "pvsh", `실드 +${x.shield}`));
      if (x.lose) slot.pv.appendChild(el("span", "pvlose", `HP -${x.lose}`));
      if (x.heal && slot.gain) {
        slot.gain.style.left = (Math.max(0, u.hp) / u.maxHp) * 100 + "%";
        slot.gain.style.width = (Math.min(x.heal, u.maxHp - u.hp) / u.maxHp) * 100 + "%";
      }
    }
  }

  function targetsNeeded(cardId) {
    const c = C.cardOf(st, cardId);
    if (!c) return null;
    return c.target === "적" ? "enemy" : c.target === "아군" ? "party" : null;
  }

  // ── 그리기 ───────────────────────────────────────────────────────────
  function draw() {
    closeModal();
    const need = selCard >= 0 ? targetsNeeded(st.hand[selCard]) : null;

    field.style.setProperty("--nf", String(Math.max(1, st.enemies.length)));
    field.style.setProperty("--na", String(Math.max(1, st.party.length)));
    foeZone.innerHTML = "";
    foeEls.clear();
    for (const u of st.enemies) foeZone.appendChild(foeNode(u, need === "enemy", (t) => play(t.idx)));

    // 싸움터에 선 아군 — 전열이 앞, 후열이 뒤
    allyField.innerHTML = "";
    standEls.clear();
    allyPv.clear();
    for (const u of [...st.party].sort((a, b) => C.ROWS.indexOf(b.row) - C.ROWS.indexOf(a.row))) {
      const sn = standNode(u, need === "party", (t) => play(t.idx));
      standEls.set(u.key, sn);
      allyField.appendChild(sn);
    }

    allyZone.innerHTML = "";
    for (const u of st.party) allyZone.appendChild(allyNode(u, need === "party", (t) => play(t.idx)));

    // 덱 더미 — 가장자리에 둔다. 몇 장 남았는지가 판단에 들어간다.
    drawPile.innerHTML = "";
    drawPile.appendChild(el("span", "pnum", String(st.draw.length)));
    drawPile.appendChild(el("span", "plab", "뽑을 것"));
    drawPile.title = "눌러서 남은 카드 보기";
    const piles = () => [
      { key: "draw", label: "뽑을 더미", ids: st.draw, why: "차례는 안 보여 줍니다 — 섞여 있습니다." },
      { key: "disc", label: "버린 더미", ids: st.discard, why: "덱이 바닥나면 섞여서 뽑을 더미로 돌아갑니다." },
      { key: "gone", label: "사라진 카드", ids: st.gone, why: "소멸했거나 손이 넘쳐 사라진 카드 — 이 판에서 다시 안 나옵니다." },
      { key: "all", label: "덱 전체", ids: run.deck, why: "이 판의 덱. 신탁이 붙은 카드는 바뀐 모습으로 보입니다." },
    ];
    const cardFor = (id) => C.cardOf(st, id);
    drawPile.onclick = () => showPiles(piles(), "draw", cardFor, openCard);
    discPile.innerHTML = "";
    discPile.appendChild(el("span", "pnum", String(st.discard.length)));
    discPile.appendChild(el("span", "plab", "버린 것"));
    discPile.title = "눌러서 버린 카드 보기";
    discPile.onclick = () => showPiles(piles(), "disc", cardFor, openCard);
    turnTag.textContent = `${st.turn}턴`;
    // 턴이 바뀌면 싸움터 가운데에 크게 알린다 — 적이 무엇을 했는지 보기 전에 턴이 넘어간 걸 알아야 한다.
    if (st.turn !== shownTurn && !st.over) {
      shownTurn = st.turn;
      const ban = el("div", "turnban");
      ban.appendChild(el("small", null, "TURN"));
      ban.appendChild(el("b", null, String(st.turn)));
      field.appendChild(ban);
      setTimeout(() => ban.remove(), 1300);
    }

    // 코스트 창 — 카제나는 여기가 손패의 핵심이다
    apBox.innerHTML = "";
    apBox.appendChild(el("span", "apnum", String(st.ap)));
    apBox.appendChild(el("span", "aplabel", "AP"));
    apBox.title = st.turn === 1 && st.startSp
      ? `매 턴 ${st.apPerTurn} · 이번 전투 첫 턴 +${st.startSp}`
      : `매 턴 ${st.apPerTurn} · 남으면 사라집니다`;
    // 눈금 — 몇 개 남았는지 숫자보다 빨리 읽힌다
    const pips = el("span", "appips");
    const most = Math.max(st.ap, st.apPerTurn || RULES.AP_PER_TURN);
    for (let k = 0; k < most; k++) pips.appendChild(el("i", k < st.ap ? "on" : ""));   // 모양은 css 가 별로 깎는다
    apBox.appendChild(pips);
    piles.textContent = `덱 ${st.draw.length + st.discard.length}장`;

    gaugeFill.style.width = (st.gauge / 300) * 100 + "%";
    gaugeBox.style.setProperty("--g", (st.gauge / 300) * 100 + "%");
    gaugeWho.innerHTML = "";
    const seen = {};
    for (const u of st.party) {
      const ult = C.ultOf(u.key);
      if (!ult || u.dead) continue;
      const k = seen[ult.cost] = (seen[ult.cost] || 0) + 1;       // 같은 비용이면 옆으로 비껴 선다
      const g = el("span", "gface" + (st.gauge >= ult.cost ? " on" : ""));
      g.style.bottom = (ult.cost / 300) * 100 + "%";
      g.style.setProperty("--k", String(k - 1));
      g.title = `${u.ko} · ${ult.ko} (${ult.cost}%)`;
      const pic = CARDART.pic[u.key + "_ult"];
      if (pic) g.appendChild(img(pic));
      else g.appendChild(el("b", null, u.ko.slice(0, 1)));
      gaugeWho.appendChild(g);
    }
    gaugeNum.textContent = `${st.gauge}%`;
    gaugeBox.classList.toggle("ready", st.party.some((u) => !u.dead && C.canUlt(st, u.key) === null));

    // 손패 — 사도 배치 순서로 줄 세운다
    hand.innerHTML = "";
    const order = st.hand.map((id, i) => ({ id, i })).sort((a, b) => {
      const ca = C.cardOf(st, a.id), cb = C.cardOf(st, b.id);
      const d = orderOf(ca && ca.hero) - orderOf(cb && cb.hero);
      return d !== 0 ? d : a.i - b.i;
    });
    for (const { id, i } of order) {
      const c = C.cardOf(st, id);
      const why = C.canPlay(st, id);
      // 도감 카드와 같은 꼴로 세운다 — 그림이 카드를 채우고 글자가 그 위에 얹힌다.
      const pic = CARDART.pic[id] || null;
      const full = !!pic && pic.includes("/cardart/");
      const b = el("button", "card gcard k-" + (TKIND[c.type] || "skill") + natureClass(c)
        + (full ? " full" : "") + (why ? " no" : "") + (selCard === i ? " sel" : "") + (c.ego ? " ego" : "")
        + (C.glowOf(st, id) ? " glow glow-" + C.glowOf(st, id).kind : "") + (st.freeTurn && st.freeTurn[id] ? " fresh" : ""));

      const chead = el("div", "ghead");
      chead.appendChild(el("span", "gcost", c.xcost ? "X" : `${C.costOf(st, id)}`));
      const ctitle = el("div", "gtitle");
      ctitle.appendChild(el("b", null, c.name));
      const cty = el("span", "gtype");
      cty.appendChild(el("i", null, TMARK[c.type] || "◈"));
      cty.appendChild(el("span", null, c.type));
      ctitle.appendChild(cty);
      chead.appendChild(ctitle);
      b.appendChild(chead);

      const cart = el("div", "gart");
      if (pic) cart.appendChild(img(pic, "gpic"));
      else if (c.hero) { cart.classList.add("heroart"); cart.appendChild(art.portrait(c.hero, { ko: "", slot: "battle", still: true, size: 0 })); }
      else cart.appendChild(el("span", "gglyph", TMARK[c.type] || "◈"));
      b.appendChild(cart);

      const cbody = el("p", "gtext");
      withKeywords(cbody, cardParts({ ...c, name: c.name }, c.hero).action, c.hero);
      b.appendChild(cbody);

      // 누구 카드인가 — 아래에 가는 띠 하나. 손패가 사도 순서로 서 있으니 띠만 있으면 읽힌다.
      if (c.hero) {
        const stripe = el("span", "cown");
        stripe.style.background = TINT(c.hero);
        stripe.title = HERO(c.hero).ko;
        b.appendChild(stripe);
      }
      b.title = why || "";
      b.onmouseenter = () => { if (!why) paintPreview(i, null); };
      b.onmouseleave = () => paintPreview(selCard, null);
      b.dataset.i = String(i);
      b.onpointerdown = (e) => startDrag(e, i, id, b, !!why);
      // 자세히 — 오른쪽 클릭(PC) · 길게 누르기(폰, startDrag 가 잰다)
      b.oncontextmenu = (e) => { e.preventDefault(); if (drag) stopDrag(true); openCard(id); };
      b.onclick = () => {
        if (dragDone) return;                 // 방금 끌어서 낸 카드 — 뒤따라오는 click 은 버린다
        if (why) return say(why);
        hint("");
        const want = targetsNeeded(id);
        // 고르기만 하고 아무 말이 없으면 "안 써진다"고 느낀다 — 실제로 그런 말을 들었다.
        // 눌러서는 어떤 카드도 안 나간다 — 잘못 눌러 나가 버리는 일이 잦았다(방어 · 버프부터, 공격도 같게).
        // 들어 올려 보여 주기만 하고, 끌어 놓아야 쓴다(startDrag → dropCard).
        selCard = selCard === i ? -1 : i;
        draw();
      };
      hand.appendChild(b);
    }
    // 손에 든 것처럼 펼친다 — 가운데가 앞, 바깥으로 갈수록 기울고 내려간다.
    {
      const cards = [...hand.children];
      const n = cards.length;
      cards.forEach((c, k) => {
        const t = n === 1 ? 0 : (k - (n - 1) / 2) / ((n - 1) / 2);   // -1 … +1
        const tilt = t * Math.min(9, 26 / n);
        const dip = Math.abs(t) * Math.min(16, 44 / n);
        c.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
        c.style.setProperty("--dip", dip.toFixed(1) + "px");
        c.style.zIndex = String(20 - Math.round(Math.abs(t) * 10));
      });
    }

    // 패시브가 발동했으면 그 사도 위에 이름을 띄운다 — 기록에 「에르핀 · 와구와구」 로 남는다
    for (const line of st.log.slice(logShown)) {
      const m = line.match(/^(.+?) · (.+)$/);
      if (!m) continue;
      const who = st.party.find((u) => u.ko === m[1]);
      const node = who && standEls.get(who.key);
      if (node) { const f = el("div", "pfire", m[2]); node.appendChild(f); setTimeout(() => f.remove(), 1600); }
    }
    for (; logShown < st.log.length; logShown++) {
      const line = st.log[logShown];
      logBox.appendChild(el("div", line.startsWith("연계") ? "combo" : null, line));
    }
    logBox.scrollTop = logBox.scrollHeight;
    logLast.innerHTML = "";
    logLast.appendChild(el("span", "lglab", "기록"));
    logLast.appendChild(el("span", "lgtxt", st.log.length ? st.log[st.log.length - 1] : ""));
    logLast.appendChild(el("span", "lgmore", `${st.log.length}줄 ▾`));

    paintPreview(selCard, null);
    if (st.over) finish();
  }

  // ── 끌어서 내기 ──────────────────────────────────────────────────────
  // 카드를 끌어 적(또는 아군) 위에 놓으면 그 대상에게 낸다. 대상이 없는 카드는 손패 위로 끌어 올려 놓으면 낸다.
  // 끄는 동안: 카드가 손을 따라오고, 카드에서 화살이 뻗고, 칠 수 있는 대상이 빛나고, 올린 대상에 피해 미리보기가 뜬다.
  // 눌러서 고르는 방식은 그대로 된다 — 10px 넘게 움직여야 끌기로 본다.
  // 화면은 CSS zoom 이 걸려 있어 fixed 좌표를 배율로 나눈다(clientX 는 실제 화면 좌표).
  let drag = null, dragDone = false;
  const zoomNow = () => (typeof getZoom === "function" && getZoom()) || 1;
  function startDrag(e, i, id, card, locked) {
    if (st.over || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { i, id, card, x0: e.clientX, y0: e.clientY, on: false, over: null, need: targetsNeeded(id), locked };
    // 움직이지 않고 0.5초 누르고 있으면 자세히 본다 — 뒤따르는 click 은 버린다
    drag.hold = setTimeout(() => {
      if (!drag || drag.on) return;
      const d = drag; drag = null;
      d.card.onpointermove = d.card.onpointerup = d.card.onpointercancel = null;
      dragDone = true; setTimeout(() => { dragDone = false; }, 400);
      openCard(d.id);
    }, 450);
    try { card.setPointerCapture(e.pointerId); } catch { /* 가짜 DOM */ }
    card.onpointermove = moveDrag;
    card.onpointerup = endDrag;
    card.onpointercancel = () => stopDrag(true);
  }
  function beginDrag() {
    drag.on = true;
    const z = zoomNow();
    const r = drag.card.getBoundingClientRect();
    drag.ax = (r.left + r.width / 2) / z; drag.ay = r.top / z;
    drag.card.classList.add("dragging");
    const fx = el("div", "dragfx");
    if (drag.need) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(path); fx.appendChild(svg); drag.path = path;
    }
    const ghost = drag.card.cloneNode(true);
    ghost.className = drag.card.className.replace(/\b(dragging|sel)\b/g, "") + " dghost";
    ghost.removeAttribute("style");
    fx.appendChild(ghost);
    drag.fx = fx; drag.ghost = ghost;
    document.body.appendChild(fx);
    // 칠 수 있는 대상을 빛낸다 — draw() 로 다시 그리면 끄는 카드가 사라지니 표시만 단다
    if (drag.need === "enemy") for (const [, { n }] of foeEls) { if (!n.classList.contains("dead")) n.classList.add("tgt", "dtgt"); }
    if (drag.need === "party") for (const [, n] of standEls) { if (!n.classList.contains("dead")) n.classList.add("tgt", "dtgt"); }
    paintPreview(drag.i, null);                 // 끌기 시작 — 대상마다 「여기 놓으면」 을 미리 띄운다
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10) return;
      clearTimeout(drag.hold);
      if (drag.locked) { stopDrag(true); return; }        // 못 내는 카드는 끌지 않는다
      beginDrag();
    }
    const z = zoomNow(), x = e.clientX / z, y = e.clientY / z;
    drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px";
    if (drag.path) {
      const cx = (drag.ax + x) / 2, cy = Math.min(drag.ay, y) - 140;
      drag.path.setAttribute("d", `M${drag.ax},${drag.ay} Q${cx},${cy} ${x},${y}`);
    }
    // 손 밑에 무엇이 있나 — 끌리는 그림과 화살은 pointer-events 가 없어 밑이 잡힌다
    let t = null;
    if (drag.need) {
      t = pickTarget(e.clientX, e.clientY, drag.need === "enemy" ? ".foe.dtgt" : ".stand.dtgt");
    } else {
      const hr = hand.getBoundingClientRect();
      t = e.clientY < hr.top - 10 ? drag.fx : null;       // 손패 위로 올라왔다
    }
    if (t !== drag.over) {
      if (drag.over && drag.over !== drag.fx) drag.over.classList.remove("dover");
      drag.over = t;
      if (t && t !== drag.fx) t.classList.add("dover");
      drag.fx.classList.toggle("armed", !!t);
      if (drag.need) paintPreview(drag.i, t ? Number(t.dataset.idx) : null);
    }
  }
  // 끌어 놓을 대상 — 이름표 · 체력 칸만이 아니라 서 있는 그림 전체(칸 밖으로 넘친 캔버스까지)를 잡고,
  // 그 둘레 24px 까지 넉넉히 본다. 여럿이 걸리면 가운데가 가까운 쪽. 아무 데도 안 걸려도 110px 안이면 그쪽.
  function pickTarget(x, y, sel) {
    const pad = 24 * zoomNow(), near = 110 * zoomNow();
    let best = null, bestD = Infinity;
    for (const n of document.querySelectorAll(sel)) {
      const rs = [n.getBoundingClientRect()];
      const cv = n.querySelector(".art canvas");
      if (cv) {
        // 캔버스는 칸의 3배 폭 · 2배 높이다 — 가운데 1/3 폭, 위 1/4 을 뺀 만큼을 몸으로 친다
        const r = cv.getBoundingClientRect();
        rs.push({ left: r.left + r.width / 3, right: r.right - r.width / 3, top: r.top + r.height * 0.25, bottom: r.bottom });
      }
      const L = Math.min(...rs.map((r) => r.left)), R = Math.max(...rs.map((r) => r.right));
      const T = Math.min(...rs.map((r) => r.top)), B = Math.max(...rs.map((r) => r.bottom));
      const cx = (L + R) / 2, cy = (T + B) / 2;
      const inside = x >= L - pad && x <= R + pad && y >= T - pad && y <= B + pad;
      const edge = Math.hypot(Math.max(L - x, 0, x - R), Math.max(T - y, 0, y - B));
      const score = (inside ? 0 : 10000) + Math.hypot(x - cx, (y - cy) * 0.6);
      if ((inside || edge < near) && score < bestD) { best = n; bestD = score; }
    }
    return best;
  }

  function stopDrag(cancel) {
    const d = drag; drag = null;
    if (!d) return;
    clearTimeout(d.hold);
    d.card.onpointermove = d.card.onpointerup = d.card.onpointercancel = null;
    if (!d.on) return;
    dragDone = true; setTimeout(() => { dragDone = false; }, 0);
    d.fx.remove();
    d.card.classList.remove("dragging");
    for (const n of document.querySelectorAll(".dtgt, .dover")) n.classList.remove("dtgt", "dover", ...(selCard >= 0 ? [] : ["tgt"]));
    if (cancel) { hint(""); paintPreview(selCard, null); }
  }
  function endDrag() {
    const d = drag;
    if (!d || !d.on) return stopDrag(false);
    const over = d.over;
    stopDrag(!over);
    if (!over) return;
    dropCard(d.i, d.need ? Number(over.dataset.idx) : 0);
  }
  // 카드를 대상에 놓았다 — 끌기가 끝나면 여기로 온다. tools/smoke.js 도 이 길로 낸다(가짜 DOM 에서는 끌 수 없다)
  function dropCard(handIdx, targetIdx) {
    hint("");
    selCard = handIdx;
    play(targetIdx);
  }
  s.dropCard = dropCard;
  s.state = st;                            // 시험용 — 브라우저 검사(tools/playtest.py 따위)가 판을 본다

  // ── 가운데 창 — 고학년 스킬 · 카드 자세히 ──────────────────────────────
  // 바깥을 누르거나 Esc 로 닫는다. 판이 다시 그려지면(draw) 닫는다 — 낡은 값을 들고 있지 않게.
  let modal = null;
  function closeModal() { if (modal) { modal.remove(); modal = null; if (typeof removeEventListener === "function") removeEventListener("keydown", escClose); } }
  function escClose(e) { if (e.key === "Escape") closeModal(); }
  function openModal(kind) {
    closeModal();
    const back = el("div", "bmodal " + kind);
    const box = el("div", "bmbox");
    back.appendChild(box);
    back.onclick = (e) => { if (e.target === back) closeModal(); };
    document.body.appendChild(back);
    if (typeof addEventListener === "function") addEventListener("keydown", escClose);
    modal = back;
    return box;
  }
  function termList(terms) {
    const dl = el("dl", "bmterms");
    for (const t of terms) {
      dl.appendChild(el("dt", null, t.ko));
      dl.appendChild(el("dd", null, t.text || "풀이가 아직 없습니다."));
    }
    return dl;
  }
  function openUlt(u) {
    const ult = C.ultOf(u.key);
    if (!ult) return;
    const why = C.canUlt(st, u.key);
    const box = openModal("ultmodal");
    const pic = CARDART.pic[u.key + "_ult"];
    const face = el("div", "bmface");
    if (pic) face.appendChild(img(pic));
    else face.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "battle", still: true }));
    box.appendChild(face);
    const body = el("div", "bmbody");
    body.appendChild(el("span", "bmkind", `${u.ko} · 고학년 스킬`));
    body.appendChild(el("h3", "bmname", ult.ko));
    const meter = el("div", "bmmeter");
    meter.appendChild(el("span", null, `게이지 ${ult.cost}% 를 씁니다`));
    meter.appendChild(el("b", st.gauge >= ult.cost ? "ok" : null, `지금 ${st.gauge}%`));
    body.appendChild(meter);
    const { action, terms } = cardParts({ text: ult.text, type: "고학년 스킬" }, u.key);
    body.appendChild(withKeywords(el("p", "bmtext"), action, u.key));
    if (terms.length) body.appendChild(termList(terms));
    const row = el("div", "bmbtns");
    const go = el("button", "bmuse", why ? why : "사용합니다");
    go.disabled = !!why;
    go.onclick = () => {
      const r = C.useUlt(st, u.key, 0);
      closeModal();
      if (!r.ok) return say(r.why);
      hint(""); draw();
    };
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(go); row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }
  // 적 정보 — 누구인지 · 체력 · 걸린 상태 · 이번 수와 할 수 있는 수 전부
  const INTENT_DO = (it) => {
    const v = it.v != null ? it.v : "";
    return { attack: `앞줄을 칩니다 · 피해 ${v}`, back: `뒷줄을 칩니다 · 피해 ${v}`, attackAll: `파티 전체를 칩니다 · 피해 ${v}`,
      multi: `앞줄을 ${it.n}번 칩니다 · 피해 ${v}×${it.n}`, charge: "힘을 모읍니다 — 다음 턴에 큰 수",
      block: `방어 +${v}`, guard: `적 전체 방어 +${v}`, heal: `가장 다친 적 회복 ${v}`,
      buff: "스스로 강해집니다", debuff: `아군 전체에 ${it.id || "상태"} ${v}`, jam: `다음 턴 AP -${v}` }[it.t] || it.t;
  };
  function openFoe(u) {
    const box = openModal("foemodal");
    const face = el("div", "bmface foe");
    face.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "foe", still: true }));
    box.appendChild(face);
    const body = el("div", "bmbody");
    const nat = ENEMY_NATURE[u.key];
    const E = ENEMIES[u.key] || {};
    body.appendChild(el("span", "bmkind", ["적", u.boss ? "보스" : null, (u.row || E.row) === "back" ? "뒷줄" : "앞줄", nat ? `성격 ${nat}` : null].filter(Boolean).join(" · ")));
    body.appendChild(el("h3", "bmname", u.ko));
    const meter = el("div", "bmmeter");
    meter.appendChild(el("span", null, u.dead ? "쓰러졌습니다" : `체력 ${Math.max(0, u.hp)} / ${u.maxHp}`));
    if (u.block > 0) meter.appendChild(el("b", "blk", `방어 ${u.block}`));
    if (u.shield > 0) meter.appendChild(el("b", "blk", `실드 ${u.shield}`));
    body.appendChild(meter);
    if (u.intent && !u.dead) {
      const it = u.intent, hit = C.intentHit(u);
      const now = el("p", "bmtext");
      now.appendChild(el("b", "bmnow", "이번 수 "));
      now.appendChild(document.createTextNode(`「${it.say}」 — ${INTENT_DO(hit != null ? { ...it, v: hit } : it)}`));
      if (it.t === "charge" && it.next) now.appendChild(document.createTextNode(` (다음 턴: ${it.next.say} ${it.next.v})`));
      body.appendChild(now);
      if (INTENT_HELP[it.t]) body.appendChild(el("p", "bmhelp", INTENT_HELP[it.t]));
    }
    // 걸린 상태 — 낱말 풀이까지
    const sts = Object.entries(u.status || {}).filter(([, v]) => v);
    if (sts.length) {
      const chipsRow = el("div", "bmchips");
      for (const [k, v] of sts) chipsRow.appendChild(el("span", "chip", `${k} ${v}`));
      body.appendChild(chipsRow);
      const { terms } = cardParts({ text: sts.map(([k]) => k).join(", ") }, null);
      if (terms.length) body.appendChild(termList(terms));
    }
    // 할 수 있는 수 — 무엇이 올지 가늠할 수 있게
    const moves = [...(E.open ? [E.open] : []), ...(E.intents || [])];
    const seenSay = new Set();
    const list = el("dl", "bmterms bmmoves");
    for (const it of moves) {
      if (seenSay.has(it.say)) continue;
      seenSay.add(it.say);
      list.appendChild(el("dt", null, it.say));
      list.appendChild(el("dd", null, INTENT_DO(it)));
    }
    if (moves.length) {
      body.appendChild(el("span", "bmsub", E.pick === "shuffle" ? "할 수 있는 수 — 무작위(같은 수를 세 번 잇지 않습니다)" : "할 수 있는 수 — 적힌 순서대로"));
      body.appendChild(list);
    }
    if (E.phase) body.appendChild(el("p", "bmhelp", `체력이 ${Math.round(E.phase.at * 100)}% 아래로 떨어지면 수가 바뀐다${E.phase.say ? ` — 「${E.phase.say}」` : ""}`));
    const row = el("div", "bmbtns");
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }

  // 메뉴 — 가운데 창. 떠 있는 동안 판은 멈춰 있다(턴제라 아무것도 흐르지 않는다)
  function openMenu(page = "main") {
    const box = openModal("menumodal");
    const body = el("div", "bmbody");
    box.appendChild(body);
    if (page === "quit") {
      body.appendChild(el("h3", "bmname", "메인화면으로 갈까요?"));
      body.appendChild(el("p", "bmhelp", "이 판은 저장되지 않습니다 — 나가면 처음부터 다시 떠납니다."));
      const row = el("div", "bmbtns");
      const yes = el("button", "bmuse danger", "나갑니다");
      yes.onclick = () => { closeModal(); if (onQuit) onQuit(); };
      const no = el("button", "bmclose", "돌아가기");
      no.onclick = () => openMenu();
      row.appendChild(yes); row.appendChild(no);
      body.appendChild(row);
      return;
    }
    if (page === "settings") {
      body.appendChild(el("h3", "bmname", "설정"));
      // 사도 움직임을 바꾸면 싸움터를 다시 그린다 — 창을 닫고 그린 뒤 이 쪽으로 다시 연다
      body.appendChild(settingsPanel({ onSpine: () => { closeModal(); draw(); openMenu("settings"); } }));
      const back = el("button", "bmclose", "메뉴로");
      back.onclick = () => openMenu();
      body.appendChild(back);
      return;
    }
    body.appendChild(el("h3", "bmname", "메뉴"));
    body.appendChild(el("span", "bmkind", `${floor.n}층 · ${floor.name} · ${st.turn}턴`));
    const list = el("div", "mlist");
    const item = (label, sub, fn, cls) => {
      const b = el("button", "mitem" + (cls ? " " + cls : ""));
      b.appendChild(el("b", null, label));
      if (sub) b.appendChild(el("span", null, sub));
      b.onclick = fn;
      list.appendChild(b);
      return b;
    };
    item("이어하기", null, closeModal, "main");
    item("도움말", "상성 · 열 · AP · 신탁 · 드랍 · 장비 · 지도", () => { closeModal(); openHelp("상성"); });
    // 설정 — 로비와 같은 창(js/settings-panel.js): 해상도 · 그래픽 품질 · 전체화면 · 움직임 · 글자 · 음량
    item("설정", "해상도 · 그래픽 · 소리 · 글자", () => openMenu("settings"));
    body.appendChild(list);
    if (onQuit) {
      const q = el("div", "mlist");
      const b = el("button", "mitem quit");
      b.appendChild(el("b", null, "메인화면으로"));
      b.appendChild(el("span", null, "이 판은 저장되지 않습니다"));
      b.onclick = () => openMenu("quit");
      q.appendChild(b);
      body.appendChild(q);
    }
  }

  // 사도 정보 — 체력 · 걸린 것 · 패시브 · 전용 키워드 · 고학년 스킬
  function openHero(u) {
    const h = HERO(u.key);
    const box = openModal("heromodal");
    const face = el("div", "bmface hero");
    face.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "event", still: true }));
    box.appendChild(face);
    const body = el("div", "bmbody");
    const nat = C.natureOf(u.key);
    body.appendChild(el("span", "bmkind", [h.race, h.role, ROW_KO[u.row], nat ? `성격 ${nat}` : null, h.eldain ? "엘다인" : null].filter(Boolean).join(" · ")));
    body.appendChild(el("h3", "bmname", u.ko));
    const meter = el("div", "bmmeter");
    meter.appendChild(el("span", null, u.dead ? "쓰러졌습니다" : `체력 ${Math.max(0, u.hp)} / ${u.maxHp}`));
    if (u.block > 0) meter.appendChild(el("b", "blk", `방어 ${u.block}`));
    if (u.shield > 0) meter.appendChild(el("b", "blk", `실드 ${u.shield}`));
    body.appendChild(meter);
    // 걸린 것 — 상태 · 증감 · 전용 키워드 개수(싸움터의 칩과 같은 것)
    const c0 = chips(u);
    if (c0.children.length) { c0.className = "bmchips"; body.appendChild(c0); }
    // 패시브 — 「이름: 하는 일 · 이름: 하는 일」
    if (h.passive) {
      body.appendChild(el("span", "bmsub", "패시브"));
      const pl = el("dl", "bmterms");
      for (const part of String(h.passive).split(/\s·\s(?=[^:·]{1,24}:)/)) {
        const m = part.match(/^([^:]{1,24}):\s*(.+)$/);
        pl.appendChild(el("dt", null, m ? m[1] : "패시브"));
        pl.appendChild(withKeywords(el("dd"), m ? m[2] : part, u.key));
      }
      body.appendChild(pl);
    }
    if (h.keyword && h.keyword.ko) {
      body.appendChild(el("span", "bmsub", "전용 키워드"));
      const kl = el("dl", "bmterms");
      kl.appendChild(el("dt", null, h.keyword.ko));
      kl.appendChild(el("dd", null, h.keyword.text || ""));
      body.appendChild(kl);
    }
    // 장비 — 무기 · 방어구 · 장신구
    body.appendChild(el("span", "bmsub", "장비"));
    const gl = el("div", "bmgear");
    const gg = R.gearOf(run, u.key);
    for (const sl of RULES.SLOTS) {
      const e = gg[sl] ? EQUIP[gg[sl]] : null;
      const cell = el("div", "bmgslot" + (e ? "" : " empty"));
      cell.appendChild(e ? equipIcon(e, 40) : emptySlotIcon(sl, 40));
      const t = el("div");
      t.appendChild(el("b", null, e ? e.ko : `${sl} — 비어 있음`));
      if (e) t.appendChild(el("span", null, statText(R.statsOf(e.id, u.key)) + (e.affinity === u.key ? " · 애착" : "")));
      cell.appendChild(t);
      gl.appendChild(cell);
    }
    body.appendChild(gl);
    const ult = C.ultOf(u.key);
    if (ult) {
      body.appendChild(el("span", "bmsub", `고학년 스킬 · 게이지 ${ult.cost}%`));
      const ul = el("dl", "bmterms");
      ul.appendChild(el("dt", null, ult.ko));
      ul.appendChild(withKeywords(el("dd"), cardParts({ text: ult.text }, u.key).action, u.key));
      body.appendChild(ul);
    }
    const row = el("div", "bmbtns");
    if (ult && !u.dead) {
      const why = C.canUlt(st, u.key);
      const go = el("button", "bmuse", why ? "게이지가 모자랍니다" : "고학년 스킬 쓰기");
      go.disabled = !!why;
      go.onclick = () => openUlt(u);
      row.appendChild(go);
    }
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }

  function openCard(id) {
    const c = C.cardOf(st, id);
    if (!c) return;
    const box = openModal("cardmodal");
    const big = bigCard({ ...c, cost: C.costOf(st, id) }, CARDART.pic[id] || null);
    big.onclick = null; big.title = "";
    big.classList.add("bmcard");
    box.appendChild(big);
    const body = el("div", "bmbody");
    body.appendChild(el("span", "bmkind", c.hero ? `${HERO(c.hero).ko}의 카드 · ${c.type}` : `공용 카드 · ${c.type}`));
    body.appendChild(el("h3", "bmname", c.name));
    const meter = el("div", "bmmeter");
    meter.appendChild(el("span", null, c.xcost ? "비용 X — 남은 AP 를 모두 씁니다" : `비용 ${C.costOf(st, id)} AP`));
    body.appendChild(meter);
    const { action, terms } = cardParts(c, c.hero);
    body.appendChild(withKeywords(el("p", "bmtext"), action, c.hero));
    if (terms.length) body.appendChild(termList(terms));
    // 낼 수 없는 까닭은 손에 든 카드일 때만 — 더미에서 연 카드는 원래 못 낸다
    const why = st.hand.includes(id) ? C.canPlay(st, id) : null;
    if (why) body.appendChild(el("p", "bmwhy", why));
    const row = el("div", "bmbtns");
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }

  // ── 신탁 — 빛나는 카드를 내는 순간 ──────────────────────────────────
  // 가운데에 크게 「신탁!」 — 셋 중 하나를 고른다(닫을 수 없다). 고르면 걸고, 빛나던 카드를 그대로 낸다.
  function showGrace(hero, id) {
    const back = el("div", "gracebanner");
    back.appendChild(el("div", "epititle", "은총!"));
    back.appendChild(el("p", "episub", `${HERO(hero).ko}의 고유 카드 — 손에 들어왔습니다. 이번 턴 비용 0`));
    const card = bigCard(CARDS[id], CARDART.pic[id] || null);
    card.onclick = null;
    back.appendChild(card);
    document.body.appendChild(back);
    setTimeout(() => back.remove(), typeof window === "object" ? 1700 : 0);
  }
  function openEpiphany(cardId, g, done) {
    const back = el("div", "bmodal epimodal" + (g.kind === "card" && g.options.some((o) => o.shin) ? " divine" : ""));
    const box = el("div", "epibox");
    back.appendChild(box);
    const base = CARDS[cardId];
    box.appendChild(el("div", "epititle", g.kind === "hero" ? "은총!" : "신탁!"));
    box.appendChild(el("p", "episub", g.kind === "hero"
      ? `${HERO(g.hero).ko}에게 신탁 — 고유 카드 하나를 얻습니다. 이번 턴에는 비용 0`
      : `「${base.name}」에 신탁 — 하나를 고르면 카드가 바뀌고, 이번에는 비용 0`));
    const row = el("div", "epirow");
    g.options.forEach((opt, i) => {
      const cell = el("button", "epiopt");
      let card;
      if (g.kind === "hero") card = bigCard(CARDS[opt], CARDART.pic[opt] || null);
      else {
        const f = (base.flash || [])[opt.n - 1] || {};
        card = bigCard(flashed(base, opt.n), CARDART.pic[cardId] || null);
        cell.appendChild(el("span", "epikind", `${"①②③④⑤"[opt.n - 1]} ${f.kind || ""}`));
        if (opt.shin) { cell.classList.add("shin"); cell.appendChild(el("span", "epishin", `기적 · ${RULES.DIVINE_KO[opt.shin]}`)); }
      }
      card.onclick = null; card.title = "";
      cell.appendChild(card);
      cell.onclick = () => { back.remove(); done(i); };
      row.appendChild(cell);
    });
    box.appendChild(row);
    // 고르기 전에 내 덱을 본다 — 무엇과 어울릴지 보고 고르게. 덱 창은 이 창 위에 뜨고, 닫으면 여기로 돌아온다
    const look = el("button", "epideck", "내 덱 보기");
    look.onclick = (e) => {
      e.stopPropagation();
      const cardFor = (id) => C.cardOf(st, id);
      showPiles([
        { key: "all", label: "덱 전체", ids: run.deck, why: "이 판의 덱. 신탁이 붙은 카드는 바뀐 모습으로 보입니다." },
        { key: "hand", label: "손패", ids: st.hand, why: "지금 손에 든 카드." },
        { key: "draw", label: "뽑을 더미", ids: st.draw, why: "차례는 안 보여 줍니다 — 섞여 있습니다." },
        { key: "disc", label: "버린 더미", ids: st.discard, why: "덱이 바닥나면 섞여서 뽑을 더미로 돌아갑니다." },
      ], "all", cardFor, null);
      if (kwNote) kwNote.classList.add("onepi");
    };
    box.appendChild(look);
    document.body.appendChild(back);
  }

  function play(targetIdx) {
    if (selCard < 0) return;
    const glowId = st.hand[selCard], g = glowId && C.glowOf(st, glowId);
    // 은총 — 고르지 않는다. 무작위 고유 카드 하나가 곧장 손에(그 턴 비용 0), 가운데에 잠깐 띄운다
    if (g && g.kind === "hero" && !C.canPlay(st, glowId)) {
      C.applyEpiphany(st, glowId, 0);
      showGrace(g.hero, g.options[0]);
      setTimeout(() => lootCard(g.options[0], `은총 · ${HERO(g.hero).ko}`), 900);
      selCard = st.hand.indexOf(glowId);
    } else if (g && !C.canPlay(st, glowId)) {
      openEpiphany(glowId, g, (choice) => {
        C.applyEpiphany(st, glowId, choice);
        const o = g.options[choice], f = (CARDS[glowId].flash || [])[o.n - 1] || {};
        lootCard(glowId, `신탁 ${"①②③④⑤"[o.n - 1]} ${f.kind || ""}${o.shin ? ` · 기적(${RULES.DIVINE_KO[o.shin]})` : ""}`);
        selCard = st.hand.indexOf(glowId);
        play(targetIdx);
      });
      return;
    }
    // 「손패 N장 버리」 — 무작위가 아니면 낸 사람이 고른다. 고르고 나서 카드가 돈다(버린 뒤 드로우 따위가 이어진다)
    const need = C.discardChoice(st, selCard);
    if (need > 0) {
      const at = selCard;
      pickDiscard(at, need, (ids) => {
        if (!ids) { selCard = -1; draw(); return; }       // 물렀다 — 카드는 손에 남는다
        const r = C.playCard(st, at, targetIdx, { discard: ids });
        selCard = -1;
        if (!r.ok) say(r.why);
        draw();
      });
      return;
    }
    const r = C.playCard(st, selCard, targetIdx);
    selCard = -1;
    if (!r.ok) say(r.why);
    draw();
  }

  // 버릴 카드 고르기 — 낸 카드를 뺀 손패에서 N장. 다 고르면 「버리기」, 「취소」 면 카드를 안 낸다
  function pickDiscard(handIdx, n, done) {
    const played = C.cardOf(st, st.hand[handIdx]);
    const back = el("div", "dcpick");
    const box = el("div", "dcbox");
    back.appendChild(box);
    const head = el("div", "dchead");
    head.appendChild(el("b", null, `버릴 카드를 ${n}장 고릅니다`));
    head.appendChild(el("span", null, `「${played.name}」 — 고른 카드를 버리고 나머지 효과가 이어집니다`));
    box.appendChild(head);
    const grid = el("div", "dcgrid");
    box.appendChild(grid);
    const chosen = [];                        // 손패 자리(같은 카드가 둘일 수 있어 id 가 아니라 자리로)
    const foot = el("div", "dcfoot");
    const cancel = el("button", "dccancel", "취소");
    const ok = el("button", "dcok");
    foot.appendChild(cancel); foot.appendChild(ok);
    box.appendChild(foot);
    const cells = [];
    st.hand.forEach((id, i) => {
      if (i === handIdx) return;
      const c = C.cardOf(st, id);
      if (!c) return;
      const cell = el("button", "dccell");
      cell.appendChild(bigCard(c, CARDART.pic[id] || null));
      cell.appendChild(el("i", "dcmark", "버림"));
      cell.onclick = () => {
        const k = chosen.indexOf(i);
        if (k >= 0) chosen.splice(k, 1);
        else { if (chosen.length >= n) chosen.shift(); chosen.push(i); }   // 다 골랐으면 가장 먼저 고른 것을 놓는다
        paint();
      };
      cells.push([i, cell]);
      grid.appendChild(cell);
    });
    function paint() {
      for (const [i, cell] of cells) cell.classList.toggle("on", chosen.includes(i));
      ok.textContent = `버리기 ${chosen.length}/${n}`;
      ok.disabled = chosen.length !== n;
    }
    const close = (ids) => { back.remove(); document.removeEventListener("keydown", esc); done(ids); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    document.addEventListener("keydown", esc);
    cancel.onclick = () => close(null);
    ok.onclick = () => { if (chosen.length === n) close(chosen.map((i) => st.hand[i])); };
    paint();
    document.body.appendChild(back);
  }

  endBtn.onclick = () => { selCard = -1; C.endTurn(st); draw(); };

  function finish() {
    endBtn.disabled = true;
    hand.querySelectorAll("button").forEach((b) => (b.disabled = true));
    R.afterFight(run, st);
    if (st.over !== "win") { setTimeout(() => onDone(st.over), 700); return; }
    if (loot) {
      // 떨어진 것을 챙긴다 — 장비는 가방으로. 아직 못 떨궜으면(마지막 한 방에 여럿) 여기서
      dropItems({ x: (innerWidth || 1600) * 0.7, y: (innerHeight || 900) * 0.4 });
      if (loot.equip && loot.equip.length && !loot.equipTaken) R.takeEquip(run, loot.equip[0]);
      R.takeReward(run, null);                 // 골드 — 판에는 바로 들어간다. 화면은 사도들이 주우며 올린다
    }
    // 사도들이 오른쪽으로 달려가며 바닥의 금화를 줍는다 → 얻은 것을 보이고 넘어간다
    walkOut(() => {
      if (loot) {
        lootBox.classList.add("on", "done");
        lootBox.querySelector(".lthead").textContent = "승리 — 얻은 것";
        if (!lootList.children.length) lootList.appendChild(el("p", "ltnone", "이번에는 떨어진 것이 없습니다"));
      }
      setTimeout(() => { for (const c of ground) c.node.remove(); onDone(st.over); }, loot ? 1300 : 500);
    });
  }

  draw();
  return s;
}

// 화면 뒤에 그 싸움의 배경을 깐다 — 전투와, 이긴 뒤의 보상 화면이 같은 그림을 쓴다.
// 변수에 담긴 url() 은 그 변수를 쓰는 css 파일 기준으로 풀린다 — 그래서 문서 기준 절대 주소로 넘긴다
function setStageBg(s, run) {
  const floor = R.currentFloor(run);
  const bg = BATTLE_BG[floor.n] || BATTLE_BG[1];
  const bgFile = `assets/bg/${run.eventFight ? bg.event : R.isBoss(run) ? bg.boss : bg.fight}.jpg`;
  s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bgFile, location.href).href : bgFile}")`);
}

// 가운데 창 — 전투 밖(보상 등)에서 쓴다. 바깥 · Esc 로 닫는다. 전투 안에는 같은 모양의 openModal 이 따로 있다
let outModal = null;
function centerModal(kind) {
  closeCenter();
  const back = el("div", "bmodal " + kind);
  const box = el("div", "bmbox");
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) closeCenter(); };
  document.body.appendChild(back);
  if (typeof addEventListener === "function") addEventListener("keydown", escCenter);   // 가짜 DOM(tools/smoke.js)에는 없다
  outModal = back;
  return box;
}
function closeCenter() { if (outModal) { outModal.remove(); outModal = null; if (typeof removeEventListener === "function") removeEventListener("keydown", escCenter); } }
function escCenter(e) { if (e.key === "Escape") closeCenter(); }
function termDl(terms) {
  const dl = el("dl", "bmterms");
  for (const t of terms) {
    dl.appendChild(el("dt", null, t.ko));
    dl.appendChild(el("dd", null, t.text || "풀이가 아직 없습니다."));
  }
  return dl;
}

// 싸움터 배경 — assets/bg (tools/extract-bg.py 가 게임에서 뽑은 16:9 그림)
// 에르피엔은 숲속 버섯 마을, 모나티엄은 엘프 도시, 벨리티엔은 마녀 왕국의 보랏빛 숲
const BATTLE_BG = {
  1: { fight: "stage3_2", boss: "stage3_3", event: "stage2_1" },
  2: { fight: "stage8_1", boss: "stage9_1", event: "stage4_1" },
  3: { fight: "stage23_1", boss: "stage25_1", event: "stage16_1" },
};

// ── 지도 ───────────────────────────────────────────────────────────────
// 층마다 갈림길이 있는 길(js/map.js). 파티 미니미가 지금 칸에 서 있고, 이어진 칸을 누르면 그리로 걸어가 들어간다.
// 칸은 왼쪽에서 오른쪽으로 여덟 줄 — 맨 끝이 보스. 지나온 칸은 흐리게, 갈 수 있는 칸은 빛난다.
const MAP_ICON = {
  start: '<svg viewBox="0 0 24 24"><path d="M5 21V3h2v1h11l-2.5 4L18 12H7v9H5z"/></svg>',
  fight: '<svg viewBox="0 0 24 24" class="stroke"><path d="M5 4l11 11M19 4L8 15M6.5 15.5l2 2M17.5 15.5l-2 2M4.5 19.5l2.5-2.5M19.5 19.5L17 17"/></svg>',
  event: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 2.9-1.8 4.2-3.2 5.2-1.1.8-1.8 1.3-1.8 2.3v.5h-4v-.6c0-2.6 1.6-3.8 2.9-4.7 1.1-.8 2.1-1.5 2.1-2.7a3 3 0 0 0-6 0H5a7 7 0 0 1 7-7zm-2 17h4v3h-4v-3z"/></svg>',
  elite: '<svg viewBox="0 0 24 24"><path d="M4 3l3.5 4.2L12 4l4.5 3.2L20 3l-.8 7.2c1.1 1.1 1.8 2.6 1.8 4.3 0 4-4 7.5-9 7.5s-9-3.5-9-7.5c0-1.7.7-3.2 1.8-4.3L4 3zm4.5 10.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm7 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM9.5 18.5h5l-2.5 1.6-2.5-1.6z"/></svg>',
  camp: '<svg viewBox="0 0 24 24"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.8-2.8 1.6-3.6.2 1.4.9 2.2 1.9 2.6C11 7 10.8 4.4 12 2zM3 19l8.3-3 .7.3.7-.3L21 19v2l-9-3.2L3 21v-2z"/></svg>',
  campshop: '<svg viewBox="0 0 24 24"><path d="M9 2c1 2.6 3.4 3.8 3.4 6.8a3.4 3.4 0 0 1-6.8 0c0-1.3.6-2.3 1.3-3 .2 1.2.8 1.8 1.6 2.2C8.1 6 7.9 3.8 9 2zM2 17l7-2.5 7 2.5v2l-7-2.5L2 19v-2zm15-7a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-.7 1.8v4.4h1.4v-4.4h-1.4z"/></svg>',
  boss: '<svg viewBox="0 0 24 24"><path d="M2 7l5 4 5-7 5 7 5-4-2 12H4L2 7zm2.6 13.5h14.8V22H4.6v-1.5z"/></svg>',
};
const MAP_HELP = {
  start: "출발 — 여기서 길을 고릅니다",
  fight: "일반 전투 — 빛나는 카드를 내면 은총(고유 카드) · 신탁(카드 강화)", elite: "엘리트 전투 — 센 적(체력 ×1.5). 은총 · 신탁이 적어도 하나씩 빛나고, 이기면 장비 하나 · 골드 더",
  event: "이벤트 — 무슨 일이 생길지 모릅니다", camp: "휴식 — 쉬거나 수련합니다",
  campshop: "휴식 + 골디의 상점 — 카드 · 장비 · 카드 제거", boss: "보스 — 이 층의 끝",
};

export function mapScreen(run, onEnter, onQuit) {
  const s = screen();
  s.classList.add("mapscreen");
  const map = M.mapOf(run);
  const floor = R.currentFloor(run);
  setStageBg(s, run);

  // 머리 — 어디 · 파티 · 골드 · 덱
  const head = el("div", "mhead");
  const where = el("div", "mwhere");
  where.appendChild(el("b", null, `${floor.n}층 · ${floor.name}`));
  where.appendChild(el("span", null, `${floor.sub} · ${floor.n}-0 ~ ${floor.n}-${map.rows.length - 1} · 갈 곳을 고릅니다`));
  head.appendChild(where);
  const party = el("div", "mparty-hp");
  for (const k of run.party) {
    const h = HERO(k);
    const cell = el("div", "mhero" + ((run.hp[k] || 0) <= 0 ? " dead" : ""));
    const pic = CARDART.pic[k + "_ult"];
    const face = el("span", "mface");
    if (pic) face.appendChild(img(pic)); else face.appendChild(el("b", null, (h.ko || k).slice(0, 1)));
    cell.appendChild(face);
    const info = el("div", "minfo");
    info.appendChild(el("b", null, h.ko || k));
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = Math.max(0, ((run.hp[k] || 0) / (run.maxHp[k] || 1)) * 100) + "%";
    bar.appendChild(fill);
    info.appendChild(bar);
    info.appendChild(el("span", "mhp", (run.hp[k] || 0) <= 0 ? "주말농장" : `${run.hp[k]} / ${run.maxHp[k]}`));
    cell.appendChild(info);
    cell.appendChild(gearStrip(run, k, 22));
    cell.title = "눌러서 장비 보기";
    cell.onclick = () => openGear();
    party.appendChild(cell);
  }
  head.appendChild(party);
  // 장비 — 사도마다 무기 · 방어구 · 장신구. 가방의 장비는 빈 칸에 바로 낄 수 있다(바꿔 끼기는 휴식 칸에서)
  const openGear = () => {
    const box = centerModal("gearmodal");
    const body = el("div", "bmbody");
    body.appendChild(el("h3", "bmname", "장비"));
    body.appendChild(el("span", "bmkind", "사도마다 무기 · 방어구 · 장신구 한 칸씩. 바꿔 끼기는 휴식 칸에서"));
    const redraw = () => { const old = body.querySelector(".gearpanel"); const gp = gearPanel(run, "empty", () => { redraw(); }, hint); if (old) old.replaceWith(gp); else body.appendChild(gp); };
    redraw();
    const x = el("button", "bmclose", "닫기");
    x.onclick = () => { closeCenter(); mapScreen(run, onEnter, onQuit); };
    const row = el("div", "bmbtns"); row.appendChild(x); body.appendChild(row);
    box.appendChild(body);
  };
  const gearBtn = el("button", "mdeck", `장비${run.bag.length ? ` · 가방 ${run.bag.length}` : ""}`);
  gearBtn.onclick = openGear;
  const gold = goldLabel("span", "mgold", `${run.gold} 골드`);
  head.appendChild(gold);
  const deckBtn = el("button", "mdeck", `덱 ${run.deck.length}장`);
  deckBtn.onclick = () => showPiles([{ key: "all", label: "덱 전체", ids: run.deck, why: "이 판의 덱. 신탁이 붙은 카드는 바뀐 모습으로 보입니다." }], "all", (id) => flashedCard(run, id));
  head.appendChild(deckBtn);
  head.appendChild(gearBtn);
  head.appendChild(fsButton());
  const menuBtn = el("button", "bmenu mmenu");
  menuBtn.title = "메뉴";
  for (let k = 0; k < 3; k++) menuBtn.appendChild(el("i"));
  menuBtn.onclick = () => {
    const box = centerModal("menumodal");
    const body = el("div", "bmbody");
    body.appendChild(el("h3", "bmname", "메뉴"));
    body.appendChild(el("span", "bmkind", `${floor.n}층 · ${floor.name}`));
    const list = el("div", "mlist");
    const go = el("button", "mitem main"); go.appendChild(el("b", null, "이어하기")); go.onclick = closeCenter; list.appendChild(go);
    const hp = el("button", "mitem"); hp.appendChild(el("b", null, "도움말")); hp.appendChild(el("span", null, "상성 · 열 · AP · 신탁 · 드랍 · 장비 · 지도"));
    hp.onclick = () => { closeCenter(); openHelp("지도"); }; list.appendChild(hp);
    // 설정 — 로비 · 전투와 같은 창
    const sp = el("button", "mitem"); sp.appendChild(el("b", null, "설정")); sp.appendChild(el("span", null, "해상도 · 그래픽 · 소리 · 글자"));
    sp.onclick = () => {
      const b2 = centerModal("menumodal");
      const bd = el("div", "bmbody");
      bd.appendChild(el("h3", "bmname", "설정"));
      bd.appendChild(settingsPanel());
      const cl = el("button", "bmclose", "닫기"); cl.onclick = closeCenter; bd.appendChild(cl);
      b2.appendChild(bd);
    };
    list.appendChild(sp);
    if (onQuit) {
      const q = el("button", "mitem quit"); q.appendChild(el("b", null, "메인화면으로")); q.appendChild(el("span", null, "이 판은 저장되지 않습니다"));
      q.onclick = () => { closeCenter(); onQuit(); };
      list.appendChild(q);
    }
    body.appendChild(list);
    box.appendChild(body);
  };
  head.appendChild(menuBtn);
  s.appendChild(head);

  // 판 — 칸 · 길 · 미니미. 가로로 긴 띠라 화면을 넘으면 끌어서(마우스 · 손가락 · 휠) 넘겨 본다 — 배율은 줄이지 않는다
  const board = el("div", "mboard");
  s.appendChild(board);
  const strip = el("div", "mstrip");
  board.appendChild(strip);
  // 칸 사이는 늘 같은 간격(px) — 열은 COL 간격, 자리(레인) 넷은 판 높이의 가로줄 넷
  const phone = typeof document === "object" && document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("phone");
  const COL = phone ? 150 : 190, PAD = phone ? 90 : 120;
  const W = PAD * 2 + (map.rows.length - 1) * COL;
  strip.style.width = W + "px";
  const posOf = (n) => ({ x: PAD + n.row * COL, y: n.lane == null ? 50 : 17 + n.lane * 22 });   // x px · y %
  const svg = document.createElementNS ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : el("svg");
  if (svg.setAttribute) { svg.setAttribute("viewBox", `0 0 ${W} 100`); svg.setAttribute("preserveAspectRatio", "none"); }
  svg.classList.add("medges");
  strip.appendChild(svg);
  const can = new Set(M.reachable(run));
  const ahead = M.aheadOf(run);              // 지금 자리에서 앞으로 닿는 칸 — 그 밖은 흐리게(이제 못 가는 곳)
  const seen = new Set(map.seen);
  for (const row of map.rows) for (const n of row) for (const to of n.next) {
    const t = M.nodeById(map, to), a = posOf(n), b = posOf(t);
    if (!document.createElementNS) break;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // 카제나처럼 — 칸에서 곧게 나와 가운데서 꺾여 다음 칸으로 곧게 들어간다
    const mx = (a.x + b.x) / 2, k = COL * 0.18;
    line.setAttribute("d", a.y === b.y ? `M${a.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} L${mx - k},${a.y} L${mx + k},${b.y} L${b.x},${b.y}`);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    const walked = seen.has(n.id) && seen.has(to);
    const open = map.at === n.id && can.has(to);
    const live = ahead.has(to) && (ahead.has(n.id) || map.at === n.id);
    line.setAttribute("class", walked ? "walked" : open ? "open" : live ? "live" : "gone");
    svg.appendChild(line);
  }
  let busy = false, dragged = false;
  const party3 = el("div", "mwalkers");
  for (const k of run.party) {
    if ((run.hp[k] || 0) <= 0) continue;
    party3.appendChild(art.portrait(k, { ko: HERO(k).ko, tint: TINT(k), size: 96, slot: "map" }));
  }
  const here = M.currentNode(run) || map.rows[0][0];
  const place = (p) => { party3.style.left = p.x + "px"; party3.style.top = p.y + "%"; };
  place(posOf(here));
  for (const row of map.rows) for (const n of row) {
    const p = posOf(n);
    const b = el("button", `mnode t-${n.type}` + (can.has(n.id) ? " can" : "") + (seen.has(n.id) ? " seen" : "") + (map.at === n.id ? " here" : "")
      + (!ahead.has(n.id) && !seen.has(n.id) && map.at !== n.id ? " gone" : ""));
    b.style.left = p.x + "px"; b.style.top = p.y + "%";
    const tile = el("span", "mring");
    const icon = el("span", "micon");
    icon.innerHTML = MAP_ICON[n.type] || "";
    tile.appendChild(icon);
    b.appendChild(tile);
    b.appendChild(el("span", "mlabel", n.type === "start" ? M.stageName(run, n) : M.KIND_KO[n.type]));
    const foes = M.enemiesAt(run, n).map((id) => (ENEMIES[id] || {}).ko || id);
    b.title = `${M.stageName(run, n)} · ` + (MAP_HELP[n.type] || "") + (foes.length ? `\n적: ${foes.join(", ")}` : "");
    b.dataset.id = n.id;
    b.onclick = () => {
      if (dragged || busy || !can.has(n.id)) return;       // 끌다가 놓은 것은 누른 것이 아니다
      busy = true;
      board.classList.add("going");
      b.classList.add("pick");
      party3.classList.add("walking");
      place(p);
      setTimeout(() => {
        const node = M.enterNode(run, n.id);
        if (node) onEnter(node);
      }, typeof window === "object" ? 900 : 0);
    };
    strip.appendChild(b);
  }
  strip.appendChild(party3);

  // 끌어서 넘기기 — 마우스는 눌러 끌고, 휠은 가로로. 손가락은 브라우저가 알아서 넘긴다(overflow-x)
  let dragX = null, startLeft = 0;
  board.onpointerdown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragX = e.clientX; startLeft = board.scrollLeft; dragged = false;
  };
  board.onpointermove = (e) => {
    if (dragX == null) return;
    const dx = e.clientX - dragX;
    if (Math.abs(dx) > 6) { dragged = true; board.classList.add("dragging"); }
    if (dragged) board.scrollLeft = startLeft - dx / ((typeof getZoom === "function" && getZoom()) || 1);
  };
  const endDragMap = () => { dragX = null; board.classList.remove("dragging"); setTimeout(() => { dragged = false; }, 0); };
  board.onpointerup = endDragMap;
  board.onpointerleave = endDragMap;
  board.onwheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { board.scrollLeft += e.deltaY; e.preventDefault(); } };
  // 처음 열면 지금 칸이 왼쪽 1/3 쯤에 오게
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { board.scrollLeft = Math.max(0, posOf(here).x - board.clientWidth * 0.3); });
  s.enterNode = (id) => { const b = [...strip.children].find((c) => c.dataset && c.dataset.id === id); if (b) b.onclick(); };  // tools/smoke.js 가 쓴다
  return s;
}

// 덱 보기에서 — 신탁이 붙은 카드는 바뀐 모습으로
function flashedCard(run, id) {
  const c = CARDS[id];
  if (!c) return null;
  const n = (run.flash || {})[id];
  const f = n && c.flash && c.flash[n - 1];
  return f ? { ...c, text: f.text, flashOn: n, flashKind: f.kind } : c;
}

// 적의 수 — 마름모에 마우스를 올리면 뜨는 설명
const INTENT_HELP = {
  attack: "앞줄부터 칩니다", back: "뒷줄부터 칩니다", attackAll: "파티 전체를 칩니다",
  multi: "앞줄부터 여러 번 칩니다 — 방어가 먼저 벗겨집니다",
  charge: "힘을 모읍니다. 다음 턴에 예고한 수를 반드시 합니다 — 봉인하거나 수를 흐트러뜨리면 흩어집니다",
  block: "자기 방어를 올립니다", guard: "적 전체의 방어를 올립니다", heal: "체력이 가장 낮은 적을 회복합니다",
  buff: "스스로 강해집니다", debuff: "파티 전체에 상태를 겁니다", jam: "다음 턴 AP 를 깎습니다",
};

// 적의 성격 — enemies.js 가 들고 있다
const ENEMY_NATURE = {};
for (const [k, e] of Object.entries(ENEMIES)) if (e.nature) ENEMY_NATURE[k] = e.nature;
// 몬스터 스파인은 성격마다 한 벌씩 입는다 — 게임 파일의 스킨 이름
const NATURE_SKIN = { 순수: "Skin_Naive", 광기: "Skin_Mad", 냉정: "Skin_Cool", 우울: "Skin_Gloomy", 활발: "Skin_Jolly" };

// ── 보상 ───────────────────────────────────────────────────────────────
// 얻는 것은 **그 사도의 고유 카드**다(기획서: 사도당 시작 4 + 고유 4).
// 누구의 무슨 카드인지가 첫눈에 보여야 한다 — 이름만 떠 있으면 고를 수가 없다.
export function rewardScreen(run, onPick) {
  const s = screen();
  s.classList.add("rewardscreen");
  setStageBg(s, run);                     // 방금 싸운 자리 그대로 — 전투 화면과 같은 배경

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", "이겼습니다"));
  bar.appendChild(el("span", "rwhy", "골드를 챙겼습니다. 고유 카드(은총) · 카드 강화(신탁)는 전투 중 빛나는 카드를 내면 얻습니다."));
  const rgot = run.reward || R.rollReward(run);
  if (rgot.gold) bar.appendChild(goldLabel("span", "sgold", `+${rgot.gold} 골드`));
  const skip = el("button", "dexbtn", "계속합니다");
  skip.onclick = () => onPick(null, null);
  bar.appendChild(skip);
  s.appendChild(bar);

  const body = el("div", "rbody");
  s.appendChild(body);

  const got = run.reward || R.rollReward(run);
  // ⓪ 장비 — 보스만. 셋 중 하나를 가방에 넣고, 빈 칸이면 바로 낀다
  if (got.equip && got.equip.length) {
    const eqBox = el("div");
    body.appendChild(eqBox);
    const drawEq = () => {
      eqBox.innerHTML = "";
      eqBox.appendChild(sec("장비", got.equipTaken ? "가방에 넣었습니다" : `${run.elite ? "엘리트" : "보스"}가 남긴 장비 — 셋 중 하나`));
      if (!got.equipTaken) {
        const row = el("div", "rrow");
        for (const id of got.equip) {
          const b = el("button", "sprice", "이걸 가집니다");
          b.onclick = () => { R.takeEquip(run, id); drawEq(); };
          row.appendChild(equipCard(id, b));
        }
        eqBox.appendChild(row);
      } else eqBox.appendChild(gearPanel(run, "empty", null, hint));
    };
    drawEq();
  }
  // ① 이 전투의 신탁 — 고유 카드 · 신탁은 이제 전투 중에 얻는다(카제나)
  const gained = got.gained || { cards: [], flash: [] };
  if (gained.cards.length || gained.flash.length) {
    body.appendChild(sec("이 전투에서 받은 은총 · 신탁", "덱에 들어갔습니다"));
    const gr = el("div", "rrow");
    for (const id of gained.cards) {
      const pick = el("div", "rpick rgot");
      const who = el("div", "rwho");
      who.appendChild(el("b", null, `은총 · ${HERO(CARDS[id].hero).ko}`));
      pick.appendChild(who);
      pick.appendChild(bigCard(CARDS[id], CARDART.pic[id] || null));
      gr.appendChild(pick);
    }
    for (const f of gained.flash) {
      const pick = el("div", "rpick rgot");
      const who = el("div", "rwho");
      const fl = (CARDS[f.cardId].flash || [])[f.n - 1] || {};
      who.appendChild(el("b", null, `신탁 ${"①②③④⑤"[f.n - 1]} ${fl.kind || ""}${f.shin ? ` · 기적(${RULES.DIVINE_KO[f.shin]})` : ""}`));
      pick.appendChild(who);
      pick.appendChild(bigCard(flashed(CARDS[f.cardId], f.n), CARDART.pic[f.cardId] || null));
      gr.appendChild(pick);
    }
    body.appendChild(gr);
  } else if (!(got.equip && got.equip.length)) {
    body.appendChild(el("p", "rnone", "이번 전투에서는 은총 · 신탁이 없었습니다. 빛나는 카드를 내면 내립니다."));
  }
  // (옛 보상 — 고유 카드 셋 · 신탁. 이벤트 등에서 cards · flash 를 채워 넘기면 그대로 보인다)
  const cards = got.cards;
  if (cards.length) body.appendChild(sec("고유 카드", "덱에 한 장 넣습니다"));
  const row = el("div", "rrow");
  for (const id of cards) {
    const c = CARDS[id];
    const pick = el("div", "rpick");
    // 누구 카드인지 — 초상과 이름을 카드 위에 붙인다
    const who = el("div", "rwho");
    if (c.hero) {
      who.appendChild(art.portrait(c.hero, { ko: HERO(c.hero).ko, tint: TINT(c.hero), size: 26, slot: "battle", still: true }));
      who.appendChild(el("b", null, HERO(c.hero).ko));
    } else who.appendChild(el("b", null, "공용"));
    pick.appendChild(who);
    const card = bigCard(c, CARDART.pic[id] || null);
    // 누르면 바로 넣지 않는다 — 가운데에 자세히 띄우고, 거기서 「덱에 넣습니다」
    card.onclick = () => rewardCard(id);
    card.title = "눌러서 자세히 보기";
    pick.appendChild(card);
    row.appendChild(pick);
  }
  if (cards.length) body.appendChild(row);

  // ② 신탁 — 가진 고유 카드에만 붙는다
  const offer = got.flash;
  if (!offer) {
    /* 신탁은 전투 중에 — 보상에 없으면 아무것도 안 그린다 */ } else if (false) {
    body.appendChild(sec("신탁", ""));
    // 왜 없는지 갈라서 말한다 — 안 뜬 것과 붙일 데가 없는 것은 다르다
    body.appendChild(el("p", "rnone", !R.flashTargets(run).length
      ? "신탁은 가진 고유 카드에 붙습니다. 고유 카드를 먼저 얻으세요."
      : "이번에는 신탁이 일어나지 않았습니다."));
  } else {
    const c = CARDS[offer.cardId];
    body.appendChild(sec("신탁", `「${c.name}」에 붙일 신탁 — 다섯 중 셋`));
    const fr = el("div", "rrow flashrow");
    fr.appendChild(flashTarget(c, offer.cardId));   // 어느 카드에 붙는지 — 이름만이 아니라 그림으로
    for (const n of offer.picks) {
      const f = (c.flash || [])[n - 1];
      if (!f) continue;
      const b = el("button", "fcard f" + n);
      const head = el("div", "fhead2");
      head.appendChild(el("span", "fnum", "①②③④⑤"[n - 1]));
      head.appendChild(el("b", null, f.kind));
      head.appendChild(el("span", "fko", f.ko));
      b.appendChild(head);
      b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
      b.appendChild(el("p", "fbefore", `지금: ${shortText(c.text)}`));
      b.onclick = () => rewardFlash(offer.cardId, n, f);
      fr.appendChild(b);
    }
    body.appendChild(fr);
  }

  // 보상 카드 자세히 — 여기서 골라야 덱에 들어간다
  function rewardCard(id) {
    const c = CARDS[id];
    const box = centerModal("cardmodal");
    const big = bigCard(c, CARDART.pic[id] || null);
    big.onclick = null; big.title = "";
    big.classList.add("bmcard");
    box.appendChild(big);
    const body = el("div", "bmbody");
    body.appendChild(el("span", "bmkind", c.hero ? `${HERO(c.hero).ko}의 고유 카드 · ${c.type}` : `공용 카드 · ${c.type}`));
    body.appendChild(el("h3", "bmname", c.name));
    const meter = el("div", "bmmeter");
    meter.appendChild(el("span", null, c.xcost ? "비용 X — 남은 AP 를 모두 씁니다" : `비용 ${c.cost} AP`));
    if (c.flash && c.flash.length) meter.appendChild(el("span", null, `신탁 ${c.flash.length}가지`));
    body.appendChild(meter);
    const { action, terms } = cardParts(c, c.hero);
    body.appendChild(withKeywords(el("p", "bmtext"), action, c.hero));
    if (terms.length) body.appendChild(termDl(terms));
    const row = el("div", "bmbtns");
    const go = el("button", "bmuse", "덱에 넣습니다");
    go.onclick = () => { closeCenter(); onPick(id, null); };
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeCenter;
    row.appendChild(go); row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }
  // 신탁 — 무엇이 바뀌는지 한 번 더 보여 주고 붙인다
  function rewardFlash(cardId, n, f) {
    const c = CARDS[cardId];
    const box = openFlashBox();
    function openFlashBox() { return centerModal("cardmodal flashmodal"); }
    const big = bigCard(c, CARDART.pic[cardId] || null);
    big.onclick = null; big.title = "";
    big.classList.add("bmcard");
    box.appendChild(big);
    const body = el("div", "bmbody");
    body.appendChild(el("span", "bmkind", `신탁 ${"①②③④⑤"[n - 1]} ${f.kind} · 「${c.name}」에 붙습니다`));
    body.appendChild(el("h3", "bmname", f.ko || f.kind));
    body.appendChild(el("span", "bmsub", "바뀐 뒤"));
    body.appendChild(withKeywords(el("p", "bmtext"), shortText(f.text), c.hero));
    body.appendChild(el("span", "bmsub", "지금"));
    body.appendChild(withKeywords(el("p", "bmhelp"), shortText(c.text), c.hero));
    const { terms } = cardParts({ ...c, text: f.text }, c.hero);
    if (terms.length) body.appendChild(termDl(terms));
    const row = el("div", "bmbtns");
    const go = el("button", "bmuse", "이 신탁을 붙입니다");
    go.onclick = () => { closeCenter(); onPick(null, { cardId, n }); };
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeCenter;
    row.appendChild(go); row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }

  function sec(label, why) {
    const d = el("div", "rsec");
    d.appendChild(el("b", null, label));
    if (why) d.appendChild(el("span", "why", why));
    return d;
  }
  return s;
}

// ── 장비 ────────────────────────────────────────────────────────────────
// 칸은 사도당 무기·방어구·장신구. 기획서: 얻는 곳은 보상·상점·이벤트, **바꿔 끼기는 휴식 노드(캠프)에서.**
//   mode "empty" — 보상·상점: 가방의 장비를 **빈 칸에만** 끼운다
//   mode "camp"  — 캠프: 바꿔 끼고 뺄 수 있다
// 지금 도는 것은 스탯 줄과 애착 Lv.3 스탯뿐이다. 효과 줄은 글만 보여 주고 「아직 안 돈다」고 적는다.
const STAT_KO = { hp: "HP", atk: "공격", def: "방어", crit: "치명" };
const statText = (st) => Object.entries(st || {}).filter(([, v]) => v).map(([k, v]) => `${STAT_KO[k]} +${v}${k === "crit" ? "%" : ""}`).join(" · ");

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
const GRADE_COLOR = { 전설: "#f0b94a", 희귀: "#9a7cf0", 고급: "#4fc08a", 일반: "#a8adbf" };
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
  n.title = `${e.ko} · ${e.slot} · ${e.grade}`;
  return n;
}
// 빈 칸 — 그 칸의 모양만 흐리게
const SLOT_GLYPH = { 무기: "sword", 방어구: "armor", 장신구: "gem" };
function emptySlotIcon(slot, size = 48) {
  const n = el("span", "eicon empty");
  n.style.width = n.style.height = size + "px";
  n.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${GEAR_GLYPH[SLOT_GLYPH[slot] || "gem"]}</svg>`;
  return n;
}
// 사도 한 명의 세 칸(무기 · 방어구 · 장신구) — 작은 줄. 누르면 이름 · 스탯이 뜬다(title)
function gearStrip(run, k, size = 26) {
  const g = R.gearOf(run, k);
  const row = el("span", "gstrip");
  for (const sl of RULES.SLOTS) {
    const e = g[sl] ? EQUIP[g[sl]] : null;
    const cell = e ? equipIcon(e, size) : emptySlotIcon(sl, size);
    if (!e) cell.title = `${sl} — 비어 있음`;
    row.appendChild(cell);
  }
  return row;
}
// 신탁이 붙을 카드 — 보상 · 수련 · 이벤트의 신탁 줄 맨 앞
function flashTarget(c, id) {
  const box = el("div", "ftarget");
  box.appendChild(el("span", "ftlab", "이 카드에 붙습니다"));
  const card = bigCard(c, (id && CARDART.pic[id]) || null);
  card.onclick = () => showCard(c, c.hero);
  box.appendChild(card);
  return box;
}

function equipCard(id, extra) {
  const e = EQUIP[id];
  const n = el("div", "ecard g-" + e.grade);
  const head = el("div", "ehead");
  head.appendChild(equipIcon(e, 44));
  head.appendChild(el("span", "eslot", e.slot));
  head.appendChild(el("b", null, e.ko));
  head.appendChild(el("span", "egrade", e.grade));
  n.appendChild(head);
  n.appendChild(el("p", "eqstat", statText(e.stats) || "스탯 없음"));
  // 효과 · 애착은 낀 사도의 패시브가 된다(docs/13-장비와 중립.md). 다 읽히지 않는 줄은 「아직 안 돕니다」로 흐리게
  const effLine = (label, text, on) => {
    const p = el("p", "eeff" + (on ? " on" : ""));
    p.appendChild(el("span", "eoff", on ? label : `${label} · 아직 안 돕니다`));
    p.appendChild(withKeywords(el("span"), " " + shortText(String(text).replace(/\s*\[[^\]]+\]/g, "")), e.affinity || null));
    return p;
  };
  if (e.effect) n.appendChild(effLine("효과", e.effect, e.effectRead));
  if (e.affinityKo) {
    n.appendChild(el("p", "eaff", `애착: ${e.affinityKo}${e.affinityLv3 ? ` — 끼면 ${statText(e.affinityLv3)} 더` : ""}`));
    if (e.affinityPassive) n.appendChild(effLine(`애착 · ${e.affinityKo}`, e.affinityPassive, e.affinityRead));
  }
  if (e.blurb) n.appendChild(el("p", "eblurb", e.blurb));
  if (extra) n.appendChild(extra);
  return n;
}

function gearPanel(run, mode, onChange, say) {
  const box = el("div", "gearpanel");
  const draw = () => {
    box.innerHTML = "";
    // 사도마다 세 칸
    const rows = el("div", "grows");
    for (const k of run.party) {
      const h = HERO_DATA[k] || HERO(k);
      const g = R.gearOf(run, k);
      const r = el("div", "grow");
      const who = el("div", "gwho");
      who.appendChild(art.portrait(k, { ko: h.ko, tint: TINT(k), size: 28, slot: "battle", still: true }));
      who.appendChild(el("b", null, h.ko));
      r.appendChild(who);
      const slots = el("div", "gslots");
      for (const sl of RULES.SLOTS) {
        const id = g[sl];
        const c = el("div", "gslot" + (id ? " full" : ""));
        c.appendChild(id ? equipIcon(EQUIP[id], 34) : emptySlotIcon(sl, 34));
        c.appendChild(el("span", "gsl", sl));
        if (id) {
          const e = EQUIP[id];
          c.appendChild(el("b", null, e.ko));
          const st = statText(R.statsOf(id, k));
          c.appendChild(el("span", "gst", st + (e.affinity === k ? " · 애착" : "")));
          // 빼기 — 전투 밖이면 어디서든(지도 · 캠프 · 상점). 빼면 가방으로
          const x = el("button", "gout", "빼기");
          x.onclick = () => { const why = R.unequip(run, k, sl); if (why && say) say(why); draw(); onChange && onChange(); };
          c.appendChild(x);
        } else c.appendChild(el("span", "gempty", "비어 있음"));
        slots.appendChild(c);
      }
      r.appendChild(slots);
      rows.appendChild(r);
    }
    box.appendChild(rows);
    // 가방
    if (run.bag.length) {
      box.appendChild(el("p", "gbagh", `가방 — 누구에게 낄지 고릅니다(차 있으면 바꿔 끼고, 빼낸 것은 가방으로). 팔면 사는 값의 ${Math.round(RULES.EQUIP_SELL * 100)}%`));
      const bag = el("div", "rrow gbag");
      for (const id of run.bag.slice()) {
        const e = EQUIP[id];
        const btns = el("div", "gto");
        for (const k of run.party) {
          const h = HERO_DATA[k] || HERO(k);
          const full = !!R.gearOf(run, k)[e.slot];
          const b = el("button", "gtobtn" + (e.affinity === k ? " aff" : ""), `${h.ko}${full ? " (바꾸기)" : ""}${e.affinity === k ? " ♥" : ""}`);
          b.onclick = () => { const why = R.equip(run, k, id, { swap: true }); if (why && say) say(why); draw(); onChange && onChange(); };
          btns.appendChild(b);
        }
        // 팔기 — 되돌릴 수 없으니 두 번 눌러야 판다(한 번 누르면 「한 번 더 누르면 판매」)
        const price = R.sellPrice(id);
        const sell = el("button", "gsell");
        sell.appendChild(goldIcon());
        sell.appendChild(document.createTextNode(`팔기 +${price}`));
        let armed = null;
        sell.onclick = () => {
          if (!armed) {
            sell.classList.add("armed");
            sell.lastChild.textContent = `한 번 더 누르면 판매 +${price}`;
            armed = setTimeout(() => { armed = null; sell.classList.remove("armed"); sell.lastChild.textContent = `팔기 +${price}`; }, 2600);
            return;
          }
          clearTimeout(armed); armed = null;
          const why = R.sellEquip(run, id);
          if (why && say) say(why);
          else if (say) say(`「${e.ko}」 을(를) ${price} 골드에 팔았습니다`);
          draw(); onChange && onChange();
        };
        btns.appendChild(sell);
        bag.appendChild(equipCard(id, btns));
      }
      box.appendChild(bag);
    } else box.appendChild(el("p", "rnone", "가방이 비었습니다."));
  };
  draw();
  return box;
}

// ── 캠프 ────────────────────────────────────────────────────────────────
// 한 층에 두 번 — 가운데 캠프, 보스 앞 캠프 + 상점. 슬더스 모닥불처럼 **하나만** 고른다.
//   쉬기  살아 있는 사도 HP 회복(최대 HP의 30%) — 쓰러진 사도는 주말농장에서 쉬는 중
//   수련  가진 고유 카드 하나에 신탁(다섯 중 셋)
// 캠프 + 상점이면 골디가 옆에 좌판을 폈다. 상점에 들르는 것은 캠프 선택을 쓰지 않는다.
//
// 「모닥불 + 고를 것」 — 왼쪽 무대에 파티 셋이 모닥불을 둘러 서고(전투 SD 스파인), 발밑에 HP 줄.
// 오른쪽에 쉬기 · 수련 두 장, 그 아래 장비 · 골디의 좌판. 1600×900 에서 스크롤이 없다.
// 신탁 고르기 · 장비는 위에 뜨는 창(.cp-modal) — 배치를 밀지 않게. 사도 그림은 한 번만 세우고 숫자만 고쳐 쓴다.
export function campScreen(run, withShop, onDone, onShop) {
  const s = screen();
  s.className = "campscreen2";
  setStageBg(s, run);
  const st = run.stops[run.camp && run.camp.key] || { used: null };
  const floor = FLOORS[run.floor] || { name: "" };
  const offer = run.camp && run.camp.train;
  const heal = (k) => {
    const hp = run.hp[k] || 0, max = run.maxHp[k] || 1;
    return hp <= 0 || st.used ? 0 : Math.min(max - hp, Math.round(max * RULES.CAMP_HEAL));
  };

  // ① 머리 — 이름 · 어디 · 골드 · 떠나기
  const top = el("div", "cp-top");
  const title = el("div", "cp-title");
  title.appendChild(el("b", null, withShop ? "캠프 · 골디의 좌판" : "캠프"));
  title.appendChild(el("span", null, `${floor.name} — ${withShop ? "보스 앞에서 한숨 돌립니다" : "길 가운데에서 한숨 돌립니다"}`));
  top.appendChild(title);
  const gold = el("div", "cp-gold");
  gold.appendChild(goldIcon());
  const goldN = el("b", null, String(run.gold));
  gold.appendChild(goldN);
  gold.appendChild(el("span", null, "골드"));
  top.appendChild(gold);
  top.appendChild(fsButton());
  const go = el("button", "cp-leave", bossNext(run) ? "보스에게 갑니다" : "길을 떠납니다");
  go.onclick = () => { closeSheet(); onDone(); };
  top.appendChild(go);
  s.appendChild(top);

  const main = el("div", "cp-main");
  s.appendChild(main);

  // ② 무대 — 모닥불을 둘러 선 파티
  const stage = el("div", "cp-stage");
  const fire = el("div", "cp-fire");
  fire.setAttribute("aria-hidden", "true");
  fire.appendChild(el("span", "cp-glow"));
  const flames = el("span", "cp-flames");
  for (let i = 0; i < 4; i++) flames.appendChild(el("i", "cp-flame f" + i));
  fire.appendChild(flames);
  fire.appendChild(el("span", "cp-logs"));
  const embers = el("span", "cp-embers");
  for (let i = 0; i < 9; i++) { const e = el("i"); e.style.setProperty("--e", String(i)); embers.appendChild(e); }
  fire.appendChild(embers);
  stage.appendChild(fire);

  const line = el("p", "cp-line");
  stage.appendChild(line);

  const members = run.party.map((k, i) => {
    const h = HERO_DATA[k] || HERO(k);
    const n = el("div", "cp-hero p" + i);
    // 불을 본다 — 왼쪽 둘은 오른쪽을, 오른쪽 하나는 왼쪽을(게임 SD 는 왼쪽을 보고 선다)
    n.appendChild(art.portrait(k, { ko: h.ko, tint: TINT(k), size: 200, slot: "battle", flip: i < 2 }));
    const plate = el("div", "cp-plate");
    const nm = el("div", "cp-name");
    nm.appendChild(el("b", null, h.ko));
    const num = el("span", "cp-num");
    nm.appendChild(num);
    plate.appendChild(nm);
    const bar = el("div", "cp-hp");
    const fill = el("i", "cp-fill");
    const add = el("em", "cp-add");
    bar.appendChild(fill);
    bar.appendChild(add);
    plate.appendChild(bar);
    n.appendChild(plate);
    stage.appendChild(n);
    return { k, n, num, fill, add };
  });
  main.appendChild(stage);

  // ③ 오른쪽 — 하나만 고른다 · 장비 · 좌판
  const side = el("aside", "cp-side");
  const head = el("div", "cp-sidehead");
  const headB = el("b");
  const headS = el("span");
  head.appendChild(headB);
  head.appendChild(headS);
  side.appendChild(head);

  const choices = el("div", "cp-choices");
  const rest = choiceBtn("cp-rest", "쉬기", "살아 있는 사도의 HP를 최대 HP의 30%만큼 채웁니다");
  const restGain = el("em", "cp-gain");
  rest.body.appendChild(restGain);
  rest.b.onclick = () => {
    const before = run.party.map((k) => run.hp[k] || 0);
    const why = R.campRest(run);
    if (why) return say(why);
    // 불이 한 번 확 일고, 사도마다 찬 만큼 떠오른다
    fire.classList.remove("flare"); void fire.offsetWidth; fire.classList.add("flare");
    members.forEach((m, i) => {
      const d = (run.hp[m.k] || 0) - before[i];
      if (d > 0) { const f = el("span", "cp-float", `+${d}`); m.n.appendChild(f); setTimeout(() => f.remove(), 1600); }
    });
    say("모닥불 곁에서 푹 쉬었습니다. 다시 걸을 힘이 납니다.");
    refresh();
  };
  choices.appendChild(rest.b);

  const train = choiceBtn("cp-train", "수련", offer ? `「${CARDS[offer.cardId].name}」에 신탁을 붙입니다 — 다섯 중 셋` : "신탁을 붙일 고유 카드가 없습니다");
  if (offer) {
    const mini = el("span", "cp-mini");
    const c = bigCard(CARDS[offer.cardId], CARDART.pic[offer.cardId] || null);
    c.onclick = null; c.title = "";
    mini.appendChild(c);
    train.b.appendChild(mini);
  }
  train.b.onclick = () => {
    if (st.used || !offer) return say(st.used ? "이번 캠프에서는 이미 골랐습니다" : "신탁을 붙일 고유 카드가 없습니다");
    openTrain();
  };
  choices.appendChild(train.b);
  side.appendChild(choices);

  // 캠프 선택을 쓰지 않는 것들 — 장비 · 좌판
  const extra = el("div", "cp-extra");
  const gearB = el("button", "cp-gear");
  gearB.appendChild(el("i", "cp-gicon", "⚙"));
  const gtx = el("span", "cp-xtx");
  gtx.appendChild(el("b", null, "장비"));
  const gsub = el("span");
  gtx.appendChild(gsub);
  gearB.appendChild(gtx);
  gearB.appendChild(el("em", "cp-free", "선택을 쓰지 않습니다"));
  gearB.onclick = openGear;
  extra.appendChild(gearB);

  if (withShop) {
    const sb = el("button", "cp-shop");
    const gbox = el("span", "cp-goldy");
    gbox.appendChild(el("span", "cp-gemblem", "✦"));
    sb.appendChild(gbox);
    const tx = el("span", "cp-xtx");
    tx.appendChild(el("b", null, "골디의 좌판 들르기"));
    tx.appendChild(el("span", null, "「어서 오세요, 고객님!」 — 들러도 캠프 선택은 그대로 남습니다"));
    sb.appendChild(tx);
    sb.appendChild(goldLabel("em", "cp-free", `${run.gold}`));
    sb.onclick = () => { closeSheet(); onShop(); };
    extra.appendChild(sb);
    // 화면에 붙은 뒤에 그린다(크기를 재야 한다). 런타임 · 자료가 없으면 금화 표식이 선다
    spineView(gbox, "standing", "goldy", { anim: "Idle_1" }).then((v) => { if (v) gbox.classList.add("live"); });
  }
  side.appendChild(extra);
  main.appendChild(side);

  function choiceBtn(cls, label, sub) {
    const b = el("button", "cp-choice " + cls);
    b.appendChild(el("i", "cp-cicon"));
    const body = el("span", "cp-cbody");
    body.appendChild(el("b", null, label));
    const subEl = el("span", "cp-csub", sub);
    body.appendChild(subEl);
    b.appendChild(body);
    const stamp = el("span", "cp-stamp");
    b.appendChild(stamp);
    return { b, body, sub: subEl, stamp };
  }

  function say(t) {
    line.textContent = t || "";
    line.classList.remove("pop"); void line.offsetWidth; line.classList.add("pop");
  }

  // 숫자 · 상태만 고친다 — 사도 그림(스파인)은 다시 세우지 않는다
  function refresh() {
    let total = 0;
    for (const m of members) {
      const hp = run.hp[m.k] || 0, max = run.maxHp[m.k] || 1;
      const down = hp <= 0, gain = heal(m.k);
      total += gain;
      m.n.classList.toggle("down", down);
      m.fill.style.width = `${(hp / max) * 100}%`;
      m.add.style.left = `${(hp / max) * 100}%`;
      m.add.style.width = `${(gain / max) * 100}%`;
      m.num.textContent = down ? "주말농장에서 쉬는 중" : `${hp} / ${max}${gain ? `  +${gain}` : ""}`;
    }
    headB.textContent = st.used ? (st.used === "rest" ? "푹 쉬었습니다" : "수련을 마쳤습니다") : "캠프에서 하나만 고릅니다";
    headS.textContent = st.used ? "이번 캠프에서는 이미 골랐습니다 — 장비는 아직 바꿀 수 있습니다" : "쉬기와 수련 중 하나 · 장비와 좌판은 선택을 쓰지 않습니다";

    const done = (x, on) => {
      x.b.disabled = !!st.used;
      x.b.classList.toggle("on", on);
      x.b.classList.toggle("off", !!st.used && !on);
      x.stamp.textContent = on ? "골랐습니다" : st.used ? "이번 캠프에서는 이미 골랐습니다" : "";
    };
    done(rest, st.used === "rest");
    restGain.textContent = st.used ? "" : total ? `파티 합계 +${total} HP` : "지금은 찰 HP가 없습니다";
    done(train, st.used === "train");
    if (!offer && !st.used) { train.b.disabled = true; train.b.classList.add("off"); }
    if (st.used === "train" && offer && run.flash[offer.cardId]) {
      const f = (CARDS[offer.cardId].flash || [])[run.flash[offer.cardId] - 1];
      train.sub.textContent = `「${CARDS[offer.cardId].name}」에 신탁 ${"①②③④⑤"[run.flash[offer.cardId] - 1]}${f ? ` ${f.ko}` : ""}을 붙였습니다`;
    }
    gsub.textContent = run.bag.length ? `가방에 ${run.bag.length}점 · 끼기 · 빼기 · 팔기` : "낀 장비 보기 · 빼기";
    gearB.classList.toggle("new", run.bag.length > 0);
    goldN.textContent = String(run.gold);
  }

  // ④ 위에 뜨는 창 — 신탁 고르기 · 장비. 바깥 · Esc · 닫기로 닫는다
  let sheet = null;
  const esc = (e) => { if (e.key === "Escape") closeSheet(); };
  function closeSheet() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    if (typeof removeEventListener === "function") removeEventListener("keydown", esc);
  }
  function openSheet(cls, label, why, body) {
    closeSheet();
    sheet = el("div", "cp-modal " + cls);
    sheet.onpointerdown = (e) => { if (e.target === sheet) closeSheet(); };
    const box = el("div", "cp-sheet");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", label);
    const hd = el("div", "cp-sheethead");
    const tx = el("div");
    tx.appendChild(el("b", null, label));
    tx.appendChild(el("span", null, why));
    hd.appendChild(tx);
    const x = el("button", "cp-close", "닫기");
    x.onclick = closeSheet;
    hd.appendChild(x);
    box.appendChild(hd);
    body.classList.add("cp-sheetbody");
    box.appendChild(body);
    sheet.appendChild(box);
    s.appendChild(sheet);
    if (typeof addEventListener === "function") addEventListener("keydown", esc);
  }

  function openTrain() {
    const c = CARDS[offer.cardId];
    const wrap = el("div", "cp-trainwrap");
    const fr = el("div", "cp-flash");
    const ts = twoStep((n) => {
      const why = R.campTrain(run, { cardId: offer.cardId, n });
      closeSheet();
      if (why) return say(why);
      say(`「${c.name}」에 신탁을 붙였습니다. 불빛 아래에서 손에 익혔습니다.`);
      refresh();
    }, { verb: "신탁을 붙입니다" });
    fr.appendChild(flashTarget(c, offer.cardId));   // 어느 카드에 붙는지 — 이름만이 아니라 그림으로
    for (const n of offer.picks) {
      const f = (c.flash || [])[n - 1];
      if (!f) continue;
      const b = el("button", "fcard f" + n);
      const hd = el("div", "fhead2");
      hd.appendChild(el("span", "fnum", "①②③④⑤"[n - 1]));
      hd.appendChild(el("b", null, f.kind));
      hd.appendChild(el("span", "fko", f.ko));
      b.appendChild(hd);
      b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
      b.appendChild(el("p", "fbefore", `지금: ${shortText(c.text)}`));
      b.onclick = () => ts.pick(b, n, `${"①②③④⑤"[n - 1]} ${f.kind}`);
      fr.appendChild(b);
    }
    wrap.appendChild(fr);
    wrap.appendChild(ts.bar);
    openSheet("cp-trainmodal", `수련 — 「${c.name}」에 붙일 신탁`, "다섯 중 셋 · 눌러 고르고 아래 단추로 정합니다 · 정하면 이번 캠프의 선택을 씁니다", wrap);
  }

  function openGear() {
    const wrap = el("div", "cp-gearbody");
    wrap.appendChild(gearPanel(run, "camp", refresh, say));
    openSheet("cp-gearmodal", "장비", "끼기 · 빼기 · 바꿔 끼기 · 팔기 — 캠프 선택을 쓰지 않습니다", wrap);
  }

  say(st.used ? "불이 잦아듭니다. 떠날 채비를 합니다." : withShop ? "보스가 코앞입니다. 불을 쬐며 채비를 합니다 — 골디가 옆에 좌판을 폈습니다." : "모닥불이 탁탁 튑니다. 쉬어 갈까요, 손을 익힐까요?");
  refresh();
  return s;
}

// ── 골디의 상점 ─────────────────────────────────────────────────────────
// 층마다 보스 앞에서 한 번. 골디(황금에서 태어난 용족 상인 · 교단 상점 담당)가 판다.
// 인물 사전 그대로: '고객님' 하고 부르고, 정품만 팔고, **할인은 웃으며 거절한다.** 말하다 말고 와작.
// 파는 것 — 중립 카드 셋(효과가 다 도는 것만) · 장비 셋 · 카드 제거 한 번. 새로고침하면 진열을 통째로 다시 굴린다.
// 고유 카드는 팔지 않는다 — 은총(전투 중)으로만 얻는다.
const GOLDY = {
  hello: "어서 오세요, 고객님! 오늘 들어온 물건은 전부 정품이에요.",
  buy: ["탁월한 선택이세요!", "센스가 좋으시네요!", "좋은 물건은 주인을 알아보는 법이죠!"],
  equip: "장인의 손길이 닿은 정품이에요! 가방에 넣어 드렸어요. …와작.",
  delivery: "슈팡 씨가 맡기고 간 택배예요. 값은 벌써 치르셨답니다!",
  poor: "좋은 물건에는 그만한 값이 있는 법이죠. 조금 더 모아 오세요!",
  // 첫 줄은 늘 같다 — 할인은 안 된다는 말부터
  haggle: [
    "할인은 안 돼요! 대신 품질은 제가 보증하죠. …와작.",
    "금을 깎는 건 세공사 일이지, 상인 일이 아니에요!",
    "고객님, 정품에 흥정은 실례예요. 값이 곧 품질이거든요.",
    "안 돼요. 실비아가 부탁해도 안 깎아 줘요. …선물은 따로 주지만요.",
  ],
  reroll: [
    "창고에서 새 물건을 꺼내 올게요! 이것도 전부 정품이에요.",
    "이쪽은 어떠세요? 방금 들어온 신상이에요!",
    "구경은 공짜예요. 진열을 바꾸는 건 공짜가 아니지만요!",
  ],
  remove: "필요 없는 걸 덜어 내는 게 제일 좋은 세공이에요.",
  bye: "또 오세요, 고객님! …와작.",
  // 골디를 누르면 — 쓰다듬기. 돌아가며 한 줄씩
  pat: [
    "손님, 그건 서비스 품목이 아니에요!",
    "어머, 뿔은 만지시면 안 돼요. 금보다 귀한 거라서요!",
    "쓰다듬기는 값을 매길 수가 없네요… 그래도 할인은 없어요!",
    "실비아가 어릴 땐 제가 이렇게 쓰다듬어 줬는데… 흠흠, 뭐 사실 거예요?",
    "와작— 앗, 간식 먹던 중이었어요. 못 본 걸로 해 주세요!",
    "비늘 한 장도 순금이에요. 만지신 만큼 사 가셔야 해요?",
  ],
  // 파티에 있으면 먼저 건네는 말 — 인물 사전의 관계에서
  greet: {
    실비아: "황금대공! 이건 선물이에요. 값은 안 받아요 — 장사가 아니니까요.",
    비비: "오, 오랜만이네요. 옛날 이야기는… 다음에 하죠. 신상 보실래요?",
    시스트: "시스트 씨는 오늘도 협회 이름 안 팔고 구경만 하시는 거죠? 정품만 있어요.",
    "시온 더 다크불릿": "우리 가게에서 일하던 시온 씨! 방은 지낼 만해요?",
    피라: "피라 씨, 요즘 연금술은 어때요? 금 이야기라면 언제든 환영이에요.",
    리츠: "리츠 씨, 오늘은 승부 말고 쇼핑이죠? 여기선 힘자랑 금지예요.",
    클로에: "협회 회의는 다음 주예요, 클로에 씨. 오늘은 손님으로 오셨네요!",
    에슈르: "에슈르 씨, 그때 학교에 피신시켜 줘서 고마웠어요.",
  },
};
// 골디의 몸짓 — 스탠딩 스파인(assets/spine/standing/goldy)의 동작 이름. 0.27초짜리(Happy_6 등)는 표정만 바뀌어 뺐다.
// [앞, 뒤] 는 짝 — 앞을 하고 이어서 뒤를 한 다음 쉰다
const GOLDY_ANIM = {
  enter: ["Enter"],
  buy: ["Happy_1", "Happy_2", "Happy_3", "Laugh_1"],
  poor: ["Panic_1", "Panic_2", "Sad_1"],
  haggle: ["Sulky_1", "Sulky_2", "Sulky_3", "Angry_1", "Angry_2"],
  reroll: ["Point_1", "Point_2", "Point_3"],
  remove: ["Smile_1", "Smile_2"],
  pet: [["Touch_Idle", "Touch_End"], ["Pat_Idle", "Pat_End"]],
  bye: ["Close_1"],
};

// 「골디 + 진열대」 — 왼쪽에 골디가 서서 말하고, 오른쪽 한 화면에 진열 여섯 칸 + 제거 · 새로고침 · 흥정.
// 1600×900 에서 넘치지 않는다. 덱에서 빼기 · 가방은 위에 뜨는 창으로 — 배치를 밀지 않게.
export function shopScreen(run, onDone, opts = {}) {
  const s = screen();
  s.className = "shopscreen2";
  setStageBg(s, run);
  const shop = run.shop || R.rollShop(run);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ① 머리 — 이름 · 선물 · 골드 · 나가기
  const top = el("div", "sh-top");
  const title = el("div", "sh-title");
  title.appendChild(el("b", null, "골디의 상점"));
  title.appendChild(el("span", null, "황금에서 태어난 용족 상인 · 정품만 팝니다"));
  top.appendChild(title);
  if (shop.gift && CARDS[shop.gift]) {
    const gift = el("button", "sh-gift");
    gift.appendChild(el("i", null, "♥"));
    gift.appendChild(el("span", null, `실비아 몫의 선물 — 「${CARDS[shop.gift].name}」 을 덱에 넣었습니다`));
    gift.title = "눌러서 카드 보기";
    gift.onclick = () => showCard(CARDS[shop.gift], null);
    top.appendChild(gift);
  }
  const gold = el("div", "sh-gold");
  top.appendChild(gold);
  top.appendChild(fsButton());
  const leave = el("button", "sh-leave", opts.back || (bossNext(run) ? "보스에게 갑니다" : "길을 떠납니다"));
  let leaving = false;
  leave.onclick = () => {
    if (leaving) return;
    leaving = true; closeSheet();
    say(GOLDY.bye); act("bye");
    // 인사하는 몸짓을 잠깐 보여 주고 나간다. 그림이 없으면 바로
    setTimeout(onDone, goldy ? 650 : 0);
  };
  top.appendChild(leave);
  s.appendChild(top);

  const main = el("div", "sh-main");
  s.appendChild(main);

  // ② 왼쪽 — 골디. 누르면 쓰다듬는다
  const side = el("div", "sh-goldy");
  const bubble = el("div", "sh-bubble");
  bubble.appendChild(el("b", null, "골디"));
  const line = el("p", "sh-line");
  bubble.appendChild(line);
  side.appendChild(bubble);
  const stand = el("button", "sh-stand");
  stand.setAttribute("aria-label", "골디 쓰다듬기");
  stand.title = "쓰다듬기";
  stand.appendChild(el("span", "sh-emblem", "✦"));
  let pats = 0;
  stand.onclick = () => { say(GOLDY.pat[pats++ % GOLDY.pat.length]); act("pet"); };
  side.appendChild(stand);
  const plate = el("div", "sh-plate");
  plate.appendChild(el("b", null, "골디"));
  plate.appendChild(el("span", null, "교단 상점 담당 · 누르면 쓰다듬습니다"));
  side.appendChild(plate);
  main.appendChild(side);

  // ③ 오른쪽 — 진열대 + 할 일
  const right = el("div", "sh-right");
  const shelf = el("div", "sh-shelf");
  const acts = el("div", "sh-acts");
  right.appendChild(shelf);
  right.appendChild(acts);
  main.appendChild(right);

  let goldy = null;
  function act(kind) {
    if (!goldy) return;
    const a = pick(GOLDY_ANIM[kind]);
    if (Array.isArray(a)) goldy.play(a[0], false, a[1]); else goldy.play(a);
  }
  function say(t) {
    line.textContent = t;
    // 말할 때마다 말풍선이 톡 — 같은 줄이어도 다시 튄다
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
  }
  const poor = () => { say(GOLDY.poor); act("poor"); };

  const firstWord = run.party.map((k) => (HERO_DATA[k] || HERO(k)).ko).find((ko) => GOLDY.greet[ko]);
  say(firstWord ? GOLDY.greet[firstWord] : GOLDY.hello);
  // 화면에 붙은 뒤에 그린다(크기를 재야 한다). 런타임 · 자료가 없으면 금화 표식이 선다
  spineView(stand, "standing", "goldy", { anim: "Idle_1" }).then((v) => {
    if (!v) { stand.classList.add("still"); return; }
    goldy = v; stand.classList.add("live");
    if (!leaving) act("enter");
  });

  let haggles = 0;
  let fresh = true;                // 진열이 새로 깔렸으면 한 칸씩 올라온다(처음 · 새로고침)
  let lastGold = run.gold;
  let bagNew = false;

  function draw() {
    // 골드 — 쓰면 빠진 만큼 떠올랐다 사라진다
    gold.innerHTML = "";
    gold.appendChild(goldIcon());
    gold.appendChild(el("b", null, String(run.gold)));
    gold.appendChild(el("span", null, "골드"));
    if (run.gold < lastGold) gold.appendChild(el("em", "sh-spend", `−${lastGold - run.gold}`));
    lastGold = run.gold;

    shelf.innerHTML = "";
    shelf.classList.toggle("fresh", fresh);
    fresh = false;
    const rows = [
      ["neutral", "중립 카드", "어느 사도의 것도 아닙니다 · 공격력·방어력이 가장 높은 아군 기준으로 돕니다"],
      ["equip", "장비", "사면 가방에 들어갑니다 · 빈 칸이면 바로 낄 수 있습니다"],
    ];
    let n = 0;
    for (const [kind, label, why] of rows) {
      const row = el("section", "sh-row sh-" + kind);
      const head = el("div", "sh-rowhead");
      head.appendChild(el("b", null, label));
      head.appendChild(el("span", null, why));
      row.appendChild(head);
      const slots = el("div", "sh-slots");
      shop.items.forEach((it, i) => {
        if (it.kind !== kind) return;
        const slot = kind === "equip" ? equipSlot(it, i) : cardSlot(it, i);
        slot.style.setProperty("--i", String(n++));
        slots.appendChild(slot);
      });
      if (!slots.children.length) slots.appendChild(el("p", "sh-none", kind === "equip" ? "오늘은 진열할 장비가 없습니다." : "오늘은 진열할 중립 카드가 없습니다."));
      row.appendChild(slots);
      shelf.appendChild(row);
    }

    // 할 일 — 카드 제거 · 새로고침 · (가방) · 깎아 주세요
    acts.innerHTML = "";
    const rmPrice = R.removePrice(run);
    const rm = actBtn("sh-remove", "카드 제거", shop.removeUsed ? "이번에는 이미 한 장 뺐습니다" : "덱에서 한 장 · 쓸수록 오릅니다", shop.removeUsed ? "끝" : rmPrice);
    rm.disabled = !!shop.removeUsed;
    if (!shop.removeUsed && run.gold < rmPrice) rm.classList.add("short");
    rm.onclick = () => { if (run.gold < rmPrice) return poor(); openDeck(); };
    acts.appendChild(rm);

    const rrPrice = R.rerollPrice(run);
    const rr = actBtn("sh-reroll", "새로고침", "진열을 통째로 바꿉니다", rrPrice);
    if (run.gold < rrPrice) rr.classList.add("short");
    rr.onclick = () => {
      const why = R.rerollShop(run);
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      say(pick(GOLDY.reroll)); act("reroll");
      fresh = true; draw();
    };
    acts.appendChild(rr);

    if (run.bag.length) {
      const bag = actBtn("sh-bag" + (bagNew ? " new" : ""), "가방", "사 둔 장비를 빈 칸에 낍니다", `${run.bag.length}점`);
      bag.onclick = () => { bagNew = false; openBag(); };
      acts.appendChild(bag);
    }

    const hg = actBtn("sh-haggle", "깎아 주세요", "…혹시 될까요?", "흥정");
    hg.onclick = () => { say(GOLDY.haggle[haggles++ % GOLDY.haggle.length]); act("haggle"); };
    acts.appendChild(hg);
  }

  function actBtn(cls, label, sub, price) {
    const b = el("button", "sh-act " + cls);
    const tx = el("span", "sh-acttx");
    tx.appendChild(el("b", null, label));
    tx.appendChild(el("span", null, sub));
    b.appendChild(tx);
    b.appendChild(typeof price === "number" ? goldLabel("em", "sh-actprice", String(price)) : el("em", "sh-actprice", price));
    return b;
  }

  // 사는 단추 — 금빛. 모자라면 흐리게(눌러 보면 골디가 말해 준다)
  function buyBtn(it, i) {
    const b = it.sold || it.delivery ? el("button", "sh-buy", it.sold ? "팔렸습니다" : "택배 받기") : goldLabel("button", "sh-buy", String(it.price));
    b.disabled = !!it.sold;
    if (!it.sold && run.gold < it.price) b.classList.add("short");
    b.onclick = () => {
      const why = R.buy(run, i);
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      if (it.kind === "equip") { bagNew = true; say(it.delivery ? GOLDY.delivery : GOLDY.equip); }
      else say(pick(GOLDY.buy));
      act("buy");
      draw();
    };
    return b;
  }
  const soldMark = (slot, it) => {
    if (!it.sold) return;
    slot.classList.add("sold");
    slot.appendChild(el("span", "sh-stamp", "팔렸습니다"));
  };

  function cardSlot(it, i) {
    const c = CARDS[it.id];
    const slot = el("div", "sh-slot sh-cardslot");
    const box = el("div", "sh-cardbox");
    box.appendChild(bigCard(c, CARDART.pic[it.id] || null));
    slot.appendChild(box);
    const info = el("div", "sh-info");
    info.appendChild(el("span", "sh-grade g-" + (c.grade || ""), `${c.grade || "중립"} · 중립`));
    info.appendChild(el("p", "sh-blurb", c.blurb || shortText(c.text || "")));
    info.appendChild(buyBtn(it, i));
    slot.appendChild(info);
    soldMark(slot, it);
    return slot;
  }

  function equipSlot(it, i) {
    const slot = el("div", "sh-slot sh-equipslot" + (it.delivery ? " delivery" : ""));
    if (it.delivery) slot.appendChild(el("span", "sh-ribbon", "슈팡 택배"));
    slot.appendChild(equipCard(it.id));
    slot.appendChild(buyBtn(it, i));
    soldMark(slot, it);
    return slot;
  }

  // ④ 위에 뜨는 창 — 덱에서 빼기 · 가방. 바깥 · Esc · 닫기로 닫는다
  let sheet = null;
  const esc = (e) => { if (e.key === "Escape") closeSheet(); };
  function closeSheet() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    if (typeof removeEventListener === "function") removeEventListener("keydown", esc);
  }
  function openSheet(cls, label, why, body) {
    closeSheet();
    sheet = el("div", "sh-modal " + cls);
    sheet.onpointerdown = (e) => { if (e.target === sheet) closeSheet(); };
    const box = el("div", "sh-sheet");
    const head = el("div", "sh-sheethead");
    const tx = el("div");
    tx.appendChild(el("b", null, label));
    tx.appendChild(el("span", null, why));
    head.appendChild(tx);
    const x = el("button", "sh-close", "닫기");
    x.onclick = closeSheet;
    head.appendChild(x);
    box.appendChild(head);
    body.classList.add("sh-sheetbody");
    box.appendChild(body);
    sheet.appendChild(box);
    s.appendChild(sheet);
    if (typeof addEventListener === "function") addEventListener("keydown", esc);
  }

  function openDeck() {
    const price = R.removePrice(run);
    const wrap = el("div", "sh-deckwrap");
    const grid = el("div", "sh-deck");
    // 두 단계 — 눌러 고르고 「N 골드로 뺍니다」 로 정한다(골드가 나가니 한 번 눌러 바로 빠지면 안 된다)
    const ts = twoStep((id) => {
      const why = R.removeCard(run, id);
      closeSheet();
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      say(GOLDY.remove); act("remove"); draw();
    }, { verb: `${price} 골드로 뺍니다`, danger: true });
    run.deck.forEach((id) => {
      const c = CARDS[id];
      if (!c) return;
      const w = el("button", "sh-deckcard");
      w.appendChild(bigCard(c, CARDART.pic[id] || null));
      w.title = "눌러서 고르기";
      w.onclick = () => ts.pick(w, id, c.name);
      grid.appendChild(w);
    });
    wrap.appendChild(grid);
    wrap.appendChild(ts.bar);
    openSheet("sh-deckmodal", "뺄 카드를 고릅니다", `${price} 골드 · 이번 상점에서 한 장 · 덱 ${run.deck.length}장`, wrap);
  }

  function openBag() {
    const wrap = el("div", "sh-bagbody");
    wrap.appendChild(gearPanel(run, "empty", draw, say));
    openSheet("sh-bagmodal", "가방", "끼기 · 빼기 · 바꿔 끼기 · 팔기 — 전투 밖이면 어디서든", wrap);
  }

  draw();
  return s;
}

// ── 이벤트 ─────────────────────────────────────────────────────────────
// 맵의 이벤트 칸(?)(docs/08-이벤트.md). 장면 → 선택지 → 결과 → (고를 것이 있으면) 하나씩 고른다.
// 선택지마다 **무엇을 치르고 무엇을 얻는지** 결과 낱말 그대로 보여 준다 — 확률도 숫자로.
// 사도 덕에 열린 선택지에는 그 사도의 초상이 붙는다(카제나 식).
const POOL_KO = (p) => (p === "공용" ? "어디서나" : `${(FLOORS[p] || {}).name || ""}`);
const heroKeyByKo = (ko) => Object.keys(HERO_DATA).find((k) => HERO_DATA[k].ko === ko) || null;
const pctTxt = (p) => `${Math.round(p * 100)}%`;

// 새 판(eventscreen2) — 상점 · 캠프와 같은 옷: 이 층의 이벤트 배경, 왼쪽에 나오는 사도의 스탠딩과 말풍선(장면), 오른쪽에 선택지.
// 선택지 · 결과에서 고를 것(카드 · 신탁 · 사도)은 모두 두 단계(twoStep) — 눌러 고르고 단추로 정한다.
export function eventScreen(run, onDone, onFight) {
  const s = screen();
  s.className = "eventscreen2";
  // 배경 — 이 층의 이벤트 자리 그림(싸움터와 같은 표)
  const floor = R.currentFloor(run);
  const bgFile = `assets/bg/${(BATTLE_BG[floor.n] || BATTLE_BG[1]).event}.jpg`;
  s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bgFile, location.href).href : bgFile}")`);

  // 틀은 한 번만 — 머리 · 왼쪽 무대(사도 스탠딩과 말풍선) · 오른쪽 판. 바뀌는 것만 다시 채운다(스파인을 매번 새로 세우지 않게)
  const top = el("div", "ev2-top");
  const main = el("div", "ev2-main");
  const stage = el("div", "ev2-stage");
  const bubble = el("div", "ev2-bubble");
  const who = el("b", "ev2-who");
  const line = el("p", "ev2-line");
  bubble.appendChild(who); bubble.appendChild(line);
  const stand = el("div", "ev2-stand");
  const plate = el("div", "ev2-plate");
  stage.appendChild(stand); stage.appendChild(bubble); stage.appendChild(plate);
  const panel = el("div", "ev2-panel");
  main.appendChild(stage); main.appendChild(panel);
  s.appendChild(top); s.appendChild(main);
  let sheet = null;               // 결과에서 고를 것(카드 · 신탁 · 사도) — 위에 뜨는 창
  let standFor = null, npcView = null;
  // 떠날 때 — 스탠딩을 치우고, 늦게 도착한 그림은 standFor 가 달라 버려진다
  const leaveStage = () => { standFor = "gone"; if (npcView) { npcView.dispose && npcView.dispose(); npcView = null; } };

  const say = (t) => {
    line.textContent = t || "";
    bubble.classList.toggle("empty", !t);
    bubble.classList.remove("pop"); void bubble.offsetWidth; bubble.classList.add("pop");
  };
  const act = (names) => { if (npcView) npcView.play(names.find((n) => npcView.has && npcView.has(n)) || names[0]); };

  // 무대 — 이벤트에 나오는 사도(인물 사전 이름 → 사도 키)의 스탠딩. 없으면 이벤트 표식
  function setStage(ev) {
    const id = ev ? ev.id : "fork";
    if (standFor === id) return;
    standFor = id;
    if (npcView) { npcView.dispose && npcView.dispose(); npcView = null; }
    stand.innerHTML = ""; stand.className = "ev2-stand"; plate.innerHTML = "";
    const npc = ev && ev.npc && heroKeyByKo(ev.npc);
    if (npc) {
      who.textContent = ev.npc;
      plate.appendChild(el("b", null, ev.npc));
      plate.appendChild(el("span", null, `${HERO(npc).race || ""} · ${HERO(npc).nature || ""}`));
      const mine = id;
      spineView(stand, "standing", npc, { anim: "Idle_1", mix: 0.25 }).then((v) => {
        if (standFor !== mine) { v && v.dispose && v.dispose(); return; }
        if (!v) { stand.classList.add("still"); stand.appendChild(art.portrait(npc, { ko: ev.npc, tint: TINT(npc), size: 0, slot: "event", still: true })); return; }
        npcView = v; stand.classList.add("live");
        act(["Happy_1", "Smile_1", "Idle_1"]);
      });
    } else {
      who.textContent = ev ? ev.name : "갈림길";
      stand.classList.add("mark");
      const m = el("div", "ev2-mark");
      m.appendChild(el("span", null, ev ? "!" : "?"));
      stand.appendChild(m);
      plate.appendChild(el("b", null, ev ? ev.name : "갈림길"));
      plate.appendChild(el("span", null, ev ? `${POOL_KO(ev.pool)} · ${ev.kind}` : "지도를 미리 봐 두었습니다"));
    }
  }

  // 머리 — 이름 · 파티 체력 · 골드 · 떠나기
  function paintTop(ev, E) {
    top.innerHTML = "";
    const title = el("div", "ev2-title");
    title.appendChild(el("b", null, ev ? ev.name : "갈림길"));
    title.appendChild(el("span", null, ev ? `이벤트 · ${POOL_KO(ev.pool)} · ${ev.kind}` : "어느 쪽으로 갈지 고릅니다"));
    top.appendChild(title);
    const party = el("div", "ev2-party");
    for (const k of run.party) {
      const hp = run.hp[k] || 0, max = run.maxHp[k] || 1;
      const c = el("div", "ev2-mem" + (hp <= 0 ? " down" : ""));
      c.appendChild(art.portrait(k, { ko: HERO(k).ko, tint: TINT(k), size: 30, slot: "battle", still: true }));
      const info = el("div");
      info.appendChild(el("b", null, HERO(k).ko));
      const bar = el("i", "ev2-hp"); const fill = el("s"); fill.style.width = `${(hp / max) * 100}%`; bar.appendChild(fill);
      info.appendChild(bar);
      info.appendChild(el("small", null, hp <= 0 ? "주말농장에서 쉬는 중" : `${hp} / ${max} · 공격 ${(HERO_DATA[k] || {}).atk || "?"}`));
      c.appendChild(info);
      party.appendChild(c);
    }
    top.appendChild(party);
    top.appendChild(goldLabel("div", "ev2-gold", `${run.gold}`));
    top.appendChild(fsButton());
    if (E && E.phase === "result" && !E.pending.length) {
      const go = el("button", "ev2-leave", bossNext(run) ? "보스에게 갑니다" : "길을 떠납니다");
      go.onclick = () => { closeSheet(); leaveStage(); EV.leaveEvent(run); onDone(); };
      top.appendChild(go);
    }
  }

  draw();

  function draw() {
    const E = run.event;
    if (!E) return;
    const ev = E.id ? EV.eventById(E.id) : null;
    setStage(ev);
    paintTop(ev, E);
    panel.innerHTML = "";
    closeSheet();

    // 「지도 공개」 — 둘 중 하나를 고른다
    if (!ev) {
      say("앞길이 둘로 갈립니다. 어느 쪽 이야기를 들으러 갈까요?");
      panel.appendChild(el("div", "ev2-head", "갈림길"));
      const ts = twoStep((id) => { EV.pickEvent(run, id); draw(); }, { verb: "이쪽으로 갑니다" });
      for (const id of E.choices) {
        const e2 = EV.eventById(id);
        const b = el("button", "ev2-opt ev2-fork");
        b.appendChild(el("b", "ev2-label", e2.name));
        b.appendChild(el("span", "ev2-kind", `${POOL_KO(e2.pool)} · ${e2.kind}${e2.npc ? ` · ${e2.npc}` : ""}`));
        b.appendChild(el("p", "ev2-scene", e2.scene));
        b.onclick = () => ts.pick(b, id, e2.name);
        panel.appendChild(b);
      }
      panel.appendChild(ts.bar);
      return;
    }

    if (E.phase === "choose") {
      say(ev.scene);
      panel.appendChild(el("div", "ev2-head", "어떻게 할까요"));
      const ts = twoStep((i) => {
        const r = EV.choose(run, i);
        if (r.why) return hint(r.why);
        hint("");
        if (r.fight) { leaveStage(); return onFight(); }
        act(["Happy_1", "Smile_1", "Laugh_1"]);
        draw();
      }, { verb: "이것으로 합니다" });
      EV.optionsOf(run, ev).forEach((opt, i) => {
        const lock = EV.lockOf(run, opt);
        const b = el("button", "ev2-opt" + (opt.leave ? " leave" : "") + (lock ? " locked" : ""));
        const by = EV.openedBy(run, opt);
        if (by) {
          const tag = el("span", "ev2-by");
          tag.appendChild(art.portrait(by.key, { ko: by.ko, tint: TINT(by.key), size: 24, slot: "battle", still: true }));
          tag.appendChild(el("b", null, opt.race ? `${opt.race} · ${by.ko}` : opt.when ? "진짜 환자" : by.ko));
          b.appendChild(tag);
        }
        b.appendChild(el("b", "ev2-label", polite(opt.label)));   // 선택지는 문서의 말(한다체) — 화면에서는 합니다체
        b.appendChild(el("span", "ev2-out", describe(opt)));
        if (opt.price && EV.outOf(run, opt) === opt.price.out) b.appendChild(el("span", "ev2-note", opt.price.why));
        if (lock) b.appendChild(el("span", "ev2-lock", lock));
        b.disabled = !!lock;
        b.onclick = () => ts.pick(b, i, polite(opt.label));
        panel.appendChild(b);
      });
      panel.appendChild(ts.bar);
      return;
    }

    // 결과
    say(E.say || ev.scene);
    panel.appendChild(el("div", "ev2-head", "결과"));
    const res = el("div", "ev2-result");
    if (E.label) res.appendChild(el("b", "ev2-chose", `「${polite(E.label)}」`));
    const logs = el("div", "ev2-logs");
    for (const l of E.log) logs.appendChild(el("span", "ev2-log", l));
    if (!E.log.length && !E.pending.length) logs.appendChild(el("span", "ev2-log", "아무 일도 없었습니다."));
    res.appendChild(logs);
    panel.appendChild(res);
    const p = E.pending[0];
    if (p) {
      const again = el("button", "ev2-again", "고를 것이 남았습니다 — 다시 열기");
      again.onclick = () => openPicker(p);
      panel.appendChild(again);
      openPicker(p);
    }
  }

  // 선택지가 무엇을 하는지 — 결과 낱말 그대로, 확률·판정은 숫자로
  function describe(opt) {
    if (opt.fight) return `전투 (${opt.fight.name}) → 이기면 ${opt.fight.win || opt.fight.winGamble.map((g) => `${pctTxt(g.p)} ${g.out}`).join(" / ")}`;
    if (opt.gamble && opt.choose) return `골라서 받는다: ${opt.gamble.map((g) => g.out).join(" / ")}`;
    if (opt.gamble) return opt.gamble.map((g) => `${pctTxt(g.p)} ${g.out}`).join(" / ");
    if (opt.judge) {
      const j = EV.judgeOf(run, opt);
      if (j.pick) return `사도 1명을 골라 겨룹니다 — HP ${opt.judge.at} 이상이면 ${opt.judge.pass}, 아니면 ${opt.judge.fail}`;
      return `${HERO(j.who || "").ko || "?"} 공격 ${j.value} → ${j.pass ? `성공: ${opt.judge.pass}` : `실패: ${opt.judge.fail}`} (${opt.judge.at} 이상이면 성공)`;
    }
    const out = EV.outOf(run, opt);
    return !out || out === "없음" ? "아무 대가도 없이" : out;
  }

  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }

  // 고를 것 하나 — 위에 뜨는 창. 눌러서 고르고(빛남) 아래 단추로 정한다 — 한 번 눌러 바로 넘어가는 실수를 막는다
  function openPicker(p) {
    closeSheet();
    sheet = el("div", "ev2-sheet");
    const box = el("div", "ev2-sheetbox");
    sheet.appendChild(box);
    s.appendChild(sheet);
    const commit = (t) => { const w = EV.resolve(run, t); if (w) return hint(w); hint(""); act(["Happy_1", "Smile_1"]); draw(); };
    const head = (t, why) => { const d = el("div", "ev2-sheethead"); d.appendChild(el("b", null, t)); if (why) d.appendChild(el("span", null, why)); box.appendChild(d); };
    const skipBtn = (label = "받지 않습니다") => { const b = el("button", "ev2-skip", label); b.onclick = () => commit(null); return b; };
    let ts;

    if (p.k === "remove" || p.k === "dupe") {
      head(p.k === "remove" ? "덱에서 뺄 카드" : "한 장 더 넣을 카드", "카드를 눌러 고르고, 아래 단추로 정합니다");
      ts = twoStep(commit, { verb: p.k === "remove" ? "덱에서 뺍니다" : "한 장 더 넣습니다", danger: p.k === "remove" });
      const grid = el("div", "ev2-cards");
      const seen = new Set();
      for (const id of run.deck) {
        if (seen.has(id)) continue; seen.add(id);
        const c = CARDS[id]; if (!c) continue;
        const w = el("button", "ev2-card");
        const n = run.deck.filter((x) => x === id).length;
        if (n > 1) w.appendChild(el("span", "ev2-n", `×${n}`));
        w.appendChild(bigCard(c, CARDART.pic[id] || null));
        w.onclick = () => ts.pick(w, id, c.name);
        grid.appendChild(w);
      }
      box.appendChild(grid);
      box.appendChild(ts.bar);
    } else if (p.k === "card") {
      head(p.label, "하나를 덱에 넣습니다 — 눌러 고르고, 아래 단추로 정합니다");
      ts = twoStep(commit, { verb: "덱에 넣습니다" });
      const grid = el("div", "ev2-cards big");
      for (const id of p.cards) {
        const c = CARDS[id];
        const w = el("button", "ev2-card");
        const tag = el("div", "rwho");
        if (c.hero) { tag.appendChild(art.portrait(c.hero, { ko: HERO(c.hero).ko, tint: TINT(c.hero), size: 26, slot: "battle", still: true })); tag.appendChild(el("b", null, HERO(c.hero).ko)); }
        else tag.appendChild(el("b", "sgrade g-" + (c.grade || ""), `${c.grade || "중립"} · 중립`));
        w.appendChild(tag);
        w.appendChild(bigCard(c, CARDART.pic[id] || null));
        w.onclick = () => ts.pick(w, id, c.name);
        grid.appendChild(w);
      }
      box.appendChild(grid);
      ts.bar.appendChild(skipBtn());
      box.appendChild(ts.bar);
    } else if (p.k === "flash") {
      const c = CARDS[p.offer.cardId];
      head("신탁", `「${c.name}」에 붙일 신탁 — 다섯 중 셋`);
      ts = twoStep(commit, { verb: "신탁을 붙입니다" });
      const fr = el("div", "rrow flashrow");
      fr.appendChild(flashTarget(c, p.offer.cardId));
      for (const n of p.offer.picks) {
        const f = (c.flash || [])[n - 1]; if (!f) continue;
        const b = el("button", "fcard f" + n);
        const hd = el("div", "fhead2");
        hd.appendChild(el("span", "fnum", "①②③④⑤"[n - 1]));
        hd.appendChild(el("b", null, f.kind));
        hd.appendChild(el("span", "fko", f.ko));
        b.appendChild(hd);
        b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
        b.appendChild(el("p", "fbefore", `지금: ${shortText(c.text)}`));
        b.onclick = () => ts.pick(b, n, `${"①②③④⑤"[n - 1]} ${f.kind}`);
        fr.appendChild(b);
      }
      box.appendChild(fr);
      if (run.event.shinChance && !run.noShin) box.appendChild(el("p", "ev2-note", `고르면 ${pctTxt(run.event.shinChance)} 확률로 기적(피해 ×1.3)이 얹힙니다`));
      ts.bar.appendChild(skipBtn());
      box.appendChild(ts.bar);
    } else if (p.k === "pickHero" || p.k === "judgePick") {
      const t = p.k === "judgePick" ? `팔씨름에 나설 사도 — HP ${p.judge.at} 이상이면 이긴다` : p.then.k === "hp" ? "HP 가 바뀔 사도" : `최대 HP +${p.then.v} 를 받을 사도`;
      head("사도 1명", t);
      ts = twoStep(commit, { verb: p.k === "judgePick" ? "이 사도가 나섭니다" : "이 사도로 합니다" });
      const row = el("div", "ev2-heroes");
      for (const k of run.party) {
        if ((run.hp[k] || 0) <= 0) continue;
        const b = el("button", "ev2-hero");
        b.appendChild(art.portrait(k, { ko: HERO(k).ko, tint: TINT(k), size: 0, slot: "event", still: true }));
        b.appendChild(el("b", null, HERO(k).ko));
        b.appendChild(el("span", null, `HP ${run.hp[k]} / ${run.maxHp[k]}`));
        b.onclick = () => ts.pick(b, k, HERO(k).ko);
        row.appendChild(b);
      }
      box.appendChild(row);
      box.appendChild(ts.bar);
    } else if (p.k === "gambleChoice") {
      head("골라서 받습니다", "아는 얼굴 앞이라 바로 읽어 줍니다");
      ts = twoStep(commit, { verb: "이것으로 받습니다" });
      const row = el("div", "ev2-gamble");
      for (const o of p.options) {
        const b = el("button", "ev2-opt");
        b.appendChild(el("b", "ev2-label", o));
        b.onclick = () => ts.pick(b, o, o);
        row.appendChild(b);
      }
      box.appendChild(row);
      box.appendChild(ts.bar);
    }
  }
  return s;
}

// ── 판이 끝났다 ────────────────────────────────────────────────────────
// 졌을 때 「여기까지」 한 줄만 띄우면 왜 졌는지 아무것도 안 남는다.
// 어디까지 갔고, 무엇을 모았고, 누가 쓰러졌는지를 적어 준다.
export function endScreen(kind, run, onRestart) {
  const s = screen();
  s.classList.add("endscreen");
  const clear = kind === "clear";

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", clear ? "끝까지 갔습니다" : "여기까지"));
  const floor = R.currentFloor(run);
  bar.appendChild(el("span", "rwhy", clear
    ? `${run.party.map((k) => HERO(k).ko).join(" · ")}와 함께.`
    : `${floor.n}층 ${floor.name} · ${R.isBoss(run) ? "보스" : `${run.node + 1}번째 싸움`} 에서 멈췄습니다.`));
  const again = el("button", "go", "다시 떠납니다");
  again.onclick = onRestart;
  bar.appendChild(again);
  s.appendChild(bar);

  const body = el("div", "rbody");
  s.appendChild(body);

  // 데려간 사도 — 누가 서 있고 누가 주말농장에 갔나
  body.appendChild(sec2("데려간 사도", clear ? "" : "체력이 0이면 주말농장으로 갑니다"));
  const who = el("div", "erow");
  for (const k of run.party) {
    const h = HERO_DATA[k] || HERO(k);
    const down = (run.hp[k] || 0) <= 0;
    const n = el("div", "ehero" + (down ? " down" : ""));
    n.appendChild(art.portrait(k, { ko: h.ko, tint: NTINT[h.nature], size: 44, slot: "battle", still: true }));
    const t = el("div");
    t.appendChild(el("b", null, h.ko));
    t.appendChild(el("span", "why", down ? "주말농장" : `${run.hp[k]} / ${run.maxHp[k]}`));
    n.appendChild(t);
    who.appendChild(n);
  }
  body.appendChild(who);

  // 이 판에 모은 것 — 덱이 어떻게 자랐나
  const uniq = run.deck.filter((id) => CARDS[id] && CARDS[id].unique);
  const flashN = Object.keys(run.flash || {}).length;
  body.appendChild(sec2("이 판에 모은 것", ""));
  const got = el("div", "erow");
  for (const [ko, v, why] of [
    ["덱", `${run.deck.length}장`, "시작 열두 장에서"],
    ["고유 카드", `${uniq.length}장`, "싸움마다 하나씩"],
    ["신탁", `${flashN}개`, "카드마다 하나"],
    ["골드", `${run.gold || 0}`, ""],
  ]) {
    const n = el("div", "estat");
    n.appendChild(el("small", null, ko));
    n.appendChild(el("strong", null, v));
    if (why) n.appendChild(el("span", "why", why));
    got.appendChild(n);
  }
  body.appendChild(got);
  if (uniq.length) {
    const row = el("div", "dkrow");
    for (const id of uniq) {
      const c = CARDS[id];
      const chip = el("span", "dkcard" + (run.flash && run.flash[id] ? " lit" : ""));
      chip.appendChild(el("i", null, c.xcost ? "X" : String(c.cost)));
      chip.appendChild(el("span", null, c.name));
      if (run.flash && run.flash[id]) chip.appendChild(el("em", null, "①②③④⑤"[run.flash[id] - 1]));
      chip.title = c.text;
      row.appendChild(chip);
    }
    body.appendChild(row);
  }


  function sec2(label, why) {
    const d = el("div", "rsec");
    d.appendChild(el("b", null, label));
    if (why) d.appendChild(el("span", "why", why));
    return d;
  }
  return s;
}
