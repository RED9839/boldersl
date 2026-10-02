// 효과 실행기가 실제로 도는지 본다. 전투 엔진 없이 최소한의 가짜 판을 세워 조각만 돌린다.
//
// 기획서의 계산식이 그대로 나오는지가 핵심이다 —
//   공격력 15 × 배율 220% = 33 피해, 방어력 2 × 200% = 4 방어.
import { runFx } from "../js/run-fx.js";
import * as R from "../js/rules.js";
import B from "../js/data/built.js";

let bad = 0;
const fail = (m) => { console.log(`  실패 ${m}`); bad++; };
const ok = (m) => console.log(`  ok   ${m}`);

// 가짜 판 — 엔진이 넘겨 주는 손잡이만 흉내 낸다
function board(heroKey) {
  const h = B.heroes[heroKey];
  const me = { key: heroKey, ko: h.ko, side: "party", hp: h.hp, maxHp: h.hp, atk: h.atk, def: h.def, crit: 0, block: 0, shield: 0, status: {}, dead: false };
  const foe = (i) => ({ key: "적" + i, ko: "적" + i, side: "enemy", hp: 200, maxHp: 200, atk: 5, def: 1, crit: 0, block: 0, shield: 0, status: {}, dead: false });
  const s = {
    rng: () => 0.5, party: [me], enemies: [foe(1), foe(2)],
    ap: 3, gauge: 0, hand: ["a", "b", "c"], log: [],
  };
  const api = {
    hurt: (t, v, o = {}) => { s.dealt = (s.dealt || 0) + v; if (!o.pure) t.hp -= v; else t.hp -= v; },
    draw: (n) => { s.drew = (s.drew || 0) + n; },
    addStatus: (t, id, v, turns) => { t.status[id] = (t.status[id] || 0) + v; t.statusTurns = turns; },
    cleanse: () => { s.cleansed = true; },
    trigger: (u, id, n) => { s.triggered = (s.triggered || 0) + n; },
    discard: (n) => { s.discarded = n; },
  };
  return { s, me, api, h };
}

function run(heroKey, fx, ctx = {}) {
  const { s, me, api, h } = board(heroKey);
  runFx(s, fx, { owner: me, targetIdx: 0, ...ctx }, api);
  return { s, me, h };
}

// ── 스탯 기반 % 가 기획서대로인가 ──────────────────────────────────────
console.log("스탯 기반 계산 (기획서)");
{
  const h = B.heroes["에르핀"];
  // 특대 마력탄: 2코, 공격력 220% 피해 → 15 × 2.2 = 33
  const card = B.cards[B.starter["에르핀"].find((id) => B.cards[id].ko.includes("특대"))];
  const { s } = run("에르핀", card.fx);
  const want = Math.round(h.atk * 2.2);
  s.dealt === want ? ok(`특대 마력탄 — 공격력 ${h.atk} × 220% = ${s.dealt}`) : fail(`특대 마력탄 ${s.dealt} (${want} 이어야 한다)`);
}
{
  const h = B.heroes["에르핀"];
  const card = B.cards[B.starter["에르핀"].find((id) => B.cards[id].type === "방어")];
  const { s, me } = run("에르핀", card.fx);
  const want = Math.max(1, Math.round(h.def * 2.0));
  me.block === want ? ok(`${card.ko} — 방어력 ${h.def} × 200% = ${me.block}`) : fail(`${card.ko} ${me.block} (${want} 이어야 한다)`);
}

