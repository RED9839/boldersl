// 기획서에서 읽은 효과 조각을 실제로 실행한다.
//
// 수치는 전부 **스탯 기반 %** 다(기획서) — 피해는 공격력 × 배율, 방어·실드는 방어력 × 배율,
// 회복은 회복력(공격력 + 역할 몫) × 배율. 계산식은 rules.js 의 finalDamage 를 따른다.
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

// 버프가 들어간 공격력·방어력 — 패시브·키워드·카드의 증감을 combat 이 셈해 준다
const atkOf = (api, u) => Math.max(1, Math.round(u.atk * (1 + (api.statOf ? api.statOf(u, "atk") : 0))));
const defOf = (api, u) => Math.max(0, Math.round(u.def * (1 + (api.statOf ? api.statOf(u, "def") : 0))));
// 회복력 — 버프가 들어간 공격력 + 역할 몫(rules.js HEAL_BONUS)
// 장비 스탯 줄의 회복력(u.healPlus)을 더하고, 「회복력 +N%」 증감(statOf heal)을 곱한다
const healOf = (api, u) => Math.round(R.healStat(atkOf(api, u), u.role, u.healPlus) * (1 + (api.statOf ? api.statOf(u, "heal") : 0)));

// 한 번에 얼마 — 피해 한 대 · 방어/실드 · 회복. 아래 runFx 가 쓰고, 화면(fight-screen cardCalc)이 카드 면 숫자로 같은 것을 부른다(셈이 갈라지지 않게).
// api 는 { statOf(u, stat) } 만 있으면 된다. 맞는 쪽의 취약 · 상성 · 주는/받는 피해 증감은 hurt 가 따로 건다
export const hitAmount = (api, u, ratio, { flash = 0, shin = false, global = 0, crit = false } = {}) =>
  R.finalDamage({ stat: atkOf(api, u), ratio, flash, shin, global, crit });
// 양보하는 마음(축복 guard) — 방어 · 실드 ×1.3
export const guardAmount = (api, u, ratio, shin) => Math.max(1, Math.round(defOf(api, u) * ratio * (shin === "guard" ? R.SHIN : 1)));
// 괜찮아(축복 heal) — 회복 ×1.3
export const healAmount = (api, u, ratio, shin) => Math.max(1, Math.round(healOf(api, u) * ratio * (shin === "heal" ? R.SHIN : 1)));

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

