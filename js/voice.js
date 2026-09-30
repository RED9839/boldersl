// 사도 목소리 — 로비(메인 사도 교감)와 편성(사도를 넣을 때 하는 말)이 같이 쓴다.
// 목소리 폴더 이름: 스탠딩 아틀라스 이름(vivi.atlas → assets/voice/vivi) → 없으면 원작 영문 이름(artmap: 에르핀 → erpin).
// 자료(assets/voice)가 없으면 조용히 넘어간다 — 공개판처럼 편성 대사만 실은 곳에서도 없는 갈래는 소리 없이.
import { loadSpineManifest } from "./spine-view.js";
import { voiceVolume, onSettings } from "./settings.js";
import { voicePoolFor } from "./motion-voice.js";
import ARTMAP from "./data/artmap.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];
let voiceIndex = null, voiceFailed = false, voiceNow = null, voiceGen = 0;
let lastFile = null, lastAt = 0;
const NO_REPEAT_MS = 12000;                    // 대사가 하나뿐인 갈래 — 이 사이에 또 누르면 소리 없이 동작만
async function loadVoices() {
  if (voiceIndex || voiceFailed) return voiceIndex;
  try {
    const r = await fetch("assets/voice/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error("no voice");
    voiceIndex = await r.json();
  } catch { voiceFailed = true; }
  return voiceIndex;
}
// 한 사도의 목소리 묶음 — 스탠딩은 Normal 스킨이라 스킨 전용(_skinN)은 뺀다.
// touch · dutchrubend 는 사도 데스크처럼 둘로 가른다: touch1 볼 당기기 · touch2 쓰다듬기 · dutchrubend1 맞는 소리 · 2 대사
async function voiceSet(key) {
  const [idx, m] = await Promise.all([loadVoices(), loadSpineManifest()]);
  const e = m && m.standing && m.standing[key];
  const art = ARTMAP && ARTMAP.art && ARTMAP.art[key];
  const dirs = [e ? e.atlas.replace(/\.atlas$/, "").toLowerCase() : null, art ? String(art).toLowerCase() : null];
  const dir = idx && dirs.find((d) => d && idx[d] && idx[d].base);
  const base = dir ? idx[dir].base : null;
  if (!base) return null;
  const cats = {};
  for (const [c, l] of Object.entries(base)) cats[c] = l.filter((f) => !/_skin\d/.test(f));
  const only = (list, re) => (list || []).filter((f) => re.test(f));
  cats.cheek = only(cats.touch, /touch1(?:_\d+)?\.ogg$/);
  cats.pat = only(cats.touch, /touch2(?:_\d+)?\.ogg$/);
  cats.smashHit = only(cats.dutchrubend, /dutchrubend1(?:_\d+)?\.ogg$/);
  cats.smashLine = only(cats.dutchrubend, /dutchrubend2(?:_\d+)?\.ogg$/);
  return cats;
}
function hush() {
  if (voiceNow) { try { voiceNow.pause(); } catch { /* 이미 멈췄다 */ } voiceNow = null; }
}
// 멈춤 — 지금 소리도, 자료를 읽는 중이던 부름도(차례표를 넘겨 무효로)
export function stopVoice() { voiceGen++; hush(); }
// 갈래 목록에서 앞에서부터 있는 것 하나(사도 데스크의 voicePoolFor). 기다리는 사이 새 부름이 왔거나 로비를 떠났으면 안 튼다.
// 방금 튼 파일은 되도록 피한다 — 하나뿐이면 12초 안에는 안 튼다(웃음처럼 되풀이해도 되는 것은 repeat)
// 튼 Audio 를 돌려준다(막혔거나 없으면 null) — 부른 쪽이 대사가 끝날 때까지 자세를 붙든다
export async function speak(key, cats, alive = () => true, { repeat = false } = {}) {
  if (!cats || !cats.length || voiceVolume() <= 0 || typeof Audio !== "function") return null;
  const my = ++voiceGen;
  const set = await voiceSet(key);
  if (my !== voiceGen || !alive() || !set) return null;
  let pool = voicePoolFor(set, cats);
  if (!pool.length) return null;
  if (!repeat) {
    if (pool.length > 1) pool = pool.filter((f) => f !== lastFile);
    else if (pool[0] === lastFile && Date.now() - lastAt < NO_REPEAT_MS) return null;
  }
  hush();
  const f = pick(pool);
  const a = new Audio("assets/voice/" + f);
  a.volume = voiceVolume();
  voiceNow = a; lastFile = f; lastAt = Date.now();
  // 브라우저는 사용자가 한 번도 누르지 않은 페이지의 소리를 막는다 — 첫 인사가 막히면 조용히 넘어간다
  try { await a.play(); } catch { if (voiceNow === a) voiceNow = null; return null; }
  return a;
}
// 대사가 끝나면(다 읽거나 · 끊기거나 · 못 읽거나) 풀리는 약속. 길어도 10초에서 놓는다
export const voiceDone = (a) => (a ? new Promise((r) => {
  const f = () => r();
  a.addEventListener("ended", f, { once: true }); a.addEventListener("error", f, { once: true }); a.addEventListener("pause", f, { once: true });
  setTimeout(f, 10000);
}) : Promise.resolve());
// 음량을 밀면 울리는 중인 목소리에도 바로
onSettings(() => { if (voiceNow) voiceNow.volume = voiceVolume(); if (voiceVolume() <= 0) hush(); });
