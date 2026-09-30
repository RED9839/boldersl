// 화면. 규칙은 combat.js 가 쥐고 있고, 여기는 그리고 누른 것을 넘긴다.
import { HEROES, ROSTER } from "./data/heroes.js";
import { CARDS } from "./cardbook.js";
import { TRAITS } from "./data/traits.js";
import { ENEMIES, FLOORS } from "./data/enemies.js";
import { HERO_DATA, kitOf, EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { shortText, splitKeywords, cardParts } from "./card-text.js";

// 사도 정보는 기획서가 원본이다. 빛깔만 옛 heroes.js 가 들고 있다.
const HERO = (k) => HERO_DATA[k] || HEROES[k] || { ko: k, row: "mid", nature: null };
const TINT = (k) => (HEROES[k] || {}).tint || "#8a8a9a";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import { getZoom } from "./stage.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
// 위치 — 기획서 낱말이다. 기본 스탯 표 머리가 "위치 · 역할" 이다.
const ROW_KO = { front: "전열", mid: "중열", back: "후열" };

let kwNote = null;                 // 낱말 풀이 쪽지 — 한 번에 하나만 뜬다
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
//   정보   왼쪽 갈피(능력치·카드·번뜩임·궁극기) · 오른쪽 내용
// 카드는 실제 카드 꼴로 세워 그린다 — 코스트·이름·타입·그림·효과·태그.
// 그림은 꺼내 둔 스킬 아이콘을 쓴다(궁극기=졸업, 시그니처=입학, 나머지=어사이드).

const NATURES = ["순수", "광기", "냉정", "우울", "활발", "공명"];
const ROWS_KO = { front: "전열", mid: "중열", back: "후열" };
const ROLES = ["탱커", "딜러", "서포터"];
const NTINT = { 순수: "#7fd3a8", 광기: "#d9737f", 냉정: "#7fd6f5", 우울: "#9a8cc0", 활발: "#f5dc5a", 공명: "#c9c9d6" };
// 카드 타입 — 원작 도감처럼 한 글자 표시와 빛깔을 준다
const TMARK = { 공격: "✕", 스킬: "◈", 쉴드: "⬢", 방어: "⬢", 회복: "✚", 강화: "▲", 기술: "◆" };
const TKIND = { 공격: "atk", 스킬: "skill", 쉴드: "def", 방어: "def", 회복: "heal", 강화: "buff", 기술: "skill" };

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
// piles: [{ key, label, ids, why }] · pick: 처음 열 칸 · cardFor: id → 이 판에서의 카드(번뜩임 반영)
function showPiles(piles, pick, cardFor) {
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
      card.onclick = null;                  // 여기서는 보기만 한다
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

export function partyScreen(onStart, onBack) {
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
  let view = null;                       // null 편성 · "도감" 도감 · 사도 키면 사도 정보
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

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { view = null; render(); };   // 도감에서 나가면 편성으로
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", "사도 도감"));

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
    backToForm.onclick = () => { view = null; render(); };
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

  // ── 팀 편성 ──────────────────────────────────────────────────────────
  // 카제나 얼개다 — 큰 세로 카드 셋을 가운데 세우고, 오른쪽에 이번 싸움을 적는다.
  // 트릭컬 쪽을 얹는다: 카드마다 정해진 위치(전열·중열·후열)를 보여 준다. 고르는 것이 아니다.
  // 빈 자리를 누르면 사도를 고르는 서랍이 열린다.
  let drawerFor = -1;                    // 서랍이 열린 자리. -1 이면 닫혀 있다.

  function formScreen() {
    s.innerHTML = "";
    s.className = "teamscreen";

    const bar = el("div", "dbar2");
    if (onBack) { const b = el("button", "iconbtn back", "◁"); b.onclick = onBack; bar.appendChild(b); }
    bar.appendChild(el("h1", "dtitle", "팀 편성"));
    const count = el("span", "fcount");
    bar.appendChild(count);
    const dexBtn = el("button", "dexbtn", "사도 도감 ↗");
    dexBtn.onclick = () => { filter.q = ""; view = "도감"; render(); };
    bar.appendChild(dexBtn);
    const go = el("button", "go", "떠난다");
    go.onclick = () => { for (const k of picked) rows[k] = rows[k] || HERO_DATA[k].row; onStart(picked, rows); };
    bar.appendChild(go);
    s.appendChild(bar);

    const body = el("div", "tbody");
    const stage = el("div", "tstage");
    const side = el("aside", "tside");
    body.appendChild(stage);
    body.appendChild(side);
    s.appendChild(body);

    const slots = el("div", "tslots");
    stage.appendChild(slots);
    const synBox = el("div", "tsyn");
    stage.appendChild(synBox);

    // ── 오른쪽 — 이번 싸움 ─────────────────────────────────────────────
    const floor = FLOORS[0];
    side.appendChild(el("div", "tchap", `${floor.n}층 · ${floor.name}`));
    side.appendChild(el("h2", "tmission", "첫 번째 싸움"));
    side.appendChild(el("p", "twhere", floor.sub));

    const foeHead = el("div", "tlabel", "나오는 적");
    side.appendChild(foeHead);
    const foeBox = el("div", "tfoes");
    for (const id of floor.fights[0]) {
      const e = ENEMIES[id];
      const n = el("div", "tfoe");
      n.appendChild(art.portrait(id, { ko: e.ko, tint: e.tint, size: 44, slot: "battle", still: true }));
      const t = el("div");
      t.appendChild(el("b", null, e.ko));
      t.appendChild(el("span", "why", `체력 ${e.hp} · ${ROWS_KO[e.row] || e.row}`));
      n.appendChild(t);
      foeBox.appendChild(n);
    }
    side.appendChild(foeBox);

    side.appendChild(el("div", "tlabel", "이 층을 지나려면"));
    const goals = el("div", "tgoals");
    for (const [mark, text] of [
      ["★", "싸움 셋을 이기고 보스를 넘는다"],
      ["★", `보스는 ${floor.boss.map((id) => ENEMIES[id].ko).join(" · ")}`],
      ["★", "쓰러진 사도는 주말농장으로 간다 — 그 판에서 다시 못 쓴다"],
    ]) {
      const g = el("div", "tgoal");
      g.appendChild(el("i", null, mark));
      g.appendChild(el("span", null, text));
      goals.appendChild(g);
    }
    side.appendChild(goals);

    const deckHead = el("div", "tlabel");
    side.appendChild(deckHead);
    const deckBox = el("div", "fdeck");
    side.appendChild(deckBox);

    // ── 서랍 — 사도 고르기 ────────────────────────────────────────────
    const drawer = el("div", "tdrawer");
    s.appendChild(drawer);

    // ── 큰 카드 한 장 ─────────────────────────────────────────────────
    function slotCard(i) {
      const key = picked[i];
      if (!key) {
        const n = el("button", "tcard empty");
        n.appendChild(el("span", "tplus", "+"));
        n.appendChild(el("span", "twho", `${i + 1}번째 사도`));
        n.onclick = () => { drawerFor = i; fill(); };
        return n;
      }
      const h = HERO_DATA[key];
      const n = el("div", "tcard");

      const face = el("div", "tface");
      face.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      face.appendChild(el("div", "dfade"));
      const badges = el("div", "dbadges");
      badges.appendChild(uiIcon("역할", h.role, "brole", h.role.slice(0, 1)));
      const bn = uiIcon("성격", h.nature, "bnat n" + h.nature, h.nature.slice(0, 1));
      bn.style.setProperty("--tint", NTINT[h.nature]);
      badges.appendChild(bn);
      badges.appendChild(uiIcon("종족", h.race, "brace", h.race.slice(0, 1)));
      face.appendChild(badges);

      const look = el("button", "tlook", "⌕");
      look.title = `${h.ko} 사도 정보`;
      look.onclick = () => { cameFrom = null; view = key; tab = "능력치"; render(); };
      face.appendChild(look);

      const star = el("span", "tstar", "★".repeat(h.star));
      face.appendChild(star);

      const plate = el("div", "tplate");
      plate.appendChild(el("b", null, h.ko));
      plate.appendChild(el("span", "tsub", `${h.race} · ${h.dmgType || ""}`));
      face.appendChild(plate);
      n.appendChild(face);

      // 위치는 기획서가 정한 대로 고정이다 — 고르는 것이 아니라 알려 주는 것이다.
      // 기본 스탯이 위치에서 나오므로(전열 탱커 HP 90 · 후열 딜러 HP 55) 줄만 옮길 수는 없다.
      const pos = el("div", "tpos");
      for (const r of C.ROWS) {
        const b = el("span", "pbtn" + (r === h.row ? " on" : ""), ROWS_KO[r]);
        pos.appendChild(b);
      }
      n.appendChild(pos);
      n.appendChild(el("div", "thome", `${ROWS_KO[h.row]} ${h.role} · 적은 전열부터 노린다`));

      const x = el("button", "tdrop", "빼기");
      x.onclick = () => { picked.splice(i, 1); delete rows[key]; fill(); };
      n.appendChild(x);
      return n;
    }

    // ── 서랍 한 장 ────────────────────────────────────────────────────
    function pickNode(key, h) {
      const on = picked.includes(key);
      const n = el("button", "pcard" + (on ? " on" : ""));
      n.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      n.appendChild(el("div", "dfade"));
      const badges = el("div", "dbadges");
      badges.appendChild(uiIcon("역할", h.role, "brole", h.role.slice(0, 1)));
      const bn = uiIcon("성격", h.nature, "bnat n" + h.nature, h.nature.slice(0, 1));
      bn.style.setProperty("--tint", NTINT[h.nature]);
      badges.appendChild(bn);
      n.appendChild(badges);
      const plate = el("div", "dplate");
      plate.appendChild(el("span", "dname", h.ko));
      plate.appendChild(el("span", "dsub", `${ROWS_KO[h.row]} · ${h.race}`));
      n.appendChild(plate);
      if (on) n.appendChild(el("span", "dmark", "편성"));
      n.onclick = () => {
        const i = picked.indexOf(key);
        if (i >= 0) { picked.splice(i, 1); delete rows[key]; }
        else if (picked.length < 3) { picked.push(key); rows[key] = h.row; drawerFor = -1; filter.q = ""; }
        else return hint("셋까지만 데려갈 수 있습니다");
        hint("");
        fill();
      };
      return n;
    }

    // ── 다시 채우기 ───────────────────────────────────────────────────
    function fill() {
      slots.innerHTML = "";
      for (let i = 0; i < 3; i++) slots.appendChild(slotCard(i));
      count.textContent = `${picked.length}/3`;
      go.disabled = picked.length !== 3;

      // 함께 가면
      synBox.innerHTML = "";
      const bonds = C.partyBonds(picked).filter((b) => b.n);
      if (!picked.length) synBox.appendChild(el("div", "why", "사도를 고르면 사이와 성격이 여기 뜹니다."));
      for (const bd of bonds) {
        const line = el("span", "sline");
        line.appendChild(el("b", null, `${HERO_DATA[bd.a].ko} · ${HERO_DATA[bd.b].ko}`));
        line.appendChild(el("span", "t" + bd.tier.id, bd.tier.id));
        line.appendChild(el("span", "why", `${bd.n}편`));
        synBox.appendChild(line);
      }
      if (picked.length) {
        const nat = el("span", "sline");
        nat.appendChild(el("b", null, "성격"));
        for (const k of picked) {
          const tag = el("span", "mtag");
          tag.appendChild(uiIcon("성격", HERO_DATA[k].nature, "mico", ""));
          tag.appendChild(el("span", null, HERO_DATA[k].nature));
          nat.appendChild(tag);
        }
        nat.appendChild(el("span", "why", "광기→순수→냉정→광기 · 활발↔우울"));
        synBox.appendChild(nat);

        const plus = Math.min(1, bonds.reduce((a, b) => a + b.tier.sp, 0));
        const ap = el("span", "sline");
        ap.appendChild(el("b", null, "첫 턴 AP"));
        ap.appendChild(el("span", "apnum2", String(3 + plus)));
        ap.appendChild(el("span", "why", plus ? `매 턴 3 · 사이가 좋아 +${plus}` : "매 턴 3"));
        synBox.appendChild(ap);
      }

      // 덱
      deckBox.innerHTML = "";
      let n = 0;
      for (const k of picked) {
        const row = el("div", "dkrow");
        row.appendChild(el("span", "dkwho", HERO_DATA[k].ko));
        for (const c of kitOf(k).start) {
          const chip = el("span", "dkcard");
          chip.appendChild(el("i", null, c.xcost ? "X" : String(c.cost)));
          chip.appendChild(el("span", null, c.name));
          chip.title = c.text;
          row.appendChild(chip);
          n++;
        }
        deckBox.appendChild(row);
      }
      deckHead.textContent = n ? `덱 ${n}장 — 사도마다 시작 카드 넉 장` : "덱 — 사도를 고르면 만들어집니다";

      // 서랍
      drawer.innerHTML = "";
      drawer.classList.toggle("open", drawerFor >= 0);
      if (drawerFor < 0) return;

      const dhead = el("div", "dhead3");
      dhead.appendChild(el("b", null, `${drawerFor + 1}번째 사도 고르기`));
      const search = el("input", "dsearch");
      search.placeholder = "이름으로 찾기";
      search.value = filter.q;
      search.oninput = () => { filter.q = search.value.trim(); fill(); };
      dhead.appendChild(search);
      const close = el("button", "dclose", "닫기");
      close.onclick = () => { drawerFor = -1; filter.q = ""; fill(); };
      dhead.appendChild(close);
      drawer.appendChild(dhead);

      const chips = el("div", "chiprow");
      const chipGroup = (vals, key) => {
        const all = el("button", "chip" + (filter[key] ? "" : " on"), "전체");
        all.onclick = () => { filter[key] = null; fill(); };
        chips.appendChild(all);
        for (const v of vals) {
          const b = el("button", "chip" + (filter[key] === v ? " on" : "") + (key === "nature" ? " n" + v : ""));
          if (key === "nature") b.appendChild(uiIcon("성격", v, "cico", ""));
          b.appendChild(el("span", null, v));
          b.onclick = () => { filter[key] = filter[key] === v ? null : v; fill(); };
          chips.appendChild(b);
        }
        chips.appendChild(el("span", "chipgap"));
      };
      chipGroup(NATURES, "nature");
      chipGroup(ROLES, "role");
      drawer.appendChild(chips);

      const grid = el("div", "pgrid");
      const list = roster.filter(([k, h]) => {
        if (filter.nature && h.nature !== filter.nature) return false;
        if (filter.role && h.role !== filter.role) return false;
        if (filter.q && !h.ko.includes(filter.q)) return false;
        return true;
      });
      for (const [k, h] of list) grid.appendChild(pickNode(k, h));
      if (!list.length) grid.appendChild(el("div", "more", "맞는 사도가 없습니다."));
      drawer.appendChild(grid);
    }
    fill();
  }

  function dexCard(key, h) {
    const on = picked.includes(key);
    const b = el("button", "dex" + (on ? " on" : ""));
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
    plate.appendChild(el("span", "dsub", `${ROWS_KO[h.row]} · ${h.race}`));
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

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { view = cameFrom; render(); };
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", "사도 정보"));
    bar.appendChild(el("span", "dwho", h.ko));
    bar.appendChild(el("span", "dcount", `${picked.length}/3`));
    const on = picked.includes(key);
    const take = el("button", "takebtn" + (on ? " on" : ""), on ? "편성에서 빼기" : "편성에 넣기");
    take.onclick = () => {
      const i = picked.indexOf(key);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length < 3) picked.push(key);
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
    for (const t of ["능력치", "카드", "번뜩임", "궁극기"]) {
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
    else if (tab === "번뜩임") main.appendChild(flashPane(kit, CA, picFor));
    else main.appendChild(ultPane(key, h, CA));

    body.appendChild(main);
    s.appendChild(body);
  }

  function statsPane(key, h) {
    const w = el("div", "pane");
    const top = el("div", "sthero");
    const shot = el("div", "stshot");
    shot.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
    top.appendChild(shot);
    const info = el("div", "stinfo");
    const t = el("div", "sttop");
    t.appendChild(el("h2", null, h.ko));
    t.appendChild(el("span", "star", "★".repeat(h.star)));
    if (h.eldain) t.appendChild(el("span", "eldain", "엘다인"));
    info.appendChild(t);
    const meta = el("div", "stmeta");
    for (const [kind, name] of [["성격", h.nature], ["종족", h.race], ["위치", ROWS_KO[h.row]], ["역할", h.role]]) {
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

    if (h.passive) w.appendChild(line("패시브", h.passive, "", key));
    if (h.keyword) w.appendChild(line(h.keyword.ko, h.keyword.text, "key", key));
    // 원작에서 무엇을 가져왔는지 — 나무위키를 읽고 다시 쓴 근거(docs/07-스킬구성.md)
    if (h.source) w.appendChild(line("원작", h.source, "src", key));

    // 고른 사람들과의 사이 — 없으면 아무 말도 안 한다
    const others = picked.filter((k) => k !== key);
    const bonds = C.partyBonds([key, ...others]).filter((b2) => b2.n && (b2.a === key || b2.b === key));
    if (bonds.length) {
      w.appendChild(el("h3", "psec", "고른 사도와의 사이"));
      for (const b2 of bonds) {
        const other = b2.a === key ? b2.b : b2.a;
        const l = el("div", "bond");
        l.appendChild(el("b", null, HERO_DATA[other].ko));
        l.appendChild(el("span", "why", `함께 나온 이야기 ${b2.n}편 · ${b2.tier.id}`));
        w.appendChild(l);
      }
    }
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

    // 오른쪽 — 궁극기. 인게임 고학년 스킬이고, 그 아이콘을 그대로 쓴다(기획서).
    if (h.ult) {
      const side = el("aside", "egoside");
      const hex = el("div", "hex");
      hex.appendChild(el("span", "hexcost", String(h.ult.cost) + "%"));
      if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
      side.appendChild(hex);
      side.appendChild(el("div", "egoname", h.ult.ko));
      side.appendChild(el("div", "egolabel", "궁극기"));
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
    w.appendChild(el("p", "note", "고유 카드는 번뜩임 다섯 가운데 하나를 골라 바뀝니다 — ①강화 ②경량 ③연계 ④변형 ⑤각성."));
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
    if (!h.ult) { w.appendChild(el("p", "note", "이 사도는 궁극기가 없습니다.")); return w; }
    const big = el("div", "ultbig");
    const hex = el("div", "hex big");
    hex.appendChild(el("span", "hexcost", h.ult.cost + "%"));
    if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
    big.appendChild(hex);
    const info = el("div");
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
export function fightScreen(run, onDone) {
  const s = screen();
  s.classList.add("battle");
  const enemyIds = R.currentEnemies(run);
  const floor = R.currentFloor(run);
  // 싸움터 배경 — 층마다 한 장, 보스·이벤트 전투는 따로. 그림이 없으면(assets 는 저장소에 없다) 어두운 바탕이 남는다.
  const bg = BATTLE_BG[floor.n] || BATTLE_BG[1];
  // 변수에 담긴 url() 은 그 변수를 쓰는 css 파일 기준으로 풀린다 — 그래서 문서 기준 절대 주소로 넘긴다
  const bgFile = `assets/bg/${run.eventFight ? bg.event : R.isBoss(run) ? bg.boss : bg.fight}.jpg`;
  s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bgFile, location.href).href : bgFile}")`);
  const st = C.newCombat({
    partyKeys: run.party, rows: run.rows, deck: run.deck.slice(),
    enemyIds, hp: run.hp, maxHp: run.maxHp, traits: run.traits, gear: R.gearStats(run), flash: run.flash,
    // 이벤트가 걸어 둔 「다음 전투」 효과는 여기서 한 번 가져간다 · 신뜩임이 붙은 카드
    next: EV.takeNextFight(run), shin: run.shin,
    seed: (run.seed + run.floor * 101 + run.node * 7 + (run.eventFight ? 555 : 0)) >>> 0,
  });

  // ① 머리 — 어디서 싸우는가
  const head = el("div", "bhead");
  head.appendChild(el("span", "bwhere", `${floor.n}층 · ${floor.name}`));
  head.appendChild(el("span", "bsub", `${floor.sub} · ${run.eventFight ? `이벤트 — ${run.eventFight.name}` : R.isBoss(run) ? "층의 끝" : `${run.node + 1}번째 싸움`}`));
  const flashBox = el("span", "bflash");
  for (const id of run.traits) { const t = TRAITS[id]; const c = el("span", "flash", t.ko); c.title = t.text; flashBox.appendChild(c); }
  head.appendChild(flashBox);
  s.appendChild(head);

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

  // ③ 궁극기 게이지 — 파티 공용
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
  s.appendChild(logWrap);

  let selCard = -1;
  // 적 칸 — 미리보기를 그 위에 얹으려고 idx 로 들고 있는다
  const foeEls = new Map();
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
    const n = el("div", "foe" + (u.dead ? " dead" : "") + (pick ? " tgt" : "") + (u.boss ? " boss" : ""));
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
    if (clickable && !u.dead) n.onclick = () => onPick(u);
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
    n.appendChild(hpBar(u));
    n.appendChild(chips(u));
    if (st.bubble && st.bubble.hero === u.key) n.appendChild(el("div", "bubble", st.bubble.text));
    if (clickable && !u.dead) n.onclick = () => onPick(u);
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

    // 궁극기 — 게이지가 차면 누를 수 있다
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
      b.title = why || ult.text;
      b.onclick = () => {
        const r = C.useUlt(st, u.key, 0);
        if (!r.ok) return hint(r.why);
        hint("");
        draw();
      };
      box.appendChild(b);
    }

    n.appendChild(box);
    if (clickable && !u.dead) n.onclick = () => onPick(u);
    return n;
  }

  function hpBar(u) {
    const wrap = el("div", "hpwrap");
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%";
    bar.appendChild(fill);
    // 미리보기 — 깎일 만큼을 막대 끝에 그림자로
    wrap.ghost = el("s", "ghost");
    bar.appendChild(wrap.ghost);
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

  function targetsNeeded(cardId) {
    const c = C.cardOf(st, cardId);
    if (!c) return null;
    return c.target === "적" ? "enemy" : c.target === "아군" ? "party" : null;
  }

  // ── 그리기 ───────────────────────────────────────────────────────────
  function draw() {
    const need = selCard >= 0 ? targetsNeeded(st.hand[selCard]) : null;

    foeZone.innerHTML = "";
    foeEls.clear();
    for (const u of st.enemies) foeZone.appendChild(foeNode(u, need === "enemy", (t) => play(t.idx)));

    // 싸움터에 선 아군 — 전열이 앞, 후열이 뒤
    allyField.innerHTML = "";
    standEls.clear();
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
      { key: "all", label: "덱 전체", ids: run.deck, why: "이 판의 덱. 번뜩임이 붙은 카드는 바뀐 모습으로 보입니다." },
    ];
    const cardFor = (id) => C.cardOf(st, id);
    drawPile.onclick = () => showPiles(piles(), "draw", cardFor);
    discPile.innerHTML = "";
    discPile.appendChild(el("span", "pnum", String(st.discard.length)));
    discPile.appendChild(el("span", "plab", "버린 것"));
    discPile.title = "눌러서 버린 카드 보기";
    discPile.onclick = () => showPiles(piles(), "disc", cardFor);
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
      ? `매 턴 ${st.apPerTurn} · 사이가 좋아 첫 턴 +${st.startSp}`
      : `매 턴 ${st.apPerTurn} · 남으면 사라진다`;
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
        + (full ? " full" : "") + (why ? " no" : "") + (selCard === i ? " sel" : "") + (c.ego ? " ego" : ""));

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
      b.onpointerdown = (e) => { if (!why) startDrag(e, i, id, b); };
      b.onclick = () => {
        if (dragDone) return;                 // 방금 끌어서 낸 카드 — 뒤따라오는 click 은 버린다
        if (why) return hint(why);
        hint("");
        const want = targetsNeeded(id);
        if (want) {
          // 고르기만 하고 아무 말이 없으면 "안 써진다"고 느낀다 — 실제로 그런 말을 들었다.
          selCard = selCard === i ? -1 : i;
          hint(selCard < 0 ? "" : want === "enemy" ? "칠 적을 고릅니다" : "도울 아군을 고릅니다");
          draw();
        } else { selCard = i; play(0); }
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
  function startDrag(e, i, id, card) {
    if (st.over || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { i, id, card, x0: e.clientX, y0: e.clientY, on: false, over: null, need: targetsNeeded(id) };
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
    hint(drag.need === "enemy" ? "칠 적 위에 놓습니다" : drag.need === "party" ? "도울 아군 위에 놓습니다" : "위로 끌어 올려 놓으면 씁니다");
    if (!drag.need) paintPreview(drag.i, null);
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10) return;
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
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      t = hit && hit.closest(drag.need === "enemy" ? ".foe.dtgt" : ".stand.dtgt");
    } else {
      const hr = hand.getBoundingClientRect();
      t = e.clientY < hr.top - 10 ? drag.fx : null;       // 손패 위로 올라왔다
    }
    if (t !== drag.over) {
      if (drag.over && drag.over !== drag.fx) drag.over.classList.remove("dover");
      drag.over = t;
      if (t && t !== drag.fx) t.classList.add("dover");
      drag.fx.classList.toggle("armed", !!t);
      if (drag.need === "enemy") paintPreview(drag.i, t ? Number(t.dataset.idx) : null);
    }
  }
  function stopDrag(cancel) {
    const d = drag; drag = null;
    if (!d) return;
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
    hint("");
    selCard = d.i;
    play(d.need ? Number(over.dataset.idx) : 0);
  }

  function play(targetIdx) {
    if (selCard < 0) return;
    const r = C.playCard(st, selCard, targetIdx);
    selCard = -1;
    if (!r.ok) hint(r.why);
    else if (r.combo) hint(r.combo.quip);
    draw();
  }

  endBtn.onclick = () => { selCard = -1; C.endTurn(st); draw(); };

  function finish() {
    endBtn.disabled = true;
    hand.querySelectorAll("button").forEach((b) => (b.disabled = true));
    R.afterFight(run, st);
    setTimeout(() => onDone(st.over), 700);
  }

  draw();
  return s;
}

// 싸움터 배경 — assets/bg (tools/extract-bg.py 가 게임에서 뽑은 16:9 그림)
// 에르피엔은 숲속 버섯 마을, 모나티엄은 엘프 도시, 벨리티엔은 마녀 왕국의 보랏빛 숲
const BATTLE_BG = {
  1: { fight: "stage3_2", boss: "stage3_3", event: "stage2_1" },
  2: { fight: "stage8_1", boss: "stage9_1", event: "stage4_1" },
  3: { fight: "stage23_1", boss: "stage25_1", event: "stage16_1" },
};

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

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", "이겼습니다"));
  bar.appendChild(el("span", "rwhy", "카드 한 장을 덱에 넣거나 번뜩임 하나를 얻습니다. 둘 다 안 해도 됩니다."));
  const rgot = run.reward || R.rollReward(run);
  if (rgot.gold) bar.appendChild(el("span", "sgold", `✦ +${rgot.gold} 골드`));
  const skip = el("button", "dexbtn", "그냥 간다");
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
      eqBox.appendChild(sec("장비", got.equipTaken ? "가방에 넣었습니다" : "보스가 남긴 장비 — 셋 중 하나"));
      if (!got.equipTaken) {
        const row = el("div", "rrow");
        for (const id of got.equip) {
          const b = el("button", "sprice", "이걸 가진다");
          b.onclick = () => { R.takeEquip(run, id); drawEq(); };
          row.appendChild(equipCard(id, b));
        }
        eqBox.appendChild(row);
      } else eqBox.appendChild(gearPanel(run, "empty", null, hint));
    };
    drawEq();
  }
  // ① 고유 카드
  const cards = got.cards;
  body.appendChild(sec("고유 카드", cards.length ? "덱에 한 장 넣습니다" : "더 얻을 고유 카드가 없습니다"));
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
    card.onclick = () => onPick(id, null);
    card.title = "눌러서 덱에 넣기";
    pick.appendChild(card);
    row.appendChild(pick);
  }
  if (!cards.length) row.appendChild(el("p", "rnone", "이 파티가 가진 고유 카드를 모두 얻었습니다."));
  body.appendChild(row);

  // ② 번뜩임 — 가진 고유 카드에만 붙는다
  const offer = got.flash;
  if (!offer) {
    body.appendChild(sec("번뜩임", ""));
    // 왜 없는지 갈라서 말한다 — 안 뜬 것과 붙일 데가 없는 것은 다르다
    body.appendChild(el("p", "rnone", !R.flashTargets(run).length
      ? "번뜩임은 가진 고유 카드에 붙습니다. 고유 카드를 먼저 얻으세요."
      : "이번에는 번뜩임이 일어나지 않았습니다."));
  } else {
    const c = CARDS[offer.cardId];
    body.appendChild(sec("번뜩임", `「${c.name}」에 붙일 번뜩임 — 다섯 중 셋`));
    const fr = el("div", "rrow flashrow");
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
      b.onclick = () => onPick(null, { cardId: offer.cardId, n });
      fr.appendChild(b);
    }
    body.appendChild(fr);
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

