// 화면 코드를 브라우저 없이 한 번 훑는다. 아주 작은 가짜 DOM을 세우고
// 편성 → 전투(끝까지) → 보상 → 교체 → 끝 화면까지 실제로 눌러 본다.
// 브라우저를 안 띄워도 "빈 화면"이나 예외를 여기서 잡는다.
//   node tools/smoke.js

class Node {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null;
    this._cls = new Set(); this._text = ""; this.attrs = {}; this.open = false; this.style = new Proxy({}, { get: (t, k) => t[k] ?? "", set: (t, k, v) => ((t[k] = v), true) });
    this.style.setProperty = () => {}; this.dataset = {}; }
  get className() { return [...this._cls].join(" "); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const c = this._cls; return { add: (x) => c.add(x), remove: (x) => c.delete(x), toggle: (x, on) => (on ? c.add(x) : c.delete(x)), contains: (x) => c.has(x) }; }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { if (!v) { this.children = []; this._text = ""; } }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  prepend(c) { c.parentNode = this; this.children.unshift(c); return c; }
  replaceChildren(...cs) { this.children = []; this._text = ""; for (const c of cs) this.appendChild(c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, fn) { (this._ev = this._ev || {})[t] = fn; }
  showModal() { this.open = true; }
  close() { this.open = false; if (this._ev && this._ev.close) this._ev.close(); }
  focus() { globalThis.document.activeElement = this; }
  get isConnected() { return true; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); }
  querySelectorAll(sel) { const want = sel.toUpperCase(); const out = [];
    (function walk(n) { for (const c of n.children) { if (c.tagName === want) out.push(c); walk(c); } })(this); return out; }
  get scrollHeight() { return 0; }
}

const byId = {};
const docBody = new Node("body");
const doc = {
  createElement: (t) => new Node(t),
  createTextNode: (t) => { const n = new Node("#text"); n.textContent = String(t); return n; },
  querySelector: (sel) => byId[sel] || (byId[sel] = new Node("div")),
  body: docBody,
  activeElement: null,
};
globalThis.document = doc;
// 꺼내 둔 그림이 있으면 그것으로, 없으면 없는 대로 — 두 경우 다 돌아가야 한다
import fsNode from "node:fs";
import pathNode from "node:path";
import { fileURLToPath as f2u } from "node:url";
const ASSETS = pathNode.join(pathNode.dirname(f2u(import.meta.url)), "..", "assets");
const pathToUrl = (p) => "file:///" + p.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/").replace("%3A", ":");
globalThis.fetch = async (url) => {
  const p = pathNode.join(ASSETS, String(url).replace(/^assets\//, ""));
  if (!fsNode.existsSync(p)) return { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => JSON.parse(fsNode.readFileSync(p, "utf8")) };
};
globalThis.setTimeout = (fn) => { fn(); return 0; };

const ui = await import("../js/ui.js");
const C2 = await import("../js/combat.js");
const R = await import("../js/run.js");

const clickAll = (node, pred) => {
  const out = [];
  (function walk(n) { for (const c of n.children) { if (c.onclick && (!pred || pred(c))) out.push(c); walk(c); } })(node);
  return out;
};
const label = (n) => n.textContent;

let fails = 0;
const check = (cond, what) => { if (cond) console.log(`  ok   ${what}`); else { console.log(`  실패 ${what}`); fails++; } };

console.log("편성 화면 (135명)");
let started = null;
const p = ui.partyScreen((party, rows) => (started = { party, rows }));
const count = (root, cls) => { let n = 0; (function w(x){ for (const c of x.children) { if (c.classList.contains(cls)) n++; w(c); } })(root); return n; };

// 도감 — 왼쪽 세력 레일 · 초상 격자 · 위의 탭과 정렬
// ── 팀 편성 — 큰 사도 칸 셋(멈춘 스탠딩). 칸을 누르면 명단 창이 떠서 고른다 ─────────────
check(p.className.includes("teamscreen3"), "팀 편성으로 연다");
check(count(p, "tf-slot") === 3 && count(p, "empty") === 3, `빈 칸 셋 (${count(p, "empty")})`);
check(count(p, "tm-fcard") === 0, "명단은 칸을 눌러야 뜬다");
check(/에르피엔/.test(p.textContent) && /커버러스/.test(p.textContent), "어디서 떠나고 보스가 누구인지 적는다");

const search = () => (function find(n) {
  for (const c of n.children) { if (c.classList.contains("tm-fsearch")) return c; const r = find(c); if (r) return r; }
  return null;
})(p);
const nameOf = (c) => { const f = (x) => { for (const y of x.children) { if (y.classList.contains("tm-fcp")) return y.children[0]; const r = f(y); if (r) return r; } return null; };
  const n = f(c); return n ? n.textContent : ""; };
const cardOf = (name) => { const sb = search(); sb.value = name; sb.oninput(); return clickAll(p, (n) => n.classList.contains("tm-fcard")).find((c) => nameOf(c) === name); };
const slots = () => clickAll(p, (n) => n.classList.contains("tf-slot"));
const emptySlot = () => slots().find((n) => n.classList.contains("empty"));
const slotOf = (name) => slots().find((n) => !n.classList.contains("empty") && (n.textContent || "").includes(name));
function take(name) { const e = emptySlot(); if (!e) return false; e.onclick(); const c = cardOf(name); if (c) c.onclick(); return !!c; }

check(take("에르핀"), "빈 칸을 눌러 명단에서 고른다");
check(count(p, "empty") === 2 && count(p, "tm-fcard") === 0, "고르면 칸이 차고 창이 닫힌다");
check(/후열 딜러/.test(p.textContent), "정해진 위치를 알려 준다");
// 칸을 누르면 그 자리를 다른 사도로 바꾼다
slotOf("에르핀").onclick();
check(count(p, "tm-fcard") === 135, `칸을 누르면 명단 창이 뜬다 (${count(p, "tm-fcard")})`);
cardOf("셰럼").onclick();
check(!!slotOf("셰럼") && !slotOf("에르핀") && count(p, "empty") === 2, "고른 사도로 그 자리가 바뀐다");
slotOf("셰럼").onclick();
clickAll(p, (n) => n.classList.contains("tf-out"))[0].onclick();
check(count(p, "empty") === 3, "「이 자리 비우기」 로 뺀다");

for (const n of ["에르핀", "네르", "티그"]) check(take(n), `${n} 을 찾아 넣는다`);
check(count(p, "empty") === 0, "세 칸이 다 찬다");
check(/3 \/ 3/.test(p.textContent), "머리에 몇 명 골랐는지 나온다");
check(!emptySlot(), "셋이 차면 빈 칸이 없다 — 넷째는 못 넣는다");
// 이미 편성한 사도를 다른 칸에서 고르면 둘이 자리를 바꾼다(편성 순서)
check(/에르핀/.test(slots()[0].textContent), "후열(에르핀)이 왼쪽 칸에 선다");

// 같은 열(네르 · 티그 전열)끼리는 ⇄ 로 자리를 바꾼다
{
  const frontNames = () => slots().map((n) => n.textContent).filter((t) => /전열/.test(t)).map((t) => (t.match(/네르|티그/) || [""])[0]);
  const sw = clickAll(p, (n) => n.classList.contains("tm-fswap"));
  check(sw.length === 1, `같은 열 둘 사이에 ⇄ 하나 (${sw.length})`);
  const before = frontNames().join(",");
  sw[0].onclick({ stopPropagation() {} });
  const after = frontNames().join(",");
  check(before === "네르,티그" && after === "티그,네르", `⇄ 로 같은 열 둘의 자리가 바뀐다 (${before} → ${after})`);
}

// 함께 가면 · 덱
check(!/각별|친함|안면|함께한 이야기/.test(p.textContent), "짝마다의 사이는 적지 않는다");
check(!p.textContent.includes("초면"), "초면을 적지 않는다");
check(count(p, "natchart") === 0 && count(p, "tm-fnatbtn") === 1, "상성 그림은 편성 판에 늘어놓지 않고 「상성 보기」 단추로");
{
  let err = null;
  try { for (const k of ["상성", "열", "AP", "신탁", "드랍", "장비", "지도"]) ui.openHelp(k); } catch (e) { err = e; }
  check(!err, `도움말 일곱 갈피가 열린다${err ? " — " + err.message : ""}`);
}
check(!/첫 턴 AP/.test(p.textContent), "사이가 없으니 첫 턴 AP 줄도 없다(늘 3)");
check(count(p, "tm-fdk") === 12, `덱 열두 장이 미리 보인다 (${count(p, "tm-fdk")})`);

// 칸의 🔍 로 사도 정보에 들어갔다 온다
clickAll(p, (n) => n.classList.contains("tf-info"))[0].onclick({ stopPropagation() {} });
check(count(p, "side") === 1, "칸의 🔍 로 사도 정보에 들어간다");
check(count(p, "statgrid") === 1 && count(p, "gcard") === 0, "들어가면 능력치부터 보인다");
clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "tf-slot") === 3 && count(p, "empty") === 0, "편성으로 돌아온다 — 고른 셋 그대로");

// 도감으로 갔다 온다
clickAll(p).find((n) => n.classList.contains("tm-fdex")).onclick();
check(count(p, "dexgrid") === 1, "사도 도감으로 넘어간다");
check(count(p, "dex") === 135, `도감에 135명이 깔린다 (${count(p, "dex")})`);
check(count(p, "decho") === 19, `이격 열아홉에 표가 붙는다 (${count(p, "decho")})`);
{
  const cls = clickAll(p, (n) => n.classList.contains("dex")).map((c) => c.className);
  check(!cls.some((c) => /\bs[123]\b/.test(c)), "이름표 위 성급 띠를 없앴다");
}
check(/에르핀 · 티그 · 네르/.test(p.textContent), "도감 아래에 고른 셋이 (바꾼 순서대로) 적힌다");

// 도감 갈피 셋 — 교주 카드 · 장비도 같은 틀에서
{
  const tab = (t) => clickAll(p, (n) => n.classList.contains("dextab")).find((b) => b.textContent === t);
  check(clickAll(p, (n) => n.classList.contains("dextab")).length === 3, "도감에 갈피 셋 (사도 · 교주 카드 · 장비)");
  tab("교주 카드").onclick();
  check(count(p, "cbcell") === 43 && count(p, "gcard") === 43, `교주 카드 도감에 43장이 카드 꼴로 (${count(p, "cbcell")})`);
  check(count(p, "cbprice") === 43, `교주 카드마다 값 (${count(p, "cbprice")})`);
  clickAll(p, (n) => n.classList.contains("railbtn")).find((b) => b.textContent.includes("전설")).onclick();
  check(count(p, "cbcell") === 10, `등급으로 거른다 — 전설 ${count(p, "cbcell")}장`);
  check(count(p, "cbf") === 0, "신탁은 접혀 있다");
  clickAll(p, (n) => n.classList.contains("cbflashbtn"))[0].onclick();
  check(count(p, "cbf") === 5, `눌러서 신탁 다섯을 펼친다 (${count(p, "cbf")})`);
  tab("장비").onclick();
  check(count(p, "ecard") === 29, `장비로 넘어가도 등급 거르개는 그대로 — 전설 ${count(p, "ecard")}점`);
  clickAll(p, (n) => n.classList.contains("chip")).find((b) => b.textContent === "전체").onclick();
  check(count(p, "ecard") === 87 && count(p, "eicon") >= 87, `장비 도감에 87점이 아이콘과 함께 (${count(p, "ecard")})`);
  clickAll(p, (n) => n.classList.contains("railbtn")).find((b) => b.textContent.includes("무기")).onclick();
  check(count(p, "ecard") === 30, `칸으로 거른다 — 무기 ${count(p, "ecard")}점`);
  check(/에르핀 · 티그 · 네르/.test(p.textContent) && count(p, "dfoot") === 1, "갈피를 옮겨도 아래에 고른 셋과 「편성으로」");
  tab("사도").onclick();
  check(count(p, "dex") === 135, "사도 갈피로 돌아온다");
}

{
  const dsearch = (function find(x) { for (const c of x.children) { if (c.classList.contains("dsearch")) return c; const r = find(c); if (r) return r; } return null; })(p);
  const dname = (c) => { const f = (x) => { for (const y of x.children) { if (y.classList.contains("dname")) return y; const r = f(y); if (r) return r; } return null; }; const q = f(c); return q ? q.textContent : ""; };
  dsearch.value = "에르핀"; dsearch.oninput();
  const names = clickAll(p, (n) => n.classList.contains("dex")).map(dname);
  check(names.includes("에르핀") && names.includes("에르핀(왕도)"), `이름으로 찾으면 이격도 같이 나온다 (${names.join(", ")})`);
  clickAll(p, (n) => n.classList.contains("dex")).find((c) => dname(c) === "에르핀").onclick();
}
check(count(p, "sidebtn") === 4, `갈피 넷 (${count(p, "sidebtn")})`);
clickAll(p, (n) => n.classList.contains("sidebtn")).find((b) => b.textContent === "카드").onclick();
check(count(p, "gcard") === 8, `카드 여덟 장이 세워진다 (${count(p, "gcard")})`);
check(count(p, "cardrow") === 2, "시작 카드와 고유 카드가 갈라져 있다");
check(count(p, "gcost") === 8, "여덟 장 모두 코스트가 적혀 있다");
check(count(p, "egoside") === 1, "오른쪽에 고학년 스킬 자리가 있다");
check(count(p, "gsig") === 0 && count(p, "ksig") === 0, "카드에 시그니처 표시를 달지 않는다");
{
  const CA2 = (await import("../js/data/cardart.js")).default.pic;
  const B5 = (await import("../js/data/built.js")).default;
  const ids = [...(B5.starter["에르핀"] || []), ...Object.keys(B5.cards).filter((k) => B5.cards[k].hero === "에르핀" && B5.cards[k].unique)];
  const drawn = ids.filter((id) => (CA2[id] || "").includes("/cardart/")).length;
  check(count(p, "full") === drawn, `그린 것만 카드를 꽉 채운다 (${count(p, "full")}/${drawn})`);
}
// 그림이 없는 시작 카드는 다른 사도처럼 그 사도의 SD 초상(heroart)을 세운다
check(count(p, "gpic") + count(p, "gglyph") + count(p, "heroart") === 8,
  `여덟 장이 저마다 그림 · 무늬 · 사도 초상을 갖는다 (그림 ${count(p, "gpic")} · 무늬 ${count(p, "gglyph")} · 초상 ${count(p, "heroart")})`);

