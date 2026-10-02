// 전투 화면. 규칙은 combat.js 가 쥐고 있고, 여기는 그리고 누른 것을 넘긴다. 같이 쓰는 조각은 ui-common.js.
import { CARDS, flashed } from "./cardbook.js";
import { TRAITS } from "./data/traits.js";
import { ENEMIES } from "./data/enemies.js";
import { EQUIP } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { cardParts } from "./card-text.js";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
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
import { HERO, TINT, NTINT, el, kwNote, hint, screen, TMARK, TKIND, goldIcon, openHelp, img, withKeywords, showCard, showPiles, natureClass, bigCard, setStageBg, statText, equipIcon, emptySlotIcon } from "./ui-common.js";

// 효과음 자리 — 전투 화면이 맞는 순간 · 고학년 · 카드 동작에 부른다. 효과음 모듈이 메서드를 갈아 끼운다(안 끼우면 조용하다).
//   hit(kind, heavy, crit)  맞는 순간마다 — kind 는 타격 갈래(slash 베기 · shot 쏘기 · magic 마법 · blunt 둔기), 받는 쪽은 kind 앞에 "ally:"
//   ult(heroKey, phase)     고학년 — "cast"(SD 동작 시작) · "impact"(첫 타격)
//   card(heroKey, anim)     카드 · 적의 수가 동작을 시작할 때 — anim 은 attack · skill
import { sfx as SFX } from "./sfx.js";
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
      const e = st.enemies.find((x) => x.idx === idx), mood = e && FOE_MOOD[ENEMY_NATURE[e.key]];
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
  function popNum(u, text, cls, sub) {
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
    p.appendChild(b);
    // 방어 · 실드 · 상태 글자는 조금 아래에 — 같은 순간의 피해 숫자를 덮지 않게
    const at = tag ? 0.58 : 0.32;
    const fs = /n-crit/.test(cls) ? 44 : /n-big/.test(cls) ? 40 : 30;
    const w = tag ? Math.max(70, String(text).length * 11 + 20) : String(text).length * fs * 0.62 + 22;   // 꼬리표는 글자 수만큼(「받는 피해 +25%」)
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
      popNum(u, String(h.v), "n-dmg" + (h.side === "party" ? " n-ally" : "") + (h.crit ? " n-crit" : "") + (heavy ? " n-big" : ""), h.crit ? "치명타" : null);
      const ms = Math.min(140, 70 + (heavy ? 25 : 0) + (h.crit ? 25 : 0) + (ult ? 30 : 0));
      stopFx(h.side, h.idx, ms);
      if (act && !ult && b && !b.stopped) { b.stopped = true; stopFx(act.side, act.idx, ms); }
      if (ult) shake(2); else if (heavy || h.crit) shake(1); else if (h.side === "party") shake(0);
      // 불꽃 · 밀려남 — 맞을 때마다. 화면 번쩍 · 당김은 세게 · 치명타 · 고학년만(고학년의 첫 타격은 사도 빛깔에 집중선까지)
      const kind = sparkFx(h, act, heavy, h.crit, ult, ult && b && !b.banged);
      knock(h.side, h.idx, Math.min(14, 6 + (heavy ? 4 : 0) + (h.crit ? 3 : 0) + (ult ? 3 : 0)), Math.min(190, 130 + (heavy || h.crit ? 30 : 0) + (ult ? 25 : 0)));
      const p = (heavy || h.crit || ult) && bodyOf(h.side, h.idx);
      if (ult && b && !b.banged) {
        b.banged = true;
        const hero = st.party.find((x) => x.idx === act.idx);
        bang(p, (hero && (hero.tint || TINT(hero.key))) || "#fff", 0.6, 110, true);
        punch(p, 1.045, 240);
      } else if (ult) punch(p, 1.02, 160);
      else if (h.crit) { bang(p, "#fff4d0", 0.36, 70); punch(p, 1.035, 190); }
      else if (heavy) { bang(p, h.side === "party" ? "#ffb0a0" : "#ffffff", 0.35, 60); punch(p, 1.025, 180); }
      sfx("hit", (h.side === "party" ? "ally:" : "") + kind, heavy || ult, !!h.crit);
    } else if (h.k === "heal") popNum(u, `+${h.v}`, "n-heal");
    else if (h.k === "block") popNum(u, `방어 +${h.v}`, "n-blk");
    else if (h.k === "shield") popNum(u, `실드 +${h.v}`, "n-shd");
    else if (h.k === "status") {
      // 같은 꼬리표가 같은 사람에게 잇달면(한 수에 같은 증감이 두 번 · 패시브가 겹쳐 걸림) 한 번만
      const k = ukey(u) + "|" + h.id, t0 = performance.now();
      if (t0 - (sttAt.get(k) || -1e9) < 450) return;
      sttAt.set(k, t0);
      popNum(u, h.id, "n-stt" + (h.up ? " n-up" : ""));
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
    playBeats(beats, 0);
  }
  // i0 번째 차례부터 지금을 0 으로 건다. 사도의 고학년 차례를 만나면 컷인을 띄우고 그 뒤는 시각만 잰다 —
  // 컷인이 끝나면(눌러 넘기면 바로) 그 차례부터 다시 건다. 새 수가 오면 걸어 둔 것과 함께 버려진다
  function playBeats(beats, i0) {
    let t = 0, foes = false, cutAt = -1;
    for (let i = i0; i < beats.length; i++) {
      const b = beats[i];
      const foe = !!b.act && b.act.side === "enemy", ult = !!b.act && b.act.anim === "ult";
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
      t = last + (foe ? 380 : 120);
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
    for (const u of [...st.party, ...st.enemies]) {
      if (u.dead) continue;
      viewOf(u.side, u.idx, 4000).then((v) => {
        if (!v) return;
        if (spawn && v.play("Spawn")) return;
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
      // 즉시 행동 — 이 수가 예고된 뒤로 카드를 N장 내면 당겨서 한다(수마다 N 이 다르다). 다음 한 장이면 붉게
      const rn = C.rushOf(u);
      if (rn && !u.sealed) {
        const k = u.rushCnt || 0;
        const rush = el("span", "rush" + (k === rn - 1 ? " hot" : ""), `⚡${k}/${rn}`);
        rush.title = `카드를 ${rn - k}장 더 내면 이 수를 즉시 합니다`;
        tag.appendChild(rush);
      }
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
        const fi = img(ultPic);
        fi.draggable = false;              // 그림을 잡으면 브라우저가 그림 끌기를 먼저 시작해 우리 끌기가 취소된다
        face.appendChild(fi);
        face.style.setProperty("--pct", Math.min(100, (st.gauge / ult.cost) * 100).toFixed(1));   // 둘레 고리가 이만큼 찬다
        b.appendChild(face);
      }
      b.appendChild(el("span", "ucost", `${ult.cost}%`));
      b.appendChild(el("span", "uname", ult.ko));
      // 카드처럼 끌어다 놓아 쓴다(startUltDrag) — 누르기만 하면 자세히, 쓸 수 없으면 끌 때 까닭을 말한다
      b.title = why ? `${why} · 눌러서 자세히` : "끌어다 적에게 놓으면 씁니다 · 눌러서 자세히";
      b.setAttribute("aria-label", `${u.ko} 고학년 스킬 ${ult.ko} — ${b.title}`);
      b.onpointerdown = (e) => startUltDrag(e, u, b, why);
      b.oncontextmenu = (e) => { e.preventDefault(); if (drag) stopDrag(true); openUlt(u); };
      b.onclick = () => { if (!dragDone) openUlt(u); };
      box.appendChild(b);
      // 줄 어디를 잡아도(초상 · 이름) 단추를 잡은 것과 같다 — 단추만 잡히면 작아서 놓친다
      n.classList.add("ultgrab");
      n.onpointerdown = (e) => { if (!b.contains(e.target)) startUltDrag(e, u, b, why); };
      n.onclick = (e) => { if (!b.contains(e.target) && !dragDone) openUlt(u); };
    }

    n.appendChild(box);
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
    // 무엇을 하든(카드 · 고학년 스킬 · 턴 넘기기) 엔진은 그 자리에서 다 풀고 여기로 온다 — 그린 것이 보이기 전에 적어 둔다.
    // 끝난 싸움은 finish 가 판에 남긴 뒤 적는다
    // 시험 화면 — 게이지는 늘 300%, 적은 처음 한 번 체력 20배(오래 두고 본다)
    if (DEV && !st.over) {
      st.gauge = 300;
      st.lastUlt = null;                 // 시험 화면 — 같은 사도도 연달아 쓴다
      if (!st.devHp) { st.devHp = true; for (const e of st.enemies) { e.maxHp *= 20; e.hp = e.maxHp; } }
    }
    if (!st.over) writeSave(run, st);
    closeModal();
    const fxq = takeFx();
    bars.clear();
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

    fitChips();
    paintPreview(selCard, null);
    runFx(fxq);
    if (st.over) finish();
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
        more.title = hid.map((c) => c.textContent).join(" · ") + " — 눌러서 전부 보기";
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
    if (!r.ok) return say(r.why);
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
    body.appendChild(el("p", "bmhint" + (why ? " no" : ""), why || (need === "party" ? "끌어다 아군에게 놓으면 씁니다" : "끌어다 적에게 놓으면 씁니다")));
    const row = el("div", "bmbtns");
    const x = el("button", "bmclose", "닫기");
    x.onclick = closeModal;
    row.appendChild(x);
    body.appendChild(row);
    box.appendChild(body);
  }
  // 적 정보 — 누구인지 · 체력 · 걸린 상태 · 이번 수와 할 수 있는 수 전부
  const INTENT_DO = (it) => {
    const v = it.v != null ? it.v : "";
    return { attack: `앞줄을 칩니다 · 피해 ${v}`, back: `뒷줄을 칩니다 · 피해 ${v}`, attackAll: `파티 전체를 칩니다 · 피해 ${v}`,
      multi: `앞줄을 ${it.n}번 칩니다 · 피해 ${v}×${it.n}`, charge: "힘을 모읍니다 — 다음 턴에 큰 수",
      block: `방어 +${v}`, guard: `적 전체 방어 +${v}`, heal: `가장 다친 적 회복 ${v}`,
      buff: it.id ? `${it.id} +${v}` : "스스로 강해집니다", debuff: `아군 전체에 ${it.id || "상태"} ${v}`, jam: `다음 턴 AP -${v}` }[it.t] || it.t;
  };
  // 적 패시브의 「언제」 와 「몇 번」 — combat.js foePassives 와 같은 말
  const FOE_ON = (p) => ({
    fightStart: "전투 시작 시", turnStart: "턴 시작 시", turnEnd: "턴 끝에", hurt: "맞으면", rushed: "즉시 행동으로 당겨지면",
    debuffed: "디버프가 걸리면", allyDown: "동료가 쓰러지면", lowHp: `체력이 ${Math.round((p.at || 0) * 100)}% 아래로 떨어지면`,
    card: `파티가 ${p.type ? p.type + " " : ""}카드를 ${p.every ? `이번 턴 ${p.every}장째 낼 때마다` : "낼 때마다"}`,
  }[p.on] || p.on);
  const FOE_LIMIT = (p) => (p.on === "fightStart" || p.on === "lowHp") ? " (한 번)" : p.limit === 0 ? "" : ` (턴당 ${p.limit || 1}회)`;
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
      const rn = C.rushOf(u);
      body.appendChild(el("p", "bmhelp", rn
        ? `즉시 행동 — 이 수가 예고된 뒤로 카드를 ${rn}장 내면 당겨서 하고 새 수를 예고합니다(지금 ${u.rushCnt || 0}장). 새 수는 다시 0장부터, 턴이 바뀌어도 0장부터 셉니다.`
        : "이 수는 당겨지지 않습니다."));
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
      const rn = C.intentRush(it, E);
      list.appendChild(el("dt", null, it.say));
      list.appendChild(el("dd", null, `${INTENT_DO(it)}${rn ? ` · ⚡${rn}장` : " · 안 당겨짐"}`));
    }
    if (moves.length) {
      body.appendChild(el("span", "bmsub", E.pick === "shuffle" ? "할 수 있는 수 — 무작위(같은 수를 세 번 잇지 않습니다)" : "할 수 있는 수 — 적힌 순서대로"));
      body.appendChild(list);
    }
    if (E.phase) body.appendChild(el("p", "bmhelp", `체력이 ${Math.round(E.phase.at * 100)}% 아래로 떨어지면 수가 바뀐다${E.phase.say ? ` — 「${E.phase.say}」` : ""}`));
    // 적 패시브 — 언제 · 무엇을
    if (E.passives && E.passives.length) {
      const pl = el("dl", "bmterms bmmoves");
      for (const p of E.passives) {
        pl.appendChild(el("dt", null, p.name));
        pl.appendChild(el("dd", null, `${FOE_ON(p)} — ${p.do.t === "thorns" ? `때린 사도에게 ${p.do.v} 피해` : p.do.t === "selfHeal" ? `자기 체력 ${p.do.v} 회복` : INTENT_DO(p.do)}${FOE_LIMIT(p)}`));
      }
      body.appendChild(el("span", "bmsub", "패시브"));
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
      b.appendChild(el("span", null, saveOk() ? "판은 저장됩니다 — 로비에서 이어하기" : "저장할 수 없는 브라우저입니다 — 나가면 이 판은 사라집니다"));
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
        cell.appendChild(el("span", "epikind", `${"①②③④⑤"[opt.n - 1]} ${f.kind || f.ko || ""}`));   // 자유 신탁은 분류 대신 이름
        if (opt.shin) { cell.classList.add("shin"); cell.appendChild(el("span", "epishin", `겨우살이의 축복 · ${RULES.DIVINE_KO[opt.shin]}`)); }
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
        lootCard(glowId, `신탁 ${"①②③④⑤"[o.n - 1]} ${f.kind || f.ko || ""}${o.shin ? ` · 축복(${RULES.DIVINE_KO[o.shin]})` : ""}`);
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
        const r = C.playCard(st, at, targetIdx, { ...opts, discard: ids });
        try { r.ok ? SFX.card(played, played && played.hero, { motion: groundOk && !calmNow() }) : SFX.play("card.cant"); } catch { /* 소리 */ }
        selCard = -1;
        if (!r.ok) say(r.why);
        draw();
        if (r.ok) fly();
      });
      return;
    }
    const fly = cardFly(selCard, targetIdx);
    const playedNow = C.cardOf(st, st.hand[selCard]);
    const r = C.playCard(st, selCard, targetIdx, opts);
    try { r.ok ? SFX.card(playedNow, playedNow && playedNow.hero, { motion: groundOk && !calmNow() }) : SFX.play("card.cant"); } catch { /* 소리 */ }
    selCard = -1;
    if (!r.ok) say(r.why);
    draw();
    if (r.ok) fly();
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

  endBtn.onclick = () => { try { SFX.play("turn.end"); } catch { /* 소리 */ } selCard = -1; C.endTurn(st); draw(); };

  function finish() {
    endBtn.disabled = true;
    hand.querySelectorAll("button").forEach((b) => (b.disabled = true));
    R.afterFight(run, st);
    if (st.over !== "win") { run.where = { k: "fightDone", result: st.over }; writeSave(run); setTimeout(() => onDone(st.over), 700); return; }
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
    later(cheer, () => walkOut(() => {
      if (loot) {
        lootBox.classList.add("on", "done");
        lootBox.querySelector(".lthead").textContent = "승리 — 얻은 것";
        if (!lootList.children.length) lootList.appendChild(el("p", "ltnone", "이번에는 떨어진 것이 없습니다"));
      }
      setTimeout(() => { for (const c of ground) c.node.remove(); onDone(st.over); }, loot ? 1300 : 500);
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
    for (const f of (st.gained && st.gained.flash) || []) if (CARDS[f.cardId]) lootCard(f.cardId, `신탁 ${"①②③④⑤"[f.n - 1] || ""}`);
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
