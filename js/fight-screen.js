// 전투 화면. 규칙은 combat.js 가 쥐고 있고, 여기는 그리고 누른 것을 넘긴다. 같이 쓰는 조각은 ui-common.js.
import { CARDS, flashed } from "./cardbook.js";
import { TRAITS } from "./data/traits.js";
import { ENEMIES } from "./data/enemies.js";
import { EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { cardParts, shortText } from "./card-text.js";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
import * as FX from "./run-fx.js";
import * as R from "./run.js";
import * as art from "./art.js";
import * as M from "./map.js";
import { getZoom } from "./stage.js";
import { settingsPanel } from "./settings-panel.js";
import { writeSave, saveOk } from "./save.js";
import { DEV } from "./dev.js";
import { spineView } from "./spine-view.js";
import { loadFx, preloadUltFx, playUltFx, ultImpactMs, ultLagMs, playFx, preloadFx } from "./fx-burst.js";
import { speak } from "./voice.js";
import { cardMotion } from "./data/card-motion.js";
import { HERO, TINT, NTINT, el, kwNote, hint, screen, TMARK, TKIND, goldIcon, openHelp, img, withKeywords, showCard, showPiles, natureClass, bigCard, effectBox, setStageBg, withNumbers, statText, equipIcon, emptySlotIcon, showEquip } from "./ui-common.js";

// 효과음 자리 — 전투 화면이 맞는 순간 · 고학년 · 카드 동작에 부른다. 효과음 모듈이 메서드를 갈아 끼운다(안 끼우면 조용하다).
//   hit(kind, heavy, crit)  맞는 순간마다 — kind 는 타격 갈래(slash 베기 · shot 쏘기 · magic 마법 · blunt 둔기), 받는 쪽은 kind 앞에 "ally:"
//   ult(heroKey, phase)     고학년 — "cast"(SD 동작 시작) · "impact"(첫 타격)
//   card(heroKey, anim)     카드 · 적의 수가 동작을 시작할 때 — anim 은 attack · skill
import { sfx as SFX } from "./sfx.js";
import { fxIcon, kwToken } from "./fx-icons.js";
// 효과음(js/sfx.js) — 맞는 소리는 land 가 SFX.land 로 직접 낸다(맞은 쪽 · 때린 쪽 · 고학년 · 크게 맞음을 다 안다).
// 사도 동작의 소리(카드 · 고학년)는 playBeats 가 SFX.action 으로 — 스파인 SFX 이벤트 시각에, 안 맞으면 시작 + 터지는 소리를 맞는 순간에 맞춰.
// 그래서 여기 ult 는 비워 둔다(채우면 두 번 난다)
export const sfxHook = {
  hit() {},
  ult() {},
  card() {},
};
const sfx = (k, ...a) => { try { sfxHook[k](...a); } catch (e) { /* 소리 탓에 몸짓이 멈추지 않게 */ } };

// 위치 — 기획서 낱말이다. 기본 스탯 표 머리가 "위치 · 역할" 이다.
const ROW_KO = { front: "전열", mid: "중열", back: "후열" };

// ── 전투 ───────────────────────────────────────────────────────────────
// 카제나의 전투 화면을 따라 네 구역으로 짠다 — 적 · 아군 상태창 · 손패 · 코스트 창.
// 손패는 사도 배치 순서를 따른다(앞줄 사도의 카드가 왼쪽에 온다).
// onQuit — 메뉴의 「메인화면으로」. 없으면 그 줄을 안 보인다
// opts.resume — 이어하기로 되살린 싸움(js/save.js). 그때는 새로 굴리지 않고, 전리품도 판에 적어 둔 것(run.reward)을 쓴다
export function fightScreen(run, onDone, onQuit, opts = {}) {
  const s = screen();
  s.classList.add("battle");
  const floor = R.currentFloor(run);
  // 싸움터 배경 — 층마다 한 장, 보스·이벤트 전투는 따로. 그림이 없으면(assets 는 저장소에 없다) 어두운 바탕이 남는다.
  setStageBg(s, run);
  // 전리품 — 싸움을 열 때 정해 둔다(골드 · 엘리트 · 보스의 장비). 적이 쓰러질 때마다 골드를 나눠 떨군다.
  // 보상 화면은 없다 — 떨어진 것은 오른쪽 「얻은 것」 목록에 쌓이고, 이기면 그대로 챙긴다.
  const resumed = opts.resume || null;
  const { st, loot } = resumed ? { st: resumed, loot: run.eventFight ? null : run.reward } : R.openFight(run);
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
  // 판의 마지막 싸움(마지막 층 너머 — run.js finalOf)은 층 이름 대신 그곳 이름
  const fin = !run.eventFight && R.finalOf(run);
  head.appendChild(el("span", "bwhere", fin ? fin.name : `${floor.n}층 · ${floor.name}`));
  const mapNode = M.currentNode(run);
  const stageTag = mapNode ? `${M.stageName(run, mapNode)} ${M.KIND_KO[mapNode.type]}` : `${run.node + 1}번째 싸움`;
  head.appendChild(el("span", "bsub", fin ? fin.sub : `${floor.sub} · ${run.eventFight ? `이벤트 — ${run.eventFight.name}` : R.isBoss(run) ? `${mapNode ? M.stageName(run, mapNode) + " " : ""}층의 끝` : stageTag}`));
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
  // 싸움터를 누른다 — 들고 있는 카드(고학년)가 대상이 없는 것이면 낸다. 대상을 고르는 것이면 누른 자리에서 가까운 대상(끌기와 같은 넉넉한 판정)
  field.onclick = (e) => {
    if (st.over || (selCard < 0 && !selUlt) || !e || !e.target || !e.target.closest || e.target.closest(".pile2, .foe, .stand")) return;
    const need = selCard >= 0 ? targetsNeeded(st.hand[selCard]) : ultNeed(selUlt);
    if (!need) return useSel(0);
    const t = pickTarget(e.clientX, e.clientY, need === "enemy" ? ".foe.tgt:not(.dead)" : ".stand.tgt:not(.dead)");
    if (t) useSel(Number(t.dataset.idx));
  };

  // 보스 체력 — 싸움터 위에 넓게. 판이 바뀌는 자리(phase.at · phase2.at)에 눈금, 「n/3단계」
  const bossBox = el("div", "bossbar");
  let bossHp = null;                        // { u, fill, lag, num } — showHp 가 맞는 순간에 같이 깎는다
  const phaseSeen = new Map();              // 적 idx → 본 단계(1 · 2 · 3) — 올라가면 큰 띠를 띄운다
  s.appendChild(bossBox);

  // ③ 고학년 게이지 — 파티 공용
  const gaugeBox = el("div", "gauge");
  const gaugeBar = el("div", "gbar");
  const gaugeFill = el("i");
  gaugeBar.appendChild(gaugeFill);
  // 비용 눈금 — 이 파티 사도들의 고학년 비용(150·200·250·300 가운데)만. 어디까지 차야 누가 쓸 수 있는지 한눈에 보인다
  const partyCosts = [...new Set(st.party.map((u) => (C.ultOf(u.key) || {}).cost).filter(Boolean))].sort((a, b) => a - b);
  for (const cost of partyCosts.length ? partyCosts : RULES.ULT_COSTS) {
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
  let selUlt = null;                        // 눌러서 고른 고학년(사도 key) — 대상을 누르면 쓴다
  let selHint = false;                      // 「대상을 누르거나 …」 를 띄워 두었나
  const goneFoes = new Set();              // 쓰러져 골드를 떨군 적 — 한 번만

  // ── 얻은 것 — 오른쪽 목록 ─────────────────────────────────────────────
  const lootBox = el("div", "lootbox");
  lootBox.appendChild(el("div", "lthead", "얻은 것"));
  const lootList = el("div", "ltlist");
  lootBox.appendChild(lootList);
  s.appendChild(lootBox);
  let lootGold = 0, goldRow = null;
  const ground = [];                        // 바닥에 떨어진 금화 { node, x, y, gold, taken }
  // 금화는 몸통(body)에 붙어서 화면을 갈아도 남는다 — 지거나 메인화면으로 나가거나 이어하기로 다시 열 때 걷는다
  const clearGround = () => { for (const c of ground) c.node.remove(); ground.length = 0; };
  if (typeof document === "object" && document.querySelectorAll) document.querySelectorAll(".groundcoin").forEach((n) => n.remove());
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
    const heroes = [...standEls.values()].filter((n) => !n.classList.contains("dead") && !n.classList.contains("falling"));
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
    row.onclick = () => showEquip(id, { note: "가방에 들어갑니다 — 전투가 끝나면 지도 · 캠프 · 상점에서 낍니다" });
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

  // ── 전투 모션 ────────────────────────────────────────────────────────
  // 엔진은 카드 · 고학년 스킬 · 턴 넘기기를 그 자리에서 다 풀고, 누가 움직이고(act) 맞고(hurt) 쓰러졌는지(die)를
  // st.fx 에 적어 둔다(combat.js cue). draw() 끝에서 그 순서대로 몸짓을 붙인다 — 판에는 아무 영향이 없다(저장도 뺀다).
  // 적의 턴은 엔진이 한꺼번에 푸니 적마다 조금씩 띄워 한 명씩 움직이게 보인다. 움직임 줄이기(calm)면 아무것도 안 한다
  st.fx = [];
  const FOE_MOOD = { 순수: "Naive", 광기: "Mad", 냉정: "Cool", 우울: "Gloomy", 활발: "Jolly" };   // 적의 공격 동작 끝말(Attack1_1_Mad 따위)
  const calmNow = () => typeof document === "object" && !!document.documentElement && document.documentElement.classList.contains("calm");
  const later = (ms, fn) => setTimeout(fn, ms);
  let fxEnd = 0;                            // 지금 붙인 몸짓이 다 끝나는 때(performance.now 기준)
  // 보이는 체력 — 엔진은 이미 다 깎았지만 막대 · 숫자는 맞는 순간까지 맞기 전 값을 보인다. 「side:idx」 → 체력.
  // 몸짓이 다 끝나면(settle) 비운다 — 그때부터는 판의 값 그대로. 움직임 줄이기면 아예 안 쓴다
  const shownHp = new Map();
  const bars = new Map();                   // 「side:idx」 → 체력 막대 { u, fill, lag, num } — draw 마다 새로
  const ukey = (u) => u.side + ":" + u.idx;
  const hpOf = (u) => (shownHp.has(ukey(u)) ? shownHp.get(ukey(u)) : Math.max(0, u.hp));
  let beatT = [];                           // 걸어 둔 몸짓 — 새 수가 오면 걷어 낸다(낡은 값이 늦게 덮지 않게)
  const beat = (ms, fn) => { beatT.push(setTimeout(fn, ms)); };
  function showHp(u, hp) {
    const b = bars.get(ukey(u));
    if (!b) return;
    const w = Math.max(0, (hp / u.maxHp) * 100) + "%";
    b.fill.style.width = w;
    b.lag.style.width = w;                  // 뒤처지는 막대 — css 가 잠깐 있다가 줄인다
    b.num.textContent = `${Math.max(0, hp)} / ${u.maxHp}`;
    if (bossHp && bossHp.u === u) {
      bossHp.fill.style.width = bossHp.lag.style.width = w;
      bossHp.num.textContent = `${Math.max(0, hp)} / ${u.maxHp}`;
    }
  }
  // 몸짓이 끝났다(또는 걷어 냈다) — 보이는 값을 판의 값으로
  function settle() {
    shownHp.clear();
    for (const [, b] of bars) showHp(b.u, Math.max(0, b.u.hp));
  }
  // draw() 머리에서 — 쌓인 쪽지를 꺼낸다. 새 수면 남은 몸짓을 걷고, 맞을 사람의 막대를 맞기 전 값에 붙든다
  function takeFx() {
    const q = st.fx.splice(0);
    const live = groundOk && !calmNow();
    if (!live || q.length) {
      for (const t of beatT) clearTimeout(t);
      beatT = [];
      try { SFX.stopPending(); } catch { /* 소리 */ }   // 걸어 둔 동작 소리도(새 수의 소리와 겹치지 않게)
      shownHp.clear();
      s.classList.remove("fxbusy");
      endCut(false);                        // 떠 있던 컷인도 걷는다 — 그 뒤 몸짓은 버린다(체력은 판의 값으로)
      dashStop(true);                       // 달려가 있던 사도는 제자리로
    }
    if (!live) return [];
    for (const e of q) if ((e.k === "hurt" || e.k === "heal") && e.from != null && !shownHp.has(e.side + ":" + e.idx)) shownHp.set(e.side + ":" + e.idx, e.from);
    return q;
  }
  const heroSwing = {};                     // 사도마다 공격 동작을 번갈아(Attack1_1 · Attack2_1)
  const unitNode = (side, idx) => {
    if (side === "enemy") return (foeEls.get(idx) || {}).n || null;
    const u = st.party.find((x) => x.idx === idx);
    return (u && standEls.get(u.key)) || null;
  };
  const artOf = (n) => (n && n.querySelector(":scope > .art")) || null;
  // 움직이는 그림 — 새로 만드는 중이면(첫 그림은 불러오느라 늦다) 조금 기다린다. 그림 한 장이면 null
  // 마지막으로 본 그림 — 「side:idx」 → 스파인 손잡이. 카드를 내면 칸이 새로 그려져 그림이 조금 늦게 붙는데, 몸짓 · 때리는 순간은
  // 그 전에(playBeats) 정해야 한다. 동작 이름 · 길이 · 이벤트는 자료라 앞의 손잡이로도 잰다(planAct)
  const seenView = new Map();
  function viewOf(side, idx, wait = 400) {
    return new Promise((res) => {
      const t0 = Date.now();
      const look = () => {
        const a = artOf(unitNode(side, idx));
        if (a && a.spine) { seenView.set(side + ":" + idx, a.spine); return res(a.spine); }
        if (!a || !a.classList.contains("art-spine") || Date.now() - t0 > wait) return res(null);
        setTimeout(look, 40);
      };
      look();
    });
  }
  // 조각 — base_1 → base_2(_Loop) … 를 잇되, 목소리 · 표시(1000003 스킬 · 1000004 고학년)부터 다시 시작하는 조각은 이어지는 것이 아니라
  // 다른 갈래다(앨리스 불 · 번개 · 바람, 에피카 셋, 나이아 스킬 넷 — 다 이으면 16초 · 30초를 돌았다). 갈래들 [[조각 …], …]
  function waysOf(v, base) {
    const parts = [];
    for (let k = 1; k < 30; k++) {
      const n = [`${base}_${k}`, `${base}_${k}_Loop`].find((x) => v.has(x));
      if (!n) break;
      parts.push(n);
    }
    const fresh = (n) => (v.events ? v.events(n) : []).some((e) => e.time < 0.15
      && ((e.name === "Voice" && e.s === "1") || /(^|,)100000[34](,|$)/.test(e.s)));
    const ways = [];
    for (const n of parts) if (!ways.length || fresh(n)) ways.push([n]); else ways[ways.length - 1].push(n);
    return ways;
  }
  // 동작 이름 — 고유 이름(Attack1_1)이 없고 _Full 로만 있는 사도도 있다(네티)
  const animIn = (v, n) => (v.has(n) ? n : v.has(n + "_Full") ? n + "_Full" : null);
  function actName(v, side, idx, anim, card) {
    if (side === "enemy") {
      // 끝말 — 성격(Attack1_1_Mad), 성격이 없으면 입은 스킨(누루링 Skin_Elf → Attack1_1_Elf · 보스 Skin_None → _None).
      // 안 찾으면 첫 Attack1_1_* 로 떨어져 엘프 누루링이 용족(Dragon) 동작을 했다
      const e = st.enemies.find((x) => x.idx === idx), E = e && ENEMIES[e.key];
      const mood = e && (FOE_MOOD[ENEMY_NATURE[e.key]] || (E && E.skin ? E.skin.replace(/^Skin_/, "") : null));
      const all = v.animations();
      const find = (base) => (mood && v.has(`${base}_${mood}`) ? `${base}_${mood}` : all.find((n) => n.toLowerCase().startsWith(base.toLowerCase())));
      return [anim === "skill" ? find("Skill1_1") || find("Attack1_1") : find("Attack1_1") || find("Skill1_1")];
    }
    if (anim === "ult" && v.has("Ultimate1_1")) {
      // 조각을 잇되(에르핀 1_1 → 1_2_Loop → 1_3) 갈래는 하나를 골라 그것만
      const ways = waysOf(v, "Ultimate1");
      const i = Math.floor(Math.random() * ways.length);
      return [ways[i][0], ways[i].slice(1), { i, n: ways.length }];
    }
    // 카드 — 무엇을 하는 카드인지 보고 동작 · 소리 갈래를 고른다(js/data/card-motion.js). 스킬은 첫 갈래의 조각을 이어서(바롱 1_1 → 1_2_Loop → 1_3)
    if (card) {
      const u = st.party.find((x) => x.idx === idx);
      const m = cardMotion(card, { role: ((u && HERO(u.key)) || {}).role, key: u && u.key, has: (n) => !!animIn(v, n) });
      const name = m.anim && animIn(v, m.anim);
      if (name) {
        const chain = /^Skill1_1$/.test(name) ? (waysOf(v, "Skill1")[0] || []).slice(1) : [];
        return [name, chain, null, m];
      }
      if (m.tier !== "light" && m.tier !== "heavy" && m.tier !== "sig") return [null, null, null, m];   // 제자리 — 몸짓 없이 종류 소리만
    }
    if (anim === "attack") {
      const n = (heroSwing[idx] = (heroSwing[idx] || 0) + 1);
      const pick = n % 2 === 0 && v.has("Attack2_1") ? "Attack2_1" : "Attack1_1";
      return [v.has(pick) ? pick : "Skill1_1"];
    }
    return [v.has("Skill1_1") ? "Skill1_1" : "Attack1_1"];
  }
  // 몸짓을 건다 — 정해 둔 것(plan)이 없으면 그림이 붙은 지금 정한다(카드를 내면 칸이 새로 그려져 스파인이 조금 늦게 붙는다).
  // 쓴 것을 돌려준다 — 소리(SFX.action)도 같은 동작 · 같은 시각으로 맞춘다. 그림 한 장이면 null
  async function actFx(e, plan) {
    const v = await viewOf(e.side, e.idx);
    if (!v) return null;
    const p = plan || planAct(e) || { act: actName(v, e.side, e.idx, e.anim, e.card) };
    const [name, chain] = p.act;
    if (!name) return p;
    v.play(name, false, chain, { from: p.from ? p.from * v.duration(name) : 0 });
    // 긴 동작(승리 춤)은 앞만 — 그 동작이 아직이면 쉬는 동작으로
    if (p.cut) later(p.cut, () => { if (v.current() === name) v.toRest(); });
    // 움직이는 동안은 옆 칸 위에 그린다 — 양산 · 분수처럼 옆 사도 칸으로 넘어간 그림이 그 사도 밑에 깔리지 않게
    const n = unitNode(e.side, e.idx);
    if (n) {
      const ms = p.cut || Math.min(4000, 1000 * [name, ...[].concat(chain || [])].reduce((t, a) => t + (v.duration(a) || 0), 0));
      n.classList.add("acting");
      clearTimeout(n.actingT);
      n.actingT = later(ms, () => n.classList.remove("acting"));
    }
    return p;
  }
  // 때리는 순간(ms, 동작 시작에서) — 원작 스파인 이벤트로 짐작한다. 이벤트 이름은 Event · SFX · Voice · NextAni 뿐이고
  // 값은 게임 표의 번호라 뜻은 모른다. 둘째 효과음(SFX 2 …)이 처음 나는 때를 맞는 순간으로 본다(아멜리아 레이저 1.30초 · 공격 0.67초).
  // 없으면 이 사도만의 첫 Event(1000003 · 1000004 처럼 10000xx 는 모두가 쓰는 표시라 뺀다), 그것도 없으면 첫 조각 길이의 45%.
  // 고리(_Loop)가 있으면 그동안은 날아가는 사이라 그 뒤 조각에서 찾는다(에르핀은 내려찍는 1_3 의 첫소리).
  // marks — 그 뒤 이 사도만의 Event · SFX 시각들(여러 번 때리는 창), end — 그 끝(길어야 2.6초 뒤), total — 동작 전체 길이.
  // fixAt(ms) 을 주면 때리는 순간은 그것 — 달려가 닿는 고학년(DASH)은 닿는 때가 타격이다
  function strikeOf(v, names, fixAt) {
    if (!v || !v.events) return null;
    let off = 0, from = 0;
    const evs = [];
    for (const n of names) {
      for (const e of v.events(n)) evs.push({ ...e, t: off + e.time });
      off += v.duration(n);
      if (/_loop$/i.test(n)) from = off;
    }
    const own = (e) => e.name === "Event" && e.s.split(",").some((x) => +x >= 1000100);
    const late = evs.filter((e) => e.t >= from - 1e-3);
    const hit = late.find((e) => e.name === "SFX" && (+e.s >= 2 || from > 0)) || late.find(own);
    const at = fixAt != null ? Math.round(fixAt) : Math.round(1000 * (hit ? hit.t : v.duration(names[0]) * 0.45));
    const marks = [...new Set(late.filter((e) => (own(e) || e.name === "SFX") && e.t * 1000 >= at - 1).map((e) => Math.round(e.t * 1000)))];
    const end = Math.min(marks.length ? marks[marks.length - 1] : at, at + 2600);
    return { at, end, marks: marks.filter((m) => m <= end), total: Math.round(off * 1000) };
  }
  // 이 차례의 몸짓을 미리 정한다 — 동작 이름(갈래) · 때리는 순간. 그림이 아직 없으면 null(예전처럼 그 자리에서 고른다)
  function planAct(e) {
    const a = artOf(unitNode(e.side, e.idx));
    if (!a || !a.classList.contains("art-spine")) return null;
    const v = a.spine || seenView.get(e.side + ":" + e.idx);
    if (!v || !v.events) return null;
    const [name, chain0, pick, motion] = actName(v, e.side, e.idx, e.anim, e.card);
    if (!name) return motion ? { act: [null, null], motion, snd: null } : null;
    const hero = e.side === "party" && e.anim === "ult" ? st.party.find((x) => x.idx === e.idx) : null;
    const dc = hero ? DASH[hero.key] : null;
    let chain = chain0;
    if (dc && dc.loop && chain) chain = chain.flatMap((n) => Array(dc.loop[n] || 1).fill(n));
    const names = [name, ...(chain || [])];
    // 동작 안의 한 순간(ms, 동작 시작에서) — [조각 이름, 초]. 그 조각이 이번 갈래에 없으면 null
    const when = (p) => {
      let off = 0;
      for (const n of names) { if (n === p[0]) return Math.round(1000 * (off + p[1])); off += v.duration(n); }
      return null;
    };
    const go = dc ? when(dc.go) : null, hit = dc ? when(dc.hit) : null;
    const dash = go != null && hit != null && hit > go ? { go, hit, cfg: dc } : null;
    // 사도 소리 — 그 동작의 소리 갈래와 SFX(n) 이벤트(ms, 동작 시작에서 — 고리를 여러 번 돌리면 그만큼 늦은 조각의 시각)
    const group = e.side !== "party" ? null : e.anim === "ult" ? "ult" : motion ? motion.group : e.anim === "attack" ? (/^Attack2/.test(name) ? "power" : "attack") : "skill";
    let snd = null;
    if (group) {
      const evs = [];
      let off = 0;
      for (const n of names) {
        for (const x of v.events(n)) if (x.name === "SFX" && +x.s > 0) evs.push({ n: +x.s, t: Math.round(1000 * (off + x.time)) });
        off += v.duration(n);
      }
      snd = { group, evs };
    }
    // 승리 동작처럼 긴 것은 앞만(cut) — 때리는 순간 · 끝도 그 안에서 잰다
    const cut = motion && motion.cut ? motion.cut : 0;
    const from = motion && motion.from ? motion.from : 0;     // 등장 동작은 뛰어드는 앞부분을 건너뛴다
    return { act: [name, chain], pick, dash, s: strikeOf(v, names, dash ? hit : null), snd, motion, cut, from };
  }
  // 맞음 — 피격 동작이 있으면 그것(사도 Hit · 적 Hit1_1)에 붉은 번쩍임, 없으면 흔들림까지. 다른 동작 도중이면 끊지 않는다
  const whiteT = {};                       // 「side:idx」 → 흰 실루엣을 띄운 때
  async function hitFx(e) {
    const v = await viewOf(e.side, e.idx, 200);
    const a = artOf(unitNode(e.side, e.idx));
    if (!a) return;
    const cur = (v && v.current()) || "";
    const hit = v && /^(idle|groggy)|^$/i.test(cur) ? ["Hit", "Hit1_1"].find((n) => v.has(n)) : null;
    if (hit) v.play(hit);
    const cls = hit ? "fxflash" : "fxhit";
    // 흰 실루엣은 한 번 — 몰아치는 타격(고학년 레이저)마다 하얗게 뜨면 맞는 내내 하얀 덩어리로 보였다. 220ms 안의 다음 타격은 붉게만
    const now = performance.now(), k = e.side + ":" + e.idx;
    const quiet = now - (whiteT[k] || -1e9) < 220;
    if (!quiet) whiteT[k] = now;
    a.classList.remove("fxhit", "fxflash", "fxquiet");
    void a.offsetWidth;                     // 같은 표시를 다시 달아도 처음부터 돌게
    a.classList.add(cls);
    if (quiet) a.classList.add("fxquiet");
    later(450, () => a.classList.remove(cls, "fxquiet"));
  }
  // 회복 · 방어 · 실드를 받은 몸 — 초록 · 푸른 빛이 한 번 감싸고, 회복이면 빛 알갱이가 떠오른다
  function glowFx(e, cls) {
    const n = unitNode(e.side, e.idx), a = artOf(n);
    if (!a) return;
    a.classList.remove("fxheal", "fxguard");
    void a.offsetWidth;
    a.classList.add(cls);
    later(650, () => a.classList.remove(cls));
    if (cls !== "fxheal" || !field.getBoundingClientRect || !a.getBoundingClientRect) return;
    const r = a.getBoundingClientRect(), fr = field.getBoundingClientRect(), z = zNow();
    for (let i = 0; i < 6; i++) {
      const m = el("i", "fxmote");
      m.style.left = ((r.left + r.width * (0.25 + Math.random() * 0.5) - fr.left) / z) + "px";
      m.style.top = ((r.top + r.height * (0.55 + Math.random() * 0.3) - fr.top) / z) + "px";
      m.style.animationDelay = (i * 60) + "ms";
      field.appendChild(m);
      later(1000 + i * 60, () => m.remove());
    }
  }
  // 쓰러짐 — Die 를 마지막 자세로 붙들고, 다 쓰러진 뒤에 원래대로 사라진다(적) · 흐려진다(사도)
  async function dieFx(e) {
    const n = unitNode(e.side, e.idx);
    const v = await viewOf(e.side, e.idx, 200);
    const ms = v && v.play("Die", false, null, { hold: true }) ? Math.min(1400, v.duration("Die") * 1000) : 0;
    later(ms, () => {
      if (!n || !n.classList.contains("falling")) return;
      n.classList.remove("falling");
      n.classList.add(e.side === "enemy" ? "dying" : "dead");
    });
  }
  // 기절한 적은 Groggy 로 비틀거린다 — 풀리면 쉬는 동작으로
  function syncGroggy() {
    for (const u of st.enemies) {
      if (u.dead) continue;
      viewOf("enemy", u.idx, 1500).then((v) => {
        if (!v || !v.has("Groggy")) return;
        const cur = v.current() || "";
        if (u.sealed && /^idle/i.test(cur)) v.play("Groggy", true);
        else if (!u.sealed && /^groggy/i.test(cur)) v.toRest();
      });
    }
  }
  // 떠오르는 숫자 — 피해 · 회복 · 방어 · 실드 · 상태. 싸움터(.field)에 붙인다(칸은 draw 마다 새로 그려진다).
  // 꾸밈 이름은 n- 을 붙인다 — .ally(아군 상태창) · .heal 따위와 겹치면 그쪽 자리 잡기가 묻어 왔다
  // 한 사람에게 잇달아 뜨면(여러 번 때리기) 좌우로 번갈아 부채꼴로 벌린다 — 숫자 폭만큼 비켜서 「10」 「10」 이 「110」 으로 붙어 읽히지 않게.
  // 꼬리표(방어 · 실드 · 상태)는 따로 센다(아래 줄이라 피해 숫자와 안 겹친다)
  const popK = {};
  const sttAt = new Map();          // 사람 | 꼬리표 → 마지막으로 띄운 때(land 가 같은 것을 거듭 띄우지 않게)
  // ic — 꼬리표 앞 아이콘(fx-icons, 칩과 같은 그림)
  function popNum(u, text, cls, sub, ic) {
    const n = unitNode(u.side, u.idx);
    if (!n || !field.getBoundingClientRect) return;
    const a = artOf(n) || n, r = a.getBoundingClientRect(), fr = field.getBoundingClientRect(), z = zNow();
    const tag = /n-(blk|shd|guard|stt)/.test(cls);
    const k = ukey(u) + (tag ? "t" : ""), now = performance.now();
    const p0 = popK[k] && now - popK[k].t < 900 ? popK[k].n + 1 : 0;
    popK[k] = { n: p0, t: now };
    const p = el("div", "fxnum " + cls);
    if (sub) p.appendChild(el("small", null, sub));
    const b = el("b", null, text);
    if (/n-crit/.test(cls)) b.appendChild(el("i", "nburst"));
    if (ic) b.insertBefore(ic, b.firstChild);
    p.appendChild(b);
    // 방어 · 실드 · 상태 글자는 조금 아래에 — 같은 순간의 피해 숫자를 덮지 않게
    const at = tag ? 0.58 : 0.32;
    const fs = /n-crit/.test(cls) ? 44 : /n-big/.test(cls) ? 40 : 30;
    const w = tag ? Math.max(70, String(text).length * 11 + 20 + (ic ? 18 : 0)) :String(text).length * fs * 0.62 + 22;   // 꼬리표는 글자 수만큼(「받는 피해 +25%」)
    const side = p0 % 2 ? 1 : -1, step = Math.ceil(p0 / 2);
    p.style.left = ((r.left + r.width / 2 - fr.left) / z + side * step * w) + "px";
    p.style.top = ((r.top + r.height * at - fr.top) / z - step * (tag ? 18 : 22)) + "px";
    if (!tag) p.style.setProperty("--rot", ((Math.random() * 2 - 1) * 7).toFixed(1) + "deg");
    field.appendChild(p);
    later(1100, () => p.remove());
  }
  // 멈칫(히트스톱) — 맞은 쪽의 스파인을 잠깐 멈춘다. 때린 쪽은 카드 한 장에 한 번만(land), 고학년은 안 멈춘다 —
  // 여러 번 맞는 고학년마다 때린 쪽을 다시 멈춰, 아멜리아가 레이저 내내 굳어 있다가 끝나서야 총을 들었다
  function stopFx(side, idx, ms) {
    const a = artOf(unitNode(side, idx));
    if (a && a.spine && a.spine.pause) a.spine.pause(ms);
  }
  // 싸움터 흔들림 — 0 약 · 1 중 · 2 강(고학년). 손패 · 버튼은 안 흔들린다
  function shake(lv) {
    field.classList.remove("shk0", "shk1", "shk2");
    void field.offsetWidth;
    field.classList.add("shk" + lv);
    later(lv === 2 ? 260 : 200, () => field.classList.remove("shk" + lv));
  }

  // ── 적의 차례 — 누가 무엇을 하는지 먼저 보인다(2026-10 「적 차례가 1초 만에 지나가 누가 누굴 때렸는지 모른다」) ──
  const TELL = 300, TELL_FIRST = 640;
  function foeTell(act, first) {
    const n = unitNode("enemy", act.idx), a = artOf(n);
    if (first) {
      const ban = el("div", "foeban");
      ban.appendChild(el("b", null, "적의 차례"));
      field.appendChild(ban);
      later(1000, () => ban.remove());
    }
    if (!n) return;
    n.classList.remove("foeact");
    void n.offsetWidth;
    n.classList.add("foeact");
    later(900, () => n.classList.remove("foeact"));
    if ((!act.say && !act.rush) || !(a || n).getBoundingClientRect || !field.getBoundingClientRect) return;
    const r = (a || n).getBoundingClientRect(), fr = field.getBoundingClientRect(), z = zNow();
    const tag = el("div", "foesay" + (act.rush ? " rush" : "") + (["attack", "back", "attackAll", "multi"].includes(act.t) ? " hit" : ""));
    if (act.rush) tag.appendChild(el("small", null, "⚡ 즉시 행동"));
    if (act.say) tag.appendChild(el("b", null, act.say));
    tag.style.left = ((r.left + r.width / 2 - fr.left) / z) + "px";
    tag.style.top = ((r.top + r.height * 0.12 - fr.top) / z) + "px";
    field.appendChild(tag);
    later(1150, () => tag.remove());
  }
  // 아군이 맞으면 싸움터 가장자리가 붉게 — 세게 맞으면 짙게
  function vignette(heavy) {
    const v = el("div", "fxvig" + (heavy ? " big" : ""));
    field.appendChild(v);
    later(heavy ? 520 : 380, () => v.remove());
  }
  // 연타 — 한 차례에 같은 적을 두 번 넘게 치면 「N HIT」 를 그 적 옆에 붙여 센다
  function comboTag(u, n) {
    const node = unitNode(u.side, u.idx), a = artOf(node);
    if (!node || !(a || node).getBoundingClientRect || !field.getBoundingClientRect) return;
    const k = "combo:" + ukey(u);
    let tag = comboEls.get(k);
    if (!tag || !tag.isConnected) {
      tag = el("div", "fxcombo");
      field.appendChild(tag);
      comboEls.set(k, tag);
    }
    const r = (a || node).getBoundingClientRect(), fr = field.getBoundingClientRect(), z = zNow();
    tag.style.left = ((r.right - r.width * 0.12 - fr.left) / z) + "px";
    tag.style.top = ((r.top + r.height * 0.22 - fr.top) / z) + "px";
    tag.innerHTML = "";
    tag.appendChild(el("b", null, String(n)));
    tag.appendChild(el("small", null, "HIT"));
    tag.classList.remove("bump");
    void tag.offsetWidth;
    tag.classList.add("bump");
    clearTimeout(tag.t);
    tag.t = later(900, () => { tag.remove(); comboEls.delete(k); });
  }
  const comboEls = new Map();
  // 겨우살이의 축복이 붙은 카드를 냈다 — 주인 머리 위에 금빛 ✦ 와 그 축복 이름
  function blessFx(card, sh) {
    if (!card || !sh || !groundOk || calmNow()) return;
    const u = card.hero ? st.party.find((x) => x.key === card.hero) : null;
    if (!u) return;
    const name = (RULES.shinLabel(card, sh) || "").split(" — ")[0];
    popNum(u, `✦ ${name || "겨우살이의 축복"}`, "n-stt n-bless");
    const p = bodyOf("party", u.idx);
    if (p && field.getBoundingClientRect) {
      const fr = field.getBoundingClientRect(), z = zNow();
      const g = el("div", "fxbless");
      g.style.left = ((p.x - fr.left) / z) + "px";
      g.style.top = ((p.y - p.h * 0.2 - fr.top) / z) + "px";
      field.appendChild(g);
      later(900, () => g.remove());
    }
  }

  // ── 타격 임팩트 — 원작 타격 이펙트 · 밀려남 · 흰 번쩍임(css .fxhit/.fxflash 첫 두 프레임) · 화면 번쩍 · 카메라 당김 · 내딛기 ──
  // 움직임 줄이기면 runFx 가 아예 안 불러 여기까지 안 온다. 그림을 옮기는 것은 transform 낱개 속성(translate · scale)과
  // opacity 뿐이다 — 달리기(dashTick)가 쓰는 style.translate 와는 composite "add" 로 더해진다
  // 원작 공용 타격 이펙트(prefab/prefabeffecthit) — Unity 로 구운 판(assets/fx-baked · tools/fx-baked.py), 없으면 조용히 빠진다.
  // 갈래마다 겹쳐 트는 몇 장. 원작 가산 · 디졸브 셰이더 그대로 구워 노랑 · 하늘빛 툰 불꽃이다
  //   slash 베기(물리 근접) — 노란 발톱 불꽃 + 빗금 · shot 쏘기(물리 원거리) — 노란 별 · magic 마법 — 하늘빛 빛망울(마고 타격) + 하늘빛 불꽃
  //   blunt 둔기(덩치 큰 적) — 별 + 부스러기 · big 세게 맞음 덧불(고리 터짐 — 둔기는 툰 폭발) · crit 치명타 덧불(노랑 · 주홍 터짐)
  const HIT_FX = {
    slash: ["fx_common_hit_3_m", "fx_common_hit_slash_3"], shot: ["fx_common_hit_1_m"],
    magic: ["fx_mago_hit_1", "fx_common_hit_4_m"], blunt: ["fx_common_hit_2_m"],
    big: ["fx_common_hit_22"], bigBlunt: ["fx_common_hit_explosion_1_m"], crit: ["fx_common_hit_shockwave_1"],
  };
  const FOE_MAGIC = /(wizard|supporter|longrange|wisps|magicfork|drone)/;
  const FOE_BLUNT = /(tanker|bear|golem|oldtree|ginseng|marshmallow|imoogi|curburus|pumpkin|snail|nependers|cranker|buseuleogi)/;
  // 때린 쪽 → 타격 갈래. 사도는 원작 공격 타입(물리 · 마법)과 서는 줄(뒷줄 물리는 총 · 활), 적은 이름(원거리 · 마법 · 덩치)
  function hitKind(act) {
    if (!act) return "slash";
    if (act.side === "enemy") {
      const e = st.enemies.find((x) => x.idx === act.idx);
      const k = (e && e.key) || "";
      return FOE_MAGIC.test(k) ? "magic" : FOE_BLUNT.test(k) ? "blunt" : "slash";
    }
    const u = st.party.find((x) => x.idx === act.idx);
    if (!u) return "slash";
    const d = HERO(u.key) || {};
    return d.dmgType === "마법" ? "magic" : u.row === "back" ? "shot" : "slash";
  }
  // 싸움을 열고 처음 몸짓을 걸 때 시트를 받아 둔다 — 첫 타격이 그림을 기다리지 않게
  let hitReady = false;
  function preloadHits() {
    if (hitReady || !groundOk || calmNow()) return;
    hitReady = true;
    loadFx().then((ok) => ok && preloadFx([...new Set(Object.values(HIT_FX).flat())])).catch(() => {});
  }
  // 몸 가운데(화면 좌표) — 그림 칸의 가로 가운데, 세로는 위에서 58%(발밑 그림자 · 머리 위 빈칸을 뺀 몸통)
  function bodyOf(side, idx) {
    const a = artOf(unitNode(side, idx));
    if (!a || !a.getBoundingClientRect) return null;
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.58, w: r.width, h: r.height };
  }
  // 불꽃 — 맞은 자리에 조금씩 흩어 튼다. 사도가 맞으면 좌우를 뒤집는다(적 쪽에서 날아온 타격).
  // 덧불은 치명타 · 세게 맞음 · 고학년의 첫 타격에만(여러 번 때리는 고학년이 매번 고리를 터뜨리면 어지럽다)
  function sparkFx(h, act, heavy, crit, ult, first) {
    const p = bodyOf(h.side, h.idx);
    const kind = hitKind(act);
    if (!p) return kind;
    const flip = h.side === "party";
    const x = p.x + (Math.random() * 2 - 1) * p.w * 0.12, y = p.y + (Math.random() * 2 - 1) * p.h * 0.1;
    const sc = (ult ? 1.1 : 0.95) * (crit ? 1.25 : heavy ? 1.12 : 1);
    const go = (names, k, dy = 0) => { for (const n of names) playFx(n, { x, y: y + dy, scale: k, flip }).catch(() => {}); };
    go(HIT_FX[kind], sc);
    if (crit) go(HIT_FX.crit, 0.95);
    else if (heavy || (ult && first)) go(kind === "blunt" ? HIT_FX.bigBlunt : HIT_FX.big, ult ? 1.05 : 0.9, 4);
    return kind;
  }
  // 밀려남 — 때린 쪽 반대로 휙 밀렸다가 튕겨 돌아온다. 센 만큼 멀리 · 길게
  function knock(side, idx, px, ms) {
    const a = artOf(unitNode(side, idx));
    if (!a || !a.animate) return;
    const d = side === "enemy" ? 1 : -1;
    a.animate([
      { translate: "0px 0px" },
      { translate: `${(d * px).toFixed(1)}px ${(-px * 0.18).toFixed(1)}px`, offset: 0.16, easing: "cubic-bezier(.3,.6,.4,1)" },
      { translate: `${(-d * px * 0.18).toFixed(1)}px 0px`, offset: 0.62, easing: "ease-in-out" },
      { translate: "0px 0px" },
    ], { duration: ms, composite: "add" });
  }
  // 화면 번쩍 — 싸움터 위에 한두 프레임 얇게. lines 면 맞은 자리로 모이는 집중선(고학년)
  function bang(p, tint, alpha, ms, lines) {
    if (!field.getBoundingClientRect) return;
    const fr = field.getBoundingClientRect(), z = zNow();
    const x = p ? ((p.x - fr.left) / z).toFixed(0) + "px" : "50%", y = p ? ((p.y - fr.top) / z).toFixed(0) + "px" : "50%";
    const f = el("div", "fxbang");
    f.style.cssText = `--x:${x};--y:${y};--c:${tint};--a:${alpha};--ms:${ms}ms`;
    field.appendChild(f);
    later(ms + 40, () => f.remove());
    if (!lines) return;
    const l = el("div", "fxlines");
    l.style.cssText = `--x:${x};--y:${y}`;
    field.appendChild(l);
    later(300, () => l.remove());
  }
  // 카메라 당김 — 맞은 자리 쪽으로 싸움터를 살짝 키웠다가 풀어 준다. 몰아치는 타격(고학년 여러 번)은 110ms 에 한 번만
  let punchT = 0;
  function punch(p, k, ms) {
    const now = performance.now();
    if (!p || !field.animate || now - punchT < 110) return;
    punchT = now;
    const fr = field.getBoundingClientRect(), z = zNow();
    field.style.transformOrigin = `${((p.x - fr.left) / z).toFixed(0)}px ${((p.y - fr.top) / z).toFixed(0)}px`;
    field.animate([{ scale: "1" }, { scale: String(k), offset: 0.14, easing: "cubic-bezier(.2,.7,.3,1)" }, { scale: "1" }], { duration: ms });
  }
  // 내딛기 — 때리는 순간(hitIn ms 뒤)에 맞춰 앞으로 한 걸음 디뎠다가 물러난다. 근접일수록 크게, 마법 · 원거리는 살짝
  function lunge(act, hitIn) {
    const a = artOf(unitNode(act.side, act.idx));
    if (!a || !a.animate) return;
    const kind = hitKind(act);
    const px = act.side === "enemy" ? (kind === "magic" ? 8 : 20) : kind === "slash" ? 22 : kind === "magic" ? 10 : 7;
    const d = act.side === "enemy" ? -1 : 1;
    const go = Math.max(60, hitIn), hold = 70, back = 210, all = go + hold + back;
    a.animate([
      { translate: "0px 0px" },
      { translate: `${(-d * px * 0.15).toFixed(1)}px 0px`, offset: (go * 0.35) / all, easing: "cubic-bezier(.5,0,.9,.5)" },
      { translate: `${d * px}px 0px`, offset: go / all },
      { translate: `${d * px}px 0px`, offset: (go + hold) / all, easing: "cubic-bezier(.3,.1,.3,1)" },
      { translate: "0px 0px" },
    ], { duration: all, composite: "add" });
  }
  // 달려가 부딪치는 고학년 — 원작은 SD 를 스크립트로 옮기고 스파인에는 제자리 동작만 있다. 그래서 싸움터 위에서 그림(.art)을 옮긴다.
  //   go · hit — [조각, 초]. go 부터 달려 hit 에 닿는다 — 닿는 때가 타격(폭발 · 숫자 · 멈칫). loop — 고리 조각을 몇 번 돌리나(달리는 사이)
  //   reach — 앞으로 뻗은 본(에르핀 Point_Ult1 — 원작 폭발 자리). 그 본이 적 몸 앞에 오도록 멈춘다. 없으면 그림 폭의 35%
  //   hop — 달리지 않고 뛰어올라 화면 밖에 있는 사이에 옮긴다(에르핀_왕도 — 1_1 끝에 뛰고 1_2 에 내려찍는다)
  //   back — 동작이 다 끝나면 돌아서서(Move) 제자리로 뛰어오는 시간(ms)
  // 에르핀 「돌겨어어어!!! 억⋯?」 — 1_1 끝에서 달리기 시작, 1_2_Loop 두 바퀴 동안 달려 1_3(부딪쳐 나동그라짐) 첫 프레임에 닿는다
  const DASH = {
    에르핀: { go: ["Ultimate1_1", 0.85], hit: ["Ultimate1_3", 0], loop: { Ultimate1_2_Loop: 2 }, reach: "Point_Ult1", back: 560 },
    에르핀_왕도: { go: ["Ultimate1_1", 1.96], hit: ["Ultimate1_2", 0.93], hop: true, reach: "FX_Punch", back: 560 },
  };
  // 총구 — 시전자 쪽 모으기 · 레이저가 붙을 본. [본, 끝(본 길이만큼 앞)]. 표에 없으면 이름(MUZZLE_RE)으로 찾고, 그것도 없으면 TUNE 의 dx · dy
  // 아멜리아 — Weapon_main7 끝이 총신 끝(뼈대 126개 중 Weapon_main1~11 · Point_Skill1 · Point_Cast1/2 · Point_Attack1~4 를 대어 보았다)
  const MUZZLE = { 아멜리아: ["Weapon_main7", true] };
  const MUZZLE_RE = /(muzzle|barrel)/i;
  const feetOf = (a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - r.height * 0.06 }; };
  // 지금 달리는 사도 — { idx, t0, go, hit, ret, end, dx, dy, hop, turned, raf }. 그림은 draw 마다 새로 붙어 매 프레임 그 사도의 칸을 찾아 옮긴다
  let dash = null;
  // 달리기를 건다 — 동작 시작(actFx)과 같은 때. 처음 자리와 닿는 자리(화면 좌표)를 돌려준다 — 이펙트가 거기 터진다
  function dashGo(b, plan) {
    dashStop(true);
    const d = plan && plan.dash;
    const u = d && st.party.find((x) => x.idx === b.act.idx);
    const a = u && artOf(unitNode("party", u.idx));
    if (!a || !a.getBoundingClientRect) return null;
    // 처음 맞는 적, 없으면 가장 가까운 적
    const h = b.hits.find((x) => x.side === "enemy");
    const arts = st.enemies.filter((e) => !e.dead).map((e) => artOf(unitNode("enemy", e.idx))).filter(Boolean);
    const ea = (h && artOf(unitNode("enemy", h.idx))) || arts.sort((p, q) => feetOf(p).x - feetOf(q).x)[0];
    if (!ea) return null;
    const from = feetOf(a), er = ea.getBoundingClientRect(), ef = feetOf(ea);
    // 닿는 자리 — 적 몸 앞쪽(그림 칸 왼쪽 1/3). 뻗은 본이 거기 오도록 발을 세운다
    const contact = { x: er.left + er.width * 0.32, y: ef.y };
    const bone = d.cfg.reach && a.spine && a.spine.boneScreen ? a.spine.boneScreen(d.cfg.reach) : null;
    let reach = bone ? bone.x - from.x : a.getBoundingClientRect().width * 0.35;
    reach = Math.max(0, Math.min(reach, (contact.x - from.x) * 0.6));
    const z = zNow();
    const total = plan.s ? plan.s.total : d.hit + 1000;
    dash = { idx: u.idx, t0: performance.now(), go: d.go, hit: d.hit, ret: total, end: total + d.cfg.back,
      dx: (contact.x - reach - from.x) / z, dy: (ef.y - from.y) / z, hop: !!d.cfg.hop, turned: false, raf: 0 };
    dash.raf = requestAnimationFrame(dashTick);
    return { from, to: contact };
  }
  function dashTick() {
    const d = dash;
    if (!d) return;
    d.raf = 0;
    const ms = performance.now() - d.t0;
    if (ms >= d.end) { dashStop(false); return; }
    let f = 0;
    if (ms >= d.hit && ms < d.ret) f = 1;
    else if (ms > d.go && ms < d.hit) {
      // 달리기는 점점 빨라지다 들이받는다. 뛰어올라 옮기는 것(hop)은 화면 밖이라 고르게
      const k = (ms - d.go) / (d.hit - d.go);
      f = d.hop ? k : k * k * (1.6 - 0.6 * k);
    } else if (ms >= d.ret) {
      const k = (ms - d.ret) / (d.end - d.ret);
      f = 1 - k * k * (3 - 2 * k);
      // 돌아서서 뛰어온다 — 쉬는 동작이 붙기 전에 Move 로
      if (!d.turned) { d.turned = true; viewOf("party", d.idx, 0).then((v) => { if (v && dash === d && v.has("Move")) v.play("Move", true); }); }
    }
    const n = unitNode("party", d.idx), a = artOf(n);
    if (a) { a.style.translate = `${(d.dx * f).toFixed(1)}px ${(d.dy * f).toFixed(1)}px`; a.style.scale = d.turned ? "-1 1" : ""; }
    if (n) n.classList.add("dashing");
    d.raf = requestAnimationFrame(dashTick);
  }
  // 그만 — 제자리로. snap 이면 새 수가 와서 걷는 것이라 하던 동작도 쉬는 동작으로 돌린다(끝까지 돌았으면 Move 만 걷는다)
  function dashStop(snap) {
    const d = dash;
    if (!d) return;
    dash = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    const n = unitNode("party", d.idx), a = artOf(n);
    if (a) { a.style.translate = ""; a.style.scale = ""; }
    if (n) n.classList.remove("dashing");
    const v = a && a.spine;
    if (v && (snap ? /^(Ultimate|Move)/i : /^Move/i).test(v.current() || "")) v.toRest();
  }

  // 고학년 — 컷인(cutIn)이 이름을 보인 뒤라, SD 가 움직이는 동안 배경만 잠깐 어둡게 한다. 타격은 SD 동작 시작에서 ULT_HIT 뒤
  const ULT_HIT = 500;
  function ultFx() {
    const shade = el("div", "ultshade");
    field.appendChild(shade);
    later(900, () => shade.remove());
  }
  // 고학년 컷인 — 화면이 어두워지고 비스듬한 띠가 지나가며, 그 안에 스탠딩(상반신)이 들어와 표정을 짓고 스킬 이름이 찍힌다.
  // 원작에는 사도마다의 컷인이 없어 스탠딩 스파인으로 만든다. 다 끝나거나(CUT) 누르면 go — SD 고학년 동작과 타격이 이어진다.
  // 새 수가 오면(takeFx) go 없이 걷힌다. 판에는 아무것도 안 남긴다(저장 · 이어하기와 무관)
  const CUT = 1300;
  // 원작 고학년 이펙트(assets/fx — 없으면 조용히 빠진다). 자리는 발밑 — 시전자에서 처음 맞는 적(없으면 적 가운데)으로.
  // 달려가는 고학년(rush — dashGo 가 준 것)이면 시전자가 처음 서 있던 자리에서 부딪치는 자리로
  function ultBurst(b, plan, rush) {
    const u = st.party.find((x) => x.idx === b.act.idx);
    if (!u) return;
    const feet = (side, idx) => {
      const a = artOf(unitNode(side, idx));
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom - r.height * 0.06 };
    };
    const from = feet("party", u.idx);
    const h = b.hits.find((x) => x.side === "enemy");
    let to = h ? feet("enemy", h.idx) : null;
    if (!to) {
      const ps = st.enemies.filter((e) => !e.dead).map((e) => feet("enemy", e.idx)).filter(Boolean);
      to = ps.length ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length } : from;
    }
    // SD 이벤트를 알면 그 순간에 맞춰 튼다. 위끝은 싸움터 위끝 — 높이 짜인 이펙트가 화면 꼭대기로 나가지 않게
    const sync = plan && plan.s ? { impact: plan.s.at, end: plan.s.end, marks: plan.s.marks, pick: plan.pick } : {};
    const fr = field.getBoundingClientRect ? field.getBoundingClientRect() : null;
    // 총구 — 표의 본, 없으면 이름으로 찾은 본. 그림이 다시 그려져도(draw) 그 사도의 지금 그림에서 잰다
    const sv = (artOf(unitNode("party", u.idx)) || {}).spine;
    let mz = MUZZLE[u.key] || null;
    if (!mz && sv && sv.skeleton) { const bn = sv.skeleton.bones.find((x) => MUZZLE_RE.test(x.data.name)); if (bn) mz = [bn.data.name, false]; }
    const muzzle = mz && sv && sv.boneScreen ? () => {
      const v = (artOf(unitNode("party", u.idx)) || {}).spine || sv;
      return v.boneScreen ? v.boneScreen(mz[0], mz[1]) : null;
    } : null;
    const at = rush ? { from: rush.from, to: rush.to, dash: true } : { from, to };
    if (at.from) playUltFx(u.key, { ...at, top: fr ? fr.top + 24 : undefined, muzzle, ...sync }).catch(() => {});
  }
  let cut = null;                           // 떠 있는 컷인 { node, t, go }
  function endCut(go) {
    if (!cut) return;
    const c = cut;
    cut = null;
    clearTimeout(c.t);
    c.node.remove();                        // 스탠딩 캔버스도 같이 떨어진다 — spine-view 의 pool 로 돌아가 다음 컷인에 다시 쓴다
    if (go) c.go();
  }
  // 표정 — 성격마다 먼저 볼 동작 앞머리. 없으면 기본 차례로. 이름은 Angry_1 · Angry · Angry_10 처럼 섞여 있어 앞머리로 찾고 번호가 작은 것
  const CUT_MOOD = { 광기: ["Angry", "Mad", "Laugh"], 활발: ["Laugh", "Happy", "Angry"], 냉정: ["Serious", "Angry", "Proud"],
    순수: ["Happy", "Smile", "Angry"], 우울: ["Serious", "Angry"] };   // 우울도 Sad 는 뺀다 — 고학년 순간에 기운 빠진 얼굴이 된다
  const CUT_BASE = ["Angry", "Serious", "Proud", "Happy", "Smile", "Laugh"];
  function cutAnim(v, key) {
    const names = v.animations();
    const num = (n) => +((n.match(/(\d+)$/) || [0, 0])[1]);
    for (const base of [...(CUT_MOOD[C.natureOf(key)] || []), ...CUT_BASE]) {
      const re = new RegExp("^" + base + "(?:_?[0-9]+)?$", "i");
      const hit = names.filter((n) => re.test(n)).sort((a, b) => num(a) - num(b))[0];
      if (hit) return hit;
    }
    return null;
  }
  function cutIn(act, go) {
    // 컷인에는 효과음을 넣지 않는다 — 사도의 고학년 대사(speak)만(2026-10 사용자)
    const u = st.party.find((x) => x.idx === act.idx);
    if (!u) return go();
    endCut(false);
    const node = el("div", "cutin");
    node.style.setProperty("--tint", u.tint || TINT(u.key));
    node.style.setProperty("--ntint", NTINT[C.natureOf(u.key)] || "#f6d58e");
    node.style.setProperty("--cut", CUT + "ms");
    node.appendChild(el("div", "cband"));
    const fig = el("div", "cfig"), pic = el("div", "cpic");
    fig.appendChild(pic);
    node.appendChild(fig);
    const txt = el("div", "ctext");
    txt.appendChild(el("small", null, "고학년 스킬"));
    txt.appendChild(el("b", null, act.name || (C.ultOf(u.key) || {}).ko || ""));
    txt.appendChild(el("span", null, u.ko));
    node.appendChild(txt);
    node.onclick = (e) => { e.stopPropagation(); endCut(true); };
    s.appendChild(node);
    cut = { node, go, t: setTimeout(() => endCut(true), CUT) };
    // 그림 — 스탠딩 스파인(상반신) → 이벤트 자리 그림 한 장(없으면 SD · 이름)
    const still = () => pic.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "event", still: true }));
    if (art.slotOf(u.key, "event") === "standing") {
      // 처음 쓰는 스탠딩은 받고 GPU 에 올리느라 컷인(1.3초)을 다 먹기도 한다 — 0.25초 안에 안 오면 그림 한 장을 먼저 두고, 오면 바꾼다
      const slow = setTimeout(() => { if (node.isConnected && !pic.spine) still(); }, 250);
      spineView(pic, "standing", u.key, { bust: 0.78 }).then((v) => {
        clearTimeout(slow);
        const st1 = pic.querySelector(":scope > .art");
        if (!v) { if (node.isConnected && !st1) still(); return; }
        if (st1) st1.remove();
        const a = cutAnim(v, u.key);
        if (a) v.play(a, true);
        else v.toRest();
        pic.spine = v; pic.dataset.anim = a || "";   // 시험 도구가 무슨 표정인지 본다
      }, () => {});
    } else still();
    loadFx().then((ok) => ok && preloadUltFx(u.key)).catch(() => {});   // 이펙트 그림을 컷인 동안 받아 둔다
    // 고학년 대사 — 목소리 음량이 0 이면 speak 이 그냥 물러난다
    speak(u.key, ["ultimate", "shout", "anger"], () => s.isConnected, { repeat: true }).catch(() => {});
  }
  // 맞는 순간 — 막대를 깎고(뒤처지는 막대가 따라온다) 숫자를 띄우고, 세게 맞았으면 멈칫 · 흔들림
  function land(h, act, b) {
    try {
      const by = act && (act.side === "party" ? st.party : st.enemies).find((x) => x.idx === act.idx);
      const t = (h.side === "enemy" ? st.enemies : st.party).find((x) => x.idx === h.idx);
      SFX.land(h, { hero: act && act.side === "party" && by ? by.key : null, enemy: act && act.side === "enemy" && by ? by.key : null,
        ult: !!act && act.anim === "ult", heavy: !!t && h.k === "hurt" && h.v >= t.maxHp * 0.25, group: (act && act.group) || null });
    } catch { /* 소리 탓에 몸짓이 멈추지 않게 */ }
    if (h.k === "die") return dieFx(h);
    const u = (h.side === "enemy" ? st.enemies : st.party).find((x) => x.idx === h.idx);
    if (!u) return;
    if (h.k === "hurt" || h.k === "heal") { shownHp.set(ukey(u), h.to); showHp(u, h.to); }
    if (h.k === "hurt") {
      hitFx(h);
      const ult = !!act && act.anim === "ult", heavy = h.v >= u.maxHp * 0.25;
      if (!h.v) { popNum(u, `막음 ${h.guard}`, "n-guard"); knock(h.side, h.idx, 4, 140); sfx("hit", (h.side === "party" ? "ally:" : "") + "guard", false, false); return; }
      const kill = !!h.kill && h.side === "enemy";
      popNum(u, String(h.v), "n-dmg" + (h.side === "party" ? " n-ally" : "") + (h.crit ? " n-crit" : "") + (heavy || kill ? " n-big" : "") + (kill ? " n-kill" : ""),
        h.crit ? "치명타" : kill ? "처치" : null);
      if (h.side === "party") vignette(heavy);
      if (h.side === "enemy" && b && act && act.side === "party") {
        b.combo = b.combo || {};
        const ck = ukey(u), cn = (b.combo[ck] = (b.combo[ck] || 0) + 1);
        if (cn >= 2) comboTag(u, cn);
      }
      // 끝내는 한 방은 길게 멈춘다(고학년이 아니어도) — 쓰러뜨렸다는 손맛
      const ms = kill ? 190 : Math.min(140, 70 + (heavy ? 25 : 0) + (h.crit ? 25 : 0) + (ult ? 30 : 0));
      stopFx(h.side, h.idx, ms);
      if (act && !ult && b && !b.stopped) { b.stopped = true; stopFx(act.side, act.idx, ms); }
      if (ult) shake(2); else if (heavy || h.crit || kill) shake(1); else if (h.side === "party") shake(0);
      // 불꽃 · 밀려남 — 맞을 때마다. 화면 번쩍 · 당김은 세게 · 치명타 · 고학년만(고학년의 첫 타격은 사도 빛깔에 집중선까지)
      const kind = sparkFx(h, act, heavy, h.crit, ult, ult && b && !b.banged);
      knock(h.side, h.idx, Math.min(14, 6 + (heavy ? 4 : 0) + (h.crit ? 3 : 0) + (ult ? 3 : 0)), Math.min(190, 130 + (heavy || h.crit ? 30 : 0) + (ult ? 25 : 0)));
      const p = (heavy || h.crit || ult || kill) && bodyOf(h.side, h.idx);
      if (ult && b && !b.banged) {
        b.banged = true;
        const hero = st.party.find((x) => x.idx === act.idx);
        bang(p, (hero && (hero.tint || TINT(hero.key))) || "#fff", 0.6, 110, true);
        punch(p, 1.045, 240);
      } else if (ult) punch(p, 1.02, 160);
      else if (h.crit) { bang(p, "#fff4d0", 0.36, 70); punch(p, 1.035, 190); }
      else if (kill) { bang(p, "#ffffff", 0.42, 80); punch(p, 1.04, 220); }
      else if (heavy) { bang(p, h.side === "party" ? "#ffb0a0" : "#ffffff", 0.35, 60); punch(p, 1.025, 180); }
      sfx("hit", (h.side === "party" ? "ally:" : "") + kind, heavy || ult, !!h.crit);
    } else if (h.k === "heal") { popNum(u, `+${h.v}`, "n-heal"); glowFx(h, "fxheal"); }
    else if (h.k === "block") { popNum(u, `방어 +${h.v}`, "n-blk", null, fxIcon("방어")); glowFx(h, "fxguard"); }
    else if (h.k === "shield") { popNum(u, `실드 +${h.v}`, "n-shd", null, fxIcon("실드")); glowFx(h, "fxguard"); }
    else if (h.k === "status") {
      // 같은 꼬리표가 같은 사람에게 잇달면(한 수에 같은 증감이 두 번 · 패시브가 겹쳐 걸림) 한 번만
      const k = ukey(u) + "|" + h.id, t0 = performance.now();
      if (t0 - (sttAt.get(k) || -1e9) < 450) return;
      sttAt.set(k, t0);
      // 아이콘 — 증감(h.mod)은 칩과 같은 그림에 ▲▼, 상태는 그 그림, 사도 키워드(「초청객 +1」)는 금빛 동전
      const w0 = String(h.id).split(" ")[0];
      const ic = h.mod ? fxIcon(h.mod, /\s-\d/.test(h.id) ? "down" : "up") : fxIcon(w0) || ((st.kw || {})[w0] ? kwToken(w0) : null);
      popNum(u, h.id, "n-stt" + (h.up ? " n-up" : ""), null, ic);
    }
  }
  // draw() 끝에서 — 꺼내 둔 쪽지(takeFx)로 몸짓을 차례로 건다. 한 사람이 여러 번 맞으면 100ms 씩 띄운다
  function runFx(q) {
    if (!groundOk || calmNow()) return;
    preloadHits();
    if (!q.length) { syncGroggy(); return; }
    const beats = [];
    for (const e of q) {
      if (e.k === "act" || !beats.length) beats.push({ act: e.k === "act" ? e : null, hits: [] });
      if (e.k !== "act") beats[beats.length - 1].hits.push(e);
      // 쓰러진 자리는 그 차례가 올 때까지 남겨 둔다 — 안 그러면 몸짓보다 먼저 사라진다
      if (e.k === "die") {
        const n = unitNode(e.side, e.idx);
        if (n && n.classList.contains(e.side === "enemy" ? "dying" : "dead")) { n.classList.remove("dying", "dead"); n.classList.add("falling"); }
      }
    }
    // 끝내는 한 방 — 같은 차례에 쓰러지는 사람의 마지막 피해(land 가 멈칫 · 숫자를 키운다)
    for (const b of beats) for (const d of b.hits) if (d.k === "die") {
      const last = [...b.hits].reverse().find((h) => h.k === "hurt" && h.side === d.side && h.idx === d.idx);
      if (last) last.kill = true;
    }
    playBeats(beats, 0);
  }
  // i0 번째 차례부터 지금을 0 으로 건다. 사도의 고학년 차례를 만나면 컷인을 띄우고 그 뒤는 시각만 잰다 —
  // 컷인이 끝나면(눌러 넘기면 바로) 그 차례부터 다시 건다. 새 수가 오면 걸어 둔 것과 함께 버려진다
  function playBeats(beats, i0) {
    let t = 0, foes = false, cutAt = -1, told = false;
    for (let i = i0; i < beats.length; i++) {
      const b = beats[i];
      const foe = !!b.act && b.act.side === "enemy", ult = !!b.act && b.act.anim === "ult";
      // 적의 수 — 먼저 그 적이 앞으로 나서며 무엇을 하는지 머리 위에 띄우고(foeTell), 그다음에 움직인다.
      // 턴 끝의 첫 적이면 「적의 차례」 띠를 함께(즉시 행동은 「⚡ 즉시 행동」 으로 대신)
      if (foe && cutAt < 0 && !b.told) {
        b.told = true;
        const first = !told && !b.act.rush;
        told = true;
        beat(t, () => foeTell(b.act, first));
        t += first ? TELL_FIRST : TELL;
      }
      if (ult && !foe && !b.cut && cutAt < 0) {
        b.cut = true;
        cutAt = t;
        beat(t, () => cutIn(b.act, () => playBeats(beats, i)));
        t += CUT;
      }
      const go = cutAt < 0;
      foes = foes || (go && foe);
      // 몸짓과 때리는 순간은 SD 스파인 이벤트로(planAct · strikeOf). 컷인 앞에서 재기만 하는 차례는 고르지 않는다(넘긴 뒤 다시 건다)
      const plan = b.act && go ? planAct(b.act) : null, t0 = t;
      const s = plan && plan.s;
      const hero = ult && !foe ? (st.party.find((x) => x.idx === b.act.idx) || {}).key : null;
      if (b.act) b.act.group = plan && plan.snd ? plan.snd.group : null;     // 맞는 소리 갈래(land → SFX.land)
      if (b.act && go) beat(t, () => {
        const shown = actFx(b.act, plan && plan.act[0] ? plan : null);
        const at0 = performance.now();
        if (ult) {
          ultFx();
          if (!foe) {
            ultBurst(b, plan, dashGo(b, plan));
            // 고학년 효과음(시전 · 터지는 소리)은 내지 않는다 — 고학년은 사도 대사만 들린다(2026-10 사용자). 맞는 소리는 land 가 낸다
          }
        } else {
          const pk = b.act.side === "party" ? (st.party.find((x) => x.idx === b.act.idx) || {}).key : null;
          sfx("card", pk, b.act.anim);
          if (foe) try { SFX.enemy((st.enemies.find((x) => x.idx === b.act.idx) || {}).key, b.act.anim === "attack" ? "attack" : "skill"); } catch { /* 소리 */ }
          // 카드 — 고른 동작의 소리 갈래(평타 · 강화 평타 · 스킬)를 그 동작의 SFX 이벤트대로(동작이 실제로 시작한 때부터).
          // 갈래가 없으면(방어 · 승리 · 등장 · 제자리) 카드 종류 소리. 그림 한 장(스파인 없음)이면 예전처럼 휘두르는 소리 · 종류 소리
          else if (pk && b.act.card) {
            shown.then((p) => {
              const sn = p && p.snd;
              if (p) b.act.group = sn ? sn.group : null;
              if (sn && sn.group) SFX.action(pk, sn.group, sn.evs, { cast: sn.group, v: 0.85 });
              else if (p) SFX.play("card." + b.act.card.type);
              else SFX.card(b.act.card, pk);
            }).catch(() => {});
          }
        }
      });
      // 고학년 타격은 SD 가 쏘는/때리는 순간(+ 투사체가 날아가는 동안)에. 이벤트를 모르면 원작 이펙트가 터지는 때(충전 · 투사체만큼 늦게) — 이펙트도 없으면 ULT_HIT.
      // 카드는 그 공격 동작의 때리는 순간(0.2~0.7초 안으로 — 손맛이 늘어지지 않게), 모르면 220ms
      const lag = hero && s ? ultLagMs(hero, plan.pick) : 0;
      const boom = hero && !s ? ultImpactMs(hero) : 0;
      const hitAt = t + (!b.act ? 0 : ult ? (s ? s.at + lag + 60 : Math.max(ULT_HIT, boom + 120)) : s ? Math.max(200, Math.min(700, s.at)) : 220);
      // 한 사람이 여러 번 맞으면 — 고학년은 이벤트가 이어지는 창(아멜리아 레이저 1.3~3.6초)에 나눠, 아니면 100ms 씩
      const many = {}, nth = {};
      for (const h of b.hits) { const k = h.side + ":" + h.idx; many[k] = (many[k] || 0) + 1; }
      const nthAt = (k, i) => {
        const n = many[k];
        if (!ult || !s || n < 2 || s.end <= s.at) return hitAt + i * 100;
        if (s.marks.length >= n) return hitAt + s.marks[Math.round((i * (s.marks.length - 1)) / (n - 1))] - s.at;
        return hitAt + Math.round((i * Math.max(100 * (n - 1), s.end - s.at)) / (n - 1));
      };
      // 내딛기 — 카드 · 적의 공격이 맞은편을 칠 때만(고학년은 제 동작 · 달리기가 있다). 때리는 순간에 앞발이 닿게
      if (go && b.act && !ult && b.hits.some((h) => h.k === "hurt" && h.side !== b.act.side)) {
        const lead = Math.min(110, hitAt - t);
        beat(hitAt - lead, () => lunge(b.act, lead));
      }
      let last = hitAt;
      for (const h of b.hits) {
        const k = h.side + ":" + h.idx;
        nth[k] = (nth[k] == null ? -1 : nth[k]) + 1;
        const at = nthAt(k, nth[k]);
        last = Math.max(last, at);
        if (go) beat(at, () => land(h, b.act, b));
      }
      t = last + (foe ? 460 : 120);
      // 고학년 동작이 타격 뒤에도 조금 남으면(마무리 자세) 그만큼은 기다린다 — 이긴 판의 Victory 가 끊지 않게. 길어야 0.6초
      if (ult && s) t = Math.max(t, Math.min(t0 + s.total, last + 600));
      // 달려간 고학년은 그 자리에서 동작을 다 하고(에르핀 「억⋯?」) 제자리로 돌아올 때까지
      if (ult && s && plan.dash) t = Math.max(t, t0 + s.total + plan.dash.cfg.back);
    }
    fxEnd = performance.now() + t;          // 이긴 판(cheerFx)이 기다릴 몫 — 컷인이 있으면 그 길이까지
    const end = cutAt < 0 ? t : cutAt;
    // 적이 차례로 움직이는 동안만 손패 · 턴 넘기기를 잠근다(끝나면 바로 푼다)
    if (foes && end > 600) { s.classList.add("fxbusy"); beat(end, () => s.classList.remove("fxbusy")); }
    if (cutAt < 0) beat(t + 60, () => { settle(); syncGroggy(); });
  }
  // 싸움을 열 때 — 모두 등장 동작(이어하기로 다시 그릴 때는 안 한다).
  // 그림은 앞 싸움의 것을 다시 쓰기도 해서(spine-view 의 pool) 쓰러진 · 달리던 자세가 남아 있을 수 있다 — 쉬는 동작으로 돌려 둔다
  function openFx(fresh) {
    try {
      SFX.preload(["card.play", "hit.slash", "hit.magic", "hit.small", "hit.crit", "hurt", "block.gain", "heal", "ult.cutin",
        ...st.party.map((u) => "hero:" + u.key), ...st.enemies.map((e) => "enemy:" + e.key)]);
      if (fresh) SFX.play(st.enemies.some((e) => e.boss) ? "boss.entry" : "battle.start");
    } catch { /* 소리 */ }
    if (!groundOk) return;
    preloadHits();
    const spawn = fresh && !calmNow();
    // 보스 · 엘리트 — 위아래 검은 띠가 내려오고 이름이 찍힌다(보스는 흔들림까지). 손은 막지 않는다
    const boss = st.enemies.find((e) => e.boss && !e.dead);
    if (spawn && (boss || run.elite)) {
      const box = el("div", "bossintro" + (boss ? "" : " elite"));
      box.style.setProperty("--tint", (boss && (boss.tint || (ENEMIES[boss.key] || {}).tint)) || "#ff5a5a");
      box.appendChild(el("i", "bitop")); box.appendChild(el("i", "bibot"));
      const t = el("div", "bitext");
      t.appendChild(el("small", null, boss ? "BOSS" : "ELITE"));
      t.appendChild(el("b", null, boss ? boss.ko : "강적 출현"));
      box.appendChild(t);
      s.appendChild(box);
      if (boss) later(420, () => shake(2));
      later(2100, () => box.remove());
    }
    for (const u of [...st.party, ...st.enemies]) {
      if (u.dead) continue;
      viewOf(u.side, u.idx, 4000).then((v) => {
        if (!v) return;
        // 등장은 몸이 칸 둘레(캔버스) 안에 들어온 때부터 — 보스는 멀리서 날아 들어와 앞부분이 잘려 보였다(spine-view reachOf)
        if (spawn && v.play("Spawn", false, null, { from: (v.spawnFrom ? v.spawnFrom() : 0) * v.duration("Spawn") })) return;
        if (!/^(idle|groggy)/i.test(v.current() || "")) v.toRest();
      });
    }
  }
  // 이겼다 — 남은 몸짓이 끝나면 살아남은 사도들이 Victory. 걸어 나가기까지 얼마나 기다리면 되는지 돌려준다
  function cheerFx() {
    if (!groundOk || calmNow()) return 0;
    const wait = Math.max(0, fxEnd - performance.now()) + 150;
    // 막 다시 그린 칸이라 그림(el.spine)은 조금 뒤에 붙는다 — 움직이는 그림인지(art-spine)만 보고 기다릴 몫을 정한다
    let any = false;
    for (const u of st.party) {
      const a = !u.dead && artOf(unitNode("party", u.idx));
      if (!a || !a.classList.contains("art-spine")) continue;
      any = true;
      later(wait, () => viewOf("party", u.idx).then((v) => v && v.play("Victory", false, null, { hold: true })));
    }
    later(wait, () => { try { SFX.play("victory"); } catch { /* 소리 */ } });
    return any ? wait + 1500 : wait;
  }

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
      const icon = INTENT_ICON[it.t] || "·";
      const tag = el("div", "intent i-" + (hit ? "hit" : it.t));
      const gem = el("span", "igem");
      gem.appendChild(el("b", null, hit ? (it.t === "multi" ? `${hitV}×${it.n}` : String(hitV)) : icon));
      tag.appendChild(gem);
      // 마름모 옆은 아이콘 · 숫자만 — 말(「몸으로 민다」)은 올리면 뜨는 풀이와 적 정보 창으로 옮겼다(넷이면 서로 덮었다).
      // 치는 수는 마름모가 숫자라 옆에 아이콘(전체는 「전체」 까지), 아닌 수는 마름모가 아이콘이라 옆에 값
      const nx = it.next || {};
      const side = it.t === "charge" ? `→${INTENT_ICON[nx.t] || ""}${nx.v != null ? nx.v : ""}`
        : hit ? (it.t === "attackAll" ? "✹전체" : icon) : it.v != null && it.v !== "" ? String(it.v) : "";
      if (side) tag.appendChild(el("span", "iside", side));
      const more = it.t === "attackAll" ? " · 전체" : it.t === "back" ? " · 뒷줄" : it.t === "guard" ? " · 적 전체"
        : it.t === "charge" ? ` → 다음 턴 ${nx.say} ${nx.v}${nx.t === "attackAll" ? " 전체" : ""}`
        : it.id && hit ? ` · ${it.id} ${it.n || 1}` : "";
      tag.title = `「${it.say}」${more}\n${INTENT_HELP[it.t] || ""}`;
      // 즉시 행동 — 이 수가 예고된 뒤로 카드를 N장 내면 당겨서 한다(수마다 N 이 다르다). 다음 한 장이면 붉게
      const rn = C.rushOf(u);
      if (rn && !u.sealed && u.rushedTurn) {
        const rush = el("span", "rush done", "⚡끝");
        rush.title = "이번 턴에는 이미 즉시 행동했습니다 — 다음 턴까지 당겨지지 않습니다";
        tag.appendChild(rush);
      } else if (rn && !u.sealed) {
        const k = u.rushCnt || 0;
        const rush = el("span", "rush" + (k === rn - 1 ? " hot" : ""), `⚡${k}/${rn}`);
        rush.title = `카드를 ${rn - k}장 더 내면 이 수를 즉시 합니다`;
        tag.appendChild(rush);
      }
      // 적 정보 — 작은 ⓘ. 카드를 든 채 적을 누르면 카드가 나가니, 정보는 여기 · 길게 누르기 · 오른쪽 클릭으로
      const info = el("button", "finfo", "i");
      info.title = "적 정보";
      info.setAttribute("aria-label", `${u.ko} 정보`);
      info.onclick = (e) => { stopEv(e); openFoe(u); };
      tag.appendChild(info);
      n.appendChild(tag);
    }

    const nat = (ENEMY_NATURE[u.key] || null);
    n.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: u.boss ? 148 : 116, slot: "foe", skin: NATURE_SKIN[nat] }));

    // 이름은 칸 폭에서 자른다(…) — 셋 넷이면 짧은 이름(shortFoe). 온 이름은 올리면 · 정보 창에
    const name = el("div", "fname");
    const nm = el("span", "fnm", shortFoe(u.ko, st.enemies.length));
    name.title = u.ko;
    name.appendChild(nm);
    if (nat) name.appendChild(el("span", "nature n" + nat, nat));
    n.appendChild(name);

    const hb = hpBar(u);
    n.appendChild(hb);
    n.appendChild(chips(u));
    // 누르기 — 카드(고학년)를 들고 있으면 이 적에게 쓴다. 들고 있지 않으면 적 정보.
    // 정보는 길게 누르기(0.45초) · 오른쪽 클릭 · ⓘ 로도 — 카드를 든 채로도 열린다
    n.onclick = (e) => { stopEv(e); tapUnit(u, "enemy"); };
    holdInfo(n, () => openFoe(u));
    n.title = "카드를 고른 채 누르면 냅니다 · 길게 누르면 적 정보";
    // 카드를 고른 채 적에 올리면 그 적을 쳤을 때의 결과를 모두에게 보여 준다(광역 곁가지까지)
    n.onmouseenter = () => {
      if (u.dead) return;
      if (selCard >= 0) paintPreview(selCard, u.idx);
      else if (selUlt && ultNeed(selUlt) === "enemy") paintPreview(null, u.idx, selUlt);
    };
    n.onmouseleave = () => paintSel();
    const pv = el("div", "pv");
    n.appendChild(pv);
    foeEls.set(u.idx, { n, pv, ghost: hb.ghost });
    return n;
  }

  // ── 싸움터에 선 아군 ─────────────────────────────────────────────────
  // 전열이 앞, 후열이 뒤. 줄이 곧 서는 자리다.
  function standNode(u, clickable, onPick) {
    const pick = clickable && !u.dead;
    // 위급 — 체력이 30% 이하면 발밑이 붉게 숨 쉰다
    const n = el("div", "stand r" + u.row + (u.dead ? " dead" : "") + (pick ? " tgt" : "") + (!u.dead && u.hp <= u.maxHp * 0.3 ? " danger" : ""));
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
    // 누르기 — 아군에게 쓰는 카드(고학년)를 들고 있으면 이 사도에게. 아니면 사도 정보(길게 누르기 · 오른쪽 클릭도)
    n.onclick = (e) => { stopEv(e); tapUnit(u, "party"); };
    holdInfo(n, () => openHero(u));
    n.title = "눌러서 사도 정보 보기 · 아군 카드를 고른 채 누르면 냅니다";
    // 아군 미리보기 — 회복 · 방어 · 실드가 얼마나 붙는지(시전자 능력치로 엔진이 센 값)
    const pv = el("div", "pv apv");
    n.appendChild(pv);
    allyPv.set(u.idx, { n, pv, gain: hb.gain });
    n.onmouseenter = () => {
      if (u.dead) return;
      if (selCard >= 0 && targetsNeeded(st.hand[selCard]) === "party") paintPreview(selCard, u.idx);
      else if (selUlt && ultNeed(selUlt) === "party") paintPreview(null, u.idx, selUlt);
    };
    n.onmouseleave = () => { if (selCard >= 0 || selUlt) paintSel(); };
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
    // 낀 장비 — 이름 줄 위 오른쪽에 작은 아이콘 셋(누르면 그 장비 자세히). 빈 칸은 흐린 자리만
    let gearRow = null;
    const gg = R.gearOf(run, u.key);
    if (Object.keys(gg).length) {
      const gs = el("span", "agear");
      for (const sl of RULES.SLOTS) {
        const e = gg[sl] ? EQUIP[gg[sl]] : null;
        const ic = e ? equipIcon(e, 20) : emptySlotIcon(sl, 20);
        if (e) { ic.title = `${e.ko} · ${statText(R.statsOf(e.id, u.key))}`; ic.onpointerdown = stopEv; ic.onclick = (ev) => { stopEv(ev); showEquip(e.id, { heroKey: u.key }); }; }
        gs.appendChild(ic);
      }
      gearRow = gs;
    }
    box.appendChild(top);
    box.appendChild(chips(u));

    // 고학년 스킬 — 게이지가 차면 누를 수 있다
    const ult = C.ultOf(u.key);
    if (ult && !u.dead) {
      const why = C.canUlt(st, u.key);
      const b = el("button", "ultbtn" + (why ? " no" : "") + (ultPic ? " grad" : "") + (selUlt === u.key ? " usel" : ""));
      // 쓸 수 있다 — 초상이 숨 쉬듯 빛나고 「고학년!」 딱지
      if (!why) n.classList.add("uready");
      if (selUlt === u.key) n.classList.add("usel");
      if (ultPic) {
        // 고학년 스킬 단추 — 둥근 얼굴 아이콘. 둘레 고리가 게이지만큼 차고, 다 차면 빛난다
        const face = el("span", "uface");
        const fi = img(ultPic);
        fi.draggable = false;              // 그림을 잡으면 브라우저가 그림 끌기를 먼저 시작해 우리 끌기가 취소된다
        face.appendChild(fi);
        face.style.setProperty("--pct", Math.min(100, (st.gauge / ult.cost) * 100).toFixed(1));   // 둘레 고리가 이만큼 찬다
        if (!why) face.appendChild(el("i", "ubadge", "고학년!"));
        b.appendChild(face);
      } else if (!why) b.appendChild(el("i", "ubadge", "고학년!"));
      b.appendChild(el("span", "ucost", `${ult.cost}%`));
      b.appendChild(el("span", "uname", ult.ko));
      // 카드처럼 쓴다 — 눌러 고르고 대상을 누르거나, 끌어다 놓는다(startUltDrag). 길게 누르기 · 오른쪽 클릭은 자세히.
      // 쓸 수 없으면 누르면 자세히(까닭이 보인다)
      b.title = why ? `${why} · 눌러서 자세히` : "눌러 고른 뒤 대상을 누르거나, 끌어다 놓으면 씁니다 · 길게 누르면 자세히";
      b.setAttribute("aria-label", `${u.ko} 고학년 스킬 ${ult.ko} — ${b.title}`);
      b.onpointerdown = (e) => startUltDrag(e, u, b, why);
      b.oncontextmenu = (e) => { e.preventDefault(); if (drag) stopDrag(true); openUlt(u); };
      const tap = () => {
        if (dragDone) return;
        if (why) return openUlt(u);
        selCard = -1;
        selUlt = selUlt === u.key ? null : u.key;
        draw();
      };
      b.onclick = (e) => { stopEv(e); tap(); };
      box.appendChild(b);
      // 줄 어디를 잡아도(초상 · 이름) 단추를 잡은 것과 같다 — 단추만 잡히면 작아서 놓친다
      n.classList.add("ultgrab");
      n.onpointerdown = (e) => { if (!b.contains(e.target)) startUltDrag(e, u, b, why); };
      n.onclick = (e) => { if (!e || !b.contains || !b.contains(e.target)) tap(); };
      n.oncontextmenu = (e) => { e.preventDefault(); if (drag) stopDrag(true); openUlt(u); };
    }

    n.appendChild(box);
    if (gearRow) n.appendChild(gearRow);
    return n;
  }

  function hpBar(u) {
    // 실드·방어가 있으면 막대에 테를 두른다 — 숫자를 안 읽어도 누가 막혀 있는지 보인다
    const wrap = el("div", "hpwrap" + (u.shield > 0 ? " shielded" : "") + (u.block > 0 ? " blocked" : ""));
    const bar = el("div", "bar");
    const hp = hpOf(u);
    // 뒤처지는 막대 — 맞으면 체력 막대는 바로 줄고, 이것은 잠깐 남았다가 따라 줄어든다(얼마나 깎였는지 보인다)
    const lag = el("b", "lag");
    const fill = el("i");
    lag.style.width = fill.style.width = Math.max(0, (hp / u.maxHp) * 100) + "%";
    bar.appendChild(lag);
    bar.appendChild(fill);
    // 미리보기 — 깎일 만큼을 막대 끝에 그림자로
    wrap.ghost = el("s", "ghost");
    bar.appendChild(wrap.ghost);
    wrap.gain = el("s", "gain");                // 회복 미리보기 — 찰 만큼을 초록으로
    bar.appendChild(wrap.gain);
    wrap.appendChild(bar);
    const nums = el("div", "nums");
    const num = el("span", "hpn", `${hp} / ${u.maxHp}`);
    nums.appendChild(num);
    bars.set(ukey(u), { u, fill, lag, num });
    if (u.block > 0) nums.appendChild(el("span", "b", `방어 ${u.block}`));
    if (u.shield > 0) nums.appendChild(el("span", "sh", `실드 ${u.shield}`));
    wrap.appendChild(nums);
    return wrap;
  }

  // ── 걸린 것 — 버프 · 디버프 · 키워드 ────────────────────────────────
  // 칩과 정보 창이 같은 목록을 쓴다(effectsOf). 버프는 청록, 디버프는 빨강, 키워드는 금빛 — 값과 남은 턴을 함께.
  // 전에는 상태 · 증감 · 키워드가 한 줄에 같은 모양으로 섞여 무엇이 좋은 것인지 한눈에 안 보였다(2026-10 사용자)
  const STAT_KO = { dealt: "주는 피해", taken: "받는 피해", atk: "공격력", def: "방어력", crit: "치명", heal: "회복력" };
  const BAD_ST = ["취약", "약화", "감전", "중독", "기절", "침묵", "화상", "출혈"];
  const pctTxt = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const turnTxt = (n) => (n == null || n >= 999 ? "이번 전투" : `${n}턴`);
  // 키워드 1개당이 이 사람에게 주는 증감 — [{ id, stat, v, n }]
  function kwShares(u) {
    const out = [];
    for (const kw of Object.values(st.kw || {})) {
      for (const p of kw.per || []) {
        if (!STAT_KO[p.stat]) continue;
        let n = 0;
        if (kw.carrier === "self") {
          const mine = ((st.stacks || {})[kw.owner] || {})[kw.id] || 0;
          if (mine && (p.who === "allies" ? u.side === "party" : u.key === kw.owner && u.side === "party")) n = mine;
        } else n = (u.status || {})[kw.id] || 0;
        if (n) out.push({ id: kw.id, stat: p.stat, v: n * p.v, n });
      }
    }
    return out;
  }
  // 이 사람에게 걸린 것 전부 — buffs · debuffs: [{ stat?, id?, v, left, src }] · keys: [{ id, n, owner, share }]
  function effectsOf(u) {
    const buffs = [], debuffs = [], keys = [];
    const goodMod = (stat, v) => (stat === "taken" ? v < 0 : v > 0);
    for (const m of u.mods || []) (goodMod(m.stat, m.v) ? buffs : debuffs).push({ stat: m.stat, v: m.v, left: m.left, src: m.src || null });
    if (u.side === "party" && st.always) for (const m of st.always[u.key] || []) {
      const owner = st.party.find((x) => x.key === m.owner);
      (goodMod(m.stat, m.v) ? buffs : debuffs).push({ stat: m.stat, v: m.v, left: 999, src: `${owner ? owner.ko : m.owner} · ${m.name || "패시브"}${m.cond && m.cond.length ? " (조건부)" : ""}`, always: true });
    }
    for (const [k, v] of Object.entries(u.status || {})) {
      if (!v) continue;
      const kw = (st.kw || {})[k];
      if (kw) { keys.push({ id: k, n: v, owner: kw.owner }); continue; }
      (BAD_ST.includes(k) ? debuffs : buffs).push({ id: k, v, left: v });
    }
    if (u.side === "party" && st.taunt === u.key) buffs.push({ id: "도발", v: st.tauntLeft || 1, left: st.tauntLeft || 1 });
    const stk = (st.stacks || {})[u.key];
    if (stk && u.side === "party") for (const [k, v] of Object.entries(stk)) if (v) keys.push({ id: k, n: v, owner: u.key, self: true });
    const shares = kwShares(u);
    for (const k of keys) k.share = shares.filter((x) => x.id === k.id);
    return { buffs, debuffs, keys };
  }
  // 칩이 새로 붙거나 값이 바뀌면 한 번 튄다 — 무엇이 걸렸는지 눈이 간다. 「사람」 → { 이름 → 값 }
  const chipSeen = new Map();
  function chips(u) {
    const box = el("div", "chips");
    const was = chipSeen.get(ukey(u)), now = new Map();
    const mark = (c, k, v) => {
      now.set(k, v);
      if (!was || calmNow()) return;
      if (!was.has(k)) c.classList.add("cnew");
      else if (was.get(k) !== v) c.classList.add("cchg");
    };
    const { buffs, debuffs, keys } = effectsOf(u);
    // 증감은 종류마다 한 칸 — 값은 합, 턴은 가장 먼저 끝나는 것. 누르거나 올리면 출처
    const group = (list, cls) => {
      const by = new Map();
      for (const x of list) {
        const k = x.stat || "#" + x.id;
        const g = by.get(k) || { ...x, v: 0, left: 999, src: [] };
        g.v += x.v; g.left = Math.min(g.left, x.left == null ? 999 : x.left);
        g.src.push(x.stat ? `${STAT_KO[x.stat]} ${pctTxt(x.v)} · ${turnTxt(x.left)}${x.src ? " · " + x.src : ""}` : `${x.id} ${turnTxt(x.left)}`);
        by.set(k, g);
      }
      // 칩 = 아이콘 · 값 · 남은 턴(js/fx-icons.js). 이름(clab)은 싸움터에서 숨기고 정보 창에서만 — 그림이 없는 것만 싸움터에도 이름
      for (const g of by.values()) {
        if (g.stat && Math.abs(Math.round(g.v * 100)) < 1) continue;
        const ic = g.stat ? fxIcon(g.stat, g.v > 0 ? "up" : "down") : fxIcon(g.id);
        const c = el("span", "chip " + cls + (ic ? "" : " noic"));
        if (ic) c.appendChild(ic);
        c.appendChild(el("span", "clab", g.stat ? STAT_KO[g.stat] || g.stat : g.id));
        if (g.stat) c.appendChild(el("b", "cval", pctTxt(g.v)));
        if (g.left < 999) c.appendChild(el("i", "cturn", String(g.left)));
        c.dataset.lab = g.stat ? `${STAT_KO[g.stat] || g.stat} ${pctTxt(g.v)}` : g.id;
        c.title = g.src.join("\n");
        mark(c, g.stat || "#" + g.id, c.dataset.lab + "|" + g.left);
        box.appendChild(c);
      }
    };
    group(buffs, "buff");
    group(debuffs, "debuff");
    // 사도 키워드는 금빛 동전(첫 글자) · 개수
    for (const k of keys) {
      const c = el("span", "chip key");
      c.appendChild(kwToken(k.id));
      c.appendChild(el("span", "clab", k.id));
      c.appendChild(el("b", "cnum", String(k.n)));
      c.dataset.lab = `${k.id} ${k.n}`;
      c.title = `${k.id} ${k.n}` + k.share.map((x) => `\n${STAT_KO[x.stat]} ${pctTxt(x.v)}`).join("");
      mark(c, "@" + k.id, String(k.n));
      box.appendChild(c);
    }
    chipSeen.set(ukey(u), now);
    return box;
  }

  // ── 피해 미리보기 ────────────────────────────────────────────────────
  // 카드를 고르거나 손패에서 카드에 올리면, 적마다 얼마나 깎이는지 적 위에 띄운다.
  // 한 명을 고르는 카드는 적마다 "이 적을 치면" 의 값을, 적에 올리면 그 적을 쳤을 때의 전부를 보여 준다.
  // 계산은 엔진이 한다(C.previewCard) — 판을 복사해 실제로 내 보는 것이라 실제와 어긋나지 않는다.
  // 고학년 스킬도 같은 자리에 — 끌어 올린 동안 적마다 얼마나 깎이는지(C.previewUlt). 전에는 카드만 보였다
  function paintPreview(handIdx, hoverIdx, ultKey) {
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
    if (st.over) return;
    let need, run;
    if (ultKey) { need = ultNeed(ultKey); run = (t) => C.previewUlt(st, ultKey, t); }
    else {
      if (handIdx == null || handIdx < 0) return;
      const id = st.hand[handIdx]; if (!id) return;
      need = targetsNeeded(id); run = (t) => C.previewCard(st, handIdx, t);
    }
    const res = {};
    if (need === "enemy" && hoverIdx == null) {
      for (const e of st.enemies) {
        if (e.dead) continue;
        const p = run(e.idx);
        if (p && p[e.idx]) res[e.idx] = p[e.idx];
      }
    } else {
      const p = run(hoverIdx == null ? 0 : hoverIdx);
      if (p) p.forEach((x, i) => { if (x) res[i] = x; });
    }
    if (!ultKey) paintAllies(handIdx, need, hoverIdx);
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

  // ── 눌러서 쓰기 ─────────────────────────────────────────────────────
  // 카드(또는 고학년 얼굴)를 눌러 들어 올리고 → 대상을 누르면 쓴다. 끌어 놓기도 그대로 된다.
  // 들고 있는 동안 적 · 사도를 눌러도 정보가 안 열린다 — 정보는 길게 누르기(0.45초) · 오른쪽 클릭 · ⓘ(적)
  const stopEv = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
  function useSel(t) {
    if (selUlt) { const k = selUlt; selUlt = null; return dropUlt(k, t); }
    if (selCard >= 0) dropCard(selCard, t);
  }
  function tapUnit(u, side) {
    if (holdDone || st.over) return;
    if (selCard < 0 && !selUlt) return side === "enemy" ? openFoe(u) : openHero(u);
    if (u.dead) return;
    const need = selCard >= 0 ? targetsNeeded(st.hand[selCard]) : ultNeed(selUlt);
    if (need && need !== side) return say(need === "enemy" ? "적을 누르세요 — 적에게 쓰는 것입니다" : "아군을 누르세요 — 아군에게 쓰는 것입니다");
    useSel(need ? u.idx : 0);
  }
  // 길게 누르기 — 카드처럼 0.45초. 손가락이 움직이면 끊고, 뒤따르는 click 은 버린다(holdDone). 오른쪽 클릭도 같다
  let holdDone = false;
  function holdInfo(n, open) {
    let t = 0, x0 = 0, y0 = 0;
    const off = () => { clearTimeout(t); t = 0; };
    n.onpointerdown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; off();
      t = setTimeout(() => { t = 0; holdDone = true; setTimeout(() => { holdDone = false; }, 500); open(); }, 450);
    };
    n.onpointermove = (e) => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) off(); };
    n.onpointerup = n.onpointercancel = n.onpointerleave = off;
    n.oncontextmenu = (e) => { e.preventDefault(); off(); if (!holdDone) open(); };
  }
  // 들고 있는 것의 미리보기 — 고학년이면 고학년, 아니면 카드
  const paintSel = () => (selUlt ? paintPreview(null, null, selUlt) : paintPreview(selCard, null));

  // 카드 면의 숫자 — 엔진이 쓰는 셈 그대로(run-fx hitAmount · guardAmount · healAmount): 낸 사도의 지금 공격력 · 방어력 · 회복력
  // (버프 · 패시브 · 장비 · 축복 포함). 피해는 낸 쪽의 주는 피해 증감까지 — 맞는 쪽의 취약 · 상성 · 받는 피해는 대상마다 달라 뺀다
  // (그것은 적 위 미리보기가 보인다). 주인 없는 카드는 null(% 그대로)
  function cardCalc(id) {
    const c = C.cardOf(st, id);
    const u = c && c.hero ? st.party.find((x) => x.key === c.hero) : null;
    if (!u) return null;
    const api = { statOf: (x, k) => C.statOf(st, x, k) };
    const sh = st.shin && st.shin[id];
    const shin = RULES.shinKindOf(CARDS[id], sh);      // combat playCard 와 같은 풀이
    const dealt = Math.max(0.1, 1 + (C.statOf(st, u, "dealt") || 0));
    return (kind, ratio) => (kind === "dmg" ? Math.max(0, Math.round(FX.hitAmount(api, u, ratio, { shin: shin === "power" }) * dealt))
      : kind === "heal" ? FX.healAmount(api, u, ratio, shin)
      : FX.guardAmount(api, u, ratio, shin));
  }

  function targetsNeeded(cardId) {
    const c = C.cardOf(st, cardId);
    if (!c) return null;
    return c.target === "적" ? "enemy" : c.target === "아군" ? "party" : null;
  }

  // ── 그리기 ───────────────────────────────────────────────────────────
  // ── 손패가 오가는 몸짓 · 숫자 변화 (2026-10 연출 손보기) ───────────────────
  // 손에 있던 카드(id 별 장수) — 새로 들어온 카드만 뽑을 더미에서 날아온다. null 이면 처음(싸움을 연 때)
  let handSeen = null;
  let apSeen = null, gaugeSeen = null, drawSeen = null;
  const countIds = (ids) => { const m = new Map(); for (const id of ids) m.set(id, (m.get(id) || 0) + 1); return m; };
  // 새 카드 — 뽑을 더미 자리에서 작게 나와 제자리로. delay 동안은 안 보인다(적의 몸짓이 끝난 뒤 새 손패가 들어온다)
  function dealIn(cards, delay) {
    if (!cards.length || !groundOk || calmNow() || !drawPile.getBoundingClientRect || !Element.prototype.animate) return;
    const pr = drawPile.getBoundingClientRect(), z = zNow();
    cards.forEach((c, k) => {
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      const dx = (pr.left + pr.width / 2 - (r.left + r.width / 2)) / z, dy = (pr.top + pr.height / 2 - (r.top + r.height / 2)) / z;
      c.animate([
        { translate: `${dx.toFixed(0)}px ${dy.toFixed(0)}px`, scale: "0.3", opacity: 0 },
        { translate: `${(dx * 0.25).toFixed(0)}px ${(dy * 0.25 - 30).toFixed(0)}px`, scale: "0.85", opacity: 1, offset: 0.6 },
        { translate: "0px 0px", scale: "1", opacity: 1 },
      ], { duration: 320, delay: delay + k * 70, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
    });
    later(delay, () => { try { SFX.play("card.draw"); } catch { /* 소리 */ } });
  }
  // 턴을 넘길 때 — 남는 카드(보존)를 뺀 손패가 버린 더미로 쓸려 간다
  function sweepOut() {
    if (!groundOk || calmNow() || !discPile.getBoundingClientRect || !Element.prototype.animate) return;
    const pr = discPile.getBoundingClientRect(), z = zNow();
    [...hand.children].forEach((src, k) => {
      const id = st.hand[Number(src.dataset.i)], c = id && C.cardOf(st, id);
      if (!c || (c.tags || []).includes("보존")) return;
      const r = src.getBoundingClientRect();
      if (!r.width) return;
      const g = src.cloneNode(true);
      g.className = src.className.replace(/\b(sel|no|dragging)\b/g, "") + " flycard";
      g.removeAttribute("style");
      const w = src.offsetWidth, h = src.offsetHeight;
      Object.assign(g.style, { left: (r.left / z) + "px", top: (r.top / z) + "px", width: w + "px", height: h + "px", transformOrigin: "50% 50%" });
      document.body.appendChild(g);
      const dx = (pr.left + pr.width / 2 - (r.left + r.width / 2)) / z, dy = (pr.top + pr.height / 2 - (r.top + r.height / 2)) / z;
      const an = g.animate([
        { transform: `scale(${r.width / z / w})`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2) rotate(${20 + k * 6}deg)`, opacity: 0 },
      ], { duration: 280, delay: k * 35, easing: "cubic-bezier(.5,0,.9,.4)", fill: "forwards" });
      an.onfinish = () => g.remove();
      later(800, () => g.remove());
    });
  }
  // 숫자가 바뀌면 한 번 튄다 — 오르면 밝게, 내리면 흐리게. 오른 만큼 「+N」 이 떠오른다
  function bump(node, diff, label) {
    if (!node || !diff || !groundOk || calmNow()) return;
    node.classList.remove("bumpup", "bumpdn");
    void node.offsetWidth;
    node.classList.add(diff > 0 ? "bumpup" : "bumpdn");
    later(500, () => node.classList.remove("bumpup", "bumpdn"));
    if (diff > 0 && label) {
      const f = el("span", "bumpgain", `+${diff}${label}`);
      node.appendChild(f);
      later(900, () => f.remove());
    }
  }

  function draw() {
    // 무엇을 하든(카드 · 고학년 스킬 · 턴 넘기기) 엔진은 그 자리에서 다 풀고 여기로 온다 — 그린 것이 보이기 전에 적어 둔다.
    // 끝난 싸움은 finish 가 판에 남긴 뒤 적는다
    // 시험 화면 — 게이지는 늘 300%, 적은 처음 한 번 체력 20배(오래 두고 본다)
    if (DEV && !st.over) {
      st.gauge = 300;
      st.lastUlt = null;                 // 시험 화면 — 같은 사도도 연달아 쓴다
      if (!st.devHp) { st.devHp = true; for (const e of st.enemies) { e.maxHp = Math.max(1, Math.round(e.maxHp * (DEV.hp || 20))); e.hp = e.maxHp; } }
    }
    if (!st.over) writeSave(run, st);
    closeModal();
    const fxq = takeFx();
    bars.clear();
    if (selUlt && (st.over || C.canUlt(st, selUlt))) selUlt = null;   // 고른 고학년을 이제 못 쓴다(게이지 · 쓰러짐)
    // 빛낼 쪽 — 든 카드의 대상, 고른 고학년은 대상(없으면 맞을 쪽)
    const need = selCard >= 0 ? targetsNeeded(st.hand[selCard]) : selUlt ? ultNeed(selUlt) || ultLit(selUlt) : null;

    field.style.setProperty("--nf", String(Math.max(1, st.enemies.length)));
    field.style.setProperty("--na", String(Math.max(1, st.party.length)));
    foeZone.innerHTML = "";
    foeZone.classList.toggle("many", st.enemies.length >= 3);   // 셋 넷 — 이름표를 조금 줄인다(css)
    foeEls.clear();
    for (const u of st.enemies) foeZone.appendChild(foeNode(u, need === "enemy", (t) => play(t.idx)));
    drawBoss();

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
    // 버린 더미를 섞어 뽑을 더미로 — 더미가 한 번 출렁인다
    if (drawSeen != null && st.draw.length > drawSeen + 1) { drawPile.classList.remove("shuffled"); void drawPile.offsetWidth; drawPile.classList.add("shuffled"); try { SFX.play("card.shuffle"); } catch { /* 소리 */ } }
    drawSeen = st.draw.length;
    drawPile.appendChild(el("span", "plab", "뽑을 것"));
    drawPile.title = "눌러서 남은 카드 보기";
    const piles = () => [
      { key: "draw", label: "뽑을 더미", ids: st.draw, why: "차례는 안 보여 줍니다 — 섞여 있습니다." },
      { key: "disc", label: "버린 더미", ids: st.discard, why: "덱이 바닥나면 섞여서 뽑을 더미로 돌아갑니다." },
      { key: "gone", label: "사라진 카드", ids: st.gone, why: "소멸했거나 손이 넘쳐 사라진 카드 — 이 판에서 다시 안 나옵니다." },
      { key: "all", label: "덱 전체", ids: run.deck, why: "이 판의 덱. 신탁이 붙은 카드는 바뀐 모습으로 보입니다." },
    ];
    const cardFor = (id) => C.cardOf(st, id);
    drawPile.onclick = () => showPiles(piles(), "draw", cardFor, openCard, cardCalc);
    discPile.innerHTML = "";
    discPile.appendChild(el("span", "pnum", String(st.discard.length)));
    discPile.appendChild(el("span", "plab", "버린 것"));
    discPile.title = "눌러서 버린 카드 보기";
    discPile.onclick = () => showPiles(piles(), "disc", cardFor, openCard, cardCalc);
    turnTag.textContent = `${st.turn}턴`;
    // 턴이 바뀌면 싸움터 가운데에 크게 알린다 — 적이 무엇을 했는지 보기 전에 턴이 넘어간 걸 알아야 한다.
    if (st.turn !== shownTurn && !st.over) {
      shownTurn = st.turn;
      const ban = el("div", "turnban");
      ban.appendChild(el("small", null, "TURN"));
      ban.appendChild(el("b", null, String(st.turn)));
      // 적의 차례에 뜬 피해 숫자가 아직 떠 있으면 그것이 걷힐 때까지(길어야 1.2초) 기다렸다 띄운다 — 숫자 위에 겹쳐 읽히지 않았다
      const t0 = Date.now(), turn = st.turn;
      const show = () => {
        if (shownTurn !== turn || !field.isConnected) return;
        // 적이 차례로 움직이는 동안(fxEnd)도 기다린다 — 둘째 적이 치는 사이에 「TURN 2」 가 끼어들었다. 길어야 4초
        if (Date.now() - t0 < 4000 && (performance.now() < fxEnd - 200 || (field.querySelector && field.querySelector(".fxnum")) || (s.querySelector && s.querySelector(".bossintro")))) return setTimeout(show, 120);   // 보스 등장 띠가 걷힌 뒤에
        field.appendChild(ban);
        setTimeout(() => ban.remove(), 1300);
      };
      setTimeout(show, 0);                  // 이 draw 의 몸짓(playBeats → fxEnd)이 걸린 뒤에 잰다
    }

    // 코스트 창 — 카제나는 여기가 손패의 핵심이다
    apBox.innerHTML = "";
    apBox.appendChild(el("span", "apnum", String(st.ap)));
    // AP 가 패시브 · 카드로 늘면 「+1」 이 떠오른다(턴이 바뀌어 다시 찬 것은 빼고)
    const apTurn = apSeen && apSeen.turn === st.turn;
    if (apTurn && st.ap !== apSeen.v) later(0, () => bump(apBox, st.ap - apSeen.v, " AP"));
    apSeen = { v: st.ap, turn: st.turn };
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
    if (gaugeSeen != null && st.gauge > gaugeSeen) {
      bump(gaugeNum, st.gauge - gaugeSeen);
      // 고학년 비용을 막 넘었다 — 그 눈금이 한 번 번쩍인다
      for (const t of gaugeBar.querySelectorAll(".tick")) if (gaugeSeen < Number(t.dataset.cost) && st.gauge >= Number(t.dataset.cost)) {
        t.classList.remove("crossed"); void t.offsetWidth; t.classList.add("crossed");
      }
    }
    gaugeSeen = st.gauge;
    for (const t of gaugeBar.querySelectorAll(".tick")) t.classList.toggle("on", st.gauge >= Number(t.dataset.cost));
    gaugeBox.classList.toggle("ready", st.party.some((u) => !u.dead && C.canUlt(st, u.key) === null));

    // 손패 — 사도 배치 순서로 줄 세운다
    hand.innerHTML = "";
    const fresh = [], left = handSeen ? new Map(handSeen) : null;
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
      withNumbers(cbody, cardParts({ ...c, name: c.name }, c.hero).action, c.hero, cardCalc(id));
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
        if (why) { b.classList.remove("deny"); void b.offsetWidth; b.classList.add("deny"); return say(why); }
        hint("");
        const want = targetsNeeded(id);
        // 고르기만 하고 아무 말이 없으면 "안 써진다"고 느낀다 — 실제로 그런 말을 들었다.
        // 눌러서는 어떤 카드도 안 나간다 — 잘못 눌러 나가 버리는 일이 잦았다(방어 · 버프부터, 공격도 같게).
        // 들어 올려 보여 주기만 하고, 끌어 놓아야 쓴다(startDrag → dropCard).
        // 이제는 들어 올린 뒤 대상을 누르면 낸다(끌어 놓기도 된다) — 실수로 나가지 않게 한 번 더 누르는 셈이다
        selCard = selCard === i ? -1 : i;
        selUlt = null;
        draw();
      };
      hand.appendChild(b);
      if (!left || !(left.get(id) > 0)) fresh.push(b); else left.set(id, left.get(id) - 1);
    }
    handSeen = countIds(st.hand);
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

    // 패시브가 발동했으면 그 사도 위에 이름을 띄운다 — 기록에 「에르핀 · 와구와구」 로 남는다.
    // 한 수에 여럿이 터지면(실비아 「어머니의 특별 강의」 + 「초청객」) 같은 자리에 겹쳐 글자가 뭉개졌다 — 사람마다 한 줄로 모은다
    const fired = new Map();
    for (const line of st.log.slice(logShown)) {
      const m = line.match(/^(.+?) · (.+)$/);
      if (!m) continue;
      const who = st.party.find((u) => u.ko === m[1]);
      if (!who || !standEls.get(who.key)) continue;
      const names = fired.get(who.key) || [];
      if (!names.includes(m[2])) names.push(m[2]);
      fired.set(who.key, names);
    }
    for (const [key, names] of fired) {
      const f = el("div", "pfire", names.join(" · "));
      standEls.get(key).appendChild(f); setTimeout(() => f.remove(), 1600);
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

    fitChips();
    paintSel();
    // 들어 올린 동안 한 줄 안내 — 내려놓거나 내면 지운다(다른 안내 · say 는 건드리지 않는다)
    const lifted = !st.over && (selCard >= 0 || !!selUlt);
    if (lifted) hint(need ? "대상을 누르거나 끌어 놓으세요" : "싸움터를 누르거나 위로 끌어 놓으세요");
    else if (selHint) hint("");
    selHint = lifted;
    s.classList.toggle("lifted", lifted);
    later(0, paintLiftTips);                // 손패가 펼쳐진(부채꼴) 뒤 자리를 잰다
    runFx(fxq);
    // 새로 들어온 카드 — 적이 움직이는 동안(턴이 넘어간 때)은 그 몸짓이 끝난 뒤에
    if (fresh.length && !st.over) dealIn(fresh, Math.max(0, fxEnd - performance.now() - 150));
    phaseBanner();
    ultTip();
    if (st.over) finish();
  }

  // 보스 체력 띠 — 싸움터 위에 넓게. 판이 바뀌는 자리에 눈금, 지금 몇 단계인지
  function drawBoss() {
    const u = st.enemies.find((e) => e.boss);
    bossBox.innerHTML = "";
    bossHp = null;
    bossBox.classList.toggle("on", !!u && !u.dead);
    if (!u || u.dead) return;
    const E = ENEMIES[u.key] || {};
    const at = [E.phase && E.phase.at, E.phase && E.phase2 && E.phase2.at].filter(Boolean);
    const stage = 1 + (u.phased ? 1 : 0) + (u.phased2 ? 1 : 0);
    const top = el("div", "bbtop");
    top.appendChild(el("b", "bbname", u.ko));
    if (at.length) top.appendChild(el("span", "bbstage", `${stage}/${at.length + 1}단계`));
    const num = el("span", "bbnum");
    top.appendChild(num);
    bossBox.appendChild(top);
    const bar = el("div", "bbbar");
    const lag = el("b", "lag"), fill = el("i");
    bar.appendChild(lag); bar.appendChild(fill);
    for (const a of at) { const t = el("s"); t.style.left = a * 100 + "%"; t.title = `HP ${Math.round(a * 100)}% 에서 다음 단계`; bar.appendChild(t); }
    bossBox.appendChild(bar);
    bossHp = { u, fill, lag, num };
    const hp = hpOf(u), w = Math.max(0, (hp / u.maxHp) * 100) + "%";
    fill.style.width = lag.style.width = w;
    num.textContent = `${Math.max(0, hp)} / ${u.maxHp}`;
    if (u.block > 0) top.appendChild(el("span", "bbblk", `방어 ${u.block}`));
    if (u.shield > 0) top.appendChild(el("span", "bbblk", `실드 ${u.shield}`));
    bossBox.onclick = () => openFoe(u);
    bossBox.title = "눌러서 보스 정보";
  }
  // 단계가 바뀌었다 — 그 판의 말을 큰 띠로. 처음 그릴 때는 지금 단계를 적어 두기만 한다. 맞는 몸짓이 끝난 뒤에 띄운다
  function phaseBanner() {
    for (const u of st.enemies) {
      const E = ENEMIES[u.key] || {};
      if (!E.phase) continue;
      const stage = 1 + (u.phased ? 1 : 0) + (u.phased2 ? 1 : 0);
      const was = phaseSeen.get(u.idx);
      phaseSeen.set(u.idx, stage);
      if (was == null || stage <= was || u.dead || st.over) continue;
      const ph = stage === 3 ? E.phase2 : E.phase;
      const total = 1 + (E.phase2 ? 2 : 1);
      const ban = el("div", "phaseban");
      ban.appendChild(el("small", null, `${u.ko} · ${stage}/${total}단계`));
      ban.appendChild(el("b", null, ph.say || "판이 바뀐다"));
      const wait = Math.max(0, Math.min(2600, fxEnd - performance.now()));
      later(wait, () => { if (!field.isConnected) return; s.appendChild(ban); later(2600, () => ban.remove()); });
    }
  }
  // 판에서 처음으로 고학년을 쓸 수 있게 되면 한 번 알려 준다 — 판(run)에 적어 두어 다시 안 뜬다
  function ultTip() {
    if (run.ultTip || st.over || !st.party.some((u) => !u.dead && C.canUlt(st, u.key) === null)) return;
    run.ultTip = true;
    const t = el("div", "ulttip", "초상을 적에게 끌거나 눌러서 고학년 스킬을 씁니다");
    t.onclick = () => t.remove();
    s.appendChild(t);
    later(5200, () => t.remove());
  }
  // 싸움터의 칩은 두 줄까지 — 넘치는 것은 접고 끝에 「+N」(누르면 그 사도 · 적 정보창에서 전부 보인다).
  // 다섯 줄로 늘어 손패 · 옆 칸을 덮었다(2026-10 사용자). 그려진 뒤 실제 줄을 재서 접는다
  function fitChips() {
    try {
      for (const box of field.querySelectorAll(":is(.stand, .foe) > .chips")) {
        const kids = [...box.children];
        const h = kids.length > 1 ? kids[0].offsetHeight : 0;
        if (!h) continue;
        const top0 = kids[0].offsetTop, over = (c) => c.offsetTop - top0 > h * 1.5;   // 셋째 줄부터
        if (!kids.some(over)) continue;
        const more = el("span", "chip more");
        box.appendChild(more);
        const hid = [];
        for (const c of kids) if (over(c)) { c.style.display = "none"; hid.push(c); }
        for (;;) {
          more.textContent = `+${hid.length}`;
          if (!over(more)) break;
          const c = kids.filter((x) => x.style.display !== "none").pop();
          if (!c) break;
          c.style.display = "none"; hid.push(c);
        }
        hid.sort((a, b) => kids.indexOf(a) - kids.indexOf(b));
        more.title = hid.map((c) => c.dataset.lab || c.textContent).join(" · ") + " — 눌러서 전부 보기";
      }
    } catch { /* 가짜 DOM(시험 도구)에는 자리가 없다 */ }
  }

  // ── 끌어서 내기 ──────────────────────────────────────────────────────
  // 카드를 끌어 적(또는 아군) 위에 놓으면 그 대상에게 낸다. 대상이 없는 카드는 손패 위로 끌어 올려 놓으면 낸다.
  // 끄는 동안: 카드가 손을 따라오고, 카드에서 화살이 뻗고, 칠 수 있는 대상이 빛나고, 올린 대상에 피해 미리보기가 뜬다.
  // 눌러서 고르는 방식은 그대로 된다 — 10px 넘게 움직여야 끌기로 본다.
  // 고학년 스킬(아군 상태창의 얼굴 단추)도 같은 길로 끈다(drag.ult) — 적 하나를 고르는 것은 적에, 아니면 싸움터(손패 위)에 놓는다.
  // 화면은 CSS zoom 이 걸려 있어 fixed 좌표를 배율로 나눈다(clientX 는 실제 화면 좌표).
  let drag = null, dragDone = false;
  let dropAt = null;                        // 끌어 놓은 자리(끌던 그림의 화면 상자) — 낸 카드는 손이 아니라 거기서 날아간다
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
      if (d.ult) openUlt(d.ult); else openCard(d.id);
    }, 450);
    try { card.setPointerCapture(e.pointerId); } catch { /* 가짜 DOM */ }
    card.onpointermove = moveDrag;
    card.onpointerup = endDrag;
    card.onpointercancel = () => stopDrag(true);
  }
  // 고학년 스킬이 누구를 겨누나 — 적 하나(oneEnemy)면 적, 아군 하나(oneAlly)면 아군, 아니면 싸움터 어디든(null).
  // 싸움터에 놓는 것은 맞을 쪽을 빛낸다 — 적에게 무엇이든 하면 적 모두, 아니면(자신 · 아군 전체) 아군 모두
  function ultNeed(key) {
    const fx = (C.ultOf(key) || {}).fx || [];
    return fx.some((f) => f.target === "oneEnemy") ? "enemy" : fx.some((f) => f.target === "oneAlly") ? "party" : null;
  }
  function ultLit(key) {
    const fx = (C.ultOf(key) || {}).fx || [];
    return !fx.length || fx.some((f) => /Enem/.test(f.target || "")) ? "enemy" : "party";
  }
  function startUltDrag(e, u, btn, why) {
    startDrag(e, -1, null, btn, why || false);
    if (!drag) return;
    drag.ult = u;
    drag.need = ultNeed(u.key);
    drag.lit = drag.need || ultLit(u.key);
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
    // 고학년은 둥근 얼굴만 따라온다(그림이 없으면 단추째)
    const face = drag.ult && drag.card.querySelector(".uface");
    const ghost = (face || drag.card).cloneNode(true);
    ghost.className = (face || drag.card).className.replace(/\b(dragging|sel)\b/g, "") + " dghost" + (drag.ult ? " ughost" : "");
    if (face) ghost.style.removeProperty("transform"); else ghost.removeAttribute("style");
    fx.appendChild(ghost);
    drag.fx = fx; drag.ghost = ghost;
    document.body.appendChild(fx);
    // 칠 수 있는 대상을 빛낸다 — draw() 로 다시 그리면 끄는 카드가 사라지니 표시만 단다
    const lit = drag.lit || drag.need;
    if (lit === "enemy") for (const [, { n }] of foeEls) { if (!n.classList.contains("dead")) n.classList.add("tgt", "dtgt"); }
    if (lit === "party") for (const [, n] of standEls) { if (!n.classList.contains("dead")) n.classList.add("tgt", "dtgt"); }
    if (!drag.ult) paintPreview(drag.i, null);  // 끌기 시작 — 대상마다 「여기 놓으면」 을 미리 띄운다
    else if (!drag.locked) paintPreview(null, null, drag.ult.key);
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10) return;
      clearTimeout(drag.hold);
      // 못 내는 카드는 끌지 않는다. 고학년은 까닭(게이지 · 같은 사도 연속)을 말한다
      if (drag.locked) {
        const why = drag.ult ? drag.locked : null, card = drag.card;
        stopDrag(true);
        if (!why) return;
        say(why);
        // 손을 떼면 따라오는 click 이 자세히 창을 열지 않게 — 그 click 까지만 막는다
        dragDone = true;
        card.onpointerup = card.onpointercancel = () => { card.onpointerup = card.onpointercancel = null; setTimeout(() => { dragDone = false; }, 0); };
        return;
      }
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
      // 싸움터에 놓는 고학년 — 올라오면 맞을 쪽이 모두 금빛으로
      if (drag.ult && !drag.need) for (const n of document.querySelectorAll(".dtgt")) n.classList.toggle("dover", !!t);
      if (drag.need && !drag.ult) paintPreview(drag.i, t ? Number(t.dataset.idx) : null);
      if (drag.need && drag.ult) paintPreview(null, t ? Number(t.dataset.idx) : null, drag.ult.key);
    }
  }
  // 끌어 놓을 대상 — 이름표 · 체력 칸만이 아니라 서 있는 그림 전체(칸 밖으로 넘친 캔버스까지)를 잡고,
  // 그 둘레 24px 까지 넉넉히 본다. 여럿이 걸리면 가운데가 가까운 쪽. 아무 데도 안 걸려도 110px 안이면 그쪽.
  function pickTarget(x, y, sel) {
    const pad = 24 * zoomNow(), near = 110 * zoomNow();
    let best = null, bestD = Infinity;
    for (const n of document.querySelectorAll(sel)) {
      const rs = [n.getBoundingClientRect()];
      const art = n.querySelector(".art canvas") && n.querySelector(".art");
      if (art) {
        // 몸 — 칸 폭 그대로, 위로 칸 높이의 반만큼 더(머리 · 날개). 캔버스는 동작이 닿는 곳까지 넓혀 그리니(spine-view reachOf)
        // 캔버스 크기로 재면 옆 사람 자리까지 잡힌다
        const r = art.getBoundingClientRect();
        rs.push({ left: r.left, right: r.right, top: r.top - r.height * 0.5, bottom: r.bottom });
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
    if (over && !d.ult && d.ghost && d.ghost.getBoundingClientRect) dropAt = { r: d.ghost.getBoundingClientRect(), t: performance.now() };
    stopDrag(!over);
    if (!over) return;
    if (d.ult) dropUlt(d.ult.key, d.need ? Number(over.dataset.idx) : 0);
    else dropCard(d.i, d.need ? Number(over.dataset.idx) : 0);
  }
  // 카드를 대상에 놓았다 — 끌기가 끝나면 여기로 온다. tools/smoke.js 도 이 길로 낸다(가짜 DOM 에서는 끌 수 없다)
  function dropCard(handIdx, targetIdx) {
    hint("");
    selCard = handIdx;
    play(targetIdx);
  }
  s.dropCard = dropCard;
  // 고학년 스킬을 대상에 놓았다 — 끌기가 끝나면 여기로 온다. 시험(tools/smoke.js · 브라우저 검사)도 이 길로 쓴다
  function dropUlt(key, targetIdx) {
    const r = C.useUlt(st, key, targetIdx);
    if (selUlt === key) selUlt = null;
    if (!r.ok) { draw(); return say(r.why); }
    hint(""); draw();
  }
  s.dropUlt = dropUlt;
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
  // 능력치 — 기본(+장비) → 지금. 바뀐 몫은 초록(오름) · 빨강(내림), 아래에 무엇 때문인지
  function statBlock(u) {
    const box = el("div", "bmstats");
    const { buffs, debuffs, keys } = effectsOf(u);
    const all = [...buffs, ...debuffs].filter((x) => x.stat);
    // gearWhy — 장비 몫을 나눠 적을 때(회복력: 장비 공격 +N · 장비 회복력 +N)
    const row = (ko, base, gear, now, stat, unit = "", gearWhy = null) => {
      const r = el("div", "bmstat");
      r.appendChild(el("span", "bslab", ko));
      const v = el("span", "bsval");
      v.appendChild(el("span", "bsbase", `${base}${gear ? ` +${gear}` : ""}${unit}`));
      const d = now - (base + gear);
      if (d) { v.appendChild(el("span", "bsarrow", "→")); v.appendChild(el("b", "bsnow " + (d > 0 ? "up" : "down"), `${now}${unit}`)); }
      r.appendChild(v);
      // 장비 몫은 숫자 옆에 금빛으로(+3) 보인다 — 밑에 「장비 +3」 을 또 적지 않는다. 버프 · 키워드 출처만 아래에
      if (gear) v.firstChild.innerHTML = `${base}<i class="bsgear">+${gear}${unit}</i>`;
      const why = [];
      // 회복력은 공격력 버프도 탄다 — 그 출처도 같이 적는다
      for (const x of all) if (x.stat === stat || (stat === "heal" && x.stat === "atk")) why.push(`${pctTxt(x.v)} ${x.src || ""}${x.always ? "" : ` (${turnTxt(x.left)})`}`.trim());
      for (const k of keys) for (const sh of k.share) if (sh.stat === stat) why.push(`${pctTxt(sh.v)} 「${k.id}」 ${k.n}개`);
      if (why.length) r.appendChild(el("span", "bswhy", why.join(" · ")));
      box.appendChild(r);
    };
    if (u.side === "party") {
      const g = u.gearAdd || { atk: 0, def: 0, crit: 0, heal: 0 };
      row("공격력", u.atk - g.atk, g.atk, Math.max(1, Math.round(u.atk * (1 + C.statOf(st, u, "atk")))), "atk");
      row("방어력", u.def - g.def, g.def, Math.max(0, Math.round(u.def * (1 + C.statOf(st, u, "def")))), "def");
      row("치명", u.crit - g.crit, g.crit, Math.round(u.crit + C.statOf(st, u, "crit") * 100), "crit", "%");
      // 회복력 = 공격력 + 역할 몫 + 장비 「회복력 +N」(rules.js) — 공격력 장비 · 버프가 그대로 붙고, 「회복력 +N%」 가 곱해진다(run-fx healOf)
      const hNow = Math.round(RULES.healStat(Math.max(1, Math.round(u.atk * (1 + C.statOf(st, u, "atk")))), u.role, u.healPlus) * (1 + C.statOf(st, u, "heal")));
      row("회복력", RULES.healStat(u.atk - g.atk, u.role), (g.atk || 0) + (g.heal || 0), hNow, "heal", "",
        [g.atk ? `장비 공격 +${g.atk}` : null, g.heal ? `장비 회복력 +${g.heal}` : null]);
    }
    // 주는 · 받는 피해 — 0 이 아닐 때만(적은 공격력이 수마다 달라 이것만 보인다)
    for (const stat of ["dealt", "taken"]) {
      const v = Math.round(C.statOf(st, u, stat) * 100);
      if (!v) continue;
      const r = el("div", "bmstat");
      r.appendChild(el("span", "bslab", STAT_KO[stat]));
      const good = stat === "taken" ? v < 0 : v > 0;
      r.appendChild(el("span", "bsval")).appendChild(el("b", "bsnow " + (good ? "up" : "down"), `${v > 0 ? "+" : ""}${v}%`));
      const why = [];
      for (const x of all) if (x.stat === stat) why.push(`${pctTxt(x.v)} ${x.src || ""}${x.always ? "" : ` (${turnTxt(x.left)})`}`.trim());
      for (const k of keys) for (const sh of k.share) if (sh.stat === stat) why.push(`${pctTxt(sh.v)} 「${k.id}」 ${k.n}개`);
      if (why.length) r.appendChild(el("span", "bswhy", why.join(" · ")));
      box.appendChild(r);
    }
    return box.children.length ? box : null;
  }
  // 버프 · 디버프 — 하나씩, 남은 턴과 출처. 상태(취약 · 약화 …)는 낱말 풀이까지
  function effectSections(body, u) {
    const { buffs, debuffs } = effectsOf(u);
    const terms = new Map();
    for (const t of cardParts({ text: [...buffs, ...debuffs].filter((x) => x.id).map((x) => x.id).join(", ") }, null).terms) terms.set(t.ko, t.text);
    const sec = (title, list, cls) => {
      if (!list.length) return;
      body.appendChild(el("span", "bmsub", `${title} ${list.length}`));
      const ul = el("div", "bmfx " + cls);
      for (const x of list) {
        const r = el("div", "bmfxrow");
        const nm = r.appendChild(el("b", null, x.stat ? `${STAT_KO[x.stat]} ${pctTxt(x.v)}` : x.id));
        const ic = x.stat ? fxIcon(x.stat, x.v > 0 ? "up" : "down") : fxIcon(x.id);     // 싸움터 칩과 같은 그림
        if (ic) nm.insertBefore(ic, nm.firstChild);
        r.appendChild(el("span", "bmturn", x.always ? "늘" : turnTxt(x.left)));
        const why = x.stat ? x.src : terms.get(x.id) || null;
        if (why) r.appendChild(el("span", "bmsrc", why));
        ul.appendChild(r);
      }
      body.appendChild(ul);
    };
    sec("버프", buffs, "good");
    sec("디버프", debuffs, "bad");
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
    if (drag) stopDrag(true);
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
    // 쓰는 것은 끌어서만 — 아군 상태창의 얼굴을 적(또는 싸움터)에 놓는다. 쓸 수 없으면 그 까닭을
    const need = ultNeed(u.key);
    body.appendChild(el("p", "bmhint" + (why ? " no" : ""), why || (need === "party" ? "초상을 눌러 고른 뒤 아군을 누르거나, 아군에게 끌어 놓으면 씁니다" : need === "enemy" ? "초상을 눌러 고른 뒤 적을 누르거나, 적에게 끌어 놓으면 씁니다" : "초상을 눌러 고른 뒤 싸움터를 누르거나, 위로 끌어 놓으면 씁니다")));
    const row = el("div", "bmbtns");
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }
  // 적 정보 — 글을 줄이고 낱말로 읽는다(2026-10 사용자 「적 설명도 글이 너무 많다」).
  // 수는 한 알씩 — 아이콘 · 낱말 · 값 · 대상(아이콘은 싸움터의 마름모와 같은 INTENT_ICON). 대사(「…」)는 옆에 흐리게.
  // 판(단계)은 접어 두고 지금 판만 펼친다. 상태 · 대상의 아는 낱말(약화 · 방어 · AP …)은 밑줄 — 누르면 풀이
  const MOVE_KW = (it, v = it.v) => {
    const on = it.id ? `${it.id} ${it.n || 1}` : "";      // 맞은 사람에게 거는 상태
    return {
      attack: ["공격", v, ["앞줄", on]], back: ["공격", v, ["뒷줄", on]], attackAll: ["공격", v, ["전체", on]],
      multi: ["연타", `${v}×${it.n}`, ["앞줄", on]], block: ["방어", v, ["자신"]], guard: ["방어", v, ["적 전체"]],
      heal: ["회복", v, ["다친 적"]], selfHeal: ["회복", v, ["자신"]], thorns: ["반격", v, ["때린 사도"]],
      buff: [it.id || "강화", `+${v}`, ["자신"]], debuff: [it.id || "상태", v, ["파티 전체"]], jam: ["AP", `-${v}`, ["다음 턴"]],
      charge: ["모으기", "", ["다음 턴"]],
    }[it.t] || [it.t, v != null ? v : "", []];
  };
  const movePill = (it, v) => {
    const [kw, val, tgt] = MOVE_KW(it, v);
    const p = el("span", "fpill i-" + it.t);
    p.appendChild(el("i", "fico", INTENT_ICON[it.t] || "·"));
    p.appendChild(withKeywords(el("b", "fkw"), kw));
    if (val !== "" && val != null) p.appendChild(el("b", "fval", String(val)));
    const t = tgt.filter(Boolean);
    if (t.length) p.appendChild(withKeywords(el("span", "ftgt"), t.join(" · ")));
    p.title = INTENT_HELP[it.t] || "";
    return p;
  };
  // 모으기는 다음 턴의 큰 수까지 한 줄로 — ⏳ 모으기 → ✹ 공격 24 전체
  const moveKeys = (it, v) => {
    const k = el("span", "fkeys");
    k.appendChild(movePill(it, v));
    if (it.t === "charge" && it.next) { k.appendChild(el("span", "farrow", "→")); k.appendChild(movePill(it.next)); }
    return k;
  };
  const rushTag = (rn) => {
    const r = el("span", "frush" + (rn ? "" : " no"), rn ? `⚡${rn}` : "⚡✕");
    r.title = rn ? `예고된 뒤 카드 ${rn}장이면 즉시 행동` : "당겨지지 않습니다";
    return r;
  };
  // 적 특성(패시브)의 「언제」 와 「몇 번」 — combat.js foePassives 와 같은 뜻
  const FOE_ON = (p) => ({
    fightStart: "전투 시작", turnStart: "턴 시작", turnEnd: "턴 끝", hurt: "맞으면", rushed: "당겨지면",
    debuffed: "디버프 받으면", allyDown: "동료 쓰러지면", lowHp: `HP ${Math.round((p.at || 0) * 100)}%↓`,
    card: `${p.type ? p.type + " " : ""}카드 ${p.every ? `${p.every}장째` : "낼 때마다"}`,
  }[p.on] || p.on);
  const FOE_LIMIT = (p) => (p.on === "fightStart" || p.on === "lowHp") ? "1회" : p.limit === 0 ? "" : `턴 ${p.limit || 1}회`;
  function openFoe(u) {
    const box = openModal("foemodal");
    const face = el("div", "bmface foe");
    face.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "foe", still: true }));
    box.appendChild(face);
    const body = el("div", "bmbody");
    const nat = ENEMY_NATURE[u.key];
    const E = ENEMIES[u.key] || {};
    // 머리 — 갈래 · 성격 · 줄 · 이름 · 체력(판이 바뀌는 자리에 눈금) · 걸린 것
    const tags = el("div", "ftags");
    if (u.boss) tags.appendChild(el("span", "ftag boss", "보스"));
    else if (run.elite && !run.eventFight) tags.appendChild(el("span", "ftag elite", "엘리트"));
    if (nat) tags.appendChild(el("span", "ftag n" + nat, nat));
    tags.appendChild(el("span", "ftag", (u.row || E.row) === "back" ? "뒷줄" : "앞줄"));
    body.appendChild(tags);
    body.appendChild(el("h3", "bmname", u.ko));
    const hpl = el("div", "fhp");
    const bar = el("div", "fhpbar");
    const fill = el("i");
    fill.style.width = Math.max(0, Math.min(100, (Math.max(0, u.hp) / u.maxHp) * 100)) + "%";
    bar.appendChild(fill);
    for (const ph of [E.phase, E.phase && E.phase2]) if (ph && ph.at) { const t = el("s"); t.style.left = ph.at * 100 + "%"; bar.appendChild(t); }
    hpl.appendChild(bar);
    hpl.appendChild(el("span", "fhpn", u.dead ? "쓰러짐" : `${Math.max(0, u.hp)} / ${u.maxHp}`));
    if (u.block > 0) hpl.appendChild(withKeywords(el("b", "blk"), `방어 ${u.block}`));
    if (u.shield > 0) hpl.appendChild(withKeywords(el("b", "blk"), `실드 ${u.shield}`));
    body.appendChild(hpl);
    // 걸린 것 — 싸움터의 칩 그대로(올리면 출처). 상태 · 표식 이름은 밑줄로 풀이를 단다
    const sc = chips(u);
    const cs = Array.from(sc.children || []);
    if (cs.length) {
      const marks = effectsOf(u).keys;
      // 정보 창에서는 아이콘 옆에 이름(clab)도 보인다 — 그 이름에 밑줄
      cs.forEach((c, i) => {
        const t = Array.from(c.children || []).find((x) => x.className === "clab");
        if (!t) return;
        const mk = marks[i - (cs.length - marks.length)];
        c.replaceChild(withKeywords(el("span", "clab"), t.textContent, mk && mk.owner), t);
      });
      sc.className = "bmchips fchips";
      body.appendChild(sc);
    }
    // 지금 할 일 — 한 줄. 즉시 행동까지 몇 장 남았는지
    if (u.intent && !u.dead) {
      const it = u.intent, hit = C.intentHit(u), rn = C.rushOf(u), k = u.rushCnt || 0;
      body.appendChild(el("span", "bmsub", "지금 할 일"));
      const now = el("div", "fnow");
      now.appendChild(moveKeys(it, hit != null ? hit : it.v));
      const r = el("span", "frush big" + (!rn || u.sealed || u.rushedTurn ? " no" : k === rn - 1 ? " hot" : ""),
        u.sealed ? "봉인됨" : !rn ? "⚡ 안 당겨짐" : u.rushedTurn ? "⚡ 이번 턴 끝" : `⚡${k}/${rn} · ${rn - k}장 뒤 즉시`);
      r.title = "즉시 행동 — 이 수가 예고된 뒤 카드를 그 장수만큼 내면 당겨서 하고 새 수를 예고합니다. 턴마다 0장부터, 한 적은 내 턴에 한 번만";
      now.appendChild(r);
      now.appendChild(el("span", "fsay", `「${it.say}」${it.t === "charge" ? " — 기절 · 봉인으로 끊깁니다" : ""}`));
      body.appendChild(now);
    }
    // 패턴 — ⚡장수 · 수 한 알 · 대사. 지금 예고한 수에 금테
    const moveRows = (moves, open) => {
      const list = el("div", "fmoves");
      const seen = new Set();
      for (const it of moves) {
        if (seen.has(it.say)) continue;
        seen.add(it.say);
        const r = el("div", "fmove" + (u.intent === it && !u.dead ? " on" : ""));
        r.appendChild(rushTag(C.intentRush(it, E)));      // ⚡ 장수를 앞에 — 줄마다 같은 자리
        r.appendChild(moveKeys(it));
        r.appendChild(el("span", "fsay", (it === open ? "첫 턴 · " : "") + it.say));
        list.appendChild(r);
      }
      return list;
    };
    const moves = [...(E.open ? [E.open] : []), ...(E.intents || [])];
    const order = E.pick === "shuffle" ? "무작위" : "순서대로";
    if (E.phase && E.phase.intents) {
      // 단계 — 「2단계 · HP 55%↓」 머리만, 지금 판만 펼친다
      body.appendChild(el("span", "bmsub", `단계 · ${order}`));
      const stages = [[null, moves, !u.phased], [E.phase, E.phase.intents, u.phased && !u.phased2]];
      if (E.phase2 && E.phase2.intents) stages.push([E.phase2, E.phase2.intents, !!u.phased2]);
      stages.forEach(([ph, list, on], i) => {
        const d = el("details", "fphase" + (on && !u.dead ? " on" : ""));
        d.open = !!on;
        const s = el("summary");
        s.appendChild(el("b", null, `${i + 1}단계`));
        s.appendChild(el("span", "fphat", ph ? `HP ${Math.round(ph.at * 100)}%↓` : "처음"));
        if (on && !u.dead) s.appendChild(el("span", "fnowtag", "지금"));
        if (ph && ph.say) s.appendChild(el("span", "fsay", `「${ph.say}」`));
        d.appendChild(s);
        d.appendChild(moveRows(list, i === 0 ? E.open : null));
        body.appendChild(d);
      });
    } else if (moves.length) {
      body.appendChild(el("span", "bmsub", `패턴 · ${order}`));
      body.appendChild(moveRows(moves, E.open));
    }
    // 특성 — 이름 · 언제 → 무엇을 · 몇 번
    if (E.passives && E.passives.length) {
      body.appendChild(el("span", "bmsub", "특성"));
      const pl = el("div", "fmoves");
      for (const p of E.passives) {
        const r = el("div", "fpass");
        r.appendChild(el("b", "fpname", p.name));
        r.appendChild(el("span", "fpon", FOE_ON(p)));
        r.appendChild(el("span", "farrow", "→"));
        r.appendChild(moveKeys(p.do));
        const lim = FOE_LIMIT(p);
        if (lim) r.appendChild(el("span", "fplim", lim));
        pl.appendChild(r);
      }
      body.appendChild(pl);
    }
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
      body.appendChild(el("p", "bmhelp", "이 판은 지금 자리 그대로 저장되어 있습니다 — 로비의 「이어하기」로 돌아옵니다."));
      const row = el("div", "bmbtns");
      const yes = el("button", "bmuse" + (saveOk() ? "" : " danger"), "나갑니다");   // 저장되면 그냥 나가는 것 — 빨간 경고는 판이 사라질 때만
      yes.onclick = () => { closeModal(); clearGround(); if (onQuit) onQuit(); };
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
      const b = el("button", "mitem quit" + (saveOk() ? "" : " danger"));
      b.appendChild(el("b", null, "메인화면으로"));
      b.appendChild(el("span", null, saveOk() ? "판은 저장됩니다 — 로비에서 이어하기" : "저장할 수 없는 브라우저입니다 — 나가면 이 판은 사라집니다"));
      b.onclick = () => openMenu("quit");
      q.appendChild(b);
      body.appendChild(q);
    }
  }

  // 사도 정보 — 체력 · 걸린 것 · 패시브 · 전용 키워드 · 고학년 스킬
  // 키워드 풀이를 짧게 — 앞의 꾸밈말(「— 」 앞뒤의 그림 같은 문장)은 걷고, 패시브 목록에 이미 뜬 규칙(「X」가 N개가 되면 …)도 뺀다.
  // 남는 것: 「최대 5 · 1개당 공격력 +5% · 적에게 거는 표식」 같은 수치. 원문은 올리면(title) 다 보인다
  function kwBrief(text, rules) {
    const shown = new Set((rules || []).map((r) => String(r.text || "").replace(/\s+/g, "")));
    const parts = String(text || "").split(/(?<=[.다])\s+/).map((x) => x.trim()).filter(Boolean);
    const keep = parts.filter((x, i) => !(i === 0 && /—/.test(x)) && !shown.has(x.replace(/[.\s]/g, "").replace(/:$/, "")) && !/^「[^」]+」(?:이|가)\s*\d+개가 되면/.test(x))
      .map((x) => shortText(x).replace(/[.]$/, "").replace(/^(?:적에게|아군에게) 거는 표식이다$/, (m) => m.replace("이다", "")));
    return keep.join(" · ") || shortText(String(text || "").split(" — ").pop());
  }
  // 장비 칸 셋 — 아이콘 · 이름(애착이면 표시) · 스탯, 그 밑에 그 장비가 하는 일(효과 · 애착 줄을 이름: 글 로 나눠 한 줄씩)
  function gearSection(u) {
    const wrap = el("div", "bmgearwrap");
    wrap.appendChild(el("span", "bmsub", "장비"));
    const gl = el("div", "bmgear");
    const gg = R.gearOf(run, u.key);
    for (const sl of RULES.SLOTS) {
      const e = gg[sl] ? EQUIP[gg[sl]] : null;
      const cell = el("div", "bmgslot" + (e ? "" : " empty"));
      const head = el("div", "bmghead");
      head.appendChild(e ? equipIcon(e, 40) : emptySlotIcon(sl, 40));
      const t = el("div");
      t.appendChild(el("b", null, e ? e.ko : `${sl} 없음`));
      if (e) t.appendChild(el("span", null, statText(R.statsOf(e.id, u.key))));
      head.appendChild(t);
      cell.appendChild(head);
      if (e) {
        const lines = [];
        const split = (txt, tag) => { for (const seg of String(txt || "").split(" · ")) { const m = seg.match(/^([^:]{1,14}):\s*(.+)$/); lines.push([m ? m[1] : null, shortText(m ? m[2] : seg), tag]); } };
        if (e.effect) split(e.effect, null);
        if (e.affinity === u.key && e.affinityPassive) split(e.affinityPassive, "애착");
        for (const [nm, txt, tag] of lines.slice(0, 3)) {
          const ln = el("p", "bmgfx");
          if (tag) ln.appendChild(el("i", "bmgaff", tag));
          if (nm) ln.appendChild(el("b", null, nm));
          ln.appendChild(withKeywords(el("span"), txt, u.key));
          cell.appendChild(ln);
        }
        cell.classList.add("eqtap");
        cell.onclick = () => showEquip(e.id, { heroKey: u.key });
      }
      gl.appendChild(cell);
    }
    wrap.appendChild(gl);
    return wrap;
  }
  function openHero(u) {
    const h = HERO(u.key);
    const box = openModal("heromodal");
    const face = el("div", "bmface hero");
    face.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 0, slot: "event", still: true }));
    box.appendChild(face);
    const body = el("div", "bmbody");
    const nat = C.natureOf(u.key);
    // 머리 — 성격 · 역할 · 열 · 종족을 알약 꼬리표로(낱말을 가운뎃점으로 잇던 한 줄 대신 — 한눈에 색으로 읽힌다)
    const tags = el("div", "ftags rvtags");
    if (nat) tags.appendChild(el("span", "ftag n" + nat, nat));
    tags.appendChild(el("span", "ftag role", h.role));
    tags.appendChild(el("span", "ftag", ROW_KO[u.row]));
    tags.appendChild(el("span", "ftag", h.race));
    if (h.eldain) tags.appendChild(el("span", "ftag eldain", "엘다인"));
    body.appendChild(tags);
    body.appendChild(el("h3", "bmname", u.ko));
    // 체력 — 적 정보 창과 같은 막대
    if (!u.dead) {
      const hp = el("div", "fhp");
      const bar = el("div", "fhpbar hero");
      const fill = el("i");
      fill.style.width = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)) + "%";
      bar.appendChild(fill);
      hp.appendChild(bar);
      hp.appendChild(el("span", "fhpn", `${Math.max(0, u.hp)} / ${u.maxHp}`));
      body.appendChild(hp);
    }
    const meter = el("div", "bmmeter");
    if (u.dead) meter.appendChild(el("span", null, "쓰러졌습니다"));
    if (u.block > 0) meter.appendChild(el("b", "blk", `방어 ${u.block}`));
    if (u.shield > 0) meter.appendChild(el("b", "blk", `실드 ${u.shield}`));
    body.appendChild(meter);
    // 능력치 — 기본(+장비) → 지금, 무엇 때문인지
    const sb = statBlock(u);
    if (sb) body.appendChild(sb);
    // 장비 — 능력치 바로 밑에(맨 아래에 묻혀 있었다). 칸마다 아이콘 · 이름 · 스탯, 그 밑에 하는 일을 한 줄씩
    body.appendChild(gearSection(u));
    // 패시브 — 규칙 한 줄마다 지금 형편(N장째 · 이번 턴 발동했나)
    const rules = (st.passives || {})[u.key] || [];
    if (rules.some((r) => !r.gear)) {
      body.appendChild(el("span", "bmsub", "패시브"));
      const pl = el("dl", "bmterms bmpass");
      rules.forEach((r, i) => {
        if (r.gear) return;                 // 장비 줄은 위 장비 칸에 이미 있다(두 번 읽히던 것)
        const id = `${u.key}|${i}`;
        const tags = [];
        // 누구 것을 세나를 칩에도 — 「에르핀 공격 1/3」(그 사도 것만) · 「파티 2장」(파티 전체, 이번 턴)
        const whose = r.when.who === "any" ? "파티" : u.ko;
        if (r.when.every) {
          const cnt = (st.counts || {})[r.when.perTurn ? `${id}|${st.turn}` : id] || 0;
          tags.push(`${whose} ${r.when.type || "카드"} ${cnt % r.when.every}/${r.when.every}${r.when.perTurn ? " · 이번 턴" : ""}`);
        }
        if (r.when.nth) tags.push(`파티 ${st.playedThisTurn || 0}장 · ${r.when.nth}장째에`);
        for (const c of r.conds || []) {
          if (c.c === "playedMax" || c.c === "playedMin") tags.push(`파티 ${st.playedThisTurn || 0}장`);
          if (c.c === "ownNone") tags.push(`${u.ko} 이번 턴 ${(st.playedBy || {})[u.key] || 0}장`);
        }
        if (r.limit) {
          const used = (st.fired || {})[`${id}|${r.limit.per === "turn" ? st.turn : "f"}`] || 0;
          tags.push(used >= r.limit.n ? (r.limit.per === "turn" ? "이번 턴 끝" : "이번 전투 끝") : `${r.limit.per === "turn" ? "이번 턴" : "이번 전투"} ${used}/${r.limit.n}`);
        }
        if (r.when.on === "fightStart") tags.push("전투 시작에 했음");
        const dt = el("dt", null, r.gear ? `${r.name} · 장비` : r.name);
        pl.appendChild(dt);
        const dd = withKeywords(el("dd"), shortText(r.text), u.key);
        for (const t of tags) dd.appendChild(el("span", "bmtag" + (/끝|했음/.test(t) ? " spent" : ""), t));
        pl.appendChild(dd);
      });
      body.appendChild(pl);
    }
    // 버프 · 디버프 — 하나씩, 남은 턴과 출처
    effectSections(body, u);
    // 키워드 — 내 것(지금 몇 개 · 누구에게) · 받은 표식(누가 걸었나)
    const keysNow = effectsOf(u).keys;
    if ((h.keyword && h.keyword.ko) || keysNow.length) {
      body.appendChild(el("span", "bmsub", "키워드"));
      const kl = el("dl", "bmterms");
      const mine = h.keyword && h.keyword.ko;
      if (mine) {
        const kw = (st.kw || {})[h.keyword.ko];
        const held = kw && kw.carrier !== "self"
          ? [...st.party, ...st.enemies].filter((x) => !x.dead && (x.status || {})[kw.id]).map((x) => `${x.ko} ${x.status[kw.id]}`)
          : [];
        const self = ((st.stacks || {})[u.key] || {})[h.keyword.ko] || 0;
        const now = kw && kw.carrier !== "self" ? (held.length ? held.join(" · ") : "아무도 없음") : `${self}개`;
        kl.appendChild(el("dt", null, `${h.keyword.ko} · 내 것`));
        const dd = el("dd", null, kwBrief(h.keyword.text, rules));
        dd.title = h.keyword.text || "";
        dd.appendChild(el("span", "bmtag", `지금 ${now}`));
        kl.appendChild(dd);
      }
      for (const k of keysNow) {
        if (mine && k.id === h.keyword.ko && k.owner === u.key) continue;
        const oh = HERO(k.owner);
        kl.appendChild(el("dt", null, `${k.id} ${k.n} · ${oh.ko}에게서`));
        const dd = el("dd", null, kwBrief((oh.keyword || {}).text, []));
        dd.title = (oh.keyword || {}).text || "";
        for (const sh of k.share) dd.appendChild(el("span", "bmtag", `${STAT_KO[sh.stat]} ${pctTxt(sh.v)}`));
        kl.appendChild(dd);
      }
      body.appendChild(kl);
    }

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

  // 카드 크게 보기(카제나식, 2026-10) — 왼쪽에 카드를 크게, 오른쪽에 그 카드에 나오는 낱말 풀이를 전부 쌓아 자동으로.
  // 신탁 · 겨우살이의 축복이 붙었으면 그것도 맨 위에. 낱말은 카드 안과 풀이 머리가 같은 빛깔(.kw · .ktip b).
  // 길게 누르기 · 오른쪽 클릭으로 연다. 아무 데나 누르면 닫힌다(손 · 싸움터를 오래 가리지 않게)
  function cardTips(id, c) {
    const tips = [];
    const n = st.flash && st.flash[id];
    if (n && c.flashKo) tips.push({ ko: `신탁 · ${c.flashKo}`, text: "이 판에서 붙은 신탁 — 카드 글이 바뀐 모습입니다", kind: "flash" });
    const sh = st.shin && st.shin[id];
    if (sh) {
      const [nm, eff] = (RULES.shinLabel(CARDS[id], sh) || "").split(" — ");
      tips.push({ ko: `✦ ${nm || "겨우살이의 축복"}`, text: eff || "", kind: "bless" });
    }
    // 카드 글에 실제로 나오는 낱말만 — 풀이 속 낱말(「방어」 풀이의 「소멸」)까지 끌려 나오면 카드에 없는 말이 섞였다
    const { action, terms } = cardParts(c, c.hero);
    for (const t of terms) if (action.includes(t.ko) || (c.tags || []).includes(t.ko)) tips.push({ ko: t.ko, text: kwBriefText(t.text) || "풀이가 아직 없습니다.", kind: "kw" });
    const why = st.hand.includes(id) ? C.canPlay(st, id) : null;
    if (why) tips.push({ ko: "지금은 못 냅니다", text: why, kind: "no" });
    return tips;
  }
  // 낱말 풀이 한 줄 — 꾸밈말(「 — 」 앞)을 떼고 규칙만 짧게
  function kwBriefText(t) {
    const raw = String(t || "");
    const d = raw.indexOf(" — ");
    return shortText((d > 0 && d < 60 ? raw.slice(d + 3) : raw).trim());
  }
  function tipBox(tips) {
    const box = el("div", "ktips");
    for (const t of tips) {
      const b = el("div", "ktip k-" + t.kind);
      b.appendChild(el("b", null, t.ko));
      if (t.text) b.appendChild(el("p", null, t.text));
      box.appendChild(b);
    }
    return box;
  }
  function openCard(id) {
    const c = C.cardOf(st, id);
    if (!c) return;
    closeModal();
    const back = el("div", "cardinspect");
    const calc = cardCalc(id);
    const big = bigCard({ ...c, cost: C.costOf(st, id) }, CARDART.pic[id] || null, calc);
    big.onclick = null; big.title = "";
    big.classList.add("cibig");
    back.appendChild(big);
    const side = el("div", "ciside");
    const who = el("div", "ciwho");
    who.appendChild(el("span", null, c.hero ? `${HERO(c.hero).ko}의 카드` : "공용 카드"));
    if (c.xcost) who.appendChild(el("span", null, "남은 AP 를 모두 씁니다"));
    side.appendChild(who);
    const tips = cardTips(id, c);
    if (tips.length) side.appendChild(tipBox(tips));
    else side.appendChild(el("p", "cinone", "따로 풀이할 낱말이 없는 카드입니다"));
    side.appendChild(el("small", "cihint", "아무 데나 누르면 닫힙니다"));
    back.appendChild(side);
    const close = () => { back.remove(); if (modal === back) modal = null; document.removeEventListener?.("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    back.onclick = close;
    document.addEventListener?.("keydown", esc);
    document.body.appendChild(back);
    modal = back;
  }
  // 든 카드의 낱말 풀이 — 카드를 눌러 들어 올리면 그 카드 위에 작게 뜬다(누르는 것은 막지 않는다). 내려놓거나 내면 사라진다
  let liftTips = null;
  function paintLiftTips() {
    if (liftTips) { liftTips.remove(); liftTips = null; }
    if (selCard < 0 || st.over || !groundOk) return;
    const id = st.hand[selCard], c = id && C.cardOf(st, id);
    const src = hand.querySelector && hand.querySelector(`.card[data-i="${selCard}"]`);
    if (!c || !src || !src.getBoundingClientRect || !field.getBoundingClientRect) return;
    const tips = cardTips(id, c).filter((t) => t.kind !== "no");
    if (!tips.length) return;
    const box = tipBox(tips);
    box.classList.add("liftips");
    const r = src.getBoundingClientRect(), z = zNow();
    box.style.left = ((r.right + 8) / z) + "px";
    box.style.bottom = ((innerHeight - r.top - 10) / z) + "px";
    document.body.appendChild(box);
    // 화면 오른쪽을 넘으면 카드 왼쪽으로
    const br = box.getBoundingClientRect();
    if (br.right > innerWidth - 8) box.style.left = ((r.left - 8 - br.width) / z) + "px";
    liftTips = box;
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
    // 고르기 전에 원래 효과를 견준다 — 이미 신탁이 붙은 카드면 지금 모습(「지금」)
    if (g.kind !== "hero") {
      const now = C.cardOf(st, cardId), lit = !!(st.flash && st.flash[cardId]);
      box.appendChild(effectBox(now, lit ? "지금" : "원래 효과", `「${base.name}」 · 비용 ${now.xcost ? "X" : now.cost}${lit && now.flashKo ? ` · 신탁 「${now.flashKo}」` : ""}`));
    }
    const row = el("div", "epirow");
    g.options.forEach((opt, i) => {
      const cell = el("button", "epiopt");
      let card;
      if (g.kind === "hero") card = bigCard(CARDS[opt], CARDART.pic[opt] || null);
      else {
        const f = (base.flash || [])[opt.n - 1] || {};
        card = bigCard(flashed(base, opt.n), CARDART.pic[cardId] || null);
        cell.appendChild(el("span", "epikind", f.kind || f.ko || ""));   // 자유 신탁은 분류 대신 이름
        if (opt.shin) { cell.classList.add("shin"); cell.appendChild(el("span", "epishin", `겨우살이의 축복 · ${RULES.shinLabel(base, opt.shin)}`)); }
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

  // 아군 고르기 — 적과 아군을 둘 다 고르는 카드의 아군 쪽. 버릴 카드 고르기 창과 같은 모양
  function pickAlly(handIdx, done) {
    const played = C.cardOf(st, st.hand[handIdx]);
    const back = el("div", "dcpick");
    const box = el("div", "dcbox");
    back.appendChild(box);
    const head = el("div", "dchead");
    head.appendChild(el("b", null, "아군을 고릅니다"));
    head.appendChild(el("span", null, `「${played.name}」 — ${played.text}`));
    box.appendChild(head);
    const grid = el("div", "dcgrid allypick");
    for (const u of st.party.filter((x) => !x.dead)) {
      const b = el("button", "dccell");
      b.type = "button";
      b.appendChild(art.portrait(u.key, { ko: u.ko, tint: u.tint, size: 72, slot: "ally", still: true }));
      b.appendChild(el("b", null, u.ko));
      b.appendChild(el("span", null, `HP ${u.hp} / ${u.maxHp}`));
      b.onclick = () => { back.remove(); done(u.idx); };
      grid.appendChild(b);
    }
    box.appendChild(grid);
    const foot = el("div", "dcfoot");
    const cancel = el("button", "dccancel", "취소");
    cancel.onclick = () => { back.remove(); done(null); };
    foot.appendChild(cancel);
    box.appendChild(foot);
    document.body.appendChild(back);
  }

  // 낸 카드가 손(끌어 놓았으면 놓은 자리)에서 대상 — 대상이 없으면 주인 — 에게 날아가며 사라진다.
  // 다시 그리면 손패가 바뀌니 내기 전에 떠 두고(이 함수), 다 그린 뒤 돌려준 것을 부른다. 움직임 줄이기면 아무것도 안 한다
  function cardFly(handIdx, targetIdx) {
    const at = dropAt; dropAt = null;
    const none = () => {};
    if (!groundOk || calmNow() || typeof Element !== "function" || !Element.prototype.animate) return none;
    const src = hand.querySelector(`.card[data-i="${handIdx}"]`);
    if (!src || !src.offsetWidth) return none;
    const r = at && performance.now() - at.t < 500 ? at.r : src.getBoundingClientRect();
    if (!r.width) return none;
    const id = st.hand[handIdx], c = C.cardOf(st, id), need = targetsNeeded(id), z = zNow();
    const w = src.offsetWidth, h = src.offsetHeight, s0 = r.width / z / w;
    const cx = (r.left + r.width / 2) / z, cy = (r.top + r.height / 2) / z;
    const ghost = src.cloneNode(true);
    ghost.className = src.className.replace(/\b(dragging|sel|no)\b/g, "") + " flycard";
    ghost.removeAttribute("style");
    Object.assign(ghost.style, { left: cx - w / 2 + "px", top: cy - h / 2 + "px", width: w + "px", height: h + "px" });
    return () => {
      const owner = c && c.hero ? st.party.find((u) => u.key === c.hero) : null;
      const tn = need === "enemy" ? unitNode("enemy", targetIdx) : need === "party" ? unitNode("party", targetIdx) : owner ? unitNode("party", owner.idx) : null;
      const tr = (tn && (artOf(tn) || tn).getBoundingClientRect()) || field.getBoundingClientRect();
      const dx = (tr.left + tr.width / 2) / z - cx, dy = (tr.top + tr.height * 0.45) / z - cy;
      document.body.appendChild(ghost);
      const an = ghost.animate([
        { transform: `scale(${s0})`, opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(${s0 * 0.7}) rotate(4deg)`, opacity: 0.95, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s0 * 0.25}) rotate(10deg)`, opacity: 0 },
      ], { duration: 220, easing: "cubic-bezier(.45, 0, .8, .6)", fill: "forwards" });
      an.onfinish = () => ghost.remove();
      later(500, () => ghost.remove());
    };
  }

  function play(targetIdx, allyIdx) {
    if (selCard < 0) return;
    const glowId = st.hand[selCard], g = glowId && C.glowOf(st, glowId);
    // 은총 — 고르지 않는다. 무작위 고유 카드 하나가 곧장 손에(그 턴 비용 0), 가운데에 잠깐 띄운다
    if (g && g.kind === "hero" && !C.canPlay(st, glowId)) {
      C.applyEpiphany(st, glowId, 0);
      showGrace(g.hero, g.options[0]);
      setTimeout(() => lootCard(g.options[0], `은총 · ${HERO(g.hero).ko}`), 900);
      selCard = st.hand.indexOf(glowId);
    } else if (g && !C.canPlay(st, glowId)) {
      // 고르는 중인 신탁도 판에 적는다 — 닫을 수 없는 창이라, 새로고침해도 이 창으로 돌아와 고르게 한다
      st.pendingEpi = { cardId: glowId, targetIdx };
      writeSave(run, st);
      openEpiphany(glowId, g, (choice) => {
        delete st.pendingEpi;
        C.applyEpiphany(st, glowId, choice);
        writeSave(run, st);              // 고른 신탁을 곧장 적는다 — 이어서 묻는 창(아군 · 버릴 카드)에서 새로고침해도 다시 고를 수 없게
        const o = g.options[choice], f = (CARDS[glowId].flash || [])[o.n - 1] || {};
        lootCard(glowId, `신탁 「${f.kind || f.ko || ""}」${o.shin ? ` · 축복(${RULES.shinLabel(CARDS[glowId], o.shin)})` : ""}`);
        selCard = st.hand.indexOf(glowId);
        play(targetIdx);
      });
      return;
    }
    // 적과 아군을 둘 다 고르는 카드(「적 1명 …, 아군 1명 …」) — 적에 놓은 뒤 아군을 한 번 더 묻는다.
    // 전에는 아군 쪽이 늘 카드 주인에게 갔다
    const pc = C.cardOf(st, st.hand[selCard]);
    if (allyIdx == null && C.canPlay(st, st.hand[selCard]) == null && targetsNeeded(st.hand[selCard]) === "enemy"
      && (pc.fx || []).some((f) => f.target === "oneAlly") && st.party.filter((u) => !u.dead).length > 1) {
      const at = selCard;
      pickAlly(at, (idx) => {
        if (idx == null) { selCard = -1; draw(); return; }   // 물렀다
        selCard = at; play(targetIdx, idx);
      });
      return;
    }
    const opts = allyIdx != null ? { ally: allyIdx } : {};
    // 「손패 N장 버리」 — 무작위가 아니면 낸 사람이 고른다. 고르고 나서 카드가 돈다(버린 뒤 드로우 따위가 이어진다)
    const need = C.discardChoice(st, selCard);
    if (need > 0) {
      const at = selCard;
      pickDiscard(at, need, (ids) => {
        if (!ids) { selCard = -1; draw(); return; }       // 물렀다 — 카드는 손에 남는다
        const fly = cardFly(at, targetIdx);
        const played = C.cardOf(st, st.hand[at]);
        const bsh = st.shin && st.shin[st.hand[at]], bcard = CARDS[st.hand[at]];
        const r = C.playCard(st, at, targetIdx, { ...opts, discard: ids });
        try { r.ok ? SFX.card(played, played && played.hero, { motion: groundOk && !calmNow() }) : SFX.play("card.cant"); } catch { /* 소리 */ }
        selCard = -1;
        if (!r.ok) say(r.why);
        draw();
        if (r.ok) { fly(); blessFx(bcard, bsh); }
      });
      return;
    }
    const fly = cardFly(selCard, targetIdx);
    const playedNow = C.cardOf(st, st.hand[selCard]);
    const bsh = st.shin && st.shin[st.hand[selCard]], bcard = CARDS[st.hand[selCard]];
    const r = C.playCard(st, selCard, targetIdx, opts);
    try { r.ok ? SFX.card(playedNow, playedNow && playedNow.hero, { motion: groundOk && !calmNow() }) : SFX.play("card.cant"); } catch { /* 소리 */ }
    selCard = -1;
    if (!r.ok) say(r.why);
    draw();
    if (r.ok) { fly(); blessFx(bcard, bsh); }
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
      cell.appendChild(bigCard(c, CARDART.pic[id] || null, cardCalc(id)));
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

  endBtn.onclick = () => {
    try { SFX.play("turn.end"); } catch { /* 소리 */ }
    selCard = -1;
    sweepOut();
    // 남은 카드(보존)만 「있던 것」 으로 — 새로 뽑은 카드는 뽑을 더미에서 날아온다
    handSeen = countIds(st.hand.filter((id) => ((C.cardOf(st, id) || {}).tags || []).includes("보존")));
    C.endTurn(st);
    draw();
  };

  function finish() {
    if (liftTips) { liftTips.remove(); liftTips = null; }
    endBtn.disabled = true;
    hand.querySelectorAll("button").forEach((b) => (b.disabled = true));
    R.afterFight(run, st);
    if (st.over !== "win") {
      run.where = { k: "fightDone", result: st.over }; writeSave(run);
      // 졌다 — 남은 몸짓이 끝나면 싸움터가 잿빛으로 가라앉고 「전멸」 이 내려앉는다(바로 넘어가면 무엇이 끝났는지 몰랐다)
      const calm = !groundOk || calmNow();
      const wait = calm ? 0 : Math.max(0, fxEnd - performance.now()) + 200;
      later(wait, () => {
        if (!calm) {
          s.classList.add("defeat");
          const ban = el("div", "defeatban");
          ban.appendChild(el("b", null, "전멸"));
          ban.appendChild(el("small", null, "모두 쓰러졌습니다"));
          field.appendChild(ban);
          try { SFX.play("defeat"); } catch { /* 소리 */ }
        }
        setTimeout(() => { clearGround(); onDone(st.over); }, calm ? 700 : 2200);
      });
      return;
    }
    if (loot) {
      // 떨어진 것을 챙긴다 — 장비는 가방으로. 아직 못 떨궜으면(마지막 한 방에 여럿) 여기서
      dropItems({ x: (innerWidth || 1600) * 0.7, y: (innerHeight || 900) * 0.4 });
      if (loot.equip && loot.equip.length && !loot.equipTaken) R.takeEquip(run, loot.equip[0]);
      R.takeReward(run, null);                 // 골드 — 판에는 바로 들어간다. 화면은 사도들이 주우며 올린다
    }
    // 판에 다 남긴 뒤 적는다 — 금화를 줍는 연출 중에 새로고침해도 다음 칸(main.js)으로 넘어간다
    run.where = { k: "fightDone", result: st.over };
    writeSave(run);
    // 남은 몸짓이 끝나면 살아남은 사도들이 기뻐하고(Victory), 오른쪽으로 달려가며 바닥의 금화를 줍는다 → 얻은 것을 보이고 넘어간다
    const cheer = cheerFx();
    // 승리 — 사도들이 기뻐하는 때에 맞춰 금빛 띠
    if (groundOk && !calmNow()) later(Math.max(0, cheer - 1500), () => {
      const ban = el("div", "winban");
      ban.appendChild(el("b", null, "승리"));
      field.appendChild(ban);
      later(1500, () => ban.remove());
    });
    later(cheer, () => walkOut(() => {
      if (loot) {
        lootBox.classList.add("on", "done");
        lootBox.querySelector(".lthead").textContent = "승리 — 얻은 것";
        if (!lootList.children.length) lootList.appendChild(el("p", "ltnone", "이번에는 떨어진 것이 없습니다"));
      }
      setTimeout(() => { clearGround(); onDone(st.over); }, loot ? 1300 : 500);
    }));
  }

  // 이어하기 — 이미 쓰러진 적의 골드 · 장비와 이 싸움에서 얻은 은총 · 신탁을 「얻은 것」 에 다시 올린다(판은 그대로)
  if (resumed) {
    for (const u of st.enemies) {
      if (!u.dead) continue;
      goneFoes.add(u.idx);
      if (u.idx === carrier && loot && !itemsDropped) { itemsDropped = true; if (loot.equip && loot.equip[0]) dropEquip(loot.equip[0]); }
      if (goldShare[u.idx]) addGold(goldShare[u.idx]);
    }
    for (const id of (st.gained && st.gained.cards) || []) if (CARDS[id]) lootCard(id, `은총 · ${HERO(CARDS[id].hero).ko}`);
    for (const f of (st.gained && st.gained.flash) || []) if (CARDS[f.cardId]) lootCard(f.cardId, `신탁 「${((CARDS[f.cardId].flash || [])[f.n - 1] || {}).ko || ""}」`);
  }
  draw();
  openFx(!resumed);
  // 신탁을 고르던 중이었으면 그 창을 다시 연다 — 같은 카드 · 같은 선택지
  if (st.pendingEpi) {
    const p = st.pendingEpi;
    selCard = st.hand.indexOf(p.cardId);
    if (selCard >= 0 && C.glowOf(st, p.cardId)) play(p.targetIdx);
    else { delete st.pendingEpi; selCard = -1; }
  }
  return s;
}

// 적의 수 아이콘 — 싸움터의 마름모와 적 정보 창이 같은 것을 쓴다(치는 수의 마름모는 숫자)
const INTENT_ICON = { attack: "⚔", multi: "⚔", back: "↷", attackAll: "✹", charge: "⏳", block: "🛡", guard: "🛡",
  heal: "✚", selfHeal: "✚", buff: "▲", debuff: "▼", jam: "✖", thorns: "✦" };
// 적의 수 — 마름모에 마우스를 올리면 뜨는 설명
const INTENT_HELP = {
  attack: "앞줄부터 칩니다", back: "뒷줄부터 칩니다", attackAll: "파티 전체를 칩니다",
  multi: "앞줄부터 여러 번 칩니다 — 방어가 먼저 벗겨집니다",
  charge: "힘을 모읍니다. 다음 턴에 예고한 수를 반드시 합니다 — 봉인하거나 수를 흐트러뜨리면 흩어집니다",
  block: "자기 방어를 올립니다", guard: "적 전체의 방어를 올립니다", heal: "체력이 가장 낮은 적을 회복합니다",
  buff: "스스로 강해집니다", debuff: "파티 전체에 상태를 겁니다", jam: "다음 턴 AP 를 깎습니다",
};

// 셋 넷이 서면 칸이 좁다 — 짧은 이름(온 이름은 올리면 · 정보 창에). 끝이 잘려 「요정 저주 인형…」 셋이 다 같아 보였다.
// 셋: 「요정 저주 인형 · 방패」 → 「요정 방패」. 넷: → 「방패」, 「마시멜로 응원단」 → 「응원단」
const shortFoe = (ko, n) => {
  const t = String(ko || "");
  if (n < 3) return t;
  const w = t.split(/\s*·\s*|\s+/).filter(Boolean);
  if (t.includes("·")) return n >= 4 ? w[w.length - 1] : `${w[0]} ${w[w.length - 1]}`;
  return n >= 4 && t.length > 6 && w.length > 1 ? w[w.length - 1] : t;
};

// 적의 성격 — enemies.js 가 들고 있다
const ENEMY_NATURE = {};
for (const [k, e] of Object.entries(ENEMIES)) if (e.nature) ENEMY_NATURE[k] = e.nature;
// 몬스터 스파인은 성격마다 한 벌씩 입는다 — 게임 파일의 스킨 이름
const NATURE_SKIN = { 순수: "Skin_Naive", 광기: "Skin_Mad", 냉정: "Skin_Cool", 우울: "Skin_Gloomy", 활발: "Skin_Jolly" };
