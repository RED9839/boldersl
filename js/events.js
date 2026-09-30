// 이벤트 — 뽑기 · 선택지 조건 · 결과 낱말 읽기 · 결과 적용.
// 데이터는 js/data/events.js, 규칙은 docs/08-이벤트.md 다. 화면은 ui.js 의 eventScreen.
//
// 결과는 두 갈래로 나뉜다.
//   바로 되는 것  골드 · HP · 최대 HP · 장비(무작위 한 점) · 다음 전투 효과 · 골칫거리 · 지도 공개 …
//   고르는 것    카드 제거 · 카드 복제 · 고유 카드 · 중립 카드 · 번뜩임 · 사도 1명 — 화면이 하나씩 묻는다

import { EVENTS, CURSES } from "./data/events.js";
import { CARDS, NEUTRAL_IDS, EQUIP, HERO_DATA } from "./cardbook.js";
import * as R from "./rules.js";
import { rewardCards, offerFlash, offerEquip } from "./run.js";

export { EVENTS };
const koOf = (k) => (HERO_DATA[k] || {}).ko || k;

// ── 결과 낱말 읽기 ─────────────────────────────────────────────────────
// 「골드 -120 · 장비 (희귀)」 → [{ k: "gold", v: -120 }, { k: "equip", grade: "희귀" }]
// 못 읽은 조각은 { k: "unknown", text } 로 남긴다 — tools/check-events.js 가 잡는다.
const GRADES = "일반|고급|희귀|전설";
const RULES_OUT = [
  [/^없음$/, () => ({ k: "none" })],
  [/^골드\s*([+\-])\s*(\d+)$/, (m) => ({ k: "gold", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) })],
  [/^HP\s*([+\-])\s*(\d+)\s*%(?:\s*\((.+)\))?$/, (m) => ({ k: "hp", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, who: who(m[3]) })],
  [/^최대\s*HP\s*\+\s*(\d+)(?:\s*\((.+)\))?$/, (m) => ({ k: "maxHp", v: Number(m[1]), who: who(m[2]) })],
  [/^카드\s*제거\s*(\d+)$/, (m) => ({ k: "remove", n: Number(m[1]) })],
  [/^카드\s*복제\s*(\d+)$/, (m) => ({ k: "dupe", n: Number(m[1]) })],
  [/^고유\s*카드\s*선택$/, () => ({ k: "unique" })],
  [new RegExp(`^중립\\s*카드(?:\\s*\\((${GRADES})\\))?$`), (m) => ({ k: "neutral", grade: m[1] || null })],
  [new RegExp(`^장비\\s*\\((${GRADES})\\)$`), (m) => ({ k: "equip", grade: m[1] })],
  [/^번뜩임\s*1$/, () => ({ k: "flash" })],
  [/^신뜩임\s*(\d+)\s*%$/, (m) => ({ k: "shin", p: Number(m[1]) / 100 })],
  [/^신뜩임\s*막힘$/, () => ({ k: "noShin" })],
  [/^골칫거리\s*「(.+)」$/, (m) => ({ k: "curse", name: m[1] })],
  [/^지도\s*공개$/, () => ({ k: "scout" })],
  [new RegExp(`^다음\\s*상점:\\s*장비\\s*\\((${GRADES})\\)$`), (m) => ({ k: "shopGift", grade: m[1] })],
  [/^다음\s*보상:\s*번뜩임\s*1$/, () => ({ k: "rewardFlash" })],
  [/^다음\s*전투:\s*첫\s*턴\s*AP\s*([+\-])\s*(\d+)$/, (m) => ({ k: "next", ap: (m[1] === "-" ? -1 : 1) * Number(m[2]) })],
  [/^다음\s*전투:\s*게이지\s*\+\s*(\d+)\s*%$/, (m) => ({ k: "next", gauge: Number(m[1]) })],
  [/^다음\s*전투:\s*첫\s*손패\s*\+\s*(\d+)$/, (m) => ({ k: "next", hand: Number(m[1]) })],
  [/^다음\s*전투:\s*아군\s*전원\s*약화\s*(\d+)\s*턴$/, (m) => ({ k: "next", weak: Number(m[1]) })],
  [/^다음\s*전투:\s*HP\s*-\s*(\d+)\s*%$/, (m) => ({ k: "next", hpCut: Number(m[1]) / 100 })],
];
function who(s) {
  if (!s) return { all: true };
  if (s === "사도 1명") return { pick: true };
  if (s === "쓰러진 사도") return { fallen: true };
  if (s === "그 사도") return { judged: true };
  return { hero: s };
}
export function parseOut(text) {
  if (!text) return [];
  return text.split(/\s*·\s*/).filter(Boolean).map((t) => {
    for (const [re, make] of RULES_OUT) { const m = t.trim().match(re); if (m) return make(m); }
    return { k: "unknown", text: t };
  });
}

