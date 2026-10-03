// 이벤트 — 뽑기 · 선택지 조건 · 결과 낱말 읽기 · 결과 적용.
// 데이터는 js/data/events.js, 규칙은 docs/08-이벤트.md 다. 화면은 ui.js 의 eventScreen.
//
// 결과는 두 갈래로 나뉜다.
//   바로 되는 것  골드 · HP · 최대 HP · 장비(무작위 한 점) · 다음 전투 효과 · 골칫거리 · 지도 공개 …
//   고르는 것    카드 제거 · 카드 복제 · 고유 카드 · 교주 카드 · 신탁 · 사도 1명 — 화면이 하나씩 묻는다

import { EVENTS, CURSES, GIFTS } from "./data/events.js";
import { parseEffect } from "./effects.js";
import { 은는, 을를, josa } from "./ko.js";
import { CARDS, NEUTRAL_IDS, EQUIP, HERO_DATA, flashed } from "./cardbook.js";
import * as R from "./rules.js";
import { rewardCards, offerFlash, offerEquip, offerEquipSlot, forgetCard, divineKindsFor, powerWhy, powerCard, flashOk } from "./run.js";

export { EVENTS };
const koOf = (k) => (HERO_DATA[k] || {}).ko || k;

// 이벤트 카드(docs/08 §1 · v6) — 골칫거리(저주)와 선물 카드를 카드 글 문법으로 장부에 올린다.
// cardbook 은 골칫거리를 효과 없이 자리만 올린다 — 글이 카드 글인 것(rule)은 여기서 효과를 읽어 얹는다
const cardFx = (text) => { const { fx } = parseEffect(text); return { fx, target: fx.some((f) => f.target === "oneEnemy") ? "적" : fx.some((f) => f.target === "oneAlly") ? "아군" : "없음" }; };
for (const c of Object.values(CURSES)) if (c.rule && CARDS[c.id]) Object.assign(CARDS[c.id], cardFx(c.text));
for (const [ko, c] of Object.entries(GIFTS)) CARDS[c.id] = { id: c.id, hero: null, gift: true, name: ko, cost: c.cost, xcost: false, type: c.type || "스킬", text: c.text, built: true, unique: false, signature: false, flash: null, tags: [], playable: true, blurb: c.blurb || null, ...cardFx(c.text) };

