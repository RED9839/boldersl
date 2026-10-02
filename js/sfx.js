// 효과음 — 원작 효과음(assets/sfx, tools/extract-sfx.py)을 WebAudio 로 튼다. 무엇을 틀지는 js/data/sfx-map.js.
//   sfx.play(갈래, {v, pan, delay, pitch})   공용 갈래 — "hit.slash" · "ui.click" · "card.공격" …
//   sfx.hero(사도 key, 갈래, opts)            사도 제 소리 — attack · attackHit · power · powerHit · skill · skillHit · ult · ult2 · ultHit (없으면 공용으로)
//   sfx.enemy(적 key, 갈래, opts)             적 제 소리 — attack · hit · skill · skillHit (없으면 공용으로)
//   sfx.card(카드, 사도 key) · sfx.land(h, {hero, enemy, ult}) · sfx.ult(사도 key, "cutin"|"impact")   전투 한 줄짜리
//   sfx.action(사도 key, 갈래, [{n, t}], 대신)   동작 하나의 소리 — 스파인 SFX(n) 이벤트 시각에 그 칸의 파일. 칸이 안 맞으면 대신(cast · impact)
//   sfx.at(사도 key, 갈래, ms)                  큰 소리(첫 마루)가 ms 뒤에 오도록 당겨서 튼다 — 터지는 소리가 파일 가운데 있어도 맞는 순간에 맞게
//   sfx.preload(["hit.slash", "hero:에르핀", "enemy:golem"])   미리 받아 풀어 둔다
// 처음 부를 때 받아서 풀고(decode) 붙들어 둔다(최근 것 160개). 같은 소리는 45ms 안에 다시 안 틀고, 갈래(hit · ui …)마다 동시에 몇 개까지만 —
// 레이저 아홉 대가 한꺼번에 맞아도 소리가 뭉개지지 않게.
// 깔끔하게(2026-10 사용자) —
//   크기  파일마다 g(색인 — tools/extract-sfx.py 가 잰 세기 맞춤) × 갈래의 v. 마지막에 부드러운 압축기 하나
//   길이  앞의 고요는 건너뛰고, 긴 꼬리는 갈래의 max 초에서 fade 초 동안 줄여 끊는다(sfx-map 의 TAIL · KIND_TAIL)
//   겹침  모두 합쳐 LIVE_MAX 개까지(넘치면 가장 작은 · 오래된 것을 줄여 끊는다). 같은 소리가 잇달면(여러 번 때리기) 둘째부터 작게,
//         같은 순간에 여럿이 나면 조금씩 작게. 높이 흔들기는 맞는 소리에만 조금(상태 · 회복 · 방어 · 화면 소리는 늘 같게)
// 자료(assets/sfx/index.json)가 없거나 Node(시험 도구)이면 아무것도 안 한다. 브라우저가 소리를 막으면 첫 누름에 푼다.
import { SFX, ALIAS, HERO_KINDS, ENEMY_KINDS, FALLBACK, kindsIn, monsterDir, SLOT_GROUPS, slotsIn, slotMap, TAIL, KIND_TAIL, KIND_V, JITTER } from "./data/sfx-map.js";
import { sfxVolume, onSettings } from "./settings.js";
import ARTMAP from "./data/artmap.js";
import { HERO_DATA } from "./cardbook.js";

const W = typeof window === "object" ? window : null;
const AC = W && (W.AudioContext || W.webkitAudioContext);
const CACHE_MAX = 160, SAME_MS = 45;
const CAP = { hit: 4, hurt: 3, hero: 6, monster: 3, card: 3, ui: 2, ult: 2 };   // 갈래(앞머리 · 사도 hero · 적 monster)별 동시에 울리는 수. 없는 갈래는 3
const LIVE_MAX = 8;                       // 모두 합쳐 동시에 울리는 수(목소리는 따로 — js/voice.js)
const REPEAT_MS = 500, REPEAT_K = 0.72, REPEAT_MIN = 0.45;   // 같은 소리가 0.5초 안에 또 — 한 번마다 0.72배(0.45배까지)
const BUSY_MS = 70, BUSY_K = 0.12, BUSY_MIN = 0.6;           // 같은 순간(±70ms)에 다른 소리가 이미 걸렸다 — 하나마다 12% 작게(60% 까지, 맞는 소리는 빼고)
const now = () => (W && W.performance ? W.performance.now() : Date.now());

