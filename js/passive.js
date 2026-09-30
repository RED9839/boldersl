// 패시브와 사도 전용 키워드 — 기획서의 산문을 읽어 전투에서 실제로 돌린다.
//
// 전에는 패시브가 글로만 있었다. 도감에 「간식 3개가 되면 자동으로 먹고 AP +1」 이라고 쓰여 있는데
// 전투에서는 아무 일도 없었다. 135명의 패시브를 사람마다 따로 짜면 끝이 없으니,
// **정해진 문법**으로 쓰고 여기서 읽는다. 개성은 어떤 조각을 어떻게 엮느냐와 이름에서 나온다.
// 문법은 docs/07-스킬구성.md 에 있다. 요약:
//
//   **패시브** 이름: [언제], [조건] 효과 (턴당 1회) · 이름2: …
//     언제  전투 시작 시 · 턴 시작 시 · 턴 종료 시 · 카드를 낼 때마다 · 공격|스킬|강화 카드를 낼 때마다 ·
//           카드를 N장 낼 때마다 · 한 턴에 카드를 N장째 낼 때 · 아군이 카드를 낼 때마다 ·
//           적을 처치하면 · 적이 쓰러지면 · 피해를 받으면 · 아군이 피해를 받으면 ·
//           HP가 N% 이하가 되면 · 아군이 쓰러지면 · 고학년 스킬을 쓰면 · 연계가 터지면 ·
//           적에게 디버프를 걸면 · 「X」가 N개가 되면 · 항상
//     조건  「X」가 있으면 · 「X」가 N개 이상이면 · HP가 N% 이하이면 · 적이 N명 이상이면
//     효과  카드와 같은 말(공격력 N% 피해 · 방어력 N% 방어 · AP +1 · 드로우 1 · 「X」 +1 …) +
//           능력치 증감: 주는 피해 ±N% · 받는 피해 ±N% · 공격력 +N% · 방어력 +N% · 치명 확률 +N%
//           (이번 턴 · N턴간 · 이번 전투 동안 — 안 적으면 이번 턴, 「항상」 이면 내내)
//
//   **키워드 「X」** 설명. 최대 N. 턴 종료 시 N 감소. 적에게 거는 표식이다.
//                     1개당 자신 주는 피해 +N%. 1개당 턴 종료 시 공격력 N% 피해. 「X」가 N개가 되면: …

import { parseEffect } from "./effects.js";

// ── 읽기 ───────────────────────────────────────────────────────────────

const TRIGGERS = [
  [/전투\s*시작\s*시/, () => ({ on: "fightStart" })],
  [/턴\s*시작\s*시/, () => ({ on: "turnStart" })],
  [/턴\s*종료\s*시/, () => ({ on: "turnEnd" })],
  [/한\s*턴에\s*카드를\s*(\d+)\s*장째\s*낼\s*때/, (m) => ({ on: "play", nth: Number(m[1]), who: "any" })],
  [/(공격|스킬|강화)?\s*카드를\s*(\d+)\s*장\s*낼\s*때마다/, (m) => ({ on: "play", every: Number(m[2]), type: m[1] || null })],
  [/아군이\s*(공격|스킬|강화)?\s*카드를\s*낼\s*때마다/, (m) => ({ on: "play", who: "any", type: m[1] || null })],
  [/(공격|스킬|강화)\s*카드를\s*낼\s*때마다/, (m) => ({ on: "play", type: m[1] })],
  [/카드를\s*낼\s*때마다/, () => ({ on: "play" })],
  [/적을\s*처치하면/, () => ({ on: "kill", mine: true })],
  [/적이\s*쓰러지면/, () => ({ on: "kill" })],
  [/아군이\s*피해를\s*받으면/, () => ({ on: "hurt", who: "any" })],
  [/피해를\s*받으면/, () => ({ on: "hurt" })],
  [/HP가\s*(\d+)\s*%\s*이하가\s*되면/, (m) => ({ on: "lowHp", pct: Number(m[1]) / 100 })],
  [/아군이\s*쓰러지면/, () => ({ on: "allyDown" })],
  [/(?:고학년\s*스킬을|궁극기를)\s*쓰면/, () => ({ on: "ult" })],   // 옛 이름(궁극기)도 읽는다
  [/연계가\s*터지면/, () => ({ on: "combo" })],
  [/적에게\s*(?:취약|약화|기절|디버프)을?를?\s*걸면/, () => ({ on: "debuff" })],
  [/「(.+?)」\s*(?:이|가)?\s*(\d+)\s*개?\s*가?\s*되면/, (m) => ({ on: "stackReach", id: m[1], n: Number(m[2]) })],
  [/항상/, () => ({ on: "always" })],
];

