// 메인 로비 — 트릭컬 · 카제나 로비처럼 비서 사도 한 명이 크게 서 있고, 오른쪽에 메뉴가 세로로 선다.
//   비서   스탠딩 스파인. 누르면 쓰다듬기 · 말풍선(js/data/talk.js — 우리가 쓴 대사) · 목소리(assets/voice, 있으면)
//          「비서 바꾸기」로 누구든 세울 수 있고, 고른 사도는 설정(localStorage)에 남는다
//   메뉴   모험 시작 · 사도 도감 · 도움말 · 설정
// 그림 · 목소리가 없는 곳(추출 자료 없이 받은 사람)에서도 돈다 — 스파인이 없으면 그림 한 장, 그마저 없으면 이름 칸.
// 이름이 다른 화면과 겹쳐 데인 적이 있어(.fcard · .top) 모두 #screen.lobby2 아래 · lb- 로 시작한다.
import * as art from "./art.js";
import { HERO_DATA } from "./cardbook.js";
import { FLOORS } from "./data/enemies.js";
import TALK from "./data/talk.js";
import { spineView, loadSpineManifest } from "./spine-view.js";
import { getSettings, setSetting } from "./settings.js";
import { toggleFullscreen } from "./stage.js";

const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TONES = { 순수: "#a8d8b5", 광기: "#e89e94", 냉정: "#99cadc", 우울: "#bfb2e0", 활발: "#edce86", 공명: "#dbd2bb" };
const DEFAULT_HERO = "에르핀";
const BG = "assets/bg/stage1_1.jpg";          // 1층 에르피엔 — 세계수 아래 요정 마을

// 비서의 몸짓 — 스탠딩 스파인의 동작 이름. 사도마다 조금씩 달라서 없는 이름은 조용히 넘어간다(spine-view play)
const ANIM = {
  enter: ["Happy_1", "Smile_1", "Happy_2"],
  pet: [["Touch_Idle", "Touch_End"], ["Pat_Idle", "Pat_End"]],
  joy: ["Happy_1", "Happy_2", "Smile_1", "Smile_2", "Shy_1", "Laugh_1"],
  idle: ["Sad_1", "Sulky_1", "Smile_1"],
};
// 목소리 갈래 — assets/voice/index.json 의 이름
const VOICE = { enter: ["greeting", "callplayer"], pet: ["touch", "pleasure", "joy"], idle: ["callplayer", "hmm"] };
// 대사가 없는 사도(스탠딩만 있는 이격 등)에게 — 이름만 바꿔 쓴다
const PLAIN = {
  start: ["교주님, 오늘도 모험 가요?", "준비는 다 됐어요. 언제든지요!"],
  pet: ["헤헤, 간지러워요.", "교주님 손, 따뜻하네요.", "또 쓰다듬어 주시는 거예요?"],
  idle: ["교주님? …자는 거 아니죠?", "심심하면 모험이라도 가요."],
};

// 비서의 대사 — 이격(에르핀_왕도)은 본디 사도(에르핀)의 것을 빌린다
function linesOf(key) {
  const L = (TALK && TALK.lines) || {};
  const t = L[key] || L[String(key).split("_")[0]] || null;
  const from = (...ms) => (t ? ms.flatMap((m) => t[m] || []) : []);
  return {
    start: from("start").length ? from("start") : from("win").length ? from("win") : PLAIN.start,
    pet: from("heal", "win", "kill").length ? from("heal", "win", "kill") : PLAIN.pet,
    idle: from("idle").length ? from("idle") : PLAIN.idle,
  };
}