clickAll(p, (n) => n.classList.contains("sidebtn")).find((b) => b.textContent === "신탁").onclick();
check(count(p, "flashbox") === 4, `신탁 갈피에 고유 넉 장 (${count(p, "flashbox")})`);
check(count(p, "flash") === 20, `신탁 스무 개 (${count(p, "flash")})`);
clickAll(p, (n) => n.classList.contains("sidebtn")).find((b) => b.textContent === "고학년 스킬").onclick();
check(count(p, "ultbig") === 1, "고학년 스킬 갈피가 그려진다");
check(/게이지 \d+% 를 씁니다/.test(p.textContent), "고학년 스킬에 게이지 값이 적힌다");

clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "dexgrid") === 1, "도감으로 돌아온다");
clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "tf-slot") === 3, "다시 편성으로 돌아온다");

const goBtn = clickAll(p).find((n) => n.textContent === "떠납니다");
check(goBtn && !goBtn.disabled, "셋을 고르면 떠날 수 있다");
goBtn.onclick();
check(started && started.party.length === 3, "편성이 넘어온다");
check(started.party.join(",") === "에르핀,티그,네르", `자리를 바꾼 순서대로 넘어간다 (${started.party.join(",")})`);
// 「모든 열」 사도(티그(영웅) · 죠안) — 선 열에 따라 패시브의 그 열 줄만 켜진다
{
  const P = await import("../js/passive.js");
  const B = (await import("../js/data/built.js")).default;
  check(B.heroes["죠안"].anyRow && B.heroes["티그_영웅"].anyRow && !B.heroes["티그"].anyRow, "모든 열 사도는 둘(티그(영웅) · 죠안)");
  const lit = (row) => {
    // 열 줄은 죠안 카드를 4장 낼 때마다 돈다(원작 강화 평타 「네 번째 공격」) — 두 턴에 걸쳐 죠안 카드를 낸다
    const t = C2.newCombat({ partyKeys: ["죠안", "에르핀", "네르"], rows: { 죠안: row }, deck: Array(12).fill("죠안_s0"), enemyIds: ["fairymobcloserange"], seed: 3 });
    for (let turn = 0; turn < 3 && !t.over; turn++) {
      for (let g = 0; g < 6; g++) { const i = t.hand.findIndex((id) => !C2.canPlay(t, id)); if (i < 0) break; C2.playCard(t, i, 0); }
      if (!t.over) C2.endTurn(t);
    }
    return { row: t.party[0].row, gauge: t.gauge, log: t.log.join("\n") };
  };
  const mid = lit("mid"), back = lit("back"), front = lit("front");
  check(mid.row === "mid" && /꿈결 기도/.test(mid.log) && !/후열 축복/.test(mid.log), `죠안 중열 — 중열 줄만 (게이지 ${mid.gauge}%)`);
  check(back.row === "back" && /후열 축복/.test(back.log) && !/꿈결 기도/.test(back.log), "죠안 후열 — 후열 줄만");
  check(front.row === "front" && !/꿈결 기도|후열 축복/.test(front.log), "죠안 전열 — 중열 · 후열 줄은 꺼진다");
}

// 같은 열이면 적 쪽(파티 순서가 뒤)이 먼저 맞는다 — 에르핀(후열) · 티그 · 네르(둘 다 전열, 네르가 적 쪽)
{
  let hitNer = 0, hitTig = 0, early = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const t = C2.newCombat({ partyKeys: ["에르핀", "티그", "네르"], rows: {}, deck: [], enemyIds: ["fairymobcloserange"], seed });
    const [, tig, ner] = t.party;
    for (let k = 0; k < 4 && !t.over; k++) {
      const h0 = [tig.hp, ner.hp];
      C2.endTurn(t);
      const dT = h0[0] - tig.hp, dN = h0[1] - ner.hp;
      if (dN > 0) hitNer++;
      if (dT > 0) hitTig++;
      if (dT > 0 && dN === 0 && !ner.dead) early++;     // 네르가 멀쩡히 서 있는데 티그만 맞았다
    }
  }
  check(hitNer > 0 && early === 0, `같은 열이면 적 쪽(네르)이 먼저 맞는다 (네르 ${hitNer}번 · 네르를 두고 티그만 ${early}번)`);
}

console.log("\n전투 화면");
const run = R.newRun(started.party, started.rows, 4242);
let result = null;
const f = ui.fightScreen(run, (r) => (result = r));
const cards = clickAll(f, (n) => n.classList.contains("card"));
check(cards.length > 0, `손패가 그려진다 (${cards.length}장)`);
// 교주 카드는 시작 덱에서 뺐다 — 기획서에 없고 세계관 규칙에도 어긋난다
{
  const deck = R.newRun(started.party, started.rows, 5).deck;
  check(deck.length === 12, `시작 덱은 사도 셋 × 넉 장 = 12 (${deck.length})`);
  check(!deck.some((id) => String(id).startsWith("cult_")), "시작 덱에 교주 카드가 없다");
}
const playable = cards.filter((n) => !n.classList.contains("no"));
check(playable.length > 0, `낼 수 있는 카드가 있다 (${playable.length}장)`);

// 끝날 때까지 눌러 본다 — 낼 수 있는 걸 내고 턴을 넘긴다
const endBtn = clickAll(f).find((n) => label(n) === "턴 넘기기");
check(!!endBtn, "턴 넘기기 단추가 있다");

// 쓰러진 적에게는 표적 표시를 안 한다 — 눌러도 아무 일이 없는데 누를 수 있어 보였다.
{
  const s7 = C2.newCombat({ partyKeys: started.party, rows: started.rows,
    deck: C2.buildDeck(started.party), enemyIds: ["fairymobcloserange", "fairymobcloserange"], seed: 4 });
  s7.enemies[0].dead = true; s7.enemies[0].hp = 0;
  const f7 = ui.fightScreen(R.newRun(started.party, started.rows, 4), () => {});
  const dead = clickAll(f7, (n) => n.classList.contains("tgt") && n.classList.contains("dead"));
  check(dead.length === 0, dead.length ? `쓰러졌는데 표적으로 보이는 것 ${dead.length}` : "쓰러진 쪽은 표적으로 안 보인다");
}

// 손에는 열 장까지. 넘치게 뽑으면 그 카드는 사라진다.
{
  const RULES = await import("../js/rules.js");
  const C = await import("../js/combat.js");
  const s5 = C.newCombat({ partyKeys: started.party, rows: started.rows,
    deck: C.buildDeck(started.party), enemyIds: ["fairymobcloserange"], seed: 99 });
  s5.hand = []; s5.gone = []; s5.draw = Array.from({ length: 20 }, () => started.party[0] + "_s0");
  C.draw(s5, 14);
  check(s5.hand.length === RULES.HAND_MAX, `손패는 ${RULES.HAND_MAX}장까지 (${s5.hand.length})`);
  check(s5.gone.length === 4, `넘친 넉 장이 사라진다 (${s5.gone.length})`);
  check(s5.log.some((l) => l.includes("사라졌다")), "사라졌다고 기록에 남는다");
}

// 그린 것이 없는 카드는 그 사도의 인게임 그림을 깐다 — 무늬만 있는 것보다 낫다
check(count(f, "heroart") + count(f, "gpic") === count(f, "card"),
  `손패마다 그림이 있다 (사도 그림 ${count(f, "heroart")} · 그린 것 ${count(f, "gpic")} / ${count(f, "card")}장)`);

// 더미를 눌러 열어 본다
{
  const piles = clickAll(f, (n) => n.classList.contains("pile2"));
  check(piles.length === 2, `더미 둘을 누를 수 있다 (${piles.length})`);
}

for (let t = 0; t < 40 && !result; t++) {
  for (let g = 0; g < 12 && !result; g++) {
    const hand = clickAll(f, (n) => n.classList.contains("card") && !n.classList.contains("no"));
    if (!hand.length) break;
    // 카드는 끌어서만 낸다 — 가짜 DOM 에서는 끌 수 없으니 끌기가 끝날 때 부르는 dropCard 로 놓는다.
    // 눌러서는 안 나가는지도 본다(누르면 들리기만)
    const c = hand[0];
    const before = clickAll(f, (n) => n.classList.contains("card")).length;
    c.onclick();
    if (t === 0 && g === 0) check(clickAll(f, (n) => n.classList.contains("card")).length === before, "카드를 눌러서는 안 나간다(들리기만)");
    const foe = clickAll(f, (n) => n.classList.contains("foe") && !n.classList.contains("dead"))[0];
    f.dropCard(Number(c.dataset.i), foe ? Number(foe.dataset.idx) : 0);
  }
  if (!result) endBtn.onclick();
}
check(result === "win" || result === "lose", `전투가 끝난다 (${result})`);

console.log("");
console.log("전투 화면 얼개 (카제나 구성)");
{
  const has = (root, cls) => { let n = 0; (function w(x){ for (const c of x.children) { if (c.classList.contains(cls)) n++; w(c); } })(root); return n; };
  const f2 = ui.fightScreen(R.newRun(started.party, started.rows, 7), () => {});

  check(has(f2, "foes") === 1, "적 구역이 있다");
  check(has(f2, "allies") === 1, "아군 상태창이 있다");
  check(has(f2, "gauge") === 1, "고학년 게이지가 있다");
  check(has(f2, "apbox") === 1, "코스트 창(AP)이 있다");
  check(has(f2, "hand") === 1, "손패가 있다");
  check(has(f2, "foe") >= 1, `적이 그려진다 (${has(f2, "foe")})`);
  check(has(f2, "ally") === 3, `아군 셋이 그려진다 (${has(f2, "ally")})`);
  check(has(f2, "intent") >= 1, "적의 의도가 보인다");
  check(has(f2, "ultbtn") === 3, `고학년 스킬 단추가 셋 (${has(f2, "ultbtn")})`);
  check(has(f2, "card") > 0, `손패가 그려진다 (${has(f2, "card")}장)`);

  // 고학년 스킬 — 누르면 자세히(쓰는 단추 없이 「끌어다 놓으면」 한 줄), 쓰는 것은 끌어 놓을 때 부르는 dropUlt 로
  const ub = clickAll(f2, (n) => n.classList.contains("ultbtn"))[0];
  ub.onclick();
  const um = docBody.children.find((n) => n.classList.contains("ultmodal"));
  check(!!um && has(um, "bmuse") === 0 && has(um, "bmhint") === 1, "고학년 창에 쓰는 단추가 없고 끌어 쓰라는 한 줄이 있다");
  if (um) clickAll(um, (n) => n.classList.contains("bmclose"))[0].onclick();
  const C = await import("../js/combat.js");
  const s2 = f2.state, uk = s2.party[0].key;
  s2.gauge = 300;
  const g0 = s2.gauge;
  f2.dropUlt(uk, s2.enemies.find((e) => !e.dead).idx);
  check(s2.gauge === g0 - C.ultOf(uk).cost && s2.lastUlt === uk, `끌어 놓으면 쓴다 (게이지 ${g0} → ${s2.gauge}%)`);
  f2.dropUlt(uk, 0);
  check(s2.lastUlt === uk && s2.gauge === g0 - C.ultOf(uk).cost, "같은 사도를 연속으로 놓으면 안 쓴다");
}

