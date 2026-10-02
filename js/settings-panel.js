// 설정 창의 내용 — 로비(⚙)와 전투 메뉴(☰ → 설정)가 같이 쓴다. 누르거나 밀면 바로 걸린다.
//   화면   해상도 · 그래픽 품질 · 전체화면 · 사도 움직임 · 움직임 줄이기 · 글자 크게
//   소리   전체 음량 · 목소리 음량 · 효과음 음량
// onSpine — 사도 움직임을 바꿨을 때 그 화면이 그림을 다시 세우게(전투 draw · 로비 메인 사도)
import { getSettings, setSetting, RES_CHOICES } from "./settings.js";
import { toggleFullscreen } from "./stage.js";

const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const RES_KO = (r) => (r === "auto" ? "자동" : r.replace("x", "×"));
const QUALITY_KO = { high: "높음", mid: "보통", low: "낮음" };

export function settingsPanel({ onSpine } = {}) {
  const wrap = node("div", "setpanel");
  const canFs = typeof document === "object" && document.documentElement && document.documentElement.requestFullscreen;

  function build() {
    wrap.replaceChildren();
    const set = getSettings();
    const section = (title) => { const sec = node("section", "sp-sec"); sec.appendChild(node("h4", null, title)); wrap.appendChild(sec); return sec; };
    const row = (sec, label, why) => {
      const r = node("div", "sp-row");
      const t = node("span", "sp-label");
      t.append(node("b", null, label));
      if (why) t.append(node("small", null, why));
      r.appendChild(t);
      sec.appendChild(r);
      return r;
    };
    // 여럿 가운데 하나 — 알약 단추 줄
    const choice = (sec, label, why, key, opts, ko) => {
      const r = row(sec, label, why);
      const g = node("div", "sp-seg");
      for (const v of opts) {
        const b = node("button", "sp-opt" + (set[key] === v ? " on" : ""), ko(v));
        b.type = "button";
        b.onclick = () => { setSetting(key, v); build(); };
        g.appendChild(b);
      }
      r.appendChild(g);
    };
    const toggle = (sec, label, why, on, fn) => {
      const r = row(sec, label, why);
      const b = node("button", "sp-tog" + (on ? " on" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.append(node("i"), node("span", null, on ? "켬" : "끔"));
      b.onclick = async () => { await fn(); build(); };
      r.appendChild(b);
    };
    // 음량 — 밀면 바로. 숫자도 같이
    const slider = (sec, label, why, key) => {
      const r = row(sec, label, why);
      const box = node("div", "sp-vol");
      const inp = node("input", "sp-range");
      inp.type = "range"; inp.min = "0"; inp.max = "100"; inp.step = "5";
      inp.value = String(set[key]);
      inp.setAttribute("aria-label", label);
      const num = node("b", "sp-num", String(set[key]));
      const paint = (v) => { num.textContent = String(v); inp.style && inp.style.setProperty && inp.style.setProperty("--fill", v + "%"); };
      paint(set[key]);
      inp.oninput = () => { const v = Math.round(Number(inp.value) || 0); setSetting(key, v); paint(v); };
      box.append(inp, num);
      r.appendChild(box);
    };

    const screen = section("화면");
    choice(screen, "해상도", "그 크기를 기준으로 화면을 짭니다 · 창보다 크면 창에 맞춤", "res", RES_CHOICES, RES_KO);
    choice(screen, "그래픽 품질", "사도 그림을 그리는 픽셀 수 — 낮추면 느린 기계에서 가볍습니다", "quality", ["high", "mid", "low"], (v) => QUALITY_KO[v]);
    if (canFs) toggle(screen, "전체화면", "주소창 · 작업 표시줄을 숨깁니다", !!document.fullscreenElement, () => toggleFullscreen());
    toggle(screen, "사도 움직임", "끄면 그림 한 장 — 느린 기계에서 가볍습니다", set.spine !== false, () => { setSetting("spine", !(set.spine !== false)); onSpine && onSpine(); });
    toggle(screen, "움직임 줄이기", "반짝임 · 튀는 효과를 끕니다", !!set.calm, () => setSetting("calm", !set.calm));
    toggle(screen, "글자 크게", "이름 · 카드 글 · 체력 숫자를 한 치수 더", !!set.big, () => setSetting("big", !set.big));

    const sound = section("소리");
    slider(sound, "전체 음량", null, "volMaster");
    slider(sound, "목소리 음량", "사도의 목소리 — 0 이면 말하지 않습니다", "volVoice");
    slider(sound, "효과음 음량", "타격 · 카드 · 단추 소리 — 0 이면 울리지 않습니다", "volSfx");
  }
  build();
  return wrap;
}