// ── 목소리 ─────────────────────────────────────────────────────────────
// 스탠딩 아틀라스 이름(vivi.atlas)이 목소리 폴더 이름(assets/voice/vivi)과 같다
let voiceIndex = null, voiceFailed = false, voiceNow = null, voiceGen = 0;
async function loadVoices() {
  if (voiceIndex || voiceFailed) return voiceIndex;
  try {
    const r = await fetch("assets/voice/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error("no voice");
    voiceIndex = await r.json();
  } catch { voiceFailed = true; }
  return voiceIndex;
}
async function voiceFolder(key) {
  const m = await loadSpineManifest();
  const e = m && m.standing && m.standing[key];
  return e ? e.atlas.replace(/\.atlas$/, "").toLowerCase() : null;
}
function hush() {
  if (voiceNow) { try { voiceNow.pause(); } catch { /* 이미 멈췄다 */ } voiceNow = null; }
}
// 멈춤 — 지금 소리도, 자료를 읽는 중이던 부름도(차례표를 넘겨 무효로)
export function stopVoice() { voiceGen++; hush(); }
async function speak(key, kinds, alive = () => true) {
  if (getSettings().voice === false || typeof Audio !== "function") return;
  const my = ++voiceGen;
  const [idx, dir] = await Promise.all([loadVoices(), voiceFolder(key)]);
  if (my !== voiceGen || !alive()) return;   // 그사이 새 부름이 왔거나 로비를 떠났다
  const set = idx && dir && idx[dir] && idx[dir].base;
  if (!set) return;
  // 「-01」 같은 조각 파일은 뺀다 — 한 마디가 여러 토막으로 나뉜 것의 뒤쪽이다
  const files = kinds.flatMap((k) => (set[k] || []).filter((f) => !/-\d+\.ogg$/.test(f) && !/_skin\d/.test(f)));
  if (!files.length) return;
  hush();
  const a = new Audio("assets/voice/" + pick(files));
  a.volume = 0.7;
  voiceNow = a;
  // 브라우저는 사용자가 한 번도 누르지 않은 페이지의 소리를 막는다 — 첫 인사가 막히면 조용히 넘어간다
  try { await a.play(); } catch { /* 막혔다 */ }
}

// ── 로비 ──────────────────────────────────────────────────────────────
// onStart 모험 시작(편성으로) · onDex 사도 도감 · onHelp 도움말
export function lobbyScreen(onStart, { onDex, onHelp } = {}) {
  const s = document.querySelector("#screen");
  s.className = "lobby2";
  s.replaceChildren();
  s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(BG, location.href).href : BG}")`);

  const set0 = getSettings();
  let heroKey = HERO_DATA[set0.lobbyHero] ? set0.lobbyHero : HERO_DATA[DEFAULT_HERO] ? DEFAULT_HERO : Object.keys(HERO_DATA)[0];
  const me = {};
  s._lobby = me;
  const alive = () => s._lobby === me && s.className === "lobby2";
  const leave = (fn) => () => { stopVoice(); clearInterval(idleTimer); closeModal(); s._lobby = null; fn && fn(); };

  // ① 머리 — 이름 · 전체화면 · 설정
  const top = node("header", "lb-top");
  const logo = node("div", "lb-logo");
  logo.append(node("b", null, "볼더슬"), node("span", null, "세계수 아래의 카드 모험"));
  top.appendChild(logo);
  const fs = node("button", "lb-icon", "⛶");
  fs.type = "button"; fs.title = "전체화면"; fs.setAttribute("aria-label", "전체화면");
  fs.onclick = () => toggleFullscreen();
  const gear = node("button", "lb-icon", "⚙");
  gear.type = "button"; gear.title = "설정"; gear.setAttribute("aria-label", "설정");
  gear.onclick = () => openSettings();
  top.append(fs, gear);
  s.appendChild(top);

  // ② 가운데 — 비서
  const stage = node("section", "lb-stage");
  const bubble = node("div", "lb-bubble");
  const who = node("b");
  const line = node("p", "lb-line");
  bubble.append(who, line);
  const stand = node("button", "lb-stand");
  stand.type = "button";
  const plate = node("div", "lb-plate");
  const plateName = node("b");
  const swap = node("button", "lb-swap", "비서 바꾸기");
  swap.type = "button";
  swap.onclick = () => openPicker();
  plate.append(plateName, node("span", null, "누르면 쓰다듬습니다"), swap);
  stage.append(stand, bubble, plate);
  s.appendChild(stage);

  // ③ 오른쪽 — 메뉴
  const menu = node("nav", "lb-menu");
  const start = node("button", "lb-start home-primary");
  start.type = "button";
  start.append(node("b", null, "모험 시작"), node("span", null, "사도 셋을 골라 세계수 아래로"));
  start.onclick = leave(onStart);
  menu.appendChild(start);
  const item = (icon, label, why, fn, cls) => {
    const b = node("button", "lb-item" + (cls ? " " + cls : ""));
    b.type = "button";
    b.append(node("i", null, icon));
    const t = node("span");
    t.append(node("b", null, label), node("small", null, why));
    b.appendChild(t);
    b.onclick = fn;
    menu.appendChild(b);
    return b;
  };
  if (onDex) item("❖", "사도 도감", "135명의 능력 · 카드 · 신탁", leave(onDex), "lb-dex");
  if (onHelp) item("?", "도움말", "상성 · 줄 · 은총과 신탁 · 드랍", () => onHelp(), "lb-help");
  item("⚙", "설정", "움직임 · 글자 · 목소리", () => openSettings(), "lb-set");
  // 여정 — 세 층
  const route = node("div", "lb-route");
  route.appendChild(node("small", null, "여정"));
  const hops = node("ol");
  FLOORS.forEach((f, i) => {
    const li = node("li");
    li.append(node("em", null, String(i + 1)), node("b", null, f.name), node("span", null, f.sub));
    hops.appendChild(li);
  });
  route.appendChild(hops);
  menu.appendChild(route);
  s.appendChild(menu);

  s.appendChild(node("p", "lb-legal", "트릭컬 리바이브 팬 게임 · 비공식 개인 제작. 공식과 무관합니다."));

  // ── 비서 세우기 ──
  let body = null, lines = null, pats = 0, standGen = 0;
  function say(t) {
    line.textContent = t;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
  }
  function act(kind) {
    if (!body) return;
    const a = pick(ANIM[kind]);
    if (Array.isArray(a)) body.play(a[0], false, a[1]) || body.play(pick(ANIM.joy));
    else body.play(a);
  }
  function standUp(key, greet) {
    const gen = ++standGen;
    heroKey = key;
    const h = HERO_DATA[key];
    lines = linesOf(key);
    if (body) body.dispose?.();
    body = null;
    stand.replaceChildren();
    stand.className = "lb-stand";
    stand.style.setProperty("--tone", TONES[h.nature] || "#d8cfa8");
    stand.setAttribute("aria-label", `${h.ko} 쓰다듬기`);
    who.textContent = h.ko;
    plateName.textContent = h.ko;
    say(pick(lines.start));
    // 화면에 붙은 뒤에 그린다(크기를 재야 한다). 스파인이 없으면 그림 한 장 → 이름 칸
    const wantSpine = getSettings().spine !== false;
    (wantSpine ? spineView(stand, "standing", key, { anim: "Idle" }) : Promise.resolve(null)).then((v) => {
      if (gen !== standGen || !alive()) { v?.dispose?.(); return; }
      if (!v) { stand.classList.add("still"); stand.appendChild(art.portrait(key, { ko: h.ko, tint: TONES[h.nature], size: 0, slot: "event", still: true })); return; }
      body = v; stand.classList.add("live");
      act("enter");
    });
    if (greet) speak(key, VOICE.enter, alive);
  }
  stand.onclick = () => {
    pats++;
    say(pick(lines.pet));
    act(pats % 3 === 0 ? "joy" : "pet");
    speak(heroKey, VOICE.pet, alive);
    lastTouch = Date.now();
  };
  // 한동안 안 누르면 혼잣말
  let lastTouch = Date.now();
  const idleTimer = setInterval(() => {
    if (!alive()) { clearInterval(idleTimer); if (!s._lobby) stopVoice(); return; }
    if (Date.now() - lastTouch < 25000) return;
    lastTouch = Date.now();
    say(pick(lines.idle));
    act("idle");
  }, 5000);
  idleTimer?.unref?.();              // 시험(node)에서 이 타이머가 프로세스를 붙잡지 않게

  // ── 창 — 한 번에 하나. ×  · 바깥 · Esc 로 닫고, 닫을 때 Esc 듣기도 같이 뗀다 ──
  let modalClose = null;
  function closeModal() { if (modalClose) modalClose(); }
  function openModal(back, x) {
    closeModal();
    const esc = (e) => { if (e.key === "Escape") close(); };
    const close = () => { back.remove(); document.removeEventListener?.("keydown", esc); if (modalClose === close) modalClose = null; };
    modalClose = close;
    x.onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    document.addEventListener?.("keydown", esc);
    document.body.appendChild(back);
    return close;
  }

  // ── 비서 고르기 ──
  function openPicker() {
    const back = node("div", "lb-modal");
    const box = node("div", "lb-box lb-picker");
    const head = node("div", "lb-boxhead");
    head.appendChild(node("b", null, "비서 바꾸기"));
    const q = node("input", "lb-search");
    q.placeholder = "이름";
    head.appendChild(q);
    const x = node("button", "lb-x", "×");
    x.type = "button";
    head.appendChild(x);
    box.appendChild(head);
    const grid = node("div", "lb-grid");
    box.appendChild(grid);
    back.appendChild(box);
    const close = openModal(back, x);
    loadSpineManifest().then((m) => {
      const has = (k) => !m || !m.standing || !!m.standing[k];
      const all = Object.entries(HERO_DATA).filter(([k]) => has(k)).sort((a, b) => a[1].ko.localeCompare(b[1].ko));
      const draw = () => {
        grid.replaceChildren();
        const f = (q.value || "").trim();
        for (const [k, h] of all) {
          if (f && !h.ko.includes(f)) continue;
          const b = node("button", "lb-pick" + (k === heroKey ? " on" : ""));
          b.type = "button";
          b.style.setProperty("--tone", TONES[h.nature] || "#d8cfa8");
          b.append(art.portrait(k, { ko: h.ko, tint: TONES[h.nature], size: 0, slot: "event", still: true }), node("span", null, h.ko));
          b.onclick = () => { setSetting("lobbyHero", k); close(); standUp(k, true); };
          grid.appendChild(b);
        }
        if (!grid.children.length) grid.appendChild(node("p", "lb-none", "그런 이름의 사도가 없습니다."));
      };
      q.oninput = draw;
      draw();
      q.focus && q.focus();
    });
  }

  // ── 설정 ──
  function openSettings() {
    const back = node("div", "lb-modal");
    const box = node("div", "lb-box lb-settings");
    const head = node("div", "lb-boxhead");
    head.appendChild(node("b", null, "설정"));
    const x = node("button", "lb-x", "×");
    x.type = "button";
    head.appendChild(x);
    box.appendChild(head);
    const set = getSettings();
    const toggle = (label, why, on, fn) => {
      const b = node("button", "lb-toggle" + (on ? " on" : ""));
      b.type = "button";
      const t = node("span");
      t.append(node("b", null, label), node("small", null, why));
      b.append(t, node("i", null, on ? "켬" : "끔"));
      b.onclick = () => { fn(); openSettings(); };
      box.appendChild(b);
    };
    toggle("사도 목소리", "로비에서 비서가 말할 때 목소리를 냅니다", set.voice !== false, () => { setSetting("voice", set.voice === false); if (set.voice !== false) stopVoice(); });
    toggle("사도 움직임", "끄면 그림 한 장 — 느린 기계에서 가볍습니다", set.spine !== false, () => { setSetting("spine", !(set.spine !== false)); standUp(heroKey, false); });
    toggle("움직임 줄이기", "반짝임 · 튀는 효과를 끕니다", !!set.calm, () => setSetting("calm", !set.calm));
    toggle("글자 크게", "이름 · 카드 글 · 체력 숫자를 한 치수 더", !!set.big, () => setSetting("big", !set.big));
    back.appendChild(box);
    openModal(back, x);
  }

  standUp(heroKey, true);
  return s;
}
