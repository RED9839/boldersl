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
import { HERO, TINT, el, kwNote, hint, screen, TMARK, TKIND, goldIcon, openHelp, img, withKeywords, showCard, showPiles, natureClass, bigCard, setStageBg, statText, equipIcon, emptySlotIcon } from "./ui-common.js";

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
  const heroSwing = {};                     // 사도마다 공격 동작을 번갈아(Attack1_1 · Attack2_1)
  const unitNode = (side, idx) => {
    if (side === "enemy") return (foeEls.get(idx) || {}).n || null;
    const u = st.party.find((x) => x.idx === idx);
    return (u && standEls.get(u.key)) || null;
  };
  const artOf = (n) => (n && n.querySelector(":scope > .art")) || null;
  // 움직이는 그림 — 새로 만드는 중이면(첫 그림은 불러오느라 늦다) 조금 기다린다. 그림 한 장이면 null
  function viewOf(side, idx, wait = 400) {
    return new Promise((res) => {
      const t0 = Date.now();
      const look = () => {
        const a = artOf(unitNode(side, idx));
        if (a && a.spine) return res(a.spine);
        if (!a || !a.classList.contains("art-spine") || Date.now() - t0 > wait) return res(null);
        setTimeout(look, 40);
      };
      look();
    });
  }
  function actName(v, side, idx, anim) {
    if (side === "enemy") {
      const e = st.enemies.find((x) => x.idx === idx), mood = e && FOE_MOOD[ENEMY_NATURE[e.key]];
      const all = v.animations();
      const find = (base) => (mood && v.has(`${base}_${mood}`) ? `${base}_${mood}` : all.find((n) => n.toLowerCase().startsWith(base.toLowerCase())));
      return [anim === "skill" ? find("Skill1_1") || find("Attack1_1") : find("Attack1_1") || find("Skill1_1")];
    }
    if (anim === "ult" && v.has("Ultimate1_1")) {
      const chain = [];
      for (let k = 2; v.has(`Ultimate1_${k}`); k++) chain.push(`Ultimate1_${k}`);
      return ["Ultimate1_1", chain];
    }
    if (anim === "attack") {
      const n = (heroSwing[idx] = (heroSwing[idx] || 0) + 1);
      const pick = n % 2 === 0 && v.has("Attack2_1") ? "Attack2_1" : "Attack1_1";
      return [v.has(pick) ? pick : "Skill1_1"];
    }
    return [v.has("Skill1_1") ? "Skill1_1" : "Attack1_1"];
  }
  async function actFx(e) {
    const v = await viewOf(e.side, e.idx);
    if (!v) return;
    const [name, chain] = actName(v, e.side, e.idx, e.anim);
    if (name) v.play(name, false, chain);
  }
  // 맞음 — 피격 동작이 있으면 그것(사도 Hit · 적 Hit1_1)에 붉은 번쩍임, 없으면 흔들림까지. 다른 동작 도중이면 끊지 않는다
  async function hitFx(e) {
    const v = await viewOf(e.side, e.idx, 200);
    const a = artOf(unitNode(e.side, e.idx));
    if (!a) return;
    const cur = (v && v.current()) || "";
    const hit = v && /^(idle|groggy)|^$/i.test(cur) ? ["Hit", "Hit1_1"].find((n) => v.has(n)) : null;
    if (hit) v.play(hit);
    const cls = hit ? "fxflash" : "fxhit";
    a.classList.remove("fxhit", "fxflash");
    void a.offsetWidth;                     // 같은 표시를 다시 달아도 처음부터 돌게
    a.classList.add(cls);
    later(450, () => a.classList.remove(cls));
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
  // draw() 끝에서 — 쌓인 쪽지를 비우고 몸짓을 차례로 건다
  function runFx() {
    const q = st.fx.splice(0);
    if (!groundOk || calmNow()) return;
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
    let t = 0, foes = false;
    for (const b of beats) {
      const foe = !!b.act && b.act.side === "enemy";
      foes = foes || foe;
      if (b.act) later(t, () => actFx(b.act));
      const hitAt = t + (!b.act ? 0 : b.act.anim === "ult" ? 500 : 220);
      for (const h of b.hits) later(hitAt, () => (h.k === "die" ? dieFx(h) : hitFx(h)));
      t = hitAt + (foe ? 380 : 120);
    }
    fxEnd = performance.now() + t;
    later(t + 60, syncGroggy);
    // 적이 차례로 움직이는 동안만 손패 · 턴 넘기기를 잠근다(끝나면 바로 푼다)
    if (foes && t > 600) { s.classList.add("fxbusy"); later(t, () => s.classList.remove("fxbusy")); }
  }
  // 싸움을 열 때 — 모두 등장 동작(이어하기로 다시 그릴 때는 안 한다).
  // 그림은 앞 싸움의 것을 다시 쓰기도 해서(spine-view 의 pool) 쓰러진 · 달리던 자세가 남아 있을 수 있다 — 쉬는 동작으로 돌려 둔다
  function openFx(fresh) {
    if (!groundOk) return;
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
    // 무엇을 하든(카드 · 고학년 스킬 · 턴 넘기기) 엔진은 그 자리에서 다 풀고 여기로 온다 — 그린 것이 보이기 전에 적어 둔다.
    // 끝난 싸움은 finish 가 판에 남긴 뒤 적는다
    if (!st.over) writeSave(run, st);
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
    runFx();
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
        const r = C.playCard(st, at, targetIdx, { ...opts, discard: ids });
        selCard = -1;
        if (!r.ok) say(r.why);
        draw();
      });
      return;
    }
    const r = C.playCard(st, selCard, targetIdx, opts);
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
