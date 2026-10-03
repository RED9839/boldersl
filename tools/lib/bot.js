// 모의전의 손(봇) — 전투에서 카드를 고르는 둘.
//   simple  옛 손(tools/role-sim.js 에 있던 그대로) — 글자 규칙으로 줄 세워 낸다. 견줄 때 쓴다
//   smart   사람만큼 하는 손 — 낼 수 있는 수(카드 × 대상 · 고학년 · 턴 넘기기)를 판을 복사해 실제로 둬 보고,
//           둔 뒤의 판을 점수로 매겨 가장 나은 것을 고른다. 점수는 HP 단위다(아래 score)
// 엔진은 부르는 쪽이 넘긴다(role-sim 의 --root 처럼 옛 사본으로도 돌게). 엔진은 읽기만 한다.
// 봇은 난수를 쓰지 않는다 — 복사한 판에는 고정 씨앗을 준다. 같은 씨앗이면 같은 판이 나온다.
import { valueOf } from "./card-value.js";

export function makeBots({ C, B, R, ENEMIES }) {
  const ATTACKS = ["attack", "back", "multi", "attackAll"];

  // ── 옛 손 ──────────────────────────────────────────────────────────────
  // 고학년은 차면 쓰고, 누가 절반 아래면 회복·방어부터, AP·드로우·키워드 쌓기를 먼저,
  // 그 사도 키워드를 쓰는 카드(only 의 것)는 키워드가 셋 이상일 때. 적이 큰 수를 당길 참이면 되돌리는 카드부터, 없으면 멈춘다.
  // only — 키워드 소모를 따질 사도(role-sim 의 그 사도). 없으면 따지지 않는다
  function simplePlay(s, r, only) {
    const D = only ? C.designOf(only) : null, KW = D && D.keyword && D.keyword.ko;
    const stackOf = (st) => (KW && ((st.stacks || {})[only] || {})[KW]) || 0;
    const spendRe = KW ? new RegExp(`「${KW}」\\s*(전부|\\d)\\s*소모|「${KW}」\\s*1\\s*개?\\s*당`) : null;   // 「「X」 1개당」(옛 글 「1당」)
    const text = (id) => (C.cardOf(s, id) || {}).text || "";
    const target = () => { let t = 0, best = 1e9; s.enemies.forEach((e, j) => { if (!e.dead && e.hp < best) { best = e.hp; t = j; } }); return t; };
    let g = 0;
    while (!s.over && g++ < 80) {
      for (const u of s.party) if (!C.canUlt(s, u.key)) { C.useUlt(s, u.key, target()); if (s.over) return; }
      const ok = s.hand.map((id, i) => i).filter((i) => !C.canPlay(s, s.hand[i]));
      if (!ok.length) break;
      const hurt = s.party.some((u) => !u.dead && u.hp < u.maxHp * 0.5);
      const score = (i) => {
        const id = s.hand[i], t = text(id), cost = C.costOf(s, id);
        const spend = spendRe && (C.cardOf(s, id) || {}).hero === only && spendRe.test(t);
        if (hurt && /회복|방어|실드|받는 피해 -/.test(t)) return 120;
        if (spend) return stackOf(s) >= 3 ? 50 + stackOf(s) : -10;
        if (/AP\s*\+\d/.test(t)) return 100;
        if (/드로우/.test(t)) return 80;
        if (/「[^」]+」\s*\+\d/.test(t)) return 60 + cost;
        return 30 + cost * 5 + r();
      };
      const near = C.rushOf && s.enemies.some((e) => !e.dead && !e.sealed && e.intent && C.rushOf(e) && (e.rushCnt || 0) + 1 >= C.rushOf(e)
        && ATTACKS.includes(e.intent.t));
      const calms = (i) => ((C.cardOf(s, s.hand[i]) || {}).fx || []).some((f) => f.k === "rushDown" || (f.k === "status" && f.id === "기절"));
      ok.sort((a, b) => (near ? calms(b) - calms(a) : 0) || score(b) - score(a));
      if (near && !calms(ok[0])) break;
      // 빛나는 카드 — 화면은 신탁을 고르기 전엔 못 낸다. 옛 손은 첫 선택지
      const gid = s.hand[ok[0]];
      if (C.glowOf && C.glowOf(s, gid)) C.applyEpiphany(s, gid, 0);
      if (!C.playCard(s, ok[0], target()).ok) break;
    }
  }

  // ── 사람만큼 하는 손 ───────────────────────────────────────────────────
  // 카드 값어치(card-value.js 단위: 「1코 공격 120%」 = 1) — 신탁 번호까지 같으면 같은 값이라 담아 둔다
  const cvCache = new Map();
  function cardValue(s, id) {
    const key = id + ":" + ((s.flash || {})[id] || 0);
    let v = cvCache.get(key);
    if (v == null) {
      const c = C.cardOf(s, id) || {};
      v = valueOf(c.fx);
      if (c.curse || c.status) v = -1;     // 저주(골칫거리) · 상태 카드 — 덱을 막는 것
      cvCache.set(key, v);
    }
    return v;
  }

  // 적 하나가 한 턴에 얼마나 아픈가 — 수의 평균(전체 공격은 셋을 친다). 처치 값어치에 쓴다
  const threatCache = new Map();
  function threatOf(key) {
    if (threatCache.has(key)) return threatCache.get(key);
    const d = ENEMIES[key] || {};
    const list = [...(d.intents || []), ...((d.phase && d.phase.intents) || [])];
    let sum = 0, n = 0;
    for (const it of list) { sum += hitOf(it.t === "charge" && it.next ? it.next : it) / (it.t === "charge" ? 2 : 1); n++; }
    const t = n ? sum / n : 5;
    threatCache.set(key, t);
    return t;
  }
  const hitOf = (it) => (!it ? 0 : it.t === "attack" || it.t === "back" ? it.v : it.t === "multi" ? it.v * (it.n || 1) : it.t === "attackAll" ? it.v * 2.6 : 0);

  // 엔진의 dealt · 받는 쪽 증감과 같은 셈 — 적의 차례에 아군이 실제로 받을 피해를 미리 센다
  const st = (u, id) => (u.status && u.status[id]) || 0;
  const V = R.STATUS_V;              // 상태 수치 — 엔진과 같은 한 표(rules.js)
  function dealtBy(e, v) {
    if (e.dmgx && e.dmgx !== 1 && v > 0) v = Math.max(1, Math.round(v * e.dmgx));   // 층마다 적 피해(rules.js foeScale)
    let m = 1;
    if (st(e, "약화") > 0) m *= 1 - V.약화;
    if (st(e, "감전") > 0) m *= 0.9;
    if (st(e, "중독") > 0) m *= Math.max(0.7, 1 - 0.02 * st(e, "중독"));
    const up = st(e, "사기") > 0 ? 1 + V.사기 : 1;
    return Math.max(0, Math.round((v + st(e, "힘")) * Math.max(0.5, m) * up));
  }
  // left — 이번 적의 차례에 남은 취약 · 불굴 겹(사도마다). 적의 수 하나에 1 씩 쓴다(엔진 charge 와 같다)
  function hitTo(s, e, u, v, left) {
    if (u.invuln) return 0;
    const l = left && left.get(u);
    const vul = l ? l.vul > 0 : st(u, "취약") > 0, fort = l ? l.fort > 0 : st(u, "불굴") > 0;
    let d = Math.round(v * (vul ? 1 + V.취약 : 1) * (fort ? 1 - V.불굴 : 1));
    if (!s.noNature) { const ed = R.natureEdge(C.natureOf(e.key), C.natureOf(u.key)); if (ed > 0) d = Math.round(d * (1 + R.NATURE_DMG)); else if (ed < 0) d = Math.round(d * (1 - R.NATURE_DEF)); }
    const m = (1 + C.statOf(s, e, "dealt")) * (1 + C.statOf(s, u, "taken"));
    return Math.max(0, Math.round(d * Math.max(0.1, m)));
  }
  // 엔진 pickTarget 과 같은 순서 — 도발 · 앞줄부터(뒤를 노리면 뒷줄부터) · 같은 열이면 적 쪽(파티 순서가 뒤)
  const ROWS = ["front", "mid", "back"];
  function pickT(s, live, fromBack) {
    if (!live.length) return null;
    if (s.taunt) { const t = live.find((u) => u.key === s.taunt); if (t) return t; }
    for (const r of fromBack ? ROWS.slice().reverse() : ROWS) {
      const inRow = live.filter((u) => u.row === r);
      if (inRow.length) return inRow.reduce((a, b) => (fromBack ? (b.idx < a.idx ? b : a) : (b.idx > a.idx ? b : a)));
    }
    return live[0];
  }
  // 이번 적의 차례에 사도마다 빠질 HP(방어 · 실드 · 무적 · 도발 · 봉인 · 침묵을 넣고) + 다음 턴에 쏟을 힘
  function incoming(s) {
    const pool = new Map();       // 사도 → { hp, guard }
    const left = new Map();       // 사도 → 남은 취약 · 불굴 겹
    for (const u of s.party) if (!u.dead) { pool.set(u, { hp: u.hp, guard: (u.block || 0) + (u.shield || 0), lost: 0 }); left.set(u, { vul: st(u, "취약"), fort: st(u, "불굴") }); }
    const live = () => [...pool.keys()].filter((u) => pool.get(u).hp > 0);
    let used = new Set();         // 이번 적의 수에 맞은 사도 — 수 하나가 끝나면 겹을 1 씩 뺀다
    const done = () => { for (const u of used) { const l = left.get(u); l.vul = Math.max(0, l.vul - 1); l.fort = Math.max(0, l.fort - 1); } used = new Set(); };
    const hit = (e, u, v) => {
      const p = pool.get(u); if (!p) return;
      used.add(u);
      let d = hitTo(s, e, u, v, left);
      const a = Math.min(p.guard, d); p.guard -= a; d -= a;
      p.hp -= d; p.lost += d;
    };
    let later = 0, misc = 0;
    for (const e of s.enemies) {
      if (e.dead || !e.intent) continue;
      const it = e.intent;
      if (e.sealed) continue;
      if (st(e, "침묵") > 0 && !ATTACKS.includes(it.t)) continue;
      if (it.t === "attack" || it.t === "back") { const t = pickT(s, live(), it.t === "back"); if (t) hit(e, t, dealtBy(e, it.v)); }
      else if (it.t === "multi") { const d = dealtBy(e, it.v); for (let k = 0; k < (it.n || 1); k++) { const t = pickT(s, live(), false); if (!t) break; hit(e, t, d); } }
      else if (it.t === "attackAll") { const d = dealtBy(e, it.v); for (const t of live()) hit(e, t, d); }
      else if (it.t === "charge") later += hitOf(it.next) * (e.dmgx || 1);
      else if (it.t === "jam") misc += 5 * (it.v || 1);
      else if (it.t === "buff") misc += 2 * (it.v || 1);
      else if (it.t === "debuff") misc += 3 * (it.v || 1);
      else if (it.t === "heal") misc += (it.v || 0) * 0.8;
      else if (it.t === "addCard") misc += 3 * (it.n || 1);   // 상태 카드 — 손 · 더미를 막는다
      done();
    }
    return { pool, later, misc };
  }

  // 손에 남은 카드로 이번 턴에 더 할 수 있는 것 — 남은 AP 로 값어치 높은 순(코스트당)으로 채운다.
  // 드로우 · AP 를 얻는 수가 값을 갖게 하고, 남은 AP 를 버리고 턴을 넘기지 않게 한다
  function potential(s) {
    let ap = s.ap;
    const cards = [];
    for (const id of s.hand) {
      const c = C.cardOf(s, id); if (!c) continue;
      if (c.hero) { const o = s.party.find((u) => u.key === c.hero); if (!o || o.dead) continue; }
      // 연계 · 천상 — 손에 들고 있으면 다른 카드를 낼 때 공짜로 나간다. 비용 0 으로 치되, 깨울 카드가 있어야 하니 덜 친다
      const auto = C.hasTag && (C.hasTag(c, "연계") || C.hasTag(c, "천상"));
      const cost = auto ? 0 : c.xcost ? Math.max(1, ap) : C.costOf(s, id);
      const v = cardValue(s, id) * (auto ? 0.7 : 1);
      if (v <= 0) continue;
      const o = c.hero ? s.party.find((u) => u.key === c.hero) : null;
      cards.push({ cost, v: v * 1.2 * (o ? o.atk : 12) });
    }
    cards.sort((a, b) => b.v / (b.cost + 0.5) - a.v / (a.cost + 0.5));
    let sum = 0;
    for (const x of cards) if (x.cost <= ap) { ap -= x.cost; sum += x.v; }
    return sum;
  }

  const MOD_W = { atk: 12, dealt: 12, crit: 4, heal: 4, def: 6, taken: -14 };
  const BOON_W = 9;          // 판 내내 증감 — 3턴 몫(이번 전투) × 전투 셋
  const KNOWN = new Set(["취약", "약화", "감전", "중독", "힘", "침묵", "가시", "사기", "불굴", "결의", "결정화", "반격", "고통", "손상", "표식"]);
  // 상태 한 겹의 값어치(HP 단위, 겹 규칙 — 한 번 돌면 1 준다). 적에게 건 것 · 아군에게 건 것
  //   취약 한 겹 ≈ 카드 한 장 피해의 절반 · 약화(적) 첫 겹은 incoming 이 이미 센다 · 표식 ≈ 덤 타격 하나 + 강인도
  //   고통 n 은 n + n/2 + … ≈ 2n · 사기 ≈ 카드 한 장의 +20% · 결의 · 반격 · 결정화는 방어력에 비례
  const FOE_ST = { 취약: 5, 약화: 2, 고통: 1.9, 손상: 0.5, 표식: 9, 사기: -3, 불굴: -3, 결의: -2, 결정화: -3, 반격: -4 };
  const ALLY_ST = { 사기: 3, 불굴: 2, 결의: 3, 결정화: 4, 반격: 5, 취약: -3, 약화: -3, 고통: -2, 손상: -1 };
  const TOUGH_W = 2, BROKEN_W = 4;   // 강인도 칸 하나 · 격파(HP 단위)
  // 판의 점수 — HP 단위. 높을수록 좋다.
  //   적: 깎은 HP(남은 HP 를 뺀다) · 처치(그 적의 아픔에 비례) · 다 잡으면 승리
  //   아군: 적의 차례 뒤 남을 HP × 1.3 · 쓰러질 사도는 크게 깎는다 · 다음 턴에 쏟을 힘 · 방해
  //   그 밖: 버프 · 디버프(남은 턴) · 키워드 · 게이지 · 실드 · 이번 턴에 더 할 수 있는 것(withPot)
  function score(s, withPot) {
    if (s.over === "lose") return -1e6;
    let v = 0;
    if (s.over === "win") v += 5000;
    for (const e of s.enemies) {
      if (e.dead) { v += 12 + 3 * threatOf(e.key); continue; }
      v -= e.hp;
      v += 0.8 * st(e, "중독") + 1.5 * st(e, "감전") + 1 * st(e, "침묵") - 2 * st(e, "힘");
      for (const [k, w] of Object.entries(FOE_ST)) v += w * Math.max(0, st(e, k) - (k === "약화" ? 1 : 0));
      for (const [k, n] of Object.entries(e.status || {})) if (!KNOWN.has(k)) v += 1.2 * n;
      // 강인도 — 깎은 칸마다 조금, 격파면 더(격파의 AP +1 은 potential 이, 덤 피해는 다음 수의 깎인 HP 가 센다).
      // 덜 깎인 칸은 다음 턴에도 남아 몰아 치면 격파로 이어진다
      if (e.toughMax) v += TOUGH_W * (e.toughMax - e.tough) + (e.broken ? BROKEN_W : 0);
      for (const m of e.mods || []) { const w = m.stat === "taken" ? 10 : m.stat === "dealt" || m.stat === "atk" ? -10 : 0; v += w * m.v * Math.min(m.left, 3); }
    }
    if (s.over !== "win") {
      const inc = incoming(s);
      for (const u of s.party) {
        if (u.dead) { v -= 150; continue; }
        const p = inc.pool.get(u);
        const left = p ? p.hp : u.hp;
        if (left <= 0) v -= 150 + u.maxHp * 0.5;
        else {
          v += 1.3 * left;
          // 낮은 HP 는 다음 수에 쓰러질 수 있다 — 25% 아래는 더 아프게
          if (left < u.maxHp * 0.25) v -= (u.maxHp * 0.25 - left) * 0.8;
          v += 0.4 * (u.shield || 0);
        }
      }
      v -= 0.4 * inc.later + inc.misc;
    } else for (const u of s.party) v += u.dead ? -150 : 1.3 * u.hp;
    for (const u of s.party) {
      if (u.dead) continue;
      v += 3 * st(u, "힘");
      for (const [k, w] of Object.entries(ALLY_ST)) v += w * st(u, k) * (k === "사기" ? (u.role === "딜러" ? 1.4 : 0.8) : 1);
      const rw = u.role === "딜러" ? 1.4 : 0.8;
      // 「판 내내」(강화 카드 · m.run) — 이번 전투 끝까지에 다음 전투들까지 간다. 일찍 낼수록 이득이라 크게 친다(전투 셋 몫)
      for (const m of u.mods || []) v += (MOD_W[m.stat] || 0) * rw * m.v * (m.run ? BOON_W : Math.min(m.left, 3));
    }
    for (const bag of Object.values(s.stacks || {})) for (const n of Object.values(bag)) v += 1.5 * n;
    v += 0.06 * s.gauge;
    // 턴 끝에 손에 있으면 아픈 카드(상태 카드) — 들고 넘기면 그만큼 깎인다
    for (const id of s.hand) { const c = C.cardOf(s, id); if (c && (c.fx || []).some((f) => f.k === "when" && f.on === "handEnd")) v -= 6; }
    v -= 5 * (s.apJam || 0);
    if (withPot && s.over !== "win") v += 0.6 * potential(s);
    return v;
  }

  // 판 복사 — 미리보기(C.previewCard)와 같은 방법. 기록 · 연출 쪽지는 빼고, 난수는 고정 씨앗
  function clone(s) {
    const { rng, log, fx, ...rest } = s;
    const sh = structuredClone(rest);
    sh.log = [];
    sh.rng = C.makeRng(7);
    sh.preview = true;
    return sh;
  }

  // 신탁 고르기 — 고른 뒤 그 카드의 값어치 ÷ 기준 값어치가 가장 큰 것(축복이 붙으면 조금 더)
  function epiChoice(s, id) {
    const g = C.glowOf(s, id);
    if (!g || g.kind !== "card") return 0;
    let best = 0, bv = -1e9;
    g.options.forEach((o, i) => {
      const c = B.flashed(B.CARDS[id], o.n);
      const cost = c.cost === "X" || c.xcost ? 3 : c.cost;
      const v = valueOf(c.fx) / (0.5 + cost) + (o.shin ? 0.25 : 0) + (cost === 0 ? 0.2 : 0);
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  // 낼 수 있는 수를 모두 늘어놓는다 — { k: "card", i, t, ally, discard } · { k: "ult", hero, t }
  function moves(s) {
    const out = [];
    const foes = s.enemies.filter((e) => !e.dead).map((e) => e.idx);
    const allies = s.party.filter((u) => !u.dead).map((u) => u.idx);
    const seen = new Set();
    s.hand.forEach((id, i) => {
      if (seen.has(id) || C.canPlay(s, id)) return;
      seen.add(id);
      const c = C.cardOf(s, id);
      const fx = c.fx || [];
      const single = fx.some((f) => f.target === "oneEnemy" || (f.k === "dmg" && !f.target)) || !c.built;
      const ts = c.target === "적" ? (single ? foes : [foes[0] ?? 0]) : c.target === "아군" ? allies : [0];
      const allyToo = c.target === "적" && fx.some((f) => f.target === "oneAlly") && allies.length > 1;
      let discard;
      const need = C.discardChoice(s, i);
      if (need > 0) discard = s.hand.filter((_, j) => j !== i).map((x) => [x, cardValue(s, x)]).sort((a, b) => a[1] - b[1]).slice(0, need).map(([x]) => x);
      for (const t of ts) {
        if (allyToo) for (const a of allies) out.push({ k: "card", i, id, t, ally: a, discard });
        else out.push({ k: "card", i, id, t, discard });
      }
    });
    for (const u of s.party) {
      if (C.canUlt(s, u.key)) continue;
      const fx = (C.ultOf(u.key) || {}).fx || [];
      const ts = fx.some((f) => f.target === "oneEnemy") ? foes : fx.some((f) => f.target === "oneAlly") ? allies : [foes[0] ?? 0];
      for (const t of ts) out.push({ k: "ult", hero: u.key, t });
    }
    return out;
  }

  function apply(s, m) {
    if (m.k === "ult") return C.useUlt(s, m.hero, m.t).ok;
    const id = s.hand[m.i];
    const g = C.glowOf(s, id);
    if (g) C.applyEpiphany(s, id, g.kind === "card" ? epiChoice(s, id) : 0);
    const opts = {};
    if (m.ally != null) opts.ally = m.ally;
    if (m.discard) opts.discard = m.discard.slice();
    return C.playCard(s, m.i, m.t, opts).ok;
  }

  // 한 수 둬 본 판의 점수 — 복사본에서. 실패하면 null
  function tryMove(s, m) {
    const sh = clone(s);
    let ok = false;
    try { ok = apply(sh, m); } catch { ok = false; }
    return ok ? sh : null;
  }

  // 이번 턴에 둘 수를 하나씩 고른다. 턴 넘기기의 점수(남은 것 없이)보다 나은 수가 없으면 멈춘다.
  // depth 2 — 점수가 높은 수 width 개에 대해 그다음 한 수까지 둬 보고 더 나은 쪽(두 장을 묶어야 사는 수를 찾는다)
  function smartPlay(s, opt = {}) {
    const depth = opt.depth || 1, width = opt.width || 3, trace = opt.trace;
    let g = 0;
    while (!s.over && g++ < 60) {
      const stop = score(s, false);
      const ms = moves(s);
      if (!ms.length) break;
      const tried = [];
      for (const m of ms) { const sh = tryMove(s, m); if (sh) tried.push({ m, sh, v: score(sh, true) }); }
      if (!tried.length) break;
      tried.sort((a, b) => b.v - a.v);
      if (depth > 1) {
        for (const x of tried.slice(0, width)) {
          if (x.sh.over) continue;
          let best = score(x.sh, false);
          for (const m2 of moves(x.sh)) { const sh2 = tryMove(x.sh, m2); if (sh2) best = Math.max(best, score(sh2, true)); }
          x.v2 = Math.max(x.v, best);
        }
        tried.sort((a, b) => (b.v2 ?? b.v) - (a.v2 ?? a.v));
      }
      const top = tried[0];
      if ((top.v2 ?? top.v) <= stop + 0.01) break;
      if (trace) trace(describe(s, top.m), top.v2 ?? top.v, stop);
      if (!apply(s, top.m)) break;
    }
  }

  function describe(s, m) {
    const nm = (i) => { const e = s.enemies.find((x) => x.idx === i); return e ? e.ko : "-"; };
    const an = (i) => { const u = s.party.find((x) => x.idx === i); return u ? u.ko : "-"; };
    if (m.k === "ult") { const u = s.party.find((x) => x.key === m.hero); return `고학년 ${u.ko} 「${(C.ultOf(m.hero) || {}).ko}」 → ${nm(m.t)}`; }
    const c = C.cardOf(s, m.id);
    const tgt = c.target === "적" ? ` → ${nm(m.t)}` : c.target === "아군" ? ` → ${an(m.t)}` : "";
    return `「${c.name}」(${C.costOf(s, m.id)}AP · ${(B.HERO_DATA[c.hero] || {}).ko || "교주"})${tgt}${m.ally != null ? ` · 아군 ${an(m.ally)}` : ""}${m.discard ? ` · 버림 ${m.discard.length}` : ""}${C.glowOf(s, m.id) ? " · 신탁" : ""}`;
  }

  return { simplePlay, smartPlay, score, incoming, cardValue, epiChoice, clone };
}
