// 카드 한 장이 코스트에 비해 얼마나 하는지 — 대충의 값어치를 센다.
// tools/cost-audit.js 와 tools/check-hero.js 가 같이 쓴다.
//
// 단위: 「1코 공격 한 명 120%」 가 대략 1. 기준은 docs/07-스킬구성.md §7 표.
//   피해 한 명 100% = 0.83 · 전체 ×1.6 · 무작위 ×0.9 · X 코스트는 3타로 친다
//   방어·실드 200% = 0.8 · 치유 240% = 0.8 (방어력 기준 — v6, 옛 회복력 80% 몫. 파티에 한 번 — 대상 말과 상관없이)
//   드로우 1 = 0.4 · AP 1 = 0.9 · 게이지 10% = 0.1 · 기절 0.8 · 취약·약화 1턴 0.2 · 증감 10%·1턴 0.2
//   키워드 +1 = 0.3 · 강인도 1칸 0.3 · 카제나 태그(연계 0.6 · 천상 0.45 …)와 조건(파괴 ×0.4 · 연속 ×0.5 · 감응 ×0.85)은 아래 TAG_VAL · COND_VAL
// 코스트 c 의 기준 값어치 = 0.5 + c  (1코 1.5 · 2코 2.5 · 3코 3.5)
// 정밀한 값이 아니다 — 크게 어긋난 카드(공짜나 다름없는 것, 코스트만 비싼 것)를 찾는 체다.

// 상태 한 겹의 값어치.
//   횟수(rules.js CHARGE_ST — 한 번 돌면 1 준다): 취약 · 약화 0.25 · 손상 0.15 · 표식 0.8 · 반격 0.4 — 그대로
//   세기(rules.js INTENSITY_ST — 줄지 않는다, 전투 내내. 2026-10 카제나 그대로): 한 겹이 그 전투의 남은 몫 전부에 붙는다.
//     사기 1(자신) = 남은 카드 피해 +20%. 걸린 뒤 그 사도가 내는 피해 카드 ≈ 3장(값 ≈ 1 씩) → 3 × 0.2 ≈ 0.6
//     열의 0.65(공격력 — 피해에 회복까지) · 집중 0.35(치명 +20%p × 치명 덤 50% = 피해 +10% 몫 → 사기의 절반 남짓)
//     불굴 0.5(받는 피해 -20% — 맞는 사도에게만 · 막히는 몫 빼고) · 강건 0.45(방어 · 실드 · 치유 +20% — v6 치유도 방어력)
//     결의 0.5(얻는 방어 · 실드 +20 — 턴에 한두 번 × 남은 3턴) · 결정화 0.32(전부터 세기였다 — 그대로)
//   v6 새 상태(docs/18): 잔불 0.12(격파 · 처치 때 +30% 한 번 — 옛 태그 몫) · 잔광 0.4(강인도 1칸 + 격파된 적 +50%) · 피해 감소 0.15 · 면역 0.3 ·
//     실드 유지 0.25 · 저장 0.3 · 협공 0.6(덤 공격 100%) · 균열 0.2 · 고동 0.5(전투 내내 모든 적) · 그을림 0.25 · 충격 0.35 · 충격파 0.6
//   아군 전원 · 적 전체는 area(×1.6)
export const STATUS_VAL = { 사기: 0.6, 불굴: 0.5, 취약: 0.25, 약화: 0.25, 고통: 0.13, 손상: 0.15, 표식: 0.8, 결의: 0.5, 결정화: 0.32, 반격: 0.4, 감전: 0.2, 중독: 0.2, 침묵: 0.2,
  잔불: 0.12, 잔광: 0.4, "피해 감소": 0.15, 면역: 0.3, "실드 유지": 0.25, 저장: 0.3, 협공: 0.6, 균열: 0.2, 고동: 0.5, 그을림: 0.25, 충격: 0.35, 충격파: 0.6 };
const area = (t) => (t === "allEnemies" || t === "allAllies" || t === "party" ? 1.6 : t === "randomEnemy" ? 0.9 : 1);
// 파티는 한 몸(docs/16 §8, 2026-10). 상태는 두 층 —
//   사도 층(사기 — rules.js HERO_ST): 가리킨 사도마다. 자신 · 한 명 ×1, 아군 전원 · 파티 ×1.6(옛 값 그대로)
//   파티 층(불굴 · 결의 · 결정화 · 반격 · 취약 · 약화 · 고통 · 손상 …): 어느 아군 말이든 파티 전체에 — 옛 「아군 전원」 몫 ×1.6
// 방어 · 실드 · 회복은 파티에 한 번 — 대상 말과 상관없이 ×1(옛 「아군 전원」 ×2 는 글의 배율을 두 배로 옮겼다 — tools/convert-party.js)
// 무적은 파티 전체 — 2.0(옛 한 명 1.2 · 전원 2.5 사이)
const HERO_ST = new Set(["사기"]);   // 사도 층은 사기 하나(v6 — 열의 · 강건 · 집중은 없앴다)
const ALLY_SIDE = new Set(["self", "oneAlly", "allAllies", "lowAlly", "party"]);
const stArea = (f) => (ALLY_SIDE.has(f.target) && !HERO_ST.has(f.id) ? 1.6 : area(f.target));