const CONDS = [
  [/「(.+?)」\s*(?:이|가)?\s*(\d+)\s*개?\s*이상이면/, (m) => ({ c: "stack", id: m[1], n: Number(m[2]) })],
  [/「(.+?)」\s*(?:이|가)?\s*(?:이미\s*)?있으면/, (m) => ({ c: "stack", id: m[1], n: 1 })],
  [/HP가\s*(\d+)\s*%\s*이하이면/, (m) => ({ c: "hp", pct: Number(m[1]) / 100 })],
  [/적이\s*(\d+)\s*명\s*이상이면/, (m) => ({ c: "foes", n: Number(m[1]) })],
  [/혼자\s*남으면/, () => ({ c: "alone" })],
];

const LIMIT = /\(?\s*(턴당|전투당)\s*(\d+)\s*회\s*\)?/;

// 「간식」 처럼 낫표를 두르면 사람이 읽기 좋지만 효과 읽기는 맨 낱말을 본다
const bare = (t) => t.replace(/「([^」]+)」/g, "$1");

function durationOf(t) {
  if (/이번\s*전투/.test(t)) return 999;   // 끝까지 — JSON 에 Infinity 가 안 들어가서 999 턴으로 둔다
  const m = t.match(/(\d+)\s*턴\s*(?:간|동안)?/);
  if (m) return Number(m[1]);
  return 1;
}

// 한 문장 → 규칙 하나. 못 읽은 글자는 left 에 남긴다.
function readRule(sentence, keywords, prevTrigger) {
  let t = sentence.trim();
  const rule = { text: t, when: null, conds: [], fx: [], limit: null };
  for (const [re, make] of TRIGGERS) {
    const m = t.match(re);
    if (m) { rule.when = make(m); t = t.replace(m[0], " "); break; }
  }
  if (!rule.when) rule.when = prevTrigger || { on: "always" };
  for (const [re, make] of CONDS) {
    const m = t.match(re);
    if (m) { rule.conds.push(make(m)); t = t.replace(m[0], " "); }
  }
  const lm = t.match(LIMIT);
  if (lm) { rule.limit = { per: lm[1] === "턴당" ? "turn" : "fight", n: Number(lm[2]) }; t = t.replace(lm[0], " "); }
  if (rule.when.on === "lowHp" && !rule.limit) rule.limit = { per: "fight", n: 1 };

  const turns = rule.when.on === "always" ? 999 : durationOf(t);
  const { fx, left } = parseEffect(bare(t), { keywords });
  for (const f of fx) if (["dealtMod", "takenMod", "atkMod", "defMod", "critMod"].includes(f.k)) f.turns = turns;
  rule.fx = fx.filter((f) => f.k !== "scope");
  rule.left = left;
  return rule;
}

// 「이름: 규칙 · 이름2: 규칙2」 를 가른다. 효과 안의 「·」 와 헷갈리지 않게, 뒤에 「이름:」 이 오는 곳만 자른다.
export function parsePassive(text, keywords = []) {
  if (!text) return [];
  const parts = text.split(/\s·\s(?=[^:·.]{1,30}:)/);
  const out = [];
  for (const part of parts) {
    const i = part.indexOf(":");
    const name = i > 0 ? part.slice(0, i).trim() : "패시브";
    const body = i > 0 ? part.slice(i + 1) : part;
    let prev = null;
    for (const s of body.split(/(?<=[.。])\s+|;\s*/).filter((x) => x.trim())) {
      const r = readRule(s.replace(/[.。]\s*$/, ""), keywords, prev);
      r.name = name;
      prev = r.when;
      out.push(r);
    }
  }
  return out;
}

// 키워드 한 줄 → { id, cap, decay, carrier, per: [...], rules: [...] }
const PER_STATS = [
  [/주는\s*피해\s*([+\-])\s*(\d+)\s*%/, "dealt"],
  [/받는\s*피해\s*([+\-])\s*(\d+)\s*%/, "taken"],
  [/공격력\s*([+\-])\s*(\d+)\s*%/, "atk"],
  [/방어력\s*([+\-])\s*(\d+)\s*%/, "def"],
  [/치명\s*(?:확률)?\s*([+\-])\s*(\d+)\s*%/, "crit"],
];

