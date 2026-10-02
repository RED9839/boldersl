// 메인 로비 — 트릭컬 · 카제나 로비처럼 메인 사도 한 명이 크게 서 있고, 오른쪽에 메뉴가 세로로 선다.
//   메인 사도   스탠딩 스파인. 사도 데스크의 교감을 그대로 가져왔다 — 누른 자리(본으로 가른 머리 · 얼굴 · 몸)와 손짓에 따라
//               머리 톡 = 꿀밤(Smash_End_1 → _2 · dutchrubend1 → 2) · 머리 끌기 = 쓰다듬기(Pat_Idle → Pat_End · touch2)
//               얼굴 끌기 = 볼 당기기(Touch_Idle → Touch_End · touch1) · 몸 문지르기 = 간지럽히기(Tickle · 웃음)
//               몸 · 얼굴 톡 = 가벼운 반응 동작 + 그 동작에 맞는 목소리(js/motion-voice.js — 사도 데스크의 표)
//               가만히 두면 잡담 동작(Talk · Blank · Thinking …)에 맞는 목소리. 말풍선은 우리가 쓴 대사(js/data/talk.js)
//               「메인 사도 바꾸기」로 누구든 세울 수 있고, 고른 사도는 설정(localStorage)에 남는다
//   메뉴        모험 시작 · 사도 도감 · 도움말 · 설정(js/settings-panel.js — 전투와 같은 창)
// 그림 · 목소리가 없는 곳(추출 자료 없이 받은 사람)에서도 돈다 — 스파인이 없으면 그림 한 장, 그마저 없으면 이름 칸.
// 이름이 다른 화면과 겹쳐 데인 적이 있어(.fcard · .top) 모두 #screen.lobby2 아래 · lb- 로 시작한다.
import * as art from "./art.js";
import { HERO_DATA } from "./cardbook.js";
import { FLOORS } from "./data/enemies.js";
import TALK from "./data/talk.js";
import { spineView, loadSpineManifest } from "./spine-view.js";
import { getSettings, setSetting } from "./settings.js";
import { speak, stopVoice, voiceDone } from "./voice.js";
import { toggleFullscreen } from "./stage.js";
import { voiceCatsFor } from "./motion-voice.js";
import { settingsPanel } from "./settings-panel.js";

const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TONES = { 순수: "#a8d8b5", 광기: "#e89e94", 냉정: "#99cadc", 우울: "#bfb2e0", 활발: "#edce86", 공명: "#dbd2bb" };
const DEFAULT_HERO = "에르핀";
const BG = "assets/bg/stage1_1.jpg";          // 1층 에르피엔 — 세계수 아래 요정 마을
const IDLE_AFTER = 18000;                      // 이만큼 안 건드리면 잡담 동작
const TAP_PX = 8;                              // 이보다 덜 움직이고 떼면 「톡」
const RUB_TRAVEL = 70;                         // 몸을 이만큼 좌우로 문지르면 간지럽히기

