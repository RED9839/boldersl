// 카드 → 사도 SD 동작 · 소리 갈래. 전투 화면(fight-screen 의 actName)이 카드를 낼 때 부른다. 판에는 아무 영향이 없다.
// 원작 전투 SD 에 있는 동작만 쓴다 — Attack1_1 평타 · Attack2_1 강화 평타 · Skill1_1 저학년 스킬 · Spawn 등장 · Victory 승리.
// 막기 · 버티기 동작은 원작에 따로 없다(Hit 도 10명뿐). 그래서 방어 카드는 탱커의 스킬(방패 · 날개 펴기 · 갑옷)이나 등장 자세로.
//
//   cardMotion(카드, { role, key, has })  → { anim, group, tier, cut }
//     anim   SD 동작 이름(없는 것은 고르지 않는다 — has(이름))
//     group  사도 소리 갈래 — attack(basicattack) · power(powerattack) · skill(skillcast · spskill) · null(사도 소리 없이 카드 종류 소리)
//     tier   왜 골랐나 — sig 시그니처 · heavy 센 공격 · light 가벼운 공격 · guard 방어 · cast 시전 · rally 아군 북돋우기 · buff 강화 · util 손패 · 쓸모
//     cut    그 동작을 이만큼(ms)만 하고 쉬는 동작으로(승리 동작은 길게는 23초 — 춤을 다 추지 않게)
//     from   그 동작의 이 몫(0~1)부터 — 등장(Spawn)은 화면 밖에서 뛰어들어 앞 40% 동안 사도가 칸에서 사라진다(티그 · 에르핀 띠로 보았다).
//            내려선 뒤(무기를 고쳐 쥐고 자세를 잡는 데)부터만 쓴다
//   tools 에서 보려면: node tools/card-motion.js 에르핀,티그
//
// 탱커 · 서포터 · 딜러의 Skill1_1 이 무엇처럼 보이나(.shots/ingame-poses 의 Skill1_1@25/50/75 를 대어 보았다):
//   탱커는 대개 막아서는 몸짓(비비 날개 · 알레트 방패 · 이드 톱니 갑옷 · 빅우드 힘주기 · 오로라 웅크림) → guard
//   서포터는 대개 시전(네르 기도 · 나이아 돌고래 · 힐데 주사 · 아멜리아 태블릿 · 마고 지팡이) → cast
//   딜러는 대개 공격 스킬(티그 쌍검 교차 · 란 · 다야 · 실라 화살 · 마요 저격) → strike
export const LOOK = { 탱커: "guard", 서포터: "cast", 딜러: "strike" };
// 역할과 다르게 보이는 사도
//   시저 — 서포터지만 Skill1_1 이 커다란 악어가 무는 공격 · 코미 — 탱커지만 Skill1_1 이 이불 덮고 자기(회복으로는 맞고 막기로는 어색)
//   리온 — 탱커지만 Skill1_1 이 화내며 망치를 들고 뛰어든다
export const LOOK_BY_HERO = { 시저: "strike", 코미: "cast", 리온: "strike" };

// Attack2_1 이 공격이 아닌 사도 — 에르핀의 Attack2_* 는 케이크를 꺼내 먹는 동작(패시브 「와구와구」). 센 공격은 스킬로
export const POWER_NOT_ATTACK = new Set(["에르핀"]);
// 카드 하나를 콕 집어 — 동작이 카드 내용 그대로인 것(2026-10 사용자: 친구 몰래 케이크 = 케이크 먹는 동작)
export const CARD_MOTION = {
  "에르핀_u1": { anim: "Attack2_1", group: "power", tier: "eat" },
};
// 평타(Attack1_1)가 두 번 베는 사도 — 한 번 치는 카드는 첫 타 뒤에서 끊는다(티그: 0.27s · 1.00s 두 번)
export const LIGHT_ONE_CUT = { 티그: 700 };