// ── 타수 ───────────────────────────────────────────────────────────────
console.log("");
console.log("타수와 대상");
{
  // 마력탄 폭주: 무작위 적 4회 × 공격력 50%
  const card = Object.values(B.cards).find((c) => c.ko === "마력탄 폭주");
  // 간식이 없을 때 — 조건(ifStack) 뒤의 추가 한 발은 안 나간다. 조건째로 넘겨야 막힌다
  const { s, h } = run("에르핀", card.fx);
  const want = Math.round(B.heroes["에르핀"].atk * 0.5) * 4;
  s.dealt === want ? ok(`마력탄 폭주 — 4회 × 50% = ${s.dealt}`) : fail(`마력탄 폭주 ${s.dealt} (${want} 이어야 한다)`);
}
{
  const { s } = run("에르핀", [{ k: "dmg", ratio: 1, target: "allEnemies", hits: 1 }]);
  const want = B.heroes["에르핀"].atk * 2;      // 적 둘
  s.dealt === want ? ok(`적 전체 — 둘에게 들어간다 (${s.dealt})`) : fail(`적 전체 ${s.dealt} (${want} 이어야 한다)`);
}

// ── 키워드 ─────────────────────────────────────────────────────────────
console.log("");
console.log("사도 전용 키워드");
{
  const { s, me } = run("에르핀", [{ k: "stack", id: "간식", v: 2 }]);
  (s.stacks["에르핀"]["간식"] === 2) ? ok("간식 +2 가 쌓인다") : fail(`간식 ${JSON.stringify(s.stacks)}`);
}
{
  const { s, me, h } = board("에르핀");
  runFx(s, [{ k: "stack", id: "간식", v: 2 }], { owner: me, targetIdx: 0 }, { hurt() {}, draw() {}, addStatus() {}, cleanse() {}, trigger() {}, discard() {} });
  runFx(s, [{ k: "spend", id: "간식", v: "all" }], { owner: me, targetIdx: 0 }, { hurt() {}, draw() {}, addStatus() {}, cleanse() {}, trigger() {}, discard() {} });
  s.stacks["에르핀"]["간식"] === 0 ? ok("전부 소모하면 0 이 된다") : fail(`소모 후 ${s.stacks["에르핀"]["간식"]}`);
}
{
  // ifStack — 간식이 없으면 그 뒤가 안 돈다
  const { s } = run("에르핀", [{ k: "ifStack", id: "간식", v: 1 }, { k: "dmg", ratio: 1, target: "oneEnemy", hits: 1 }]);
  !s.dealt ? ok("조건이 거짓이면 뒤가 안 돈다") : fail(`조건이 거짓인데 ${s.dealt} 들어갔다`);
}

// ── 대상이 제자리에 가는가 ─────────────────────────────────────────────
// 전에는 카드 글 전체에서 대상을 찾아, 「무작위 적에게 … 자신 HP 회복」 이면 회복까지 적에게 갔다.
// 79군데가 그랬다 — 적을 회복시키고, 적에게 실드를 주고, 우리 파티를 때렸다.
console.log("");
console.log("대상");
{
  let wrong = 0;
  for (const c of Object.values(B.cards))
    for (const x of [c, ...(c.flash || [])])
      for (const f of x.fx || [])
        if (["heal", "block", "shield"].includes(f.k) && /Enem/.test(f.target || "")) wrong++;
  wrong === 0 ? ok("방어·실드·회복이 적에게 가지 않는다") : fail(`방어·실드·회복이 적에게 가는 효과 ${wrong}`);

  const pick = (ko) => Object.values(B.cards).find((c) => c.ko === ko);
  const want = [
    // 한 카드에 대상이 여럿 — 스킬 재구성 뒤의 마력 난타(docs/07-스킬구성.md)
    ["마력 난타", "takenMod", "self"], ["마력 난타", "dmg", "oneEnemy"],   // v3 — 한 놈에게 몰아친다(docs/14)
  ];
  for (const [ko, k, t] of want) {
    const c = pick(ko);
    const f = c && c.fx.find((x) => x.k === k);
    f && f.target === t ? ok(`${ko} — ${k} → ${t}`) : fail(`${ko} — ${k} 가 ${f && f.target} 로 간다 (${t} 여야 한다)`);
  }
}

