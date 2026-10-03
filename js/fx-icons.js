// 걸린 것 아이콘 — 버프 · 디버프 칩, 정보 창 줄, 떠오르는 꼬리표가 같은 그림을 쓴다.
// 글자(「받피↑25%」)는 작으면 안 읽혀 한눈에 무엇인지 그림으로(2026-10 사용자 「피해 증가 · 치확 증가 아이콘으로」).
// 24칸 SVG 한 벌, 바깥 파일 · 글꼴 없음. 모양으로 종류, 빛깔로 한 번 더 — 좋은지 나쁜지는 칩 테두리(청록 · 빨강)가 말한다.
// 증감(stat)은 오른쪽 아래에 ▲ · ▼ 를 얹는다. 사도 키워드(간식 · 초청객 …)는 그리지 않고 금빛 동전에 첫 글자
import { el } from "./ui-common.js";

const S = (d, w = 2.2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d, o = 1) => `<path d="${d}" fill="currentColor"${o < 1 ? ` fill-opacity="${o}"` : ""}/>`;
const SHIELD = "M12 2.8l7.5 3V11c0 4.8-3.2 8.4-7.5 10.2C7.7 19.4 4.5 15.8 4.5 11V5.8z";
const HEART = "M12 20.5S3.5 15.5 3.5 9.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.5 2.3c0 6.2-8.5 11.2-8.5 11.2z";
const DROP = "M12 2.5c3.4 4.8 6.5 8.2 6.5 12a6.5 6.5 0 0 1-13 0c0-3.8 3.1-7.2 6.5-12z";
const SWORD = F("M20.5 3.5l-.8 4.8-9.4 9.4-4-4 9.4-9.4z") + S("M4.2 12.6l7.2 7.2M7.3 16.7l-3.6 3.6", 2.4);

