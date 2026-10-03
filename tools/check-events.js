// 이벤트가 문서대로 도는지 본다(docs/08-이벤트.md · js/data/events.js · js/events.js).
//
//   node tools/check-events.js
//
//   - 결과 낱말이 모두 읽히는가 — 못 읽은 말은 조용히 무시된다
//   - 나오는 사도 · 선택지를 여는 사도 · 전투의 적이 실제로 있는가
//   - 56종의 선택지 **전부**를 실제 판 상태에서 끝까지 골라 본다(고를 것은 첫 번째로) — 터지지 않는가, 결과가 적용되는가
//   - 이벤트 칸이 층마다 1~2개, 한 판에 같은 이벤트가 두 번 안 나오는가
import { EVENTS, CURSES } from "../js/data/events.js";
import * as EV from "../js/events.js";
import { newRun } from "../js/run.js";
import { HERO_DATA, CARDS } from "../js/cardbook.js";
import { ENEMIES, FLOORS } from "../js/data/enemies.js";
import { newCombat, playCard, endTurn, hasTag } from "../js/combat.js";

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const fail = (m) => { console.log("  실패 " + m); fails++; };
const check = (c, m) => (c ? ok(m) : fail(m));
const byKo = (ko) => Object.keys(HERO_DATA).find((k) => HERO_DATA[k].ko === ko);

console.log("결과 낱말");
{
  const bad = [];
  for (const ev of EVENTS) for (const o of ev.options) {
    const outs = [o.out, o.price && o.price.out, o.fight && o.fight.win, ...(o.gamble || []).map((g) => g.out),
      ...((o.fight && o.fight.winGamble) || []).map((g) => g.out), o.judge && o.judge.pass, o.judge && o.judge.fail, ev.leaveOut].filter(Boolean);
    for (const t of outs) for (const op of EV.parseOut(t)) if (op.k === "unknown") bad.push(`${ev.id} 「${op.text}」`);
  }
  check(!bad.length, bad.length ? `못 읽은 결과 ${bad.length}: ${bad.slice(0, 6).join(", ")}` : "모든 결과 낱말이 읽힌다");
}

