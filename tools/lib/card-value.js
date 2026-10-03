// 카드 한 장이 코스트에 비해 얼마나 하는지 — 대충의 값어치를 센다.
// tools/cost-audit.js 와 tools/check-hero.js 가 같이 쓴다.
//
// 단위: 「1코 공격 한 명 120%」 가 대략 1. 기준은 docs/07-스킬구성.md §7 표.
//   피해 한 명 100% = 0.83 · 전체 ×1.6 · 무작위 ×0.9 · X 코스트는 3타로 친다
//   방어·실드 200% = 0.8 · 회복 80% = 0.8 (아군 전원은 ×2)
//   드로우 1 = 0.4 · AP 1 = 0.9 · 게이지 10% = 0.1 · 기절 0.8 · 취약·약화 1턴 0.2 · 증감 10%·1턴 0.2
//   키워드 +1 = 0.3 · 강인도 1칸 0.3 · 카제나 태그(연계 0.6 · 천상 0.45 …)와 조건(파괴 ×0.4 · 연속 ×0.5 · 감응 ×0.85)은 아래 TAG_VAL · COND_VAL
// 코스트 c 의 기준 값어치 = 0.5 + c  (1코 1.5 · 2코 2.5 · 3코 3.5)
// 정밀한 값이 아니다 — 크게 어긋난 카드(공짜나 다름없는 것, 코스트만 비싼 것)를 찾는 체다.

export const STATUS_VAL = { 사기: 0.35, 불굴: 0.3, 취약: 0.25, 약화: 0.25, 고통: 0.13, 손상: 0.15, 표식: 0.8, 결의: 0.2, 결정화: 0.32, 반격: 0.4, 감전: 0.2, 중독: 0.2, 침묵: 0.2,
  // 능력치 상태 — 옛 증감 값(2 × %p × 턴, 회복력은 그 절반)을 convert-mods 의 겹 셈으로 나눈 것(2V/r): 열의 · 집중 0.57 · 강건 0.67 · 온정 0.4
  열의: 0.57, 강건: 0.67, 집중: 0.57, 온정: 0.4 };
const area = (t) => (t === "allEnemies" || t === "allAllies" ? 1.6 : t === "randomEnemy" ? 0.9 : 1);

// 카제나 키워드(docs/16) — 글 맨 앞 낱말 하나로 서는 태그의 값어치. 0 으로 두면 봇 · 신탁 견주기가 이 키워드들을 없는 것으로 본다
//   연계 — 다른 사도의 카드를 내면 비용 없이 저절로(1코 연계면 AP 1 을 거의 늘 아낀다 — 때를 못 고르니 AP 값 0.9 보다 조금 덜)
//   천상 — 비용 2 이상 카드를 내면 저절로(깨우는 카드가 연계보다 드물다)
//   신속 — 적의 즉시 행동 셈을 안 늘린다(「즉시 행동 1장 늦춤」 0.15 와 같은 몫) · 주도 — 반반의 확률로 그 턴 비용 -1
//   증발 — 턴 끝 손에 있으면 사라진다(벌칙)
//   잔불 · 잔광 · 분쇄 · 약점 — 그 카드 피해의 덤(격파된 적 · 방어가 있는 적을 칠 확률을 곱한 몫) + 잔광 · 약점은 강인도 1칸
export const TAG_VAL = { 연계: 0.6, 천상: 0.45, 신속: 0.15, 주도: 0.2, 증발: -0.15 };
// 피해 태그 — 그 카드 피해 값어치에 곱하는 덤(잔불 +30% × 격파된 적 ~1/3 · 잔광 +50% × ~1/3 · 분쇄 +20% × 방어 있는 적 ~1/3 · 약점 +10%)
export const HIT_TAG_VAL = { 잔불: 0.1, 잔광: 0.15, 분쇄: 0.06, 약점: 0.1 };
// 강인도 1칸 — 보통 적 3칸을 깨면 AP +1(0.9) · 즉시 행동 1장 늦춤(0.15)이니 한 칸 0.3 언저리
export const TOUGH_VAL = 0.3;
// 조건 뒤의 효과 — 그 조건이 설 확률만큼만 친다. 파괴(그 적이 격파돼 있다) · 연속(바로 앞 카드가 같은 성격) · 감응(뽑힐 때 — 거의 늘 돈다)
export const COND_VAL = { ifBroken: 0.4, ifChain: 0.5, draw: 0.85 };