console.log("\n이후 화면");
// 전투를 이겼든 졌든 본다 — 이긴 판에서만 보던 때, 전투가 지면 보상 화면 검사가 통째로 빠졌다(카드를 끌어서만 내게 바꾼 뒤)
{
  // ── 신탁 — 카제나처럼 전투 중에(docs/12-신탁.md) ──────────────────────
  const C = await import("../js/combat.js");
  const CB = await import("../js/cardbook.js");
  const RULES2 = await import("../js/rules.js");
  // 은총 — 빛나는 기본 카드, 고유 카드 셋 가운데 하나를 얻는다
  const r0 = R.newRun(run.party, run.rows, 55);        // 새 판 — 앞의 시험 전투에서 파티가 쓰러졌을 수 있다
  let glow = {};
  for (let i = 0; i < 50 && !Object.values(glow).some((g) => g.kind === "hero"); i++) { r0.rng = C.makeRng(1000 + i); glow = R.rollEpiphany(r0); }
  const heroGlow = Object.entries(glow).find(([, g]) => g.kind === "hero");
  check(!!heroGlow, "싸움을 열면 은총 카드가 빛날 수 있다");
  const [hid, hg] = heroGlow;
  check(!CB.CARDS[hid].unique && CB.CARDS[hid].hero === hg.hero, `빛나는 카드는 그 사도의 기본 카드 (${CB.CARDS[hid].name})`);
  check(hg.options.length === 1 && CB.CARDS[hg.options[0]].unique && CB.CARDS[hg.options[0]].hero === hg.hero && !r0.deck.includes(hg.options[0]),
    "고르지 않는다 — 그 사도의 아직 없는 고유 카드 가운데 무작위 하나");
  const s1 = C.newCombat({ partyKeys: r0.party, rows: r0.rows, deck: r0.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3, glow: { [hid]: hg } });
  check(C.glowOf(s1, hid) && C.glowOf(s1, hid).kind === "hero", "전투가 빛나는 카드를 안다");
  const k1 = C.applyEpiphany(s1, hid, 0);
  const got1 = hg.options[0];
  check(k1 === "hero" && s1.hand.includes(got1) && C.costOf(s1, got1) === 0, "고른 고유 카드가 손에 들어오고 그 턴 비용 0");
  check(!C.glowOf(s1, hid), "한 번 신탁이 내리면 빛이 꺼진다");
  C.endTurn(s1);
  check(C.costOf(s1, got1) === CB.CARDS[got1].cost, "다음 턴부터는 제 비용");

  // 교주 카드도 신탁 다섯 — 덱에 있으면 고유 카드처럼 신탁이 뜬다
  {
    const nids = CB.NEUTRAL_IDS.filter((id) => CB.CARDS[id].playable);
    check(nids.every((id) => (CB.CARDS[id].flash || []).length === 5 && CB.CARDS[id].flash.every((f, i) => f.n === i + 1 && f.fx.length && !f.unparsed)),
      `교주 카드 ${nids.length}장 모두 신탁 다섯이 다 읽힌다`);
    const r8 = R.newRun(run.party, run.rows, 93), nid = nids[0];
    r8.deck = r8.deck.filter((id) => !CB.CARDS[id].unique); r8.deck.push(nid);
    check(R.flashTargets(r8).includes(nid), "가진 교주 카드가 신탁 대상이 된다");
    let lit = null;
    for (let i = 0; i < 300 && !lit; i++) { r8.rng = C.makeRng(i + 1); const g = R.rollEpiphany(r8)[nid]; if (g && g.kind === "card") lit = g; }
    check(!!lit, "교주 카드에 신탁이 빛난다");
    const s8 = C.newCombat({ partyKeys: r8.party, rows: r8.rows, deck: [nid], enemyIds: ["curburus"], seed: 5, hp: r8.hp, maxHp: r8.maxHp, glow: { [nid]: lit } });
    C.applyEpiphany(s8, nid, 0);
    check(s8.flash[nid] === lit.options[0].n && s8.book[nid].flashOn === lit.options[0].n, `신탁을 고르면 교주 카드가 바뀐다 (${CB.CARDS[nid].name} → ${s8.book[nid].flashKo})`);
  }

  // 한 번 뺀 고유 카드는 은총 · 상점에 다시 안 나온다
  {
    const r7 = R.newRun(run.party, run.rows, 91);
    const k7 = r7.party[0], all7 = R.uniqueIdsOf(k7);
    r7.deck.push(all7[0], all7[1], all7[2]);
    R.forgetCard(r7, all7[3]); r7.deck = r7.deck.filter((x) => x !== all7[0]); R.forgetCard(r7, all7[0]);
    check(R.uniquesLeft(r7, k7).length === 0, "넷 가운데 셋은 덱에, 하나는 빼 버렸으면 남은 것이 없다");
    let back = false;
    for (let i = 0; i < 200; i++) { r7.rng = C.makeRng(i + 1); for (const g of Object.values(R.rollEpiphany(r7))) if (g.kind === "hero" && g.hero === k7) back = true; }
    check(!back, "빼 버린 고유 카드는 은총으로 다시 오지 않는다(그 사도는 은총이 안 빛난다)");
  }

  // 사도마다 따로 굴린다 — 한 전투에 여럿 · 셋 모두 은총이 빛날 수 있고, 한 사도에 은총은 하나
  {
    const r9 = R.newRun(run.party, run.rows, 97);
    let all3 = 0, twice = 0, empty = 0;
    for (let i = 0; i < 400; i++) {
      r9.rng = C.makeRng(i + 1); r9.elite = false;
      const hs = Object.values(R.rollEpiphany(r9)).filter((g) => g.kind === "hero").map((g) => g.hero);
      if (new Set(hs).size === 3) all3++;
      if (new Set(hs).size !== hs.length) twice++;
      r9.elite = true;
      if (!Object.values(R.rollEpiphany(r9)).some((g) => g.kind === "hero")) empty++;
    }
    r9.elite = false;
    check(all3 > 0 && twice === 0, `사도마다 따로 — 셋 모두 은총이 빛난 싸움 ${all3}/400, 한 사도에 둘은 없다`);
    check(empty === 0, "엘리트는 은총이 적어도 하나 빛난다");
  }

  // 카드 신탁 — 가진 고유 카드가 빛나고, 신탁 다섯 중 셋. 고르면 바로 바뀌고 이번에는 비용 0
  const r4 = R.newRun(run.party, run.rows, 77);
  r4.deck.push(R.uniqueIdsOf(run.party[0])[0]);
  r4.rewardFlash = true;                          // 반드시 뜨게
  const g4 = R.rollEpiphany(r4);
  const cardGlow = Object.entries(g4).find(([, g]) => g.kind === "card");
  check(!!cardGlow && CB.CARDS[cardGlow[0]].unique && cardGlow[1].options.length === 3, "카드 신탁 — 고유 카드가 빛나고 선택지 셋");
  const [cid, cg] = cardGlow;
  const s2 = C.newCombat({ partyKeys: r4.party, rows: r4.rows, deck: r4.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 5, glow: g4 });
  C.applyEpiphany(s2, cid, 0);
  check(C.cardOf(s2, cid).flashOn === cg.options[0].n && C.costOf(s2, cid) === 0, "고르면 카드가 바로 바뀌고 이번에는 비용 0");
  // 끝나면 판에 남는다
  s2.gained.cards.push(got1);
  R.afterFight(r4, s2);
  check(r4.flash[cid] === cg.options[0].n && r4.deck.includes(got1), "전투가 끝나면 얻은 카드 · 신탁이 판에 남는다");

  // 기적 — 셋 가운데 하나에 드물게, 카드 종류에 맞는 덤
  {
    let hit = 0, bad = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const r5 = R.newRun(run.party, run.rows, i + 1);
      r5.deck.push(R.uniqueIdsOf(run.party[0])[1]);
      r5.rewardFlash = true;
      const g5 = Object.values(R.rollEpiphany(r5)).find((g) => g.kind === "card");
      const sh = g5 && g5.options.filter((o) => o.shin);
      if (sh && sh.length) { hit++; if (sh.length > 1 || !RULES2.DIVINE_KO[sh[0].shin]) bad++;
        const cc = Object.values(r5.deck).find((id) => CB.CARDS[id] && CB.CARDS[id].unique); if (sh[0].shin === "cost" && CB.flashed(CB.CARDS[cc], sh[0].n).cost < 1) bad++; }
    }
    check(Math.abs(hit / N - RULES2.DIVINE) < 0.025 && !bad, `기적이 ${(hit / N * 100).toFixed(1)}% 로 뜬다 (정한 값 ${RULES2.DIVINE * 100}%) · 선택지 하나에만 · 비용 0 에는 「비용 -1」 없음`);
    // 덤이 실제로 드는가 — 비용 -1
    const cost1 = Object.keys(CB.CARDS).find((id) => CB.CARDS[id].unique && CB.CARDS[id].cost >= 2);
    const s3 = C.newCombat({ partyKeys: [CB.CARDS[cost1].hero], deck: [cost1], enemyIds: ["fairymobcloserange"], seed: 1, shin: { [cost1]: "cost" } });
    check(C.costOf(s3, cost1) === CB.CARDS[cost1].cost - 1, "기적 「비용 -1」이 든다");
  }

  // 보상 — 이제 골드 · 장비와 「이 전투에서 받은 것」
  let picked = { card: "없음", flash: null };
  R.rollReward(r4);
  check(!r4.reward.cards.length && !r4.reward.flash, "보상에 고유 카드 · 신탁 고르기가 없다(전투 중에 얻는다)");
  const rw = ui.rewardScreen(r4, (id, f) => (picked = { card: id, flash: f }));
  check(/이 전투에서 받은 은총 · 신탁/.test(rw.textContent) && count(rw, "gcard") >= 2, "보상 화면이 이 전투에서 얻은 카드 · 신탁을 그림으로 보여 준다");
  const cont = clickAll(rw).find((n) => n.textContent === "계속합니다");
  check(!!cont, "「계속합니다」로 넘어간다");
  if (cont) cont.onclick();
  check(picked.card === null, "보상에서 따로 고를 카드는 없다");
  {
    const a1 = JSON.stringify(r4.reward);
    ui.rewardScreen(r4, () => {});
    check(a1 === JSON.stringify(r4.reward), "보상은 다시 그려도 안 바뀐다");
  }
}
run.floor = 0; run.node = 3;
const hp0 = { ...run.hp };
const adv = R.advance(run);
check(adv.swap === false, "보스를 넘겨도 사도 교체는 없다 — 처음 고른 셋으로 끝까지");
check(run.party.every((k) => run.hp[k] === Math.min(run.maxHp[k], hp0[k] + 10)), "층 사이에 HP +10 은 그대로");
check(typeof ui.swapScreen === "undefined", "사도 교체 화면은 없앴다");

// 고학년 게이지 — 전투가 끝나도 남은 만큼 다음 전투로
{
  const C = await import("../js/combat.js");
  const gr = R.newRun(run.party.slice(), { ...run.rows }, 21);
  check(gr.gauge === 0, "새 판은 게이지 0");
  const g1 = C.newCombat({ partyKeys: gr.party, rows: gr.rows, deck: gr.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 2, hp: gr.hp, maxHp: gr.maxHp, gauge: gr.gauge });
  g1.gauge = 140;
  R.afterFight(gr, g1);
  check(gr.gauge === 140, `전투가 끝나면 남은 게이지를 판에 적는다 (${gr.gauge}%)`);
  const g2 = C.newCombat({ partyKeys: gr.party, rows: gr.rows, deck: gr.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3, hp: gr.hp, maxHp: gr.maxHp, gauge: gr.gauge });
  check(g2.gauge === 140, "다음 전투는 그 게이지로 시작한다");
}

