// 카드 값을 잰다. 원작 수치를 그대로 옮기면 카드 게임에서는 맞지 않으니, 이 게임의 셈법을 따로 둔다.
//   node tools/balance.js          어긋난 것만
//   node tools/balance.js --all    전부
//
// 셈법: 카드를 한 장 내면 손패 한 장(3.5점)과 기력(장당 7점)을 쓴다. 그만큼은 돌려받아야 한다.
//   기준 = 3.5 + 7 × 기력.  0코 3.5 · 1코 10.5 · 2코 17.5 · 3코 24.5
//
// 다만 0코 카드는 기력이 아니라 손패 자리가 제약이라 이 자로 재면 늘 과대평가된다(슬더스도 그렇다).
// 그래서 0코는 기준의 두 배까지 눈감아 준다. 그 위로 넘어가면 진짜로 센 것이다.
//
// 이 숫자들이 옳아서가 아니라, 하나의 자로 재야 어느 카드가 튀는지 보이기 때문이다.
// 원작 수치를 옮겨 오지 않는 이유도 같다 — 원작은 이 셈법으로 만들어진 게임이 아니다.
import { CARDS } from "../js/data/cards.js";
import { HEROES } from "../js/data/heroes.js";

const ALL = process.argv.includes("--all");

// 효과 하나의 값. 근거는 오른쪽 주석에.
const WORTH = {
  damage: 1.0,        // 기준 — 피해 1 = 1점
  block: 1.0,         // 방어도는 턴이 끝나면 사라진다. 피해와 같게 본다
  heal: 1.2,          // 회복은 남는다 — 방어도보다 조금 값지다
  healAlly: 1.2,
  blockAlly: 1.05,    // 누구에게 줄지 고를 수 있으니 살짝 더
  blockAll: 2.4,      // 셋에게 — 셋을 다 쓰는 일은 드무니 3배는 아니다
  selfHurt: -1.4,     // 제 체력을 깎는 값
  draw: 3.5,          // 한 장 뽑기
  sp: 7.0,            // SP 하나 = 1코 카드 한 장
  drone: 6.0,         // 턴마다 3 — 두 턴이면 본전, 그 뒤는 덤
  nextCheaper: 3.5,   // 다음 카드 소모 -1 (기력 하나의 절반쯤)
  cleanse: 3.0,
  foresee: 4.0,
  taunt: 3.0,
  addCard: 5.0,       // 임시 카드 한 장 (회복 5짜리 빵)

  // 스트레스를 다루는 것들 — 무너짐 한 번이 최대 체력 45% 영구 손실이니 싸지 않다

  // 상황에 기대는 것들 — 늘 듣지는 않으니 깎아 본다
  purge: 5.0,         // 쌓아 둔 것을 지운다
  seal: 12.0,         // 한 턴을 통째로 건너뛰게 한다
  foreseeAll: 7.0,    // 적 전체의 수를 다시 읽는다
  rentDue: 0,         // 낼수록 오른다 — 자로 재지 않는다

  // 원작 스킬에서 온 것들
  invuln: 14.0,       // 한 턴 통째로 안 맞는다
  tentacle: 6.0,      // 촉수 하나 (턴마다 피해 4)
  stunAll: 14.0,      // 적 전체를 한 턴 멈춘다
  shockStun: 9.0,     // 감전된 적만 — 늘 듣지는 않는다
  poisonTop: 2.2,     // 가장 센 적에게 중독 1당
};
// 상태 이상 1당
// 감전·중독은 원작에서 공격력을 깎는 디버프다(지속 피해가 아니다)
const STATUS = { 취약: 2.5, 약화: 2.0, 감전: 2.8, 중독: 1.8, 힘: 5.0 };
// 적 전체를 때리는 카드는 한 명만 때리는 것보다 값지다. 싸움마다 적은 2~3이지만 늘 셋은 아니다.
const AOE = 1.8;
// 줄 조건이 붙은 카드는 못 낼 때가 있으니 값을 조금 깎아 준다
const NEED_ROW = 0.85;
// 관통은 뒷줄을 때릴 수 있다는 값
const PIERCE = 1.12;

const CARD = 3.5, ENERGY = 7;
const target = (cost) => CARD + ENERGY * cost;
// 0코는 기준의 두 배까지, 그 위는 15% 까지
const allowed = (cost) => (cost === 0 ? 2.0 : 1.15);