// ── 결과 낱말 읽기 ─────────────────────────────────────────────────────
// 「골드 -120 · 장비 (희귀)」 → [{ k: "gold", v: -120 }, { k: "equip", grade: "희귀" }]
// 못 읽은 조각은 { k: "unknown", text } 로 남긴다 — tools/check-events.js 가 잡는다.
const GRADES = "일반|고급|희귀|전설";
const RULES_OUT = [
  [/^없음$/, () => ({ k: "none" })],
  [/^골드\s*([+\-])\s*(\d+)$/, (m) => ({ k: "gold", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) })],
  [/^HP\s*([+\-])\s*(\d+)\s*%(?:\s*\((.+)\))?$/, (m) => ({ k: "hp", v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, who: who(m[3]) })],
  [/^최대\s*HP\s*\+\s*(\d+)(?:\s*\((.+)\))?$/, (m) => ({ k: "maxHp", v: Number(m[1]), who: who(m[2]) })],
  [/^최대\s*HP\s*-\s*(\d+)$/, (m) => ({ k: "maxHp", v: -Number(m[1]) })],         // v6 — 파티 최대 HP 를 깎는 대가
  // 선물 카드(GIFTS) — 덱에 한 장. 화면용 풀이(〔카드 글〕)가 붙어 있어도 읽는다(outOf)
  [/^카드\s*「(.+?)」(?:\s*〔.*〕)?$/, (m) => (GIFTS[m[1]] ? { k: "gift", name: m[1] } : { k: "unknown", text: m[0] })],
  [/^카드\s*제거\s*(\d+)$/, (m) => ({ k: "remove", n: Number(m[1]) })],
  [/^카드\s*복제\s*(\d+)$/, (m) => ({ k: "dupe", n: Number(m[1]) })],
  [/^고유\s*카드\s*선택$/, () => ({ k: "unique" })],
  [new RegExp(`^(?:교주|중립)\\s*카드(?:\\s*\\((${GRADES})\\))?$`), (m) => ({ k: "neutral", grade: m[1] || null })],
  [new RegExp(`^장비\\s*\\((${GRADES})\\)$`), (m) => ({ k: "equip", grade: m[1] })],
  // 칸을 정한 장비 — 무기 · 방어구 · 장신구
  [new RegExp(`^(무기|방어구|장신구)\\s*\\((${GRADES})\\)$`), (m) => ({ k: "equip", slot: m[1], grade: m[2] })],
  [/^신탁\s*1$/, () => ({ k: "flash" })],
  // 신탁 방향을 고르게 — 다섯을 다 보여 준다 / 이미 붙인 신탁을 다른 갈래로 바꾼다
  [/^신탁\s*1\s*\(\s*다섯\s*\)$/, () => ({ k: "flash", all: true })],
  [/^신탁\s*바꾸기\s*1$/, () => ({ k: "flash", swap: true })],
  [/^기적\s*(\d+)\s*%$/, (m) => ({ k: "shin", p: Number(m[1]) / 100 })],
  [/^기적\s*막힘$/, () => ({ k: "noShin" })],
  // 이미 신탁을 붙인 카드 하나에 기적을 바로 얹는다(없으면 이번에 고르는 신탁에)
  [/^기적\s*1$/, () => ({ k: "shinNow" })],
  // 카드 강화로서의 기적 — 덱에서 카드 한 장을 골라 기적을 얹는다(위력 ×1.3 / 비용 -1). 신탁이 없어도 된다
  [/^기적\s*카드\s*(\d+)$/, (m) => ({ k: "shinPick", n: Number(m[1]), kind: null })],
  [/^기적\s*카드\s*(\d+)\s*\(\s*(위력|비용)\s*\)$/, (m) => ({ k: "shinPick", n: Number(m[1]), kind: m[2] === "비용" ? "cost" : "power" })],
  [/^골칫거리\s*「(.+?)」(?:\s*〔.*〕)?$/, (m) => (CURSES[m[1]] ? { k: "curse", name: m[1] } : { k: "unknown", text: m[0] })],
  [/^지도\s*공개$/, () => ({ k: "scout" })],
  [new RegExp(`^다음\\s*상점:\\s*장비\\s*\\((${GRADES})\\)$`), (m) => ({ k: "shopGift", grade: m[1] })],
  [/^다음\s*보상:\s*신탁\s*1$/, () => ({ k: "rewardFlash" })],
  [/^다음\s*전투:\s*첫\s*턴\s*AP\s*([+\-])\s*(\d+)$/, (m) => ({ k: "next", ap: (m[1] === "-" ? -1 : 1) * Number(m[2]) })],
  [/^다음\s*전투:\s*(?:고학년\s*)?게이지\s*\+\s*(\d+)\s*%$/,(m) => ({ k: "next", gauge: Number(m[1]) })],
  [/^다음\s*전투:\s*첫\s*손패\s*\+\s*(\d+)$/, (m) => ({ k: "next", hand: Number(m[1]) })],
  [/^다음\s*전투:\s*(?:아군\s*전원|파티)\s*약화\s*(\d+)\s*턴?$/, (m) => ({ k: "next", weak: Number(m[1]) })],   // 겹(rules.js 겹 규칙) — 옛 글 「N턴」 도 받는다
  [/^다음\s*전투:\s*HP\s*-\s*(\d+)\s*%$/, (m) => ({ k: "next", hpCut: Number(m[1]) / 100 })],
  // 새 적 규칙과 엮인 것(docs/12) — 첫 턴 즉시 행동 늦추기 · 적 취약 · 적 패시브 잠재우기.
  // 글은 「즉시 행동 N장 늦춤」, 옛 글 「즉시 행동 -N」 도 읽는다
  [/^다음\s*전투:\s*첫\s*턴\s*적\s*전체\s*즉시\s*행동\s*(?:-\s*(\d+)|(\d+)\s*장\s*늦춤)$/, (m) => ({ k: "next", rush: Number(m[1] || m[2]) })],
  [/^다음\s*전투:\s*적\s*전체\s*취약\s*(\d+)\s*턴?$/, (m) => ({ k: "next", foeVuln: Number(m[1]) })],
  [/^다음\s*전투:\s*적\s*패시브\s*꺼짐\s*(\d+)\s*턴$/, (m) => ({ k: "next", quiet: Number(m[1]) })],
  // 「다음 전투: 파티 불굴 2」 — 다음 전투 하나에만 파티 버프를 걸고 시작한다(한 번짜리, 2026-10 이벤트 작성자 바람)
  // 「파티」 는 빼도 된다(「다음 전투: 불굴 2」 — 파티에 거는 버프는 대상 말 없이, 2026-10 사용자)
  [/^다음\s*전투:\s*(?:(?:아군\s*전원|파티)\s*)?(불굴|결의|결정화|피해 감소|면역|반격|실드 유지|협공|잔광|저장)\s*(\d+)$/, (m) => ({ k: "next", buff: { [m[1]]: Number(m[2]) } })],
];
function who(s) {
  if (!s) return { all: true };
  if (s === "사도 1명") return { pick: true };
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
// 파티 HP(docs/16 §8) — 사도마다 HP 가 없다. HP 결과는 모두 파티의 것
const hpRatio = (run) => (run.partyHp || 0) / (run.partyMaxHp || 1);

// 이 층에서 아직 나올 이벤트가 남았는가 — 지도에 이벤트 칸이 많은 길을 고르면 한 판에 한 번씩이라 바닥날 수 있다
export function eventLeft(run) { return EVENTS.some((e) => eligible(run, e)); }

function eligible(run, ev) {
  if ((run.eventsSeen || []).includes(ev.id)) return false;           // 한 판에 한 번
  if (ev.pool !== "공용" && ev.pool !== run.floor) return false;
  return true;
}

// 층 풀 70% · 공용 30%. 한쪽이 비면 다른 쪽에서. n 개를 겹치지 않게
export function rollEvents(run, n = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // 드문 이벤트(rare: 0~1) — 굴릴 때마다 그 확률로만 후보에 든다(겨우살이 따위)
    const left = EVENTS.filter((e) => eligible(run, e) && !out.includes(e) && (!e.rare || run.rng() < e.rare));
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

// 이벤트 전투의 적 — 배열이면 그대로, { 층 번호: [...] } 면 지금 층의 것(공용 이벤트가 그 땅의 적을 부른다 — C9)
export const foesOf = (run, fight) => Array.isArray(fight.enemies) ? fight.enemies : fight.enemies[run.floor] || fight.enemies[0];

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
    if (o.when === "hp30") return hpRatio(run) <= 0.3;
    return true;
  });
  return [...opts, { label: ev.leave || "떠납니다", out: ev.leaveOut || "없음", say: ev.leaveSay || null, leave: true }];
}

