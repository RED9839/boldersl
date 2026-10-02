// 패시브와 사도 전용 키워드가 **전투에서 실제로 도는지** 본다.
//
//   node tools/check-passive.js            본보기 검사 + 135명 훑기
//   node tools/check-passive.js --quick    본보기 검사만
//
// 글로만 있고 아무 일도 안 하는 패시브가 다시 생기지 않게 하려고 있다.
// 훑기는 사도마다 여덟 장 전부(시작 4 + 고유 4)를 넣고 자동으로 몇 판 싸워서,
//   - 전투가 터지지 않는가(예외)
//   - 패시브 규칙이 한 번이라도 발동하는가
// 를 센다. 드문 조건(HP 50% 이하·아군이 쓰러지면)은 안 떠도 경고만 한다.
import { newCombat, endTurn, playCard, canPlay, useUlt, canUlt, cardOf, previewUlt, previewAllies } from "../js/combat.js";
import { CARDS, kitOf, HERO_DATA, NEUTRAL_IDS, EQUIP } from "../js/cardbook.js";
import { statsOf } from "../js/run.js";
import { healStat, HEAL_BONUS } from "../js/rules.js";
import { parsePassive, statMod } from "../js/passive.js";
import fs from "node:fs";
import { DESIGN_DOC } from "./lib/paths.js";

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const fail = (m) => { console.log("  실패 " + m); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));

const kit = (k) => { const x = kitOf(k); return [...x.start, ...x.unique].map((c) => c.id); };
const fight = (party, enemies = ["gluttonbear", "fairymobcloserange"], seed = 3) =>
  newCombat({ partyKeys: party, rows: {}, deck: party.flatMap(kit), enemyIds: enemies, seed });
const tough = (s) => { for (const e of s.enemies) { e.maxHp = e.hp = 5000; } };
const idOf = (hero, ko) => Object.keys(CARDS).find((id) => CARDS[id].hero === hero && CARDS[id].name === ko);
const play = (s, id, t = 0) => { s.hand.unshift(id); s.ap = Math.max(s.ap, 3); return playCard(s, 0, t); };

if (!HERO_DATA["에르핀"] || !/와구와구/.test(HERO_DATA["에르핀"].passive || "")) {
  console.log("본보기(에르핀·네르)가 새 글이 아니다 — node tools/merge-redesign.js 후 parse-design·build-cards 를 먼저 돌린다");
}

console.log("본보기 — 에르핀");
{
  const s = fight(["에르핀", "네르", "티그"]); tough(s);
  const shot = idOf("에르핀", "마력탄");
  const stack = () => ((s.stacks || {})["에르핀"] || {})["간식"] || 0;
  for (let i = 0; i < 3; i++) play(s, shot);
  check(stack() === 1, `공격 카드 세 장마다 「간식」 +1 (지금 ${stack()})`);
  check(s.log.some((l) => l.includes("에르핀 · 와구와구")), "발동하면 기록에 이름이 남는다");
  const me = s.party.find((u) => u.key === "에르핀");
  // 1개당 수치는 기획서에서 읽는다(리뉴얼로 바뀐다)
  const per = +((/「간식」[^\n]*?1개당[^\n]*?주는 피해 \+(\d+)%/.exec(fs.readFileSync(DESIGN_DOC, "utf8")) || [])[1] || 0) / 100;
  // 다른 아군이 건 것(네르의 「계시」 — 턴 시작 시 아군 전원)은 빼고 「간식」 하나의 몫만 본다
  const snack1 = statMod(s, me, "dealt"); s.stacks["에르핀"]["간식"] = 0; const snack0 = statMod(s, me, "dealt"); s.stacks["에르핀"]["간식"] = 1;
  check(per > 0 && Math.abs(snack1 - snack0 - per) < 1e-9, `「간식」 1개당 주는 피해 +${per * 100}% (${(snack1 - snack0).toFixed(2)})`);
  // 셋이 되면 먹는다
  const cake = idOf("에르핀", "친구 몰래 케이크");
  s.ap = 3; const ap0 = s.ap; const hand0 = s.hand.length;
  play(s, cake);          // 간식 1 + 케이크 2 = 3 → 먹는다
  check(stack() === 0, `「간식」 3개가 되면 전부 먹는다 (지금 ${stack()})`);
  check(s.log.some((l) => l.includes("에르핀 · 간식")), "먹을 때 키워드 규칙이 기록에 남는다");
  // 항상 — 아군 전원 받는 피해 -5%
  const ner = s.party.find((u) => u.key === "네르");
  // 「순수 케이크 공격」 — 턴 시작 시 「간식」이 있으면 그 턴 아군 전원 받는 피해 -10% (늘 켜진 % 는 없앴다)
  s.stacks["에르핀"]["간식"] = 1; endTurn(s);
  check(statMod(s, ner, "taken") <= -0.1 + 1e-9, `「순수 케이크 공격」 — 간식을 챙긴 턴엔 아군 전원 받는 피해 -10% (${statMod(s, ner, "taken").toFixed(2)})`);
}

