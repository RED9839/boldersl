// 화면 — 지도 · 보상 · 캠프 · 상점 · 이벤트 · 끝. 편성은 party-screen.js, 전투는 fight-screen.js, 같이 쓰는 조각은 ui-common.js.
// 규칙은 combat.js 가 쥐고 있고, 여기는 그리고 누른 것을 넘긴다.
import { CARDS, flashed } from "./cardbook.js";
import { ENEMIES, FLOORS, foeLook } from "./data/enemies.js";
import { HERO_DATA, EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { shortText, cardParts, polite, blessLine } from "./card-text.js";
import { 을를, 과와, josa } from "./ko.js";
import * as RULES from "./rules.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import { spineView } from "./spine-view.js";
import * as M from "./map.js";
import { getZoom } from "./stage.js";
import { settingsPanel } from "./settings-panel.js";
import { sfx } from "./sfx.js";
import { writeSave, saveOk } from "./save.js";
import { HERO, TINT, el, hint, screen, NTINT, goldIcon, goldLabel, mistletoeIcon, MISTLETOE, openHelp, fsButton, img, withKeywords, kwText, showCard, showPiles, bigCard, effectBox, setStageBg, BATTLE_BG, statText, equipIcon, emptySlotIcon, equipCard, showEquip, confirmPop } from "./ui-common.js";

// 다른 파일로 옮긴 것도 ui.js 에서 그대로 꺼내 쓴다(main.js · tools/smoke.js)
export { hint, openHelp, equipIcon } from "./ui-common.js";
export { partyScreen } from "./party-screen.js";
export { fightScreen } from "./fight-screen.js";

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
    label.textContent = name ? `「${name}」 ${josa(name, "을를")} 골랐습니다` : "골랐습니다";
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
// 지금 칸 다음이 보스인가 — 휴식(상점) 칸은 층 중간에도 있다. 보스 바로 앞 칸(1-11)에서만 「보스에게 갑니다」
const bossNext = (run) => { const n = M.currentNode(run); return !!(n && n.row === M.ROWS - 1); };

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
    dl.appendChild(t.kind === "전용" && t.text ? kwText(el("dd"), t.text) : el("dd", null, t.text || "풀이가 아직 없습니다."));
  }
  return dl;
}

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
  // 장비 — 사도마다 무기 · 방어구 · 장신구. 전투 밖이면 지도에서도 끼고 바꿔 낀다(빼기는 없다 — 바꿔 끼면 낀 것은 팔린다)
  const openGear = () => {
    const box = centerModal("gearmodal");
    const body = el("div", "bmbody");
    body.appendChild(el("h3", "bmname", "장비"));
    body.appendChild(el("span", "bmkind", "사도마다 무기 · 방어구 · 장신구 한 칸씩 · 끼기 · 바꿔 끼기(낀 것은 팔림) · 팔기 — 전투 밖이면 어디서든"));
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
      const q = el("button", "mitem quit" + (saveOk() ? "" : " danger")); q.appendChild(el("b", null, "메인화면으로")); q.appendChild(el("span", null, saveOk() ? "판은 저장됩니다 — 로비에서 이어하기" : "저장할 수 없는 브라우저입니다 — 나가면 이 판은 사라집니다"));
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
      sfx.play("map.step");
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
  return n ? flashed(c, n) : c;   // 글만이 아니라 코스트도 — 코스트를 바꾸는 신탁이 있다
}

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
  sfx.play("reward", { delay: 120 });
  if (rgot.gold) sfx.play("coin", { delay: 420 });
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
          const take = () => { R.takeEquip(run, id); writeSave(run); sfx.play("reward.card"); drawEq(); };
          b.onclick = take;
          const card = equipCard(id, b);
          card.classList.add("eqtap");
          card.onclick = (ev) => { if (!onButton(ev)) showEquip(id, { acts: [{ label: "이걸 가집니다", run: take }] }); };
          row.appendChild(card);
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
      who.appendChild(el("b", null, `신탁 「${fl.kind || fl.ko || ""}」${f.shin ? ` · 축복(${RULES.shinLabel(CARDS[f.cardId], f.shin)})` : ""}`));
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
    fr.appendChild(flashTarget(c, offer.cardId, run));   // 어느 카드에 붙는지 — 그림과 원래 효과
    for (const n of offer.picks) {
      const f = (c.flash || [])[n - 1];
      if (!f) continue;
      const b = el("button", "fcard f" + n);
      const head = el("div", "fhead2");
      head.appendChild(el("b", null, f.kind || f.ko));
      if (f.kind) head.appendChild(el("span", "fko", f.ko));   // 자유 신탁은 이름이 머리
      b.appendChild(head);
      b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
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
    go.onclick = () => { closeCenter(); sfx.play("reward.card"); onPick(id, null); };
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
    body.appendChild(el("span", "bmkind", `신탁${f.kind ? " " + f.kind : ""} · 「${c.name}」에 붙습니다`));
    body.appendChild(el("h3", "bmname", f.ko || f.kind));
    body.appendChild(el("span", "bmsub", "바뀐 뒤"));
    body.appendChild(withKeywords(el("p", "bmtext"), shortText(f.text), c.hero));
    body.appendChild(el("span", "bmsub", "원래 효과"));
    body.appendChild(withKeywords(el("p", "bmhelp"), shortText(c.text), c.hero));
    const { terms } = cardParts({ ...c, text: f.text }, c.hero);
    if (terms.length) body.appendChild(termDl(terms));
    const row = el("div", "bmbtns");
    const go = el("button", "bmuse", "이 신탁을 붙입니다");
    go.onclick = () => { closeCenter(); sfx.play("flash"); onPick(null, { cardId, n }); };
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

// ── 장비 칸 ─────────────────────────────────────────────────────────────
// 스탯 줄 · 장비 아이콘 · 장비 카드는 ui-common.js 에 있다(편성 · 전투도 쓴다). 여기는 끼우고 빼는 쪽이다.
// 장비 카드를 누르면 자세히 — 카드 안의 단추(끼기 · 사기 · 낱말)를 누른 것은 빼고
const onButton = (ev) => !!(ev && ev.target && ev.target.closest && ev.target.closest("button"));
// 사도 한 명의 세 칸(무기 · 방어구 · 장신구) — 작은 줄. 짚으면 이름 · 스탯(title), 누르면 자세히
function gearStrip(run, k, size = 26) {
  const g = R.gearOf(run, k);
  const row = el("span", "gstrip");
  for (const sl of RULES.SLOTS) {
    const e = g[sl] ? EQUIP[g[sl]] : null;
    const cell = e ? equipIcon(e, size) : emptySlotIcon(sl, size);
    if (!e) cell.title = `${sl} — 비어 있음`;
    else { cell.classList.add("eqtap"); cell.onclick = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); showEquip(e.id, { heroKey: k }); }; }
    row.appendChild(cell);
  }
  return row;
}
// 신탁이 붙을 카드 — 보상 · 수련 · 이벤트의 신탁 줄 맨 앞. 그림 아래에 효과를 글로 한 번 더(고르는 신탁과 견주게).
// 이미 신탁이 붙은 카드(이벤트의 「신탁 바꾸기」)면 지금 모습과 「지금」 — 전에는 원래 글을 「지금」 이라고 보였다
function flashTarget(c, id, run) {
  const n = run && run.flash && run.flash[id];
  const now = n ? flashed(c, n) : c;
  const box = el("div", "ftarget");
  box.appendChild(el("span", "ftlab", n ? "이 카드의 신탁을 바꿉니다" : "이 카드에 붙습니다"));
  const card = bigCard(now, (id && CARDART.pic[id]) || null);
  card.onclick = () => showCard(now, c.hero);
  box.appendChild(card);
  box.appendChild(effectBox(now, n ? "지금" : "원래 효과", `「${c.name}」 · 비용 ${now.xcost ? "X" : now.cost}${n && now.flashKo ? ` · 신탁 「${now.flashKo}」` : ""}`));
  return box;
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
          // 빼기는 없다 — 한 번 끼면 그대로. 누르면 자세히
          c.classList.add("eqtap");
          c.onclick = () => showEquip(id, { heroKey: k, note: `${h.ko}의 ${sl} · 낀 장비는 뺄 수 없습니다 — 이 칸에 다른 장비를 끼면 +${R.sellPrice(id)} 골드에 팔립니다` });
        } else c.appendChild(el("span", "gempty", "비어 있음"));
        slots.appendChild(c);
      }
      r.appendChild(slots);
      rows.appendChild(r);
    }
    box.appendChild(rows);
    box.appendChild(el("p", "gbagh", `한 번 낀 장비는 뺄 수 없습니다. 찬 칸에 다른 장비를 끼면 낀 것은 사는 값의 ${Math.round(RULES.EQUIP_SELL * 100)}% 에 팔립니다. 장비를 누르면 자세히 봅니다`));
    // 끼기 — 빈 칸이면 바로, 찬 칸이면 옛 장비를 판다고 묻고 나서
    const wear = (k, id) => {
      const e = EQUIP[id], h = HERO_DATA[k] || HERO(k);
      const old = R.gearOf(run, k)[e.slot];
      const go = () => {
        const price = old ? R.sellPrice(old) : 0;
        const why = R.equip(run, k, id, { replace: !!old }); writeSave(run);
        if (why) { if (say) say(why); return; }
        if (old) { sfx.play("shop.sell"); if (say) say(`「${EQUIP[old].ko}」 ${josa(EQUIP[old].ko, "을를")} ${price} 골드에 팔고 ${h.ko}에게 「${e.ko}」 ${josa(e.ko, "을를")} 끼웠습니다`); }
        else if (say) say(`${h.ko}에게 「${e.ko}」 ${josa(e.ko, "을를")} 끼웠습니다`);
        draw(); onChange && onChange();
      };
      if (!old) return go();
      const o = EQUIP[old];
      confirmPop({
        title: `${h.ko}의 ${e.slot} 바꿔 끼기`,
        text: `「${o.ko}」 ${josa(o.ko, "을를")} 팔고(+${R.sellPrice(old)}골드) 「${e.ko}」 ${josa(e.ko, "을를")} 낍니다. 판 장비는 돌아오지 않습니다.`,
        ok: `팔고 낍니다 +${R.sellPrice(old)}`,
        onOk: go,
      });
    };
    // 가방
    if (run.bag.length) {
      box.appendChild(el("p", "gbagh", `가방 — 누구에게 낄지 고릅니다(「바꾸기」 는 낀 것을 팝니다). 가방에서 팔면 사는 값의 ${Math.round(RULES.EQUIP_SELL * 100)}%`));
      const bag = el("div", "rrow gbag");
      for (const id of run.bag.slice()) {
        const e = EQUIP[id];
        const btns = el("div", "gto");
        const label = (k) => {
          const old = R.gearOf(run, k)[e.slot];
          return `${(HERO_DATA[k] || HERO(k)).ko}${old ? ` (바꾸기 +${R.sellPrice(old)})` : ""}${e.affinity === k ? " ♥" : ""}`;
        };
        for (const k of run.party) {
          const b = el("button", "gtobtn" + (e.affinity === k ? " aff" : ""), label(k));
          b.onclick = () => wear(k, id);
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
          const why = R.sellEquip(run, id); writeSave(run);
          if (why && say) say(why);
          else { sfx.play("shop.sell"); if (say) say(`「${e.ko}」 ${josa(e.ko, "을를")} ${price} 골드에 팔았습니다`); }
          draw(); onChange && onChange();
        };
        btns.appendChild(sell);
        const card = equipCard(id, btns);
        card.classList.add("eqtap");
        card.onclick = (ev) => {
          if (onButton(ev)) return;
          showEquip(id, {
            note: "가방에 있습니다 — 낄 사도를 고르거나 팝니다",
            acts: [
              ...run.party.map((k) => ({ label: label(k), cls: "bmuse" + (e.affinity === k ? " aff" : ""), run: () => wear(k, id) })),
              { label: `팔기 +${price}`, cls: "bmsell", run: () => confirmPop({
                title: "팔기", text: `「${e.ko}」 ${josa(e.ko, "을를")} 팔고 ${price} 골드를 받습니다. 판 장비는 돌아오지 않습니다.`, ok: `팝니다 +${price}`,
                onOk: () => {
                  const why = R.sellEquip(run, id); writeSave(run);
                  if (why) { if (say) say(why); return; }
                  sfx.play("shop.sell"); if (say) say(`「${e.ko}」 ${josa(e.ko, "을를")} ${price} 골드에 팔았습니다`);
                  draw(); onChange && onChange();
                },
              }) },
            ],
          });
        };
        bag.appendChild(card);
      }
      box.appendChild(bag);
    } else box.appendChild(el("p", "rnone", "가방이 비었습니다."));
  };
  draw();
  return box;
}