console.log("\n골디의 상점");
{
  const CB = (await import("../js/cardbook.js")).CARDS;
  const r = R.newRun(run.party.slice(), { ...run.rows }, 11);
  check(r.gold === 99, `골드 99로 시작한다 (${r.gold})`);
  // 싸움 뒤 골드 — 카드를 안 골라도 받는다, 한 번만
  R.rollReward(r); const g = r.reward.gold; R.takeReward(r, null); R.takeReward(r, null);
  check(g >= 15 && r.gold === 99 + g, `싸움 뒤 골드를 한 번만 받는다 (+${g})`);
  r.node = 2; check(!R.needsShop(r), "보스 앞이 아니면 상점이 안 뜬다");
  r.node = 3; check(R.needsShop(r), "보스 앞이면 상점이 뜬다");
  r.gold = 2000;
  const sp = ui.shopScreen(r, () => {});
  check(!R.needsShop(r), "상점은 층마다 한 번");
  const neu = r.shop.items.filter((it) => it.kind === "neutral");
  check(neu.length === 3 && neu.every((it) => CB[it.id].playable), `교주 카드 셋, 모두 효과가 다 도는 것 (${neu.map((it) => CB[it.id].name).join(" · ")})`);
  check(neu.every((it) => it.price === CB[it.id].price), "값은 기획서의 골드 그대로");
  const EQUIP_DB = (await import("../js/cardbook.js")).EQUIP;
  const eqs = r.shop.items.filter((it) => it.kind === "equip");
  check(eqs.length === 3 && eqs.every((it) => EQUIP_DB[it.id]), `장비 셋 (${eqs.map((it) => EQUIP_DB[it.id].ko).join(" · ")})`);
  check(!r.shop.items.some((it) => it.kind === "unique") && r.shop.items.length === 6, "고유 카드는 팔지 않는다 — 진열은 여섯 칸");
  check(clickAll(sp, (n) => n.classList.contains("sh-buy")).length === 6, "진열대에 사는 단추가 여섯");
  const before = r.gold, deckN = r.deck.length;
  const buyBtn = clickAll(sp, (n) => n.classList.contains("sh-buy"))[0];
  buyBtn.onclick();
  check(r.gold === before - r.shop.items[0].price && r.deck.length === deckN + 1, "사면 골드가 줄고 덱에 들어온다");
  check(/팔렸습니다/.test(sp.textContent), "산 칸은 팔렸다고 적는다");
  clickAll(sp, (n) => n.classList.contains("sh-haggle"))[0].onclick();
  check(/할인은 안 돼요/.test(sp.textContent), "골디는 할인하지 않는다");
  // 골디를 누르면 쓰다듬기 — 한 줄 한다
  clickAll(sp, (n) => n.classList.contains("sh-stand"))[0].onclick();
  check(/서비스 품목이 아니에요/.test(sp.textContent), "골디를 쓰다듬으면 한마디 한다");
  // 새로고침 — 값이 오르고, 골드가 빠지고, 진열이 바뀐다
  const rr0 = R.rerollPrice(r), g1 = r.gold, ids0 = r.shop.items.map((it) => it.id).join();
  check(rr0 === 25, `새로고침은 25골드부터 (${rr0})`);
  clickAll(sp, (n) => n.classList.contains("sh-reroll"))[0].onclick();
  const ids1 = r.shop.items.map((it) => it.id).join();
  check(r.gold === g1 - 25 && R.rerollPrice(r) === 50 && ids1 !== ids0, "새로고침하면 25골드가 빠지고 진열이 바뀌고 다음 값은 50");
  check(r.shop.items.filter((it) => it.kind === "neutral").length === 3 && r.shop.items.filter((it) => it.kind === "equip").length === 3
    && r.shop.items.every((it) => !it.sold), "새로고침한 진열도 교주 카드 셋 · 장비 셋, 팔린 칸 없이");
  const rrBtn = clickAll(sp, (n) => n.classList.contains("sh-reroll"))[0];
  const rrPriceEl = rrBtn && rrBtn.children.find((c) => c.classList.contains("sh-actprice"));
  check(!!rrPriceEl && rrPriceEl.textContent.trim() === "50", `새로고침 단추에 오른 값이 적힌다 (${rrPriceEl && rrPriceEl.textContent})`);
  const r1 = R.newRun(run.party.slice(), { ...run.rows }, 14); r1.gold = 10; r1.node = 3; R.rollShop(r1);
  check(R.rerollShop(r1) === "골드가 모자랍니다" && r1.gold === 10, "골드가 모자라면 새로고침도 못 한다");
  clickAll(sp, (n) => n.classList.contains("sh-remove"))[0].onclick();
  const toRemove = clickAll(sp, (n) => n.classList.contains("sh-deckcard"));
  check(toRemove.length === r.deck.length, `뺄 카드로 덱 전체가 펼쳐진다 (${toRemove.length})`);
  const g2 = r.gold, deckN2 = r.deck.length; toRemove[0].onclick();
  check(r.deck.length === deckN2 && r.gold === g2, "한 번 누르면 고르기만 한다 — 아직 안 빠지고 골드도 그대로(두 단계)");
  const okRm = clickAll(sp, (n) => n.classList.contains("tsok"))[0];
  const { PRICE_REMOVE: PR, PRICE_REMOVE_STEP: PRS } = await import("../js/rules.js");   // 값은 규칙에서(2026-10 올렸다)
  check(!!okRm && !okRm.disabled && new RegExp(`${PR} 골드로 뺍니다`).test(okRm.textContent), `고르면 「${PR} 골드로 뺍니다」 단추가 살아난다`);
  okRm.onclick();
  check(r.deck.length === deckN2 - 1 && r.gold === g2 - PR && r.shop.removeUsed, `카드 제거 ${PR}골드, 한 번만`);
  check(!clickAll(sp, (n) => n.classList.contains("sh-deckcard")).length, "빼고 나면 고르는 창이 닫힌다");
  check(R.removePrice(r) === PR + PRS, `다음 제거는 ${PR + PRS}골드`);
  const r2 = R.newRun(run.party.slice(), { ...run.rows }, 12); r2.gold = 10; r2.node = 3;
  const sp2 = ui.shopScreen(r2, () => {});
  clickAll(sp2, (n) => n.classList.contains("sh-buy"))[0].onclick();
  check(r2.gold === 10 && /값이 있는 법/.test(sp2.textContent), "골드가 모자라면 못 사고 골디가 말해 준다");
  // 실비아(수양딸)가 있으면 선물 — 할인이 아니라 선물
  const B = (await import("../js/data/built.js")).default;
  const sylvia = Object.keys(B.heroes).find((k) => B.heroes[k].ko === "실비아");
  const r3 = R.newRun([sylvia, ...run.party.filter((k) => k !== sylvia).slice(0, 2)], {}, 13); r3.node = 3;
  const n3 = r3.deck.length;
  const sp3 = ui.shopScreen(r3, () => {});
  check(r3.shop.gift && r3.deck.length === n3 + 1 && /황금대공/.test(sp3.textContent), `실비아가 있으면 선물 한 장 (${CB[r3.shop.gift].name})`);
  // 교주 카드가 전투에서 실제로 돈다 — 주인이 없어도(사도 스탯을 빌리지 않는다)
  const nid = Object.keys(CB).find((id) => CB[id].neutral && CB[id].playable && CB[id].name === "저놈 잡아라!");
  const s9 = C2.newCombat({ partyKeys: r.party, rows: r.rows, deck: [nid, ...r.deck], enemyIds: ["fairymobcloserange"], seed: 5 });
  s9.hand = [nid]; s9.ap = 3;
  const res = C2.playCard(s9, 0, 0);
  check(res && res.ok !== false, "교주 카드를 전투에서 낼 수 있다");
}

console.log("\n캠프");
{
  const CB = (await import("../js/cardbook.js")).CARDS;
  const r = R.newRun(run.party.slice(), { ...run.rows }, 21);
  r.node = 1; check(R.nextStop(r) === null, "전투 사이가 아니면 캠프가 없다");
  r.node = 2; check(R.nextStop(r) === "camp", "두 번째 싸움 뒤 캠프");
  R.enterCamp(r, "camp");
  check(R.nextStop(r) === null, "캠프는 층마다 한 번");
  const k0 = r.party[0]; r.hp[k0] = 10; const k1 = r.party[1]; r.hp[k1] = 0;
  const cs = ui.campScreen(r, false, () => {}, () => {});
  check(cs.className === "campscreen2", "캠프는 어두운 유리 한 화면으로 연다");
  check(!/골디의 좌판 들르기/.test(cs.textContent) && count(cs, "cp-shop") === 0, "캠프만 있는 칸에는 상점이 없다");
  check(count(cs, "cp-hero") === 3 && count(cs, "cp-hp") === 3, "모닥불 곁에 사도 셋 · HP 줄 셋");
  check(cs.textContent.includes(`+${Math.min(r.maxHp[k0] - 10, Math.round(r.maxHp[k0] * 0.3))}`), "쉬면 얼마나 차는지 미리 보인다");
  check(/주말농장에서 쉬는 중/.test(cs.textContent), "쓰러진 사도는 주말농장에서 쉰다고 적는다");
  const rest = clickAll(cs, (n) => n.classList.contains("cp-rest"))[0];
  rest.onclick();
  check(r.hp[k0] === 10 + Math.round(r.maxHp[k0] * 0.3) && r.hp[k1] === 0, `쉬면 살아 있는 사도만 30% (${r.hp[k0]}/${r.maxHp[k0]})`);
  const trained = clickAll(cs, (n) => n.classList.contains("cp-train"))[0];
  check(trained.disabled && /이번 캠프에서는 이미 골랐습니다/.test(trained.textContent), "쉬고 나면 수련은 막히고 까닭을 적는다");
  check(R.campRest(r) !== null && R.campTrain(r, { cardId: "x", n: 1 }) !== null, "캠프에서는 하나만 고른다");
  // 캠프 + 상점 — 보스 앞
  r.node = 3;
  check(R.nextStop(r) === "campshop", "보스 앞은 캠프 + 상점");
  // 수련하려면 고유 카드가 있어야 한다
  const uid = Object.keys(CB).find((id) => CB[id].hero === r.party[0] && CB[id].unique);
  r.deck.push(uid);
  R.enterCamp(r, "campshop");
  let shopped = false;
  const cs2 = ui.campScreen(r, true, () => {}, () => (shopped = true));
  check(/골디의 좌판 들르기/.test(cs2.textContent), "캠프 + 상점 칸에는 골디의 좌판이 있다");
  clickAll(cs2, (n) => n.classList.contains("cp-shop"))[0].onclick();
  check(shopped && !r.stops["0:campshop"].used, "상점에 들러도 캠프 선택은 남는다");
  const train = clickAll(cs2, (n) => n.classList.contains("cp-train"))[0];
  train.onclick();
  const fl = clickAll(cs2, (n) => n.classList.contains("fcard"));
  check(fl.length === 3 && count(cs2, "cp-trainmodal") === 1 && count(cs2, "ftarget") === 1, `수련은 위에 뜨는 창에서 신탁 다섯 중 셋 (${fl.length})`);
  fl[0].onclick();
  check(!r.flash[r.camp.train.cardId], "한 번 누르면 고르기만 한다(두 단계) — 아직 안 붙는다");
  clickAll(cs2, (n) => n.classList.contains("tsok"))[0].onclick();
  check(r.flash[r.camp.train.cardId] && r.stops["0:campshop"].used === "train", "「신탁을 붙입니다」 를 누르면 붙는다");
  check(count(cs2, "cp-modal") === 0, "신탁을 고르면 창이 닫힌다");
  const restAfter = clickAll(cs2, (n) => n.classList.contains("cp-rest"))[0];
  check(restAfter.disabled && /이번 캠프에서는 이미 골랐습니다/.test(restAfter.textContent), "수련하고 나면 쉬기는 막히고 까닭을 적는다");
  const back = ui.shopScreen(r, () => {}, { back: "캠프로 돌아갑니다" });
  check(/캠프로 돌아갑니다/.test(back.textContent), "캠프에서 연 상점은 캠프로 돌아간다");
}