// ── 뽑기 ───────────────────────────────────────────────────────────────
// 층마다 이벤트 칸 1~2개. 첫 칸은 첫 전투 뒤, 둘째 칸(절반 확률)은 캠프 앞.
export function planEvents(run) {
  if (!run.eventPlan) run.eventPlan = {};
  if (!run.eventPlan[run.floor]) run.eventPlan[run.floor] = run.rng() < R.EVENT_SECOND ? [1, 2] : [1];
  return run.eventPlan[run.floor];
}
export function dueEvent(run) {
  if (run.done) return false;
  const plan = planEvents(run);
  return plan.includes(run.node) && !(run.eventDone || {})[`${run.floor}:${run.node}`];
}

const heroesOf = (run) => run.party.map((k) => ({ key: k, ko: koOf(k), race: (HERO_DATA[k] || {}).race }));
// 이름 앞부분이 같으면 이격도 친다 — 「에르핀」 은 에르핀(왕도)도
const hasHero = (run, name) => heroesOf(run).some((h) => h.ko === name || h.ko.startsWith(name + "("));
const fallen = (run) => run.party.filter((k) => (run.hp[k] || 0) <= 0);

// 이 층에서 아직 나올 이벤트가 남았는가 — 지도에 이벤트 칸이 많은 길을 고르면 한 판에 한 번씩이라 바닥날 수 있다
export function eventLeft(run) { return EVENTS.some((e) => eligible(run, e)); }

function eligible(run, ev) {
  if ((run.eventsSeen || []).includes(ev.id)) return false;           // 한 판에 한 번
  if (ev.pool !== "공용" && ev.pool !== run.floor) return false;
  if (ev.cond === "fallen" && !fallen(run).length) return false;
  return true;
}

// 층 풀 70% · 공용 30%. 한쪽이 비면 다른 쪽에서. n 개를 겹치지 않게
export function rollEvents(run, n = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = EVENTS.filter((e) => eligible(run, e) && !out.includes(e));
    const floorPool = left.filter((e) => e.pool === run.floor);
    const common = left.filter((e) => e.pool === "공용");
    const from = !floorPool.length ? common : !common.length ? floorPool : run.rng() < R.EVENT_FLOOR_SHARE ? floorPool : common;
    if (!from.length) break;
    out.push(from[Math.floor(run.rng() * from.length)]);
  }
  return out;
}

// 이벤트 칸에 들어간다 — 들어올 때 한 번만 굴린다. 「지도 공개」 가 있으면 둘 중 고른다.
export function enterEvent(run) {
  // 지도가 있으면 그 칸(run.map.at)으로 — 한 층에 이벤트 칸이 여럿이어도 겹치지 않게
  const key = `${run.floor}:${run.map && run.map.at ? run.map.at : run.node}`;
  if (!run.event || run.event.key !== key) {
    const n = run.scout ? 2 : 1;
    const evs = rollEvents(run, n);
    run.event = { key, choices: evs.map((e) => e.id), id: evs.length === 1 ? evs[0].id : null, phase: "choose", log: [], pending: [], judged: null };
    if (run.scout && evs.length > 1) run.scout = false;
  }
  return run.event;
}
export const eventById = (id) => EVENTS.find((e) => e.id === id) || null;