console.log("");
console.log("본보기 — 네르");
{
  const s = fight(["에르핀", "네르", "티그"]); tough(s);
  const reveal = idOf("네르", "세계수의 계시");
  play(s, reveal);
  const tig = s.party.find((u) => u.key === "티그");
  // 리뉴얼(docs/11) 뒤: 시그니처 「계시」 에, 패시브 「세계수의 이름으로!」 가 턴 시작 시 +1 을 더한다(턴당 제한을 없애며 카드마다 → 턴 시작 시)
  // 시그니처가 주는 「계시」 수와 그 턴 파티 버프는 카드 글에서 읽는다(수치를 손볼 때마다 시험이 깨지지 않게)
  const sig = CARDS[reveal];
  const give = (sig.fx || []).filter((f) => f.k === "stack" && f.id === "계시").reduce((a, f) => a + f.v, 0);
  const extra = (sig.fx || []).filter((f) => f.k === "dealtMod" && f.target === "allAllies").reduce((a, f) => a + f.v, 0);
  const rev = tig.status["계시"] || 0;
  check(rev === Math.min(4, give + 1), `「세계수의 계시」 + 패시브 — 아군 전원에게 「계시」 (티그 ${rev}, 카드 +${give} · 패시브 +1)`);
  check(Math.abs(statMod(s, tig, "dealt") - (0.10 * rev + extra)) < 1e-9, `「계시」 1개당 주는 피해 +10% (${statMod(s, tig, "dealt").toFixed(2)})`);
  // 계시는 적의 차례가 끝나면 하나 준다 — 그리고 새 턴 시작에 패시브가 하나 더한다
  endTurn(s);
  check((tig.status["계시"] || 0) === Math.min(4, rev - 1 + 1), `「계시」 는 적의 차례가 끝나면 1 감소, 턴 시작 시 +1 (${tig.status["계시"] || 0})`);
  // 맞으면 걱정한다
  check(s.log.some((l) => l.includes("네르 · 여왕님 걱정")), "아군이 맞으면 「여왕님 걱정」 이 방어를 준다");
  // 도발 — 적이 네르만 친다
  const s2 = fight(["에르핀", "네르", "티그"], ["fairymoblongrange"]); tough(s2);
  for (const u of s2.party) { u.maxHp = u.hp = 999; }
  play(s2, idOf("네르", "여왕님께 손대지 마세요!"));
  s2.enemies[0].intent = { t: "back", v: 7, say: "뒤로 파고든다" };
  endTurn(s2);
  // 방어가 막아 체력이 안 깎일 수 있다 — 누구를 노렸는지는 기록으로 본다
  const line = s2.log.find((l) => l.includes("뒤로 파고든다 →")) || "";
  check(/→ 네르/.test(line), `도발 — 뒷줄을 노리던 적도 네르를 친다 (${line})`);
  // 무적은 적의 차례까지 간다
  const s3 = fight(["에르핀", "네르", "티그"], ["fairymobcloserange"]); tough(s3);
  const nerU = s3.party.find((u) => u.key === "네르");
  const awake = Object.keys(CARDS).find((id) => CARDS[id].hero === "네르" && CARDS[id].name === "여왕님께 손대지 마세요!");
  s3.book = s3.book || {};
  const inv = { ...CARDS[awake], fx: [{ k: "invuln", target: "self" }, { k: "status", id: "도발", v: 1, turns: 1, target: "self" }] };
  s3.book[awake] = inv;
  play(s3, awake);
  s3.enemies[0].intent = { t: "attack", v: 30, say: "달려든다" };
  const hp0 = nerU.hp;
  endTurn(s3);
  check(nerU.hp === hp0, `무적은 적의 차례까지 막는다 (${hp0} → ${nerU.hp})`);
}