// 카제나 키워드(docs/16) — 글 맨 앞 낱말 하나로 서는 태그의 값어치. 0 으로 두면 봇 · 신탁 견주기가 이 키워드들을 없는 것으로 본다
//   연계 — 다른 사도의 카드를 내면 비용 없이 저절로(1코 연계면 AP 1 을 거의 늘 아낀다 — 때를 못 고르니 AP 값 0.9 보다 조금 덜)
//   천상 — 비용 2 이상 카드를 내면 저절로(깨우는 카드가 연계보다 드물다)
//   신속 — 적의 즉시 행동 셈을 안 늘린다(「즉시 행동 1장 늦춤」 0.15 와 같은 몫) · 주도 — 반반의 확률로 그 턴 비용 -1
//   증발 — 턴 끝 손에 있으면 사라진다(벌칙)
//   분쇄 · 약점 — 그 카드 피해의 덤(방어가 있는 적을 칠 확률을 곱한 몫) + 약점은 강인도 1칸. 잔불 · 잔광은 v6 부터 상태(STATUS_VAL)
//   v6 새 태그(docs/18): 연결 -0.1(다른 연결 카드를 버린다) · 금기 0 · 봉인 -0.5(처음 한 번은 빈 카드) · 개막 0.2(전투 시작에 저절로) ·
//     연쇄 — 효과 한 번 더(valueOf 가 효과 값에 곱한다) · 회수 · 소멸 N — cardValue 가 본다
export const TAG_VAL = { 연계: 0.6, 천상: 0.45, 신속: 0.15, 주도: 0.2, 증발: -0.15, 연결: -0.1, 금기: 0, 봉인: -0.5, 개막: 0.2 };
// 피해 태그 — 그 카드 피해 값어치에 곱하는 덤(분쇄 +20% × 방어 있는 적 ~1/3 · 약점 +10%)
export const HIT_TAG_VAL = { 분쇄: 0.06, 약점: 0.1 };
// 강인도 1칸 — 보통 적 3칸을 깨면 AP +1(0.9) · 즉시 행동 1장 늦춤(0.15)이니 한 칸 0.3 언저리
export const TOUGH_VAL = 0.3;
// 조건 뒤의 효과 — 그 조건이 설 확률만큼만 친다. 파괴(대상이 처치됐다) · 연속(바로 앞 카드가 같은 성격) · 조율(비용 = 남은 AP)
//   영감(능력으로 뽑힐 때 — v6 카제나, 옛 감응은 늘 돌았다) · 안식(효과로 버려질 때)
export const COND_VAL = { ifBroken: 0.4, ifChain: 0.5, ifTune: 0.4, draw: 0.85, discard: 0.4 };

// 「전투 내내 공격력 +N%」 를 사기 눈금으로 세는가 — 옛 「자신 · 아군 1명 사기 N」 을 옮긴 개인 버프(2026-10 사용자 「개인 공격력 증가로」).
//   강화 카드(power · 「강화 카드.」 신탁)의 전투 내내는 옛 눈금 그대로 — 쓰면 이 전투에서 사라지는 한 장의 강화 몫이다(글로는 둘을 가를 수 없다)
const moraleMod = (f, fx, power) => f.k === "atkMod" && f.run && f.v > 0
  && !(power || (fx || []).some((g) => g.k === "tag" && g.id === "강화"));
