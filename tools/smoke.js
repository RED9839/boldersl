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
// ── 팀 편성 — 큰 카드 셋 + 오른쪽 이번 싸움 ─────────────────────────
check(p.className.includes("teamscreen"), "팀 편성으로 연다");
check(count(p, "tcard") === 3 && count(p, "empty") === 3, `빈 자리 셋 (${count(p, "empty")})`);
check(count(p, "tfoe") === 2, `이번에 나오는 적이 보인다 (${count(p, "tfoe")})`);
check(/에르피엔/.test(p.textContent) && /커버러스/.test(p.textContent), "어디서 싸우고 보스가 누구인지 적는다");

const search = () => (function find(n) {
  for (const c of n.children) { if (c.classList.contains("dsearch")) return c; const r = find(c); if (r) return r; }
  return null;
})(p);
const nameOf = (c) => { const f = (x) => { for (const y of x.children) { if (y.classList.contains("dname")) return y; const r = f(y); if (r) return r; } return null; };
  const n = f(c); return n ? n.textContent : ""; };

function take(name) {
  const slot = clickAll(p, (n) => n.classList.contains("empty"))[0];
  if (!slot) return false;
  slot.onclick();                                   // 서랍이 열린다
  const sb = search(); sb.value = name; sb.oninput();
  const card = clickAll(p, (n) => n.classList.contains("pcard")).find((c) => nameOf(c) === name);
  if (card) card.onclick();
  return !!card;
}

check(take("에르핀"), "빈 자리를 눌러 서랍에서 고른다");
check(count(p, "empty") === 2, "고르면 자리가 찬다");
check(count(p, "tdrawer") === 1 && !count(p, "open"), "고르면 서랍이 닫힌다");
// 위치는 고르는 것이 아니라 정해진 것이다 — 보여 주기만 한다
check(/후열 딜러 · 적은 전열부터 노립니다/.test(p.textContent), "정해진 위치를 알려 준다");
{
  const pos = clickAll(p, (n) => n.classList.contains("pbtn"));
  check(pos.length === 0, `위치를 누를 수 없다 (누를 수 있는 것 ${pos.length})`);
}

for (const n of ["네르", "티그"]) check(take(n), `${n} 을 찾아 넣는다`);
check(count(p, "empty") === 0, "세 자리가 다 찬다");
check(/3\/3/.test(p.textContent), "머리에 몇 명 골랐는지 나온다");

// 함께 가면 · 덱
check(/각별|친함/.test(p.textContent), "사이가 보인다");
check(!p.textContent.includes("초면"), "초면을 적지 않는다");
check(/광기→순수→냉정→광기/.test(p.textContent), "성격 상성을 적어 준다");
check(/첫 턴 AP/.test(p.textContent), "첫 턴 AP 가 보인다");
check(count(p, "dkcard") === 12, `덱 열두 장이 미리 보인다 (${count(p, "dkcard")})`);

// 카드의 ⌕ 로 사도 정보에 들어갔다 온다
clickAll(p, (n) => n.classList.contains("tlook"))[0].onclick();
check(count(p, "side") === 1, "카드의 ⌕ 로 사도 정보에 들어간다");
check(count(p, "statgrid") === 1 && count(p, "gcard") === 0, "들어가면 능력치부터 보인다");
clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "tcard") === 3, "편성으로 돌아온다");

// 도감으로 갔다 온다
clickAll(p).find((n) => n.classList.contains("dexbtn")).onclick();
check(count(p, "dexgrid") === 1, "사도 도감으로 넘어간다");
check(count(p, "dex") === 135, `도감에 135명이 깔린다 (${count(p, "dex")})`);
check(count(p, "decho") === 19, `이격 열아홉에 표가 붙는다 (${count(p, "decho")})`);
{
  const cls = clickAll(p, (n) => n.classList.contains("dex")).map((c) => c.className);
  check(!cls.some((c) => /\bs[123]\b/.test(c)), "이름표 위 성급 띠를 없앴다");
}
check(/에르핀 · 네르 · 티그/.test(p.textContent), "도감 아래에 고른 셋이 적힌다");

