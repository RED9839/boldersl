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
import { CARDS, kitOf, HERO_DATA, NEUTRAL_IDS } from "../js/cardbook.js";
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
  check(per > 0 && Math.abs(statMod(s, me, "dealt") - per) < 1e-9, `「간식」 1개당 주는 피해 +${per * 100}% (${statMod(s, me, "dealt")})`);
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
  // 리뉴얼(docs/11) 뒤: 시그니처 「계시」 +2 에, 네르가 카드를 낸 턴 패시브 「세계수의 이름으로!」 가 +1 을 더한다
  // 시그니처가 주는 「계시」 수와 그 턴 파티 버프는 카드 글에서 읽는다(수치를 손볼 때마다 시험이 깨지지 않게)
  const sig = CARDS[reveal];
  const give = (sig.fx || []).filter((f) => f.k === "stack" && f.id === "계시").reduce((a, f) => a + f.v, 0);
  const extra = (sig.fx || []).filter((f) => f.k === "dealtMod" && f.target === "allAllies").reduce((a, f) => a + f.v, 0);
  const rev = tig.status["계시"] || 0;
  check(rev === Math.min(4, give + 1), `「세계수의 계시」 + 패시브 — 아군 전원에게 「계시」 (티그 ${rev}, 카드 +${give} · 패시브 +1)`);
  check(Math.abs(statMod(s, tig, "dealt") - (0.10 * rev + extra)) < 1e-9, `「계시」 1개당 주는 피해 +10% (${statMod(s, tig, "dealt").toFixed(2)})`);
  // 계시는 적의 차례가 끝나면 하나 준다
  endTurn(s);
  check((tig.status["계시"] || 0) === rev - 1, `「계시」 는 적의 차례가 끝나면 1 감소 (${tig.status["계시"] || 0})`);
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
  // 교주 카드의 회복은 회복력이 가장 높은 아군 기준 — 공격력이 높은 딜러가 아니다
  const nid = NEUTRAL_IDS.find((id) => CARDS[id] && CARDS[id].fx.length === 1 && CARDS[id].fx[0].k === "heal");
  const sup = keys.find((x) => HERO_DATA[x].role === "서포터" && healStat(HERO_DATA[x].atk, "서포터") > HERO_DATA[dealer].atk);
  if (nid && sup) {
    const s = newCombat({ partyKeys: [dealer, sup], rows: {}, deck: [dealer, sup].flatMap(kit), enemyIds: ["gluttonbear"], seed: 3 });
    for (const u of s.party) u.hp = 1;
    s.hand.unshift(nid); s.ap = 5;
    const f = CARDS[nid].fx[0];
    const pv = previewAllies(s, 0, 0);
    const h0 = s.party[0].hp;
    playCard(s, 0, 0);
    const real = s.party[0].hp - h0;
    const want = Math.max(1, Math.round(healStat(s.party[1].atk, "서포터") * f.ratio));
    check(real === want && pv && pv[0] && pv[0].heal === real, `교주 「${CARDS[nid].name}」 — 회복력 높은 ${HERO_DATA[sup].ko} 기준 ${real} (기대 ${want})`);
  } else fail("교주 회복 카드 · 서포터를 못 찾았다");
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