// power — 강화 카드(rules.js isPower)의 글이다. 강화 카드의 「전투 내내」 증감은 옛 눈금 그대로 센다(쓰면 이 전투에서 사라지는 한 장의 몫)
export function valueOf(fx, { power = false } = {}) {
  let v = 0, per = 1, cond = 1, dmgV = 0, dmgArea = 1;
  const tags = [], marks = [];
  for (const f of fx || []) {
    const n = f.hits || 1;
    const v0 = v;
    switch (f.k) {
      case "tag": tags.push(f.id); break;
      case "ifBroken": case "ifChain": case "ifTune": cond = COND_VAL[f.k]; break;
      case "when": if (COND_VAL[f.on]) cond = COND_VAL[f.on]; break;
      case "tough": v += TOUGH_VAL * (f.v || 1) * area(f.target); break;
      // 「「X」 1개당 …」 은 바로 뒤 피해 한 줄을 쌓인 수만큼 친다 — 보통 쌓여 있는 셋으로 센다
      case "perStack": per = 3; break;
      // 방어 기반 피해는 바탕(방어력 210% + 공격력 30%)이 공격력과 비슷한 눈금이라 같은 값으로 친다 · 고정 피해는 덤이 없어 ×0.9
      case "dmg": { const d = f.ratio * n * 0.83 * area(f.target) * (f.xHits ? 3 : 1) * per * (f.fixed ? 0.9 : 1); if (!dmgV) dmgArea = area(f.target); v += d; dmgV += d * cond; per = 1; break; }
      // 「「X」 1개당 …」 은 실드 · 회복에도 붙는다(run-fx perCount) — 피해와 같이 셋으로 센다
      case "block": case "shield": v += (f.ratio / 2) * 0.8 * per; per = 1; break;
      // 치유 — 방어력 240% = 0.8(v6 — 옛 회복력 80% 를 ×3 으로 옮겼다)
      case "heal": v += (f.ratio / 2.4) * 0.8 * per; per = 1; break;
      case "draw": v += 0.4 * (f.v || 1); break;
      case "ap": v += 0.9 * f.v; break;
      case "gauge": v += f.v / 100; break;
      // 상태 — 한 겹의 값어치(STATUS_VAL — 횟수는 한 번 몫, 세기는 전투 내내 몫) × 겹 × 넓이
      // 잔불 · 잔광을 피해 카드에 붙이면 옛 태그처럼 그 카드 피해의 덤으로 센다(아래 — 피해가 없으면 STATUS_VAL)
      case "status":
        if ((f.id === "잔불" || f.id === "잔광") && fx.some((x) => x.k === "dmg")) { marks.push(f); break; }
        // 기절은 적 하나의 한 수를 지운다 — 적 전체면 넓이(×1.6)만큼(장비 작성자 바람, 2026-10 — 전에는 광역도 한 명 값). 무작위는 한 명과 같다
        v += f.id === "기절" ? 0.8 * (f.target === "allEnemies" ? 1.6 : 1) : f.id === "도발" ? 0.3 : (STATUS_VAL[f.id] ?? 0.2) * (f.turns || 1) * stArea(f); break;
      // 「전투 내내 … 공격력 +N%」 — 옛 「자신 · 아군 1명 사기」 를 옮긴 것(사기 1 = +15% — 파티 사기와 곱해져서 낮췄다, 2026-10 사용자). 옛 사기 1겹과 같은 값(+15% = 0.6)
      //   강화 카드(power)의 것은 아래 옛 눈금 그대로
      case "atkMod":
        if (moraleMod(f, fx, power)) { v += (Math.abs(f.v) / 0.15) * STATUS_VAL.사기 * area(f.target); break; }
        v += Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target); break;
      case "dealtMod": case "takenMod": case "defMod": case "critMod":
        v += Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target); break;
      // 회복력 증감은 회복에만 붙는다 — 피해 · 방어까지 오르는 증감의 절반으로 친다

      case "stack": if (f.v > 0) v += 0.3 * f.v; break;
      case "strip": v += 0.3; break;
      case "invuln": v += 2.0; break;
      case "cleanse": v += 0.2; break;
      case "rushDown": v += 0.15 * f.v * area(f.target); break;
      case "nextCheaper": v += 0.8 * f.v; break;            // 다음 카드 코스트 -N — AP 와 거의 같다(다음 장에만)
      case "immune": v += 0.8; break;
      case "trigger": v += 0.3 * (f.v || 1); break;
    }
    if (cond !== 1) v = v0 + (v - v0) * cond;   // 조건 뒤의 몫은 확률만큼
  }
  for (const t of tags) {
    v += TAG_VAL[t] || 0;
    if (HIT_TAG_VAL[t] && dmgV > 0) v += dmgV * HIT_TAG_VAL[t];
    if (t === "약점" && dmgV > 0) v += TOUGH_VAL * dmgArea;
  }
  // 피해 카드의 잔불 · 잔광(옛 태그 몫) — 잔불 겹마다 피해의 10% · 잔광 피해의 15% + 강인도 1칸
  for (const f of marks) v += f.id === "잔불" ? dmgV * 0.1 * Math.min(f.turns || 1, 5) : dmgV * 0.15 + TOUGH_VAL * dmgArea;
  // 연쇄 — 다음 턴 시작에 같은 효과가 한 번 더(조건 없는 몫의 0.8 — 그때 적이 남아 있어야 한다)
  if (tags.includes("연쇄")) v *= 1.8;
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
const ALLY_T = ["self", "oneAlly", "allAllies", "lowAlly", "party"];
// 제 편에게 거는 벌칙 — 「이번 턴 자신 받는 피해 +20%」 · 「자신 주는 피해 -10%」. valueOf 는 크기만 보고 더한다
const penalty = (f) => (PEN_MODS.includes(f.k) && ALLY_T.includes(f.target) && (f.k === "takenMod" ? f.v > 0 : f.v < 0))
  || (f.k === "status" && ALLY_T.includes(f.target) && ["취약", "약화", "고통", "손상"].includes(f.id));