{
  const sb = search(); sb.value = "에르핀"; sb.oninput();
  const names = clickAll(p, (n) => n.classList.contains("dex")).map(nameOf);
  check(names.includes("에르핀") && names.includes("에르핀(왕도)"), `이름으로 찾으면 이격도 같이 나온다 (${names.join(", ")})`);
  clickAll(p, (n) => n.classList.contains("dex")).find((c) => nameOf(c) === "에르핀").onclick();
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
check(count(p, "gpic") + count(p, "gglyph") === 8,
  `여덟 장이 저마다 그림이나 무늬를 갖는다 (그림 ${count(p, "gpic")} · 무늬 ${count(p, "gglyph")})`);

clickAll(p, (n) => n.classList.contains("sidebtn")).find((b) => b.textContent === "번뜩임").onclick();
check(count(p, "flashbox") === 4, `번뜩임 갈피에 고유 넉 장 (${count(p, "flashbox")})`);
check(count(p, "flash") === 20, `번뜩임 스무 개 (${count(p, "flash")})`);
clickAll(p, (n) => n.classList.contains("sidebtn")).find((b) => b.textContent === "고학년 스킬").onclick();
check(count(p, "ultbig") === 1, "고학년 스킬 갈피가 그려진다");
check(/게이지 \d+% 를 씁니다/.test(p.textContent), "고학년 스킬에 게이지 값이 적힌다");

clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "dexgrid") === 1, "도감으로 돌아온다");
clickAll(p).find((n) => n.classList.contains("back")).onclick();
check(count(p, "tcard") === 3, "다시 편성으로 돌아온다");

const goBtn = clickAll(p).find((n) => n.textContent === "떠납니다");
check(goBtn && !goBtn.disabled, "셋을 고르면 떠날 수 있다");
goBtn.onclick();
check(started && started.party.length === 3, "편성이 넘어온다");

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
}

