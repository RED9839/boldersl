// 겨우살이의 축복(사도 고유, docs/14 §5)이 전투에서 실제로 도는지 본다.
//
//   node tools/check-bless.js
//
// 고유 카드 540장마다: 축복을 붙이고(run.shin[id] = "own") 내 본다 —
//   · 던지지 않는다 · 덤 효과가 있으면 기록에 「겨우살이의 축복 「이름」」 이 남는다
//   · 코스트 -1 축복은 비용이 1 준다 · 배율 축복은 같은 카드보다 피해 · 회복 · 방어가 커진다
import { newCombat, playCard, costOf } from "../js/combat.js";
import { CARDS } from "../js/cardbook.js";
import { divineKindsFor } from "../js/run.js";
import * as R from "../js/rules.js";

let fails = 0, n = 0, extra = 0, cost = 0;
const fail = (m) => { if (fails < 20) console.log("  실패 " + m); fails++; };

const ids = Object.keys(CARDS).filter((id) => CARDS[id].unique && CARDS[id].bless);
const FOES = ["gluttonbear", "fairymobcloserange"];
for (const id of ids) {
  const c = CARDS[id];
  n++;
  if (JSON.stringify(divineKindsFor(c)) !== '["own"]') fail(`${c.name} — 축복 선택지가 그 카드의 것이 아니다 (${divineKindsFor(c)})`);
  if (!R.shinLabel(c, "own").startsWith(c.bless.ko)) fail(`${c.name} — 축복 이름표가 없다`);
  const party = [c.hero, ...["네르", "에르핀", "티그"].filter((k) => k !== c.hero)].slice(0, 3);
  const mk = (sh) => {
    const s = newCombat({ partyKeys: party, rows: {}, deck: [], enemyIds: FOES, seed: 7, shin: sh ? { [id]: sh } : {} });
    for (const e of s.enemies) e.maxHp = e.hp = 9999;
    for (const u of s.party) { u.maxHp = 9999; u.hp = 5000; }
    s.hand = [id]; s.ap = 10;
    return s;
  };
  try {
    const plain = mk(null), blessed = mk("own");
    const c0 = costOf(plain, id), c1 = costOf(blessed, id);
    if (c.bless.kind === "cost") { cost++; if (!(c1 === Math.max(0, c0 - 1))) fail(`${c.name} — 코스트 -1 축복인데 비용 ${c0} → ${c1}`); }
    else if (c1 !== c0) fail(`${c.name} — 축복이 비용을 바꿨다 (${c0} → ${c1})`);
    const r = playCard(blessed, 0, 0, { ally: 0 });
    if (!r.ok) { fail(`${c.name} — 축복을 붙이니 못 낸다 (${r.why})`); continue; }
    if (c.bless.fx.length) {
      extra++;
      if (!blessed.log.some((l) => l.includes(`겨우살이의 축복 「${c.bless.ko}」`))) fail(`${c.name} — 덤 효과가 돌지 않았다 (「${c.bless.ko}」)`);
    }
  } catch (e) { fail(`${c.name} — 던졌다: ${e.message}`); }
}

console.log(`축복 ${n}장 · 덤 효과 ${extra} · 코스트 -1 ${cost}`);
console.log(fails ? `실패 ${fails}` : "축복이 카드마다 그 카드의 것으로 돈다");
process.exit(fails ? 1 : 0);