export const tagsOf = (fx) => (fx || []).filter((f) => f.k === "tag").map((f) => f.id);

// 카드 한 장의 값 — tags 는 그 카드에 실제로 붙는 태그(신탁을 고른 카드는 신탁 글의 태그만 · js/combat.js hasTag)
//   벌칙 증감 · HP 소모 · 손패 버리기는 뺀다. 보존 +0.1 · 개전 +0.15. 소멸은 한 전투에 한 번 — ×0.7
// selfKw — 자기 주머니 키워드 이름들. 「적 전체에 … 「자기 키워드」 +N」 은 문장 앞의 「적 전체」 를 물고 와도 그 사도 주머니에 한 번만 쌓인다(run-fx stack)
export function cardValue(fx, tags = tagsOf(fx), { selfKw = [], power = false } = {}) {
  power = power || tags.includes("강화");
  let v = valueOf(fx, { power });
  for (const f of fx || []) {
    if (penalty(f) && f.k === "status") v -= 2 * (STATUS_VAL[f.id] ?? 0.2) * (f.turns || 1) * stArea(f);
    else if (penalty(f)) v -= 2 * Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target) * (f.k === "healMod" ? 0.5 : 1);
    if (f.k === "payHp") v -= 0.0035 * f.v;           // HP 10 = 0.035(v6 눈금 ×10)
    if (f.k === "payHpPct") v -= 3 * f.v;
    if (f.k === "discard") v -= f.v === "all" ? 0.3 : 0.1 * f.v;
    // 「이번 전투 동안」 증감 — valueOf 는 4턴까지만 센다. 전투 내내 가니 2턴을 더 쳐 준다(6턴)
    if (PEN_MODS.includes(f.k) && (f.turns || 1) >= 999 && !penalty(f) && !moraleMod(f, fx, power)) v += Math.abs(f.v) * 2 * 2 * area(f.target) * (f.k === "healMod" ? 0.5 : 1);
    // 키워드를 적 전체에게 — valueOf 는 넓이를 안 본다. 적 표식만 넓어진다: 자기 주머니(selfKw)는 한 번 · 아군 표식은 파티에 하나(once)라 「아군 전원」 도 한 번
    if (f.k === "stack" && f.v > 0 && f.target === "allEnemies" && !selfKw.includes(f.id)) v += 0.3 * f.v * 0.6;
  }
  if (tags.includes("보존")) v += 0.1;
  if (tags.includes("개전")) v += 0.15;
  if (tags.includes("소멸")) v *= 0.7;
  // 소멸 N — N 번 쓰고 사라진다(2 면 0.85 · 3 이상 0.9) · 회수(N) — 쓰고 손으로 돌아온다(한 번마다 +0.15, 셋까지)
  const nTag = (fx || []).find((f) => f.k === "tag" && f.id === "소멸N");
  if (nTag) v *= nTag.n >= 3 ? 0.9 : 0.85;
  const rTag = (fx || []).find((f) => f.k === "tag" && f.id === "회수");
  if (rTag) v += 0.15 * Math.min(3, rTag.n || 1);
  return v;
}

// 기본 카드와 신탁 하나를 견준다.
//   base {fx, cost, tags} — tags 는 머리 태그 + 글의 태그. oracle fx 는 신탁 글을 읽은 그대로(코스트 말 포함)
//   r     코스트 기준 값어치 비(신탁 ÷ 기본). 1 이하면 손해, 1.1 밑이면 하나 마나
//   total 값어치 비(코스트 무시) · raw 소멸을 빼고 센 값어치 비 — 소멸 신탁이 「2배 한 방」 인지 본다
export function oracleVs(base, ofx, opt = {}) {
  const co = flashCost(base.cost, ofx);
  const body = (ofx || []).filter((x) => x.k !== "costSet" && x.k !== "costDelta");
  const otags = tagsOf(body), btags = base.tags || [];
  const vb = Math.max(0.05, cardValue(base.fx, btags, opt)), vo = cardValue(body, otags, opt);
  const rawB = Math.max(0.05, cardValue(base.fx, btags.filter((t) => t !== "소멸"), opt)), rawO = cardValue(body, otags.filter((t) => t !== "소멸"), opt);
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
export function oracleRules(base, oracles /* [{fx, at}] */, opt = {}) {
  const errs = [];
  let gones = 0;
  for (const o of oracles) {
    const v = oracleVs(base, o.fx, opt);
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