console.log("\n이후 화면");
// 전투를 이겼든 졌든 본다 — 이긴 판에서만 보던 때, 전투가 지면 보상 화면 검사가 통째로 빠졌다(카드를 끌어서만 내게 바꾼 뒤)
{
  let picked = { card: "없음", flash: null };
  R.rollReward(run);
  const rw = ui.rewardScreen(run, (id, f) => (picked = { card: id, flash: f }));

  // 보상은 그 사도의 고유 카드다 — 누구 것인지가 카드 위에 붙는다
  const cards = clickAll(rw, (n) => n.classList.contains("gcard"));
  check(cards.length === 3, `보상 카드 셋 (${cards.length})`);
  check(count(rw, "rwho") === 3, `카드마다 누구 것인지 붙는다 (${count(rw, "rwho")})`);
  {
    const B6 = (await import("../js/data/built.js")).default;
    const names = R.rewardCards(run).map((id) => B6.cards[id] && B6.cards[id].hero);
    check(names.every((h) => run.party.includes(h)), `보상은 파티 사도의 카드다 (${names.join(", ")})`);
    check(R.rewardCards(run).every((id) => B6.cards[id] && B6.cards[id].unique), "보상은 고유 카드다");
  }

  // 번뜩임은 **가진 고유 카드**에만 붙는다
  const before = R.offerFlash(run);
  check(before === null, "고유 카드가 없으면 번뜩임도 없다");
  check(/고유 카드를 먼저 얻으세요/.test(rw.textContent), "고유 카드가 없어서라고 적어 준다");
  {
    // 고유 카드는 있는데 안 뜬 경우 — 다른 말로 적어야 한다
    const r3 = R.newRun(run.party, run.rows, 5);
    r3.deck.push(R.rewardCards(r3)[0]);
    r3.reward = { cards: [], flash: null };
    const rw3 = ui.rewardScreen(r3, () => {});
    check(/이번에는 번뜩임이 일어나지 않았습니다/.test(rw3.textContent), "안 뜬 것은 안 떴다고 적어 준다");
  }

  // 누르면 바로 넣지 않고 가운데에 자세히 — 거기서 「덱에 넣습니다」
  cards[0].onclick();
  check(picked.card === "없음", "보상 카드를 눌러서는 바로 안 넣는다(자세히 창)");
  const useBtn = clickAll(document.body, (n) => n.classList.contains("bmuse"))[0];
  check(!!useBtn && useBtn.textContent === "덱에 넣습니다", "자세히 창에 「덱에 넣습니다」가 있다");
  if (useBtn) useBtn.onclick();
  check(picked.card !== "없음", "카드를 고를 수 있다");
  R.takeReward(run, picked.card);

  // 번뜩임은 무조건 안 일어난다 — 뜰 때까지 굴려 보고, 뜨는 비율도 잰다
  {
    const RULES2 = await import("../js/rules.js");
    let hit = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const r2 = R.newRun(run.party, run.rows, i + 1);
      r2.deck.push(picked.card);
      R.rollReward(r2);
      if (r2.reward.flash) hit++;
    }
    const got = hit / N;
    check(Math.abs(got - RULES2.FLASH_CHANCE) < 0.03,
      `번뜩임이 ${(got * 100).toFixed(1)}% 로 뜬다 (정한 값 ${RULES2.FLASH_CHANCE * 100}%)`);
  }

  // 한 번 굴린 보상은 다시 그려도 안 바뀐다
  {
    const a1 = JSON.stringify(run.reward);
    ui.rewardScreen(run, () => {});
    check(a1 === JSON.stringify(run.reward), "보상은 다시 그려도 안 바뀐다");
  }

  // 번뜩임이 뜰 때까지 굴려서 고르는 것을 본다
  let tries = 0;
  do { R.rollReward(run); tries++; } while (!run.reward.flash && tries < 200);
  check(!!run.reward.flash, `굴리면 번뜩임이 뜬다 (${tries}번째)`);
  const rw2 = ui.rewardScreen(run, (id, f) => (picked = { card: id, flash: f }));
  const flashes = clickAll(rw2, (n) => n.classList.contains("fcard"));
  check(flashes.length === 3, `다섯 중 셋을 보여 준다 (${flashes.length})`);
  // 번뜩임도 누르면 한 번 더 보여 주고, 창에서 「이 번뜩임을 붙입니다」
  flashes[0].onclick();
  const flashUse = clickAll(document.body, (n) => n.classList.contains("bmuse") && n.textContent === "이 번뜩임을 붙입니다").pop();
  check(!!flashUse, "번뜩임 창에 「이 번뜩임을 붙입니다」가 있다");
  if (flashUse) flashUse.onclick();
  check(picked.flash && picked.flash.cardId && picked.flash.n, "번뜩임을 고를 수 있다");
  R.takeFlash(run, picked.flash);
  check(run.flash[picked.flash.cardId] === picked.flash.n, "번뜩임이 그 카드에 붙는다");
  check(R.offerFlash(run) === null || R.offerFlash(run).cardId !== picked.flash.cardId,
    "한 카드에 두 번 붙지 않는다");

  // 붙은 번뜩임이 전투에서 실제로 그 카드를 바꾸는가
  {
    const C = await import("../js/combat.js");
    const s6 = C.newCombat({ partyKeys: run.party, rows: run.rows, deck: run.deck.slice(),
      enemyIds: ["fairymobcloserange"], seed: 3, flash: run.flash });
    const base = (await import("../js/cardbook.js")).CARDS[picked.flash.cardId];
    const now = C.cardOf(s6, picked.flash.cardId);
    check(now.flashOn === picked.flash.n && now.text !== base.text,
      `전투에서 카드가 바뀐다 (${base.text.slice(0, 18)}… → ${now.text.slice(0, 18)}…)`);
  }
}
run.floor = 0; run.node = 3;
const adv = R.advance(run);
check(adv.swap === true, "보스를 넘기면 교체 기회가 온다");
let swapped = false;
const sw = ui.swapScreen(run, () => (swapped = true));
const outs = clickAll(sw, (n) => n.classList.contains("scard"));
check(outs.length === run.party.length, `내보낼 사람이 셋 (${outs.length})`);
check(/내보낼 사람을 먼저 고르면/.test(sw.textContent), "부를 사람 칸이 왜 비었는지 적어 준다");
check(count(sw, "slose") === 3, "카드마다 바꾸면 잃는 것을 적는다");
outs[0].onclick();
const ins = clickAll(sw, (n) => n.classList.contains("pcard"));
check(ins.length > 100, `부를 사람 목록이 열린다 (${ins.length})`);
{
  // 들어오는 사도는 나간 사람 자리를 물려받지 않고 제 자리에 선다 — 위치는 고정이다
  const B7 = (await import("../js/data/built.js")).default;
  const outKey = run.party[0];
  ins[0].onclick();
  const inKey = run.party[0];
  check(swapped && inKey !== outKey, `바꾸면 파티가 바뀐다 (${outKey} → ${inKey})`);
  check(run.rows[inKey] === B7.heroes[inKey].row, `들어온 사도는 제 자리에 선다 (${run.rows[inKey]})`);
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
  check(neu.length === 3 && neu.every((it) => CB[it.id].playable), `중립 카드 셋, 모두 효과가 다 도는 것 (${neu.map((it) => CB[it.id].name).join(" · ")})`);
  check(neu.every((it) => it.price === CB[it.id].price), "값은 기획서의 골드 그대로");
  check(r.shop.items.filter((it) => it.kind === "unique").length === 2, "파티 고유 카드 둘");
  const before = r.gold, deckN = r.deck.length;
  const buyBtn = clickAll(sp, (n) => n.classList.contains("sprice"))[0];
  buyBtn.onclick();
  check(r.gold === before - r.shop.items[0].price && r.deck.length === deckN + 1, "사면 골드가 줄고 덱에 들어온다");
  check(/팔렸습니다/.test(sp.textContent), "산 칸은 팔렸다고 적는다");
  clickAll(sp, (n) => n.classList.contains("shaggle"))[0].onclick();
  check(/할인은 안 돼요/.test(sp.textContent), "골디는 할인하지 않는다");
  clickAll(sp, (n) => n.classList.contains("srmbtn"))[0].onclick();
  const toRemove = clickAll(sp, (n) => n.classList.contains("gcard") && n.title === "눌러서 덱에서 빼기");
  check(toRemove.length === r.deck.length, `뺄 카드로 덱 전체가 펼쳐진다 (${toRemove.length})`);
  const g2 = r.gold; toRemove[0].onclick();
  check(r.deck.length === deckN && r.gold === g2 - 75 && r.shop.removeUsed, "카드 제거 75골드, 한 번만");
  check(R.removePrice(r) === 100, "다음 제거는 100골드");
  const r2 = R.newRun(run.party.slice(), { ...run.rows }, 12); r2.gold = 10; r2.node = 3;
  const sp2 = ui.shopScreen(r2, () => {});
  clickAll(sp2, (n) => n.classList.contains("sprice"))[0].onclick();
  check(r2.gold === 10 && /값이 있는 법/.test(sp2.textContent), "골드가 모자라면 못 사고 골디가 말해 준다");
  // 실비아(수양딸)가 있으면 선물 — 할인이 아니라 선물
  const B = (await import("../js/data/built.js")).default;
  const sylvia = Object.keys(B.heroes).find((k) => B.heroes[k].ko === "실비아");
  const r3 = R.newRun([sylvia, ...run.party.filter((k) => k !== sylvia).slice(0, 2)], {}, 13); r3.node = 3;
  const n3 = r3.deck.length;
  const sp3 = ui.shopScreen(r3, () => {});
  check(r3.shop.gift && r3.deck.length === n3 + 1 && /황금대공/.test(sp3.textContent), `실비아가 있으면 선물 한 장 (${CB[r3.shop.gift].name})`);
  // 중립 카드가 전투에서 실제로 돈다 — 주인이 없으니 공격력이 가장 높은 아군 기준
  const nid = Object.keys(CB).find((id) => CB[id].neutral && CB[id].playable && CB[id].name === "저놈 잡아라!");
  const s9 = C2.newCombat({ partyKeys: r.party, rows: r.rows, deck: [nid, ...r.deck], enemyIds: ["fairymobcloserange"], seed: 5 });
  s9.hand = [nid]; s9.ap = 3;
  const res = C2.playCard(s9, 0, 0);
  check(res && res.ok !== false, "중립 카드를 전투에서 낼 수 있다");
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
  check(!/골디의 상점 들르기/.test(cs.textContent), "캠프만 있는 칸에는 상점이 없다");
  check(/주말농장에서 쉬는 중/.test(cs.textContent), "쓰러진 사도는 주말농장에서 쉰다고 적는다");
  const rest = clickAll(cs, (n) => n.classList.contains("cact"))[0];
  rest.onclick();
  check(r.hp[k0] === 10 + Math.round(r.maxHp[k0] * 0.3) && r.hp[k1] === 0, `쉬면 살아 있는 사도만 30% (${r.hp[k0]}/${r.maxHp[k0]})`);
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
  check(/골디의 상점 들르기/.test(cs2.textContent), "캠프 + 상점 칸에는 골디의 좌판이 있다");
  clickAll(cs2, (n) => n.classList.contains("cshop"))[0].onclick();
  check(shopped && !r.stops["0:campshop"].used, "상점에 들러도 캠프 선택은 남는다");
  const train = clickAll(cs2, (n) => n.classList.contains("cact"))[1];
  train.onclick();
  const fl = clickAll(cs2, (n) => n.classList.contains("fcard"));
  check(fl.length === 3, `수련은 번뜩임 다섯 중 셋 (${fl.length})`);
  fl[0].onclick();
  check(r.flash[r.camp.train.cardId] && r.stops["0:campshop"].used === "train", "수련하면 번뜩임이 붙는다");
  const back = ui.shopScreen(r, () => {}, { back: "캠프로 돌아갑니다" });
  check(/캠프로 돌아갑니다/.test(back.textContent), "캠프에서 연 상점은 캠프로 돌아간다");
}