console.log("");
console.log("나오는 것");
{
  // C3 「주말농장에서 온 편지」 는 뺐다 — 파티 HP 하나라 쓰러지는 사도가 없다(docs/16 §8)
  check(EVENTS.length === 56, `이벤트 ${EVENTS.length}종 (문서: 56)`);
  const pools = { 공용: 0, 0: 0, 1: 0, 2: 0 };
  for (const ev of EVENTS) pools[ev.pool]++;
  check(pools.공용 === 11 && pools[0] === 15 && pools[1] === 15 && pools[2] === 15, `풀 — 공용 ${pools.공용} · 에르피엔 ${pools[0]} · 모나티엄 ${pools[1]} · 벨리티엔 ${pools[2]}`);
  const names = new Set();
  // 사도가 아닌 인물(겨우살이 — js/ui.js NPC_ART)은 기획서 이름이 아니다
  const NOT_HERO = new Set(["겨우살이"]);
  for (const ev of EVENTS) {
    if (ev.npc && !NOT_HERO.has(ev.npc)) names.add(ev.npc);
    for (const o of ev.options) for (const h of [].concat(o.hero || [])) names.add(h);
    for (const o of ev.options) if (o.price) names.add(o.price.hero);
  }
  const missing = [...names].filter((n) => !byKo(n));
  check(!missing.length, missing.length ? `기획서에 없는 사도: ${missing.join(", ")}` : `나오는 사도 ${names.size}명이 모두 기획서에 있다`);
  const foes = new Set();
  // 이벤트 전투의 적 — 층 이벤트는 배열, 공용은 { 층: [...] } 일 수 있다(C9). 층마다 나오는 적 묶음으로 편다
  const fightsOf = (ev, o) => Array.isArray(o.fight.enemies) ? [[ev.pool, o.fight.enemies]] : Object.entries(o.fight.enemies).map(([f, l]) => [Number(f), l]);
  for (const ev of EVENTS) for (const o of ev.options) if (o.fight) for (const [, l] of fightsOf(ev, o)) l.forEach((e) => foes.add(e));
  const noFoe = [...foes].filter((e) => !ENEMIES[e]);
  check(!noFoe.length, noFoe.length ? `없는 적: ${noFoe.join(", ")}` : `이벤트 전투의 적 ${foes.size}종이 모두 있다`);
  // 그 땅의 적만 — 층 이벤트의 전투는 그 층 지도(일반 · 엘리트 · 보스)에 나오는 적으로, 공용 이벤트는 층마다 적을 따로 적는다
  const floorFoes = FLOORS.map((F) => new Set([...F.pools.flat(2), ...F.elites.flat(), ...F.boss]));
  const offFloor = [];
  for (const ev of EVENTS) for (const o of ev.options) if (o.fight) {
    if (ev.pool === "공용" && Array.isArray(o.fight.enemies)) { offFloor.push(`${ev.id} 공용인데 층마다 적을 안 나눴다`); continue; }
    for (const [f, l] of fightsOf(ev, o)) for (const e of l) if (!floorFoes[f] || !floorFoes[f].has(e)) offFloor.push(`${ev.id} ${e}(${f + 1}층 아님)`);
  }
  if (EVENTS.some((ev) => ev.pool === "공용" && ev.options.some((o) => o.fight && !Array.isArray(o.fight.enemies) && FLOORS.some((_, f) => !o.fight.enemies[f]))))
    offFloor.push("공용 이벤트 전투에 적이 빠진 층이 있다");
  check(!offFloor.length, offFloor.length ? `다른 땅의 적: ${offFloor.join(", ")}` : "이벤트 전투의 적이 모두 그 층(공용은 층마다) 땅의 것이다");
  // 무대 — 56종 모두 세울 그림이 있다(사도 · 겨우살이 · 그 땅의 적). 적은 그 층(공용은 어느 층에나 있는 것) 땅의 것
  const bare = EVENTS.filter((ev) => !ev.npc && !ev.foe).map((ev) => ev.id);
  check(!bare.length, bare.length ? `무대에 세울 인물이 없는 이벤트: ${bare.join(", ")}` : "56종 모두 무대에 세울 인물(사도 · 겨우살이 · 그 땅의 적)이 있다");
  const badFoe = EVENTS.filter((ev) => ev.foe && (!ENEMIES[ev.foe] || (ev.pool === "공용" ? !floorFoes.every((F) => F.has(ev.foe)) : !floorFoes[ev.pool].has(ev.foe)))).map((ev) => `${ev.id} ${ev.foe}`);
  check(!badFoe.length, badFoe.length ? `무대의 적이 없거나 다른 땅의 것: ${badFoe.join(", ")}` : "무대에 세운 적이 모두 그 층 땅의 것이다");
  check(EVENTS.every((ev) => ev.npc !== "쓰러진 사도" && ev.cond !== "fallen"), "쓰러진 사도를 세우는 이벤트가 없다 — 파티 HP 하나(docs/16 §8)");
  const races = new Set(Object.values(HERO_DATA).map((h) => h.race));
  const badRace = EVENTS.flatMap((ev) => ev.options.filter((o) => o.race && !races.has(o.race)).map((o) => o.race));
  check(!badRace.length, badRace.length ? `없는 종족: ${badRace.join(", ")}` : "종족 조건이 실제 종족 이름이다");
  const leaves = EVENTS.every((ev) => EV.optionsOf(newRun(["네르", "티그", "에르핀"], {}, 1), ev).slice(-1)[0].leave);
  check(leaves, "모든 이벤트에 대가 없이 떠나는 선택지가 있다");
  for (const [ko, c] of Object.entries(CURSES)) check(CARDS[c.id] && CARDS[c.id].curse, `골칫거리 「${ko}」 가 장부에 있다`);
}