console.log("\n장비");
{
  const { EQUIP } = await import("../js/cardbook.js");
  const ids = Object.keys(EQUIP);
  check(ids.length === 87 && ids.every((id) => !EQUIP[id].global), `기획서의 장비 87종을 읽는다 — 글로벌 전용은 없다 (${ids.length})`);
  const slots = {}; for (const id of ids) slots[EQUIP[id].slot] = (slots[EQUIP[id].slot] || 0) + 1;
  check(slots["무기"] === 30 && slots["방어구"] === 20 && slots["장신구"] === 37, `칸: 무기 ${slots["무기"]} · 방어구 ${slots["방어구"]} · 장신구 ${slots["장신구"]}`);
  check(ids.every((id) => Object.values(EQUIP[id].stats).some(Boolean)), "모든 장비에 스탯 줄이 있다");
  const r = R.newRun(run.party.slice(), { ...run.rows }, 31);
  const k = r.party[0];
  // HP 가 붙는 장비 하나
  const hpItem = ids.find((id) => EQUIP[id].stats.hp > 0 && EQUIP[id].affinity !== k);
  const e = EQUIP[hpItem];
  r.bag.push(hpItem);
  const mh = r.maxHp[k], h0 = r.hp[k];
  check(R.equip(r, k, hpItem) === null && R.gearOf(r, k)[e.slot] === hpItem, `빈 칸에 낀다 (${e.ko} → ${e.slot})`);
  check(r.maxHp[k] === mh + e.stats.hp && r.hp[k] === h0 + e.stats.hp, `HP 스탯은 최대 HP 에 바로 (+${e.stats.hp})`);
  const same = ids.find((id) => id !== hpItem && EQUIP[id].slot === e.slot && EQUIP[id].affinity !== k);
  r.bag.push(same);
  check(!!R.equip(r, k, same), "차 있는 칸은 그냥 끼면 막히고 「바꾸기」 로 한다");
  const RULES = await import("../js/rules.js");
  const price = R.sellPrice(hpItem);
  check(price === Math.round(RULES.EQUIP_PRICE[e.grade] * RULES.EQUIP_SELL), `파는 값은 사는 값의 ${RULES.EQUIP_SELL * 100}% (${e.grade} ${price})`);
  const gw = r.gold;
  check(R.equip(r, k, same, { replace: true }) === null && R.gearOf(r, k)[e.slot] === same && !r.bag.includes(hpItem) && r.gold === gw + price,
    `바꿔 끼면 낀 것은 팔린다 — 가방으로 안 가고 +${price} 골드`);
  check(r.maxHp[k] === mh + EQUIP[same].stats.hp, "바꾸면 최대 HP 도 따라 바뀐다");
  // 빼기는 없다 · 팔기는 가방의 것만
  check(typeof R.unequip === "undefined", "빼기는 없다 — 한 번 낀 장비는 바꿔 낄 때 팔릴 뿐");
  r.bag.push(hpItem);
  const g0 = r.gold;
  check(R.sellEquip(r, hpItem) === null && r.gold === g0 + price && !r.bag.includes(hpItem), "가방의 장비를 팔면 골드가 들어오고 가방에서 빠진다");
  check(!!R.sellEquip(r, same) && R.gearOf(r, k)[e.slot] === same, "끼고 있는 장비는 팔기로 못 판다");
  // 전투에 스탯이 들어간다
  const atkItem = ids.find((id) => EQUIP[id].stats.atk > 0 && EQUIP[id].slot !== e.slot && EQUIP[id].affinity !== k);
  r.bag.push(atkItem); R.equip(r, k, atkItem);
  const g = R.gearStats(r)[k];
  const B = (await import("../js/data/built.js")).default;
  const sG = C2.newCombat({ partyKeys: r.party, rows: r.rows, deck: [], enemyIds: ["fairymobcloserange"], seed: 2, hp: r.hp, maxHp: r.maxHp, gear: R.gearStats(r) });
  check(sG.party[0].atk === B.heroes[k].atk + g.atk, `전투에서 공격이 오른다 (${B.heroes[k].atk} → ${sG.party[0].atk})`);
  // 애착 — 그 사도가 끼면 Lv.3 스탯이 더
  const aff = ids.find((id) => EQUIP[id].affinity && EQUIP[id].affinityLv3);
  const ak = EQUIP[aff].affinity;
  const plain = R.statsOf(aff, "아무개"), mine = R.statsOf(aff, ak);
  check(Object.keys(plain).some((x) => mine[x] > plain[x]), `애착 사도가 끼면 Lv.3 스탯이 더 붙는다 (${EQUIP[aff].ko} · ${EQUIP[aff].affinityKo})`);
  // 보스 보상 — 마지막 보스는 안 준다
  r.node = 3; r.floor = 0; R.rollReward(r);
  check(r.reward.equip && r.reward.equip.length === 1, "보스는 장비 하나를 떨군다");
  const pick = r.reward.equip[0];
  check(R.takeEquip(r, pick) === null && r.bag.includes(pick) && R.takeEquip(r, r.reward.equip[1]) !== null, "하나만 가방에 넣는다");
  r.floor = 2; r.node = 4; R.rollReward(r);
  check(!r.reward.equip, "마지막 싸움(뿌리 깊은 곳의 우로스)은 장비를 안 준다(판이 끝난다)");
  // 보상 화면 · 캠프 화면 · 상점
  r.floor = 0; r.node = 3; R.rollReward(r);
  const rw = ui.rewardScreen(r, () => {});
  check(count(rw, "ecard") === 1, "보상 화면에 떨어진 장비 하나");
  // 드랍 테이블 — 싸움 종류 · 층마다 떨어지는 비율과 등급
  {
    const RU = await import("../js/rules.js"), CBm = await import("../js/cardbook.js");
    const rate = (setup, n = 3000) => {
      const t = { eq: 0, ne: 0, g: {} };
      for (let i = 0; i < n; i++) {
        const q = R.newRun(run.party.slice(), { ...run.rows }, 500 + i); setup(q); R.rollReward(q);
        if (q.reward.equip) { t.eq++; const g = EQUIP[q.reward.equip[0]].grade; t.g[g] = (t.g[g] || 0) + 1; }
        if (q.reward.neutral) t.ne++;
      }
      return { eq: t.eq / n, ne: t.ne / n, g: t.g };
    };
    const f1 = rate((q) => { q.floor = 0; q.node = 0; });
    check(Math.abs(f1.eq - RU.DROP.fight.equip) < 0.03 && Object.keys(f1.g).every((g) => g === "일반"), `일반 싸움 1층 — 장비 ${(f1.eq * 100).toFixed(1)}%(일반만)`);
    const f3 = rate((q) => { q.floor = 2; q.node = 0; });
    check(!f3.g["일반"] && !f3.g["전설"], `일반 싸움 3층 — 고급 · 희귀만 (${JSON.stringify(f3.g)})`);
    const el = rate((q) => { q.floor = 0; q.node = 0; q.elite = true; }, 400);
    const bo = rate((q) => { q.floor = 0; q.node = 3; }, 400);
    check(el.eq === 1 && bo.eq === 1, "엘리트 · 보스는 장비가 늘 떨어진다");
    check(f1.ne + f3.ne + el.ne + bo.ne === 0, "교주 카드는 싸움에서 안 떨어진다 — 상점 · 이벤트에서만");
    // 같은 장비도 떨어진다 — 1층 일반 싸움의 일반 장비를 하나 빼고 다 가져도, 가진 것이 다시 나온다
    {
      const q = R.newRun(run.party.slice(), { ...run.rows }, 901);
      const commons = Object.keys(EQUIP).filter((id) => EQUIP[id].grade === "일반");
      q.bag.push(...commons);
      let dup = null;
      for (let i = 0; i < 200 && !dup; i++) { q.rng = C2.makeRng(i + 1); q.floor = 0; q.node = 0; R.rollReward(q); if (q.reward.equip) dup = q.reward.equip[0]; }
      check(!!dup && commons.includes(dup), `가진 장비도 다시 떨어진다 (${dup && EQUIP[dup].ko})`);
      // 두 사도가 같은 장비를 낀다
      q.bag.push(dup);
      const [a, b] = q.party;
      const e1 = R.equip(q, a, dup), e2 = R.equip(q, b, dup);
      check(e1 === null && e2 === null && R.gearOf(q, a)[EQUIP[dup].slot] === dup && R.gearOf(q, b)[EQUIP[dup].slot] === dup, "같은 장비 둘을 두 사도가 하나씩 낀다");
      const sh = R.newRun(run.party.slice(), { ...run.rows }, 902); sh.bag.push(...Object.keys(EQUIP));
      const shown = R.offerEquip(sh, { 일반: 1, 고급: 1, 희귀: 1, 전설: 1 }, 3);
      check(shown.length === 3 && new Set(shown).size === 3, "상점 · 이벤트도 가진 장비를 낸다 — 한 번에 뽑는 것끼리는 안 겹친다");
    }
  }
  R.enterCamp(r, "campshop");
  const cs = ui.campScreen(r, true, () => {}, () => {});
  clickAll(cs, (n) => n.classList.contains("cp-gear"))[0].onclick();
  check(count(cs, "cp-gearmodal") === 1 && count(cs, "grow") === 3 && count(cs, "gslot") === 9, "캠프의 장비 창에서 사도 셋 × 세 칸을 본다");
  check(count(cs, "gout") === 0 && !clickAll(cs, (n) => n.tagName === "BUTTON" && /빼기/.test(n.textContent)).length, "장비 창에 「빼기」 단추가 없다");
  {
    // 낀 장비를 누르면 자세히 — 스탯 · 파는 값이 보인다
    const full = clickAll(cs, (n) => n.classList.contains("gslot") && n.classList.contains("full"));
    full[0].onclick();
    const pop = document.body.children.find((n) => n.classList.contains("eqpop"));
    check(!!pop && /팔면 \+\d+ 골드/.test(pop.textContent) && /공격력|방어력|체력|치명/.test(pop.textContent) && !/빼기/.test(pop.textContent), "낀 장비를 누르면 자세히(스탯 · 파는 값) — 빼기 단추는 없다");
    // 가방의 장비를 찬 칸에 끼면 — 판다고 묻고, 「팔고 낍니다」 로 바꿔 낀다
    const ck = k, cslot = e.slot, oldId = R.gearOf(r, ck)[cslot];
    const hko = (await import("../js/cardbook.js")).HERO_DATA[ck].ko;
    const nu = ids.find((id) => EQUIP[id].slot === cslot && id !== oldId);
    r.bag.push(nu); clickAll(cs, (n) => n.classList.contains("cp-gear"))[0].onclick();
    const tob = clickAll(cs, (n) => n.classList.contains("gtobtn") && n.textContent.startsWith(hko) && /바꾸기/.test(n.textContent));
    tob[tob.length - 1].onclick();
    const ask = document.body.children.find((n) => n.classList.contains("eqconfirm"));
    check(!!ask && ask.textContent.includes(`「${EQUIP[oldId].ko}」`) && /팔고\(\+\d+골드\)/.test(ask.textContent) && ask.textContent.includes(`「${EQUIP[nu].ko}」`), "찬 칸에 끼면 「옛 장비 를 팔고(+N골드) 새 장비 를 낍니다」 를 묻는다");
    check(R.gearOf(r, ck)[cslot] === oldId && r.bag.includes(nu), "묻는 동안은 아무것도 안 바뀐다");
    const gb = r.gold;
    clickAll(ask, (n) => n.classList.contains("bmuse"))[0].onclick();
    check(R.gearOf(r, ck)[cslot] === nu && !r.bag.includes(oldId) && r.gold === gb + R.sellPrice(oldId), "「팔고 낍니다」 — 새 장비를 끼고 옛 장비 값이 들어온다");
  }
  check(!/아직 안 돕니다/.test(cs.textContent), "장비 효과는 다 돈다 — 「아직 안 돕니다」 가 없다");
  // 장비 효과 — 낀 사도의 패시브로 붙고, 전투에서 터진다
  check(Object.values(EQUIP).every((x) => x.grade === "일반" || x.effectRead), "일반 말고는 효과 줄이 다 읽힌다");
  check(Object.values(EQUIP).every((x) => !x.affinity || x.affinityRead), "애착 줄이 다 읽힌다");
  {
    const gr = R.newRun(run.party.slice(), { ...run.rows }, 77), gk = gr.party[0];
    const gid = ids.find((id) => EQUIP[id].ko === "장난감 망원경");   // 공격 카드를 낼 때마다 무작위 적 피해
    gr.bag.push(gid); R.equip(gr, gk, gid);
    const gfx = R.gearPassives(gr);
    const gs = C2.newCombat({ partyKeys: gr.party, rows: gr.rows, deck: gr.deck, enemyIds: ["curburus"], seed: 3, hp: gr.hp, maxHp: gr.maxHp, gear: R.gearStats(gr), gearFx: gfx });
    const rule = gs.passives[gk].find((x) => x.gear);
    check(!!rule, `낀 장비의 효과가 패시브로 붙는다 (${EQUIP[gid].ko} → ${gk})`);
    const atk = Object.keys(B.cards).find((c) => B.cards[c].hero === gk && B.cards[c].type === "공격" && !B.cards[c].unique);
    gs.hand = [atk]; gs.ap = 9; C2.playCard(gs, 0, 0);
    check(gs.log.some((l) => l.includes(` · ${rule.name}`)), `공격 카드를 내면 장비 효과가 터진다 (${rule.name})`);
  }
  r.gold = 5000; r.shop = null; r.shopSeen = {};
  const sp = ui.shopScreen(r, () => {});
  check(r.shop.items.filter((it) => it.kind === "equip").length === 3, "골디의 상점에 장비 세 점");
  const before = r.bag.length;
  const idx = r.shop.items.findIndex((it) => it.kind === "equip");
  R.buy(r, idx);
  check(r.bag.length === before + 1, "장비를 사면 가방에 들어간다");
  // 사도가 나가면 장비는 가방으로
  const outK = r.party[0], nGear = Object.keys(R.gearOf(r, outK)).length, bagN = r.bag.length;
  const inK = r.bench[0];
  R.swapHero(r, outK, inK);
  check(r.bag.length === bagN + nGear && !r.gear[outK], `나가는 사도의 장비는 가방으로 (${nGear}개)`);
}

const e1 = ui.endScreen("lose", run, () => {});
check(e1.textContent.includes("여기까지"), "진 화면이 그려진다");
const e2 = ui.endScreen("clear", run, () => {});
check(e2.textContent.includes("끝까지"), "이긴 화면이 그려진다");

console.log("");
console.log("AP · 고학년 게이지 · 상성 (기획서 규칙)");
{
  const C = await import("../js/combat.js");
  const R = await import("../js/rules.js");
  const { HEROES } = await import("../js/data/heroes.js");
  const mk = (o = {}) => C.newCombat({ partyKeys: ["erpin", "ner", "elena"], deck: C.buildDeck(["erpin", "ner", "elena"]), enemyIds: ["fairymobcloserange"], seed: 11, ...o });

  // AP — 매 턴 3, **이월 없음**
  const st = mk();
  check(st.ap === R.AP_PER_TURN + st.startSp, `첫 턴 AP ${st.ap}`);
  st.ap = 9;                       // 잔뜩 남겨 두고 턴을 넘겨 본다
  C.endTurn(st);
  check(st.ap <= R.AP_PER_TURN + 2, `AP 는 이월되지 않는다 (9 남기고 넘겼는데 ${st.ap})`);

  // 고학년 게이지 — 쓴 AP 1당 +10%, 0코 카드는 충전 없음
  const g = mk();
  g.ap = 9; g.gauge = 0;
  const free = g.hand.find((id) => C.costOf(g, id) === 0);
  if (free) { g.hand = [free]; C.playCard(g, 0, 0); check(g.gauge === 0, `0코 카드는 게이지를 안 채운다 (${g.gauge}%)`); }
  const paid = ["ner_guard", "erpin_charge"].find((id) => C.costOf(g, id) > 0);
  const before = g.gauge, cost = C.costOf(g, paid);
  g.hand = [paid]; C.playCard(g, 0, 0);
  check(g.gauge === before + cost * R.GAUGE_PER_AP, `쓴 AP 1당 게이지 +10% (${cost}코 → +${g.gauge - before}%)`);

  // 고학년 스킬은 덱 밖이고 기획서에서 온다
  for (const k of ["erpin", "ner", "elena"]) {
    const u = C.ultOf(k);
    check(u && R.ULT_COSTS.includes(u.cost), `${HEROES[k].ko}의 고학년 스킬 「${u ? u.ko : "?"}」 ${u ? u.cost : "?"}%`);
    check(!C.buildDeck([k]).some((id) => id === k + "_ego"), `${HEROES[k].ko}의 고학년 스킬이 덱에 없다`);
  }

  const uz = mk();
  check(!!C.canUlt(uz, "erpin"), "게이지가 모자라면 못 쓴다");
  uz.gauge = 300;
  check(C.canUlt(uz, "erpin") === null, "게이지가 차면 쓸 수 있다");
  const ultCost = C.ultOf("erpin").cost;   // 비용은 기획서에서(원작 고학년 쿨타임 — docs/11 §3-3)
  C.useUlt(uz, "erpin");
  check(uz.gauge === 300 - ultCost, `쓰면 비용만큼 빠진다 (300 − ${ultCost} → ${uz.gauge}%)`);
  check(!!C.canUlt(uz, "erpin"), "같은 사도는 연속으로 못 쓴다");

  // 성격 상성 — 광기 → 순수 → 냉정 → 광기
  check(R.natureEdge("광기", "순수") === 1, "광기가 순수에 유리");
  check(R.natureEdge("순수", "광기") === -1, "순수는 광기에 불리");
  check(R.natureEdge("활발", "우울") === 1 && R.natureEdge("우울", "활발") === 1, "활발과 우울은 서로 유리");
  check(R.natureEdge("공명", "순수") === 0, "공명은 상성이 없다");

  // 취약·약화는 기획서 수치(+10% / -10%)
  check(R.FRAIL === 0.10 && R.WEAK === 0.10, `취약 +${R.FRAIL * 100}% · 약화 -${R.WEAK * 100}%`);
}