console.log("");
console.log("고학년 스킬");
{
  const s = fight(["에르핀", "네르", "티그"]); tough(s);
  s.gauge = 300;
  const hp = s.enemies.map((e) => e.hp);
  const pv = previewUlt(s, "에르핀", 0);
  const r = useUlt(s, "에르핀", 0);
  // 끌어 올린 동안 보이는 피해 미리보기(fight-screen paintPreview) — 실제로 깎인 만큼과 같다
  check(pv && s.enemies.every((e, i) => pv[i] && pv[i].hp === Math.min(hp[i], hp[i] - Math.max(0, e.hp))), `고학년 스킬 피해 미리보기가 실제와 같다 (${pv && pv.map((x) => x && x.hp)} / ${s.enemies.map((e, i) => hp[i] - Math.max(0, e.hp))})`);
  check(r.ok, `에르핀 고학년 스킬을 쓴다 (${r.why || "ok"})`);
  check(s.enemies.every((e, i) => e.hp < hp[i]), "고학년 스킬이 적 전체를 친다 — 전에는 게이지만 먹었다");
  check(s.party.find((u) => u.key === "에르핀").invuln === true, "고학년 스킬의 무적이 걸린다");
}

console.log("");
console.log("보스와 기절");
{
  const s = fight(["에르핀", "네르", "티그"], ["curburus"]); tough(s);
  const boss = s.enemies[0];
  const stun = { k: "status", id: "기절", v: 1, turns: 1, target: "oneEnemy" };
  const me = s.party[0];
  const run = () => { s.book = s.book || {}; const id = Object.keys(CARDS).find((x) => CARDS[x].hero === "에르핀"); s.book[id] = { ...CARDS[id], fx: [stun] }; play(s, id); };
  run();
  check(boss.sealed === true, "보스도 기절한다");
  endTurn(s);
  run();
  check(!boss.sealed, "보스는 기절한 다음 턴에는 버틴다");
  endTurn(s); run();
  check(boss.sealed === true, "한 턴 쉬면 다시 기절한다");
}

console.log("");
console.log("카드 태그");
{
  const s = fight(["에르핀", "네르", "티그"]); tough(s);
  const id = idOf("에르핀", "친구 몰래 케이크");
  s.book = s.book || {};
  s.book[id] = { ...CARDS[id], flashOn: 2, fx: [...CARDS[id].fx, { k: "tag", id: "보존" }] };
  s.hand = [id]; endTurn(s);
  check(s.hand.includes(id), "보존 — 턴이 끝나도 손에 남는다");
  const s2 = fight(["에르핀", "네르", "티그"]); tough(s2);
  s2.book = { [id]: { ...CARDS[id], flashOn: 5, fx: [...CARDS[id].fx, { k: "tag", id: "소멸" }] } };
  play(s2, id);
  check(s2.gone.includes(id) && !s2.discard.includes(id), "소멸 — 내면 이 전투에서 사라진다");
}