let ctx = null, out = null, keys = null, gains = null, idxP = null, dead = !AC;
// 첫 누름 · 키 전에는 AudioContext 를 만들지도 깨우지도 않는다 — 막힌 채 소리마다 깨우려다 브라우저가
// 「AudioContext was not allowed to start」 를 수천 번 찍었다. 그 전의 소리는 조용히 버린다
let woken = false;
const bufs = new Map();          // 경로 → AudioBuffer | Promise | null(못 읽음). 넣은 순서 = 오래된 순서
const lastAt = new Map();        // 갈래 · 경로 → 마지막으로 튼 때
const lastPath = new Map();      // 갈래 → 마지막으로 튼 경로
const live = {};                 // 갈래 앞머리 → [{ src, end }]
let all = [];                    // 모든 갈래 — [{ src, g 음량 마디, vol, start, end }] (LIVE_MAX)
const recent = new Map();        // 갈래 → [최근에 걸린 때 …] (REPEAT_MS)
const leads = new WeakMap();     // AudioBuffer → 앞의 고요(초)
const dirCache = new Map();      // "hero/lion" → { kind: [경로 …] }
const slotCache = new Map();     // "lion|ult" → { list, hit } (sfx-map 의 slotsIn)
const onsets = new WeakMap();    // AudioBuffer → 첫 마루(초)
let dropped = 0;                 // LIVE_MAX 에 걸려 버리거나 끊은 수(시험 도구용)
const trace = [];                // 시험 도구용 — 최근에 건 소리 [{ p 경로, at 시작(performance.now), on 첫 마루 ms, want 맞출 때 }]
let lastSpecific = -1e9;         // 단추 소리(ui.click)를 덮는 다른 소리가 막 났는가

function audio() {
  if (dead || !woken) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = sfxVolume();
      // 여럿이 겹친 순간만 살짝 누른다 — 하나씩 날 때는 거의 안 건드린다
      const comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
      if (comp) {
        comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3;
        comp.attack.value = 0.004; comp.release.value = 0.2;
        out.connect(comp); comp.connect(ctx.destination);
      } else out.connect(ctx.destination);
    } catch { dead = true; return null; }
  }
  return ctx;
}
// 색인 — 무엇이 있는지. 없으면(공개판에 안 실었거나 꺼내지 않았다) 효과음은 통째로 쉰다
function loadIndex() {
  if (keys || dead) return Promise.resolve(keys);
  if (!idxP) idxP = fetch("assets/sfx/index.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no sfx"))))
    .then((j) => { keys = Object.keys(j); gains = new Map(keys.filter((k) => j[k].g).map((k) => [k, j[k].g])); return keys; })
    .catch(() => { dead = true; return null; });
  return idxP;
}
function load(path) {
  if (bufs.has(path)) {
    const b = bufs.get(path);
    bufs.delete(path); bufs.set(path, b);          // 최근에 쓴 것으로
    return Promise.resolve(b);
  }
  const ac = audio();
  if (!ac) return Promise.resolve(null);
  const p = fetch("assets/sfx/" + path + ".ogg")
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(path))))
    .then((ab) => new Promise((ok, no) => { const q = ac.decodeAudioData(ab, ok, no); if (q && q.then) q.then(ok, no); }))
    .then((b) => { bufs.set(path, b); return b; })
    .catch(() => { bufs.set(path, null); return null; });
  bufs.set(path, p);
  while (bufs.size > CACHE_MAX) bufs.delete(bufs.keys().next().value);
  return p;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 첫 마루 — 20ms 창의 세기(RMS)가 그 파일 가장 센 창의 60% 를 처음 넘는 때(초). 에르핀 ultimate2 는 1.04초 · 아멜리아 ultimate1 은 0.10초