console.log("");
console.log("선택지 전부 골라 보기");
{
  // 선택지를 여는 사도가 들어간 파티로 — 조건이 없는 선택지는 기본 파티로
  const partyFor = (o) => {
    const keys = ["네르", "티그", "에르핀"];
    if (o.hero) keys[0] = byKo([].concat(o.hero)[0]);
    if (o.price) keys[1] = byKo(o.price.hero);
    if (o.race) keys[0] = Object.keys(HERO_DATA).find((k) => HERO_DATA[k].race === o.race);
    return [...new Set(keys)].filter(Boolean).concat(["마요", "엘레나"]).slice(0, 3);
  };
  let tried = 0, crashed = [], stuck = [];
  for (const ev of EVENTS) {
    for (let oi = 0; oi < ev.options.length + 1; oi++) {
      const probe = ev.options[oi] || { leave: true };
      for (let seed = 1; seed <= 3; seed++) {
        try {
          const run = newRun(partyFor(probe), {}, seed * 97 + oi);
          run.gold = 500;
          run.floor = ev.pool === "공용" ? seed - 1 : ev.pool;     // 공용은 세 층에서 한 번씩 — 층마다 적이 다른 전투(C9)
          // 조건 맞추기 — 파티 HP 30% 이하 · 고유 카드(신탁 대상)
          if (probe.when === "hp30") run.partyHp = Math.floor(run.partyMaxHp * 0.25);
          const uni = Object.keys(CARDS).find((id) => CARDS[id].hero === run.party[0] && CARDS[id].unique);
          if (uni) run.deck.push(uni);
          run.event = { key: "t", choices: [ev.id], id: ev.id, phase: "choose", log: [], pending: [] };
          const opts = EV.optionsOf(run, ev);
          const idx = probe.leave ? opts.length - 1 : opts.indexOf(opts.find((o) => o.label === probe.label));
          if (idx < 0) { stuck.push(`${ev.id} 「${probe.label}」 이 안 보인다`); break; }
          const gold0 = run.gold, deck0 = run.deck.length;
          const r = EV.choose(run, idx);
          if (r.why) { stuck.push(`${ev.id} 「${probe.label}」: ${r.why}`); break; }
          if (r.fight) EV.afterEventFight(run, true);
          let guard = 0;
          while (run.event.pending.length && guard++ < 10) {
            const p = run.event.pending[0];
            const v = p.k === "remove" ? run.deck[0] : p.k === "dupe" ? run.deck.find((id) => EV.dupeOk(id, run))
              : p.k === "card" ? p.cards[0] : p.k === "flash" ? p.offer.picks[0]
              : p.k === "pickHero" || p.k === "judgePick" ? run.party[0]
              : p.k === "gambleChoice" ? p.options[0] : p.k === "shinPick" ? EV.shinAble(run, p.kind)[0] : p.k === "shinKind" ? p.options[0] : null;
            const w = EV.resolve(run, v);
            if (w) { stuck.push(`${ev.id} 「${probe.label}」 고르기(${p.k}): ${w}`); break; }
          }
          if (run.event.pending.length) stuck.push(`${ev.id} 「${probe.label}」 고를 것이 안 끝난다`);
          if (run.event.log.some((l) => l.includes("읽지 못한"))) stuck.push(`${ev.id} 「${probe.label}」 읽지 못한 결과`);
          tried++;
        } catch (e) { crashed.push(`${ev.id} 「${probe.label || "떠납니다"}」: ${e.message}`); break; }
      }
    }
  }
  check(!crashed.length, crashed.length ? `터진 선택지 ${crashed.length}: ${crashed.slice(0, 4).join(" / ")}` : `선택지 ${tried}번 골라 봤는데 터지지 않는다`);
  check(!stuck.length, stuck.length ? `막힌 선택지 ${stuck.length}: ${stuck.slice(0, 5).join(" / ")}` : "골라야 할 것이 모두 풀린다");
}