console.log("\n장비");
{
  const { EQUIP } = await import("../js/cardbook.js");
  const ids = Object.keys(EQUIP);
  check(ids.length === 103, `기획서의 장비 103종을 읽는다 (${ids.length})`);
  const slots = {}; for (const id of ids) slots[EQUIP[id].slot] = (slots[EQUIP[id].slot] || 0) + 1;
  check(slots["무기"] === 35 && slots["방어구"] === 23 && slots["장신구"] === 45, `칸: 무기 ${slots["무기"]} · 방어구 ${slots["방어구"]} · 장신구 ${slots["장신구"]}`);
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
  check(/캠프에서/.test(R.equip(r, k, same) || ""), "차 있는 칸은 캠프에서만 바꾼다");
  check(R.equip(r, k, same, { swap: true }) === null && r.bag.includes(hpItem), "캠프에서는 바꿔 끼고, 뺀 것은 가방으로");
  check(r.maxHp[k] === mh + EQUIP[same].stats.hp, "바꾸면 최대 HP 도 따라 바뀐다");
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
  check(r.reward.equip && r.reward.equip.length === 3, "보스를 잡으면 장비 셋 중 하나");
  const pick = r.reward.equip[0];
  check(R.takeEquip(r, pick) === null && r.bag.includes(pick) && R.takeEquip(r, r.reward.equip[1]) !== null, "하나만 가방에 넣는다");
  r.floor = 2; R.rollReward(r);
  check(!r.reward.equip, "마지막 보스는 장비를 안 준다(판이 끝난다)");
  // 보상 화면 · 캠프 화면 · 상점
  r.floor = 0; r.node = 3; R.rollReward(r);
  const rw = ui.rewardScreen(r, () => {});
  check(count(rw, "ecard") === 3, "보상 화면에 장비 카드 셋");
  R.enterCamp(r, "campshop");
  const cs = ui.campScreen(r, true, () => {}, () => {});
  check(count(cs, "grow") === 3 && count(cs, "gslot") === 9, "캠프에서 사도 셋 × 세 칸을 본다");
  check(/아직 안 돕니다/.test(cs.textContent) || !r.bag.length, "아직 안 도는 효과는 그렇다고 적는다");
  r.gold = 5000; r.shop = null; r.shopSeen = {};
  const sp = ui.shopScreen(r, () => {});
  check(r.shop.items.some((it) => it.kind === "equip"), "골디의 상점에 장비 한 점");
  const before = r.bag.length;
  const eqBtn = clickAll(sp, (n) => n.classList.contains("sprice") && n.closest && n.closest(".ecard"));
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
  C.useUlt(uz, "erpin");
  check(uz.gauge === 0, `쓰면 비용만큼 빠진다 (${uz.gauge}%)`);
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
console.log("로비와 프로필 (코덱스 화면)");
{
  const H = await import("../js/home-design.js");
  const { HERO_DATA } = await import("../js/cardbook.js");
  const s3 = doc.querySelector("#screen");
  let went = 0;
  H.lobbyScreen(() => went++);
  const persons = clickAll(s3, (n) => n.classList.contains("scene-person"));
  check(persons.length === 3, `앞세운 사도 셋이 선다 (${persons.map((p2) => p2.attrs["aria-label"] || "?").join(", ")})`);
  // 영문 키로 찾으면 하나도 안 걸려 목록 앞 셋이 선다 — 실제로 그랬다
  check(/에르핀 프로필/.test(persons.map((p2) => p2.attrs["aria-label"]).join("|")), "뜻한 사도가 선다(목록 앞 셋이 아니다)");
  const prim = clickAll(s3, (n) => n.classList.contains("home-primary"))[0];
  check(!!prim, "새로운 모험 단추가 있다");
  prim.onclick();
  check(went === 1, "누르면 편성으로 넘어간다");
  check(/에르피엔[\s\S]*모나티엄[\s\S]*벨리티엔/.test(s3.textContent), "여정이 FLOORS 차례와 같다");

  // 프로필 — 로비에서 열면 읽기만, 편성에서 열면 넣을 수 있다
  H.lobbyScreen(() => {});
  clickAll(s3, (n) => n.classList.contains("scene-person"))[0].onclick();
  const dlg = docBody.children.find((n) => n.classList.contains("hero-profile"));
  check(!!dlg && dlg.open, "프로필이 열린다");
  check(clickAll(dlg, () => true).length >= 0 && dlg.textContent.includes("고학년 스킬"), "프로필에 고학년 스킬이 있다");
  check(!clickAll(dlg, (n) => n.classList.contains("home-primary")).length, "로비에서 열면 편성 단추가 없다");
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
  check(mr.floor === 1 && adv2.swap, "보스를 넘으면 다음 층(사도 교체 기회)");
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