export function parseKeyword(id, text, keywords = []) {
  const kw = { id, cap: null, decay: 0, carrier: "self", per: [], rules: [], left: [] };
  if (!text) return kw;
  if (/적에게\s*(?:거는|붙는|쌓는|새기는)/.test(text)) kw.carrier = "enemy";
  else if (/아군에게\s*(?:거는|주는|나눠\s*주는|씌우는)/.test(text)) kw.carrier = "ally";
  const cap = text.match(/최대\s*(\d+)/);
  if (cap) kw.cap = Number(cap[1]);
  if (/턴\s*종료\s*시\s*(?:전부|모두)\s*사라/.test(text)) kw.decay = "all";
  else { const d = text.match(/턴\s*종료\s*시\s*(\d+)\s*(?:씩\s*)?(?:감소|줄어)/); if (d) kw.decay = Number(d[1]); }

  // 첫 문장은 설명(사람이 읽는 말)이다. 그 뒤 문장은 모두 규칙이어야 한다 — 못 읽으면 left 에 남긴다.
  const sentences = text.split(/(?<=[.。])\s+/).map((x) => x.replace(/[.。]\s*$/, "").trim()).filter(Boolean);
  sentences.forEach((s, i) => {
    if (i === 0) return;
    const meta = /최대\s*\d+|턴\s*종료\s*시\s*(?:\d+\s*(?:씩\s*)?(?:감소|줄어)|(?:전부|모두)\s*사라)|(?:적|아군)에게\s*(?:거는|붙는|쌓는|새기는|주는|나눠\s*주는|씌우는)/;
    const per = s.match(/1\s*개\s*당\s*(.+)/);
    if (per) {
      const body = per[1];
      const who = /아군\s*(?:전원|전체)/.test(body) ? "allies" : "holder";
      for (const [re, stat] of PER_STATS) {
        const m = body.match(re);
        if (m) kw.per.push({ stat, v: (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100, who });
      }
      const dot = body.match(/턴\s*종료\s*시\s*공격력\s*(\d+)\s*%\s*피해/);
      if (dot) kw.per.push({ stat: "dot", ratio: Number(dot[1]) / 100 });
      const heal = body.match(/턴\s*종료\s*시\s*(?:HP\s*)?회복\s*\(?\s*공격력\s*(\d+)\s*%/);
      if (heal) kw.per.push({ stat: "hot", ratio: Number(heal[1]) / 100 });
      const n = kw.per.length;
      if (!PER_STATS.some(([re]) => re.test(body)) && !dot && !heal) kw.left.push(s);
      return;
    }
    // 규칙 문장(언제 ~ 하면: …) — 「X」가 N개가 되면 따위
    if (TRIGGERS.some(([re]) => re.test(s) && !/^항상/.test(s)) && !(meta.test(s) && !/되면|마다|시\s*[,:]/.test(s.replace(meta, "")))) {
      const r = readRule(s.replace(/:\s*/, " "), keywords, null);
      r.name = id;
      if (r.when.on !== "always" && r.fx.length) { kw.rules.push(r); if (r.left) kw.left.push(`${s} ⟶ 못 읽은 말: ${r.left}`); return; }
    }
    if (meta.test(s)) return;
    kw.left.push(s);
  });
  return kw;
}

// ── 돌리기 ─────────────────────────────────────────────────────────────
// combat.js 가 이 함수들을 부른다. 실제 효과 실행은 combat 이 넘겨 주는 run(owner, fx, ctx) 로 한다.

// 사도 key → { rules, kw } 를 전투 시작에 한 번 만든다
// gearFx — { 사도키: "이름: 효과 · 이름: 효과" } 낀 장비의 효과 · 애착(run.js gearPassives). 그 사도의 패시브로 붙는다
export function setupPassives(s, heroOf, gearFx = {}) {
  s.passives = {};
  s.kw = {};
  for (const u of s.party) {
    const h = heroOf(u.key);
    if (!h) continue;
    const kws = h.keyword ? [h.keyword.ko] : [];
    const kw = h.keyword ? (h.keywordRules || parseKeyword(h.keyword.ko, h.keyword.text, kws)) : null;
    const gearRules = gearFx[u.key] ? parsePassive(gearFx[u.key], kws).filter((r) => r.fx.length && !r.left).map((r) => ({ ...r, gear: true })) : [];
    const rules = [...(h.passiveRules || parsePassive(h.passive, kws)), ...(kw ? kw.rules : []), ...gearRules];
    s.passives[u.key] = rules;
    if (kw) s.kw[kw.id] = { ...kw, owner: u.key };
  }
  s.fired = {};            // "사도|규칙번호" → 이번 턴·전투에 몇 번
  s.counts = {};           // "사도|규칙번호" → 카드 N장마다
  s.depth = 0;
}

// 스택이 어디에 있는가 — 자기 것(사도 주머니) · 적에게 · 아군에게
export function stackOn(s, holder, id, owner) {
  const kw = (s.kw || {})[id];
  if (kw && kw.carrier !== "self" && holder) return (holder.status || {})[id] || 0;
  const key = owner ? owner.key : holder && holder.key;
  return (((s.stacks || {})[key] || {})[id]) || 0;
}

// 능력치 증감 — 붙어 있는 버프(mods) + 「항상」 패시브 + 키워드 1개당
export function statMod(s, u, stat) {
  if (!u) return 0;
  let v = 0;
  for (const m of u.mods || []) if (m.stat === stat) v += m.v;
  // 「항상 HP가 50% 이하이면 …」 처럼 조건이 붙은 항상은 조건이 맞을 때만(주인 기준으로 본다)
  if (u.side === "party" && s.always) for (const m of s.always[u.key] || []) {
    if (m.stat !== stat) continue;
    if (m.cond && m.cond.length) { const owner = s.party.find((x) => x.key === m.owner); if (!owner || !condOk(s, owner, { conds: m.cond }, {})) continue; }
    v += m.v;
  }
  for (const kw of Object.values(s.kw || {})) {
    for (const p of kw.per) {
      if (p.stat !== stat) continue;
      if (kw.carrier === "self") {
        const owner = s.party.find((x) => x.key === kw.owner);
        const n = (((s.stacks || {})[kw.owner] || {})[kw.id]) || 0;
        if (!n || !owner) continue;
        if (p.who === "allies" ? u.side === "party" : u === owner) v += n * p.v;
      } else {
        const n = (u.status || {})[kw.id] || 0;
        if (n) v += n * p.v;
      }
    }
  }
  return v;
}

// 「항상」 규칙의 능력치 증감을 모아 둔다 — 매번 돌지 않고 늘 걸려 있는 것
export function collectAlways(s) {
  s.always = {};
  for (const [key, rules] of Object.entries(s.passives || {})) {
    for (const r of rules) {
      if (r.when.on !== "always") continue;
      for (const f of r.fx) {
        const stat = { dealtMod: "dealt", takenMod: "taken", atkMod: "atk", defMod: "def", critMod: "crit" }[f.k];
        if (!stat) continue;
        const who = f.target === "allAllies" ? s.party.map((u) => u.key) : [key];
        for (const k of who) (s.always[k] = s.always[k] || []).push({ stat, v: f.v, cond: r.conds, owner: key });
      }
    }
  }
}

function condOk(s, owner, r, info) {
  for (const c of r.conds) {
    if (c.c === "stack") {
      const holder = (s.kw[c.id] && s.kw[c.id].carrier === "enemy") ? info.target : owner;
      if (stackOn(s, holder, c.id, owner) < c.n) return false;
    }
    if (c.c === "hp" && owner.hp / owner.maxHp > c.pct) return false;
    if (c.c === "foes" && s.enemies.filter((e) => !e.dead).length < c.n) return false;
    if (c.c === "alone" && s.party.filter((u) => !u.dead && u !== owner).length) return false;
  }
  return true;
}

function matches(s, owner, w, ev, info) {
  if (w.on !== ev) return false;
  switch (ev) {
    case "play":
      if (w.who !== "any" && info.hero !== owner.key) return false;
      if (w.type && info.type !== w.type) return false;
      if (w.nth && info.nth !== w.nth) return false;
      return true;
    case "kill": return !w.mine || info.by === owner.key;
    case "hurt": return w.who === "any" ? info.who.side === "party" : info.who === owner;
    case "lowHp": return info.who === owner && info.before > w.pct && info.after <= w.pct;
    case "allyDown": return info.who !== owner;
    case "ult": case "combo": return info.hero === owner.key || (info.heroes || []).includes(owner.key);
    case "debuff": return info.by === owner.key;
    case "stackReach": return w.id === info.id && info.before < w.n && info.after >= w.n && (!info.owner || info.owner === owner.key);
    default: return true;
  }
}

// 일이 났다 — 맞는 규칙을 모두 돌린다. run(owner, fx, ctx, label)
export function emit(s, ev, info, run) {
  if (!s.passives || s.over) return;
  if (s.depth > 4) return;                 // 패시브가 패시브를 부르는 고리를 끊는다
  s.depth++;
  try {
    for (const owner of s.party) {
      if (owner.dead) continue;
      const rules = s.passives[owner.key] || [];
      rules.forEach((r, i) => {
        if (!matches(s, owner, r.when, ev, info)) return;
        if (!condOk(s, owner, r, info)) return;
        const id = `${owner.key}|${i}`;
        if (r.when.every) {
          s.counts[id] = (s.counts[id] || 0) + 1;
          if (s.counts[id] % r.when.every) return;
        }
        if (r.limit) {
          const key = `${id}|${r.limit.per === "turn" ? s.turn : "f"}`;
          if ((s.fired[key] || 0) >= r.limit.n) return;
          s.fired[key] = (s.fired[key] || 0) + 1;
        }
        if (!r.fx.length) return;
        const target = info.target && info.target.side === "enemy" ? info.target : null;
        const holder = ev === "stackReach" && info.target && info.target !== owner ? info.target : null;
        const ally = info.who && info.who.side === "party" && !info.who.dead ? info.who : owner;
        run(owner, r.fx, { owner, combo: null, targetIdx: target ? target.idx : 0, passive: r.name, holder, ally }, `${owner.ko} · ${r.name}`);
      });
    }
  } finally { s.depth--; }
}

// 턴 끝 — 키워드의 지속 피해·회복, 줄어들기, 버프 시간 줄이기
export function tickTurnEnd(s, hurt, say) {
  for (const kw of Object.values(s.kw || {})) {
    const owner = s.party.find((x) => x.key === kw.owner);
    for (const p of kw.per) {
      if (p.stat === "dot" && owner) {
        const holders = kw.carrier === "enemy" ? s.enemies : kw.carrier === "ally" ? s.party : [];
        for (const e of holders) {
          const n = (e.status || {})[kw.id] || 0;
          if (!n || e.dead) continue;
          const v = Math.max(1, Math.round(owner.atk * p.ratio * n));
          hurt(e, v, { from: owner });
          say(`${e.ko}: ${kw.id} ${n} — ${v} 피해`);
        }
      }
      if (p.stat === "hot" && owner) {
        const holders = kw.carrier === "self" ? [owner] : s.party;
        for (const u of holders) {
          const n = kw.carrier === "self" ? (((s.stacks || {})[kw.owner] || {})[kw.id] || 0) : (u.status || {})[kw.id] || 0;
          if (!n || u.dead) continue;
          const v = Math.max(1, Math.round(owner.atk * p.ratio * n));
          u.hp = Math.min(u.maxHp, u.hp + v);
        }
      }
    }
    if (kw.decay) {
      const cut = (n) => (kw.decay === "all" ? 0 : Math.max(0, n - kw.decay));
      if (kw.carrier === "self") {
        const pool = (s.stacks || {})[kw.owner];
        if (pool && pool[kw.id]) pool[kw.id] = cut(pool[kw.id]);
      } else {
        for (const u of [...s.party, ...s.enemies]) if (u.status && u.status[kw.id]) {
          u.status[kw.id] = cut(u.status[kw.id]);
          if (!u.status[kw.id]) delete u.status[kw.id];
        }
      }
    }
  }
}

// 버프 시간 줄이기 — 다음 내 턴이 시작될 때 부른다(「이번 턴」 이 적의 차례까지 가도록)
export function tickMods(s) {
  for (const u of [...s.party, ...s.enemies]) {
    if (!u.mods) continue;
    for (const m of u.mods) m.left -= 1;
    u.mods = u.mods.filter((m) => m.left > 0);
  }
}

export function addMod(u, stat, v, turns) {
  u.mods = u.mods || [];
  u.mods.push({ stat, v, left: turns == null ? 1 : turns });
}