// ── X 코스트 — 남은 AP 를 전부 쓰고 그만큼 때린다 ──────────────────────
console.log("");
console.log("X 코스트");
{
  const C = await import("../js/combat.js");
  const s = C.newCombat({ partyKeys: ["에르핀_왕도", "네르", "티그"], rows: {}, deck: [],
    enemyIds: ["fairymobcloserange", "fairymobcloserange"], seed: 5 });
  s.hand = ["에르핀_왕도_u0"]; s.ap = 3;
  const me = s.party[0];
  (s.stacks = s.stacks || {})[me.key] = { 왕마력: 2 };
  // 쓰러뜨리면 패시브가 AP 를 돌려준다 — 여기서는 「전부 쓰는가」 만 보려고 적을 단단하게
  for (const e of s.enemies) { e.maxHp = e.hp = 999; }
  let hits = 0;
  const orig = s.enemies.map((e) => e.hp);
  const r = C.playCard(s, 0, 0);
  const dealt = orig.reduce((a, v, i) => a + (v - Math.max(0, s.enemies[i].hp)), 0);
  r.ok ? ok("마력 난타를 낼 수 있다") : fail(`마력 난타를 못 낸다 (${r.why})`);
  s.ap === 0 ? ok("남은 AP 를 전부 쓴다") : fail(`AP 가 ${s.ap} 남았다`);
  // (AP 3 + 왕마력 2) = 5회 × 공격력 70%
  const one = Math.round(me.atk * 0.7);
  dealt >= one * 4 ? ok(`(AP+왕마력)회 때린다 — 준 피해 ${dealt} (한 대 ${one})`) : fail(`한두 번만 쳤다 — 준 피해 ${dealt}`);
  (me.mods || []).some((m) => m.stat === "taken" && m.v < 0) ? ok("받는 피해 감소는 자기에게") : fail("받는 피해 감소가 자기에게 안 들어왔다");
}