function equipCard(id, extra) {
  const e = EQUIP[id];
  const n = el("div", "ecard g-" + e.grade);
  const head = el("div", "ehead");
  head.appendChild(el("span", "eslot", e.slot));
  head.appendChild(el("b", null, e.ko));
  head.appendChild(el("span", "egrade", e.global ? "전설(글로벌)" : e.grade));
  n.appendChild(head);
  n.appendChild(el("p", "eqstat", statText(e.stats) || "스탯 없음"));
  if (e.affinityKo) n.appendChild(el("p", "eaff", `애착: ${e.affinityKo}${e.affinityLv3 ? ` — 끼면 ${statText(e.affinityLv3)} 더` : ""}`));
  if (e.effect) {
    const p = el("p", "eeff");
    p.appendChild(el("span", "eoff", "효과 · 아직 안 돈다"));
    p.appendChild(document.createTextNode(" " + shortText(e.effect.replace(/\s*\[[^\]]+\]/g, ""))));
    n.appendChild(p);
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
        c.appendChild(el("span", "gsl", sl));
        if (id) {
          const e = EQUIP[id];
          c.appendChild(el("b", null, e.ko));
          const st = statText(R.statsOf(id, k));
          c.appendChild(el("span", "gst", st + (e.affinity === k ? " · 애착" : "")));
          if (mode === "camp") {
            const x = el("button", "gout", "빼기");
            x.onclick = () => { const why = R.unequip(run, k, sl); if (why && say) say(why); draw(); onChange && onChange(); };
            c.appendChild(x);
          }
        } else c.appendChild(el("span", "gempty", "비어 있음"));
        slots.appendChild(c);
      }
      r.appendChild(slots);
      rows.appendChild(r);
    }
    box.appendChild(rows);
    // 가방
    if (run.bag.length) {
      box.appendChild(el("p", "gbagh", mode === "camp" ? "가방 — 누구에게 낄지 고릅니다(차 있으면 바꿔 낍니다)" : "가방 — 빈 칸이 있는 사도에게 바로 낄 수 있습니다. 바꿔 끼기는 캠프에서"));
      const bag = el("div", "rrow gbag");
      for (const id of run.bag.slice()) {
        const e = EQUIP[id];
        const btns = el("div", "gto");
        for (const k of run.party) {
          const h = HERO_DATA[k] || HERO(k);
          const full = !!R.gearOf(run, k)[e.slot];
          const b = el("button", "gtobtn" + (e.affinity === k ? " aff" : ""), `${h.ko}${full ? " (바꾸기)" : ""}${e.affinity === k ? " ♥" : ""}`);
          b.disabled = mode !== "camp" && full;
          b.onclick = () => { const why = R.equip(run, k, id, { swap: mode === "camp" }); if (why && say) say(why); draw(); onChange && onChange(); };
          btns.appendChild(b);
        }
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
//   수련  가진 고유 카드 하나에 번뜩임(다섯 중 셋)
// 캠프 + 상점이면 골디가 옆에 좌판을 폈다. 상점에 들르는 것은 캠프 선택을 쓰지 않는다.
export function campScreen(run, withShop, onDone, onShop) {
  const s = screen();
  s.classList.add("rewardscreen", "campscreen");
  const st = run.stops[run.camp && run.camp.key] || { used: null };
  const floor = FLOORS[run.floor] || { name: "" };

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", withShop ? "캠프 · 골디의 좌판" : "캠프"));
  bar.appendChild(el("span", "rwhy", `${floor.name} — ${withShop ? "보스 앞에서 한숨 돌린다" : "길 가운데에서 한숨 돌린다"}. 쉬기와 수련 중 하나만 고릅니다.`));
  const go = el("button", "dexbtn", withShop ? "보스에게 간다" : "길을 떠난다");
  go.onclick = onDone;
  bar.appendChild(go);
  s.appendChild(bar);

  const body = el("div", "rbody");
  s.appendChild(body);
  let training = false;
  draw();

  function draw() {
    body.innerHTML = "";
    // 파티 — 지금 체력과 쉬면 얼마나 차는지
    body.appendChild(sec("파티", st.used ? (st.used === "rest" ? "푹 쉬었습니다" : "수련을 마쳤습니다") : "쉬면 최대 HP의 30%가 찹니다"));
    const prow = el("div", "rrow cparty");
    for (const k of run.party) {
      const h = HERO_DATA[k] || HERO(k);
      const hp = run.hp[k] || 0, max = run.maxHp[k] || 1;
      const down = hp <= 0;
      const gain = down || st.used ? 0 : Math.min(max - hp, Math.round(max * RULES.CAMP_HEAL));
      const c = el("div", "cmember" + (down ? " down" : ""));
      c.appendChild(art.portrait(k, { ko: h.ko, tint: TINT(k), size: 40, slot: "battle", still: true }));
      const info = el("div", "cinfo");
      info.appendChild(el("b", null, h.ko));
      const barx = el("div", "chp");
      const fill = el("i"); fill.style.width = `${(hp / max) * 100}%`; barx.appendChild(fill);
      if (gain) { const add = el("em"); add.style.left = `${(hp / max) * 100}%`; add.style.width = `${(gain / max) * 100}%`; barx.appendChild(add); }
      info.appendChild(barx);
      info.appendChild(el("span", "cnum", down ? "주말농장에서 쉬는 중" : `${hp} / ${max}${gain ? `  (+${gain})` : ""}`));
      c.appendChild(info);
      prow.appendChild(c);
    }
    body.appendChild(prow);

    // 하나만 고른다
    body.appendChild(sec("캠프에서", st.used ? "이번 캠프에서는 골랐습니다" : "하나만 고릅니다"));
    const acts = el("div", "rrow cacts");
    const rest = el("button", "cact" + (st.used === "rest" ? " on" : ""));
    rest.appendChild(el("b", null, "쉬기"));
    rest.appendChild(el("span", null, "살아 있는 사도 HP +30%"));
    rest.disabled = !!st.used;
    rest.onclick = () => { const why = R.campRest(run); if (why) return hint(why); draw(); };
    acts.appendChild(rest);
    const offer = run.camp && run.camp.train;
    const train = el("button", "cact" + (st.used === "train" || training ? " on" : ""));
    train.appendChild(el("b", null, "수련"));
    train.appendChild(el("span", null, offer ? `「${CARDS[offer.cardId].name}」에 번뜩임` : "번뜩임을 붙일 고유 카드가 없습니다"));
    train.disabled = !!st.used || !offer;
    train.onclick = () => { training = !training; draw(); };
    acts.appendChild(train);
    body.appendChild(acts);

    if (training && offer && !st.used) {
      const c = CARDS[offer.cardId];
      body.appendChild(sec("수련", `「${c.name}」에 붙일 번뜩임 — 다섯 중 셋`));
      const fr = el("div", "rrow flashrow");
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
        b.onclick = () => { const why = R.campTrain(run, { cardId: offer.cardId, n }); if (why) return hint(why); training = false; draw(); };
        fr.appendChild(b);
      }
      body.appendChild(fr);
    }

    body.appendChild(sec("장비", "바꿔 끼기는 캠프에서만 — 캠프 선택을 쓰지 않습니다"));
    body.appendChild(gearPanel(run, "camp", draw, hint));

    if (withShop) {
      body.appendChild(sec("골디의 좌판", "들러도 캠프 선택은 그대로 남습니다"));
      const sb = el("button", "cshop");
      sb.appendChild(el("span", "sface", "✦"));
      const tx = el("span", "ctext");
      tx.appendChild(el("b", null, "골디의 상점 들르기"));
      tx.appendChild(el("span", null, `「어서 오세요, 고객님!」 · 가진 골드 ✦ ${run.gold}`));
      sb.appendChild(tx);
      sb.onclick = onShop;
      body.appendChild(sb);
    }
  }

  function sec(label, why) {
    const d = el("div", "rsec");
    d.appendChild(el("b", null, label));
    if (why) d.appendChild(el("span", "why", why));
    return d;
  }
  return s;
}

// ── 골디의 상점 ─────────────────────────────────────────────────────────
// 층마다 보스 앞에서 한 번. 골디(황금에서 태어난 용족 상인 · 교단 상점 담당)가 판다.
// 인물 사전 그대로: '고객님' 하고 부르고, 정품만 팔고, **할인은 웃으며 거절한다.** 말하다 말고 와작.
// 파는 것 — 중립 카드 셋(효과가 다 도는 것만) · 파티 사도의 고유 카드 둘 · 카드 제거 한 번.
const GOLDY = {
  hello: "어서 오세요, 고객님! 오늘 들어온 물건은 전부 정품이에요.",
  buy: ["탁월한 선택이세요!", "센스가 좋으시네요!", "좋은 물건은 주인을 알아보는 법이죠!"],
  poor: "좋은 물건에는 그만한 값이 있는 법이죠. 조금 더 모아 오세요!",
  haggle: "할인은 안 돼요! 대신 품질은 제가 보증하죠. …와작.",
  remove: "필요 없는 걸 덜어 내는 게 제일 좋은 세공이에요.",
  bye: "또 오세요, 고객님! …와작.",
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

export function shopScreen(run, onDone, opts = {}) {
  const s = screen();
  s.classList.add("rewardscreen", "shopscreen");
  const shop = run.shop || R.rollShop(run);

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", "골디의 상점"));
  const gold = el("span", "sgold");
  bar.appendChild(gold);
  const leave = el("button", "dexbtn", opts.back || "보스에게 간다");
  leave.onclick = () => { say(GOLDY.bye); setTimeout(onDone, 0); };
  bar.appendChild(leave);
  s.appendChild(bar);

  // 골디 — 그림이 없어서 금화 표식과 말풍선으로 선다
  const host = el("div", "shost");
  host.appendChild(el("div", "sface", "✦"));
  const talk = el("div", "stalk");
  const who = el("b", null, "골디");
  const line = el("p", "sline2");
  talk.appendChild(who);
  talk.appendChild(line);
  host.appendChild(talk);
  const haggle = el("button", "shaggle", "깎아 주세요");
  haggle.onclick = () => say(GOLDY.haggle);
  host.appendChild(haggle);
  s.appendChild(host);
  function say(t) { line.textContent = t; }

  const body = el("div", "rbody");
  s.appendChild(body);

  const firstWord = run.party.map((k) => (HERO_DATA[k] || HERO(k)).ko).find((ko) => GOLDY.greet[ko]);
  say(firstWord ? GOLDY.greet[firstWord] : GOLDY.hello);

  let removing = false;
  draw();

  function draw() {
    gold.textContent = `✦ ${run.gold} 골드`;
    body.innerHTML = "";
    if (shop.gift) {
      body.appendChild(sec("선물", "실비아가 있어서 골디가 한 장을 덱에 넣어 줬습니다"));
      const row = el("div", "rrow");
      row.appendChild(item({ id: shop.gift, price: 0, sold: true, gift: true }, -1));
      body.appendChild(row);
    }
    const neutral = shop.items.map((it, i) => [it, i]).filter(([it]) => it.kind === "neutral");
    const unique = shop.items.map((it, i) => [it, i]).filter(([it]) => it.kind === "unique");
    body.appendChild(sec("중립 카드", "어느 사도의 것도 아닙니다. 공격력·방어력이 가장 높은 아군 기준으로 돕니다"));
    const nrow = el("div", "rrow");
    for (const [it, i] of neutral) nrow.appendChild(item(it, i));
    if (!neutral.length) nrow.appendChild(el("p", "rnone", "오늘은 진열할 중립 카드가 없습니다."));
    body.appendChild(nrow);

    body.appendChild(sec("고유 카드", "파티 사도의 고유 카드 — 전투 보상으로도 나옵니다"));
    const urow = el("div", "rrow");
    for (const [it, i] of unique) urow.appendChild(item(it, i));
    if (!unique.length) urow.appendChild(el("p", "rnone", "이 파티의 고유 카드는 이미 다 가졌습니다."));
    body.appendChild(urow);

    const eq = shop.items.map((it, i) => [it, i]).filter(([it]) => it.kind === "equip");
    if (eq.length) {
      body.appendChild(sec("장비", "사면 가방에 들어갑니다 · 빈 칸이면 바로 낄 수 있습니다"));
      const erow = el("div", "rrow");
      for (const [it, i] of eq) {
        const b = el("button", "sprice", it.sold ? "팔렸습니다" : `✦ ${it.price} 골드`);
        b.disabled = !!it.sold;
        if (!it.sold && run.gold < it.price) b.classList.add("short");
        b.onclick = () => {
          const why = R.buy(run, i);
          if (why) return say(why === "골드가 모자랍니다" ? GOLDY.poor : why);
          say("장인의 손길이 닿은 정품이에요! …와작."); draw();
        };
        const c = equipCard(it.id, b);
        if (it.sold) c.classList.add("sold");
        erow.appendChild(c);
      }
      body.appendChild(erow);
      if (run.bag.length) body.appendChild(gearPanel(run, "empty", draw, say));
    }

    const price = R.removePrice(run);
    body.appendChild(sec("카드 제거", shop.removeUsed ? "이번에는 이미 한 장 뺐습니다" : `덱에서 한 장을 뺍니다 · ${price} 골드 · 쓸 때마다 값이 오릅니다`));
    const rm = el("button", "srmbtn" + (removing ? " on" : ""), removing ? "그만두기" : "뺄 카드 고르기");
    rm.disabled = shop.removeUsed;
    rm.onclick = () => {
      if (!removing && run.gold < price) return say(GOLDY.poor);
      removing = !removing; draw();
    };
    body.appendChild(rm);
    if (removing && !shop.removeUsed) {
      const grid = el("div", "rrow sdeck");
      run.deck.forEach((id) => {
        const c = CARDS[id];
        if (!c) return;
        const card = bigCard(c, CARDART.pic[id] || null);
        card.onclick = () => {
          const why = R.removeCard(run, id);
          if (why) return say(why === "골드가 모자랍니다" ? GOLDY.poor : why);
          removing = false; say(GOLDY.remove); draw();
        };
        card.title = "눌러서 덱에서 빼기";
        const wrap = el("div", "rpick small");
        wrap.appendChild(card);
        grid.appendChild(wrap);
      });
      body.appendChild(grid);
    }
  }

  function item(it, i) {
    const c = CARDS[it.id];
    const pick = el("div", "rpick sitem" + (it.sold && !it.gift ? " sold" : ""));
    const tag = el("div", "rwho");
    if (c.hero) {
      tag.appendChild(art.portrait(c.hero, { ko: HERO(c.hero).ko, tint: TINT(c.hero), size: 26, slot: "battle", still: true }));
      tag.appendChild(el("b", null, HERO(c.hero).ko));
    } else tag.appendChild(el("b", "sgrade g-" + (c.grade || ""), `${c.grade || "중립"} · 중립`));
    pick.appendChild(tag);
    const card = bigCard(c, CARDART.pic[it.id] || null);
    pick.appendChild(card);
    if (c.blurb) pick.appendChild(el("p", "sblurb", c.blurb));
    const b = el("button", "sprice", it.gift ? "선물" : it.sold ? "팔렸습니다" : `✦ ${it.price} 골드`);
    b.disabled = !!it.sold;
    if (!it.sold && run.gold < it.price) b.classList.add("short");
    b.onclick = () => {
      const why = R.buy(run, i);
      if (why) return say(why === "골드가 모자랍니다" ? GOLDY.poor : why);
      say(GOLDY.buy[Math.floor(Math.random() * GOLDY.buy.length)]);
      draw();
    };
    pick.appendChild(b);
    return pick;
  }

  function sec(label, why) {
    const d = el("div", "rsec");
    d.appendChild(el("b", null, label));
    if (why) d.appendChild(el("span", "why", why));
    return d;
  }
  return s;
}

// ── 사도 교체 ───────────────────────────────────────────────────────────
// 층을 넘으면 한 명을 바꿀 수 있다. 팀 편성과 같은 결로 —
// 위에 지금 셋을 큰 카드로 세우고, 내보낼 사람을 고르면 아래에서 부를 사람을 고른다.
// **잃는 것을 먼저 보여 준다.** 바꾸면 그 사도가 모은 고유 카드와 번뜩임이 같이 나간다.
export function swapScreen(run, onDone) {
  const s = screen();
  s.classList.add("swapscreen");

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", "사도 교체"));
  bar.appendChild(el("span", "rwhy", "층을 넘었습니다. 한 명을 바꿀 수 있습니다 — 그대로 가도 됩니다."));
  const keep = el("button", "go", "그대로 간다");
  keep.onclick = onDone;
  bar.appendChild(keep);
  s.appendChild(bar);

  const body = el("div", "rbody");
  s.appendChild(body);

  let outKey = null;
  const q = { text: "", nature: null, role: null };
  const NAT = ["순수", "광기", "냉정", "우울", "활발", "공명"];
  const ROLE = ["탱커", "딜러", "서포터"];
  const RK = { front: "전열", mid: "중열", back: "후열" };

  const outHead = el("div", "rsec");
  const outRow = el("div", "sslots");
  const inHead = el("div", "rsec");
  const inBox = el("div", "spick");
  body.appendChild(outHead);
  body.appendChild(outRow);
  body.appendChild(inHead);
  body.appendChild(inBox);

  // 그 사도가 이 판에 모은 것 — 바꾸면 같이 나간다
  const earned = (k) => {
    const uniq = run.deck.filter((id) => CARDS[id] && CARDS[id].hero === k && CARDS[id].unique);
    const lit = uniq.filter((id) => run.flash && run.flash[id]);
    return { uniq: uniq.length, lit: lit.length };
  };

  function outCard(k) {
    const h = HERO_DATA[k] || HERO(k);
    const on = outKey === k;
    const down = (run.hp[k] || 0) <= 0;
    const n = el("button", "scard" + (on ? " on" : "") + (down ? " down" : ""));
    const face = el("div", "tface");
    face.appendChild(art.portrait(k, { ko: h.ko, tint: TINT(k), size: 0, slot: "event", still: true }));
    face.appendChild(el("div", "dfade"));
    const plate = el("div", "tplate");
    plate.appendChild(el("b", null, h.ko));
    plate.appendChild(el("span", "tsub", `${RK[h.row] || ""} ${h.role || ""}`));
    face.appendChild(plate);
    if (on) face.appendChild(el("span", "sout", "내보낸다"));
    n.appendChild(face);
    const e = earned(k);
    n.appendChild(el("div", "shp" + (down ? " down" : ""), down ? "주말농장" : `체력 ${run.hp[k]} / ${run.maxHp[k]}`));
    n.appendChild(el("div", "slose", e.uniq
      ? `모은 고유 카드 ${e.uniq}장${e.lit ? ` · 번뜩임 ${e.lit}개` : ""} — 바꾸면 같이 나간다`
      : "아직 모은 고유 카드가 없다"));
    n.onclick = () => { outKey = on ? null : k; draw(); };
    return n;
  }

  function inCard(k) {
    const h = HERO_DATA[k] || HERO(k);
    const n = el("button", "pcard");
    n.appendChild(art.portrait(k, { ko: h.ko, tint: TINT(k), size: 0, slot: "event", still: true }));
    n.appendChild(el("div", "dfade"));
    const badges = el("div", "dbadges");
    badges.appendChild(uiIcon("역할", h.role, "brole", (h.role || "").slice(0, 1)));
    badges.appendChild(uiIcon("성격", h.nature, "bnat n" + h.nature, (h.nature || "").slice(0, 1)));
    n.appendChild(badges);
    const plate = el("div", "dplate");
    plate.appendChild(el("span", "dname", h.ko));
    // 남는 두 사람과의 사이 — 없는 사이는 적지 않는다
    const bonds = run.party.filter((p) => p !== outKey)
      .map((p) => ({ p, t: C.tierBetween(k, p) })).filter((x) => x.t.id !== "초면");
    plate.appendChild(el("span", "dsub", bonds.length
      ? bonds.map((x) => `${HERO(x.p).ko} ${x.t.id}`).join(" · ")
      : `${RK[h.row] || ""} · ${h.race || ""}`));
    n.appendChild(plate);
    if (bonds.length) n.appendChild(el("span", "dmark bondmark", "사이"));
    n.onclick = () => { R.swapHero(run, outKey, k); onDone(); };
    return n;
  }

  function draw() {
    outHead.innerHTML = "";
    outHead.appendChild(el("b", null, "① 내보낼 사람"));
    outHead.appendChild(el("span", "why", outKey ? `${HERO(outKey).ko} 을(를) 내보냅니다` : "한 명을 누르세요"));
    outRow.innerHTML = "";
    for (const k of run.party) outRow.appendChild(outCard(k));

    inHead.innerHTML = "";
    inBox.innerHTML = "";
    inHead.appendChild(el("b", null, "② 부를 사람"));
    if (!outKey) {
      inHead.appendChild(el("span", "why", "내보낼 사람을 먼저 고르면 여기에 뜹니다"));
      return;
    }
    inHead.appendChild(el("span", "why", "남는 두 사람과 사이가 있으면 「사이」 표가 붙습니다"));

    const head = el("div", "phead");
    const search = el("input", "dsearch");
    search.placeholder = "이름으로 찾기";
    search.value = q.text;
    search.oninput = () => { q.text = search.value.trim(); fillGrid(); };
    head.appendChild(search);
    inBox.appendChild(head);

    const chips = el("div", "chiprow");
    const group = (vals, key) => {
      const all = el("button", "chip" + (q[key] ? "" : " on"), "전체");
      all.onclick = () => { q[key] = null; draw(); };
      chips.appendChild(all);
      for (const v of vals) {
        const b = el("button", "chip" + (q[key] === v ? " on" : ""));
        if (key === "nature") b.appendChild(uiIcon("성격", v, "cico", ""));
        b.appendChild(el("span", null, v));
        b.onclick = () => { q[key] = q[key] === v ? null : v; draw(); };
        chips.appendChild(b);
      }
      chips.appendChild(el("span", "chipgap"));
    };
    group(NAT, "nature");
    group(ROLE, "role");
    inBox.appendChild(chips);

    const grid = el("div", "pgrid");
    inBox.appendChild(grid);
    function fillGrid() {
      grid.innerHTML = "";
      // 사이가 있는 사도를 앞에 둔다 — 132명을 이름 차례로 늘어놓으면 찾을 수가 없다
      const list = run.bench.filter((k) => {
        const h = HERO_DATA[k] || HERO(k);
        if (q.nature && h.nature !== q.nature) return false;
        if (q.role && h.role !== q.role) return false;
        if (q.text && !(h.ko || "").includes(q.text)) return false;
        return true;
      }).map((k) => ({ k, n: run.party.filter((p) => p !== outKey).reduce((a, p) => a + C.pairCount(k, p), 0) }))
        .sort((a, b) => b.n - a.n || (HERO(a.k).ko || "").localeCompare(HERO(b.k).ko || ""));
      for (const { k } of list) grid.appendChild(inCard(k));
      if (!list.length) grid.appendChild(el("div", "more", "맞는 사도가 없습니다."));
    }
    fillGrid();
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

export function eventScreen(run, onDone, onFight) {
  const s = screen();
  s.classList.add("rewardscreen", "eventscreen");
  draw();

  function draw() {
    s.innerHTML = "";
    const E = run.event;
    if (!E) return;

    // 「지도 공개」 — 둘 중 하나를 고른다
    if (!E.id) {
      const bar = el("div", "dbar2");
      bar.appendChild(el("h1", "dtitle", "갈림길"));
      bar.appendChild(el("span", "rwhy", "지도를 미리 봐 두었습니다 — 어느 쪽으로 갈지 고릅니다"));
      s.appendChild(bar);
      const row = el("div", "rrow evforks");
      for (const id of E.choices) {
        const ev = EV.eventById(id);
        const b = el("button", "evfork");
        b.appendChild(el("b", null, ev.name));
        b.appendChild(el("span", "evkind", `${POOL_KO(ev.pool)} · ${ev.kind}`));
        b.appendChild(el("p", null, ev.scene));
        b.onclick = () => { EV.pickEvent(run, id); draw(); };
        row.appendChild(b);
      }
      s.appendChild(row);
      return;
    }

    const ev = EV.eventById(E.id);
    const bar = el("div", "dbar2");
    bar.appendChild(el("h1", "dtitle", ev.name));
    bar.appendChild(el("span", "rwhy", `이벤트 · ${POOL_KO(ev.pool)} · ${ev.kind}`));
    bar.appendChild(el("span", "evgold", `✦ ${run.gold} 골드`));
    if (E.phase === "result" && !E.pending.length) {
      const go = el("button", "dexbtn", "길을 떠난다");
      go.onclick = () => { EV.leaveEvent(run); onDone(); };
      bar.appendChild(go);
    }
    s.appendChild(bar);

    const body = el("div", "rbody");
    s.appendChild(body);

    // 장면 — 나오는 사도의 초상과 글
    const scene = el("div", "evscene");
    const npc = ev.npc && heroKeyByKo(ev.npc);
    if (npc) scene.appendChild(art.portrait(npc, { ko: ev.npc, tint: TINT(npc), size: 92, slot: "battle", still: true }));
    else scene.appendChild(el("span", "evq", "?"));
    const st = el("div", "evtext");
    if (ev.npc) st.appendChild(el("b", "evnpc", ev.npc));
    st.appendChild(el("p", null, ev.scene));
    scene.appendChild(st);
    body.appendChild(scene);

    // 파티 — 지금 체력(판정·HP 대가를 보고 고르게)
    const prow = el("div", "rrow evparty");
    for (const k of run.party) {
      const hp = run.hp[k] || 0, max = run.maxHp[k] || 1;
      const c = el("div", "cmember" + (hp <= 0 ? " down" : ""));
      c.appendChild(art.portrait(k, { ko: HERO(k).ko, tint: TINT(k), size: 34, slot: "battle", still: true }));
      const info = el("div", "cinfo");
      info.appendChild(el("b", null, HERO(k).ko));
      const barx = el("div", "chp"); const fill = el("i"); fill.style.width = `${(hp / max) * 100}%`; barx.appendChild(fill);
      info.appendChild(barx);
      info.appendChild(el("span", "cnum", hp <= 0 ? "주말농장에서 쉬는 중" : `${hp} / ${max} · 공격 ${(HERO_DATA[k] || {}).atk || "?"}`));
      c.appendChild(info);
      prow.appendChild(c);
    }
    body.appendChild(prow);

    if (E.phase === "choose") {
      const list = el("div", "evopts");
      EV.optionsOf(run, ev).forEach((opt, i) => {
        const lock = EV.lockOf(run, opt);
        const b = el("button", "evopt" + (opt.leave ? " leave" : "") + (lock ? " locked" : ""));
        const by = EV.openedBy(run, opt);
        if (by) {
          const tag = el("span", "evby");
          tag.appendChild(art.portrait(by.key, { ko: by.ko, tint: TINT(by.key), size: 26, slot: "battle", still: true }));
          tag.appendChild(el("b", null, opt.race ? `${opt.race} · ${by.ko}` : opt.when ? "진짜 환자" : by.ko));
          b.appendChild(tag);
        }
        b.appendChild(el("b", "evlabel", opt.label));
        b.appendChild(el("span", "evout", describe(opt)));
        if (opt.price && EV.outOf(run, opt) === opt.price.out) b.appendChild(el("span", "evnote", opt.price.why));
        if (lock) b.appendChild(el("span", "evlock", lock));
        b.disabled = !!lock;
        b.onclick = () => {
          const r = EV.choose(run, i);
          if (r.why) return hint(r.why);
          hint("");
          if (r.fight) return onFight();
          draw();
        };
        list.appendChild(b);
      });
      body.appendChild(list);
      return;
    }

    // 결과
    const res = el("div", "evresult");
    if (E.label) res.appendChild(el("b", "evchose", `「${E.label}」`));
    if (E.say) res.appendChild(el("p", "evsay", E.say));
    for (const line of E.log) res.appendChild(el("p", "evlog", line));
    if (!E.log.length && !E.pending.length) res.appendChild(el("p", "evlog", "아무 일도 없었다."));
    body.appendChild(res);

    const p = E.pending[0];
    if (p) body.appendChild(picker(p));
  }

  // 선택지가 무엇을 하는지 — 결과 낱말 그대로, 확률·판정은 숫자로
  function describe(opt) {
    if (opt.fight) return `전투 (${opt.fight.name}) → 이기면 ${opt.fight.win || opt.fight.winGamble.map((g) => `${pctTxt(g.p)} ${g.out}`).join(" / ")}`;
    if (opt.gamble && opt.choose) return `골라서 받는다: ${opt.gamble.map((g) => g.out).join(" / ")}`;
    if (opt.gamble) return opt.gamble.map((g) => `${pctTxt(g.p)} ${g.out}`).join(" / ");
    if (opt.judge) {
      const j = EV.judgeOf(run, opt);
      if (j.pick) return `사도 1명을 골라 겨룬다 — HP ${opt.judge.at} 이상이면 ${opt.judge.pass}, 아니면 ${opt.judge.fail}`;
      return `${HERO(j.who || "").ko || "?"} 공격 ${j.value} → ${j.pass ? `성공: ${opt.judge.pass}` : `실패: ${opt.judge.fail}`} (${opt.judge.at} 이상이면 성공)`;
    }
    const out = EV.outOf(run, opt);
    return !out || out === "없음" ? "아무 대가도 없이" : out;
  }

  // 고를 것 하나
  function picker(p) {
    const wrap = el("div", "evpick");
    const say = (t) => { const w = EV.resolve(run, t); if (w) return hint(w); hint(""); draw(); };
    const title = (t, why) => { const d = el("div", "rsec"); d.appendChild(el("b", null, t)); if (why) d.appendChild(el("span", "why", why)); wrap.appendChild(d); };

    if (p.k === "remove" || p.k === "dupe") {
      title(p.k === "remove" ? "덱에서 뺄 카드" : "한 장 더 넣을 카드", p.k === "remove" ? "눌러서 덱에서 뺍니다" : "눌러서 같은 카드를 한 장 더");
      const grid = el("div", "rrow sdeck");
      const seen = new Set();
      for (const id of run.deck) {
        if (seen.has(id)) continue; seen.add(id);
        const c = CARDS[id]; if (!c) continue;
        const card = bigCard(c, CARDART.pic[id] || null);
        card.onclick = () => say(id);
        const w = el("div", "rpick small");
        const n = run.deck.filter((x) => x === id).length;
        if (n > 1) { const t = el("div", "rwho"); t.appendChild(el("b", null, `×${n}`)); w.appendChild(t); }
        w.appendChild(card);
        grid.appendChild(w);
      }
      wrap.appendChild(grid);
    } else if (p.k === "card") {
      title(p.label, "하나를 덱에 넣습니다");
      const row = el("div", "rrow");
      for (const id of p.cards) {
        const c = CARDS[id];
        const w = el("div", "rpick");
        const tag = el("div", "rwho");
        if (c.hero) { tag.appendChild(art.portrait(c.hero, { ko: HERO(c.hero).ko, tint: TINT(c.hero), size: 26, slot: "battle", still: true })); tag.appendChild(el("b", null, HERO(c.hero).ko)); }
        else tag.appendChild(el("b", "sgrade g-" + (c.grade || ""), `${c.grade || "중립"} · 중립`));
        w.appendChild(tag);
        const card = bigCard(c, CARDART.pic[id] || null);
        card.onclick = () => say(id);
        w.appendChild(card);
        row.appendChild(w);
      }
      wrap.appendChild(row);
      const skip = el("button", "srmbtn", "받지 않는다");
      skip.onclick = () => say(null);
      wrap.appendChild(skip);
    } else if (p.k === "flash") {
      const c = CARDS[p.offer.cardId];
      title("번뜩임", `「${c.name}」에 붙일 번뜩임 — 다섯 중 셋`);
      const fr = el("div", "rrow flashrow");
      for (const n of p.offer.picks) {
        const f = (c.flash || [])[n - 1]; if (!f) continue;
        const b = el("button", "fcard f" + n);
        const head = el("div", "fhead2");
        head.appendChild(el("span", "fnum", "①②③④⑤"[n - 1]));
        head.appendChild(el("b", null, f.kind));
        head.appendChild(el("span", "fko", f.ko));
        b.appendChild(head);
        b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
        b.appendChild(el("p", "fbefore", `지금: ${shortText(c.text)}`));
        b.onclick = () => say(n);
        fr.appendChild(b);
      }
      wrap.appendChild(fr);
      if (run.event.shinChance && !run.noShin) wrap.appendChild(el("p", "evnote", `고르면 ${pctTxt(run.event.shinChance)} 확률로 신뜩임(피해 ×1.3)이 얹힙니다`));
      const skip = el("button", "srmbtn", "받지 않는다");
      skip.onclick = () => say(null);
      wrap.appendChild(skip);
    } else if (p.k === "pickHero" || p.k === "judgePick") {
      const t = p.k === "judgePick" ? `팔씨름에 나설 사도 — HP ${p.judge.at} 이상이면 이긴다` : p.then.k === "hp" ? "HP 가 바뀔 사도" : `최대 HP +${p.then.v} 를 받을 사도`;
      title("사도 1명", t);
      const row = el("div", "rrow evparty");
      for (const k of run.party) {
        if ((run.hp[k] || 0) <= 0) continue;
        const b = el("button", "cmember evpickhero");
        b.appendChild(art.portrait(k, { ko: HERO(k).ko, tint: TINT(k), size: 40, slot: "battle", still: true }));
        const info = el("div", "cinfo");
        info.appendChild(el("b", null, HERO(k).ko));
        info.appendChild(el("span", "cnum", `HP ${run.hp[k]} / ${run.maxHp[k]}`));
        b.appendChild(info);
        b.onclick = () => say(k);
        row.appendChild(b);
      }
      wrap.appendChild(row);
    } else if (p.k === "gambleChoice") {
      title("골라서 받는다", "아는 얼굴 앞이라 바로 읽어 준다");
      const row = el("div", "evopts");
      for (const o of p.options) {
        const b = el("button", "evopt");
        b.appendChild(el("b", "evlabel", o));
        b.onclick = () => say(o);
        row.appendChild(b);
      }
      wrap.appendChild(row);
    }
    return wrap;
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
  const again = el("button", "go", "다시 떠난다");
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
    ["번뜩임", `${flashN}개`, "카드마다 하나"],
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

  // 사이 — 이 판에 함께 싸운 짝. 없는 사이는 적지 않는다.
  const met = Object.keys(run.met).filter((k) => {
    const [x, y] = k.split("|");
    return C.tierBetween(x, y).id !== "초면";
  });
  if (met.length) {
    body.appendChild(sec2("이번 판에 함께 싸운 사이", "다음 판에는 더 가까운 데서 시작합니다"));
    const bn = el("div", "erow");
    for (const k of met) {
      const [x, y] = k.split("|");
      const t = C.tierBetween(x, y);
      const line = el("span", "sline");
      line.appendChild(el("b", null, `${HERO(x).ko} · ${HERO(y).ko}`));
      line.appendChild(el("span", "t" + t.id, t.id));
      bn.appendChild(line);
    }
    body.appendChild(bn);
  }

  function sec2(label, why) {
    const d = el("div", "rsec");
    d.appendChild(el("b", null, label));
    if (why) d.appendChild(el("span", "why", why));
    return d;
  }
  return s;
}
