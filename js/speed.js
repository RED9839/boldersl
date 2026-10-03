// 전투 배속 — 1배 · 2배(카제나의 1×/2× 단추). 전투 화면이 떠 있는 동안만 걸린다 — 로비 · 편성 · 지도는 늘 1배.
// 규칙(combat.js)은 그대로 두고 시간만 당긴다:
//   now()        전투 시계(ms) — 배율만큼 빨리 간다. 연출 타이밍(fxEnd · 돌진 · 걸어 나가기)은 이것으로 잰다
//   after(ms,fn) 전투 시계로 ms 뒤 — 배율을 바꾸면 걸어 둔 것도 그 자리에서 새 배율로 다시 건다(진행 중인 연출도 바로 빨라진다)
//   cancel(h)    after 로 건 것을 걷는다(setTimeout 번호를 줘도 걷는다)
//   rate()       지금 배율 — 스파인 · 이펙트가 프레임 사이 시간에 곱한다
// CSS 애니메이션 · 트랜지션 · element.animate 는 전투 중 매 프레임 document.getAnimations() 를 훑어 playbackRate 를 맞춘다.
// 호출부를 하나하나 감싸면 새로 넣는 연출이 빠지기 쉽다 — 훑기는 css 에서 붙은 것까지 다 잡는다.
// 끝없이 도는 것(iterations Infinity — 숨쉬기 · 빛나는 테)은 빼 둔다. 연출이 아니라 꾸밈이라 두 배로 돌면 어지럽다.
// 설정 저장은 settings.js(setSetting "speed") — 다음 전투 · 다음 접속에도 남는다.
// settings.js → spine-view.js → 이 파일로 돌아 들어오는 고리가 있어 저장값은 처음 쓸 때 읽는다(읽을 때 settings 가 아직 안 섰을 수 있다)
import { getSettings, setSetting } from "./settings.js";

export const SPEEDS = [1, 2];
let speed = 0;                       // 0 — 아직 안 읽음
let battle = null;                   // 떠 있는 전투 화면(#screen.battle)
const perf = () => (typeof performance === "object" && performance.now ? performance.now() : Date.now());

export function getSpeed() {
  if (!speed) { let v = 1; try { v = Number(getSettings().speed) || 1; } catch { /* 설정을 못 읽으면 1배 */ } speed = SPEEDS.includes(v) ? v : 1; }
  return speed;
}
// 전투 화면이 떠 있을 때만 배율. #screen 은 화면마다 같은 상자를 비워 다시 쓴다(ui-common screen) — 그래서
// 붙어 있는지에 더해 아직 전투 화면인지(.battle)도 본다. 다른 화면으로 가면 저절로 1배로 돌아온다
export function rate() {
  return battle && battle.isConnected && battle.classList && battle.classList.contains("battle") ? getSpeed() : 1;
}

// 전투 시계 — 배율이 바뀌면 그때까지 흐른 몫을 접어 두고 새 배율로 잇는다(뒤로 가지 않게)
let vBase = perf(), rBase = vBase, lastRate = 1;
export function now() {
  const r = rate(), p = perf();
  if (r !== lastRate) { vBase += (p - rBase) * lastRate; rBase = p; lastRate = r; }
  return vBase + (p - rBase) * r;
}

const timers = new Set();            // 걸어 둔 것 { at 전투 시계, fn, t setTimeout 번호 }
function arm(h) {
  clearTimeout(h.t);
  h.t = setTimeout(() => { if (timers.delete(h)) h.fn(); }, Math.max(0, (h.at - now()) / rate()));
}
export function after(ms, fn) {
  const h = { at: now() + Math.max(0, Number(ms) || 0), fn, t: 0 };
  timers.add(h);                     // 먼저 넣는다 — 시험(smoke)의 setTimeout 은 그 자리에서 부른다
  arm(h);
  return h;
}
export function cancel(h) {
  if (h && typeof h === "object") { if (timers.delete(h)) clearTimeout(h.t); }
  else if (h) clearTimeout(h);
}
// 전투 시계로 ms 기다리는 약속(이펙트 차례)
export const sleep = (ms) => new Promise((r) => after(ms, r));

// 바꾼다 — 저장하고, 걸어 둔 것 · 돌고 있는 애니메이션을 새 배율로
export function setSpeed(v) {
  v = SPEEDS.includes(Number(v)) ? Number(v) : 1;
  now();                             // 옛 배율로 흐른 몫을 접어 둔다
  speed = v;
  try { setSetting("speed", v); } catch { /* 막힌 저장소 — 이번 판에만 */ }
  now();
  for (const h of timers) arm(h);
  tune();
  pump();
  return v;
}

// 전투 화면이 열렸다 — 그 화면이 떨어질 때까지 배율이 걸린다
export function enterBattle(el) {
  now();
  battle = el || null;
  now();
  pump();
}

// ── 애니메이션 — 훑어서 playbackRate 를 맞춘다 ──
const touched = typeof WeakSet === "function" ? new WeakSet() : null;
const looping = (a) => { try { return a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity; } catch { return false; } };
function tune() {
  if (typeof document !== "object" || typeof document.getAnimations !== "function" || !touched) return;
  const r = rate();
  for (const a of document.getAnimations()) {
    if (looping(a)) continue;
    if (r === 1) { if (touched.has(a)) { touched.delete(a); if (a.playbackRate !== 1) a.playbackRate = 1; } continue; }
    if (a.playbackRate !== r) { a.playbackRate = r; touched.add(a); }
  }
}
let raf = 0;
function pump() {
  if (raf || typeof requestAnimationFrame !== "function") return;
  const step = () => {
    raf = 0;
    tune();
    if (rate() !== 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