console.log("");
console.log("회복력 — 회복은 공격력이 아니라 회복력(공격력 + 역할 몫)으로 센다");
{
  check(healStat(8, "서포터") === 8 + HEAL_BONUS.서포터 && healStat(8, "탱커") === 8 + HEAL_BONUS.탱커 && healStat(13, "딜러") === 13,
    `회복력 = 공격력 + 역할 몫 (서포터 +${HEAL_BONUS.서포터} · 탱커 +${HEAL_BONUS.탱커} · 딜러 0)`);
  // 사도마다 「아군 1명 HP 회복」 한 줄짜리 카드를 내 본다 — 실제 회복 = 회복력 × 배율, 미리보기 = 실제
  const keys = Object.keys(HERO_DATA);
  const dealer = keys.find((x) => HERO_DATA[x].role === "딜러");
  let n = 0;
  const off = [], pvOff = [];
  for (const k of keys) {
    const c = [...kitOf(k).start, ...kitOf(k).unique].find((x) => x.fx.length === 1 && x.fx[0].k === "heal" && x.fx[0].target === "oneAlly");
    if (!c || k === dealer) continue;
    const s = newCombat({ partyKeys: [k, dealer], rows: {}, deck: [k, dealer].flatMap(kit), enemyIds: ["gluttonbear"], seed: 3 });
    for (const u of s.party) u.hp = 1;
    s.hand.unshift(c.id); s.ap = 5;
    const o = s.party[0];
    const want = Math.max(1, Math.round(healStat(Math.max(1, Math.round(o.atk * (1 + statMod(s, o, "atk")))), o.role) * c.fx[0].ratio));
    const pv = previewAllies(s, 0, 1);
    const h0 = s.party[1].hp;
    playCard(s, 0, 1);
    const real = s.party[1].hp - h0;
    n++;
    if (real !== want) off.push(`${HERO_DATA[k].ko} ${real}≠${want}`);
    if (!pv || !pv[1] || pv[1].heal !== real) pvOff.push(`${HERO_DATA[k].ko} 미리보기 ${pv && pv[1] ? pv[1].heal : "-"} · 실제 ${real}`);
  }
  check(n >= 20 && !off.length, `회복 카드 ${n}장 — 실제 회복 = 회복력 × 배율${off.length ? " · 어긋남 " + off.slice(0, 4).join(", ") : ""}`);
  check(n >= 20 && !pvOff.length, `회복 카드 ${n}장 — 미리보기 = 실제${pvOff.length ? " · 어긋남 " + pvOff.slice(0, 4).join(", ") : ""}`);
  // 교주 카드는 사도 스탯을 빌리지 않는다(2026-10) — 피해 · 방어 · 실드 · 회복 조각이 기본에도 신탁에도 없다
  const STATFX = ["dmg", "block", "shield", "heal"];
  const statty = NEUTRAL_IDS.filter((id) => [CARDS[id].fx, ...(CARDS[id].flash || []).map((f) => f.fx || [])].some((fx) => fx.some((f) => STATFX.includes(f.k))));
  check(NEUTRAL_IDS.length === 43 && !statty.length, `교주 카드 ${NEUTRAL_IDS.length}장 — 스탯 % 효과 없음${statty.length ? " · 남은 것 " + statty.map((id) => CARDS[id].name).join(", ") : ""}`);
  // 「회복력 +N%」 교주 카드 — 사도의 회복이 그만큼 커진다. 「다음 카드 코스트 -1」 — 다음 카드가 1 싸진다
  const nid = NEUTRAL_IDS.find((id) => CARDS[id].name === "효율적인 회복");
  const sup = keys.find((x) => HERO_DATA[x].role === "서포터" && [...kitOf(x).start, ...kitOf(x).unique].some((c) => c.fx.length === 1 && c.fx[0].k === "heal" && c.fx[0].target === "oneAlly" && c.cost === 1));
  if (nid && sup) {
    const hc = [...kitOf(sup).start, ...kitOf(sup).unique].find((c) => c.fx.length === 1 && c.fx[0].k === "heal" && c.fx[0].target === "oneAlly" && c.cost === 1);
    const s = newCombat({ partyKeys: [sup, dealer], rows: {}, deck: [sup, dealer].flatMap(kit), enemyIds: ["gluttonbear"], seed: 3 });
    for (const u of s.party) u.hp = 1;
    s.hand.unshift(nid, hc.id); s.ap = 5;
    const o = s.party[0];
    const before = Math.max(1, Math.round(healStat(Math.max(1, Math.round(o.atk * (1 + statMod(s, o, "atk")))), o.role) * hc.fx[0].ratio));
    playCard(s, 0, 0);
    const ap1 = s.ap, h0 = s.party[1].hp;
    playCard(s, 0, 1);
    const real = s.party[1].hp - h0;
    check(ap1 - s.ap === 0 && real > before, `교주 「효율적인 회복」 — 다음 카드 0코(${ap1 - s.ap} AP) · 회복 ${before} → ${real}`);
  } else fail("교주 「효율적인 회복」 · 1코 회복 카드 서포터를 못 찾았다");
  // 장비 스탯 줄 「회복력 +N」 — 공격력은 그대로, 회복만 커진다
  const healer = keys.find((x) => HERO_DATA[x].role === "서포터" && [...kitOf(x).start, ...kitOf(x).unique].some((c) => c.fx.length === 1 && c.fx[0].k === "heal" && c.fx[0].target === "oneAlly"));
  const hc = [...kitOf(healer).start, ...kitOf(healer).unique].find((c) => c.fx.length === 1 && c.fx[0].k === "heal" && c.fx[0].target === "oneAlly");
  const healed = (gear) => {
    const s = newCombat({ partyKeys: [healer, dealer], rows: {}, deck: [healer, dealer].flatMap(kit), enemyIds: ["gluttonbear"], seed: 3, gear });
    for (const u of s.party) u.hp = 1;
    s.hand.unshift(hc.id); s.ap = 5;
    const h0 = s.party[1].hp; playCard(s, 0, 1);
    return { s, v: s.party[1].hp - h0 };
  };
  const plain = healed(null), geared = healed({ [healer]: { atk: 0, def: 0, crit: 0, heal: 6 } });
  const o = geared.s.party[0];
  const wantG = Math.max(1, Math.round(healStat(Math.max(1, Math.round(o.atk * (1 + statMod(geared.s, o, "atk")))), o.role, 6) * hc.fx[0].ratio));
  check(geared.v === wantG && geared.v > plain.v && o.atk === plain.s.party[0].atk, `장비 회복력 +6 — ${HERO_DATA[healer].ko} 회복 ${plain.v} → ${geared.v} (기대 ${wantG}), 공격력은 그대로`);
  const pend = Object.keys(EQUIP).find((id) => EQUIP[id].ko === "치유의 펜던트");
  check(pend && EQUIP[pend].stats.heal === 6 && statsOf(pend, healer).heal === 6, `「치유의 펜던트」 스탯 줄 회복력 +6 을 읽는다 (${pend && EQUIP[pend].stats.heal})`);
  // 「회복력 +N%」 증감 — 교주 「효율적인 회복」(2턴간 아군 전원 회복력 +30%) 이 파티 전원에게 붙는다
  const eid = NEUTRAL_IDS.find((id) => CARDS[id] && CARDS[id].name === "효율적인 회복");
  if (eid) {
    const s = newCombat({ partyKeys: [dealer, healer], rows: {}, deck: [dealer, healer].flatMap(kit), enemyIds: ["gluttonbear"], seed: 3 });
    s.hand.unshift(eid); s.ap = 5;
    const hm = CARDS[eid].fx.find((f) => f.k === "healMod");
    playCard(s, 0, 0);
    check(hm && s.party.every((u) => Math.abs(statMod(s, u, "heal") - hm.v) < 1e-9), `「효율적인 회복」 — 회복력 +${Math.round((hm ? hm.v : 0) * 100)}% 가 아군 전원에게 붙는다`);
  } else fail("교주 「효율적인 회복」 을 못 찾았다");
}

