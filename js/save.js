// 판 이어하기 — 한 판(run)과 지금 싸움(combat)을 브라우저에 적어 두고, 새로고침해도 그 자리에서 잇는다.
//
// 언제 적나: 칸에 들어가 그 칸의 것(보상 · 신탁 · 진열 · 이벤트)을 굴린 직후, 그리고 무엇이든 고른 직후 —
// 결과가 화면에 그려지기 **전에**(ui.js · main.js). 그래서 결과를 보고 새로고침하면 고른 뒤의 판으로 돌아오고,
// 고르기 전에 새로고침하면 똑같은 선택지가 다시 나온다. 판의 난수(run.rng) · 싸움의 난수(combat.rng)도
// 그 자리의 상태를 같이 적으니, 새로고침으로 굴림을 다시 굴릴 수 없다.
//
// 적는 모양 { v, run, combat } — v 가 다르거나, 깨졌거나, 모르는 카드 · 사도 · 적이 나오면 버리고 로비에서 시작한다.
//   run     판 그대로(JSON) + rngState. run.where 가 어느 화면인지(map · event · camp · shop · fight · fightDone)
//   combat  싸움 중일 때만(where 가 fight). 적의 수(intent)는 적 데이터 안의 길로, 신탁 장부(book)는 읽을 때 다시 만든다
// 브라우저가 저장을 막아도 게임은 돈다 — 이어하기만 안 될 뿐이다.
import { DEV } from "./dev.js";
import { makeRng } from "./combat.js";
import { CARDS, HERO_DATA, EQUIP, flashed } from "./cardbook.js";
import { ENEMIES } from "./data/enemies.js";

export const SAVE_KEY = "bolzena.run";
export const SAVE_V = 1;
const WHERE = ["map", "event", "camp", "shop", "fight", "fightDone"];

// 적의 수는 enemies.js 의 그 객체를 그대로 가리킨다 — 「힘을 모은 다음 수」 를 같은 객체인지로 알아본다(combat.js intentRush).
// 그래서 객체째 적지 않고 그 적 데이터 안의 길(["intents", "2", "next"])로 적고, 읽을 때 같은 객체를 다시 찾아 건다.
function pathTo(root, target, path = [], seen = new Set()) {
  if (root === target) return path;
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  for (const k of Object.keys(root)) {
    const p = pathTo(root[k], target, [...path, k], seen);
    if (p) return p;
  }
  return null;
}
const follow = (root, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);

// ── 싸움 ────────────────────────────────────────────────────────────────
export function packCombat(s) {
  const { rng, book, fx, ...rest } = s;     // fx — 화면의 연출 쪽지(fight-screen.js). 판이 아니라 적지 않는다
  const enemies = s.enemies.map((e) => {
    if (!e.intent) return { ...e, intent: null };
    const path = pathTo(ENEMIES[e.key], e.intent);
    return { ...e, intent: path ? { path } : { raw: e.intent } };   // raw — 데이터 밖의 수(지금은 없다). 이어도 「같은 수」 비교만 어긋난다
  });
  return JSON.parse(JSON.stringify({ ...rest, enemies, rngState: rng.state }));
}

export function unpackCombat(data) {
  const { rngState, ...s } = JSON.parse(JSON.stringify(data));
  if (typeof rngState !== "number") throw new Error("싸움 난수가 없다");
  s.rng = makeRng(1);
  s.rng.state = rngState;
  s.enemies = s.enemies.map((e) => {
    if (!ENEMIES[e.key]) throw new Error(`모르는 적 ${e.key}`);
    if (!e.intent) return { ...e, intent: null };
    const it = e.intent.path ? follow(ENEMIES[e.key], e.intent.path) : e.intent.raw;
    if (!it || typeof it !== "object") throw new Error(`${e.key} 의 수를 못 찾는다`);
    return { ...e, intent: it };
  });
  // 신탁을 얹은 장부 — 고른 신탁(flash)에서 다시 만든다(newCombat · applyEpiphany 와 같은 것)
  s.book = {};
  for (const [id, n] of Object.entries(s.flash || {})) if (CARDS[id]) s.book[id] = flashed(CARDS[id], n);
  return s;
}

// ── 판 ──────────────────────────────────────────────────────────────────
export function packRun(run) {
  const { rng, ...rest } = run;
  return JSON.parse(JSON.stringify({ ...rest, rngState: rng.state }));
}

export function unpackRun(data) {
  const { rngState, ...run } = JSON.parse(JSON.stringify(data));
  if (typeof rngState !== "number") throw new Error("판 난수가 없다");
  run.rng = makeRng(1);
  run.rng.state = rngState;
  return run;
}

// 한 벌 — 싸움 중이 아니면 combat 은 넣지 않는다
export function pack(run, combat = null) {
  const fighting = run.where && run.where.k === "fight";
  return { v: SAVE_V, run: packRun(run), combat: fighting && combat ? packCombat(combat) : null };
}

// 모르는 것이 하나라도 나오면 이 저장은 못 쓴다
const known = (ids, book) => Array.isArray(ids) && ids.every((id) => typeof id === "string" && !!book[id]);
function check(d) {
  if (!d || d.v !== SAVE_V || !d.run) throw new Error("판 번호가 다르다");
  const r = d.run;
  if (!known(r.party, HERO_DATA) || !r.party.length) throw new Error("모르는 사도");
  if (!known(r.deck, CARDS)) throw new Error("모르는 카드");
  if (!Object.keys(r.flash || {}).every((id) => CARDS[id])) throw new Error("모르는 신탁 카드");
  if (!known(r.bag || [], EQUIP)) throw new Error("모르는 장비");
  for (const g of Object.values(r.gear || {})) if (!known(Object.values(g), EQUIP)) throw new Error("모르는 장비");
  if (!r.where || !WHERE.includes(r.where.k)) throw new Error("어느 화면인지 모른다");
  if (r.where.k === "fight") {
    const c = d.combat;
    if (!c) throw new Error("싸움이 없다");
    for (const pile of [c.hand, c.draw, c.discard, c.gone]) if (!known(pile, CARDS)) throw new Error("모르는 카드(싸움)");
    if (!known(c.party.map((u) => u.key), HERO_DATA)) throw new Error("모르는 사도(싸움)");
  }
}

// 읽어서 되살린다 — 못 쓰면 null
export function unpack(d) {
  try {
    check(d);
    const run = unpackRun(d.run);
    const combat = run.where.k === "fight" ? unpackCombat(d.combat) : null;
    return { run, combat };
  } catch { return null; }
}

// ── 브라우저에 적기 ─────────────────────────────────────────────────────
// 끝난 판은 적지 않는다(이어할 것이 없다)
// 마지막으로 적은 것이 실제로 적혔는지 — 「판은 저장됩니다」 를 말해도 되는지 화면이 본다
let lastOk = false;
export const saveOk = () => lastOk;

export function writeSave(run, combat = null) {
  if (!run || run.done || !run.where || DEV) return false;   // 시험 화면은 적지 않는다
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(pack(run, combat))); return (lastOk = true); }
  catch { return (lastOk = false); }       // 막힌 브라우저 · 가득 찬 저장소 — 이어하기만 안 된다
}

export function readSave() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  let d = null;
  try { d = JSON.parse(raw); } catch { d = null; }
  const got = unpack(d);
  if (!got) clearSave();                   // 깨졌거나 옛 판 — 조용히 버린다
  return got;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 막힌 브라우저 */ }
}