export function pickEvent(run, id) {
  if (!run.event || !run.event.choices.includes(id)) return "고를 수 없습니다";
  run.event.id = id;
  return null;
}

// ── 선택지 ─────────────────────────────────────────────────────────────
// 보이는 선택지(조건이 맞는 것) + 맨 끝의 「떠난다」
export function optionsOf(run, ev) {
  const opts = ev.options.filter((o) => {
    if (o.hero) return [].concat(o.hero).some((n) => hasHero(run, n));
    if (o.race) return heroesOf(run).some((h) => h.race === o.race);
    if (o.when === "hp30") return run.party.some((k) => (run.hp[k] || 0) > 0 && run.hp[k] / run.maxHp[k] <= 0.3);
    return true;
  });
  return [...opts, { label: ev.leave || "떠납니다", out: ev.leaveOut || "없음", say: ev.leaveSay || null, leave: true }];
}

// 이 선택지가 실제로 무엇을 하는가 — 사도에 따라 바뀌는 값(E5 네르)을 반영한 결과 글
export function outOf(run, opt) {
  if (opt.price && hasHero(run, opt.price.hero)) return opt.price.out;
  return opt.out || null;
}

// 누구 덕에 보이는 선택지인가 — 화면이 초상을 붙인다
export function openedBy(run, opt) {
  if (opt.hero) return heroesOf(run).find((h) => [].concat(opt.hero).some((n) => h.ko === n || h.ko.startsWith(n + "("))) || null;
  if (opt.race) return heroesOf(run).find((h) => h.race === opt.race) || null;
  if (opt.when === "hp30") return heroesOf(run).find((h) => (run.hp[h.key] || 0) > 0 && run.hp[h.key] / run.maxHp[h.key] <= 0.3) || null;
  return null;
}

// 판정 — 미리 보여 주고 고르게 한다(확률로 굴리지 않는다)
export function judgeOf(run, opt) {
  const j = opt.judge;
  if (!j) return null;
  if (j.by === "atk-max") {
    const top = run.party.filter((k) => (run.hp[k] || 0) > 0)
      .map((k) => ({ k, v: (HERO_DATA[k] || {}).atk || 0 })).sort((a, b) => b.v - a.v)[0];
    if (!top) return { pass: false, who: null, value: 0, need: j.at };
    return { pass: top.v >= j.at, who: top.k, value: top.v, need: j.at };
  }
  // hp-pick — 사도 한 명을 고른다. 판정은 고른 뒤에
  return { pick: true, need: j.at };
}

// 못 고르는 까닭 — 골드가 모자라면 잠긴다
export function lockOf(run, opt) {
  if (opt.leave) return null;
  const ops = parseOut(outOf(run, opt));
  const cost = -ops.filter((o) => o.k === "gold" && o.v < 0).reduce((a, o) => a + o.v, 0);
  const need = Math.max(cost, opt.needGold || 0);
  if (need && run.gold < need) return `골드가 모자랍니다 (${need} 필요)`;
  if (ops.some((o) => o.k === "remove") && run.deck.length <= ops.find((o) => o.k === "remove").n) return "뺄 카드가 모자랍니다";
  if (opt.judge && opt.judge.by === "hp-pick" && !run.party.some((k) => (run.hp[k] || 0) > 0)) return "나설 사도가 없습니다";
  return null;
}

