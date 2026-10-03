// 겨우살이의 축복(사도 고유, docs/14 §5)이 전투에서 실제로 도는지 본다.
//
//   node tools/check-bless.js
//
// 고유 카드 540장마다, 그 카드의 축복 하나하나를(셋까지) 붙이고(run.shin[id] = "own" · "own1" · "own2") 내 본다 —
//   · 던지지 않는다 · 덤 효과가 있으면 기록에 「겨우살이의 축복 「이름」」 이 남는다
//   · 코스트 -1 축복은 비용이 1 준다 · 배율 축복은 같은 카드보다 피해 · 회복 · 방어가 커진다
//   · 보존 축복은 내지 않고 턴을 넘기면 손에 남는다(축복 없는 같은 카드는 버려진다)
//   · 고른 축복의 것만 돈다 — 둘째를 골랐는데 첫째의 덤 · 태그가 돌면 안 된다
import { newCombat, playCard, costOf, endTurn } from "../js/combat.js";
import { CARDS } from "../js/cardbook.js";
import { divineKindsFor } from "../js/run.js";
import * as R from "../js/rules.js";

let fails = 0, n = 0, picks = 0, extra = 0, cost = 0, kept = 0, multi = 0;
const fail = (m) => { if (fails < 20) console.log("  실패 " + m); fails++; };

const ids = Object.keys(CARDS).filter((id) => CARDS[id].unique && CARDS[id].bless);
const FOES = ["gluttonbear", "fairymobcloserange"];
const hasTag = (b, t) => (b.fx || []).some((f) => f.k === "tag" && f.id === t);
for (const id of ids) {
  const c = CARDS[id];
  n++;
  const list = R.blessList(c);
  const keys = R.blessKeys(c);
  if (list.length > 1) multi++;
  if (JSON.stringify(list[0]) !== JSON.stringify(c.bless)) fail(`${c.name} — bless 가 blesses 의 첫째가 아니다`);
  if (JSON.stringify(divineKindsFor(c)) !== JSON.stringify(keys)) fail(`${c.name} — 축복 선택지가 그 카드의 것이 아니다 (${divineKindsFor(c)})`);
  const party = [c.hero, ...["네르", "에르핀", "티그"].filter((k) => k !== c.hero)].slice(0, 3);
  const mk = (sh) => {
    const s = newCombat({ partyKeys: party, rows: {}, deck: [], enemyIds: FOES, seed: 7, shin: sh ? { [id]: sh } : {} });
    for (const e of s.enemies) e.maxHp = e.hp = 9999;
    for (const u of s.party) { u.maxHp = 9999; u.hp = 5000; }
    s.hand = [id]; s.ap = 10;
    return s;
  };
  list.forEach((bl, i) => {
    const key = keys[i];
    picks++;
    if (R.blessOf(c, key) !== bl) fail(`${c.name} — 「${key}」 가 ${i + 1}번째 축복을 집지 않는다`);
    if (!R.shinLabel(c, key).startsWith(bl.ko)) fail(`${c.name} — 축복 이름표가 없다 (${key})`);
    if (R.shinKindOf(c, key) !== (bl.kind || null)) fail(`${c.name} — 「${key}」 의 배율이 ${R.shinKindOf(c, key)} (${bl.kind || "없음"} 이어야)`);
    try {
      const plain = mk(null), blessed = mk(key);
      const c0 = costOf(plain, id), c1 = costOf(blessed, id);
      if (bl.kind === "cost") { cost++; if (!(c1 === Math.max(0, c0 - 1))) fail(`${c.name} 「${bl.ko}」 — 코스트 -1 축복인데 비용 ${c0} → ${c1}`); }
      else if (c1 !== c0) fail(`${c.name} 「${bl.ko}」 — 축복이 비용을 바꿨다 (${c0} → ${c1})`);
      if (hasTag(bl, "보존")) {
        kept++;
        const a = mk(null), b = mk(key);
        // 뽑을 더미를 채워 둔다 — 비어 있으면 버린 더미를 섞어 같은 카드를 다시 뽑는다
        for (const t of [a, b]) t.draw = Array(12).fill(`${party[1]}_s0`);
        endTurn(a); endTurn(b);
        if (!b.hand.includes(id) || (a.hand.includes(id) && !(c.tags || []).includes("보존"))) fail(`${c.name} 「${bl.ko}」 — 보존 축복인데 턴을 넘기면 손에 안 남는다`);
      } else if (!(c.tags || []).includes("보존") && list.some((o) => hasTag(o, "보존"))) {
        // 다른 축복이 보존이어도, 이 축복을 고른 카드는 손에 남지 않는다
        const b = mk(key);
        b.draw = Array(12).fill(`${party[1]}_s0`);
        endTurn(b);
        if (b.hand.includes(id)) fail(`${c.name} 「${bl.ko}」 — 고르지 않은 축복의 보존이 돈다`);
      }
      const r = playCard(blessed, 0, 0, { ally: 0 });
      if (!r.ok) { fail(`${c.name} 「${bl.ko}」 — 축복을 붙이니 못 낸다 (${r.why})`); return; }
      if (bl.fx.length) {
        extra++;
        if (!blessed.log.some((l) => l.includes(`겨우살이의 축복 「${bl.ko}」`))) fail(`${c.name} — 덤 효과가 돌지 않았다 (「${bl.ko}」)`);
      }
      for (const o of list) if (o !== bl && o.ko !== bl.ko && o.fx.length && blessed.log.some((l) => l.includes(`겨우살이의 축복 「${o.ko}」`))) fail(`${c.name} — 「${bl.ko}」 를 골랐는데 「${o.ko}」 가 돌았다`);
    } catch (e) { fail(`${c.name} 「${bl.ko}」 — 던졌다: ${e.message}`); }
  });
}

// 옛 저장 — "own" 은 언제나 첫째다(축복이 하나뿐이던 때의 판도 그대로 읽힌다)
{ const c = CARDS[ids.find((id) => R.blessList(CARDS[id]).length > 1)];
  if (c && (R.blessOf(c, "own") || {}).ko !== c.bless.ko) fail("옛 값 「own」 이 첫째 축복을 집지 않는다");
  if (c && R.blessOf(c, "own3")) fail("없는 자리 「own3」 이 축복을 집었다"); }

console.log(`축복 ${n}장(셋인 카드 ${multi}) · 고른 축복 ${picks}가지 · 덤 효과 ${extra} · 코스트 -1 ${cost} · 보존 ${kept}`);
console.log(fails ? `실패 ${fails}` : "축복이 카드마다 그 카드의 것으로 돈다");
process.exit(fails ? 1 : 0);