// 이 선택지가 실제로 무엇을 하는가 — 사도에 따라 바뀌는 값(E5 네르)을 반영한 결과 글
export function outOf(run, opt) {
  const out = opt.price && hasHero(run, opt.price.hero) ? opt.price.out : opt.out || null;
  // 이벤트 카드는 이름만으로 무엇을 하는지 모른다 — 화면에 카드 글을 붙여 보여 준다(parseOut 은 〔…〕 를 건너 읽는다)
  return out && out.replace(/(카드|골칫거리)\s*「(.+?)」/g, (t, k, n) => { const c = (k === "카드" ? GIFTS : CURSES)[n]; return c && c.text ? `${t}〔${c.text}〕` : t; });
}

// 누구 덕에 보이는 선택지인가 — 화면이 초상을 붙인다
export function openedBy(run, opt) {
  if (opt.hero) return heroesOf(run).find((h) => [].concat(opt.hero).some((n) => h.ko === n || h.ko.startsWith(n + "("))) || null;
  if (opt.race) return heroesOf(run).find((h) => h.race === opt.race) || null;
  if (opt.when === "hp30") return null;   // 파티가 다쳤다 — 한 사람의 덕이 아니다
  return null;
}

// 판정 — 미리 보여 주고 고르게 한다(확률로 굴리지 않는다)
export function judgeOf(run, opt) {
  const j = opt.judge;
  if (!j) return null;
  if (j.by === "atk-max") {
    const top = run.party
      .map((k) => ({ k, v: (HERO_DATA[k] || {}).atk || 0 })).sort((a, b) => b.v - a.v)[0];
    if (!top) return { pass: false, who: null, value: 0, need: j.at };
    return { pass: top.v >= j.at, who: top.k, value: top.v, need: j.at };
  }
  // hp-party — 파티 HP 가 파티 최대 HP 의 at% 이상이면 성공(옛 hp-pick — 사도 한 명의 HP 를 보던 것)
  const pct = Math.round(hpRatio(run) * 100);
  return { pass: pct >= j.at, who: null, value: pct, need: j.at, hp: true };
}

