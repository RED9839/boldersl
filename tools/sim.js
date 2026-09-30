// 화면 없이 전투를 돌린다. 규칙이 스스로 굴러가는지 보는 용도.
//   node tools/sim.js               한 판 자세히
//   node tools/sim.js 200           200판 돌려 승률만
import { newCombat, endTurn, playCard, canPlay, costOf, buildDeck, alive } from "../js/combat.js";
import { TRAITS } from "../js/data/traits.js";
import { CARDS, EXTRA } from "../js/data/cards.js";
import { FLOORS } from "../js/data/enemies.js";

const N = +(process.argv[2] || 0);
const NONAT = process.argv.includes("--no-nature"); // 성격 상성을 끄고 재기
const SAVE  = process.argv.includes("--save");      // 본색을 쓰려고 SP 를 아끼는 손
// --hp 1.4 — 적 체력 배율을 바꿔 잰다(기본은 rules.js ENEMY_HP)
const HPX = process.argv.includes("--hp") ? +process.argv[process.argv.indexOf("--hp") + 1] : undefined;

// 아무 생각 없는 손: 낼 수 있는 카드를 아무거나 낸다. 이게 이기면 규칙이 너무 쉬운 것이고,
// 이게 전혀 못 이기면 너무 어려운 것이다.
function autoPlay(s) {
  let guard = 0;
  while (!s.over && guard++ < 60) {
    const playable = s.hand.map((id, i) => [id, i]).filter(([id]) => !canPlay(s, id));
    if (!playable.length) break;
    // --save: 손에 본색이 있으면 그걸 낼 만큼 SP 를 남겨 둔다.
    // 아무 생각 없는 손은 SP 를 다 써 버려서 본색이 한 번도 안 나간다 — 모으는 손도 재야 한다.
    let pick = playable[0];
    if (SAVE) {
      const ego = s.hand.find((id) => CARDS[id] && CARDS[id].ego);
      if (ego) {
        // 낼 수 있으면 낸다
        if (!canPlay(s, ego)) { s.egoPlayed = (s.egoPlayed || 0) + 1; playCard(s, s.hand.indexOf(ego), 0); continue; }
        // 한 턴만 더 모으면 닿을 때에만 참는다. 무작정 쥐고 있으면 턴을 통째로 버린다.
        const need = costOf(s, ego);
        if (s.sp + s.spPerTurn >= need) {
          // 0코 카드는 SP 를 안 먹으니 모으는 중에도 낸다 — 에르핀의 평타가 그 자리다
          const keep = playable.filter(([id]) => s.sp - costOf(s, id) + s.spPerTurn >= need);
          if (!keep.length) break;      // 뭘 내도 못 닿는다 → 이 턴은 모은다
          const free = keep.filter(([id]) => costOf(s, id) === 0);
          pick = (free[0] || keep[0]);
        }
      }
    }
    if (CARDS[pick[0]] && CARDS[pick[0]].ego) s.egoPlayed = (s.egoPlayed || 0) + 1;
    const r = playCard(s, pick[1], 0);
    if (!r.ok) break;
  }
}

function runFight(partyKeys, enemyIds, hp, seed, traits, maxHp) {
  const s = newCombat({ partyKeys, deck: buildDeck(partyKeys), enemyIds, hp, maxHp, seed, noNature: NONAT, traits, enemyHp: HPX });
  let t = 0;
  while (!s.over && t++ < 40) { autoPlay(s); endTurn(s); }
  return s;
}

// 한 층 — 전투 셋에 보스 하나. 체력은 이어지고, 전투 사이에 조금만 회복한다.
// 난이도는 전투 하나가 아니라 이 단위로 재야 맞다.
function runFloor(partyKeys, floor, seed, traits = []) {
  let hp = null, maxHp = null, fights = 0, combos = 0, turns = 0, egos = 0, sp = 0;
  for (const ids of [...floor.fights, floor.boss]) {
    const s = runFight(partyKeys, ids, hp, seed + fights * 977, traits, maxHp);
    turns += s.turn;
    combos += s.log.filter((l) => l.startsWith("연계")).length;
    egos += s.egoPlayed || 0;
    sp = Math.max(sp, s.sp);
    if (s.over !== "win") return { win: false, fights, combos, turns, egos, sp };
    fights++;
    hp = {}; maxHp = {};
    for (const u of s.party) {
      maxHp[u.key] = u.maxHp;
      hp[u.key] = u.dead ? 0 : Math.min(u.maxHp, u.hp + 6);
    }
  }
  return { win: true, fights, combos, turns, egos, sp };
}

const PARTY = ["네르", "에르핀", "엘레나"];      // 각별 51 + 각별 20 + 친함 18
const PARTY2 = ["티그", "에슈르", "마요"];      // 0 · 0 · 5 — 거의 초면
const PARTY3 = ["엘레나", "아멜리아", "프리클"]; // 냉정 셋 — 성격은 최고, 사이는 거의 초면
const PARTY4 = ["네르", "마요", "에르핀"];      // 광기 둘 + 각별 둘 — 두 축을 다 먹는다