// 한 장을 실행한다. api 는 combat 이 넘겨 주는 손잡이들이다.
export function runFx(s, fxList, ctx, api) {
  const { owner } = ctx;
  let gate = true;                 // ifStack 이 거짓이면 그 뒤가 안 돈다

  for (const f of fxList || []) {
    if (!gate && f.k !== "ifStack") continue;
    switch (f.k) {
      // ── 조건·대상 고르기 ──────────────────────────────────────────
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
        // 「「마탄」 1당 …」 — 바로 뒤의 피해 한 줄을 쌓인 수만큼 친다(0 이면 안 친다). 한 번 쓰면 풀린다
        if (ctx.perStack) { hits *= stackOf(s, owner.key, ctx.perStack); ctx.perStack = null; }
        for (let i = 0; i < hits; i++) {
          const targets = resolve(s, ctx, f.target);
          for (const t of targets) {
            // 미리보기에는 치명타를 넣지 않는다 — 기대보다 크게 보이면 믿고 냈다가 모자란다
            const critPct = (owner.crit || 0) + (api.statOf ? api.statOf(owner, "crit") * 100 : 0);
            const crit = !s.preview && s.rng() * 100 < critPct;
            // 축복 — 불타는 웅변은 늘, 약점 공략은 취약인 적에게만 ×1.3
            const boost = ctx.shin === "power" || (ctx.shin === "weakSpot" && ((t.status || {})["취약"] || 0) > 0);
            const v = hitAmount(api, owner, f.ratio, { flash: ctx.flash || 0, shin: boost, global: ctx.global || 0, crit });
            api.hurt(t, v, { from: owner, crit });
            if (ctx.shin === "frost" && !t.dead) api.addStatus(t, "취약", 1, 1);   // 눈보라 예보
            if (ctx.shin === "thorn" && !t.dead) api.addStatus(t, "중독", 2, 0);   // 가시 돋친 꿈
          }
        }
        break;
      }

      // ── 방어·실드·회복 ────────────────────────────────────────────
      // 방어·실드는 방어력 기준 — 낸 사도의 방어력. 주인 없는 카드(교주 카드)는 스탯 효과를 쓰지 않는다
      // 양보하는 마음(축복) — 방어 · 실드 ×1.3
      case "block": case "shield": {
        if (!owner) break;
        const v = guardAmount(api, owner, f.ratio, ctx.shin);
        for (const t of resolve(s, ctx, f.target)) { t[f.k] = (t[f.k] || 0) + v; if (api.gain) api.gain(t, f.k, v); }
        break;
      }
      // 회복은 회복력 기준 — 낸 사도의 회복력
      case "heal": if (owner) for (const t of resolve(s, ctx, f.target)) {
        const h0 = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + healAmount(api, owner, f.ratio, ctx.shin));
        if (api.heal) api.heal(t, h0);
      } break;

      // ── 능력치 증감 — 주는/받는 피해 · 공격력 · 방어력 · 치명 (이번 턴 · N턴간 · 이번 전투) ──
      case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod": case "healMod": {
        const stat = { dealtMod: "dealt", takenMod: "taken", atkMod: "atk", defMod: "def", critMod: "crit", healMod: "heal" }[f.k];
        // 대상 말이 없으면(auto) 적을 약하게 하는 것(받는 피해 + · 주는 피해 -)은 고른 적에게, 나머지는 자신에게.
        // 「자신」 이라고 적었으면 그대로 자신이다 — 스스로 거는 벌칙(이번 턴 자신 주는 피해 -20%)이 있다.
        let tg = f.target || "auto";
        if (tg === "auto") tg = (f.k === "takenMod" && f.v > 0) || (f.k === "dealtMod" && f.v < 0) ? "oneEnemy" : "self";
        for (const t of resolve(s, ctx, tg)) api.addMod && api.addMod(t, stat, f.v, f.turns || 1);
        break;
      }

      // ── 자원 ──────────────────────────────────────────────────────
      case "draw": api.draw(f.v); break;
      case "ap": s.ap = Math.max(0, s.ap + f.v); break;
      // 다음 카드 코스트 -N — 이 카드를 낸 뒤 처음 내는 카드에 붙는다(combat costOf · playCard 가 쓰고 지운다)
      case "nextCheaper": s.nextCheaper = (s.nextCheaper || 0) + f.v; break;
      case "gauge": s.gauge = Math.max(0, Math.min(R.GAUGE_MAX, s.gauge + f.v)); break;

      // ── 상태 ──────────────────────────────────────────────────────
      case "rushDown": {
        for (const t of resolve(s, ctx, f.target)) if (t.side === "enemy") t.rushCnt = (t.rushCnt || 0) - f.v;   // 0 밑으로도 — 첫 장으로 내도 그만큼 여유가 쌓인다(새 수 · 새 턴에 0)
        break;
      }
      case "status": {
        // 도발은 자기가 적을 끄는 것이다 — 대상 말이 적을 가리켜도 자신에게 건다
        const tg = f.id === "도발" ? "self" : f.target;
        for (const t of resolve(s, ctx, tg)) api.addStatus(t, f.id, f.v, f.turns);
        break;
      }
      case "strip": for (const t of resolve(s, ctx, f.target)) { t.block = 0; t.shield = 0; } break;
      case "cleanse": for (const t of resolve(s, ctx, f.target)) api.cleanse(t, f.v); break;
      case "invuln": for (const t of resolve(s, ctx, f.target)) t.invuln = true; break;
      case "immune": for (const t of resolve(s, ctx, f.target)) t.immune = true; break;

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
          for (const t of resolve(s, ctx, tg)) {
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
      case "payHp": for (const t of resolve(s, ctx, f.target)) api.hurt(t, f.v, { pure: true }); break;
      case "payHpPct": for (const t of resolve(s, ctx, f.target)) api.hurt(t, Math.round(t.maxHp * f.v), { pure: true }); break;

      // ── 손패 ──────────────────────────────────────────────────────
      case "discard": api.discard(f.v, !!f.random); break;

      // ── 아직 규칙만 있고 몸이 없는 것들 ───────────────────────────
      // 지우지 않고 세어 둔다. 몇 개가 안 도는지 알아야 다음에 붙일 수 있다.
      // 태그(보존·소멸·개전)는 엔진이 카드를 옮길 때 본다 · 「이번 전투」 는 증감의 길이로 이미 읽었다
      case "tag": case "scope": break;

      case "costDelta": case "costSet": case "ratioDelta":
      case "make": case "revive":
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
