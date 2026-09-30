// 설정 — 전투 메뉴(☰)에서 바꾼다. 브라우저에 적어 두고, 켤 때 다시 건다.
//   spine  사도·적을 움직이는 그림(스파인)으로. 끄면 그림 한 장 — 느린 기계에서 가볍다
//   calm   움직임 줄이기 — 반짝임 · 튀는 효과를 끈다
//   big    글자 크게 — 전투 화면의 이름 · 카드 글 · 체력 숫자를 한 치수 더
// 적어 두는 곳(localStorage)이 막힌 브라우저에서도 돈다 — 그때는 이번 판에만 남는다.
import * as art from "./art.js";

const KEY = "boldersl.settings";
const DEF = { spine: true, calm: false, big: false };
let mem = null;

export function getSettings() {
  if (mem) return { ...mem };
  try { mem = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { mem = { ...DEF }; }
  return { ...mem };
}

export function setSetting(k, v) {
  const s = getSettings();
  s[k] = v;
  mem = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 막힌 브라우저 — 이번 판에만 */ }
  applySettings(s);
}

export function applySettings(s = getSettings()) {
  art.setSpine(s.spine !== false);
  const root = typeof document === "object" && document.documentElement;
  if (!root || !root.classList) return;
  root.classList.toggle("calm", !!s.calm);
  root.classList.toggle("bigtext", !!s.big);
}