function worth(c) {
  let v = 0;
  const notes = [];
  for (const f of c.fx) {
    let w = 0;
    if (f.k === "aoe") w = f.v * WORTH.damage * AOE;
    else if (f.k === "status") {
      const per = STATUS[f.id] ?? 2;
      w = f.v * per * (c.target === "전체" && f.who !== "self" ? AOE : 1);
    } else if (f.k === "addCard") w = f.v * WORTH.addCard;
    // 쌓아 둔 것에 기대는 카드는 값이 판마다 다르다. 자로 재지 않고 따로 표시한다.
    // 전투가 끝날 때까지 가는 효과는 싸움이 길수록 값이 커진다 — 선형 자로는 못 잰다.
    // 실제로 재 보려다 네르의 축복을 1코로 매겨서 완주율이 88%가 됐다. 자 대신 소모값으로 묶는다.
    else if (["poisonBurst", "shockBurst", "tentacleBurst", "rentDue",
              "partyDmg", "crit", "rearBuff", "overdrive"].includes(f.k)) { w = 0; notes.push("값이 판마다 다름"); }
    else if (WORTH[f.k] != null) w = (f.v ?? 1) * WORTH[f.k];
    else notes.push(`값을 모르는 효과 ${f.k}`);
    v += w;
  }
  if (c.need && c.need.row) v *= NEED_ROW;
  if (c.pierce) v *= PIERCE;
  if (c.temp) v *= 0.85;
  return { v: Math.round(v * 10) / 10, notes };
}

const rows = [], variable = [], apart = [];
for (const c of Object.values(CARDS)) {
  // 본색은 무너지는 값을 치르고 얻는 것이라 이 자로 재지 않는다. 추스르기도 마찬가지.
  // 본색은 SP 6 을 모아야 쓰는 한 방이라 이 자로 재지 않는다
  if (c.ego) { apart.push(c); continue; }
  const { v, notes } = worth(c);
  const t = target(c.cost);
  const r = { c, v, t, gap: v - t, ratio: v / t, notes };
  if (notes.includes("값이 판마다 다름")) variable.push(r); else rows.push(r);
}

const bad = rows.filter((r) => r.ratio > allowed(r.c.cost) || r.ratio < 0.85).sort((a, b) => b.ratio - a.ratio);

const line = (r) => {
  const who = r.c.hero ? HEROES[r.c.hero].ko : "교주";
  const sign = r.gap > 0 ? "+" : "";
  return `  ${String(r.c.cost)}코 ${who.padEnd(5)} ${r.c.name.padEnd(12)} ${String(r.v).padStart(5)} / ${String(r.t).padStart(3)}  ${sign}${r.gap.toFixed(1)} (${(r.ratio * 100).toFixed(0)}%)`;
};

if (ALL) {
  console.log("전부 — 값 / 기준");
  for (const r of rows.sort((a, b) => b.ratio - a.ratio)) console.log(line(r));
} else {
  console.log(`자를 벗어난 카드 ${bad.length}장 / 잰 것 ${rows.length}장 (값이 판마다 다른 ${variable.length}장, 본색 ${apart.length}장은 뺐다)`);
  console.log("");
  const strong = bad.filter((r) => r.ratio > 1), weak = bad.filter((r) => r.ratio < 1);
  if (strong.length) { console.log(`센 쪽 ${strong.length}장`); for (const r of strong) console.log(line(r)); console.log(""); }
  if (weak.length) { console.log(`약한 쪽 ${weak.length}장`); for (const r of weak) console.log(line(r)); console.log(""); }
}

for (const r of variable) console.log(`  ~ ${r.c.cost}코 ${r.c.name} — 쌓아 둔 것에 기댄다. 자로 재지 않는다.`);
for (const r of rows.filter((x) => x.notes.length)) console.log(`  ? ${r.c.name}: ${r.notes.join(", ")}`);

// 사도끼리 고르게 나뉘었는지 — 한 사도만 세면 편성이 한쪽으로 쏠린다
console.log("사도별 평균");
const byHero = {};
// 값을 안 재는 카드(판마다 다른 것)는 평균에서도 뺀다 — 넣으면 0 으로 잡혀 평균을 끌어내린다
for (const r of rows) {
  if (!r.c.hero || r.c.temp) continue;
  (byHero[r.c.hero] = byHero[r.c.hero] || []).push(r.ratio);
}
for (const [h, list] of Object.entries(byHero).sort((a, b) => avg(b[1]) - avg(a[1]))) {
  const m = avg(list);
  const skip = variable.filter((v) => v.c.hero === h).length;
  console.log(`  ${HEROES[h].ko.padEnd(5)} ${(m * 100).toFixed(0)}%  (잰 카드 ${list.length}장${skip ? ` · 안 잰 것 ${skip}` : ""})`);
}
function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
