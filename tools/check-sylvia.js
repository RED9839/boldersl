// 실비아 「초청객」 이 기획서 글대로 도는지 본다(2026-10 「숫자가 안 늘거나 이상하고, AP 가 제멋대로 는다」).
//
//   node tools/check-sylvia.js
//
// 읽는 법(passive.js 머리말 · condOk 주석):
//   - 「초청객」 은 아군에게 거는 표식이다. 아군마다 제 것을 든다(u.status) — 파티가 함께 쓰는 주머니가 아니다.
//   - 키워드 규칙 「스킬 카드를 낼 때마다 「초청객」이 있으면 적 1명에게 공격력 40% 피해」 는
//     **초청객을 든 아군이 스킬 카드를 낼 때** 카드 한 장에 한 번. 치는 것은 주인(실비아)이다 — 「손님이 있는 자리에서 주인은 은방울로 꾸짖는다」.
//   - 패시브 「실비아의 1코 이상 스킬 카드를 한 턴에 2장 낼 때마다 「초청객」이 2개 이상이면 AP +1」 는
//     실비아가 낸 스킬 카드(적힌 코스트 1 이상)를 그 턴 안에서 세고, 둘째 장에 **실비아 자신의** 초청객을 본다.
import { newCombat, endTurn, playCard, costOf } from "../js/combat.js";
import { CARDS, kitOf } from "../js/cardbook.js";
import { statMod } from "../js/passive.js";

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const fail = (m) => { console.log("  실패 " + m); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));

const PARTY = ["실비아", "에르핀", "네르"];
const kit = (k) => { const x = kitOf(k); return [...x.start, ...x.unique].map((c) => c.id); };
const fight = () => {
  const s = newCombat({ partyKeys: PARTY, rows: {}, deck: PARTY.flatMap(kit), enemyIds: ["gluttonbear", "fairymobcloserange"], seed: 3 });
  for (const e of s.enemies) e.maxHp = e.hp = 5000;
  for (const u of s.party) u.maxHp = u.hp = 5000;       // 적의 차례에 아무도 쓰러지지 않게
  return s;
};
const idOf = (hero, ko) => Object.keys(CARDS).find((id) => CARDS[id].hero === hero && CARDS[id].name === ko);
const unit = (s, k) => s.party.find((u) => u.key === k);
const guests = (s) => s.party.map((u) => (u.status || {})["초청객"] || 0);
// 카드를 손에 넣고 낸다. AP 는 넉넉히 채워 둔다(재는 것은 낸 뒤 늘어난 만큼)
const play = (s, id, t = 0) => { s.hand.unshift(id); s.ap = 10; const paid = costOf(s, id); const r = playCard(s, 0, t); if (!r.ok) fail(`${CARDS[id].name} 를 못 냈다 — ${r.why}`); return s.ap - (10 - paid); };
const hits = (s) => s.log.filter((l) => l === "실비아 · 초청객").length;

const SIG = idOf("실비아", "궁극의 유희");      // 2코 스킬 — 아군 전원 「초청객」 +2
const POUT = idOf("실비아", "볼 빵빵");         // 1코 스킬 — 도발 · 방어(피해 없음)
const PRAY = idOf("네르", "기도입니다, 잠 아니고요");   // 네르의 1코 스킬 — 피해 없음
const SLAP = CARDS["실비아_s0"] ? "실비아_s0" : kit("실비아").find((id) => CARDS[id].type === "공격");
for (const [n, id] of Object.entries({ SIG, POUT, PRAY, SLAP })) if (!id) fail(`카드를 못 찾았다: ${n}`);

