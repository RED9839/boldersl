// 기획서에서 읽은 효과 조각을 실제로 실행한다.
//
// 수치는 전부 **스탯 기반 %** 다(기획서 · 카제나) — 피해는 공격력 × 배율, 방어·실드·치유는 방어력 × 배율,
// 방어 기반 피해는 (방어력 × 2.1 + 공격력 × 0.3) × 배율(rules.js DEF_DMG). 계산식은 rules.js 의 finalDamage 를 따른다.
//
// 모르는 조각은 조용히 넘기지 않고 s.unknownFx 에 쌓는다 — 안 도는 것을 도는 척하면 안 된다.

import * as R from "./rules.js";

// 조각의 target 을 실제 유닛으로 푼다
function resolve(s, ctx, target) {
  const { owner } = ctx;
  const foes = s.reachable ? s.reachable() : s.enemies.filter((e) => !e.dead);
  const allies = s.party.filter((u) => !u.dead);
  switch (target) {
    case "allEnemies": return foes;
    // 미리보기는 무작위를 정해 둔다 — 그 적에게 전부 몰렸을 때(최대)를 보여 준다
    case "randomEnemy": {
      if (s.previewPick != null) return foes.filter((e) => e.idx === s.previewPick).slice(0, 1);
      return foes.length ? [foes[Math.floor(s.rng() * foes.length)]] : [];
    }
    case "allAllies": return allies;
    // 「파티」 — 파티 한 몸(HP · 방어 · 실드 · 상태). 주인 없는 카드(교주 · 상태 카드)도 닿는다. 연출 자리는 낸 사도
    case "party": return allies.length ? [owner && !owner.dead && owner.side === "party" ? owner : allies[0]] : [];
    case "oneAlly": {
      if (ctx.lowest) return allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
      // 패시브에는 고르는 사람이 없다 — 일을 겪은 아군(맞은 사람), 없으면 자신
      if (ctx.ally) return [ctx.ally].filter((u) => !u.dead);
      // 적과 아군을 둘 다 고르는 카드 — 아군 쪽은 따로 고른 사람(allyIdx)
      if (ctx.allyIdx != null) return [allies.find((u) => u.idx === ctx.allyIdx) || owner || allies[0]].filter(Boolean);
      // targetIdx 는 파티 안의 자리(idx)다. 살아 있는 사람 목록의 순번이 아니다 —
      // 앞사람이 쓰러지면 순번이 밀려 엉뚱한 사람에게 갔다.
      return [allies.find((u) => u.idx === ctx.targetIdx) || owner || allies[0]].filter(Boolean);
    }
    case "self": return owner ? [owner] : [];
    // 「HP 최저 아군」 — 고르지 않고 비율이 가장 낮은 아군에게 간다
    case "lowAlly": return allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    case "oneEnemy":
    // 화면은 적의 idx 를 넘긴다. 살아 있는 적의 순번으로 찾으면, 앞의 적이 쓰러진 뒤
    // 세 번째 적을 눌러도 두 번째 적이 맞았다.
    default: return [foes.find((e) => e.idx === ctx.targetIdx) || foes[0]].filter(Boolean);
  }
}

// 파티는 한 몸이다(js/combat.js linkParty) — 사도 여럿을 가리켜도 파티 몫(방어 · 실드 · 회복 · 상태 · 무적 · 해제 · HP 치르기)은 한 번만.
// 「아군 전원 사기 1」 이 세 번 쌓이지 않게. 증감(mods — 공격력 +10% …)은 사도마다라 여기를 거치지 않는다
function once(list) {
  let seen = false;
  return list.filter((t) => (t.side !== "party" ? true : seen ? false : (seen = true)));
}

// 버프가 들어간 공격력·방어력 — 패시브·키워드·카드의 증감을 combat 이 셈해 준다
const atkOf = (api, u) => Math.max(1, Math.round(u.atk * (1 + (api.statOf ? api.statOf(u, "atk") : 0))));
const defOf = (api, u) => Math.max(0, Math.round(u.def * (1 + (api.statOf ? api.statOf(u, "def") : 0))));
// 치유 — 방어력 기준(v6 카제나 「치유 = 방어력」). 방어력 증감이 그대로 붙는다. 회복력 · 온정은 없앴다
// 방어 기반 피해의 바탕 — 버프가 들어간 방어력 × 2.1 + 공격력 × 0.3(rules.js defDmgStat)
const defDmgOf = (api, u) => R.defDmgStat(atkOf(api, u), defOf(api, u));