console.log("");
console.log("장수 기준 — 그 사도 것만(「에르핀의 …」) · 파티 전체(「파티가 …」)");
{
  const rs = (t) => parsePassive("시험: " + t, ["간식"])[0];
  const a = rs("에르핀의 공격 카드를 3장 낼 때마다 「간식」 +1");
  check(a.when.every === 3 && a.when.type === "공격" && a.when.by === "에르핀" && a.when.who !== "any" && !a.left, "「에르핀의 공격 카드를 3장 낼 때마다」 → 에르핀 것만 3장마다");
  const b = rs("파티가 공격 카드를 2장 낼 때마다 드로우 1 (턴당 1회)");
  check(b.when.every === 2 && b.when.who === "any" && !b.left, "「파티가 공격 카드를 2장 낼 때마다」 → 누구 것이든");
  const c = rs("파티가 이번 턴 카드를 3장째 낼 때 드로우 1");
  const c0 = rs("한 턴에 카드를 3장째 낼 때 드로우 1");
  check(c.when.nth === 3 && c.when.who === "any" && c0.when.nth === 3 && !c.left && !c0.left, "「파티가 이번 턴 카드를 3장째 낼 때」 · 옛 「한 턴에 …」 둘 다 읽는다");
  const d = rs("턴 종료 시 파티가 이번 턴 카드를 3장 이상 냈으면 드로우 1");
  const d0 = rs("턴 종료 시 이번 턴 카드를 3장 이상 냈으면 드로우 1");
  check(d.conds[0].c === "playedMin" && d0.conds[0].c === "playedMin" && !d.left && !d0.left, "「파티가 이번 턴 카드를 N장 이상 냈으면」 · 옛 글 둘 다 읽는다");
  const e = rs("실비아의 1코 이상 스킬 카드를 한 턴에 2장 낼 때마다 AP +1 (턴당 1회)");
  check(e.when.every === 2 && e.when.perTurn && e.when.minCost === 1 && e.when.type === "스킬" && !e.left, "「실비아의 1코 이상 스킬 카드를 한 턴에 2장」 → 그 턴 안에서 · 1코 이상");
  const g = rs("자신의 카드를 2장 낼 때마다 방어력 100% 방어");
  check(g.when.every === 2 && g.when.by === "자신" && !g.left, "장비 「자신의 카드를 2장 낼 때마다」 → 낀 사도 것");
  // 실제로 — 에르핀의 「와구와구」 는 다른 아군의 공격 카드를 세지 않는다
  const s = fight(["에르핀", "네르", "티그"]); tough(s);
  const tigShot = kitOf("티그").start.find((x) => x.type === "공격");
  for (let i = 0; i < 3; i++) play(s, tigShot.id);
  check(!(((s.stacks || {})["에르핀"] || {})["간식"]), "티그의 공격 카드 세 장 — 에르핀의 「간식」 은 그대로 0");
}