console.log("");
console.log("로비와 프로필");
{
  const L = await import("../js/lobby.js");
  const H = await import("../js/home-design.js");
  const { HERO_DATA } = await import("../js/cardbook.js");
  const s3 = doc.querySelector("#screen");
  let went = 0, dex = 0, help = 0;
  const byCls = (root, cls) => (function f(n) { for (const c of n.children) { if (c.classList.contains(cls)) return c; const r = f(c); if (r) return r; } return null; })(root);
  L.lobbyScreen(() => went++, { onDex: () => dex++, onHelp: () => help++ });
  check(s3.className === "lobby2", "로비는 메인 사도 + 메뉴 화면이다");
  const plate = byCls(s3, "lb-plate");
  check(!!plate && plate.textContent.includes("에르핀"), "처음 메인 사도는 에르핀");
  const line = byCls(s3, "lb-line");
  check(!!line && line.textContent.length > 3, `메인 사도가 인사한다 (「${line && line.textContent}」)`);
  const stand = clickAll(s3, (n) => n.classList.contains("lb-stand"))[0];
  const before = line.textContent;
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) { stand.onclick(); changed = line.textContent !== before; }
  check(changed, "메인 사도를 누르면 다른 말을 한다");
  check(/에르피엔[\s\S]*모나티엄[\s\S]*벨리티엔/.test(s3.textContent), "여정이 FLOORS 차례와 같다");
  clickAll(s3, (n) => n.classList.contains("lb-help"))[0].onclick();
  check(help === 1, "도움말 단추");
  clickAll(s3, (n) => n.classList.contains("lb-dex"))[0].onclick();
  check(dex === 1, "사도 도감 단추");
  L.lobbyScreen(() => went++, { onDex: () => dex++, onHelp: () => help++ });
  const prim = clickAll(s3, (n) => n.classList.contains("home-primary"))[0];
  check(!!prim && prim.textContent.includes("모험 시작"), "모험 시작 단추가 있다");
  prim.onclick();
  check(went === 1, "누르면 편성으로 넘어간다");

  // 메인 사도 바꾸기 — 고르면 그 사도가 서고, 다음에 켜도 그대로
  L.lobbyScreen(() => {}, {});
  clickAll(s3, (n) => n.classList.contains("lb-swap"))[0].onclick();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));   // 스파인 목록을 읽는 동안(가짜 setTimeout 은 바로 돈다)
  const modal = docBody.children.find((n) => n.classList.contains("lb-modal"));
  const picks = modal ? clickAll(modal, (n) => n.classList.contains("lb-pick")) : [];
  check(picks.length >= 100, `메인 사도 후보 ${picks.length}명`);
  const other = picks.find((b) => !b.textContent.includes("에르핀"));
  const otherKo = other.children[other.children.length - 1].textContent;   // 이름 칸(초상 자리표시 글자는 뺀다)
  other.onclick();
  check(!docBody.children.includes(modal), "고르면 창이 닫힌다");
  check(byCls(s3, "lb-plate").textContent.includes(otherKo), `고른 메인 사도가 선다 (${otherKo})`);
  L.lobbyScreen(() => {}, {});
  check(byCls(s3, "lb-plate").textContent.includes(otherKo), "다시 켜도 고른 메인 사도 그대로");
  const { setSetting } = await import("../js/settings.js");
  setSetting("lobbyHero", "에르핀");

  // 설정 — 로비 · 전투가 같은 창(settings-panel): 해상도 · 그래픽 품질 · 켜고 끄기 · 음량
  const SET = await import("../js/settings.js");
  const all = (root, cls) => { const out = []; (function f(n) { for (const c of n.children) { if (c.classList.contains(cls)) out.push(c); f(c); } })(root); return out; };
  clickAll(s3, (n) => n.classList.contains("lb-set"))[0].onclick();
  let sm = docBody.children.find((n) => n.classList.contains("lb-modal"));
  const opts = all(sm, "sp-opt");
  check(opts.length === 8 && opts.map((o) => o.textContent).join(" ").includes("1280×720") && opts.some((o) => o.textContent === "낮음"),
    `설정 — 해상도 다섯 · 그래픽 품질 셋 (${opts.map((o) => o.textContent).join(" ")})`);
  check(all(sm, "sp-tog").length >= 3 && all(sm, "sp-range").length === 3, "켜고 끄기 셋 이상 · 음량 셋(전체 · 목소리 · 효과음)");
  check(SET.getSettings().volSfx === 60 && SET.sfxVolume() > 0, `효과음 음량 기본 60 (${SET.getSettings().volSfx})`);
  opts.find((o) => o.textContent === "1280×720").onclick();
  check(SET.getSettings().res === "1280x720", "해상도를 고르면 설정에 남는다");
  sm = docBody.children.find((n) => n.classList.contains("lb-modal"));
  check(all(sm, "sp-opt").find((o) => o.textContent === "1280×720").classList.contains("on"), "고른 해상도에 불이 들어온다");
  all(sm, "sp-opt").find((o) => o.textContent === "낮음").onclick();
  check(SET.getSettings().quality === "low", "그래픽 품질 — 낮음");
  const vr = all(sm, "sp-range")[1];
  vr.value = "0"; vr.oninput();
  check(SET.getSettings().volVoice === 0 && SET.voiceVolume() === 0, "목소리 음량 0 이면 말하지 않는다");
  vr.value = "50"; vr.oninput();
  check(Math.abs(SET.voiceVolume() - SET.getSettings().volMaster / 100 * 0.5) < 1e-9, "목소리 음량 = 전체 × 목소리");
  SET.setSetting("res", "auto"); SET.setSetting("quality", "high"); SET.setSetting("volVoice", 100);
  clickAll(sm, (n) => n.classList.contains("lb-x"))[0].onclick();
  check(!docBody.children.some((n) => n.classList.contains("lb-modal")), "× 로 닫힌다");

  // 프로필 — 편성 단추 없이 열면 읽기만
  H.profileScreen(Object.keys(HERO_DATA)[0]);
  const dlg = docBody.children.find((n) => n.classList.contains("hero-profile"));
  check(!!dlg && dlg.open, "프로필이 열린다");
  check(dlg.textContent.includes("고학년 스킬"), "프로필에 고학년 스킬이 있다");
  check(!clickAll(dlg, (n) => n.classList.contains("home-primary")).length, "넣기 단추 없이 열면 읽기만");
  clickAll(dlg, (n) => n.classList.contains("profile-close"))[0].onclick();
  check(!docBody.children.includes(dlg), "닫으면 문서에서 사라진다");

  let took = 0;
  const one = Object.keys(HERO_DATA)[0];
  H.profileScreen(one, { onTake: () => took++, selected: false, full: false });
  const d2 = docBody.children.find((n) => n.classList.contains("hero-profile"));
  const take = clickAll(d2, (n) => n.classList.contains("home-primary"))[0];
  check(take && !take.disabled, "편성에서 열면 넣기 단추가 산다");
  take.onclick();
  check(took === 1 && !d2.open, "누르면 넣고 닫힌다");
  H.profileScreen(one, { onTake: () => {}, selected: false, full: true });
  const d3 = docBody.children.find((n) => n.classList.contains("hero-profile"));
  check(clickAll(d3, (n) => n.classList.contains("home-primary"))[0].disabled, "셋이 차면 막힌다");
  d3.close();
}

console.log("");
console.log("아군 미리보기 · 버릴 카드 고르기");
{
  const C = await import("../js/combat.js");
  // 벨라 「존재의 보호막」 — 자신 큰 실드, 아군 전원 작은 실드. 아군 몫도 벨라(시전자)의 방어력으로 센다(배율은 카드에서 읽는다)
  const s = C.newCombat({ partyKeys: ["에르핀", "네르", "벨라"], rows: {}, deck: ["네르_s2", "벨라_u1", "에르핀_u3", "벨라_u2", "네르_s3"], enemyIds: ["fairymobcloserange"], seed: 3 });
  s.party[0].hp = 20;
  const bella = s.party.find((u) => u.key === "벨라");
  const pv = C.previewAllies(s, s.hand.indexOf("벨라_u1"), 0);
  const allyShield = (C.cardOf(s, "벨라_u1").fx || []).find((f) => f.k === "shield" && f.target === "allAllies");
  check(pv && allyShield && pv[0].shield === Math.round(bella.def * allyShield.ratio) && pv[1].shield === pv[0].shield, `아군 실드는 시전자(벨라 방어력 ${bella.def}) 기준 — 에르핀 · 네르 모두 +${pv && pv[0].shield}`);
  check(pv[2].shield > pv[0].shield, `벨라 자신은 아군 몫보다 크다 — +${pv[2].shield}`);
  const hi = s.hand.indexOf("네르_s2");
  const ph = C.previewAllies(s, hi, 0);
  check(ph && ph[0].heal > 0 && !ph[1] && !ph[2], `달콤한 간식을 에르핀에게 — 회복 +${ph && ph[0].heal}, 다른 사도는 없음`);
  const hp0 = s.party[0].hp;
  C.playCard(s, hi, 0);
  check(s.party[0].hp - hp0 === ph[0].heal, "미리보기 값 그대로 찬다");

  // 버리기 — 「무작위」 가 없으면 낸 사람이 고른다
  const s2 = C.newCombat({ partyKeys: ["에르핀", "네르", "벨라"], rows: {}, deck: ["에르핀_u3", "네르_s2", "벨라_u1", "벨라_u2", "네르_s3", "벨라_s2", "에르핀_u3", "벨라_s3", "네르_s2", "벨라_s2", "네르_s3", "벨라_s3"], enemyIds: ["fairymobcloserange"], seed: 4 });   // 뽑을 더미가 넉넉해야 버린 카드가 다시 섞여 들지 않는다
  s2.ap = 9;
  const ci = s2.hand.indexOf("에르핀_u3");
  check(C.discardChoice(s2, ci) === 2, "컨닝 페이퍼 — 버릴 카드 2장을 고른다");
  const keep = s2.hand.filter((id, i) => i !== ci);
  const pickIds = [keep[1], keep[3]];
  C.playCard(s2, ci, 0, { discard: pickIds });
  check(pickIds.every((id) => s2.discard.includes(id)), `고른 카드가 버려진다 (${pickIds.join(", ")})`);
  const E = await import("../js/effects.js");
  check(E.parseEffect("무작위 손패 1장 버리고 드로우 2").fx.find((f) => f.k === "discard").random === true, "「무작위 손패 1장 버리」 는 무작위");
  check(E.parseEffect("손패 1장 버리고 무작위 적 공격력 140% 피해").fx.find((f) => f.k === "discard").random === false, "적을 꾸미는 「무작위」 는 버리기와 상관없다");
}

console.log("");
console.log("사도의 말");
{
  const C = await import("../js/combat.js");
  const TALK = (await import("../js/data/talk.js")).default;
  const B = (await import("../js/data/built.js")).default;

  const MOMENTS = ["start", "hit", "down", "heal", "kill", "ego", "win", "idle"];
  // 손으로 쓴 여덟은 여덟 순간이 다 차 있어야 한다.
  const HAND = ["에르핀", "네르", "엘레나", "아멜리아", "에슈르", "마요", "티그", "프리클"];
  const holes = [];
  for (const k of HAND) for (const m of MOMENTS) {
    const v = (TALK.lines[k] || {})[m];
    if (!v || !v.length) holes.push(`${k}/${m}`);
  }
  check(holes.length === 0, holes.length ? `빈 자리 ${holes.length}: ${holes.slice(0, 4).join(", ")}…` : "손으로 쓴 여덟 명 × 여덟 순간이 다 찼다");

  // 나머지는 대본 규칙으로만 고른다 — 안 맞으면 비워 둔다. 몇 명이 말하는지는 세어 알린다.
  const all = Object.keys(B.heroes);
  const speak = all.filter((k) => Object.keys(TALK.lines[k] || {}).length);
  check(speak.length > all.length * 0.9, `${speak.length}/${all.length}명이 무언가 말한다`);

  // 실제로 말하는가 — 키는 기획서의 한글 이름이다
  const trio = ["티그", "에르핀", "네르"];
  const s2 = C.newCombat({ partyKeys: trio, deck: C.buildDeck(trio), enemyIds: ["fairymobcloserange"], seed: 3 });
  check(s2.log.some((l) => l.includes('"')), "전투를 열며 누군가 말한다");
  check(!!s2.bubble, "말풍선이 들어온다");

  // 같은 순간을 되풀이하지 않는다 — 같은 말을 두 번 들으면 대사가 아니라 소리가 된다
  const a1 = C.speak(s2, "티그", "kill");
  const a2 = C.speak(s2, "티그", "kill");
  check(a1 && !a2, "같은 순간은 한 번만 말한다");

  // 없는 순간에는 아무 말도 안 한다 — 틀린 대사보다 없는 편이 낫다
  check(C.speak(s2, "티그", "없는순간") === null, "없는 순간에는 말하지 않는다");
}

