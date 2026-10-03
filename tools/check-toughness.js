// 강인도 · 격파(카제나, rules.js TOUGH · docs/07 「강인도」) — 칸 수 · 약점 · 격파의 덤 · 회복 · 카드 키워드 · 저장.
//   node tools/check-toughness.js
// 카드는 판의 장부(s.book)에 시험용으로 세운다 — 사도 카드에는 아직 새 키워드가 없다(다음 단계)
import * as C from "../js/combat.js";
import * as R from "../js/rules.js";
import { ENEMIES } from "../js/data/enemies.js";
import { parseEffect } from "../js/effects.js";
import { packCombat, unpackCombat } from "../js/save.js";
import B from "../js/data/built.js";

let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "실패"} ${what}`); if (!ok) bad++; };

// 광기 적(약점 냉정)에 냉정 사도 · 순수 사도를 세운다 — 순수는 광기에 진다(약점 아님)
const FOE = "buseuleogi";                       // 부스러기 — 광기 · 패시브는 동료가 쓰러질 때뿐(시험을 흐리지 않는다)
const heroOf = (n) => Object.keys(B.heroes).find((k) => C.natureOf(k) === n && B.starter[k]);
const WEAK_H = heroOf("냉정"), PLAIN_H = heroOf("순수");
const party = [WEAK_H, PLAIN_H, heroOf("우울")];

function mk(opt = {}) {
  const s = C.newCombat({ partyKeys: party, deck: [], enemyIds: opt.foes || [FOE], seed: 11, elite: opt.elite });
  for (const u of s.party) { u.crit = 0; u.hp = u.maxHp = 9999; }
  for (const e of s.enemies) { e.hp = e.maxHp = 5000; e.intent = { t: "block", v: 0, say: "시험 — 가만히", rush: 0 }; }
  s.ap = 50;
  return s;
}
let nCard = 0;
// 시험 카드 — 손에 넣고 그 자리 번호를 돌려준다
function card(s, hero, text, extra = {}) {
  const id = `시험카드${++nCard}`;
  const { fx } = parseEffect(text);
  s.book[id] = { id, name: `시험 ${nCard}`, ko: `시험 ${nCard}`, cost: 1, type: "공격", hero, built: true, target: "적", text, fx, ...extra };
  s.hand.push(id);
  return s.hand.length - 1;
}
const play = (s, hero, text, t = 0, extra) => { const i = card(s, hero, text, extra); const r = C.playCard(s, i, t); if (!r.ok) throw new Error(r.why); return r; };
const lost = (e, f) => { const h0 = e.hp, b0 = e.block; f(); return h0 - e.hp + (b0 - e.block); };

console.log(`칸 수 · 약점 (적 ${ENEMIES[FOE].ko}, 약점 사도 ${WEAK_H} · 아닌 사도 ${PLAIN_H})`);
{
  const s = mk();
  check(s.enemies[0].toughMax === R.TOUGH.fight && s.enemies[0].tough === R.TOUGH.fight, `보통 적 ${s.enemies[0].toughMax}칸`);
  check(mk({ elite: true }).enemies[0].toughMax === R.TOUGH.elite, `엘리트 ${R.TOUGH.elite}칸`);
  const boss = Object.keys(ENEMIES).find((k) => ENEMIES[k].boss && !ENEMIES[k].tough);
  check(C.toughOf(boss) === R.TOUGH.boss, `보스(${ENEMIES[boss].ko}) ${R.TOUGH.boss}칸`);
  const over = Object.keys(ENEMIES).find((k) => ENEMIES[k].tough);
  check(over && C.toughOf(over) === ENEMIES[over].tough, `적마다 칸 수를 바꾼다(${over ? ENEMIES[over].ko + " " + ENEMIES[over].tough : "-"}칸)`);
  check(JSON.stringify(C.weakOf(FOE)) === JSON.stringify(["냉정"]), `광기 적의 약점은 상성에서 냉정 (${C.weakOf(FOE).join(" · ")})`);
  const nur = Object.keys(ENEMIES).find((k) => !ENEMIES[k].nature && ENEMIES[k].weak);
  check(nur && C.weakOf(nur).length > 0, `성격 없는 적은 적어 둔 약점 (${nur ? ENEMIES[nur].ko + " " + C.weakOf(nur).join(" · ") : "-"})`);
  check(Object.keys(ENEMIES).every((k) => C.weakOf(k).length > 0), "모든 적에게 약점이 하나 이상");
}

console.log("");
console.log("약점 · 아닌 타격");
{
  const s = mk(), e = s.enemies[0];
  play(s, PLAIN_H, "적 1명에게 공격력 100% 피해");
  check(e.tough === R.TOUGH.fight - R.TOUGH.hit, `약점 아닌 공격 카드 — 강인도 -${R.TOUGH.hit} (${e.tough})`);
  const t0 = e.tough;
  play(s, PLAIN_H, "적 1명에게 4회 × 공격력 30% 피해");
  check(e.tough === t0 - R.TOUGH.hit, "여러 번 치는 카드도 한 장에 한 번만 깎는다");
  const s2 = mk(), e2 = s2.enemies[0];
  play(s2, WEAK_H, "적 1명에게 공격력 100% 피해");
  check(e2.tough === R.TOUGH.fight - R.TOUGH.hit - R.TOUGH.weak, `약점 공격 카드 — 강인도 -${R.TOUGH.hit + R.TOUGH.weak} (${e2.tough})`);
  // 약점이면 피해도 상성 유리만큼
  const s3 = mk(), s4 = mk();
  const dw = lost(s3.enemies[0], () => play(s3, WEAK_H, "적 1명에게 공격력 200% 피해"));
  const s5 = mk(); const wk = s5.party.find((u) => u.key === WEAK_H);
  s4.party.find((u) => u.key === PLAIN_H).atk = wk.atk;
  const dp = lost(s4.enemies[0], () => play(s4, PLAIN_H, "적 1명에게 공격력 200% 피해"));
  check(dw > dp, `약점 공격은 피해가 더 들어간다 (${dw} > ${dp}, 순수는 광기에 져서 -5%)`);
  const s6 = mk(), e6 = s6.enemies[0];
  play(s6, PLAIN_H, "적 1명에게 공격력 50% 피해, 방어력 100% 방어", 0, { type: "스킬" });
  check(e6.tough === R.TOUGH.fight - R.TOUGH.hit, "스킬 카드라도 피해를 주면 깎는다");
  const s7 = mk(), e7 = s7.enemies[0];
  play(s7, PLAIN_H, "방어력 100% 방어", 0, { type: "스킬" });
  check(e7.tough === R.TOUGH.fight, "피해 없는 카드는 안 깎는다");
}

console.log("");
console.log("격파 — AP +1 · 즉시 행동 늦춤 · 덤 피해 없음");
{
  const s = mk(), e = s.enemies[0];
  e.intent = { t: "attack", v: 1, say: "시험 — 친다", rush: 9 };
  play(s, WEAK_H, "적 1명에게 공격력 10% 피해");
  check(!e.broken && e.tough === 1, "두 칸 깎인 뒤 아직 서 있다");
  const ap0 = s.ap, rc0 = e.rushCnt || 0;
  play(s, WEAK_H, "적 1명에게 공격력 10% 피해");
  check(e.broken && e.tough === 0, "0 칸 — 격파");
  check(s.ap === ap0 - 1 + R.TOUGH.ap, `파티 AP +${R.TOUGH.ap} (카드 값 1 을 내고 ${ap0} → ${s.ap})`);
  check((e.rushCnt || 0) === rc0 + 1 - R.TOUGH.delay, `즉시 행동 셈이 ${R.TOUGH.delay}장 늦춰진다 (카드 한 장에 +1, 격파 -1 → ${e.rushCnt})`);
  check(s.log.some((l) => l.includes("격파!")), "기록에 「격파!」");
  const t0 = e.tough;
  play(s, WEAK_H, "적 1명에게 공격력 10% 피해");
  check(e.tough === t0 && e.broken, "격파된 적은 더 안 깎인다");
  // 격파 자체에는 덤 피해가 없다(카제나 — 2026-10 사용자). 덤은 잔불 · 잔광 · 파괴에서만
  const a = mk(), b = mk();
  b.enemies[0].broken = true; b.enemies[0].tough = 0;
  const da = lost(a.enemies[0], () => play(a, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const db = lost(b.enemies[0], () => play(b, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  check(da === db, `격파된 적도 받는 피해는 그대로 (${da} → ${db})`);
}

console.log("");
console.log("회복");
{
  const s = mk(), e = s.enemies[0];
  e.tough = 1;
  play(s, WEAK_H, "적 1명에게 공격력 10% 피해");
  check(e.broken, "격파");
  C.endTurn(s);
  check(!e.broken && e.tough === e.toughMax, `다음 내 턴 시작에 다 찬다 (${e.tough}/${e.toughMax})`);
  const s2 = mk(), e2 = s2.enemies[0];
  play(s2, PLAIN_H, "적 1명에게 공격력 10% 피해");
  C.endTurn(s2);
  check(e2.tough === e2.toughMax - R.TOUGH.hit, "덜 깎인 칸은 턴이 바뀌어도 그대로");
  // 보스 판이 바뀌면 다 찬다
  const boss = Object.keys(ENEMIES).find((k) => ENEMIES[k].boss && ENEMIES[k].phase && ENEMIES[k].phase.at);
  const sb = mk({ foes: [boss] }), eb = sb.enemies[0];
  eb.tough = 1;
  play(sb, WEAK_H, "적 1명에게 공격력 10% 피해, 강인도 피해 3");
  check(eb.broken, `보스(${eb.ko}) 격파`);
  eb.hp = Math.floor(eb.maxHp * ENEMIES[boss].phase.at) - 1;
  C.endTurn(sb);
  check(eb.phased && !eb.broken && eb.tough === eb.toughMax, "보스의 판이 바뀌면 강인도가 다 찬다");
}

console.log("");
console.log("적의 차례에 격파 — AP 는 다음 턴으로");
{
  const s = mk(), e = s.enemies[0];
  e.tough = 1;
  // 적의 차례에 격파하는 길(가시 · 반격 패시브)을 흉내 — 적의 차례 깃발만 세우고 카드로 깎는다
  s.foeTurn = true;
  const ap0 = s.ap;
  play(s, PLAIN_H, "적 1명에게 공격력 10% 피해");
  check(e.broken && s.ap === ap0 - 1 && s.apCarry === R.TOUGH.ap, `적의 차례에 얻은 AP 는 쌓아 둔다 (apCarry ${s.apCarry})`);
  s.foeTurn = false;
  C.endTurn(s);
  check(s.ap === R.AP_PER_TURN + R.TOUGH.ap, `다음 턴 AP ${R.AP_PER_TURN} + ${R.TOUGH.ap} (${s.ap})`);
}

console.log("");
console.log("카드 키워드 — 분쇄 · 잔불(상태) · 파괴 · 약점 · 강인도 피해");
{
  // 분쇄 — 방어 · 실드가 있는 적에게 +20%
  const a = mk(), b = mk();
  a.enemies[0].block = 30; b.enemies[0].block = 30;
  const da = lost(a.enemies[0], () => play(a, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const db = lost(b.enemies[0], () => play(b, PLAIN_H, "분쇄. 적 1명에게 공격력 300% 피해"));
  check(Math.abs(db - Math.round(da * (1 + R.STATUS_V.분쇄))) <= 1, `분쇄 — 방어가 있는 적에게 +${Math.round(R.STATUS_V.분쇄 * 100)}% (${da} → ${db})`);
  const c = mk(), d = mk();
  const dc = lost(c.enemies[0], () => play(c, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const dd = lost(d.enemies[0], () => play(d, PLAIN_H, "분쇄. 적 1명에게 공격력 300% 피해"));
  check(dc === dd, "분쇄 — 방어 · 실드가 없으면 그대로");
  // 잔불(v6 — 적에게 쌓는 상태) — 격파된 적을 치면 겹마다 +30%, 그때 다 사라진다. 이 카드가 먼저 건 잔불도 같은 카드 피해에 붙는다
  const e = mk(), f = mk();
  for (const x of [e, f]) { x.enemies[0].broken = true; x.enemies[0].tough = 0; }
  const de = lost(e.enemies[0], () => play(e, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const df = lost(f.enemies[0], () => play(f, PLAIN_H, "적 1명 잔불 2, 적 1명에게 공격력 300% 피해"));
  check(Math.abs(df - Math.round(de * (1 + 2 * R.STATUS_V.잔불))) <= 1 && !(f.enemies[0].status || {}).잔불, `잔불 2 — 격파된 적에게 +${Math.round(2 * R.STATUS_V.잔불 * 100)}% 후 사라진다 (${de} → ${df})`);
  const g = mk(), h = mk();
  const dg = lost(g.enemies[0], () => play(g, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const dh = lost(h.enemies[0], () => play(h, PLAIN_H, "적 1명 잔불 2, 적 1명에게 공격력 300% 피해"));
  check(dg === dh && (h.enemies[0].status || {}).잔불 === 2, "잔불 — 격파 전에는 그대로, 겹은 남는다");
  // 파괴(v6 카제나) — 대상이 처치된 상태일 때만. 격파만으로는 안 돈다
  const p = mk(), ap0 = p.ap;
  play(p, PLAIN_H, "적 1명에게 공격력 10% 피해. 파괴: AP +2");
  check(p.ap === ap0 - 1, "파괴 — 살아 있는 적이면 안 돈다");
  const q = mk(); q.enemies[0].tough = 1; const ap1 = q.ap;
  play(q, PLAIN_H, "적 1명에게 공격력 10% 피해. 파괴: AP +2");
  check(q.ap === ap1 - 1 + R.TOUGH.ap, `파괴 — 격파만 시켰으면 안 돈다 (AP ${ap1} → ${q.ap})`);
  const k = mk({ foes: [FOE, FOE] }); k.enemies[0].hp = 1; const ap2 = k.ap;
  play(k, PLAIN_H, "적 1명에게 공격력 10% 피해. 파괴: AP +2");
  check(k.enemies[0].dead && k.ap === ap2 - 1 + R.KILL_AP + 2, `파괴 — 이 카드로 처치했으면 돈다 (AP ${ap2} → ${k.ap})`);
  // 약점 — 성격과 상관없이 약점 공격
  const w = mk(), we = w.enemies[0];
  play(w, PLAIN_H, "약점. 적 1명에게 공격력 10% 피해");
  check(we.tough === R.TOUGH.fight - R.TOUGH.hit - R.TOUGH.weak, `약점 — 약점 아닌 사도도 강인도 -${R.TOUGH.hit + R.TOUGH.weak}`);
  const w1 = mk(), w2 = mk();
  const d1 = lost(w1.enemies[0], () => play(w1, PLAIN_H, "적 1명에게 공격력 300% 피해"));
  const d2 = lost(w2.enemies[0], () => play(w2, PLAIN_H, "약점. 적 1명에게 공격력 300% 피해"));
  check(d2 > d1, `약점 — 피해도 상성 유리만큼 (${d1} → ${d2})`);
  // 강인도 피해 N — 피해 없이도 깎는다
  const t = mk(), te = t.enemies[0];
  play(t, PLAIN_H, "적 1명에게 강인도 피해 2", 0, { type: "스킬" });
  check(te.tough === R.TOUGH.fight - 2, `강인도 피해 2 — ${te.tough}칸`);
  const all = mk({ foes: [FOE, FOE] });
  play(all, PLAIN_H, "적 전체에 공격력 10% 피해");
  check(all.enemies.every((x) => x.tough === R.TOUGH.fight - R.TOUGH.hit), "광역 카드는 맞은 적마다 깎는다");
}

console.log("");
console.log("미리보기 · 저절로 내는 카드 · 저장");
{
  const s = mk(), e = s.enemies[0];
  e.tough = 2;
  const i = card(s, WEAK_H, "적 1명에게 공격력 100% 피해");
  const pv = C.previewCard(s, i, 0);
  check(pv && pv[0] && pv[0].tough === 2 && pv[0].brk, `미리보기에 강인도 -${pv && pv[0] && pv[0].tough} · 격파`);
  check(e.tough === 2 && !e.broken, "미리보기는 판을 안 바꾼다");
  // 손에서 저절로 — 다음 단계(연계 · 천상)가 쓸 고리. 시험 태그 하나를 「격파」 에 걸어 본다
  C.HAND_AUTO.시험 = "break";
  const s2 = mk(), e2 = s2.enemies[0];
  e2.tough = 1;
  card(s2, PLAIN_H, "적 1명에게 공격력 10% 피해. 시험", { fx: [{ k: "dmg", ratio: 0.1, target: "oneEnemy", hits: 1 }, { k: "tag", id: "시험" }] });
  const ap0 = s2.ap;
  play(s2, WEAK_H, "적 1명에게 공격력 10% 피해");
  check(s2.hand.length === 0 && s2.ap === ap0 - 1 + R.TOUGH.ap, "격파하자 손의 카드가 비용 없이 저절로 나간다");
  delete C.HAND_AUTO.시험;
  // 저장 — 강인도 · 격파가 이어하기에 남는다
  const s3 = mk({ foes: [FOE, FOE] });
  s3.enemies[0].tough = 0; s3.enemies[0].broken = true; s3.enemies[1].tough = 2; s3.apCarry = 1;
  const back = unpackCombat(packCombat(s3));
  check(back.enemies[0].broken && back.enemies[0].tough === 0 && back.enemies[1].tough === 2 && back.enemies[1].toughMax === R.TOUGH.fight && back.apCarry === 1,
    "저장했다 이어도 강인도 · 격파 · 쌓아 둔 AP 가 그대로");
}

console.log("");
console.log("카드 글 읽기");
{
  const want = [
    ["분쇄. 적 1명에게 공격력 100% 피해", ["tag:분쇄", "dmg"]],
    ["적 1명 잔불 1, 적 1명에게 공격력 100% 피해", ["status", "dmg"]],
    ["약점. 적 전체에 공격력 50% 피해", ["tag:약점", "dmg"]],
    ["적 1명에게 공격력 100% 피해, 강인도 피해 2", ["dmg", "tough"]],
    ["적 1명에게 공격력 100% 피해. 파괴: 드로우 1", ["dmg", "ifBroken", "draw"]],
    ["적 1명의 방어·실드 전부 파괴 후 공격력 400% 피해", ["strip", "dmg"]],
  ];
  for (const [t, ks] of want) {
    const { fx, left } = parseEffect(t);
    const got = fx.map((f) => (f.k === "tag" ? `tag:${f.id}` : f.k));
    check(!left && JSON.stringify(got) === JSON.stringify(ks), `${t} → ${got.join(" · ")}${left ? ` (못 읽음: ${left})` : ""}`);
  }
}

console.log(bad ? `실패 ${bad}개` : "강인도 · 격파가 규칙대로 돈다");
process.exit(bad ? 1 : 0);
