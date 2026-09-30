// 카드 한 장이 코스트에 비해 얼마나 하는지 — 대충의 값어치를 센다.
// tools/cost-audit.js 와 tools/check-hero.js 가 같이 쓴다.
//
// 단위: 「1코 공격 한 명 120%」 가 대략 1. 기준은 docs/07-스킬구성.md §7 표.
//   피해 한 명 100% = 0.83 · 전체 ×1.6 · 무작위 ×0.9 · X 코스트는 3타로 친다
//   방어·실드 200% = 0.8 · 회복 80% = 0.8 (아군 전원은 ×2)
//   드로우 1 = 0.4 · AP 1 = 0.9 · 게이지 10% = 0.1 · 기절 0.8 · 취약·약화 1턴 0.2 · 증감 10%·1턴 0.2
//   키워드 +1 = 0.3
// 코스트 c 의 기준 값어치 = 0.5 + c  (1코 1.5 · 2코 2.5 · 3코 3.5)
// 정밀한 값이 아니다 — 크게 어긋난 카드(공짜나 다름없는 것, 코스트만 비싼 것)를 찾는 체다.

const area = (t) => (t === "allEnemies" || t === "allAllies" ? 1.6 : t === "randomEnemy" ? 0.9 : 1);

export function valueOf(fx) {
  let v = 0;
  for (const f of fx || []) {
    const n = f.hits || 1;
    switch (f.k) {
      case "dmg": v += f.ratio * n * 0.83 * area(f.target) * (f.xHits ? 3 : 1); break;
      case "block": case "shield": v += (f.ratio / 2) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "heal": v += (f.ratio / 0.8) * 0.8 * (f.target === "allAllies" ? 2 : 1); break;
      case "draw": v += 0.4 * (f.v || 1); break;
      case "ap": v += 0.9 * f.v; break;
      case "gauge": v += f.v / 100; break;
      case "status": v += f.id === "기절" ? 0.8 : f.id === "도발" ? 0.3 : 0.2 * (f.turns || 1) * area(f.target); break;
      case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod":
        v += Math.abs(f.v) * 2 * Math.min(f.turns || 1, 4) * area(f.target); break;
      case "stack": if (f.v > 0) v += 0.3 * f.v; break;
      case "strip": v += 0.3; break;
      case "invuln": v += f.target === "allAllies" ? 2.5 : 1.2; break;
      case "cleanse": v += 0.2; break;
    }
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
