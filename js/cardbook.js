// 카드 장부 — 엔진이 보는 카드 한 곳.
//
// 지금 카드가 두 갈래다.
//   built.js   기획서에서 읽은 135명 1,080장 (효과가 산문에서 읽힌 것)
//   cards.js   그 전에 내가 손으로 만든 여덟 명 것 (교주 공용·임시 카드가 여기 있다)
//
// 엔진이 둘을 따로 알 필요는 없다. 여기서 한 꼴로 맞춰 준다 —
// 엔진이 카드에서 읽는 건 열 가지뿐이다: cost·type·target·hero·fx·need·pierce·snack·temp·ego.

import { CARDS as OLD } from "./data/cards.js";
import BUILT from "./data/built.js";

// 기획서의 타입 → 엔진이 쓰는 대상. 산문에서 읽은 fx 가 제 대상을 들고 있으니
// 여기 target 은 "화면이 대상을 물어봐야 하는가"만 정한다.
function targetOf(card) {
  const fx = card.fx || [];
  if (fx.some((f) => f.target === "oneEnemy")) return "적";
  if (fx.some((f) => f.target === "oneAlly")) return "아군";
  return "없음";
}

const book = {};

// ① 기획서 카드 — built.js
for (const [id, c] of Object.entries(BUILT.cards)) {
  book[id] = {
    id, hero: c.hero,
    name: c.ko,
    cost: c.cost === "X" ? 0 : c.cost,     // X 는 남은 AP 를 전부 쓴다 — 엔진이 따로 본다
    xcost: c.cost === "X",
    type: c.type,
    text: c.text,
    fx: c.fx || [],
    built: true,                            // run-fx.js 로 실행한다는 표시
    target: targetOf(c),
    unique: !!c.unique,
    signature: !!c.signature,
    flash: c.flash || null,
    tags: c.tags || [],
    unparsed: c.unparsed || null,
  };
}

// ② 옛 카드 — 교주 공용과 임시 카드(갓 구운 빵)가 여기 있다.
//    기획서에 없는 것만 가져온다. 이름이 겹치면 기획서가 이긴다.
for (const [id, c] of Object.entries(OLD)) {
  if (book[id]) continue;
  book[id] = { ...c, built: false };
}

export const CARDS = book;

// 그 사도의 시작 덱 — 기획서에 있으면 기획서, 없으면 옛 것
export function starterOf(heroKey) {
  return BUILT.starter[heroKey] || null;
}

export const HERO_DATA = BUILT.heroes;

// 그 사도의 카드 여덟 장 — 시작 4 + 고유 4. 크로노아크처럼 고르기 전에 보여 주려고 쓴다.
export function kitOf(heroKey) {
  const start = (BUILT.starter[heroKey] || []).map((id) => book[id]).filter(Boolean);
  const unique = Object.values(book).filter((c) => c.hero === heroKey && c.unique);
  return { start, unique };
}
export const hasBuilt = (heroKey) => !!BUILT.heroes[heroKey];

// 번뜩임을 얹은 카드. 기획서: 고유 카드마다 번뜩임 다섯이 붙고, 하나를 골라 그 카드가 바뀐다.
// 글과 효과를 통째로 갈아 끼운다 — ①강화는 수치가 오르고 ②경량은 코스트가 내린다.
export function flashed(card, n) {
  const f = (card.flash || [])[n - 1];
  if (!f) return card;
  let cost = card.cost;
  // 코스트를 바꾸는 번뜩임은 fx 에 적혀 있다. 여기서 값으로 반영한다.
  for (const x of f.fx || []) {
    if (x.k === "costSet") cost = x.v;
    if (x.k === "costDelta") cost = Math.max(0, cost + x.v);
  }
  return {
    ...card, cost,
    text: f.text,
    fx: (f.fx || []).filter((x) => x.k !== "costSet" && x.k !== "costDelta"),
    flashOn: n, flashKo: f.ko, flashKind: f.kind, baseText: card.text,
  };
}