function onsetOf(buf) {
  if (onsets.has(buf)) return onsets.get(buf);
  const x = buf.getChannelData(0), n = Math.max(1, Math.round(buf.sampleRate * 0.02)), k = Math.floor(x.length / n);
  const r = new Float32Array(k);
  let top = 0;
  for (let i = 0; i < k; i++) {
    let a = 0;
    for (let j = i * n, e = j + n; j < e; j++) a += x[j] * x[j];
    r[i] = a; if (a > top) top = a;
  }
  let at = 0;
  for (let i = 0; i < k; i++) if (r[i] >= top * 0.36) { at = (i * n) / buf.sampleRate; break; }   // 세기² 0.36 = 세기 0.6
  onsets.set(buf, at);
  return at;
}
// 앞의 고요 — 가장 센 표본의 3%(-30dB)를 처음 넘기 4ms 전(초). 첫 마루보다 늦지 않다
function leadOf(buf) {
  if (leads.has(buf)) return leads.get(buf);
  const x = buf.getChannelData(0);
  let top = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > top) top = a; }
  let i = 0;
  while (i < x.length && (x[i] < 0 ? -x[i] : x[i]) < top * 0.03) i++;
  const at = Math.min(onsetOf(buf), Math.max(0, i / buf.sampleRate - 0.004));
  leads.set(buf, at);
  return at;
}
// 같은 소리가 막 났는가(작게) · 같은 순간에 다른 소리가 걸렸는가(조금 작게) — 둘을 곱한 배율
//   busy 는 맞는 소리가 아닌 것(상태 · 방어 · 회복 …)에만 — 같은 순간이면 맞는 소리를 앞세운다
function crowd(tag, t, soft) {
  const r = (recent.get(tag) || []).filter((x) => Math.abs(t - x) < REPEAT_MS);
  const rep = Math.max(REPEAT_MIN, Math.pow(REPEAT_K, r.length));
  r.push(t); recent.delete(tag); recent.set(tag, r.slice(-6));
  if (recent.size > 200) recent.delete(recent.keys().next().value);
  if (!soft) return rep;
  let n = 0;
  for (const x of all) if (Math.abs(x.at - t) < BUSY_MS) n++;
  return rep * Math.max(BUSY_MIN, 1 - BUSY_K * n);
}
// 울리는 것 하나를 짧게 줄여 끊는다(딸깍 소리 없이)
function cutOff(x, ac) {
  const t = ac.currentTime;
  x.end = Math.min(x.end, t + 0.035);
  try {
    if (x.start > t) { x.src.stop(); return; }
    x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(x.g.gain.value, t); x.g.gain.linearRampToValueAtTime(0, t + 0.03);
    x.src.stop(t + 0.035);
  } catch { /* 이미 끝났다 */ }
}

