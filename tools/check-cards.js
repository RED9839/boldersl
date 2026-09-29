// 원작 스킬에서 나온 카드들이 실제로 효과를 내는지 하나씩 내 본다.
// 자로 잰 값과 달리, 이건 "코드가 도는가"를 본다 — 효과 이름 오타 하나면 카드가 조용히 아무 일도 안 한다.
import { newCombat, playCard } from "../js/combat.js";
import { CARDS } from "../js/data/cards.js";
import { HEROES } from "../js/data/heroes.js";

// [카드, 그 사도, 무엇을 하는가, 미리 만들어 둘 상황]
const CASES = [
  ["erpin_tap", "erpin", "평타 — SP 를 수급한다", null],
  ["ner_pledge", "ner", "각서 한 장 — SP 를 준다", null],
  ["erpin_charge", "erpin", "강화 평타", null],
  ["erpin_god", "erpin", "무적 — 이번 턴 안 맞는다", null],
  ["erpin_crown", "erpin", "여왕의 위엄 — 전체 + 약화", null],
  ["erpin_rear", "erpin", "뒷줄에 호령 — 후열 강화", null],
  ["ner_bless", "ner", "사제장의 축복 — 아군 공격 +", null],
  ["ner_crit", "ner", "치명의 기도 — 아군 피해 +%", null],
  ["ner_judge", "ner", "심판의 빛 — 전체 마법", null],
  ["elena_line", "elena", "직선 관통 — 전체 + 감전", null],
  ["elena_shock", "elena", "감전", null],
  ["elena_arc", "elena", "감전 확산", (s) => s.enemies.forEach((e) => (e.status["감전"] = 3))],
  ["elena_boom", "elena", "자폭 — 세게 때리고 제 체력도", null],
  ["amelia_mk2", "amelia", "새틀라이트 Mk.2 — 4회 + 감전", null],
  ["amelia_stun", "amelia", "과부하 — 감전된 적 기절", (s) => s.enemies.forEach((e) => (e.status["감전"] = 2))],
  ["amelia_hack", "amelia", "무단 접속", null],
  ["ashur_snipe", "ashur", "저격 — 줄을 가리지 않는다", null],
  ["ashur_burst", "ashur", "입자 폭발 — 광역 기절", null],
  ["ashur_bill", "ashur", "월세 — 낼수록 오른다", null],
  ["ashur_field", "ashur", "입자 결계", null],
  ["mayo_dart", "mayo", "마취 독침 — 중독", null],
  ["mayo_quick", "mayo", "빠른 손놀림 — 2연타 + 중독", null],
  ["mayo_price", "mayo", "값은 제가 매김 — 가장 센 놈", null],
  ["mayo_stuff", "mayo", "박제 — 중독만큼", (s) => (s.enemies[0].status["중독"] = 6)],
  ["tig_flurry", "tig", "연참 — 한 번에 두 번", null],
  ["tig_over", "tig", "오버드라이브", null],
  ["tig_doubt", "tig", "그거 거짓 아니냐", (s) => { s.enemies[0].status["힘"] = 3; s.enemies[0].block = 12; }],
  ["fricle_vine", "fricle", "가시 촉수 소환", null],
  ["fricle_wither", "fricle", "소멸 — 촉수를 터뜨린다", (s) => (s.tentacles = 3)],
  ["fricle_seal", "fricle", "봉인", null],
  ["fricle_fry", "fricle", "열두 봉지", null],
];

const snap = (s) => JSON.stringify({
  ehp: s.enemies.map((e) => e.hp), eb: s.enemies.map((e) => e.block),
  est: s.enemies.map((e) => ({ ...e.status })), seal: s.enemies.map((e) => !!e.sealed),
  php: s.party.map((u) => u.hp), pb: s.party.map((u) => u.block), inv: s.party.map((u) => !!u.invuln),
  hand: s.hand.length, sp: s.sp,
  tent: s.tentacles, pd: s.partyDmg, crit: s.crit, rear: s.rearBuff, od: s.overdrive,
});

let bad = 0;
for (const [id, hero, what, setup] of CASES) {
  const s = newCombat({ partyKeys: [hero], deck: [id], enemyIds: ["gluttonbear", "ginseng"], seed: 99 });
  s.sp = 20;
  if (setup) setup(s);
  const before = snap(s);
  s.hand = [id];
  const r = playCard(s, 0, 0);
  const after = snap(s);
  if (!r.ok) { console.log(`  실패 ${CARDS[id].name}: ${r.why}`); bad++; }
  else if (before === after) { console.log(`  아무 일도 안 일어남 — ${CARDS[id].name} (${what})`); bad++; }
  else console.log(`  ok   ${CARDS[id].name.padEnd(14)} ${what}`);
}

// 사도마다 여덟 장인지
for (const k of Object.keys(HEROES)) {
  const n = Object.values(CARDS).filter((c) => c.hero === k && !c.temp && !c.ego).length;
  if (n !== 8) { console.log(`  ${HEROES[k].ko} 카드가 ${n}장 (여덟이어야 한다)`); bad++; }
}
// 원작 정보가 다 적혀 있는지
for (const [k, h] of Object.entries(HEROES)) {
  if (!h.atk || !h.kit || !h.row) { console.log(`  ${h.ko}에 원작 정보(atk/kit/row)가 빠졌다`); bad++; }
}

console.log(bad ? `\n문제 ${bad}개` : `\n카드 ${CASES.length}장 전부 동작 · 사도마다 여덟 장 · 원작 정보 갖춤`);
process.exit(bad ? 1 : 0);