if (!N) {
  console.log("편성:", PARTY.join(", "));
  const s = runFight(PARTY, FLOORS[0].fights[1], null, 12345);
  console.log("\n--- 기록 ---");
  for (const l of s.log) console.log(" ", l);
  console.log("\n결과:", s.over, "· 턴", s.turn);
  console.log("생존:", alive(s.party).map((u) => `${u.ko} ${u.hp}/${u.maxHp}`).join(" · ") || "없음");
  process.exit(0);
}

console.log(`한 층(전투 3 + 보스)을 무작위 손으로 ${N}번${NONAT ? " · 성격 끔" : ""}${SAVE ? " · SP 아끼는 손" : ""} — 이게 100%면 너무 쉽고, 0%면 너무 어렵다.`);
for (const [label, party] of [["가까운 셋 ", PARTY], ["남남인 셋 ", PARTY2], ["냉정 셋  ", PARTY3], ["광기+각별", PARTY4]]) {
  let win = 0, turns = 0, combos = 0, reach = 0, egos = 0;
  for (let i = 0; i < N; i++) {
    const r = runFloor(party, FLOORS[0], i + 1);
    if (r.win) win++;
    reach += r.fights; turns += r.turns; combos += r.combos; egos += r.egos;
  }
  console.log(`  ${label} (${party.join("·")}): 완주 ${((win / N) * 100).toFixed(1)}% · ${(reach / N).toFixed(2)}전투 돌파 · ${(turns / N).toFixed(1)}턴 · 연계 ${(combos / N).toFixed(1)} · 본색 ${(egos / N).toFixed(2)}회`);
}

// 신탁이 값을 하는지 — 하나씩 켜 보고 완주율이 어떻게 달라지는지 본다
console.log("");
// 편성 둘 다에 돌린다 — 덱 성향 신탁(독한 마음 같은)은 한 편성에서만 보면 0 으로 읽힌다
console.log("신탁 하나씩 — 없을 때 대비 몇 p 오르는가");
const rate = (party, tr) => { let w = 0; for (let i = 0; i < N; i++) if (runFloor(party, FLOORS[0], i + 1, tr).win) w++; return w / N; };
const b1 = rate(PARTY, []), b2 = rate(PARTY2, []);
const err = (p) => (Math.sqrt((p * (1 - p)) / N) * 100).toFixed(1);
console.log(`  기준: 가까운 셋 ${(b1 * 100).toFixed(1)}% (±${err(b1)}p) · 남남인 셋 ${(b2 * 100).toFixed(1)}% (±${err(b2)}p)`);
for (const id of Object.keys(TRAITS)) {
  const d1 = rate(PARTY, [id]) - b1, d2 = rate(PARTY2, [id]) - b2;
  const f = (d) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}p`;
  console.log(`  ${TRAITS[id].ko.padEnd(8)} 가까운 ${f(d1).padStart(7)} · 남남 ${f(d2).padStart(7)}`);
}

// 카드가 전부 한 번은 나가는지 — 죽은 카드를 찾는다
const seen = new Set();
for (let i = 0; i < 300; i++) {
  const party = ["에르핀", "네르", "엘레나", "아멜리아", "에슈르", "마요", "티그", "프리클"]
    .sort(() => Math.random() - 0.5).slice(0, 3);
  const s = newCombat({ partyKeys: party, deck: buildDeck(party), enemyIds: FLOORS[0].fights[2], seed: i + 1 });
  let t = 0;
  while (!s.over && t++ < 40) {
    let g = 0;
    while (!s.over && g++ < 60) {
      const idx = s.hand.findIndex((id) => !canPlay(s, id));
      if (idx < 0) break;
      seen.add(s.hand[idx]);
      if (!playCard(s, idx, 0).ok) break;
    }
    endTurn(s);
  }
}
// 견줄 것은 **이번에 실제로 돌린 시작덱**이다.
// 전에는 CARDS 전부와 견줬더니, 이제 아무도 안 쓰는 옛 시제품 카드가 36장 뜨면서
// 죽은 카드를 못 찾았다. 덱에 들어간 적 없는 카드는 애초에 여기서 볼 일이 아니다.
const dealt = new Set();
for (const k of ["에르핀", "네르", "엘레나", "아멜리아", "에슈르", "마요", "티그", "프리클"])
  for (const id of buildDeck([k])) dealt.add(id);
const never = [...dealt].filter((id) => !seen.has(id));
console.log(`
시작덱 ${dealt.size}장 가운데 한 번도 안 나간 카드 ${never.length}장${never.length ? ": " + never.join(", ") : ""}`);