// ── 고른다 ─────────────────────────────────────────────────────────────
// 돌려주는 것: { fight } 면 전투로, 아니면 결과(run.event.log · pending)를 화면이 그린다.
export function choose(run, idx, { pickHero } = {}) {
  const ev = eventById(run.event && run.event.id);
  if (!ev || run.event.phase !== "choose") return { why: "고를 수 없습니다" };
  const opt = optionsOf(run, ev)[idx];
  if (!opt) return { why: "없는 선택지입니다" };
  const why = lockOf(run, opt);
  if (why) return { why };
  seen(run, ev);
  const E = run.event;
  E.label = opt.label;
  if (opt.fight) {
    E.phase = "fight";
    run.eventFight = { name: opt.fight.name, enemies: opt.fight.enemies, win: opt.fight.win || null, winGamble: opt.fight.winGamble || null, elite: !!opt.fight.elite };
    return { fight: run.eventFight };
  }
  let out = outOf(run, opt);
  let say = opt.say || null;
  if (opt.gamble && !opt.choose) {
    let r = run.rng(), g = opt.gamble[opt.gamble.length - 1];
    for (const x of opt.gamble) { if ((r -= x.p) < 0) { g = x; break; } }
    out = g.out; say = g.say || say;
  }
  if (opt.gamble && opt.choose) {
    // 골라서 받는다 — 화면이 셋 중 하나를 묻는다
    E.phase = "result"; E.say = say;
    E.pending = [{ k: "gambleChoice", options: opt.gamble.map((g) => g.out) }];
    return {};
  }
  if (opt.judge) {
    const j = judgeOf(run, opt);
    if (j.pick) {
      E.phase = "result"; E.pending = [{ k: "judgePick", judge: opt.judge }];
      return {};
    }
    E.judged = j.who;
    out = j.pass ? opt.judge.pass : opt.judge.fail;
    E.log.push(`${koOf(j.who)} — 공격 ${j.value} (${j.need} 이상이면 성공) · ${j.pass ? "성공" : "실패"}`);
    say = j.pass ? (opt.judge.passSay || say) : say;
  }
  E.phase = "result"; E.say = say;
  apply(run, parseOut(out));
  return {};
}

function seen(run, ev) {
  run.eventsSeen = run.eventsSeen || [];
  if (!run.eventsSeen.includes(ev.id)) run.eventsSeen.push(ev.id);
}

// 결과를 적용한다. 바로 되는 것은 여기서, 고르는 것은 pending 에 쌓는다
export function apply(run, ops) {
  const E = run.event;
  const alive = run.party.filter((k) => (run.hp[k] || 0) > 0);
  for (const o of ops) {
    switch (o.k) {
      case "none": break;
      case "gold": run.gold = Math.max(0, run.gold + o.v); E.log.push(`골드 ${o.v > 0 ? "+" : ""}${o.v}`); break;
      case "hp": {
        if (o.who.pick) { E.pending.push({ k: "pickHero", then: { k: "hp", v: o.v } }); break; }
        const who = o.who.fallen ? fallen(run) : o.who.hero ? run.party.filter((k) => koOf(k) === o.who.hero || koOf(k).startsWith(o.who.hero + "("))
          : o.who.judged ? [E.judged].filter(Boolean) : alive;
        for (const k of who) hpChange(run, k, o.v, o.who.fallen);
        E.log.push(`${o.who.fallen ? "쓰러진 사도" : o.who.hero || (o.who.judged ? koOf(E.judged) : "파티")} HP ${o.v > 0 ? "+" : ""}${Math.round(o.v * 100)}%`);
        break;
      }
      case "maxHp": {
        if (o.who.pick) { E.pending.push({ k: "pickHero", then: { k: "maxHp", v: o.v } }); break; }
        for (const k of run.party) { run.maxHp[k] += o.v; if ((run.hp[k] || 0) > 0) run.hp[k] += o.v; }
        E.log.push(`파티 최대 HP +${o.v}`);
        break;
      }
      case "remove": for (let i = 0; i < o.n; i++) E.pending.push({ k: "remove" }); break;
      case "dupe": for (let i = 0; i < o.n; i++) E.pending.push({ k: "dupe" }); break;
      case "unique": {
        const cards = rewardCards(run);
        if (cards.length) E.pending.push({ k: "card", cards, label: "고유 카드" });
        else E.log.push("파티 사도의 고유 카드는 이미 다 가졌습니다");
        break;
      }
      case "neutral": {
        const cards = neutralOffer(run, o.grade, 3);
        if (cards.length) E.pending.push({ k: "card", cards, label: `중립 카드${o.grade ? ` (${o.grade})` : ""}` });
        break;
      }
      case "equip": {
        const [id] = offerEquip(run, { [o.grade]: 1 }, 1);
        if (id) { run.bag.push(id); E.log.push(`장비 「${EQUIP[id].ko}」(${o.grade}) — 가방에`); }
        else E.log.push(`${o.grade} 장비는 이미 다 가졌습니다`);
        break;
      }
      case "flash": {
        const offer = offerFlash(run);
        if (offer) E.pending.push({ k: "flash", offer });
        else E.log.push("번뜩임을 붙일 고유 카드가 없습니다 — 고유 카드를 먼저 얻으세요");
        break;
      }
      case "shin": E.shinChance = (E.shinChance || 0) + o.p; break;
      case "noShin": run.noShin = true; break;
      case "curse": {
        const c = CURSES[o.name];
        if (c) { run.deck.push(c.id); E.log.push(`골칫거리 「${o.name}」 — 덱에`); }
        break;
      }
      case "scout": run.scout = true; E.log.push("지도 공개 — 다음 이벤트 칸에서 둘 중 하나를 고릅니다"); break;
      case "shopGift": run.shopGift = o.grade; E.log.push(`다음 상점에서 ${o.grade} 장비 하나를 공짜로 받습니다`); break;
      case "rewardFlash": run.rewardFlash = true; E.log.push("다음 보상에서 번뜩임이 꼭 뜹니다"); break;
      case "next": {
        const n = (run.nextFight = run.nextFight || {});
        for (const f of ["ap", "gauge", "hand", "weak", "hpCut"]) if (o[f] != null) n[f] = (n[f] || 0) + o[f];
        E.log.push(nextLabel(o));
        break;
      }
      default: E.log.push(`(읽지 못한 결과: ${o.text})`);
    }
  }
}