// 못 고르는 까닭 — 골드가 모자라면 잠긴다
export function lockOf(run, opt) {
  if (opt.leave) return null;
  const ops = parseOut(outOf(run, opt));
  const cost = -ops.filter((o) => o.k === "gold" && o.v < 0).reduce((a, o) => a + o.v, 0);
  const need = Math.max(cost, opt.needGold || 0);
  if (need && run.gold < need) return `골드가 모자랍니다 (${need} 필요)`;
  if (ops.some((o) => o.k === "remove") && run.deck.length <= ops.find((o) => o.k === "remove").n) return "뺄 카드가 모자랍니다";
  if (ops.some((o) => o.k === "gift" && R.isOnly(CARDS[GIFTS[o.name].id]) && run.deck.includes(GIFTS[o.name].id))) return "유일 — 이미 덱에 있는 카드입니다";
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
    run.eventFight = { name: opt.fight.name, enemies: foesOf(run, opt.fight), win: opt.fight.win || null, winGamble: opt.fight.winGamble || null, elite: !!opt.fight.elite };
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
    E.judged = j.who;
    out = j.pass ? opt.judge.pass : opt.judge.fail;
    E.log.push(j.hp ? `파티 HP ${j.value}% (${j.need}% 이상이면 성공) · ${j.pass ? "성공" : "실패"}` : `${koOf(j.who)} — 공격 ${j.value} (${j.need} 이상이면 성공) · ${j.pass ? "성공" : "실패"}`);
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
  for (const o of ops) {
    switch (o.k) {
      case "none": break;
      case "gold": run.gold = Math.max(0, run.gold + o.v); E.log.push(`골드 ${o.v > 0 ? "+" : ""}${o.v}`); break;
      // HP · 최대 HP — 파티 HP 하나(docs/16 §8). 괄호(「(그 사도)」 따위)가 남은 옛 글도 파티로 읽는다
      case "hp": {
        hpChange(run, o.v);
        E.log.push(`파티 HP ${o.v > 0 ? "+" : ""}${Math.round(o.v * 100)}%`);
        break;
      }
      case "maxHp": {
        if (o.v < 0) {      // 깎는 대가 — 최대가 줄면 지금 HP 도 그 안으로
          run.partyMaxHp = Math.max(1, run.partyMaxHp + o.v); run.partyHp = Math.min(run.partyHp, run.partyMaxHp);
          E.log.push(`파티 최대 HP ${o.v}`);
          break;
        }
        run.partyMaxHp += o.v; run.partyHp += o.v;
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
        if (cards.length) E.pending.push({ k: "card", cards, label: `교주 카드${o.grade ? ` (${o.grade})` : ""}` });
        break;
      }
      case "equip": {
        const [id] = o.slot ? offerEquipSlot(run, o.grade, o.slot) : offerEquip(run, { [o.grade]: 1 }, 1);
        if (id) { run.bag.push(id); E.log.push(`장비 「${EQUIP[id].ko}」(${o.grade}) — 가방에`); }
        else E.log.push(`${o.grade} ${은는(o.slot || "장비")} 이미 다 가졌습니다`);
        break;
      }
      case "flash": {
        let offer = offerFlash(run);
        if (o.swap) {
          // 이미 신탁을 붙인 카드 하나 — 지금 것을 뺀 넷에서 다시 고른다(없으면 보통 신탁)
          const had = Object.keys(run.flash || {}).filter((id) => CARDS[id] && (CARDS[id].flash || []).length === 5);
          if (had.length) { const id = had[Math.floor(run.rng() * had.length)]; offer = { cardId: id, picks: [1, 2, 3, 4, 5].filter((n) => n !== run.flash[id] && flashOk(run, id, n)), swap: true }; }
        } else if (o.all && offer) offer.picks = [1, 2, 3, 4, 5].filter((n) => flashOk(run, offer.cardId, n));
        if (offer) E.pending.push({ k: "flash", offer });
        else E.log.push("신탁을 붙일 고유 카드가 없습니다 — 고유 카드를 먼저 얻으세요");
        break;
      }
      case "shin": E.shinChance = (E.shinChance || 0) + o.p; break;
      case "noShin": run.noShin = true; break;
      case "shinPick": {
        const able = shinAble(run, o.kind);
        if (!able.length) { E.log.push("축복을 얹을 카드가 없습니다"); break; }
        for (let i = 0; i < o.n; i++) E.pending.push({ k: "shinPick", kind: o.kind });
        break;
      }
      case "shinNow": {
        const ids = Object.keys(run.flash || {}).filter((id) => CARDS[id] && !(run.shin || {})[id]);
        if (ids.length) { const id = ids[Math.floor(run.rng() * ids.length)]; run.shin = run.shin || {}; run.shin[id] = ownRandom(run, CARDS[id]) || true; E.log.push(`겨우살이의 축복! 「${CARDS[id].name}」 — ${R.shinLabel(CARDS[id], run.shin[id])}`); }
        else { E.shinChance = 1; E.log.push("축복을 얹을 신탁이 아직 없습니다 — 이번에 고르는 신탁에 얹힙니다"); }
        break;
      }
      case "curse": {
        const c = CURSES[o.name];
        if (c) { run.deck.push(c.id); E.log.push(`골칫거리 「${o.name}」 — 덱에${c.rule ? ` (${c.text})` : ""}`); }
        break;
      }
      case "gift": {
        const c = GIFTS[o.name];
        if (R.isOnly(CARDS[c.id]) && run.deck.includes(c.id)) { E.log.push(`「${o.name}」 — 유일, 이미 덱에 있습니다`); break; }
        run.deck.push(c.id); E.log.push(`「${o.name}」 — 덱에 (${c.text})`);
        break;
      }
      case "scout": run.scout = true; E.log.push("지도 공개 — 다음 이벤트 칸에서 둘 중 하나를 고릅니다"); break;
      case "shopGift": run.shopGift = o.grade; E.log.push(`다음 상점에서 ${o.grade} 장비 하나를 공짜로 받습니다`); break;
      case "rewardFlash": run.rewardFlash = true; E.log.push("다음 보상에서 신탁이 꼭 뜹니다"); break;
      case "next": {
        const n = (run.nextFight = run.nextFight || {});
        for (const f of ["ap", "gauge", "hand", "weak", "hpCut", "rush", "foeVuln", "quiet"]) if (o[f] != null) n[f] = (n[f] || 0) + o[f];
        if (o.buff) { n.buff = n.buff || {}; for (const [id, v] of Object.entries(o.buff)) n.buff[id] = (n.buff[id] || 0) + v; }
        E.log.push(nextLabel(o));
        break;
      }
      default: E.log.push(`(읽지 못한 결과: ${o.text})`);
    }
  }
}