// ── 피해 미리보기 — 보여 준 값과 실제로 들어간 값이 같은가 ─────────────
// 미리보기는 판을 복사해 실제로 내 보는 것이다. 그래도 어긋나면 아무도 안 믿는다.
console.log("");
console.log("피해 미리보기");
{
  const C = await import("../js/combat.js");
  const heroes = ["에르핀_왕도", "네르", "티그"];
  let tried = 0, off = [];
  for (const id of Object.keys(B.cards)) {
    if (!heroes.some((h) => id.startsWith(h + "_"))) continue;
    for (const tgt of [0, 1, 2]) {
      const s = C.newCombat({ partyKeys: heroes, rows: {}, deck: [],
        enemyIds: ["fairymobcloserange", "elfsoldiercloserange", "gluttonbear"], seed: 11 });
      for (const u of s.party) u.crit = 0;                 // 치명타는 미리보기에서 뺀다
      s.enemies[0].block = 6; s.enemies[1].status["취약"] = 2; s.enemies[2].shield = 9;
      s.ap = 3; s.hand = [id];
      const c = C.cardOf(s, id);
      if (C.canPlay(s, id) || (c.fx || []).some((f) => f.target === "randomEnemy")) continue;
      const p = C.previewCard(s, 0, tgt);
      const before = s.enemies.map((e) => e.hp);
      C.playCard(s, 0, tgt);
      tried++;
      s.enemies.forEach((e, i) => {
        const real = before[i] - Math.max(0, e.hp);
        const shown = p && p[i] ? p[i].hp : 0;
        if (real !== shown) off.push(`${c.ko}→${i}: 보임 ${shown} · 실제 ${real}`);
      });
    }
  }
  off.length === 0 ? ok(`보여 준 값과 실제가 같다 (${tried}번 내 봄)`) : fail(`미리보기가 어긋난다 ${off.length}건 — ${off.slice(0, 3).join(" / ")}`);

  // 무작위 대상은 '최대' 로 — 그 적에게 전부 몰렸을 때
  // 무작위 적을 치는 고유 카드 하나를 고른다(기획서가 바뀌어도 시험이 깨지지 않게)
  const BC = B.cards;
  const rid = Object.keys(BC).find((id) => BC[id].unique && typeof BC[id].cost === "number" && BC[id].cost <= 3
    && (BC[id].fx || []).some((f) => f.k === "dmg" && f.target === "randomEnemy") && !(BC[id].fx || []).some((f) => /Ally|Allies/.test(f.target || "")));
  const s = C.newCombat({ partyKeys: [BC[rid].hero, ...heroes.filter((k) => k !== BC[rid].hero)].slice(0, 3), rows: {}, deck: [], enemyIds: ["fairymobcloserange", "fairymobcloserange"], seed: 5 });
  s.ap = 3; s.hand = [rid];
  const p = C.previewCard(s, 0, 0);
  p && p[0] && p[0].max && p[1] && p[1].max ? ok(`무작위 카드는 적마다 최대를 보인다 (${p[0].hp})`) : fail("무작위 카드의 미리보기가 없다");

  // 실드도 피해를 받아 낸다 — 전에는 쌓이기만 했다
  const s2 = C.newCombat({ partyKeys: heroes, rows: {}, deck: [], enemyIds: ["gluttonbear"], seed: 5 });
  for (const u of s2.party) u.crit = 0;
  s2.enemies[0].shield = 5; s2.ap = 3; s2.hand = ["네르_s0"];
  const hp0 = s2.enemies[0].hp;
  C.playCard(s2, 0, 0);
  s2.enemies[0].shield === 0 && hp0 - s2.enemies[0].hp > 0 ? ok(`실드가 먼저 깎인다 (체력 -${hp0 - s2.enemies[0].hp})`) : fail(`실드 ${s2.enemies[0].shield} · 체력 -${hp0 - s2.enemies[0].hp}`);

  // 앞의 적이 쓰러진 뒤 세 번째 적을 누르면 세 번째 적이 맞는다
  const s3 = C.newCombat({ partyKeys: heroes, rows: {}, deck: [], enemyIds: ["fairymobcloserange", "fairymobcloserange", "fairymobcloserange"], seed: 5 });
  s3.enemies[0].dead = true; s3.enemies[0].hp = 0; s3.ap = 3; s3.hand = ["네르_s0"];
  C.playCard(s3, 0, 2);
  s3.enemies[2].hp < s3.enemies[2].maxHp && s3.enemies[1].hp === s3.enemies[1].maxHp ? ok("고른 적이 맞는다 (앞의 적이 쓰러진 뒤에도)") : fail(`엉뚱한 적이 맞았다 (${s3.enemies[1].hp} / ${s3.enemies[2].hp})`);
}