// ── 캠프 ────────────────────────────────────────────────────────────────
// 한 층에 두 번 — 가운데 캠프, 보스 앞 캠프 + 상점. 슬더스 모닥불처럼 **하나만** 고른다.
//   쉬기  살아 있는 사도 HP 회복(최대 HP의 30%) · 주말농장에 간 사도는 최대 HP의 30%로 돌아온다
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
  // 바로 다음이 보스인가 — 휴식(상점)은 길 가운데(1-4 ~ 1-9)에도 선다
  const nearBoss = bossNext(run);
  const heal = (k) => {
    const hp = run.hp[k] || 0, max = run.maxHp[k] || 1;
    if (st.used) return 0;
    return hp <= 0 ? Math.max(1, Math.round(max * RULES.CAMP_REVIVE)) : Math.min(max - hp, Math.round(max * RULES.CAMP_HEAL));
  };

  // ① 머리 — 이름 · 어디 · 골드 · 떠나기
  const top = el("div", "cp-top");
  const title = el("div", "cp-title");
  // 마지막 싸움 앞의 캠프(main.js camp("final")) — 뿌리 깊은 곳으로 내려가기 전
  const fin = R.finalOf(run);
  title.appendChild(el("b", null, withShop ? "캠프 · 골디의 좌판" : fin ? `캠프 · ${fin.name}` : "캠프"));
  title.appendChild(el("span", null, fin ? `${floor.name} 아래 — 마지막 싸움 앞에서 숨을 고릅니다` : `${floor.name} — ${nearBoss ? "보스 앞에서 한숨 돌립니다" : "길 가운데에서 한숨 돌립니다"}`));
  top.appendChild(title);
  const gold = el("div", "cp-gold");
  gold.appendChild(goldIcon());
  const goldN = el("b", null, String(run.gold));
  gold.appendChild(goldN);
  gold.appendChild(el("span", null, "골드"));
  top.appendChild(gold);
  top.appendChild(fsButton());
  const go = el("button", "cp-leave", fin ? "뿌리 깊은 곳으로 내려갑니다" : bossNext(run) ? "보스에게 갑니다" : "길을 떠납니다");
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
  const rest = choiceBtn("cp-rest", "쉬기", `사도의 HP를 최대 HP의 ${Math.round(RULES.CAMP_HEAL * 100)}%만큼 채웁니다 — 주말농장에 간 사도도 ${Math.round(RULES.CAMP_REVIVE * 100)}%로 돌아옵니다`);
  const restGain = el("em", "cp-gain");
  rest.body.appendChild(restGain);
  rest.b.onclick = () => {
    const before = run.party.map((k) => run.hp[k] || 0);
    const back = run.party.filter((k) => (run.hp[k] || 0) <= 0);
    const why = R.campRest(run); writeSave(run);
    if (why) return say(why);
    sfx.play("camp.rest");
    // 불이 한 번 확 일고, 사도마다 찬 만큼 떠오른다
    fire.classList.remove("flare"); void fire.offsetWidth; fire.classList.add("flare");
    members.forEach((m, i) => {
      const d = (run.hp[m.k] || 0) - before[i];
      if (d > 0) { const f = el("span", "cp-float", `+${d}`); m.n.appendChild(f); setTimeout(() => f.remove(), 1600); }
    });
    say(back.length ? `모닥불 곁에서 푹 쉬었습니다. ${back.map((k) => (HERO_DATA[k] || {}).ko || k).join(" · ")} 주말농장에서 돌아왔습니다.` : "모닥불 곁에서 푹 쉬었습니다. 다시 걸을 힘이 납니다.");
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
      m.num.textContent = down ? `주말농장에서 쉬는 중${gain ? ` · 쉬면 +${gain}` : ""}` : `${hp} / ${max}${gain ? `  +${gain}` : ""}`;
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
      train.sub.textContent = `「${CARDS[offer.cardId].name}」에 신탁 ${을를(`「${f ? f.ko : ""}」`)} 붙였습니다`;
    }
    gsub.textContent = run.bag.length ? `가방에 ${run.bag.length}점 · 끼기 · 바꿔 끼기 · 팔기` : "낀 장비 보기";
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
      const why = R.campTrain(run, { cardId: offer.cardId, n }); writeSave(run);
      closeSheet();
      if (why) return say(why);
      sfx.play("flash");
      say(`「${c.name}」에 신탁을 붙였습니다. 불빛 아래에서 손에 익혔습니다.`);
      refresh();
    }, { verb: "신탁을 붙입니다" });
    fr.appendChild(flashTarget(c, offer.cardId, run));   // 어느 카드에 붙는지 — 그림과 원래 효과
    for (const n of offer.picks) {
      const f = (c.flash || [])[n - 1];
      if (!f) continue;
      const b = el("button", "fcard f" + n);
      const hd = el("div", "fhead2");
      hd.appendChild(el("b", null, f.kind || f.ko));
      if (f.kind) hd.appendChild(el("span", "fko", f.ko));   // 자유 신탁은 이름이 머리
      b.appendChild(hd);
      b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
      b.onclick = () => ts.pick(b, n, f.kind || f.ko);
      fr.appendChild(b);
    }
    wrap.appendChild(fr);
    wrap.appendChild(ts.bar);
    openSheet("cp-trainmodal", `수련 — 「${c.name}」에 붙일 신탁`, "다섯 중 셋 · 눌러 고르고 아래 단추로 정합니다 · 정하면 이번 캠프의 선택을 씁니다", wrap);
  }

  function openGear() {
    const wrap = el("div", "cp-gearbody");
    wrap.appendChild(gearPanel(run, "camp", refresh, say));
    openSheet("cp-gearmodal", "장비", "끼기 · 바꿔 끼기(낀 것은 팔림) · 팔기 — 캠프 선택을 쓰지 않습니다", wrap);
  }

  say(st.used ? "불이 잦아듭니다. 떠날 채비를 합니다."
    : (nearBoss ? "보스가 코앞입니다. 불을 쬐며 채비를 합니다." : "모닥불이 탁탁 튑니다. 쉬어 갈까요, 손을 익힐까요?")
      + (withShop ? " 골디가 옆에 좌판을 폈습니다." : ""));
  refresh();
  return s;
}

