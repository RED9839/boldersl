// 설정 — 로비의 ⚙ · 전투 메뉴(☰)에서 바꾼다(창은 js/settings-panel.js 하나). 브라우저에 적어 두고, 켤 때 다시 건다.
//   spine     사도·적을 움직이는 그림(스파인)으로. 끄면 그림 한 장 — 느린 기계에서 가볍다
//   calm      움직임 줄이기 — 반짝임 · 튀는 효과를 끈다
//   big       글자 크게 — 전투 화면의 이름 · 카드 글 · 체력 숫자를 한 치수 더
//   res       화면 해상도 — auto(창에 맞춤) · "1280x720" 따위. 그 크기 기준으로 배치 배율을 잡는다(창보다 크면 창에 맞춤) — js/stage.js
//   quality   그래픽 품질 — high · mid · low. 스파인을 그리는 픽셀 수(1 · 0.75 · 0.5배) — js/spine-view.js
//   volMaster · volVoice   전체 · 목소리 음량(0~100)
//   lobbyHero 로비의 메인 사도
// 적어 두는 곳(localStorage)이 막힌 브라우저에서도 돈다 — 그때는 이번 판에만 남는다.
import * as art from "./art.js";
import { setResolution } from "./stage.js";
import { setRenderScale } from "./spine-view.js";

const KEY = "bolzena.settings";
// 옛 이름(볼더슬) 때 저장한 설정 — 새 열쇠가 비어 있으면 한 번 옮겨 온다
try { if (!localStorage.getItem(KEY) && localStorage.getItem("boldersl.settings")) localStorage.setItem(KEY, localStorage.getItem("boldersl.settings")); } catch {}
const DEF = { spine: true, calm: false, big: false, res: "auto", quality: "high", volMaster: 20, volVoice: 10, sv: 2 };
export const RES_CHOICES = ["auto", "1280x720", "1600x900", "1920x1080", "2560x1440"];
export const QUALITY = { high: 1, mid: 0.75, low: 0.5 };
let mem = null;
const subs = new Set();

export function getSettings() {
  if (mem) return { ...mem };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { saved = {}; }
  mem = { ...DEF, ...saved };
  // 옛 설정 — 「사도 목소리」 켜고 끄기였다. 끈 사람은 목소리 음량 0 으로
  if (mem.voice === false) { mem.volVoice = 0; delete mem.voice; }
  // 음량 기본값을 낮췄다(전체 20 · 목소리 10) — 그 전에 저장된 설정(80 · 100)도 한 번 새 기본으로.
  // 판 번호는 저장된 쪽(saved)에서 본다 — 합친 쪽(mem)은 기본값의 sv 가 끼어 늘 새 판으로 보인다
  if ((saved.sv || 1) < 2 && (saved.volMaster != null || saved.volVoice != null)) {
    const muted = saved.voice === false || saved.volVoice === 0;
    mem.volMaster = DEF.volMaster; mem.volVoice = muted ? 0 : DEF.volVoice;
  }
  mem.sv = 2;
  return { ...mem };
}

// 목소리 음량(0~1) — 전체 × 목소리
export function voiceVolume(s = getSettings()) {
  const v = (Number(s.volMaster) / 100) * (Number(s.volVoice) / 100);
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0));
}
// 설정이 바뀌면 알려 준다(울리는 중인 목소리의 음량을 바로 바꾸는 따위). 떼는 함수를 돌려준다
export function onSettings(fn) { subs.add(fn); return () => subs.delete(fn); }

export function setSetting(k, v) {
  const s = getSettings();
  s[k] = v;
  mem = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 막힌 브라우저 — 이번 판에만 */ }
  applySettings(s);
  for (const fn of subs) { try { fn(s, k); } catch { /* 듣는 쪽 잘못은 넘긴다 */ } }
}

export function applySettings(s = getSettings()) {
  art.setSpine(s.spine !== false);
  setRenderScale(QUALITY[s.quality] || 1);
  setResolution(s.res || "auto");
  const root = typeof document === "object" && document.documentElement;
  if (!root || !root.classList) return;
  root.classList.toggle("calm", !!s.calm);
  root.classList.toggle("bigtext", !!s.big);
}