// 파티 HP 를 최대의 v 만큼 — 깎여도 1 은 남는다(이벤트로 판이 끝나지 않는다)
function hpChange(run, v) {
  const max = run.partyMaxHp || 1;
  run.partyHp = Math.max(1, Math.min(max, (run.partyHp || 0) + Math.round(max * v)));
}

const nextLabel = (o) => "다음 전투: " + [
  o.ap != null && `첫 턴 AP ${o.ap > 0 ? "+" : ""}${o.ap}`,
  o.gauge != null && `고학년 게이지 +${o.gauge}%`,
  o.hand != null && `첫 손패 +${o.hand}`,
  o.weak != null && `파티 약화 ${o.weak}`,
  o.hpCut != null && `파티 HP -${Math.round(o.hpCut * 100)}%`,
  o.rush != null && `첫 턴 적 전체 즉시 행동 ${o.rush}장 늦춤`,
  o.foeVuln != null && `적 전체 취약 ${o.foeVuln}`,
  o.quiet != null && `적 패시브 꺼짐 ${o.quiet}턴`,
  ...Object.entries(o.buff || {}).map(([id, v]) => `파티 ${id} ${v}`),
].filter(Boolean).join(" · ");

function neutralOffer(run, grade, n) {
  const has = new Set(run.deck);
  const pool = NEUTRAL_IDS.filter((id) => CARDS[id].playable && (!grade || CARDS[id].grade === grade) && !(R.isOnly(CARDS[id]) && has.has(id)));
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
      forgetCard(run, value);              // 뺀 고유 카드는 은총 · 상점에 다시 안 나온다
      E.log.push(`「${CARDS[value].name}」 — 덱에서 뺐습니다`);
      break;
    }
    case "shinPick": {
      if (value == null) { E.log.push("겨우살이의 축복 — 받지 않았습니다"); break; }
      if (!shinAble(run, p.kind).includes(value)) return "축복을 얹을 수 없는 카드입니다";
      // 그 카드만의 축복이 둘 이상이면 그 전부를 차례대로 보여 주고 고르게 한다(위력 · 비용을 정한 자리여도)
      const own = R.blessKeys(CARDS[value]);
      if (own.length > 1 || (!p.kind && own.length)) {
        E.pending.splice(1, 0, { k: "shinKind", cardId: value, options: own });
        break;
      }
      if (!p.kind) {
        const all = divineKindsFor(CARDS[value]);
        const picks = [];
        while (picks.length < 3 && all.length) picks.push(...all.splice(Math.floor(run.rng() * all.length), 1));
        E.pending.splice(1, 0, { k: "shinKind", cardId: value, options: picks });
        break;
      }
      run.shin = run.shin || {};
      run.shin[value] = CARDS[value].bless ? "own" : p.kind;      // 그 카드만의 축복이 있으면 그것
      E.log.push(`겨우살이의 축복! 「${CARDS[value].name}」 — ${R.shinLabel(CARDS[value], run.shin[value])}`);
      break;
    }
    case "shinKind": {
      if (value == null) { E.log.push("겨우살이의 축복 — 받지 않았습니다"); break; }
      if (!p.options.includes(value)) return "고를 수 없는 축복입니다";
      run.shin = run.shin || {};
      run.shin[p.cardId] = value;
      E.log.push(`겨우살이의 축복! 「${CARDS[p.cardId].name}」 — ${R.shinLabel(CARDS[p.cardId], value)}`);
      break;
    }
    case "dupe": {
      if (!run.deck.includes(value)) return "덱에 없는 카드입니다";
      if (powerCard(run, value)) return "강화 카드는 한 장만 — 복제할 수 없습니다";
      if (!dupeOk(value, run)) return "유일 — 덱에 한 장만 넣는 카드는 복제할 수 없습니다";
      const extra = dupeExtra(run, value);
      if (extra) {
        if ((run.gold || 0) < extra) return `신탁 · 기적이 붙은 카드는 복제에 골드 ${extra} ${josa(String(extra), "이가")} 더 듭니다 (지금 ${run.gold || 0})`;
        run.gold -= extra; E.log.push(`신탁 · 기적까지 옮겨 적느라 골드 -${extra}`);
      }
      run.deck.push(value);
      E.log.push(`「${CARDS[value].name}」 — 한 장 더`);
      break;
    }
    case "card": {
      if (value == null) { E.log.push(`${p.label} — 받지 않았습니다`); break; }
      if (!p.cards.includes(value)) return "고를 수 없는 카드입니다";
      { const why = powerWhy(run, value); if (why) return why; }
      run.deck.push(value);
      E.log.push(`「${CARDS[value].name}」 — 덱에`);
      break;
    }
    case "flash": {
      if (value == null) { E.log.push("신탁 — 받지 않았습니다"); break; }
      if (!p.offer.picks.includes(value)) return "고를 수 없는 신탁입니다";
      run.flash[p.offer.cardId] = value;
      const f = CARDS[p.offer.cardId].flash[value - 1];
      E.log.push(`「${CARDS[p.offer.cardId].name}」 — 신탁 「${f.ko}」`);
      // 기적 — 신탁 위에 드물게 한 줄 더(배율 ×1.3). 「꽃을 꺾으면」 이번 판은 안 뜬다
      if (E.shinChance && !run.noShin && run.rng() < E.shinChance) {
        run.shin = run.shin || {};
        run.shin[p.offer.cardId] = ownRandom(run, CARDS[p.offer.cardId]) || true;
        E.log.push(`겨우살이의 축복! 신탁 위에 한 줄이 더 (${R.shinLabel(CARDS[p.offer.cardId], run.shin[p.offer.cardId])})`);
      }
      break;
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
  E.log.push(`${을를(f.name)} 물리쳤습니다`);
  let out = f.win;
  if (f.winGamble) {
    let r = run.rng(), g = f.winGamble[f.winGamble.length - 1];
    for (const x of f.winGamble) { if ((r -= x.p) < 0) { g = x; break; } }
    out = g.out;
  }
  apply(run, parseOut(out));
}