// 실제로 트는 곳 — 경로 후보 몇 개 중 하나
// hitAt(performance.now 기준 ms) 을 주면 delay 대신 — 첫 마루가 그때 오도록 당겨 시작한다(이미 늦었으면 바로)
// pitch — 높이 · 크기를 조금 흔든다(맞는 소리만). max · fade — 이 초를 넘는 꼬리는 fade 초 동안 줄여 끊는다(0 이면 끝까지)
async function fire(cat, list, { v = 1, pan = 0, delay = 0, pitch = false, gap = 50, tag, hitAt, max = 0, fade = 0.15 } = {}) {
  if (!list || !list.length || sfxVolume() <= 0) return;
  const t = hitAt != null ? hitAt : now() + Math.max(0, delay);     // 울릴 때 — 걸어 둔 소리는 그때로 잰다
  if (tag && Math.abs(t - (lastAt.get(tag) ?? -1e9)) < gap) return;
  const prev = tag && lastPath.get(tag);
  const path = pick(list.length > 1 && prev ? list.filter((p) => p !== prev) : list);   // 후보가 여럿이면 방금 것은 피한다
  if (Math.abs(t - (lastAt.get(path) ?? -1e9)) < SAME_MS) return;
  if (tag) { lastAt.set(tag, t); lastPath.set(tag, path); }
  lastAt.set(path, t);
  const busy = crowd(tag || path, t, !pitch);
  const buf = await load(path);
  const ac = audio();
  if (!buf || !ac || ac.state !== "running") return;     // 아직 막혀 있으면 이번 소리는 버린다(밀렸다가 한꺼번에 나지 않게)
  const gain = (gains && gains.get(path)) || 1;
  const vol = Math.max(0, Math.min(2, v * gain * busy * (pitch ? 0.94 + Math.random() * 0.06 : 1)));
  const at = ac.currentTime;
  // 모두 합쳐 LIVE_MAX — 넘치면 가장 작은(같으면 오래된) 것을 끊는다. 새것이 그보다 작으면 새것을 버린다
  all = all.filter((x) => x.end > at);
  if (all.length >= LIVE_MAX) {
    let w = all[0];
    for (const x of all) if (x.vol < w.vol || (x.vol === w.vol && x.start < w.start)) w = x;
    if (vol < w.vol) { dropped++; return; }
    cutOff(w, ac); all.splice(all.indexOf(w), 1); dropped++;
  }
  // 갈래마다 몇 개까지 — 넘치면 가장 오래된 것을 끊는다
  const q = (live[cat] = (live[cat] || []).filter((x) => x.end > at));
  while (q.length >= (CAP[cat] || 3)) { const o = q.shift(); cutOff(o, ac); all = all.filter((x) => x !== o); }
  const src = ac.createBufferSource();
  src.buffer = buf;
  if (pitch) src.playbackRate.value = 1 + (Math.random() - 0.5) * JITTER * 2;
  const rate = src.playbackRate.value || 1, lead = leadOf(buf);
  const g = ac.createGain();
  let node = src.connect(g);
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node = g.connect(p); }
  else node = g;
  node.connect(out);
  const on = hitAt != null ? Math.max(0, onsetOf(buf) - lead) / rate : 0;
  const wait = hitAt != null ? hitAt - now() - on * 1000 : delay;
  const start = at + Math.max(0, wait) / 1000;
  const full = (buf.duration - lead) / rate, len = max > 0 ? Math.min(full, max) : full;
  // 크기 곡선 — 잘라 들어가면 3ms 로 열고, 꼬리를 자르면 fade 초 동안 닫는다
  g.gain.setValueAtTime(lead > 0 ? 0 : vol, start);
  if (lead > 0) g.gain.linearRampToValueAtTime(vol, start + 0.003);
  if (len < full) {
    const f = Math.min(fade, len * 0.5);
    g.gain.setValueAtTime(vol, start + len - f);
    g.gain.linearRampToValueAtTime(0, start + len);
    src.start(start, lead, (len + 0.01) * rate);
  } else src.start(start, lead);
  const e = { src, g, vol, start, end: start + len, at: t };
  q.push(e); all.push(e);
  trace.push({ p: path, at: Math.round(now() + Math.max(0, wait)), on: Math.round(on * 1000), want: hitAt != null ? Math.round(hitAt) : null,
    v: +vol.toFixed(3), g: gain, len: +len.toFixed(2), lead: Math.round(lead * 1000), live: all.length });
  if (trace.length > 60) trace.shift();
}