console.log("");
console.log("결과가 적용되는가");
{
  const run = newRun(["네르", "티그", "에르핀"], {}, 7);
  run.gold = 500;
  const g0 = run.gold, d0 = run.deck.length;
  run.event = { key: "t", choices: [], id: "C1", phase: "result", log: [], pending: [] };
  EV.apply(run, EV.parseOut("골드 -120 · 장비 (희귀) · HP -10% · 최대 HP +4 · 골칫거리 「밀린 잡일」"));
  check(run.gold === g0 - 120, `골드 -120 (${g0} → ${run.gold})`);
  check(run.bag.length === 1, `받은 장비가 끼기 or 팔기를 기다린다 (${run.bag.length})`);
  check(run.deck.length === d0 + 1 && run.deck.includes("골칫거리_밀린잡일"), "골칫거리가 덱에");
  const cur = CARDS["골칫거리_밀린잡일"];
  check(hasTag(cur, "소멸") && !cur.fx.length, "골칫거리는 효과 없이 소멸한다");
  // 다음 전투 효과
  EV.apply(run, EV.parseOut("다음 전투: 첫 턴 AP +1 · 다음 전투: 게이지 +50% · 다음 전투: 첫 손패 +2"));
  const next = EV.takeNextFight(run);
  const s = newCombat({ partyKeys: run.party, rows: {}, deck: run.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3, next });
  const base = newCombat({ partyKeys: run.party, rows: {}, deck: run.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3 });
  check(s.ap === base.ap + 1, `다음 전투 첫 턴 AP +1 (${base.ap} → ${s.ap})`);
  check(s.gauge === base.gauge + 50, `다음 전투 게이지 +50% (${s.gauge})`);
  check(s.hand.length === Math.min(10, base.hand.length + 2) || s.draw.length + s.hand.length === base.draw.length + base.hand.length, `다음 전투 첫 손패 +2 (${base.hand.length} → ${s.hand.length})`);
  check(!run.nextFight, "다음 전투 효과는 한 번 쓰면 사라진다");
  // 한 번짜리 파티 버프 — 「다음 전투: 파티 불굴 2」 는 다음 전투 하나에만 걸고 시작한다
  EV.apply(run, EV.parseOut("다음 전투: 파티 불굴 2"));
  const nb = EV.takeNextFight(run);
  const sb = newCombat({ partyKeys: run.party, rows: {}, deck: run.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3, next: nb });
  const sb2 = newCombat({ partyKeys: run.party, rows: {}, deck: run.deck.slice(), enemyIds: ["fairymobcloserange"], seed: 3, next: EV.takeNextFight(run) });
  check((sb.pool.status.불굴 || 0) - (base.pool.status.불굴 || 0) === 2 && (sb2.pool.status.불굴 || 0) === (base.pool.status.불굴 || 0), `다음 전투: 파티 불굴 2 — 그 전투만 (${sb.pool.status.불굴 || 0} · 다음 ${sb2.pool.status.불굴 || 0})`);
  // 기적 — 붙은 카드는 피해 ×1.3
  const id = run.deck.find((x) => CARDS[x] && CARDS[x].type === "공격" && CARDS[x].hero);
  const hit = (shin) => {
    const c = newCombat({ partyKeys: run.party, rows: {}, deck: [], enemyIds: ["gluttonbear"], seed: 5, shin: shin ? { [id]: true } : {} });
    for (const u of c.party) u.crit = 0;
    c.hand = [id]; c.ap = 3;
    const e = c.enemies[0]; e.hp = e.maxHp = 999;
    playCard(c, 0, 0);
    return 999 - e.hp;
  };
  const a = hit(false), b = hit(true);
  check(b > a && Math.abs(b / a - 1.3) < 0.12, `기적 — 피해 ×1.3 (${a} → ${b})`);
}

console.log("");
console.log("이벤트 칸");
{
  let per = { 1: 0, 2: 0 }, dup = 0;
  // 게임은 현재 시각을 씨앗으로 쓴다 — 작은 씨앗(1, 2, 3…)은 난수 첫 값이 한쪽으로 쏠려 분포를 못 잰다
  for (let seed = 1; seed <= 200; seed++) {
    const run = newRun(["네르", "티그", "에르핀"], {}, 1759000000000 + seed * 7919);
    const seenIds = [];
    for (let f = 0; f < 3; f++) {
      run.floor = f;
      const plan = EV.planEvents(run);
      per[plan.length] = (per[plan.length] || 0) + 1;
      for (const node of plan) {
        run.node = node;
        if (!EV.dueEvent(run)) continue;
        const E = EV.enterEvent(run);
        if (seenIds.includes(E.id)) dup++;
        seenIds.push(E.id);
        run.eventsSeen = (run.eventsSeen || []).concat(E.id);
        EV.leaveEvent(run);
      }
    }
  }
  check(per[1] > 0 && per[2] > 0 && !per[0] && !per[3], `층마다 1~2칸 (1칸 ${per[1]} · 2칸 ${per[2]})`);
  check(dup === 0, `한 판에 같은 이벤트가 두 번 안 나온다 (겹침 ${dup})`);
  const run = newRun(["네르", "티그", "에르핀"], {}, 11);
  run.scout = true; run.node = 1;
  const E = EV.enterEvent(run);
  check(E.choices.length === 2 && !E.id, `지도 공개 — 다음 이벤트 칸에서 둘 중 고른다 (${E.choices.join(", ")})`);
}

console.log("");
console.log(fails ? `문제 ${fails}개` : "이벤트가 문서대로 돈다");
process.exit(fails ? 1 : 0);