console.log("");
console.log("그림");
const art = await import("../js/art.js");
const hasSd = fsNode.existsSync(pathNode.join(ASSETS, "sd", "manifest.json"));
const ph = art.portrait("erpin", { ko: "에르핀", tint: "#7fd3a8" });
check(ph.querySelectorAll("img").length === 0, "자리표시는 그림 없이 그려진다");
check(ph.textContent === "에르핀", "자리표시에 이름이 뜬다");
if (hasSd) {
  await art.loadManifest();
  art.setMode("sd");
  const im = art.portrait("erpin", { ko: "에르핀", tint: "#7fd3a8" });
  check(im.querySelectorAll("img").length === 1, "꺼낸 그림이 있으면 그림으로 그린다");
  // 기획서 135명이 모두 그림에 이어졌는가 — 이름 표와 실제 파일을 견준다
  {
    const ARTMAP = (await import("../js/data/artmap.js")).default;
    const D = (await import("../js/data/design.js")).default;
    const keys = Object.keys(D.heroes);
    const linked = keys.filter((k) => ARTMAP.art[k]);
    check(linked.length === keys.length, `기획서 ${keys.length}명이 모두 그림에 이어졌다 (${linked.length})`);

    const sd = JSON.parse(fsNode.readFileSync(pathNode.join(ASSETS, "sd", "manifest.json"), "utf8"));
    const withArt = keys.filter((k) => sd[k]);
    check(withArt.length === keys.length, `사도 그림이 ${withArt.length}/${keys.length} 장 놓였다`);
    const withMini = keys.filter((k) => sd["minimi_" + k]);
    check(withMini.length === keys.length, `미니미가 ${withMini.length}/${keys.length} 장 놓였다`);

    const spine = JSON.parse(fsNode.readFileSync(pathNode.join(ASSETS, "spine", "manifest.json"), "utf8"));
    const inGame = keys.filter((k) => spine.ingame[k]);
    const stand = keys.filter((k) => spine.standing[k]);
    check(inGame.length === keys.length, `전투 SD 스파인 ${inGame.length}/${keys.length}`);
    check(stand.length === keys.length, `스탠딩 스파인 ${stand.length}/${keys.length}`);
  }

  const none = art.portrait("없는사도", { ko: "아무개", tint: "#888" });
  check(none.querySelectorAll("img").length === 0, "목록에 없는 사도는 자리표시로 떨어진다");

  // 자리마다 다른 그림 — 전투는 SD, 맵은 미니미, 이벤트는 스탠딩(없으면 떨어진다)
  check(art.slotOf("erpin", "battle") === "sd", `전투는 SD (${art.slotOf("erpin", "battle")})`);
  const m = art.slotOf("erpin", "map");
  check(m === "minimi" || m === "sd", `맵은 미니미, 없으면 SD 로 떨어진다 (${m})`);
  const ev = art.slotOf("erpin", "event");
  check(["standing", "sd"].includes(ev), `이벤트는 스탠딩, 없으면 SD 로 떨어진다 (${ev})`);
  const mapImg = art.portrait("erpin", { ko: "에르핀", tint: "#7fd3a8", slot: "map" });
  check(mapImg.classList.contains("art-map"), "자리 이름이 칸에 붙는다");
} else {
  console.log("  (꺼낸 그림이 없어 sd 검사는 건너뜁니다)");
}

// ── 모든 js 가 읽히는가 ────────────────────────────────────────────────
// main.js 는 읽는 것만으로 게임이 부팅된다(그림 모드가 바뀐다). 그래서 맨 끝에 둔다.
// 가장 값싸고 가장 자주 걸리는 검사다. 괄호 하나 남으면 모듈이 통째로 안 읽히고
// 화면은 그냥 하얗게 뜬다 — 다른 검사 여든아홉 개를 다 통과하면서.
console.log("");
console.log("낱말 (docs/06-낱말.md)");
{
  // 얼개는 카제나에서 빌려 왔지만 낱말까지 빌려 오면 안 된다.
  // 한동안 도감 머리에 「모든 세력」이라고 적혀 있었다 — 트릭컬에 세력이라는 구분은 없다.
  const BORROWED = [
    ["세력", "종족"],
    ["상세 정보", "사도 정보"],
    ["전투원", "사도"],
    ["에고", "고학년 스킬"],
    ["오퍼레이터", "사도"],
    ["요원", "사도"],
  ];
  // 편성 화면과 전투 화면의 글자를 다 모은다.
  // 둘 다 같은 #screen 을 쓰고 screen() 이 그때마다 비운다 —
  // 나중에 읽으면 앞 화면 글자가 이미 지워져 있다(그래서 한동안 아무것도 못 잡았다).
  const dexText = ui.partyScreen(() => {}).textContent;
  const fightText = ui.fightScreen(R.newRun(started.party, started.rows, 11), () => {}).textContent;
  const text = dexText + " " + fightText;
  const hit = BORROWED.filter(([a]) => text.includes(a));
  check(!hit.length, hit.length
    ? `빌려 온 말이 남아 있다: ${hit.map(([a, b]) => a + " → " + b).join(", ")}`
    : `빌려 온 말 ${BORROWED.length}가지가 화면에 없다`);

  // 줄 이름은 기획서 것 하나로 맞춘다 — 전투만 '앞줄'이라 부르던 때가 있었다
  check(!/앞줄|가운데줄|뒷줄/.test(text) && /전열|중열|후열/.test(text), "위치는 전열·중열·후열로 부른다");
  // 성급이지 등급이 아니다. 등급은 장비 희귀도에 쓴다.
  check(!/등급/.test(dexText), "사도는 성급으로 부른다");
}

console.log("");
console.log("작은 표 아이콘");
{
  const root = pathNode.join(pathNode.dirname(f2u(import.meta.url)), "..");
  const B3 = (await import("../js/data/built.js")).default;
  const H3 = Object.values(B3.heroes);
  const need = [
    ...[...new Set(H3.map((h) => h.nature))].map((v) => ["성격", v]),
    ...[...new Set(H3.map((h) => h.role))].map((v) => ["역할", v]),
    ...[...new Set(H3.map((h) => h.race))].map((v) => ["종족", v]),
    ...["전열", "중열", "후열"].map((v) => ["위치", v]),
  ];
  const gone = need.filter(([k, v]) => !fsNode.existsSync(pathNode.join(root, "assets", "uiicons", `${k}_${v}.png`)));
  check(gone.length === 0,
    gone.length ? `없는 아이콘 ${gone.length}: ${gone.map(([k, v]) => k + "_" + v).join(", ")} (화면은 글자로 떨어진다)`
                : `성격·역할·종족·위치 아이콘 ${need.length}장이 다 있다`);
}

console.log("");
console.log("인물 사전");
{
  const BI = (await import("../js/data/bible.js")).default;
  const B4 = (await import("../js/data/built.js")).default;
  const heroes = Object.keys(B4.heroes);
  const got = heroes.filter((k) => BI.heroes[k]);
  check(got.length > heroes.length * 0.95, `${got.length}/${heroes.length}명이 실려 있다`);
  // 그림을 그리는 데 쓰는 칸이 비면 안 된다
  const thin = got.filter((k) => !(BI.heroes[k].traits || []).length || !BI.heroes[k].who);
  check(thin.length === 0, thin.length ? `who 나 traits 가 빈 사도 ${thin.length}` : "실린 사도는 who 와 traits 를 다 가졌다");
  // 나무위키 유래다 — 출처와 조건이 파일에 적혀 있어야 한다
  check(/CC BY-NC-SA/.test(BI._meta.license || "") && !!BI._meta.source, "출처와 라이선스가 적혀 있다");
  // 말투·관계는 안 가져온다. 글 쓸 때 쓰는 것이지 그림에 쓰는 것이 아니다.
  const leaked = got.filter((k) => BI.heroes[k].voice || BI.heroes[k].rel || BI.heroes[k].theater);
  check(leaked.length === 0, leaked.length ? `그림에 안 쓰는 칸이 섞였다 ${leaked.length}` : "말투·관계·극장은 안 들어왔다");
}

console.log("");
console.log("카드 그림");
{
  const CA = (await import("../js/data/cardart.js")).default;
  const root = pathNode.join(pathNode.dirname(f2u(import.meta.url)), "..");
  const ids = Object.keys(CA.pic);
  const gone = ids.filter((id) => !fsNode.existsSync(pathNode.join(root, CA.pic[id])));
  check(gone.length === 0, gone.length ? `가리키는 그림 중 없는 것 ${gone.length}장` : `카드 그림 ${ids.length}장이 모두 있다`);

  // 자리는 사도당 아홉 — 시작 넷 · 고유 넷 · 고학년 스킬 하나
  const B2 = (await import("../js/data/built.js")).default;
  const heroes = Object.keys(B2.heroes);
  const sum = CA._meta.drawn + CA._meta.icon + CA._meta.ult + CA._meta.none;
  check(sum === heroes.length * 9, `카드 자리가 사도 × 9 다 (${sum} / ${heroes.length * 9})`);
  // 고학년 스킬은 그려도 안 바뀐다 — 인게임 고학년 스킬 아이콘이 곧 그 사도의 고학년 스킬 표다
  const ultDrawn = heroes.filter((k) => (CA.pic[k + "_ult"] || "").includes("/cardart/"));
  check(!ultDrawn.length, ultDrawn.length ? `고학년 스킬에 그린 그림이 끼어들었다 ${ultDrawn.length}` : "고학년 스킬은 원작 고학년 스킬 아이콘을 쓴다");

  // 고학년 스킬과 시그니처는 한 명도 빠지지 않는다
  const ult = heroes.filter((k) => CA.pic[k + "_ult"]).length;
  const sig = heroes.filter((k) => CA.pic[k + "_u0"]).length;
  check(ult === heroes.length && sig === heroes.length, `고학년 스킬 ${ult}/${heroes.length} · 시그니처 ${sig}/${heroes.length}`);

  // 우리가 그린 것이 있으면 원작 아이콘을 이긴다 — 이 규칙이 깨지면 그려도 안 바뀐다
  const drawn = ids.filter((id) => CA.pic[id].startsWith("assets/cardart/"));
  check(drawn.every((id) => !CA.pic[id].includes("skillicons")), "그린 것이 아이콘을 이긴다");
  console.log(`       → 그린 것 ${CA._meta.drawn} · 아이콘 ${CA._meta.icon} · 빈 자리 ${CA._meta.none}`);
}

