// v6 사도 스탯 식(2026-10 사용자 — 원작 트릭컬 비율 + 카제나 눈금). docs/18-v6작성안내.md §2 가 이 표를 그대로 옮긴다.
//
//   스탯 = 기본(역할 · 열) × 성급(태생 1성 0.8 · 2성 0.9 · 3성 1.0) × 엘다인(1.1) × 원작 성향 × 손질
//     기본    아래 BASE — 카제나 눈금(파티 HP 2000 언저리 · 1코 공격 = 공격력 100% ≈ 125 · 1코 실드 = 방어력 200% ≈ 120).
//             공격 : 방어는 딜러 5 : 1 · 서포터 5 : 4 · 탱커 1 : 1 — 치유 · 실드 · 방어 기반 피해가 방어력에서 나오니 서포터 · 탱커는 방어가 높다
//     원작 성향  v5 스탯(tools/lib/stat-origin.js — 원작 위치 · 역할 기본값 × 성급 × 사도별 개성 ±15%)에서 개성 몫만 되읽는다.
//             HP · 공격은 그대로, 방어는 옛 값이 2~7 의 작은 정수라 반만 옮긴다. 셋 다 0.85~1.15 로 자른다
//     손질    원작 성향이 뚜렷한 사도만(나무위키 「딜탱」 · 「준탱커」 · 「공격형 버퍼」 · 「서브탱」 · 「맷집」) — HAND 표
//   반올림: HP 는 10 단위, 공격 · 방어는 1 단위. 치명은 v5 그대로(딜러 10% · 그 밖 5% — 원작 치명 사도만 다르다)
import { ORIGIN } from "./stat-origin.js";

// 기본(태생 3성 · 엘다인 아님) — 키는 「역할|열」(front · mid · back)
export const BASE = {
  "탱커|front": { hp: 900, atk: 75, def: 70 },
  "탱커|mid": { hp: 800, atk: 75, def: 65 },
  "딜러|front": { hp: 750, atk: 125, def: 35 },
  "딜러|mid": { hp: 650, atk: 125, def: 28 },
  "딜러|back": { hp: 550, atk: 135, def: 25 },
  "서포터|front": { hp: 700, atk: 80, def: 65 },
  "서포터|mid": { hp: 600, atk: 75, def: 60 },
  "서포터|back": { hp: 550, atk: 75, def: 58 },
};
// v5 기본값(옛 기획서 「기본 스탯 (태생 3성)」) — 원작 성향을 되읽는 잣대
export const OLD_BASE = {
  "탱커|front": { hp: 90, atk: 8, def: 6 }, "탱커|mid": { hp: 80, atk: 8, def: 5 },
  "딜러|front": { hp: 75, atk: 12, def: 3 }, "딜러|mid": { hp: 65, atk: 12, def: 2 }, "딜러|back": { hp: 55, atk: 13, def: 2 },
  "서포터|front": { hp: 70, atk: 8, def: 4 }, "서포터|mid": { hp: 60, atk: 7, def: 3 }, "서포터|back": { hp: 55, atk: 7, def: 3 },
};
export const STAR = { 1: 0.8, 2: 0.9, 3: 1.0 };
export const ELDAIN = 1.1;
export const TILT_MIN = 0.85, TILT_MAX = 1.15;
// 손질 — 원작 성향이 뚜렷한 사도(나무위키 요약 .omc/research/namu/<사도>.brief.md · 기획서 「원작」 줄). 곱하는 값
export const HAND = {
  // 딜탱 탱커 — 「모든 공격이 광역」 · 「평타까지 화상」 처럼 때리는 탱커: 공격 +20%, 방어 -5%
  이드: { atk: 1.2, def: 0.95, why: "딜탱" }, 리코타: { atk: 1.2, def: 0.95, why: "딜탱" }, 레테: { atk: 1.2, def: 0.95, why: "딜탱 · 격파 손" },
  클로에: { atk: 1.2, def: 0.95, why: "딜탱" }, 루드: { atk: 1.2, def: 0.95, why: "딜탱" }, 스노키: { atk: 1.2, def: 0.95, why: "딜탱" },
  아사나: { atk: 1.2, def: 0.95, why: "딜탱" },
  // 딜탱 딜러(전열) — 앞에서 맞으며 때린다: HP +10%, 방어 +15%, 공격 -5%
  델리아: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" }, 라이카: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" }, 리츠: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" },
  이프리트: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" }, 베니: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" }, 림: { hp: 1.1, def: 1.15, atk: 0.95, why: "딜탱" },
  // 그 밖
  캬롯: { atk: 1.2, def: 0.9, why: "공격형 버퍼" },
  가비아: { hp: 1.1, def: 1.1, why: "준탱커 서포터" },
  모모: { hp: 1.15, def: 1.2, why: "서브탱 노릇을 하는 딜러" },
  코미: { hp: 1.1, why: "맷집" },
};

const clamp = (x) => Math.max(TILT_MIN, Math.min(TILT_MAX, x));
// 원작 성향 — v5 스탯 ÷ (v5 기본값 × 성급 × 엘다인)
export function tiltOf(h) {
  const o = ORIGIN[h.ko];
  const ob = OLD_BASE[`${h.role}|${h.row}`];
  if (!o || !ob) return { hp: 1, atk: 1, def: 1 };
  const k = (STAR[h.star] || 1) * (h.eldain ? ELDAIN : 1);
  const raw = { hp: o[0] / (ob.hp * k), atk: o[1] / (ob.atk * k), def: o[2] / (ob.def * k) };
  return { hp: clamp(raw.hp), atk: clamp(raw.atk), def: clamp(1 + (raw.def - 1) * 0.5) };
}
// h: { ko, role, row, star, eldain } — 돌려주는 것 { hp, atk, def, crit, tilt, hand }
export function statOf(h) {
  const b = BASE[`${h.role}|${h.row}`];
  if (!b) throw new Error(`기본값이 없다: ${h.ko} ${h.role}|${h.row}`);
  const k = (STAR[h.star] || 1) * (h.eldain ? ELDAIN : 1);
  const t = tiltOf(h), m = HAND[h.ko] || {};
  const o = ORIGIN[h.ko];
  return {
    hp: Math.round((b.hp * k * t.hp * (m.hp || 1)) / 10) * 10,
    atk: Math.round(b.atk * k * t.atk * (m.atk || 1)),
    def: Math.round(b.def * k * t.def * (m.def || 1)),
    crit: o ? o[3] : h.role === "딜러" ? 10 : 5,
    tilt: t, hand: HAND[h.ko] || null,
  };
}