// ── 적의 수 ────────────────────────────────────────────────────────────
console.log("");
console.log("적의 수");
{
  const C = await import("../js/combat.js");
  const { ENEMIES } = await import("../js/data/enemies.js");
  const tough = (s) => { for (const u of s.party) { u.maxHp = 1e6; u.hp = 1e6; } };
  const make = (ids) => { const s = C.newCombat({ partyKeys: ["네르", "티그", "에르핀_왕도"], rows: {}, deck: [], enemyIds: ids, seed: 7 }); tough(s); return s; };

  // 힘을 모으면 다음 턴에 예고한 수를 한다
  let s = make(["gluttonbear"]);
  const charge = ENEMIES.gluttonbear.intents.find((x) => x.t === "charge");
  s.enemies[0].intent = charge;
  C.endTurn(s);
  s.enemies[0].intent === charge.next ? ok(`힘을 모은 다음 턴엔 「${charge.next.say}」`) : fail(`예고한 수를 안 한다 (${s.enemies[0].intent && s.enemies[0].intent.say})`);

  // 봉인하면 모은 힘이 흩어진다
  s = make(["gluttonbear"]);
  s.enemies[0].intent = charge; s.enemies[0].sealed = true;
  C.endTurn(s);
  s.enemies[0].intent !== charge.next ? ok("봉인하면 모은 힘이 흩어진다") : fail("봉인해도 큰 수가 그대로 온다");

  // 체력이 떨어지면 수가 바뀐다
  s = make(["curburus"]);
  s.enemies[0].hp = 100;
  C.endTurn(s);
  const ph = ENEMIES.curburus.phase;
  s.enemies[0].phased && ph.intents.includes(s.enemies[0].intent) && s.log.some((l) => l.includes(ph.say))
    ? ok(`보스가 절반 아래에서 수를 바꾼다 — 「${ph.say}」`) : fail("보스의 수가 안 바뀐다");

  // 섞어 고르는 적 — 여러 수를 쓰고, 같은 종류를 세 번 잇지 않는다
  s = make(["fairymobcloserange", "wisps"]);
  for (let k = 0; k < 80 && !s.over; k++) { for (const e of s.enemies) { e.hp = e.maxHp; } C.endTurn(s); }
  let triple = 0, kinds = new Set();
  for (const e of s.enemies) {
    const h = e.hist || [];
    h.forEach((t, i) => { kinds.add(e.key + t); if (i >= 2 && h[i - 1] === t && h[i - 2] === t) triple++; });
  }
  triple === 0 ? ok("같은 종류를 세 번 잇지 않는다") : fail(`세 번 이었다 ${triple}번`);
  kinds.size >= 6 ? ok(`여러 수를 섞어 쓴다 (${kinds.size}가지)`) : fail(`수가 단조롭다 (${kinds.size}가지)`);

  // 모든 적의 수가 엔진이 아는 종류다
  const KNOWN = new Set(["attack", "back", "attackAll", "multi", "charge", "block", "guard", "heal", "buff", "debuff", "jam"]);
  const bad = [];
  for (const [k, e] of Object.entries(ENEMIES))
    for (const it of [...e.intents, ...(e.open ? [e.open] : []), ...((e.phase || {}).intents || []), ...((e.phase2 || {}).intents || [])])
      for (const x of [it, ...(it.next ? [it.next] : [])]) if (!KNOWN.has(x.t)) bad.push(`${k}:${x.t}`);
  bad.length === 0 ? ok("적의 수가 전부 엔진이 아는 종류다") : fail(`모르는 수 ${bad.join(", ")}`);
}

// ── 안 도는 조각을 세는가 ──────────────────────────────────────────────
console.log("");
console.log("안 도는 조각");
{
  const { s } = run("에르핀", [{ k: "costDelta", v: -1 }, { k: "없는조각" }]);
  s.pendingFx && s.pendingFx.costDelta === 1 ? ok("규칙만 있고 몸이 없는 조각을 센다") : fail("pendingFx 가 비었다");
  s.unknownFx && s.unknownFx["없는조각"] === 1 ? ok("모르는 조각을 센다") : fail("unknownFx 가 비었다");
}

// ── 전체에서 몇 %가 실제로 도는가 ──────────────────────────────────────
console.log("");
console.log("전체");
{
  const KNOWN = new Set(["ifStack", "targetLowest", "perStack", "dmg", "block", "shield", "heal", "draw", "ap", "gauge",
    "status", "strip", "cleanse", "invuln", "immune", "stack", "spend", "capStack", "trigger", "payHp", "payHpPct", "discard"]);
  let live = 0, pend = 0;
  for (const c of Object.values(B.cards)) for (const f of c.fx) (KNOWN.has(f.k) ? live++ : pend++);
  const pc = ((live / (live + pend)) * 100).toFixed(1);
  console.log(`  효과 조각 ${live + pend}개 중 ${live}개가 실제로 돈다 (${pc}%)`);
  live > pend ? ok("도는 쪽이 더 많다") : fail("안 도는 쪽이 더 많다");
}

console.log("");
console.log(bad ? `문제 ${bad}개` : "효과 실행기가 기획서대로 돈다");
process.exit(bad ? 1 : 0);