console.log("");
console.log("지도 (js/map.js · docs/10-지도.md)");
{
  const M = await import("../js/map.js");
  // 씨앗 200개 × 세 층 — 모양 규칙이 늘 지켜지는가
  // 1-1 은 일반 전투 2~4 갈래 · 1-2~1-10 은 줄마다 2~4칸(싸움 칸 하나는) · 1-11 휴식(상점) 하나 · 1-12 보스
  let bad = [], seen = new Set();
  const KINDS = new Set(["fight", "elite", "camp", "campshop", "event", "boss"]);
  for (let seed = 1; seed <= 200; seed++) for (let f = 0; f < 3; f++) {
    const m = M.genMap(seed * 7919, f);
    if (m.rows[0].length !== 1 || m.rows[0][0].type !== "start" || m.at !== m.rows[0][0].id) bad.push(`${seed}/${f} 출발 칸(1-0)`);
    const rows = m.rows.slice(1), ids = new Set(rows.flat().map((n) => n.id));     // 1-1 … 1-12
    const types = rows.map((r) => r.map((n) => n.type));
    if (rows.length !== 12) bad.push(`${seed}/${f} 줄 ${rows.length}`);
    if (!types[0].every((t) => t === "fight") || types[0].length < 2 || types[0].length > 4) bad.push(`${seed}/${f} 첫 줄 ${types[0]}`);
    if (types[10].join() !== "campshop" || types[11].join() !== "boss") bad.push(`${seed}/${f} 보스 앞 · 보스`);
    for (let r = 1; r <= 9; r++) {
      if (types[r].length < 2 || types[r].length > 4) bad.push(`${seed}/${f} ${r + 1}줄 칸 수 ${types[r].length}`);
      if (!types[r].some((t) => t === "fight" || t === "elite")) bad.push(`${seed}/${f} ${r + 1}줄에 싸움이 없다`);
      if (r < 3 && types[r].some((t) => t === "elite" || t === "camp")) bad.push(`${seed}/${f} ${r + 1}줄에 이른 엘리트 · 휴식`);
      if (types[r].some((t) => !KINDS.has(t))) bad.push(`${seed}/${f} 모르는 칸 ${types[r]}`);
    }
    // 모든 칸이 첫 줄에서 닿고, 모든 칸에서 보스에 닿는다
    const reach = new Set(rows[0].map((n) => n.id));
    for (const r of rows) for (const n of r) if (reach.has(n.id)) n.next.forEach((x) => reach.add(x));
    if (reach.size !== ids.size) bad.push(`${seed}/${f} 못 닿는 칸 ${ids.size - reach.size}`);
    for (let r = 0; r < rows.length - 1; r++) for (const n of rows[r]) {
      if (!n.next.length) bad.push(`${seed}/${f} ${n.id} 막다른 칸`);
      if (n.next.some((x) => !rows[r + 1].some((z) => z.id === x))) bad.push(`${seed}/${f} ${n.id} 줄을 건너뛴다`);
    }
    // 선은 같은 자리 · 바로 옆 자리로만, 서로 엇갈리지 않는다(1-10 → 1-11 로 모이는 것은 뺀다)
    for (let r = 0; r < rows.length - 3; r++) {
      const L = [];
      for (const nd of rows[r]) for (const x of nd.next) { const t = rows[r + 1].find((z) => z.id === x); L.push([nd.lane, t.lane]); }
      if (L.some(([i, j]) => Math.abs(i - j) > 1)) bad.push(`${seed}/${f} ${r + 1}줄 선이 두 자리 넘게 건너뛴다`);
      if (L.some(([a1, b1]) => L.some(([a2, b2]) => (a1 < a2 && b1 > b2)))) bad.push(`${seed}/${f} ${r + 1}줄 선이 엇갈린다`);
    }
    seen.add(types.map((t) => t.join("")).join("|"));
  }
  check(!bad.length, bad.length ? `지도 모양이 규칙을 어긴다 ${bad.length}: ${bad.slice(0, 3).join(" · ")}` : "지도 600장이 모두 규칙대로다(1-1 일반 2~4갈래 · 줄마다 2~4칸 · 1-11 휴식(상점) · 1-12 보스 · 다 이어짐 · 선은 옆 자리까지만 · 엇갈림 없음)");
  check(seen.size > 500, `씨앗마다 길이 다르다 (${seen.size}가지)`);
  check(JSON.stringify(M.genMap(42, 1)) === JSON.stringify(M.genMap(42, 1)), "같은 씨앗 · 같은 층이면 같은 지도");
  {
    const all = [];
    for (let seed = 1; seed <= 200; seed++) all.push(...M.genMap(seed, 0).rows.flat().map((n) => n.type));
    const cnt = (t) => all.filter((x) => x === t).length;
    check(cnt("elite") > 0 && cnt("camp") > 0 && cnt("event") > 0, `여섯 가지 칸이 다 나온다 (일반 ${cnt("fight")} · 엘리트 ${cnt("elite")} · 휴식 ${cnt("camp")} · 휴식(상점) ${cnt("campshop")} · 이벤트 ${cnt("event")} · 보스 ${cnt("boss")})`);
  }

  // 칸에 들어가기 — 싸움은 세기(node), 엘리트는 run.elite, 보스는 node 3
  const mr = R.newRun(started.party, started.rows, 99);
  const starts = M.reachable(mr);
  check(starts.length >= 2 && starts.length <= 4, `처음엔 첫 줄 2~4 갈래에서 고른다 (${starts.length})`);
  check(M.enterNode(mr, "r5c0") === null, "이어지지 않은 칸에는 못 간다");
  const first = M.enterNode(mr, starts[0]);
  check(first && first.type === "fight" && mr.node === 0 && !R.isBoss(mr) && !mr.elite, "첫 칸은 약한 일반 싸움");
  check(M.stageName(mr, first) === "1-1", `칸 이름은 층-줄 (${M.stageName(mr, first)})`);
  // 보스까지 걸어가 본다 — 엘리트가 있으면 그리로
  while (M.reachable(mr).length) {
    const opts = M.reachable(mr).map((id) => M.nodeById(M.mapOf(mr), id));
    const pickN = opts.find((n) => n.type === "elite") || opts[0];
    const n = M.enterNode(mr, pickN.id);
    if (n.type === "elite") {
      check(mr.elite && mr.node >= 1, `엘리트는 한 단계 센 싸움 (node ${mr.node})`);
      R.rollReward(mr);
      check(mr.reward.equip && mr.reward.equip.length && mr.reward.flash !== undefined, "엘리트를 이기면 장비를 고른다");
      mr.elite = false; mr.reward = null;
    }
  }
  check(M.currentNode(mr).type === "boss" && R.isBoss(mr) && M.stageName(mr, M.currentNode(mr)) === "1-12", "끝 칸은 1-12 보스");
  const adv2 = R.advance(mr);
  check(mr.floor === 1 && adv2.swap === false, "보스를 넘으면 다음 층(사도 교체 없이)");
  check(M.mapOf(mr).floor === 1 && M.currentNode(mr).type === "start" && M.stageName(mr, M.currentNode(mr)) === "2-0" && M.reachable(mr).length >= 2, "다음 층은 새 지도, 2-0 출발 칸부터");

  // 화면 — 칸을 누르면 들어간다
  let entered = null;
  const mr2 = R.newRun(started.party, started.rows, 7);
  const ms = ui.mapScreen(mr2, (n) => (entered = n), () => {});
  check(count(ms, "mnode") >= 10, `지도에 칸이 깔린다 (${count(ms, "mnode")})`);
  check(count(ms, "can") === M.reachable(mr2).length && count(ms, "can") >= 2, `갈 수 있는 칸만 빛난다 (${count(ms, "can")})`);
  check(count(ms, "t-start") === 1, "맨 앞에 출발 칸(1-0)");
  ms.enterNode(M.reachable(mr2)[0]);
  check(entered && entered.type === "fight", "칸을 누르면 그 칸으로 들어간다");
}

console.log("");
console.log("판 이어하기 (js/save.js) — 새로고침해도 그 자리에서");
{
  const S = await import("../js/save.js");
  const L = await import("../js/lobby.js");
  const { CARDS: CARDS_ALL } = await import("../js/cardbook.js");
  const canonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.innerWidth = 1600; globalThis.innerHeight = 900;      // 얻은 것이 날아가는 자리 — 가짜 DOM 에는 창 크기가 없다
  // 이긴 판의 「얻은 것」 머리를 고친다 — 가짜 DOM 에 querySelector(.이름) 하나를 잠깐 붙인다
  Node.prototype.querySelector = function (sel) { const cls = sel.replace(/^\./, ""); return (function f(n) { for (const c of n.children) { if (c.classList.contains(cls)) return c; const r = f(c); if (r) return r; } return null; })(this); };
  try {
    const rr = R.newRun(started.party, started.rows, 777);
    rr.where = { k: "fight" };
    const fa = ui.fightScreen(rr, () => {}, () => {});
    check(!!mem[S.SAVE_KEY], "싸움을 열자마자 판과 싸움이 적힌다");
    for (let k = 0; k < 2; k++) {
      const c = clickAll(fa, (n) => n.classList.contains("card") && !n.classList.contains("no"))[0];
      if (!c) break;
      const foe = clickAll(fa, (n) => n.classList.contains("foe") && !n.classList.contains("dead"))[0];
      fa.dropCard(Number(c.dataset.i), foe ? Number(foe.dataset.idx) : 0);
    }
    const sv = S.readSave();
    check(!!sv && !!sv.combat && sv.combat.hand.join() === fa._st.hand.join() && sv.combat.ap === fa._st.ap && sv.combat.log.length === fa._st.log.length,
      "카드를 낸 뒤의 손패 · AP · 기록이 그대로 적힌다");
    const fb = ui.fightScreen(sv.run, () => {}, () => {}, { resume: sv.combat });
    check(fb._st === sv.combat, "이어하면 새로 굴리지 않고 적어 둔 싸움을 연다");
    check(count(fb, "card") === fa._st.hand.length, `손패가 그대로 그려진다 (${count(fb, "card")}장)`);
    check(fb._st.rng.state === fa._st.rng.state && sv.run.rng.state === rr.rng.state, "판 · 싸움의 난수도 그 자리에서 잇는다");
    check(sv.run.reward && canonEq(sv.run.reward, rr.reward), "전리품(골드 · 장비)도 처음 굴린 그대로");

    // 고르던 신탁 — 창이 떠 있는 채로 새로고침하면 같은 창이 다시 뜬다
    const st = fb._st;
    const uid = Object.keys(CARDS_ALL).find((id) => CARDS_ALL[id].unique && started.party.includes(CARDS_ALL[id].hero)
      && (CARDS_ALL[id].flash || []).length === 5 && CARDS_ALL[id].cost <= st.ap && !C2.canPlay(st, id));
    st.hand.push(uid);
    st.glow[uid] = { kind: "card", options: [{ n: 1, shin: null }, { n: 3, shin: "draw" }] };
    const epis = () => docBody.children.filter((n) => n.classList.contains("epimodal"));
    fb.dropCard(st.hand.indexOf(uid), C2.alive(st.enemies)[0].idx);
    check(epis().length === 1, "빛나는 카드를 내면 신탁 창이 뜬다");
    const sv2 = S.readSave();
    check(!!sv2.combat.pendingEpi && sv2.combat.pendingEpi.cardId === uid, "고르던 신탁이 판에 적힌다");
    for (const n of epis()) n.remove();                // 새로고침 — 창은 사라진다
    const fc = ui.fightScreen(sv2.run, () => {}, () => {}, { resume: sv2.combat });
    check(epis().length === 1, "이어하면 그 신탁 창이 다시 뜬다");
    const opt = clickAll(epis()[0], (n) => n.classList.contains("epiopt"))[1];
    opt.onclick();
    const sv3 = S.readSave();
    check(!sv3.combat.pendingEpi && sv3.combat.flash[uid] === 3 && sv3.combat.shin[uid] === "draw" && !sv3.combat.hand.includes(uid),
      "고르면 신탁이 걸리고 카드가 나간 판이 적힌다");
    check(fc._st.rng.state === sv3.combat.rng.state, "적힌 난수 = 화면의 난수");

    // 싸움이 끝나면 다음 칸으로 갈 자리(fightDone)가 적힌다 — 금화를 줍는 연출 중에 새로고침해도 넘어간다
    for (const e of fc._st.enemies) { e.hp = 1; e.block = 0; e.shield = 0; }
    for (let k = 0; k < 6 && !fc._st.over; k++) {
      const c = clickAll(fc, (n) => n.classList.contains("card") && !n.classList.contains("no"))[0];
      if (!c) { clickAll(fc).find((n) => label(n) === "턴 넘기기").onclick(); continue; }
      const foe = clickAll(fc, (n) => n.classList.contains("foe") && !n.classList.contains("dead"))[0];
      fc.dropCard(Number(c.dataset.i), foe ? Number(foe.dataset.idx) : 0);
    }
    const sv4 = S.readSave();
    check(fc._st.over && sv4 && sv4.run.where.k === "fightDone" && sv4.run.where.result === fc._st.over && !sv4.combat,
      `싸움이 끝나면 「끝난 싸움」 자리가 적힌다 (${fc._st.over})`);

    // 로비 — 이어할 판이 있으면 「이어하기」 가 맨 위에, 새 모험은 한 번 묻는다
    const s3 = doc.querySelector("#screen");
    let went = 0, resumed = 0;
    L.lobbyScreen(() => went++, { resume: { run: sv4.run, go: () => resumed++ } });
    const prim = clickAll(s3, (n) => n.classList.contains("home-primary"))[0];
    check(!!prim && prim.textContent.includes("이어하기"), `맨 위 단추가 이어하기 (${prim && prim.textContent})`);
    prim.onclick();
    check(resumed === 1, "누르면 그 판으로");
    L.lobbyScreen(() => went++, { resume: { run: sv4.run, go: () => resumed++ } });
    clickAll(s3, (n) => n.classList.contains("lb-new"))[0].onclick();
    const ask = docBody.children.find((n) => n.classList.contains("lb-modal"));
    check(!!ask && /버/.test(ask.textContent) && went === 0, "새 모험은 지금 판을 버린다고 먼저 묻는다");
    clickAll(ask, (n) => n.classList.contains("lb-confirmyes"))[0].onclick();
    check(went === 1 && !docBody.children.includes(ask), "버린다고 하면 편성으로");
    L.lobbyScreen(() => went++, {});
    check(clickAll(s3, (n) => n.classList.contains("home-primary"))[0].textContent.includes("모험 시작"), "이어할 판이 없으면 모험 시작");
  } finally { delete globalThis.localStorage; delete globalThis.innerWidth; delete globalThis.innerHeight; delete Node.prototype.querySelector; }
}

console.log("모듈이 읽히는가");
{
  const JS = pathNode.join(pathNode.dirname(f2u(import.meta.url)), "..", "js");
  const walk = (d) => fsNode.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(pathNode.join(d, e.name)) : e.name.endsWith(".js") ? [pathNode.join(d, e.name)] : []);
  const files = walk(JS);
  const broken = [];
  for (const f of files) {
    try { await import(pathToUrl(f)); } catch (e) { broken.push(`${pathNode.basename(f)} — ${e.message.split("\n")[0]}`); }
  }
  check(broken.length === 0, broken.length ? `안 읽히는 파일 ${broken.length}: ${broken.join(" / ")}` : `js ${files.length}개가 모두 읽힌다`);
}

console.log("");
console.log(fails ? `\n실패 ${fails}개` : "\n전부 통과");
process.exit(fails ? 1 : 0);