// ── 공용 갈래 ──
export function play(kind, opts = {}) {
  if (dead || !woken) return;
  if (kind !== "ui.click") lastSpecific = now();
  const k = ALIAS[kind] || kind;
  const e = SFX[k];
  if (!e) return;
  const cat = k.split(".")[0], tl = TAIL[k] || TAIL[cat] || [0, 0.15];
  loadIndex().then((ks) => ks && fire(cat, e.f, { gap: e.gap ?? 50, pitch: !!e.jitter, max: e.max ?? tl[0], fade: e.fade ?? tl[1],
    ...opts, v: (e.v ?? 1) * (opts.v ?? 1), tag: k })).catch(() => {});
}
// 폴더 하나의 갈래별 파일 — 색인에서 한 번 추려 둔다
function kindsOf(top, dir, kinds) {
  const id = top + "/" + dir;
  if (!dirCache.has(id)) dirCache.set(id, dir ? kindsIn(keys, top, dir, kinds) : {});
  return dirCache.get(id);
}
let monsterDirs = null;
const heroDir = (key) => { const a = ARTMAP && ARTMAP.art && ARTMAP.art[key]; return a ? String(a).toLowerCase() : null; };
function enemyDir(key) {
  if (!monsterDirs) { monsterDirs = new Set(); for (const k of keys) if (k.startsWith("monster/")) monsterDirs.add(k.split("/")[1]); }
  return monsterDir(key, monsterDirs);
}
function own(top, dir, kind, kinds, opts) {
  if (dead || !woken) return;
  lastSpecific = now();
  loadIndex().then((ks) => {
    if (!ks) return;
    const d = top === "hero" ? heroDir(dir) : enemyDir(dir);
    const list = d && kindsOf(top, d, kinds)[kind];
    const tl = KIND_TAIL[kind] || [0, 0.15];
    if (list && list.length) return fire(top, list, { pitch: /Hit$|^hit$/.test(kind), max: tl[0], fade: tl[1], ...opts,
      v: (KIND_V[kind] ?? 1) * (opts.v ?? 1), tag: `${top}:${d}:${kind}` });
    if (FALLBACK[kind]) play(FALLBACK[kind], opts);
  }).catch(() => {});
}
export const hero = (key, kind, opts = {}) => own("hero", key, kind, HERO_KINDS, opts);
// 큰 소리가 ms 뒤 — 사도 제 소리(없으면 공용 대신 갈래)를 그만큼 당겨서
export const at = (key, kind, ms, opts = {}) => own("hero", key, kind, HERO_KINDS, { ...opts, hitAt: now() + Math.max(0, ms) });
// 이 사도의 이 갈래에 파일이 있는가 — 색인을 읽은 뒤에만 안다(못 읽었으면 false)
const hasKind = (key, kind) => { const d = keys && heroDir(key); return !!(d && (kindsOf("hero", d, HERO_KINDS)[kind] || []).length); };
function slotsOf(key, group) {
  const d = heroDir(key);
  if (!d || !keys) return { list: [], hit: [] };
  const id = d + "|" + group;
  if (!slotCache.has(id)) slotCache.set(id, slotsIn(keys, d, group));
  return slotCache.get(id);
}
// 동작 하나의 소리 — evs: 그 동작(이어지는 조각까지)의 스파인 SFX 이벤트 [{ n 칸 번호, t 지금부터 ms }].
// 칸 수가 파일 수와 맞으면(sfx-map 의 slotMap) 칸마다 그 파일을 그 시각에 — 맞는 소리 칸은 건너뛴다(맞는 순간에 land 가 낸다).
// 안 맞으면(또는 이벤트가 없으면) 대신: cast 갈래를 지금, impact 갈래(들 — 앞의 것부터 파일이 있는 것)는 첫 마루가 impactMs 에 오도록.
// impact 가 모두 없으면 공용 대신 갈래(FALLBACK)로. 무엇으로 틀었는지 돌려준다("events" · "fallback")
export async function action(heroKey, group, evs = [], { cast, impact, impactMs = 0, v = 1 } = {}) {
  if (dead || !heroKey) return null;
  lastSpecific = now();
  const t0 = now();
  if (!(await loadIndex())) return null;
  const m = evs.length ? slotMap(slotsOf(heroKey, group), evs.map((e) => e.n)) : null;
  const late = now() - t0;                  // 색인을 기다린 만큼 당긴다
  if (m) {
    const tl = KIND_TAIL[group] || [0, 0.15];
    for (const e of evs) {
      const p = m.get(e.n);
      if (p && p !== "hit") fire("hero", [p], { v: v * (KIND_V[group] ?? 1), delay: e.t - late, max: tl[0], fade: tl[1], tag: "slot:" + p + ":" + e.t });
    }
    return "events";
  }
  if (cast) hero(heroKey, cast, { v });
  const ks = [].concat(impact || []);
  if (ks.length) {
    const k = ks.find((x) => hasKind(heroKey, x)) || ks[0];
    at(heroKey, k, impactMs - late, { v });
  }
  return "fallback";
}
export const enemy = (key, kind, opts = {}) => own("monster", key, kind, ENEMY_KINDS, opts);