export function valueOf(fx) {
  let v = 0, per = 1, cond = 1, dmgV = 0, dmgArea = 1;
  const tags = [];
  for (const f of fx || []) {
    const n = f.hits || 1;
    const v0 = v;
    switch (f.k) {
      case "tag": tags.push(f.id); break;
      case "ifBroken": case "ifChain": cond = COND_VAL[f.k]; break;
      case "when": if (f.on === "draw") cond = COND_VAL.draw; break;
      case "tough": v += TOUGH_VAL * (f.v || 1) * area(f.target); break;
      // 「「X」 1개당 …」 은 바로 뒤 피해 한 줄을 쌓인 수만큼 친다 — 보통 쌓여 있는 셋으로 센다
      case "perStack": per = 3; break;
      case "dmg": { const d = f.ratio * n * 0.83 * area(f.target) * (f.xHits ? 3 : 1) * per; if (!dmgV) dmgArea = area(f.target); v += d; dmgV += d * cond; per = 1; break; }
      case "block": case "shield": v += (f.ratio / 2) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "heal": v += (f.ratio / 0.8) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "draw": v += 0.4 * (f.v || 1); break;
      case "ap": v += 0.9 * f.v; break;
      case "gauge": v += f.v / 100; break;
      // 상태(겹 규칙 — 숫자는 횟수, rules.js STATUS_V) — 한 겹의 값어치. 옛 증감(「+N% T턴」 = 2·N%·T)을 바꾼 비율(tools/convert-mods.js)과 맞춘다:
      //   사기 0.35 · 불굴 0.3(옛 「+10% 1턴」 0.2 의 1.5배 언저리). 취약 · 약화 한 겹은 옛 「1턴」(0.2) 언저리 0.25 — 옛 「취약 N턴」 이 「취약 1」 로 바뀐 기본 카드가 신탁보다 비싸지지 않게.
      //   고통 · 손상 · 표식 · 결의 · 결정화 · 반격은 하는 일에서
      case "status": v += f.id === "기절" ? 0.8 : f.id === "도발" ? 0.3 : (STATUS_VAL[f.id] ?? 0.2) * (f.turns || 1) * area(f.target); break;
      case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod":
        v += Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target); break;
      // 회복력 증감은 회복에만 붙는다 — 피해 · 방어까지 오르는 증감의 절반으로 친다
      case "healMod": v += Math.abs(f.v) * Math.min(f.turns || 1, 4) * area(f.target); break;
      case "stack": if (f.v > 0) v += 0.3 * f.v; break;
      case "strip": v += 0.3; break;
      case "invuln": v += f.target === "allAllies" ? 2.5 : 1.2; break;
      case "cleanse": v += 0.2; break;
      case "rushDown": v += 0.15 * f.v * area(f.target); break;
      case "nextCheaper": v += 0.8 * f.v; break;            // 다음 카드 코스트 -N — AP 와 거의 같다(다음 장에만)
      case "immune": v += f.target === "allAllies" ? 1.0 : 0.5; break;
      case "trigger": v += 0.3 * (f.v || 1); break;
    }
    if (cond !== 1) v = v0 + (v - v0) * cond;   // 조건 뒤의 몫은 확률만큼
  }
  for (const t of tags) {
    v += TAG_VAL[t] || 0;
    if (HIT_TAG_VAL[t] && dmgV > 0) v += dmgV * HIT_TAG_VAL[t];
    if ((t === "잔광" || t === "약점") && dmgV > 0) v += TOUGH_VAL * dmgArea;
  }
  return v;
}

export const baseValue = (cost) => 0.5 + (cost === "X" ? 3 : cost);

// 신탁을 골랐을 때의 코스트 — 글 앞의 「코스트 N.」 이 있으면 그것, 없으면 기본 카드 코스트
export function flashCost(baseCost, fx) {
  const set = (fx || []).find((f) => f.k === "costSet");
  if (set) return set.v;
  const d = (fx || []).find((f) => f.k === "costDelta");
  if (d && typeof baseCost === "number") return Math.max(0, baseCost + d.v);
  return baseCost;
}

// ── 신탁 견주기 ───────────────────────────────────────────────────────
// 신탁은 고르면 그 카드가 **바뀐다** — 기본보다 나아야 고를 맛이 난다(2026-10 사용자 「신탁 받는 게 손해인 게 너무 많다」).
// valueOf 는 효과만 센다. 여기서는 카드 한 장을 통째로 센다 — 자기에게 거는 벌칙 · HP 소모 · 버리기 · 태그까지.
const PEN_MODS = ["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"];
const ALLY_T = ["self", "oneAlly", "allAllies", "lowAlly"];
// 제 편에게 거는 벌칙 — 「이번 턴 자신 받는 피해 +20%」 · 「자신 주는 피해 -10%」. valueOf 는 크기만 보고 더한다
const penalty = (f) => (PEN_MODS.includes(f.k) && ALLY_T.includes(f.target) && (f.k === "takenMod" ? f.v > 0 : f.v < 0))
  || (f.k === "status" && ALLY_T.includes(f.target) && ["취약", "약화", "고통", "손상"].includes(f.id));
export const tagsOf = (fx) => (fx || []).filter((f) => f.k === "tag").map((f) => f.id);