// 한 번에 얼마 — 피해 한 대 · 방어/실드 · 회복. 아래 runFx 가 쓰고, 화면(fight-screen cardCalc)이 카드 면 숫자로 같은 것을 부른다(셈이 갈라지지 않게).
// api 는 { statOf(u, stat) } 만 있으면 된다. 맞는 쪽의 취약 · 상성 · 주는/받는 피해 증감은 hurt 가 따로 건다
// base: "def" — 방어 기반 피해(바탕이 방어력 210% + 공격력 30%)
export const hitAmount = (api, u, ratio, { flash = 0, shin = false, global = 0, crit = false, base = null } = {}) =>
  R.finalDamage({ stat: base === "def" ? defDmgOf(api, u) : atkOf(api, u), ratio, flash, shin, global, crit });
// 양보하는 마음(축복 guard) — 방어 · 실드 ×1.3
export const guardAmount = (api, u, ratio, shin) => Math.max(1, Math.round(defOf(api, u) * ratio * (shin === "guard" ? R.SHIN : 1)));
// 괜찮아(축복 heal) — 치유 ×1.3. 바탕은 방어력(v6)
export const healAmount = (api, u, ratio, shin) => Math.max(1, Math.round(defOf(api, u) * ratio * (shin === "heal" ? R.SHIN : 1)));

// 이 사도가 그 키워드를 몇 개 들고 있나
const stackOf = (s, key, id) => ((s.stacks || {})[key] || {})[id] || 0;
function addStack(s, key, id, v) {
  s.stacks = s.stacks || {};
  s.stacks[key] = s.stacks[key] || {};
  const cap = ((s.stackCap || {})[key] || {})[id];
  let next = (s.stacks[key][id] || 0) + v;
  if (cap != null) next = Math.min(cap, next);
  s.stacks[key][id] = Math.max(0, next);
}

// 「「X」 1개당 …」 의 X 가 몇 개인가 — 자기 주머니는 그 사도의 것, 적 표식은 고른 적(규칙이면 일을 일으킨 적)이 든 수,
// 아군 표식은 파티의 것(파티에 하나 — linkParty)
function perCount(s, ctx, id) {
  const kw = (s.kw || {})[id];
  if (kw && kw.carrier === "enemy") {
    const t = ctx.holder && ctx.holder.side === "enemy" ? ctx.holder : resolve(s, ctx, "oneEnemy")[0];
    return t ? (t.status || {})[id] || 0 : 0;
  }
  if (kw && kw.carrier === "ally") return ctx.owner ? (ctx.owner.status || {})[id] || 0 : 0;
  return ctx.owner ? stackOf(s, ctx.owner.key, id) : 0;
}