// ── 골디의 상점 ─────────────────────────────────────────────────────────
// 층마다 보스 앞에서 한 번. 골디(황금에서 태어난 용족 상인 · 교단 상점 담당)가 판다.
// 인물 사전 그대로: '고객님' 하고 부르고, 정품만 팔고, **할인은 웃으며 거절한다.** 말하다 말고 와작.
// 파는 것 — 교주 카드 셋(효과가 다 도는 것만) · 장비 셋 · 카드 제거 한 번. 새로고침하면 진열을 통째로 다시 굴린다.
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
    gift.appendChild(el("span", null, `실비아 몫의 선물 — 「${CARDS[shop.gift].name}」 ${josa(CARDS[shop.gift].name, "을를")} 덱에 넣었습니다`));
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
      ["neutral", "교주 카드", "교주님이 직접 쓰는 카드입니다 — 어느 사도의 것도 아닙니다 · 사도 스탯을 빌리지 않고 AP · 드로우 · 즉시 행동 · 정해진 % 버프와 디버프로 돕니다"],
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
      if (!slots.children.length) slots.appendChild(el("p", "sh-none", kind === "equip" ? "오늘은 진열할 장비가 없습니다." : "오늘은 진열할 교주 카드가 없습니다."));
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
      const why = R.rerollShop(run); writeSave(run);
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      sfx.play("shop.reroll"); say(pick(GOLDY.reroll)); act("reroll");
      fresh = true; draw();
    };
    acts.appendChild(rr);

    if (run.bag.length) {
      const bag = actBtn("sh-bag" + (bagNew ? " new" : ""), "가방", "사 둔 장비를 낍니다 · 바꿔 끼면 낀 것은 팔림", `${run.bag.length}점`);
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
      const why = R.buy(run, i); writeSave(run);
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      sfx.play("shop.buy");
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
    info.appendChild(el("span", "sh-grade g-" + (c.grade || ""), `${c.grade || "교주"} · 교주`));
    info.appendChild(el("p", "sh-blurb", c.blurb || shortText(c.text || "")));
    info.appendChild(buyBtn(it, i));
    slot.appendChild(info);
    soldMark(slot, it);
    return slot;
  }

  function equipSlot(it, i) {
    const slot = el("div", "sh-slot sh-equipslot" + (it.delivery ? " delivery" : ""));
    if (it.delivery) slot.appendChild(el("span", "sh-ribbon", "슈팡 택배"));
    const card = equipCard(it.id), buy = buyBtn(it, i);
    card.classList.add("eqtap");
    card.onclick = (ev) => {
      if (onButton(ev)) return;
      showEquip(it.id, { note: it.sold ? "팔렸습니다" : `골디의 값 ${it.price} 골드 — 사면 가방에 들어갑니다`, acts: it.sold ? [] : [{ label: it.delivery ? "택배 받기" : `${it.price} 골드로 삽니다`, run: () => buy.onclick() }] });
    };
    slot.appendChild(card);
    slot.appendChild(buy);
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
      const why = R.removeCard(run, id); writeSave(run);
      closeSheet();
      if (why) return why === "골드가 모자랍니다" ? poor() : say(why);
      sfx.play("shop.remove"); say(GOLDY.remove); act("remove"); draw();
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
    openSheet("sh-bagmodal", "가방", "끼기 · 바꿔 끼기(낀 것은 팔림) · 팔기 — 전투 밖이면 어디서든", wrap);
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
// 이벤트의 npc 가 사도가 아닐 때 — 스탠딩 스파인(assets/spine/standing/<spine>)과 구워 둔 한 장(tools/bake-npc.py).
// 겨우살이는 원작 폴더 noone(그 목소리가 「난 겨우살이야」). 정체는 말하지 않는다(docs/03)
const NPC_ART = { 겨우살이: { spine: "noone", still: MISTLETOE.still, sub: "꿈속의 다정한 목소리" } };
// C3 처럼 편지를 보낸 쪽이 그때그때 다른 이벤트 — 파티의 쓰러진 사도를 세운다
const FALLEN_NPC = "쓰러진 사도";
const stillImg = (src, alt) => {
  const box = el("div", "art art-event");
  const im = document.createElement("img"); im.src = src; im.alt = alt;
  im.onerror = () => { im.remove(); box.classList.add("art-ph"); box.textContent = alt.slice(0, 3); };
  box.appendChild(im);
  return box;
};

// 새 판(eventscreen2) — 상점 · 캠프와 같은 옷: 이 층의 이벤트 배경, 왼쪽에 나오는 사도의 스탠딩과 말풍선(장면), 오른쪽에 선택지.
// 선택지 · 결과에서 고를 것(카드 · 신탁 · 사도)은 모두 두 단계(twoStep) — 눌러 고르고 단추로 정한다.
export function eventScreen(run, onDone, onFight) {
  // 「HP ±N%」 는 파티 전원 — draw() 가 먼저 불리므로 const 가 아니라 함수 선언으로(전에는 선언 전 접근으로 이벤트가 멈췄다)
  function whoHp(t) { return String(t).replace(/(?<!최대 ?)HP ([+\-]\d+%)(?!\s*\()/g, "파티 전원 HP $1"); }
  const s = screen();
  s.className = "eventscreen2";
  sfx.play("event.open");
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

  // 무대 — 이벤트에 나오는 인물의 스탠딩. 사도(인물 사전 이름 → 사도 키) · 사도 아닌 인물(NPC_ART) ·
  // 「쓰러진 사도」(편지를 보낸 그 사도) · 어울리는 사도가 없으면 그 땅의 적(ev.foe). 아무것도 없으면 이벤트 표식
  function setStage(ev) {
    const id = ev ? ev.id : "fork";
    if (standFor === id) return;
    standFor = id;
    if (npcView) { npcView.dispose && npcView.dispose(); npcView = null; }
    stand.innerHTML = ""; stand.className = "ev2-stand"; plate.innerHTML = "";
    const mine = id;
    const down = ev && ev.npc === FALLEN_NPC ? run.party.find((k) => (run.hp[k] || 0) <= 0) : null;
    const npc = down || (ev && ev.npc && heroKeyByKo(ev.npc));
    const other = ev && ev.npc && NPC_ART[ev.npc];
    if (npc) {
      const ko = HERO(npc).ko;
      who.textContent = ko;
      plate.appendChild(el("b", null, ko));
      plate.appendChild(el("span", null, down ? "주말농장에서 쉬는 중" : `${HERO(npc).race || ""} · ${HERO(npc).nature || ""}`));
      spineView(stand, "standing", npc, { anim: "Idle_1", mix: 0.25 }).then((v) => {
        if (standFor !== mine) { v && v.dispose && v.dispose(); return; }
        if (!v) { stand.classList.add("still"); stand.appendChild(art.portrait(npc, { ko, tint: TINT(npc), size: 0, slot: "event", still: true })); return; }
        npcView = v; stand.classList.add("live");
        act(["Happy_1", "Smile_1", "Idle_1"]);
      });
    } else if (other) {
      who.textContent = ev.npc;
      plate.appendChild(el("b", null, ev.npc));
      plate.appendChild(el("span", null, other.sub));
      spineView(stand, "standing", other.spine, { anim: "Idle_1", mix: 0.25 }).then((v) => {
        if (standFor !== mine) { v && v.dispose && v.dispose(); return; }
        if (!v) { stand.classList.add("still"); stand.appendChild(stillImg(other.still, ev.npc)); return; }
        npcView = v; stand.classList.add("live");
      });
    } else if (ev && ev.foe && ENEMIES[ev.foe]) {
      // 어울리는 사도가 없는 사건 — 그 땅의 적(싸움터와 같은 모습 · 성격 스킨)을 조금 작게 세운다
      const look = foeLook(ev.foe), foe = ENEMIES[ev.foe];
      who.textContent = ev.name;
      stand.classList.add("foe");
      plate.appendChild(el("b", null, foe.ko));
      plate.appendChild(el("span", null, `${POOL_KO(ev.pool)} · ${ev.kind}`));
      spineView(stand, "enemy", look.art, { skin: look.skin }).then((v) => {
        if (standFor !== mine) { v && v.dispose && v.dispose(); return; }
        if (!v) { stand.classList.add("still"); stand.appendChild(art.portrait(ev.foe, { ko: foe.ko, tint: foe.tint, size: 0, slot: "foe", still: true })); return; }
        npcView = v; stand.classList.add("live");
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
    // 갈림길 · 선택지 · 고르는 것을 하나 고를 때마다 엔진(events.js)이 다 풀고 여기로 온다 — 그리기 전에 적어 둔다
    writeSave(run);
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
        b.appendChild(el("span", "ev2-out", whoHp(describe(opt))));
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
  // 누구의 HP 인지 — 기획서 결과 글의 맨 「HP -15%」 는 살아 있는 파티 전원에 걸린다(events.js apply). 「(그 사도)」 따위가 붙은 것 · 최대 HP 는 그대로
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
    const commit = (t) => { const w = EV.resolve(run, t); if (w) return hint(w); hint(""); if (t != null) sfx.play("reward.card"); act(["Happy_1", "Smile_1"]); draw(); };
    // face — 겨우살이의 축복 창이면 머리에 겨우살이의 얼굴을 붙인다
    const head = (t, why, face) => {
      const d = el("div", "ev2-sheethead" + (face ? " mt" : ""));
      const tx = face ? el("div") : d;
      if (face) { d.appendChild(mistletoeIcon("mtface")); d.appendChild(tx); }
      tx.appendChild(el("b", null, t)); if (why) tx.appendChild(el("span", null, why)); box.appendChild(d);
    };
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
        // 복제 — 덱에 1장만 카드는 못 고르고, 신탁 · 기적이 붙은 카드는 골드를 더 받는다
        const locked = p.k === "dupe" && !EV.dupeOk(id);
        const extra = p.k === "dupe" ? EV.dupeExtra(run, id) : 0;
        if (locked) { w.disabled = true; w.classList.add("off"); w.appendChild(el("span", "ev2-n", "1장만")); }
        else if (extra) w.appendChild(el("span", "ev2-n", `+${extra}골드`));
        w.appendChild(bigCard(c, CARDART.pic[id] || null));
        if (!locked) w.onclick = () => ts.pick(w, id, c.name);
        grid.appendChild(w);
      }
      box.appendChild(grid);
      box.appendChild(ts.bar);
    } else if (p.k === "shinPick") {
      // 기적 — 대가 없는 카드 강화. 덱에서 한 장을 골라 위력 ×1.3 이나 비용 -1 을 얹는다
      head("겨우살이의 축복", p.kind ? (p.kind === "cost" ? "덱에서 한 장 — 이 카드의 비용이 1 줄어듭니다" : "덱에서 한 장 — 이 카드의 피해가 ×1.3 이 됩니다") : "덱에서 한 장을 고르면, 그 카드에 맞는 축복 셋이 뜹니다", true);
      ts = twoStep(commit, { verb: "이 카드에 축복을 얹습니다" });
      const grid = el("div", "ev2-cards");
      for (const id of EV.shinAble(run, p.kind)) {
        const c = CARDS[id];
        const w = el("button", "ev2-card");
        w.appendChild(bigCard(c, CARDART.pic[id] || null));
        w.onclick = () => ts.pick(w, id, c.name);
        grid.appendChild(w);
      }
      box.appendChild(grid);
      ts.bar.appendChild(skipBtn());
      box.appendChild(ts.bar);
    } else if (p.k === "shinKind") {
      const c = CARDS[p.cardId];
      const nOpt = p.options.length;
      head("겨우살이의 축복", `「${c.name}」 에 얹을 축복 — ${nOpt > 1 ? `${["", "", "둘", "셋"][nOpt] || nOpt} 중 하나` : "이것 하나"}`, true);
      ts = twoStep(commit, { verb: "축복을 얹습니다" });
      const fr = el("div", "rrow flashrow");
      fr.appendChild(flashTarget(c, p.cardId));
      for (const k of p.options) {
        // 그 카드만의 축복(own · own1 · own2)은 이름과 글을 그대로, 공용 풀은 「이름 — 효과」 를 갈라서
        const own = RULES.blessOf(c, k);
        const [nm, eff] = own ? [own.ko, blessLine(own)] : RULES.shinLabel(c, k).split(" — ");
        const b = el("button", "fcard shin");
        const hd = el("div", "fhead2"); hd.appendChild(mistletoeIcon()); hd.appendChild(el("b", null, nm)); b.appendChild(hd);
        b.appendChild(el("p", "ftext2", eff));
        b.onclick = () => ts.pick(b, k, nm);
        fr.appendChild(b);
      }
      box.appendChild(fr);
      ts.bar.appendChild(skipBtn());
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
        else tag.appendChild(el("b", "sgrade g-" + (c.grade || ""), `${c.grade || "교주"} · 교주`));
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
      head("신탁", p.offer.swap ? `「${c.name}」의 신탁을 바꿉니다 — 남은 ${p.offer.picks.length}갈래 중 하나` : `「${c.name}」에 붙일 신탁 — 다섯 중 ${p.offer.picks.length === 5 ? "고르기" : "셋"}`);
      ts = twoStep(commit, { verb: "신탁을 붙입니다" });
      const fr = el("div", "rrow flashrow");
      fr.appendChild(flashTarget(c, p.offer.cardId, run));
      for (const n of p.offer.picks) {
        const f = (c.flash || [])[n - 1]; if (!f) continue;
        const b = el("button", "fcard f" + n);
        const hd = el("div", "fhead2");
        hd.appendChild(el("b", null, f.kind || f.ko));
        if (f.kind) hd.appendChild(el("span", "fko", f.ko));   // 자유 신탁은 이름이 머리
        b.appendChild(hd);
        b.appendChild(withKeywords(el("p", "ftext2"), shortText(f.text), c.hero));
        b.onclick = () => ts.pick(b, n, f.kind || f.ko);
        fr.appendChild(b);
      }
      box.appendChild(fr);
      if (run.event.shinChance && !run.noShin) box.appendChild(el("p", "ev2-note", `고르면 ${pctTxt(run.event.shinChance)} 확률로 겨우살이의 축복(피해 ×1.3)이 얹힙니다`));
      ts.bar.appendChild(skipBtn());
      box.appendChild(ts.bar);
    } else if (p.k === "pickHero" || p.k === "judgePick") {
      const t = p.k === "judgePick" ? `팔씨름에 나설 사도 — HP ${p.judge.at} 이상이면 이긴다` : p.then.k === "hp" ? "HP 가 바뀔 사도" : `최대 HP +${p.then.v} ${josa(String(p.then.v), "을를")} 받을 사도`;
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
  sfx.play(clear ? "victory" : "defeat");

  const bar = el("div", "dbar2");
  bar.appendChild(el("h1", "dtitle", clear ? "끝까지 갔습니다" : "여기까지"));
  const floor = R.currentFloor(run);
  bar.appendChild(el("span", "rwhy", clear
    ? `${과와(run.party.map((k) => HERO(k).ko).join(" · "))} 함께.`
    : R.finalOf(run) ? `${R.finalOf(run).name} · 마지막 싸움에서 멈췄습니다.`
    : `${floor.n}층 ${floor.name} · ${R.isBoss(run) ? "보스" : `${run.node + 1}번째 싸움`}에서 멈췄습니다.`));
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
      const fc = flashedCard(run, id);
      chip.appendChild(el("i", null, fc.xcost ? "X" : String(fc.cost)));
      chip.appendChild(el("span", null, c.name));
      if (run.flash && run.flash[id]) chip.appendChild(el("em", null, "신탁"));
      chip.title = fc.text;
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