console.log("");
console.log("새 언제 · 조건 — 시험 장비 줄로 하나씩 켜 본다");
{
  // 시험 줄을 장비 효과(gearFx)로 붙인다 — 「자신 HP 회복(회복력 50%)」 이 됐는지로 켜짐을 본다. 적은 아무것도 못 한다
  const who = "란", mate = "비비";
  const setup = (rule, prep) => {
    const s = newCombat({ partyKeys: [who, mate], rows: {}, deck: [who, mate].flatMap(kit), enemyIds: ["gluttonbear", "fairymobcloserange"], seed: 5, gearFx: { [who]: "시험: " + rule } });
    tough(s);
    for (const e of s.enemies) { e.intent = null; e.sealed = true; }
    const me = s.party[0]; me.maxHp = 500; me.hp = 100;
    if (prep) prep(s, me);
    return { s, me };
  };
  const heals = (rule, prep, act) => { const { s, me } = setup(rule, prep); const h0 = me.hp; act(s, me); return me.hp > h0; };
  const H = "자신 HP 회복(회복력 50%)";
  const endT = (s) => { for (const e of s.enemies) { e.intent = null; e.sealed = true; } endTurn(s); };
  const ranCard = kitOf(who).start.find((x) => x.type === "공격").id;
  const mateCard = kitOf(mate).start[0].id;
  // 시그니처 카드를 내면
  const sig = kitOf(who).unique.find((x) => x.signature), non = kitOf(who).unique.find((x) => !x.signature);
  check(heals(`시그니처 카드를 내면 ${H}`, null, (s) => play(s, sig.id)) && !heals(`시그니처 카드를 내면 ${H}`, null, (s) => play(s, non.id)), "「시그니처 카드를 내면」 — 시그니처만");
  // 방어나 실드를 얻으면 · 아군이 …
  const guardCard = kitOf(who).start.find((x) => x.fx.some((f) => f.k === "block"));
  check(heals(`방어나 실드를 얻으면 ${H} (턴당 1회)`, null, (s) => play(s, guardCard.id)) && !heals(`방어나 실드를 얻으면 ${H} (턴당 1회)`, null, (s) => play(s, ranCard)), "「방어나 실드를 얻으면」 — 방어가 붙을 때");
  const mateGuard = kitOf(mate).start.find((x) => x.fx.some((f) => f.k === "block"));
  check(heals(`아군이 방어나 실드를 얻으면 ${H} (턴당 1회)`, null, (s) => play(s, mateGuard.id)) && !heals(`방어나 실드를 얻으면 ${H} (턴당 1회)`, null, (s) => play(s, mateGuard.id)), "「아군이 방어나 실드를 얻으면」 — 다른 아군에게 붙어도");
  // 이번 턴 자신의 카드를 내지 않았으면
  const own = `턴 종료 시 이번 턴 자신의 카드를 내지 않았으면 ${H}`;
  check(heals(own, null, (s) => { play(s, mateCard); endT(s); }) && !heals(own, null, (s) => { play(s, ranCard); endT(s); }), "「이번 턴 자신의 카드를 내지 않았으면」 — 다른 아군 카드는 안 센다");
  // AP가 남았으면
  const apl = `턴 종료 시 AP가 남았으면 ${H}`;
  check(heals(apl, (s) => { s.ap = 2; }, endT) && !heals(apl, (s) => { s.ap = 0; }, endT), "「AP가 남았으면」 — 쓰지 않은 AP");
  // 고학년 게이지가 N% 이상이면
  const gg = `턴 종료 시 고학년 게이지가 100% 이상이면 ${H}`;
  check(heals(gg, (s) => { s.gauge = 120; }, endT) && !heals(gg, (s) => { s.gauge = 40; }, endT), "「고학년 게이지가 100% 이상이면」");
  // 실드가 있으면 · 방어나 실드가 있으면
  const sh = `턴 종료 시 실드가 있으면 ${H}`;
  check(heals(sh, (s, me) => { me.shield = 5; }, endT) && !heals(sh, (s, me) => { me.block = 5; }, endT), "「실드가 있으면」 — 방어는 안 친다");
  // HP가 N% 이상이면
  const hm = `턴 종료 시 HP가 70% 이상이면 ${H}`;
  check(heals(hm, (s, me) => { me.hp = 400; }, endT) && !heals(hm, (s, me) => { me.hp = 100; }, endT), "「HP가 70% 이상이면」");
  // 적이 N명뿐이면
  const fm = `턴 종료 시 적이 1명뿐이면 ${H}`;
  check(heals(fm, (s) => { s.enemies[1].dead = true; s.enemies[1].hp = 0; }, endT) && !heals(fm, null, endT), "「적이 1명뿐이면」");
  // 적이 즉시 행동했으면
  const rd = `턴 종료 시 적이 즉시 행동했으면 ${H}`;
  check(heals(rd, (s) => { s.rushedThisTurn = true; }, endT) && !heals(rd, null, endT), "「적이 즉시 행동했으면」 — 이번 턴 당겨진 적이 있으면");
  // 파티가 이번 턴 카드를 N장 이상 냈으면 — 누구 카드든 센다
  const pm = `턴 종료 시 파티가 이번 턴 카드를 2장 이상 냈으면 ${H}`;
  check(heals(pm, null, (s) => { play(s, mateCard); play(s, mateCard); endT(s); }) && !heals(pm, null, (s) => { play(s, mateCard); endT(s); }), "「파티가 이번 턴 카드를 2장 이상 냈으면」 — 다른 아군 카드도 센다");
  // 파티가 공격 카드를 N장 낼 때마다 — 누가 냈든
  const mateAtk = kitOf(mate).start.find((x) => x.type === "공격");
  if (mateAtk) check(heals(`파티가 공격 카드를 2장 낼 때마다 ${H}`, null, (s) => { play(s, mateAtk.id); play(s, ranCard); }) && !heals(`란의 공격 카드를 2장 낼 때마다 ${H}`, null, (s) => { play(s, mateAtk.id); play(s, ranCard); }), "「파티가 공격 카드를 2장」 은 아군 것도 · 「란의 …」 는 란 것만");
}

