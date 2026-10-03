// 한 판을 처음부터 끝까지 화면 없이 — 지도 · 싸움 · 이벤트 · 캠프 · 상점 · 장비. 흐름은 js/main.js 그대로다.
// 전투 밖에서 고르는 것도 두 갈래:
//   simple  아무 생각 없는 손 — 지도는 첫 갈래, 캠프는 늘 쉬기, 상점은 그냥 지나감, 이벤트는 첫 선택지, 장비는 빈 칸에만
//   smart   사람처럼 — 지도는 HP 와 골드를 보고 길 전체를 따져서, 캠프는 HP 가 낮으면 쉬고 아니면 수련,
//           상점은 약한 시작 카드 빼기 · 쓸 만한 장비 · 교주 카드, 이벤트는 결과의 값어치로, 장비는 나아질 때 바꿔 낀다
// 난수는 판(run.rng)과 전투(제 씨앗)의 것만 쓴다 — 같은 씨앗이면 같은 판이다.
import { valueOf } from "./card-value.js";

export function makeRunner({ C, B, R, RULES, M, EV, ENEMIES, FLOORS, bots }) {
  const { CARDS, EQUIP, HERO_DATA } = B;
  // 파티 HP 하나(docs/16 §8) — 사도는 늘 나선다
  const alive = (run) => ((run.partyHp || 0) > 0 ? run.party.slice() : []);
  const hpRatio = (run) => (run.partyHp || 0) / (run.partyMaxHp || 1);
  const minRatio = hpRatio;
  const cardEff = (id, n) => {
    const c = n ? B.flashed(CARDS[id], n) : CARDS[id];
    if (!c) return 0;
    if (c.curse) return -2;
    const cost = c.xcost || c.cost === "X" ? 3 : c.cost;
    return valueOf(c.fx) / (0.5 + (cost || 0)) + (cost === 0 && valueOf(c.fx) > 0 ? 0.3 : 0);
  };
  const deckEff = (run, id) => cardEff(id, (run.flash || {})[id]);

  // ── 장비 ──────────────────────────────────────────────────────────────
  function gearScore(id, k) {
    if (!id) return 0;
    const e = EQUIP[id], s = R.statsOf(id, k), role = (HERO_DATA[k] || {}).role;
    const atkW = role === "딜러" ? 3 : role === "서포터" ? 1.8 : 1.4;
    // 스탯은 v6 눈금(옛 값 ×10 — rules.js SCALE). 치유도 방어력이라 서포터의 방어 몫이 크다
    const KS = RULES.SCALE || 1;
    let v = (s.hp * 0.3 + s.atk * atkW + s.def * (role === "탱커" ? 2.2 : role === "서포터" ? 2 : 1)) / KS + s.crit * 0.25;
    if (e.effect && e.effectRead) v += 4;
    if (e.affinity === k && e.affinityRead) v += 5;
    return v;
  }
  function manageGear(run, smart) {
    for (const id of run.bag.slice()) {
      const e = EQUIP[id]; if (!e) continue;
      let best = null, gain = smart ? 0.5 : -1e9;
      for (const k of run.party) {
        const old = R.gearOf(run, k)[e.slot];
        if (!smart) { if (!old) { best = k; break; } continue; }
        const g = gearScore(id, k) - gearScore(old, k) - (old ? 0 : -1);
        if (g > gain) { gain = g; best = k; }
      }
      // 가방이 없다(2026-10 사용자) — 낄 사도가 없으면 판다. 생각 없는 봇도 남겨 두지 않는다
      if (best) R.equip(run, best, id, { replace: true });
      else R.sellEquip(run, id);
    }
  }

  // ── 전투 ──────────────────────────────────────────────────────────────
  // 싸움 칸의 갈래 — 갈래마다 턴을 따로 센다(run-sim 의 표)
  const kindOf = (run) => (run.eventFight ? (run.eventFight.elite ? "eventElite" : "event") : R.isFinal(run) ? "final" : R.isBoss(run) ? "boss" : run.elite ? "elite" : "fight");
  function fight(run, P, out) {
    const kind = `${R.isFinal(run) ? "F" : run.floor + 1}:${kindOf(run)}`;
    // hpx · dmgx — 적 체력 · 피해를 rules.js 의 층마다 값 위에 더 곱해 잴 때(run-sim --hp · --dmg)
    const { st, loot } = R.openFight(run, { hpx: P.hpx || 1, dmgx: P.dmgx || 1 });
    const r = rngOf(run.seed * 31 + (run.step || 0));
    let t = 0;
    if (P.onFight) P.onFight(st, run);
    while (!st.over && t++ < 40) {
      if (P.smartFight) bots.smartPlay(st, { depth: P.depth, width: P.width, trace: P.trace && ((m, v, s0) => P.trace(st, m, v, s0)) });
      else bots.simplePlay(st, r, null);
      if (!st.over) { if (P.trace) P.trace(st, null); C.endTurn(st); }
    }
    out.fights++; out.turns += st.turn;
    const kk = ((out.kinds = out.kinds || {})[kind] = out.kinds[kind] || { n: 0, turns: 0, win: 0 });
    kk.n++; kk.turns += st.turn; if (st.over === "win") kk.win++;
    R.afterFight(run, st);
    if (st.over !== "win") return false;
    if (loot) {
      if (loot.equip && loot.equip.length && !loot.equipTaken) R.takeEquip(run, loot.equip[0]);
      R.takeReward(run, null);
    }
    manageGear(run, P.smartOut);
    return true;
  }
  function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── 지도 ──────────────────────────────────────────────────────────────
  // 칸의 값 — 지금 HP · 골드로 매기고, 보스까지 가는 길 가운데 합이 가장 큰 길의 첫 칸을 고른다
  function pickNode(run, smart) {
    const ids = M.reachable(run);
    if (!smart || ids.length === 1) return ids[0];
    const map = M.mapOf(run), h = hpRatio(run), lo = minRatio(run), g = run.gold;
    const val = (n) => {
      switch (n.type) {
        case "fight": return h < 0.35 ? -2 : 3;
        case "elite": return h >= 0.8 && lo >= 0.5 ? 8 : h >= 0.6 ? 2 : -10;
        case "event": return 4;
        case "camp": return h < 0.6 ? 9 : 4;
        case "campshop": return (h < 0.6 ? 9 : 4) + (g >= 100 ? 5 : 1);
        default: return 0;
      }
    };
    const memo = new Map();
    const best = (id) => {
      if (memo.has(id)) return memo.get(id);
      const n = M.nodeById(map, id);
      const v = val(n) + Math.max(0, ...n.next.map(best));
      memo.set(id, v);
      return v;
    };
    let pick = ids[0], bv = -1e9;
    for (const id of ids) { const v = best(id); if (v > bv) { bv = v; pick = id; } }
    return pick;
  }

  // ── 캠프 · 상점 ───────────────────────────────────────────────────────
  function trainPick(run) {
    const o = run.camp && run.camp.train;
    if (!o) return null;
    let n = o.picks[0], bv = -1e9;
    for (const x of o.picks) { const v = cardEff(o.cardId, x); if (v > bv) { bv = v; n = x; } }
    return { cardId: o.cardId, n };
  }
  function camp(run, kind, P) {
    R.enterCamp(run, kind);
    if (P.smartOut) {
      if (kind === "campshop") shop(run);
      const h = hpRatio(run), lo = minRatio(run);
      const bossNext = kind === "final" || M.reachable(run).some((id) => (M.nodeById(M.mapOf(run), id) || {}).type === "boss");
      const tp = trainPick(run);
      if (!tp || h < (bossNext ? 0.75 : 0.55) || lo < 0.35) R.campRest(run); else R.campTrain(run, tp);
      manageGear(run, true);
    } else {
      R.campRest(run);
      manageGear(run, false);
    }
  }
  function worstCard(run) {
    let w = null, wv = 1e9;
    for (const id of run.deck) { const v = deckEff(run, id) + (CARDS[id] && CARDS[id].unique ? 0.5 : 0); if (v < wv) { wv = v; w = id; } }
    return w;
  }
  function shop(run) {
    const at = run.map && run.map.at;
    if (!run.shop || run.shop.floor !== run.floor || run.shop.at !== at) { R.rollShop(run); run.shop.at = at; }
    // 장비 — 누구 칸이든 지금보다 확실히 나아지면. 그다음 약한 카드 빼기, 남는 골드로 쓸 만한 교주 카드
    const items = run.shop.items;
    const eqGain = (id) => Math.max(...run.party.map((k) => gearScore(id, k) - gearScore(R.gearOf(run, k)[EQUIP[id].slot], k)));
    const order = items.map((it, i) => ({ it, i, v: it.kind === "equip" ? eqGain(it.id) / Math.max(30, it.price) * 10 : (cardEff(it.id) - 0.9) * 2 / Math.max(30, it.price) * 100 }))
      .filter((x) => !x.it.sold).sort((a, b) => b.v - a.v);
    for (const x of order) {
      if (x.it.kind === "equip" && x.v > 0.5 && run.gold >= x.it.price) { R.buy(run, x.i); manageGear(run, true); }
    }
    const w = worstCard(run);
    if (w && run.deck.length > 8 && deckEff(run, w) < 1.0 && run.gold >= R.removePrice(run)) R.removeCard(run, w);
    for (const x of order) {
      if (x.it.kind === "neutral" && !x.it.sold && cardEff(x.it.id) >= 1.1 && run.gold - x.it.price >= 0) R.buy(run, x.i);
    }
  }

  // ── 이벤트 ────────────────────────────────────────────────────────────
  const GRADE_V = { 일반: 10, 고급: 15, 희귀: 22, 전설: 30 };
  // HP 는 v6 눈금(rules.js SCALE — 옛 값 ×10)이다. 아래 값은 옛 눈금의 HP 하나 = 1 로 잡았다 — HP 몫은 K 로 나눈다
  const K = RULES.SCALE || 1;
  function opsValue(run, ops) {
    let v = 0;
    const live = alive(run);
    for (const o of ops) {
      switch (o.k) {
        case "gold": v += 0.2 * Math.max(o.v, -run.gold); break;
        case "hp": {
          // 파티 HP — 셋을 합친 몸(옛 셈의 사도 셋 몫을 더한 것과 같은 눈금)
          const d = Math.round(run.partyMaxHp * o.v);
          if (d > 0) v += Math.min(d, run.partyMaxHp - run.partyHp) / K;
          else v += (d * (run.partyHp + d < run.partyMaxHp * 0.3 ? 2 : 1.1)) / K;
          break;
        }
        case "maxHp": v += (o.v * 1.2) / K; break;
        case "remove": v += run.deck.some((id) => CARDS[id] && CARDS[id].curse) ? 30 : 14; break;
        case "dupe": v += 10; break;
        case "unique": v += 20; break;
        case "neutral": v += o.grade === "전설" ? 20 : o.grade === "희귀" ? 15 : 10; break;
        case "equip": v += GRADE_V[o.grade] || 10; break;
        case "flash": v += 14; break;
        case "shin": v += 15 * o.p; break;
        case "shinPick": v += 12 * o.n; break;
        case "shinNow": v += 12; break;
        case "noShin": v -= 2; break;
        case "curse": v -= 25; break;
        case "scout": v += 2; break;
        case "shopGift": v += (GRADE_V[o.grade] || 10) * 0.8; break;
        case "rewardFlash": v += 8; break;
        case "next":
          v += 8 * (o.ap || 0) + 0.1 * (o.gauge || 0) + 4 * (o.hand || 0) - 6 * (o.weak || 0) + 3 * (o.rush || 0) + 4 * (o.foeVuln || 0) + 3 * (o.quiet || 0);
          if (o.hpCut) v -= (o.hpCut * run.partyMaxHp) / K;
          break;
      }
    }
    return v;
  }
  function optValue(run, opt) {
    if (EV.lockOf(run, opt)) return -1e9;
    if (opt.fight) {
      const hpx = RULES.foeScale(run.floor, { elite: !!opt.fight.elite }).hp;
      const foeHp = EV.foesOf(run, opt.fight).reduce((a, id) => a + ((ENEMIES[id] || {}).hp || 40) * hpx, 0);
      const win = opt.fight.winGamble ? opt.fight.winGamble.reduce((a, g) => a + g.p * opsValue(run, EV.parseOut(g.out)), 0) : opsValue(run, EV.parseOut(opt.fight.win || ""));
      const h = hpRatio(run);
      return win + 10 - (foeHp * 0.25) / K - (h < 0.6 ? 60 : 0);
    }
    if (opt.gamble) {
      const vs = opt.gamble.map((g) => opsValue(run, EV.parseOut(g.out)));
      return opt.choose ? Math.max(...vs) : opt.gamble.reduce((a, g, i) => a + g.p * vs[i], 0);
    }
    if (opt.judge) {
      const j = EV.judgeOf(run, opt);
      const pass = j.pass;
      return opsValue(run, EV.parseOut(pass ? opt.judge.pass : opt.judge.fail));
    }
    return opsValue(run, EV.parseOut(EV.outOf(run, opt)));
  }
  function resolvePending(run, smart) {
    let guard = 0;
    while (run.event && run.event.pending.length && guard++ < 30) {
      const p = run.event.pending[0];
      let val = null;
      const live = alive(run);
      switch (p.k) {
        case "remove": val = smart ? worstCard(run) : run.deck[0]; break;
        case "dupe": {
          const ok = [...new Set(run.deck)].filter((id) => EV.dupeOk(id, run) && run.gold >= EV.dupeExtra(run, id));
          val = smart ? ok.sort((a, b) => deckEff(run, b) - deckEff(run, a))[0] : ok[0];
          break;
        }
        case "card": val = smart ? p.cards.slice().sort((a, b) => cardEff(b) - cardEff(a))[0] : p.cards[0]; break;
        case "flash": val = smart ? p.offer.picks.slice().sort((a, b) => cardEff(p.offer.cardId, b) - cardEff(p.offer.cardId, a))[0] : p.offer.picks[0]; break;
        case "gambleChoice": val = smart ? p.options.slice().sort((a, b) => opsValue(run, EV.parseOut(b)) - opsValue(run, EV.parseOut(a)))[0] : p.options[0]; break;
        case "shinPick": {
          const able = EV.shinAble(run, p.kind);
          val = smart ? able.sort((a, b) => (p.kind === "cost" ? (CARDS[b].cost || 0) - (CARDS[a].cost || 0) : 0) || deckEff(run, b) - deckEff(run, a))[0] : able[0];
          break;
        }
        case "shinKind": {
          const c = CARDS[p.cardId];
          val = !smart ? p.options[0] : p.options.includes("cost") && (c.cost || 0) >= 2 ? "cost" : p.options.includes("power") ? "power" : p.options.includes("ap") ? "ap" : p.options[0];
          break;
        }
      }
      const why = EV.resolve(run, val == null ? null : val);
      if (why) run.event.pending.shift();       // 고를 것이 없으면(덱에 맞는 카드가 없다 따위) 건너뛴다
    }
  }
  function event(run, P, out) {
    if (!EV.eventLeft(run)) return true;
    EV.enterEvent(run);
    const E = run.event;
    if (!E.id && E.choices.length) EV.pickEvent(run, P.smartOut ? E.choices.map((id) => [id, Math.max(...EV.optionsOf(run, EV.eventById(id)).map((o) => optValue(run, o)))]).sort((a, b) => b[1] - a[1])[0][0] : E.choices[0]);
    const ev = EV.eventById(run.event.id);
    if (!ev) { EV.leaveEvent(run); return true; }
    const opts = EV.optionsOf(run, ev);
    let idx = 0;
    if (P.smartOut) { let bv = -1e9; opts.forEach((o, i) => { const v = optValue(run, o); if (v > bv) { bv = v; idx = i; } }); }
    else idx = opts.findIndex((o) => !EV.lockOf(run, o));
    const r = EV.choose(run, idx);
    if (r.fight) {
      const won = fight(run, P, out);
      if (!won) { run.eventFight = null; return false; }
      EV.afterEventFight(run, true);
    }
    resolvePending(run, P.smartOut);
    EV.leaveEvent(run);
    manageGear(run, P.smartOut);
    return true;
  }

  // ── 한 판 ─────────────────────────────────────────────────────────────
  // P: { smartFight, smartOut, depth, width, hpx, dmgx, trace }
  // 돌려주는 것: { clear, floor(쓰러진 층 0~2, 3 은 마지막 싸움), node(쓰러진 칸 종류), fights, turns, kinds({ "1:boss": { n, turns, win } }) }
  function runFull(party, seed, P) {
    const rows = {};
    for (const k of party) rows[k] = (HERO_DATA[k] || {}).row || "mid";
    const run = R.newRun(party, rows, seed);
    const out = { clear: false, floor: 0, where: null, fights: 0, turns: 0 };
    let guard = 0;
    while (!run.done && guard++ < 200) {
      M.mapOf(run);
      const id = pickNode(run, P.smartOut);
      const node = M.enterNode(run, id);
      if (!node) break;
      out.floor = run.floor; out.where = node.type;
      if (node.type === "fight" || node.type === "elite" || node.type === "boss") {
        if (!fight(run, P, out)) return out;
        run.elite = false;
        if (!R.isBoss(run)) continue;
        { const off = R.bossCopyOffer(run); if (off.length) R.bossCopy(run, off[0]); }   // 층 보스의 몫 — 셋 중 첫째
        const next = R.advance(run);
        if (run.done === "clear") break;
        if (next.final) {
          camp(run, "final", P);
          out.floor = 3; out.where = "final";
          if (!fight(run, P, out)) return out;
          R.advance(run);
          break;
        }
      } else if (node.type === "event") { if (!event(run, P, out)) return out; }
      else if (node.type === "camp" || node.type === "campshop") camp(run, node.type, P);
    }
    out.clear = run.done === "clear";
    out.gold = run.gold; out.deck = run.deck.length;
    return out;
  }

  return { runFull, fight, gearScore };
}