// 카드 한 장의 값 — tags 는 그 카드에 실제로 붙는 태그(신탁을 고른 카드는 신탁 글의 태그만 · js/combat.js hasTag)
//   벌칙 증감 · HP 소모 · 손패 버리기는 뺀다. 보존 +0.1 · 개전 +0.15. 소멸은 한 전투에 한 번 — ×0.7
export function cardValue(fx, tags = tagsOf(fx)) {
  let v = valueOf(fx);
  for (const f of fx || []) {
    if (penalty(f) && f.k === "status") v -= 2 * (STATUS_VAL[f.id] ?? 0.2) * (f.turns || 1) * area(f.target);
    else if (penalty(f)) v -= 2 * Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target) * (f.k === "healMod" ? 0.5 : 1);
    if (f.k === "payHp") v -= 0.035 * f.v;
    if (f.k === "payHpPct") v -= 3 * f.v;
    if (f.k === "discard") v -= f.v === "all" ? 0.3 : 0.1 * f.v;
    // 「이번 전투 동안」 증감 — valueOf 는 4턴까지만 센다. 전투 내내 가니 2턴을 더 쳐 준다(6턴)
    if (PEN_MODS.includes(f.k) && (f.turns || 1) >= 999 && !penalty(f)) v += Math.abs(f.v) * 2 * 2 * area(f.target) * (f.k === "healMod" ? 0.5 : 1);
    // 키워드를 적 전체 · 아군 전원에게 — valueOf 는 넓이를 안 본다
    if (f.k === "stack" && f.v > 0 && (f.target === "allEnemies" || f.target === "allAllies")) v += 0.3 * f.v * 0.6;
  }
  if (tags.includes("보존")) v += 0.1;
  if (tags.includes("개전")) v += 0.15;
  if (tags.includes("소멸")) v *= 0.7;
  return v;
}

// 기본 카드와 신탁 하나를 견준다.
//   base {fx, cost, tags} — tags 는 머리 태그 + 글의 태그. oracle fx 는 신탁 글을 읽은 그대로(코스트 말 포함)
//   r     코스트 기준 값어치 비(신탁 ÷ 기본). 1 이하면 손해, 1.1 밑이면 하나 마나
//   total 값어치 비(코스트 무시) · raw 소멸을 빼고 센 값어치 비 — 소멸 신탁이 「2배 한 방」 인지 본다
export function oracleVs(base, ofx) {
  const co = flashCost(base.cost, ofx);
  const body = (ofx || []).filter((x) => x.k !== "costSet" && x.k !== "costDelta");
  const otags = tagsOf(body), btags = base.tags || [];
  const vb = Math.max(0.05, cardValue(base.fx, btags)), vo = cardValue(body, otags);
  const rawB = Math.max(0.05, cardValue(base.fx, btags.filter((t) => t !== "소멸"))), rawO = cardValue(body, otags.filter((t) => t !== "소멸"));
  const r = (vo / baseValue(co)) / (vb / baseValue(base.cost));
  return { co, vb, vo, r, total: vo / vb, raw: rawO / rawB, gone: otags.includes("소멸"), baseGone: btags.includes("소멸"),
    up: typeof co === "number" && typeof base.cost === "number" && co > base.cost,
    down: typeof co === "number" && typeof base.cost === "number" && co < base.cost };
}

// 신탁 규칙(docs/12-신탁.md §값) — 어기는 까닭을 낱낱이 돌려준다. 카드 하나의 다섯을 한꺼번에 본다
//   ① 코스트 기준 값어치가 기본의 1.15배 이상(손해 · 하나 마나 금지)
//   ② 코스트를 올렸으면 값어치 합이 1.6배 이상
//   ③ 기본에 없는 소멸은 2배 넘는 한 방에만 · 코스트를 내린 신탁엔 안 붙인다 · 카드당 하나까지
export const ORACLE_MIN = 1.15, ORACLE_UP = 1.6, ORACLE_GONE = 2;
export function oracleRules(base, oracles /* [{fx, at}] */) {
  const errs = [];
  let gones = 0;
  for (const o of oracles) {
    const v = oracleVs(base, o.fx);
    if (v.r < ORACLE_MIN) errs.push(`${o.at} — 기본보다 낫지 않다(코스트 기준 ${v.r.toFixed(2)}배 · ${ORACLE_MIN}배 이상)`);
    if (v.up && v.total < ORACLE_UP) errs.push(`${o.at} — 코스트를 올렸으면 값어치가 기본의 ${ORACLE_UP}배 이상(지금 ${v.total.toFixed(2)}배)`);
    if (v.gone && !v.baseGone) {
      gones++;
      if (v.down) errs.push(`${o.at} — 코스트를 내린 신탁에 소멸을 붙이지 않는다`);
      else if (v.raw < ORACLE_GONE) errs.push(`${o.at} — 기본에 없는 소멸은 ${ORACLE_GONE}배 넘는 한 방에만(지금 ${v.raw.toFixed(2)}배)`);
    }
  }
  if (gones > 1) errs.push(`소멸 신탁이 ${gones}개 — 카드당 하나까지`);
  return errs;
}