console.log("쌓이기 · 최대 · 줄기");
{
  // v3(docs/14): 전투 시작에 거는 것과 「스킬 카드마다 은방울」 규칙은 걷었다 — 초청객은 시그니처 · 디버프(패시브 「숙녀의 치장」)로 쌓는다
  const s = fight();
  check(guests(s).every((n) => n === 0), `전투 시작 — 아직 손님이 없다 (${guests(s)})`);
  const give = (CARDS[SIG].fx || []).filter((f) => f.k === "stack" && f.id === "초청객").reduce((a, f) => a + f.v, 0);
  play(s, SIG);
  check(guests(s).every((n) => n >= Math.min(3, give)), `시그니처 +${give}(디버프를 걸면 패시브가 +1 더) → 아군마다 ${Math.min(3, give)} 이상 (${guests(s)})`);
  check(!Object.values(s.stacks || {}).some((p) => p["초청객"]), "실비아 주머니(s.stacks)에는 쌓이지 않는다 — 아군 표식이다");
  check(s.enemies.every((e) => !(e.status || {})["초청객"]), "적에게는 붙지 않는다");
  play(s, SIG); play(s, SIG);
  check(guests(s).every((n) => n === 3), `최대 3 — 더 줘도 3 (${guests(s)})`);
  endTurn(s);
  check(guests(s).every((n) => n === 2), `적의 차례가 끝나면 1 감소 → 2 (${guests(s)})`);
  {
    const t = fight(), ner = unit(t, "네르");
    ner.status["초청객"] = 3; const d3 = statMod(t, ner, "dealt");
    ner.status["초청객"] = 2; const d2 = statMod(t, ner, "dealt");
    check(Math.abs((d3 - d2) - 0.05) < 1e-9, `1개당 주는 피해 +5% — 든 사람(네르)의 주는 피해가 한 개만큼 준다 (${d3.toFixed(2)} → ${d2.toFixed(2)})`);
  }
  endTurn(s); endTurn(s);
  check(guests(s).every((n) => n === 0) && s.party.every((u) => !("초청객" in (u.status || {}))), `0 이 되면 떨어진다 (${guests(s)})`);
}

console.log("");
console.log("어머니의 특별 강의 — AP +1");
{
  const s = fight();
  play(s, SIG);                                   // 실비아 3 (이 장이 첫 장으로 센다)
  const g1 = play(s, POUT);
  check(g1 === 1, `1코 이상 스킬 두 장째, 실비아 초청객 3 — AP +1 (${g1})`);
  check(s.log.includes("실비아: AP +1"), "AP 가 늘면 기록에 남는다");
  const g2 = play(s, POUT), g3 = play(s, POUT);
  // 턴당 횟수 제한은 없앴다(2026-10) — 두 장마다 한 번. 1코 이상만 세니 쓴 AP 2 에 돌려받는 AP 1 이라 끝없이 돌지 않는다
  check(g2 === 0 && g3 === 1, `두 장마다 — 셋째 장엔 없고 넷째 장에 또 AP +1 (${g2}, ${g3})`);
  endTurn(s);                                     // 실비아 2
  const a = play(s, POUT);
  check(a === 0, `새 턴 첫 장 — 지난 턴에 센 것이 넘어오지 않는다 (${a})`);
  const n = play(s, PRAY);
  check(n === 0, `네르의 스킬 카드는 실비아의 장수에 들지 않는다 (${n})`);
  const b = play(s, POUT);
  check(b === 1, `실비아 2개 · 이번 턴 두 장째 — AP +1 (${b})`);
}
{
  const s = fight();
  unit(s, "실비아").status["초청객"] = 3;
  play(s, POUT);                                  // 한 장만 내고 턴을 넘긴다
  endTurn(s);
  const g = play(s, POUT);
  check(g === 0, `지난 턴 한 장 + 이번 턴 한 장 — 턴을 넘어 이어 세지 않는다 (${g})`);
}
{
  const s = fight();
  // 실비아만 1, 다른 둘은 3 — 파티 합(7)이 아니라 실비아 자신의 수를 본다
  unit(s, "에르핀").status["초청객"] = 3; unit(s, "네르").status["초청객"] = 3;
  const g = play(s, POUT) + play(s, POUT);
  check(g === 0, `실비아 자신이 1개면 안 준다(다른 아군이 들고 있어도) (${g})`);
}
{
  const s = fight();
  unit(s, "실비아").status["초청객"] = 3;
  // 0코 스킬은 세지 않는다 — 적힌 코스트를 0 으로 바꾼 사본으로 낸다
  s.book[POUT] = { ...CARDS[POUT], cost: 0 };
  const g = play(s, POUT) + play(s, POUT);
  check(g === 0, `0코 스킬 카드는 세지 않는다 (${g})`);
}

console.log("");
console.log(fails ? `실패 ${fails}` : "실비아 「초청객」 이 기획서대로 돈다");
process.exit(fails ? 1 : 0);