console.log("");
console.log("폭주 검사 — 턴당 횟수 제한이 없다. 거센 턴(AP +3, 손에 든 것을 다 낸다)에도 패시브가 끝없이 돌지 않는가");
{
  // 사도마다 세 편성 × 8턴. 패시브가 한 턴에 준 것(combat.js passiveGain — 패시브가 부른 패시브는 맨 바깥 사도 몫)을 본다.
  // 한도: AP +2 · 드로우 3 · 피해 공격력의 15배(1500%). 적은 맞아도 쓰러지지 않게 둔다(처치 연쇄 말고 고리만 본다)
  const keys = Object.keys(HERO_DATA);
  const kit2 = (k) => { const x = kitOf(k); return [...x.start, ...x.unique, ...x.unique].map((c) => c.id); };
  const over = { ap: [], draw: [], dmg: [] };
  const worst = { ap: 0, draw: 0, dmg: 0 };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    for (let n = 0; n < 3; n++) {
      const party = [k, keys[(i + 1 + n * 7) % keys.length], keys[(i + 50 + n * 13) % keys.length]].filter((x, j, a) => a.indexOf(x) === j);
      const s = newCombat({ partyKeys: party, rows: {}, deck: party.flatMap(kit2), enemyIds: ["gluttonbear", "fairymobcloserange", "fairymobcloserange"], seed: 7 + n });
      for (const e of s.enemies) e.maxHp = e.hp = 99999;
      for (let t = 0; t < 8 && !s.over; t++) {
        s.ap += 3;
        let g = 0;
        while (!s.over && g++ < 40) { const x = s.hand.findIndex((id) => !canPlay(s, id)); if (x < 0) break; if (!playCard(s, x, (s.enemies.find((e) => !e.dead) || {}).idx || 0).ok) break; }
        for (const u of s.party) if (!canUlt(s, u.key)) useUlt(s, u.key, 0);
        endTurn(s);
      }
      const me = s.party[0];
      for (const [key, v] of Object.entries(s.passiveGain || {})) {
        if (!key.startsWith(k + "|")) continue;
        const dm = v.dmg / me.atk;
        worst.ap = Math.max(worst.ap, v.ap); worst.draw = Math.max(worst.draw, v.draw); worst.dmg = Math.max(worst.dmg, dm);
        if (v.ap > 2) over.ap.push(`${HERO_DATA[k].ko} ${v.ap}`);
        if (v.draw > 3) over.draw.push(`${HERO_DATA[k].ko} ${v.draw}`);
        if (dm > 15) over.dmg.push(`${HERO_DATA[k].ko} ${Math.round(dm * 100)}%`);
      }
    }
  }
  const uniq = (a) => [...new Set(a)].slice(0, 6).join(", ");
  check(!over.ap.length, `패시브 AP — 한 턴에 +2 까지 (가장 많이 +${worst.ap})${over.ap.length ? " · 넘음 " + uniq(over.ap) : ""}`);
  check(!over.draw.length, `패시브 드로우 — 한 턴에 3장까지 (가장 많이 ${worst.draw})${over.draw.length ? " · 넘음 " + uniq(over.draw) : ""}`);
  check(!over.dmg.length, `패시브 피해 — 한 턴에 공격력의 15배까지 (가장 많이 ${Math.round(worst.dmg * 100)}%)${over.dmg.length ? " · 넘음 " + uniq(over.dmg) : ""}`);
  // 규칙이 제 효과로 다시 돌지 않는다 — 「적에게 디버프를 걸면 … 약화」 는 디버프 카드 한 장에 한 번만
  // 적 전체에 상태를 거는 카드를 가진 사도 하나로 본다
  const isDeb = (x) => x.fx.some((f) => f.k === "status" && f.id !== "도발" && f.target === "allEnemies");
  const dk = keys.find((x) => [...kitOf(x).start, ...kitOf(x).unique].some(isDeb));
  const deb = [...kitOf(dk).start, ...kitOf(dk).unique].find(isDeb);
  const s = newCombat({ partyKeys: [dk, "비비"], rows: {}, deck: [dk, "비비"].flatMap(kit), enemyIds: ["gluttonbear", "fairymobcloserange"], seed: 3,
    gearFx: { [dk]: "시험: 적에게 디버프를 걸면 적 전체 약화 1턴, 무작위 적 공격력 10% 피해" } });
  tough(s);
  const fired = () => s.log.filter((l) => l.includes(`${HERO_DATA[dk].ko} · 시험`)).length;
  const n0 = fired(); play(s, deb.id);
  check(fired() - n0 === 1, `${HERO_DATA[dk].ko} 「${deb.name}」 한 장 — 적이 둘이어도 「디버프를 걸면」 한 번, 제 약화로 다시 돌지 않는다 (${fired() - n0}번)`);
}