// ── 전투 한 줄짜리 ──
// 카드를 냈다 — 날아가는 소리 + 종류 소리(공격 · 스킬 · 방어 · 회복 · 강화 · 기술). 공격 카드는 그 사도의 휘두르는 소리로.
// motion — 전투 화면이 SD 동작을 붙인다(fight-screen 의 playBeats 가 그 동작에 맞는 사도 소리 · 종류 소리를 낸다). 그때는 날아가는 소리만
export function card(c, heroKey, { motion = false } = {}) {
  if (dead || !c) return;
  play("card.play");
  if (motion) return;
  if (c.type === "공격" && heroKey) hero(heroKey, "attack", { v: 0.8 });
  else play("card." + c.type);
}
// 맞는 순간(fight-screen 의 land(h, act)) — h.k: hurt · heal · block · shield · status · die
//   hero · enemy  때린 쪽(사도 key · 적 key), ult  고학년 타격, heavy  크게 맞음(최대 HP 25% 이상). 맞은 쪽(h.side)으로 소리를 조금 민다
const BAD = new Set(["취약", "약화", "감전", "중독", "기절", "침묵", "봉인", "출혈", "화상", "수은", "도발"]);
//   group — 사도 동작의 소리 갈래(power · skill) — 그 갈래의 맞는 소리(powerHit · skillHit)가 있으면 그것
export function land(h, { hero: hk = null, enemy: ek = null, ult = false, heavy = false, group = null } = {}) {
  if (dead || !h) return;
  const pan = h.side === "party" ? -0.25 : h.side === "enemy" ? 0.25 : 0;
  if (h.k === "die") return play(h.side === "enemy" ? "death.enemy" : "death.hero", { pan });
  if (h.k === "heal") return play("heal", { pan });
  if (h.k === "block" || h.k === "shield") return play("block.gain", { pan });
  if (h.k === "status") {
    if (h.id === "기절") return play("status.stun", { pan });
    if (h.id === "화상") return play("status.burn", { pan });
    // up — 맞은 쪽에 좋은가(엔진이 아는 것: 능력치 증감 · 적의 강화). false 면 이름과 상관없이 약화 소리
    return play(h.up === false ? "debuff" : h.up || !BAD.has(h.id) ? "buff" : "debuff", { pan });
  }
  if (h.k !== "hurt") return;
  if (!h.v) return play("block.hit", { pan });
  if (ek) enemy(ek, "hit", { pan });
  else if (hk) {
    const type = (HERO_DATA[hk] || {}).dmgType === "마법" ? "hit.magic" : "hit.slash";
    loadIndex().then((ks) => {
      if (!ks) return;
      const mine = ult ? "ultHit" : [group === "power" && "powerHit", group === "skill" && "skillHit", "attackHit"].find((k) => k && hasKind(hk, k));
      if (mine && hasKind(hk, mine)) hero(hk, mine, { pan });
      // 고학년인데 맞는 소리가 없다 — 터지는 소리(ult2 · ultBoom)는 action 이 이미 맞춰 틀었으니 타격 갈래만. 그것도 없으면 공용 터짐
      else play(ult && !hasKind(hk, "ult2") && !hasKind(hk, "ultBoom") ? "ult.impact" : type, { pan });
    }).catch(() => {});
  } else play("hit.small", { pan });                  // 때린 이가 없다 — 중독 · 가시 따위
  if (h.crit) play("hit.crit", { pan, delay: 20 });
  if (heavy && !ult) play("hit.heavy", { pan, delay: 30, v: 0.7 });
}
// 고학년 — 컷인(원작 「사도 부르기」 + 그 사도의 시전 소리) · 터지는 순간(그 사도의 타격 소리)
export function ult(heroKey, phase = "cutin") {
  if (dead) return;
  if (phase === "cutin") { play("ult.cutin"); hero(heroKey, "ult", { delay: 250 }); }
  else hero(heroKey, "ult2");
}
// 미리 받아 둔다 — 갈래 이름 · "hero:<사도 key>" · "enemy:<적 key>"
export async function preload(list = []) {
  if (dead || !(await loadIndex())) return;
  const paths = new Set();
  for (const it of list) {
    const m = /^(hero|enemy):(.+)$/.exec(it);
    if (m) {
      const top = m[1] === "hero" ? "hero" : "monster";
      const d = m[1] === "hero" ? heroDir(m[2]) : enemyDir(m[2]);
      if (d) for (const l of Object.values(kindsOf(top, d, m[1] === "hero" ? HERO_KINDS : ENEMY_KINDS))) for (const p of l) paths.add(p);
      if (d && top === "hero") for (const g of Object.keys(SLOT_GROUPS)) for (const p of slotsOf(m[2], g).list) paths.add(p);
    } else { const e = SFX[ALIAS[it] || it]; if (e) for (const p of e.f) paths.add(p); }
  }
  await Promise.all([...paths].map(load));
}
// 울리는 것을 모두 멈춘다(화면을 떠날 때 따위)
export function stopAll() {
  for (const q of Object.values(live)) for (const x of q.splice(0)) { try { x.src.stop(); } catch { /* 이미 끝났다 */ } }
  all = [];
}
// 걸어 두고 아직 안 울린 것만 걷는다 — 몸짓을 걷을 때(새 수) 늦게 터지는 소리가 남지 않게
export function stopPending() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [c, q] of Object.entries(live)) live[c] = q.filter((x) => { if (x.start <= t) return true; try { x.src.stop(); } catch { /* 이미 끝났다 */ } return false; });
  all = all.filter((x) => x.start <= t);
}
// 시험 도구용 — 쓸 수 있는가 · 받아 둔 수
export const status = () => ({
  on: !dead, ctx: ctx ? ctx.state : null, keys: keys ? keys.length : 0,
  decoded: [...bufs.values()].filter((b) => b && typeof b.duration === "number").length,
  playing: Object.fromEntries(Object.entries(live).map(([c, q]) => [c, q.filter((x) => !ctx || x.end > ctx.currentTime).length])),
  live: all.filter((x) => !ctx || x.end > ctx.currentTime).length, liveMax: LIVE_MAX, dropped,
  trace: trace.slice(),
});

export const sfx = { play, hero, enemy, card, land, ult, action, at, preload, stopAll, stopPending, status };
export default sfx;

// 음량을 밀면 울리는 중인 것에도 바로
onSettings(() => { if (out) out.gain.value = sfxVolume(); });

// 브라우저는 누르기 전까지 소리를 막는다 — 첫 누름 · 키에 깨우고, 단추를 누르면 「딸깍」.
// 누른 단추가 제 소리(상점 사기 · 지도 걷기 …)를 이미 냈으면 딸깍은 건너뛴다. data-nosfx 가 붙은 곳은 조용히
const D = typeof document === "object" && document && typeof document.addEventListener === "function" ? document : null;
if (D && AC) {
  // 깨우기(resume)는 누름 안에서만 — 탭을 갔다 와 다시 잠들었으면 다음 누름에 깬다
  const wake = () => {
    woken = true;
    const ac = audio();
    if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    loadIndex();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) D.addEventListener(ev, wake, { capture: true, passive: true });
  D.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest("button, [role=button]");
    if (!b || b.disabled || b.closest("[data-nosfx]")) return;
    if (now() - lastSpecific < 40) return;
    play("ui.click");
  });
}