function hpChange(run, k, v, revive) {
  if ((run.hp[k] || 0) <= 0 && !revive) return;            // 쓰러진 사도는 주말농장에서 쉰다
  const max = run.maxHp[k] || 1;
  run.hp[k] = Math.max(v < 0 ? 1 : 0, Math.min(max, (run.hp[k] || 0) + Math.round(max * v)));
}

const nextLabel = (o) => "다음 전투: " + [
  o.ap != null && `첫 턴 AP ${o.ap > 0 ? "+" : ""}${o.ap}`,
  o.gauge != null && `게이지 +${o.gauge}%`,
  o.hand != null && `첫 손패 +${o.hand}`,
  o.weak != null && `아군 전원 약화 ${o.weak}턴`,
  o.hpCut != null && `HP -${Math.round(o.hpCut * 100)}%`,
].filter(Boolean).join(" · ");

function neutralOffer(run, grade, n) {
  const has = new Set(run.deck);
  const pool = NEUTRAL_IDS.filter((id) => CARDS[id].playable && (!grade || CARDS[id].grade === grade) && !(CARDS[id].oneOnly && has.has(id)));
  const out = [];
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(run.rng() * pool.length), 1));
  return out;
}

// ── 고르는 것을 하나씩 푼다 ─────────────────────────────────────────────
// 화면이 pending[0] 을 보여 주고, 고르면 resolve 를 부른다. value 가 null 이면 건너뛴다(카드 고르기만).
export function resolve(run, value) {
  const E = run.event;
  const p = E && E.pending[0];
  if (!p) return "고를 것이 없습니다";
  switch (p.k) {
    case "remove": {
      const i = run.deck.indexOf(value);
      if (i < 0) return "덱에 없는 카드입니다";
      run.deck.splice(i, 1);
      if (run.flash) delete run.flash[value];
      E.log.push(`「${CARDS[value].name}」 — 덱에서 뺐습니다`);
      break;
    }
    case "dupe": {
      if (!run.deck.includes(value)) return "덱에 없는 카드입니다";
      run.deck.push(value);
      E.log.push(`「${CARDS[value].name}」 — 한 장 더`);
      break;
    }
    case "card": {
      if (value == null) { E.log.push(`${p.label} — 받지 않았습니다`); break; }
      if (!p.cards.includes(value)) return "고를 수 없는 카드입니다";
      run.deck.push(value);
      E.log.push(`「${CARDS[value].name}」 — 덱에`);
      break;
    }
    case "flash": {
      if (value == null) { E.log.push("번뜩임 — 받지 않았습니다"); break; }
      if (!p.offer.picks.includes(value)) return "고를 수 없는 번뜩임입니다";
      run.flash[p.offer.cardId] = value;
      const f = CARDS[p.offer.cardId].flash[value - 1];
      E.log.push(`「${CARDS[p.offer.cardId].name}」 — ${"①②③④⑤"[value - 1]} ${f.kind} 「${f.ko}」`);
      // 신뜩임 — 번뜩임 위에 드물게 한 줄 더(배율 ×1.3). 「꽃을 꺾으면」 이번 판은 안 뜬다
      if (E.shinChance && !run.noShin && run.rng() < E.shinChance) {
        run.shin = run.shin || {};
        run.shin[p.offer.cardId] = true;
        E.log.push("신뜩임! 번뜩임 위에 한 줄이 더 얹혔습니다 (피해 ×1.3)");
      }
      break;
    }
    case "pickHero": {
      if (!run.party.includes(value)) return "파티에 없는 사도입니다";
      const t = p.then;
      if (t.k === "hp") hpChange(run, value, t.v, false);
      if (t.k === "maxHp") { run.maxHp[value] += t.v; if ((run.hp[value] || 0) > 0) run.hp[value] += t.v; }
      E.log.push(`${koOf(value)} — ${t.k === "hp" ? `HP ${t.v > 0 ? "+" : ""}${Math.round(t.v * 100)}%` : `최대 HP +${t.v}`}`);
      break;
    }
    case "judgePick": {
      if (!run.party.includes(value) || (run.hp[value] || 0) <= 0) return "나설 수 있는 사도가 아닙니다";
      const hp = run.hp[value];
      const pass = hp >= p.judge.at;
      E.judged = value;
      E.log.push(`${koOf(value)} — HP ${hp} (${p.judge.at} 이상이면 성공) · ${pass ? "성공" : "실패"}`);
      if (pass && p.judge.passSay) E.say = p.judge.passSay;
      E.pending.shift();
      apply(run, parseOut(pass ? p.judge.pass : p.judge.fail));
      return null;
    }
    case "gambleChoice": {
      if (!p.options.includes(value)) return "고를 수 없습니다";
      E.pending.shift();
      apply(run, parseOut(value));
      return null;
    }
  }
  E.pending.shift();
  return null;
}

// 이벤트 전투가 끝났다 — 이기면 적힌 보상, 지면 판이 끝난다(화면이 처리)
export function afterEventFight(run, won) {
  const f = run.eventFight;
  const E = run.event;
  run.eventFight = null;
  if (!E) return;
  E.phase = "result";
  if (!won || !f) return;
  E.log.push(`${f.name}을(를) 물리쳤습니다`);
  let out = f.win;
  if (f.winGamble) {
    let r = run.rng(), g = f.winGamble[f.winGamble.length - 1];
    for (const x of f.winGamble) { if ((r -= x.p) < 0) { g = x; break; } }
    out = g.out;
  }
  apply(run, parseOut(out));
}

// 이벤트를 닫는다 — 다음 칸으로
export function leaveEvent(run) {
  if (run.event) {
    run.eventDone = run.eventDone || {};
    run.eventDone[run.event.key] = true;
  }
  run.event = null;
}

// 이 판에서 한 번 쓰고 비우는 「다음 전투」 효과 — 전투를 열 때 가져간다
export function takeNextFight(run) {
  const n = run.nextFight || null;
  run.nextFight = null;
  return n;
}