// 한 장을 실행한다. api 는 combat 이 넘겨 주는 손잡이들이다.
export function runFx(s, fxList, ctx, api) {
  const { owner } = ctx;
  let gate = true;                 // ifStack 이 거짓이면 그 뒤가 안 돈다
  // 때 붙은 마디 — 「영감: …」(능력으로 뽑힐 때) · 「안식: …」(버려질 때) · 「턴 끝에 손에 있으면: …」. 그 표시 뒤의 조각은 그때(ctx.when)만 돌고, 카드를 낼 때는 안 돈다
  let part = null;

  for (const f of fxList || []) {
    if (f.k === "when") { part = f.on; gate = true; continue; }
    if ((ctx.when || null) !== part) continue;
    if (!gate && f.k !== "ifStack") continue;
    switch (f.k) {
      // ── 조건·대상 고르기 ──────────────────────────────────────────
      // 「파괴: …」 — 대상이 처치된 상태일 때만 뒤가 돈다(v6 카제나 「대상이 처치되거나 쓰러진 상태일 때」 — 그 카드의 앞선 타격으로 쓰러졌어도).
      // 고른 적이 있으면 그 적, 없으면(전체 · 무작위 카드) 이 카드가 적을 하나라도 쓰러뜨렸으면
      case "ifBroken": {
        const t = s.enemies.find((e) => e.idx === ctx.targetIdx);
        const single = (fxList || []).some((x) => x.k === "dmg" && x.target === "oneEnemy");
        gate = single ? !!t && !!t.dead : (s.killSeq || 0) === s.actSeq && !!s.actSeq;
        break;
      }
      // 「조율: …」 — 이 카드의 비용이 낼 때 남은 AP 와 같았으면 뒤가 돈다(combat playCard 가 ctx.tune 을 정한다)
      case "ifTune": gate = !!ctx.tune; break;
      // 「연속: …」 — 이번 턴 바로 앞에 낸 카드가 이 카드와 같은 속성(사도 성격)이면 뒤가 돈다(combat playCard 가 ctx.chain 을 정한다)
      case "ifChain": gate = !!ctx.chain; break;
      case "ifStack": {
        const kw = (s.kw || {})[f.id];
        if (kw && kw.carrier === "enemy") {
          const t = resolve(s, ctx, "oneEnemy")[0];
          gate = !!t && ((t.status || {})[f.id] || 0) > 0;
        } else if (kw && kw.carrier === "ally") gate = !!owner && ((owner.status || {})[f.id] || 0) > 0;
        else gate = owner ? stackOf(s, owner.key, f.id) > 0 : false;
        break;
      }
      case "targetLowest": ctx.lowest = true; break;
      case "perStack": ctx.perStack = f.id; break;

      // ── 피해 ──────────────────────────────────────────────────────
      case "dmg": {
        if (!owner) break;
        // X 코스트 — 낸 AP 만큼, 키워드가 붙어 있으면 그 스택만큼 더
        let hits = f.xHits
          ? (ctx.x || 0) + (f.xStack ? stackOf(s, owner.key, f.xStack) : 0)
          : (f.hits || 1);
        // 「「마탄」 1개당 …」 — 바로 뒤의 피해 한 줄을 쌓인 수만큼 친다(0 이면 안 친다). 한 번 쓰면 풀린다
        if (ctx.perStack) { hits *= perCount(s, ctx, ctx.perStack); ctx.perStack = null; }
        for (let i = 0; i < hits; i++) {
          const targets = resolve(s, ctx, f.target);
          for (const t of targets) {
            // 미리보기에는 치명타를 넣지 않는다 — 기대보다 크게 보이면 믿고 냈다가 모자란다
            const critPct = (owner.crit || 0) + (api.statOf ? api.statOf(owner, "crit") * 100 : 0);
            const crit = !s.preview && s.rng() * 100 < critPct;
            // 축복 — 불타는 웅변은 늘, 약점 공략은 취약인 적에게만 ×1.3
            const boost = ctx.shin === "power" || (ctx.shin === "weakSpot" && ((t.status || {})["취약"] || 0) > 0);
            // 카드로 처음 칠 때 — 충격(공격 카드의 대상이 되면 고정 피해) · 충격파(다른 모든 적에게 고정 피해)가 먼저 돈다(api.cardHit)
            const first = ctx.card && t.side === "enemy" && !(ctx.toughed && ctx.toughed.has(t));
            if (first && api.cardHit) { api.cardHit(owner, t, ctx); if (t.dead) continue; }
            // 잔광(파티 상태) — 공격 카드가 처음 칠 때 1 쓴다(이 카드 내내 붙는다 — 격파된 적 +50% · 강인도 +1)
            if (first && ctx.type === "공격" && api.glow) api.glow();
            // 고정 피해(f.fixed)는 상태 · 상성 · 증감을 안 탄다(방어 · 실드에는 막힌다). 치명 · 축복도 안 붙는다
            const v = f.fixed ? Math.max(1, Math.round(atkOf(api, owner) * f.ratio))
              : hitAmount(api, owner, f.ratio, { flash: ctx.flash || 0, shin: boost, global: ctx.global || 0, crit, base: f.base || null });
            api.hurt(t, v, { from: owner, crit: !f.fixed && crit, tags: ctx.tags, card: !!ctx.card, fixed: !!f.fixed, attack: ctx.type === "공격" });
            // 강인도 — 카드(고학년 포함)의 타격 한 번마다: 약점이면 1칸, 아니면 0.5칸(rules.js TOUGH). 패시브의 피해는 안 깎는다
            // 잔광(파티 상태) 1칸 · 표식(적의 상태)의 덤 타격은 카드 한 장이 그 적을 처음 칠 때 한 번
            if (ctx.card && api.tough && t.side === "enemy" && !t.dead) {
              const hit = (ctx.toughed = ctx.toughed || new Set());
              const once = !hit.has(t);
              if (once) hit.add(t);
              const glow = once && ctx.type === "공격" && api.glow ? api.glow() : false;
              api.tough(t, R.TOUGH.hit + (api.weak && api.weak(owner, t, ctx.tags) ? R.TOUGH.weak : 0) + (glow ? R.TOUGH.glow : 0));
              if (once && api.mark && !t.dead) api.mark(owner, t, ctx);
            } else if (first) (ctx.toughed = ctx.toughed || new Set()).add(t);
            if (ctx.shin === "frost" && !t.dead) api.addStatus(t, "취약", 1, 1);   // 눈보라 예보
            if (ctx.shin === "thorn" && !t.dead) api.addStatus(t, "중독", 2, 0);   // 가시 돋친 꿈
          }
        }
        break;
      }

      // ── 방어·실드·회복 ────────────────────────────────────────────
      // 방어·실드는 방어력 기준 — 낸 사도의 방어력. 주인 없는 카드(교주 카드)는 스탯 효과를 쓰지 않는다
      // 양보하는 마음(축복) — 방어 · 실드 ×1.3. 고정 실드(f.fixed)는 결의 · 손상 · 축복을 안 탄다
      // 「「X」 1개당 방어력 N% 실드」 · 「… 1개당 파티 HP 회복(방어력 N%)」 — 배율에 쌓인 수를 곱한다(0 이면 안 준다). 한 번 쓰면 풀린다
      case "block": case "shield": {
        if (!owner) break;
        let k = 1;
        if (ctx.perStack) { k = perCount(s, ctx, ctx.perStack); ctx.perStack = null; if (!k) break; }
        const ratio = f.ratio * k;
        const v0 = f.fixed ? Math.max(1, Math.round(defOf(api, owner) * ratio)) : guardAmount(api, owner, ratio, ctx.shin);
        // 결의 · 손상 — 받는 쪽마다 얻는 양이 는다 · 준다(api.guardGain)
        for (const t of once(resolve(s, ctx, f.target))) { const v = !f.fixed && api.guardGain ? api.guardGain(t, v0) : v0; t[f.k] = (t[f.k] || 0) + v; if (api.gain) api.gain(t, f.k, v); }
        break;
      }
      // 치유는 방어력 기준 — 낸 사도의 방어력(v6)
      case "heal": if (owner) {
        let k = 1;
        if (ctx.perStack) { k = perCount(s, ctx, ctx.perStack); ctx.perStack = null; if (!k) break; }
        for (const t of once(resolve(s, ctx, f.target))) {
        // 넘친 만큼(over)도 넘긴다 — 「회복량이 최대 HP를 초과하면」 패시브(passive.js overheal)
        const h0 = t.hp, v = healAmount(api, owner, f.ratio * k, ctx.shin);
        t.hp = Math.min(t.maxHp, t.hp + v);
        if (api.heal) api.heal(t, h0, Math.max(0, h0 + v - t.maxHp));
        }
      } break;

      // ── 능력치 증감 — 주는/받는 피해 · 공격력 · 방어력 · 치명 (이번 턴 · N턴간 · 이번 전투) ──
      case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod": {
        const stat = { dealtMod: "dealt", takenMod: "taken", atkMod: "atk", defMod: "def", critMod: "crit" }[f.k];
        // 대상 말이 없으면(auto) 적을 약하게 하는 것(받는 피해 + · 주는 피해 -)은 고른 적에게, 나머지는 자신에게.
        // 「자신」 이라고 적었으면 그대로 자신이다 — 스스로 거는 벌칙(이번 턴 자신 주는 피해 -20%)이 있다.
        let tg = f.target || "auto";
        if (tg === "auto") tg = (f.k === "takenMod" && f.v > 0) || (f.k === "dealtMod" && f.v < 0) ? "oneEnemy" : "self";
        // 「전투 내내」(f.run) — 강화 카드의 버프. 그 전투 끝까지 간다(combat fxApi addMod · R.BOON_TURNS). 판에는 적지 않는다
        // 증감은 사도마다 — 「파티」 면 사도 모두에게
        for (const t of resolve(s, ctx, tg === "party" ? "allAllies" : tg)) api.addMod && api.addMod(t, stat, f.v, f.turns || 1, !!f.run);
        break;
      }

      // ── 자원 ──────────────────────────────────────────────────────
      // 카드 · 패시브의 드로우 — 「영감: …」 이 깨어나는 뽑기(턴 시작의 뽑기와 다르다)
      case "draw": api.draw(f.v, { ability: true }); break;
      case "ap": s.ap = Math.max(0, s.ap + f.v); break;
      // 다음 카드 코스트 -N — 이 카드를 낸 뒤 처음 내는 카드에 붙는다(combat costOf · playCard 가 쓰고 지운다)
      case "nextCheaper": s.nextCheaper = (s.nextCheaper || 0) + f.v; break;
      case "gauge": s.gauge = Math.max(0, Math.min(R.GAUGE_MAX, s.gauge + f.v)); break;

      // ── 상태 ──────────────────────────────────────────────────────
      // 「강인도 피해 N」 — 약점과 상관없이 그만큼 깎는다
      case "tough": for (const t of resolve(s, ctx, f.target)) if (t.side === "enemy" && api.tough) api.tough(t, f.v); break;
      case "rushDown": {
        for (const t of resolve(s, ctx, f.target)) if (t.side === "enemy") t.rushCnt = (t.rushCnt || 0) - f.v;   // 0 밑으로도 — 첫 장으로 내도 그만큼 여유가 쌓인다(새 수 · 새 턴에 0)
        break;
      }
      case "status": {
        // 도발은 자기가 적을 끄는 것이다 — 대상 말이 적을 가리켜도 자신에게 건다
        const tg = f.id === "도발" ? "self" : f.target;
        // 사도 층(사기 — rules.js HERO_ST)은 가리킨 사도마다 따로(「아군 전원 사기 1」 = 셋 모두 +1 · 「파티」 도 셋 모두).
        // 파티 층(불굴 · 결의 · 취약 …)은 파티에 한 번
        const mine = R.HERO_ST.includes(f.id);
        const ts = resolve(s, ctx, mine && tg === "party" ? "allAllies" : tg);
        for (const t of mine ? ts : once(ts)) api.addStatus(t, f.id, f.v, f.turns, owner);
        break;
      }
      case "strip": for (const t of resolve(s, ctx, f.target)) { t.block = 0; t.shield = 0; } break;
      case "cleanse": for (const t of once(resolve(s, ctx, f.target))) api.cleanse(t, f.v); break;
      // 무적 — 사도에게 걸면 파티 전체가 무적이다(파티 HP 하나)
      case "invuln": for (const t of once(resolve(s, ctx, f.target))) t.invuln = true; break;

      // ── 사도 전용 키워드 ──────────────────────────────────────────
      case "stack": {
        if (!owner) break;
        const kw = (s.kw || {})[f.id];
        if (kw && kw.carrier !== "self") {
          // 적에게 거는 표식 · 아군에게 씌우는 것 — 대상 말이 없으면 고른 적(아군)에게
          // 대상 말이 없으면(auto) 적 표식은 고른 적에게, 아군 것은 고른 아군에게. 「자신에게」 면 자신에게
          let tg = f.target && f.target !== "auto" ? f.target : kw.carrier === "enemy" ? "oneEnemy" : "oneAlly";
          // 문장 앞쪽의 적 말을 물고 오는 수가 있다 — 아군 것은 적에게, 적 표식은 아군에게 가지 않는다
          const FOE = ["oneEnemy", "allEnemies", "randomEnemy"];
          if (kw.carrier === "ally" && FOE.includes(tg)) tg = "self";
          if (kw.carrier === "enemy" && !FOE.includes(tg)) tg = "oneEnemy";
          for (const t of once(resolve(s, ctx, tg))) {
            t.status = t.status || {};
            const before = t.status[f.id] || 0;
            let next = Math.max(0, before + f.v);
            if (kw.cap != null) next = Math.min(kw.cap, next);
            if (next) t.status[f.id] = next; else delete t.status[f.id];
            if (api.stackChanged) api.stackChanged(owner.key, f.id, before, next, t);
          }
        } else {
          const before = stackOf(s, owner.key, f.id);
          addStack(s, owner.key, f.id, f.v);
          if (api.stackChanged) api.stackChanged(owner.key, f.id, before, stackOf(s, owner.key, f.id), owner);
        }
        break;
      }
      case "spend": {
        if (!owner) break;
        const kw = (s.kw || {})[f.id];
        if (kw && kw.carrier !== "self") {
          // 표식은 그 사람에게서 뺀다. 패시브·키워드 규칙이면 일을 일으킨 사람(ctx.holder),
          // 카드면 고른 적(적 표식) · 자신(아군 것)
          const holders = ctx.holder ? [ctx.holder] : resolve(s, ctx, kw.carrier === "enemy" ? "oneEnemy" : "self");
          for (const t of holders) {
            if (!t.status || !t.status[f.id]) continue;
            t.status[f.id] = f.v === "all" ? 0 : Math.max(0, t.status[f.id] - f.v);
            if (!t.status[f.id]) delete t.status[f.id];
          }
        } else addStack(s, owner.key, f.id, f.v === "all" ? -stackOf(s, owner.key, f.id) : -f.v);
        break;
      }
      case "capStack": if (owner) { s.stackCap = s.stackCap || {}; s.stackCap[owner.key] = s.stackCap[owner.key] || {}; s.stackCap[owner.key][f.id] = f.v; } break;
      case "trigger": if (owner) api.trigger(owner, f.id, f.v); break;

      // ── 체력을 값으로 치르기 ──────────────────────────────────────
      // 파티 HP 로 치른다 — 주인 없는 카드(상태 카드 「모자 속 쪽지」)는 파티가
      case "payHp": for (const t of once(resolve(s, ctx, f.target === "self" && !owner ? "party" : f.target))) api.hurt(t, f.v, { pure: true }); break;
      case "payHpPct": for (const t of once(resolve(s, ctx, f.target === "self" && !owner ? "party" : f.target))) api.hurt(t, Math.round(t.maxHp * f.v), { pure: true }); break;

      // ── 손패 ──────────────────────────────────────────────────────
      case "discard": api.discard(f.v, !!f.random); break;

      // ── 아직 규칙만 있고 몸이 없는 것들 ───────────────────────────
      // 지우지 않고 세어 둔다. 몇 개가 안 도는지 알아야 다음에 붙일 수 있다.
      // 태그(보존·소멸·개전)는 엔진이 카드를 옮길 때 본다 · 「이번 전투」 는 증감의 길이로 이미 읽었다
      case "tag": case "scope": break;

      // 카드 만들기 — 「「카드 이름」 1장 생성」(카제나 고유 효과의 「N 쌓이면 카드를 만든다」). 이 전투의 손에 든다(api.make)
      case "make": if (api.make) api.make(f.id, f.v || 1, owner); break;

      case "costDelta": case "costSet": case "ratioDelta":
      case "revive":
      case "extraTurn": case "lockCards":
      case "maxHpPct":
        s.pendingFx = s.pendingFx || {};
        s.pendingFx[f.k] = (s.pendingFx[f.k] || 0) + 1;
        break;

      default:
        s.unknownFx = s.unknownFx || {};
        s.unknownFx[f.k] = (s.unknownFx[f.k] || 0) + 1;
    }
  }
}

export { stackOf, addStack };