if (process.argv.includes("--quick")) done();

// ── 135명 훑기 ─────────────────────────────────────────────────────────
console.log("");
console.log("135명 훑기 — 여덟 장 전부 넣고 자동으로 싸운다");
{
  const keys = Object.keys(HERO_DATA);
  const RARE = new Set(["lowHp", "allyDown", "ult", "debuff"]);
  let crashed = 0;
  const silent = [], rare = [];
  const ENEMY_SETS = [["gluttonbear", "fairymobcloserange", "ginseng"], ["elfsoldiercloserange", "drones"], ["curburus"]];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const mates = [keys[(i + 37) % keys.length], keys[(i + 71) % keys.length]].filter((x) => x !== k);
    const rules = parsePassive(HERO_DATA[k].passive || "", HERO_DATA[k].keyword ? [HERO_DATA[k].keyword.ko] : []);
    const fired = new Set();
    for (let n = 0; n < 6; n++) {
      try {
        const s = newCombat({ partyKeys: [k, ...mates], rows: {}, deck: [k, ...mates].flatMap(kit), enemyIds: ENEMY_SETS[n % 3], seed: 11 + n * 7 });
        let t = 0;
        while (!s.over && t++ < 25) {
          let g = 0;
          while (!s.over && g++ < 30) {
            const i2 = s.hand.findIndex((id) => !canPlay(s, id));
            if (i2 < 0) break;
            const e = s.enemies.find((x) => !x.dead);
            if (!playCard(s, i2, e ? e.idx : 0).ok) break;
          }
          for (const u of s.party) if (!canUlt(s, u.key)) useUlt(s, u.key, 0);
          endTurn(s);
        }
        for (const l of s.log) {
          const m = l.match(/^(.+?) · (.+)$/);
          if (m && m[1] === HERO_DATA[k].ko) fired.add(m[2]);
        }
      } catch (e) {
        crashed++;
        if (crashed <= 5) console.log(`  ! ${k}: ${e.message.split("\n")[0]}`);
        break;
      }
    }
    for (const r of rules) {
      if (r.when.on === "always" || fired.has(r.name)) continue;
      (RARE.has(r.when.on) ? rare : silent).push(`${HERO_DATA[k].ko} 「${r.name}」`);
    }
  }
  check(!crashed, crashed ? `전투가 터진 사도 ${crashed}` : `${keys.length}명 모두 전투가 터지지 않는다`);
  const uniqSilent = [...new Set(silent)];
  console.log(`  참고 한 번도 발동하지 않은 패시브 ${uniqSilent.length}개${uniqSilent.length ? ": " + uniqSilent.slice(0, 12).join(", ") + (uniqSilent.length > 12 ? " …" : "") : ""}`);
  if (rare.length) console.log(`  참고 드문 조건이라 안 떴을 수 있는 것 ${rare.length}개`);
}

done();
function done() {
  console.log("");
  console.log(fails ? `실패 ${fails}` : "패시브가 전투에서 돈다");
  process.exit(fails ? 1 : 0);
}