// 그림 · 빛깔 · 이름. 빛깔이 없으면 칩 글자 빛깔을 따른다
const ICONS = {
  atk: { c: "#ff9a6a", ko: "공격력", g: S("M5 4l11 11M19 4L8 15", 2.4) + S("M13.5 18l5-5M5.5 13l5 5M17 17l3 3M7 17l-3 3", 2.2) },
  dealt: { c: "#ffb35c", ko: "주는 피해", g: SWORD },
  taken: { c: "#ff8a9a", ko: "받는 피해", g: F(SHIELD, 0.22) + S(SHIELD, 2) + S("M12.8 5.5l-2.6 4.6 3.4 2.2-2.6 5", 2) },
  def: { c: "#8cc8ff", ko: "방어력", g: F(SHIELD, 0.85) + `<path d="M8.5 11.5l2.5 2.5 4.5-5" fill="none" stroke="#0b1424" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` },
  crit: { c: "#ffd84a", ko: "치명 확률", g: S("M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14", 2) + S("M12 1.8v4.4M12 17.8v4.4M1.8 12h4.4M17.8 12h4.4", 2.2) + F("M12 9.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z") },
  heal: { c: "#7cf0a0", ko: "회복력", g: F(HEART, 0.9) + `<path d="M12 9.5v6M9 12.5h6" stroke="#0b2414" stroke-width="2.2" stroke-linecap="round"/>` },
  취약: { c: "#ff7a8a", ko: "취약", g: F("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 0.2) + S("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 2) + S("M12.5 3.5L10 9l4 2.5-3 4.5 1.5 4.5", 2.2) },
  약화: { c: "#c0a8ff", ko: "약화", g: F("M20.5 3.5l-.6 3.8-3.6 3.6-3.2-3.2 3.6-3.6z") + F("M11.2 9.9l3 3-3.9 3.9-3-3z") + S("M4.2 12.6l7.2 7.2M7.3 16.7l-3.6 3.6", 2.4) },
  감전: { c: "#ffe24a", ko: "감전", g: F("M13.5 1.8L4.5 13.5h6l-1.4 8.7 9.4-12h-6.2z") },
  중독: { c: "#9cf06a", ko: "중독", g: F("M8.5 11a5 5 0 1 0 0 10a5 5 0 1 0 0-10") + F("M16 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7", 0.85) + F("M18 14.5a2.3 2.3 0 1 0 0 4.6a2.3 2.3 0 1 0 0-4.6", 0.7) },
  화상: { c: "#ff8a3c", ko: "화상", g: F("M12 2c.8 3.7 6.5 6.3 6.5 12.2a6.5 6.5 0 0 1-13 0c0-3.2 1.9-5.3 3.2-6.5.1 2.1 1.1 3.3 2.3 3.3-.3-3.8-.6-6.4 1-9z") },
  출혈: { c: "#ff5a5a", ko: "출혈", g: F(DROP) + `<path d="M9 14.5a3 3 0 0 0 2.5 3" fill="none" stroke="#fff8" stroke-width="1.6" stroke-linecap="round"/>` },
  수은: { c: "#cfd8e8", ko: "수은", g: F(DROP, 0.9) + `<path d="M9 14.5a3 3 0 0 0 2.5 3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` },
  기절: { c: "#ffe07a", ko: "기절", g: S("M12 12.6a1.2 1.2 0 1 1 1.2-1.2 3.4 3.4 0 1 1-3.4-3.4 5.6 5.6 0 1 1-5.6 5.6", 2.2) + F("M18.5 2.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z") },
  침묵: { c: "#d8c8ff", ko: "침묵", g: S("M4 5h16v10.5H10l-4.5 4v-4H4z", 2) + S("M3 3l18 18", 2.4) },
  봉인: { c: "#d8c8ff", ko: "봉인", g: F("M5 11h14v10H5z", 0.9) + S("M8 11V8a4 4 0 0 1 8 0v3", 2.2) },
  도발: { c: "#ff9a5a", ko: "도발", g: S("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 2) + S("M12 7.5v6", 3) + F("M12 15.5a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2") },
  힘: { c: "#ffb06a", ko: "힘", g: S("M7 7v10M17 7v10", 3) + S("M3.5 9.5v5M20.5 9.5v5M7 12h10", 2.4) },
  가시: { c: "#a8e07a", ko: "가시", g: F("M12 1.5l1.9 5.4 5.5-2.3-2.3 5.5 5.4 1.9-5.4 1.9 2.3 5.5-5.5-2.3L12 22.5l-1.9-5.4-5.5 2.3 2.3-5.5L1.5 12l5.4-1.9-2.3-5.5 5.5 2.3z") },
  무적: { c: "#fff0a0", ko: "무적", g: F(SHIELD, 0.25) + S(SHIELD, 2) + F("M12 7.2l1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5z") },
  방어: { c: "#9fd4ff", ko: "방어", g: F(SHIELD, 0.85) },
  // 카제나 상태(rules.js STATUS_V · docs/16) — 칩의 숫자는 겹(턴이 아니다)
  사기: { c: "#ffb35c", ko: "사기", g: F("M6 21V4") + S("M6 21V3.5", 2.2) + F("M6.8 4h12l-3 4 3 4h-12z", 0.9) },
  불굴: { c: "#9fd4ff", ko: "불굴", g: F(SHIELD, 0.3) + S(SHIELD, 2) + S("M12 7v9M8.5 10.5L12 7l3.5 3.5", 2.2) },
  결의: { c: "#7fe0c8", ko: "결의", g: S("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 2) + S("M7.5 12.5l3 3 6-7", 2.6) },
  결정화: { c: "#a8e8ff", ko: "결정화", g: F("M12 2l5 6-5 14-5-14z", 0.85) + S("M7 8h10M12 2v20", 1.2) },
  반격: { c: "#ffcf6a", ko: "반격", g: F(SHIELD, 0.25) + S(SHIELD, 2) + S("M9 13l3-3 3 3M12 10v7", 2.2) + S("M16 4.5l4-2", 2) },
  고통: { c: "#ff6a8a", ko: "고통", g: F(HEART, 0.25) + S(HEART, 2) + S("M12 7.5l-1.5 4 3 1.5-1.5 4", 2) },
  손상: { c: "#c8a080", ko: "손상", g: S(SHIELD, 2) + S("M8 7l8 10M15.5 6.5l-2 3", 2.2) },
  표식: { c: "#ff5a5a", ko: "표식", g: S("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 2) + S("M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9", 1.8) + F("M12 10.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8") },
  실드: { c: "#6ff0ff", ko: "실드", g: S("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 2) + F("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", 0.2) + S("M8 8.5a5 5 0 0 1 3.5-2", 2) },
};
// 능력치 상태(열의 · 강건 · 집중 · 온정) — 그 능력치의 그림(칩 숫자가 겹)
ICONS.열의 = { ...ICONS.atk, ko: "열의" };
ICONS.강건 = { ...ICONS.def, ko: "강건" };
ICONS.집중 = { ...ICONS.crit, ko: "집중" };
ICONS.온정 = { ...ICONS.heal, ko: "온정" };
// ▲ · ▼ — 오른쪽 아래, 어두운 테두리를 둘러 그림 위에서도 보이게
const ARROW = {
  up: `<path d="M18.5 14.5l5 7h-10z" fill="#fff" stroke="#0a0812" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/>`,
  down: `<path d="M18.5 22.5l5-7h-10z" fill="#fff" stroke="#0a0812" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/>`,
};

export const hasIcon = (key) => !!ICONS[key];
export const iconKo = (key) => (ICONS[key] || {}).ko || key;
// key: 증감 이름(atk · dealt …) 또는 상태 이름(취약 …). dir: "up" | "down" | null. 그림이 없으면 null
export function fxIcon(key, dir = null) {
  const ic = ICONS[key];
  if (!ic) return null;
  const n = el("i", "fxic");
  n.style.color = ic.c;
  n.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ic.g}${dir ? ARROW[dir] : ""}</svg>`;
  return n;
}
// 사도 키워드 — 금빛 동전에 첫 글자
export function kwToken(id) {
  const n = el("i", "fxic ftok", String(id || "?").charAt(0));
  return n;
}