// 대사가 없는 사도(스탠딩만 있는 이격 등)에게
const PLAIN = {
  start: ["교주님, 오늘도 모험 가요?", "준비는 다 됐어요. 언제든지요!"],
  pet: ["헤헤, 간지러워요.", "교주님 손, 따뜻하네요.", "또 쓰다듬어 주시는 거예요?"],
  ouch: ["아얏! 왜 때려요!", "머리는 안 돼요!"],
  tickle: ["아하하! 그, 그만요!", "간지러워요, 히히!"],
  idle: ["교주님? …자는 거 아니죠?", "심심하면 모험이라도 가요."],
};
// 메인 사도의 대사 — 이격(에르핀_왕도)은 본디 사도(에르핀)의 것을 빌린다
function linesOf(key) {
  const L = (TALK && TALK.lines) || {};
  const t = L[key] || L[String(key).split("_")[0]] || null;
  const from = (...ms) => (t ? ms.flatMap((m) => t[m] || []) : []);
  const or = (a, b) => (a.length ? a : b);
  return {
    start: or(from("start"), or(from("win"), PLAIN.start)),
    pet: or(from("heal", "win", "kill"), PLAIN.pet),
    ouch: or(from("hit", "down"), PLAIN.ouch),
    tickle: or(from("heal", "kill"), PLAIN.tickle),
    idle: or(from("idle"), PLAIN.idle),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 교감 영역 — 사도 데스크(mascot.js headGeom · zoneAt)를 옮겼다 ──
// 머리 본(목) · 눈 본(얼굴 높이) · 게임의 교감 기준점(Character_Pat = 머리선, Character_Ball_Move = 볼)으로
// 「눈썹 위 = 머리 · 턱~눈썹 = 얼굴 · 나머지 = 몸」. 모자 · 뿔 때문에 테두리 상단은 쓰지 않는다
function zoneOf(sk, p) {
  if (!sk || !p) return "body";
  const bones = sk.bones || [];
  const find = (re, not) => bones.find((b) => re.test(b.data.name) && !(not && not.test(b.data.name)));
  const hb = find(/^(S\d_)?Head$/i) || find(/head/i, /hair|ac|ct|rct/i);
  const eyes = bones.filter((b) => /eye/i.test(b.data.name) && !/brow|lash|light|shadow|ac/i.test(b.data.name));
  const pat = find(/^Character_Pat$/), ball = find(/^Character_Ball_Move$/);
  const k = Math.abs(sk.scaleY) || 1;
  let neckY, headX;
  if (hb) { neckY = hb.worldY; headX = pat ? pat.worldX : hb.worldX; }
  else if (ball) { neckY = ball.worldY - 45 * k; headX = pat ? pat.worldX : ball.worldX; }
  else return "body";
  let d = eyes.length ? eyes.reduce((a, b) => a + b.worldY, 0) / eyes.length - neckY : 0;
  if (d < 20 * k) d = 65 * k;
  const u = Math.max(d, 60 * k);
  let browY = neckY + d + 0.6 * u;
  if (pat && ball && pat.worldY > ball.worldY) browY = Math.min(browY, pat.worldY - 0.1 * (pat.worldY - ball.worldY));
  const dx = Math.abs(p.x - headX);
  if (p.y < neckY - 0.2 * u || dx > 3.2 * u) return "body";
  if (p.y <= browY) return dx <= 2.2 * u ? "cheek" : "body";
  return "head";
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
  // 로비 한 벌마다 표 — 같은 #screen 에 로비가 다시 서면 옛 타이머 · 옛 부름은 제 것이 아님을 안다
  const me = {};
  s._lobby = me;
  const alive = () => s._lobby === me && s.className === "lobby2";
  const leave = (fn) => () => { stopVoice(); clearInterval(idleTimer); closeModal(); s._lobby = null; fn && fn(); };

  // ① 머리 — 이름 · 전체화면 · 설정
  const top = node("header", "lb-top");
  const logo = node("div", "lb-logo");
  logo.append(node("b", null, "볼제나"), node("span", null, "세계수 아래의 카드 모험"));
  top.appendChild(logo);
  const fs = node("button", "lb-icon", "⛶");
  fs.type = "button"; fs.title = "전체화면"; fs.setAttribute("aria-label", "전체화면");
  fs.onclick = () => toggleFullscreen();
  const gear = node("button", "lb-icon", "⚙");
  gear.type = "button"; gear.title = "설정"; gear.setAttribute("aria-label", "설정");
  gear.onclick = () => openSettings();
  top.append(fs, gear);
  s.appendChild(top);

  // ② 가운데 — 메인 사도
  const stage = node("section", "lb-stage");
  const bubble = node("div", "lb-bubble");
  const who = node("b");
  const line = node("p", "lb-line");
  bubble.append(who, line);
  const stand = node("button", "lb-stand");
  stand.type = "button";
  const plate = node("div", "lb-plate");
  const plateName = node("b");
  const swap = node("button", "lb-swap", "메인 사도 바꾸기");
  swap.type = "button";
  swap.onclick = () => openPicker();
  plate.append(plateName, node("span", null, "톡 · 쓰다듬기 · 볼 당기기 · 간지럽히기"), swap);
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
  item("⚙", "설정", "해상도 · 그래픽 · 소리 · 글자", () => openSettings(), "lb-set");
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

  // 공개판 고지 — 원작 그림 · 음성을 쓰는 비영리 팬 게임. 권리자가 요청하면 바로 내린다
  const legal = node("p", "lb-legal");
  legal.append(node("b", null, "비공식 팬 게임 · 비영리"), document.createTextNode(
    " — 트릭컬 리바이브의 그림 · 음성 · 설정의 저작권은 EPID Games 에 있습니다. 공식과 무관하며, 권리자의 요청이 있으면 즉시 내립니다."));
  s.appendChild(legal);

  // ── 메인 사도 세우기 ──
  let body = null, lines = null, standGen = 0, lastTouch = Date.now();
  function say(t) {
    line.textContent = t;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
  }
  const has = (n) => !!(body && n && body.has(n));
  const firstOf = (...names) => names.find(has) || null;
  const animsOf = () => (body ? body.animations() : []);
  // 짧은 동작 가운데 이 이름꼴인 것(사도 데스크 anim-pools 의 sdPools 처럼 길이로 거른다)
  const pool = (re, maxDur = 3.5) => animsOf().filter((n) => re.test(n) && body.duration(n) <= maxDur);

  // 반응 하나 — 동작(then 이 있으면 이어서) + 목소리. 끝나도 바로 쉬지 않고, 동작과 대사 가운데 늦게 끝나는 쪽까지
  // 마지막 자세로 붙들고 있다가 쉬는 동작으로 섞여 돌아간다(대사 도중에 대기로 튀지 않게). 새 반응이 오면 앞의 것은 무효
  let actGen = 0;
  async function act(anim, { then, voice, repeat = false, voice2 } = {}) {
    if (!body || !anim) return;
    const my = ++actGen;
    const v = body;
    v.play(anim, false, then, { hold: true });
    const animMs = (v.duration(anim) + (then ? v.duration(then) : 0)) * 1000;
    const t0 = Date.now();
    const audio = voice ? await speak(heroKey, voice, alive, { repeat }) : null;
    // 꿀밤처럼 두 마디 — 첫 동작이 끝날 즈음 둘째 대사
    let audio2 = null;
    if (voice2 && then) {
      await Promise.all([voiceDone(audio), sleep(Math.max(0, v.duration(anim) * 1000 - (Date.now() - t0)))]);
      if (my !== actGen || !alive()) return;
      audio2 = await speak(heroKey, voice2, alive);
    }
    await Promise.all([voiceDone(audio2 || audio), sleep(Math.max(0, animMs - (Date.now() - t0)))]);
    await sleep(150);
    if (my === actGen && alive() && body === v && !g.down) v.toRest();
  }
  const cancelAct = () => { actGen++; };

  // greet — true 면 인사(로비에 들어올 때), 갈래 목록이면 그것(메인 사도로 고를 때는 편성 대사)
  function standUp(key, greet) {
    const gen = ++standGen;
    const greetCats = greet === true ? ["greeting", "callplayer"] : Array.isArray(greet) ? greet : null;
    heroKey = key;
    const h = HERO_DATA[key];
    lines = linesOf(key);
    cancelAct();
    if (body) body.dispose?.();
    body = null;
    stand.replaceChildren();
    stand.className = "lb-stand";
    stand.style.setProperty("--tone", TONES[h.nature] || "#d8cfa8");
    stand.setAttribute("aria-label", `${h.ko} — 누르거나 쓰다듬기`);
    who.textContent = h.ko;
    plateName.textContent = h.ko;
    say(pick(lines.start));
    // 화면에 붙은 뒤에 그린다(크기를 재야 한다). 스파인이 없으면 그림 한 장 → 이름 칸
    const wantSpine = getSettings().spine !== false;
    (wantSpine ? spineView(stand, "standing", key, { anim: "Idle_1", mix: 0.25 }) : Promise.resolve(null)).then((v) => {
      if (gen !== standGen || !alive()) { v?.dispose?.(); return; }
      if (!v) {
        stand.classList.add("still");
        stand.appendChild(art.portrait(key, { ko: h.ko, tint: TONES[h.nature], size: 0, slot: "event", still: true }));
        if (greetCats) speak(key, greetCats, alive);
        return;
      }
      body = v; stand.spine = v; stand.classList.add("live");   // stand.spine — 시험 도구가 동작을 읽는다
      // 들어올 때 — 반기는 동작 + 인사(인사가 끝날 때까지 그 자세로)
      const hi = pick(pool(/^(Happy|Smile)_\d+$/, 3));
      if (hi) act(hi, { voice: greetCats });
      else if (greetCats) speak(key, greetCats, alive);
    });
  }

  // ── 교감 — 누르고 · 끌고 · 떼기(사도 데스크 mascot.js 의 onDown · onMove · onUp) ──
  // g.state: touch(누름, 아직 모름) · pat(머리 쓰다듬기) · cheek(볼 잡기) · tickle(간지럽히기)
  // 볼 · 머리는 게임의 교감 본(Character_Ball_Move · Character_Pat)을 손가락이 끌고 다닌다 — Touch_Idle · Pat_Idle 이
  // 얼굴을 그 본에 묶어 두어서, 끌면 볼이 늘어나고 쓰다듬는 손을 얼굴이 따라온다
  const g = { down: false, state: null, zone: "body", sx: 0, sy: 0, moved: 0, rubLast: 0, rubDir: 0, rubTravel: 0, rubTurns: 0, tickleT0: 0, lastLaugh: 0 };
  let fromPointer = false;
  stand.addEventListener?.("pointerdown", (e) => {
    if (!body || e.button > 0) return;
    lastTouch = Date.now();
    g.down = true; g.state = "touch"; g.sx = e.clientX; g.sy = e.clientY; g.moved = 0;
    g.rubLast = e.clientX; g.rubDir = 0; g.rubTravel = 0; g.rubTurns = 0;
    g.zone = zoneOf(body.skeleton, body.toWorld(e.clientX, e.clientY));
    try { stand.setPointerCapture(e.pointerId); } catch { /* 없어도 된다 */ }
    // 얼굴은 누른 순간 볼이 잡힌다. 머리 · 몸은 떼거나 끌어야 정해진다
    if (g.zone === "cheek" && has("Touch_Idle")) {
      cancelAct(); g.state = "cheek";
      body.play("Touch_Idle", true);
      body.grab(/^Character_Ball_Move$/, 150);
    }
  });
  stand.addEventListener?.("pointermove", (e) => {
    if (!g.down || !body) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (g.state === "cheek" || g.state === "pat") { body.drag(dx, dy); return; }
    if (g.state === "touch" && g.moved > 6 && g.zone === "head" && has("Pat_Idle")) {
      cancelAct(); g.state = "pat";
      body.play("Pat_Idle", true);
      body.grab(/^Character_Pat$/, 110);
      body.drag(dx, dy);
      return;
    }
    if ((g.state === "touch" && g.zone === "body") || g.state === "tickle") {
      const d = e.clientX - g.rubLast; g.rubLast = e.clientX;
      if (Math.abs(d) >= 3) { const sg = Math.sign(d); if (g.rubDir && sg !== g.rubDir) g.rubTurns++; g.rubDir = sg; g.rubTravel += Math.abs(d); }
      const tIdle = firstOf("Tickle_Idle_1", "Tickle_Idle");
      if (g.state === "touch" && g.rubTurns >= 1 && g.rubTravel >= RUB_TRAVEL && tIdle) {
        cancelAct(); g.state = "tickle"; g.tickleT0 = g.lastLaugh = Date.now();
        body.play(tIdle, true);
        speak(heroKey, ["ticklestart", "tickleduring"], alive, { repeat: true });
        say(pick(lines.tickle));
      } else if (g.state === "tickle" && Date.now() - g.lastLaugh > 2500) {
        g.lastLaugh = Date.now();                       // 계속 간지럽히면 계속 웃는다
        speak(heroKey, ["tickleduring", "ticklestart"], alive, { repeat: true });
      }
    }
  });
  const release = () => {
    if (!g.down || !body) return;
    g.down = false; fromPointer = true;
    lastTouch = Date.now();
    body.letGo();
    const st = g.state; g.state = null;
    if (st === "pat") {                               // 쓰다듬기 끝 → touch2 대사
      say(pick(lines.pet));
      act(firstOf("Pat_End") || pick(pool(/^(Happy|Smile)_\d+$/)), { voice: ["pat", "pleasure", "joy"] });
    } else if (st === "tickle") {                     // 간지럽히기 끝. 웃음은 좀 간지럽혔을 때만
      act(firstOf("Tickle_End") || pick(pool(/^(Happy|Laugh)_\d+$/)), { voice: Date.now() - g.tickleT0 > 600 ? ["tickleduring", "ticklestart", "joy"] : null, repeat: true });
    } else if (st === "cheek" && g.moved >= TAP_PX) { // 볼을 끌었을 때만 → touch1 대사("당기지 마!")
      say(pick(lines.ouch));
      act(firstOf("Touch_End") || pick(pool(/^(Angry|Sulky)_\d+$/)), { voice: ["cheek", "anger"] });
    } else if (st === "touch" && g.zone === "head" && firstOf("Smash_End_1", "Smash_End")) {
      // 머리 톡 → 꿀밤. 게임처럼 2단 — Smash_End_1(맞는 순간 「아얏」) → Smash_End_2(머리 감싸기 · 대사)
      say(pick(lines.ouch));
      const a2 = firstOf("Smash_End_2");
      act(firstOf("Smash_End_1", "Smash_End"), { then: a2 || undefined, voice: ["smashHit", "hit", "surprise"], voice2: a2 ? ["smashLine", "anger", "surprise"] : null });
    } else {
      react();                                        // 몸 · 얼굴 톡 → 가벼운 반응
    }
  };
  stand.addEventListener?.("pointerup", release);
  stand.addEventListener?.("pointercancel", release);
  // 가벼운 반응 — 웃음 · 수줍음 · 뽐내기 동작만(놀람 · 아파하는 소리는 빼고), 목소리는 그 동작에 맞춰(js/motion-voice.js)
  function react() {
    say(pick(lines.pet));
    if (!body) { speak(heroKey, ["greeting", "line", "joy", "pleasure", "pat"], alive); return; }
    const soft = pool(/^(Happy|Smile|Laugh|Shy|Proud|Excited|Taunt)_\d+$/, 3);
    const a = pick(soft.length ? soft : pool(/^(Happy|Smile)/, 4));
    if (a) act(a, { voice: voiceCatsFor(a) || ["greeting", "line", "joy", "pleasure"] });
    else speak(heroKey, ["greeting", "line", "joy", "pleasure", "pat"], alive);
  }
  // 누르기(마우스 없이 · 키보드 Enter · 시험) — 끌기가 없으니 가벼운 반응
  stand.onclick = () => {
    if (fromPointer) { fromPointer = false; return; }
    lastTouch = Date.now();
    react();
  };

  // 한동안 안 건드리면 — 잡담 동작 + 그에 맞는 목소리(line · hmm …) + 혼잣말
  const idleTimer = setInterval(() => {
    if (!alive()) { clearInterval(idleTimer); if (!s._lobby) stopVoice(); return; }
    if (g.down || Date.now() - lastTouch < IDLE_AFTER) return;
    lastTouch = Date.now();
    say(pick(lines.idle));
    const acts = pool(/^(Talk|Blank|Thinking|Think|Question|Curious|Taunt|Smile|Happy|Shy|Proud|Serious|Tired)_?\d*$/, 4);
    const a = pick(acts);
    if (a) act(a, { voice: voiceCatsFor(a) || ["line", "hmm", "callplayer"] });
    else speak(heroKey, ["line", "callplayer", "hmm"], alive);
  }, 4000);
  idleTimer?.unref?.();              // 시험(node)에서 이 타이머가 프로세스를 붙잡지 않게

  // ── 창 — 한 번에 하나. × · 바깥 · Esc 로 닫고, 닫을 때 Esc 듣기도 같이 뗀다 ──
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

  // ── 메인 사도 고르기 ──
  function openPicker() {
    const back = node("div", "lb-modal");
    const box = node("div", "lb-box lb-picker");
    const head = node("div", "lb-boxhead");
    head.appendChild(node("b", null, "메인 사도 바꾸기"));
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
      const hasStand = (k) => !m || !m.standing || !!m.standing[k];
      const all = Object.entries(HERO_DATA).filter(([k]) => hasStand(k)).sort((a, b) => a[1].ko.localeCompare(b[1].ko));
      const draw = () => {
        grid.replaceChildren();
        const f = (q.value || "").trim();
        for (const [k, h] of all) {
          if (f && !h.ko.includes(f)) continue;
          const b = node("button", "lb-pick" + (k === heroKey ? " on" : ""));
          b.type = "button";
          b.style.setProperty("--tone", TONES[h.nature] || "#d8cfa8");
          b.append(art.portrait(k, { ko: h.ko, tint: TONES[h.nature], size: 0, slot: "event", still: true }), node("span", null, h.ko));
          b.onclick = () => { setSetting("lobbyHero", k); close(); standUp(k, ["decksetting", "greeting"]); };
          grid.appendChild(b);
        }
        if (!grid.children.length) grid.appendChild(node("p", "lb-none", "그런 이름의 사도가 없습니다."));
      };
      q.oninput = draw;
      draw();
      q.focus && q.focus();
    });
  }

  // ── 설정 — 전투와 같은 창(js/settings-panel.js) ──
  function openSettings() {
    const back = node("div", "lb-modal");
    const box = node("div", "lb-box lb-settings");
    const head = node("div", "lb-boxhead");
    head.appendChild(node("b", null, "설정"));
    const x = node("button", "lb-x", "×");
    x.type = "button";
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(settingsPanel({ onSpine: () => standUp(heroKey, false) }));
    back.appendChild(box);
    openModal(back, x);
  }

  standUp(heroKey, true);
  return s;
}