// 카드 복제 — 고를 수 있는가 · 웃돈. 신탁 · 기적은 카드 종류(id)에 붙어 있어 복제본도 그대로 가진다
// 기적을 얹을 수 있는 카드 — 덱의 카드 종류 중 기적이 아직 없는 것. 「비용 -1」 은 1코 이상만. 골칫거리는 뺀다
export function shinAble(run, kind) {
  const ids = [...new Set(run.deck)].filter((id) => CARDS[id] && !CARDS[id].curse && !(run.shin || {})[id]);
  if (kind === "cost") return ids.filter((id) => typeof CARDS[id].cost === "number" && CARDS[id].cost >= 1);
  return kind ? ids : ids.filter((id) => divineKindsFor(CARDS[id]).length);
}
// 고르지 않고 받는 축복(「기적 1」 · 신탁 위 기적) — 그 카드만의 축복이 있으면 그 가운데 하나를 run.rng 로. 없으면 null
function ownRandom(run, c) {
  const own = R.blessKeys(c);
  return own.length ? own[Math.floor(run.rng() * own.length)] : null;
}
// 강화 카드(rules.js isPower)도 한 장만 — 복제할 수 없다. run 을 주면 「강화 카드.」 신탁을 붙인 카드도 막는다
// 복제 — 유일(rules.js isOnly)과 금기(rules.js isTaboo — v6 카제나)는 안 된다
export function dupeOk(id, run) { const c = CARDS[id]; return !!c && !R.isOnly(run ? flashed(c, (run.flash || {})[id]) : c) && !R.isTaboo(c); }
export function dupeExtra(run, id) { return (run.flash || {})[id] || (run.shin || {})[id] ? R.DUPE_FLASH_EXTRA : 0; }

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