// 센 공격 — 한 장의 피해 계수 합(공격력 × 배율 × 타수)이 이만큼이면. 전체 공격은 AOE_HEAVY, 세 번 이상 몰아치면 타수만으로도
export const HEAVY = 1.8, AOE_HEAVY = 1.2, MULTI = 3;
// 승리 동작은 이만큼만 — 첫 동작(주먹 쥐기 · 뛰기)이 1초 안팎이다
export const BUFF_CUT = 1400;
export const SPAWN_FROM = 0.4;

// 카드 한 장의 피해 — { total 계수 합, hits 가장 많은 타수, aoe 전체 공격, any 피해가 있나 }. 옛 카드(damage · aoe v)는 v 10 = 100%
export function cardPower(c) {
  let total = 0, hits = 0, aoe = false, any = false;
  for (const f of (c && c.fx) || []) {
    if (f.k === "dmg") {
      const n = f.hits || 1;
      any = true; total += (f.ratio || 0) * n; hits = Math.max(hits, n);
      if (f.target === "allEnemies") aoe = true;
    } else if (f.k === "damage" || f.k === "aoe" || f.k === "partyDmg") {
      any = true; total += (f.v || 0) / 10; hits = Math.max(hits, f.times || 1);
      if (f.k === "aoe") aoe = true;
    }
  }
  return { total: Math.round(total * 100) / 100, hits, aoe, any };
}
const GUARD_FX = new Set(["block", "shield", "blockAll", "blockAlly", "taunt", "invuln", "takenMod", "defMod"]);

export function cardMotion(c, { role, key, has = () => true } = {}) {
  const look = LOOK_BY_HERO[key] || LOOK[role] || "strike";
  const skill = has("Skill1_1") ? "Skill1_1" : null;
  const power = has("Attack2_1") && !POWER_NOT_ATTACK.has(key) ? "Attack2_1" : null;
  const light = has("Attack1_1") ? "Attack1_1" : null;
  const go = (anim, group, tier, cut = 0) => ({ anim, group: anim ? group : null, tier, cut, from: anim === "Spawn" ? SPAWN_FROM : 0 });
  const p = cardPower(c);
  const fix = CARD_MOTION[c && c.id];
  if (fix && has(fix.anim)) return go(fix.anim, fix.group, fix.tier, fix.cut || 0);
  // 시그니처 — 그 사도의 대표 기술. 원작의 저학년 스킬(Skill1_1)로
  if (c.signature && skill) return go(skill, "skill", "sig");
  if (c.type === "공격" || p.any) {
    const heavy = p.total >= HEAVY || (p.aoe && p.total >= AOE_HEAVY) || p.hits >= MULTI;
    if (heavy) {
      if (power) return go(power, "power", "heavy");
      if (skill && look === "strike") return go(skill, "skill", "heavy");
    }
    const one = !heavy && light && p.hits <= 1 && LIGHT_ONE_CUT[key];
    return go(light || power || skill, light ? "attack" : power ? "power" : "skill", heavy ? "heavy" : "light", one || 0);
  }
  // 방어 — 탱커는 막아서는 스킬, 서포터는 시전(보호 주문 · 기도). 딜러는 아군에게 거는 것(아군 전원 방어 · 버프)이면 승리 동작으로 북돋우고,
  // 제 몸만 지키면 등장 자세(무기를 고쳐 쥐고 선다)
  const ally = (c.fx || []).some((f) => /all(y|ies)/i.test(f.target || "")) || c.target === "아군";
  const guard = (c.fx || []).some((f) => GUARD_FX.has(f.k));   // 카드 종류가 아니라 효과로(옛 방어 카드는 이제 스킬이다)
  if (guard) {
    if (look === "guard" && skill) return go(skill, "skill", "guard");
    if (look === "cast" && skill) return go(skill, "skill", "cast");
    if (ally && has("Victory")) return go("Victory", null, "rally", BUFF_CUT);
    return go(has("Spawn") ? "Spawn" : null, null, "guard");
  }
  if (look === "cast" && skill) return go(skill, "skill", "cast");
  if (c.type === "강화" || (c.fx || []).some((f) => /^(atkMod|dealtMod|critMod|crit)$/.test(f.k)))
    return go(has("Victory") ? "Victory" : null, null, "buff", BUFF_CUT);
  return go(has("Spawn") ? "Spawn" : null, null, "util");
}
