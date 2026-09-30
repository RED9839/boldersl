// 부팅과 화면 전환. 게임의 흐름은 여기 한 곳에만 있다.
import { lobbyScreen } from "./home-design.js";
import * as ui from "./ui.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import * as M from "./map.js";
import { initStage, toggleFullscreen } from "./stage.js";
import { applySettings } from "./settings.js";

let run = null;

// 첫 화면을 그리기 **전에** 배율부터 건다 — 그 뒤에 걸면 스파인 캔버스가 옛 크기로 만들어진다
initStage();
applySettings();                     // 사도 움직임 · 움직임 줄이기 · 글자 크게 — 전투 메뉴에서 바꾼 것
const fsBtn = typeof document.getElementById === "function" ? document.getElementById("fullscreen") : null;
if (fsBtn) {
  if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;
  fsBtn.onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange", () => fsBtn.classList.toggle("on", !!document.fullscreenElement));
}

async function boot() {
  await art.loadManifest();          // 추출한 그림이 있으면 쓴다. 없으면 자리표시.
  if (art.getMode() === "placeholder") {
    const has = await hasSd();
    if (has) art.setMode("sd");
  }
  start();
}

async function hasSd() {
  try { const r = await fetch("assets/sd/manifest.json", { cache: "no-store" }); return r.ok; }
  catch { return false; }
}

function start() {
  ui.hint("");
  lobbyScreen(() => ui.partyScreen((party, rows) => {
    run = R.newRun(party, rows);
    mapStep();
  }, start));
}

function fight() {
  // 안내는 화면을 세운 **뒤에** 단다 — screen() 이 들어올 때 지우기 때문이다.
  ui.fightScreen(run, (result) => {
    if (result === "lose") return ui.endScreen("lose", run, start);
    reward();
  }, start);
}

// 보상 화면은 없다 — 골드 · 장비 · 은총 · 신탁은 전투 중에 떨어져 오른쪽 목록에 쌓이고, 이기면 이미 챙겼다(ui.js fightScreen)
function reward() {
  ui.hint("");
  run.elite = false;                       // 엘리트 보상은 한 번
  // 보스를 넘었을 때만 층이 바뀐다(run.js 의 advance). 그 밖의 싸움은 지도로 돌아간다
  if (!R.isBoss(run)) return mapStep();
  const { swap } = R.advance(run);
  if (run.done === "clear") return ui.endScreen("clear", run, start);
  if (swap) return ui.swapScreen(run, mapStep);
  mapStep();
}

// 지도 — 칸을 마칠 때마다 여기로 돌아와 다음 칸을 고른다(js/map.js · docs/10-지도.md).
// 한 층: 전투 → 갈림길(전투 · 이벤트 · 상점) 두 줄 → 캠프 → 갈림길 두 줄 → 캠프 + 상점 → 보스
function mapStep() {
  ui.hint("");
  ui.mapScreen(run, enter, start);
}
function enter(node) {
  if (node.type === "fight" || node.type === "elite" || node.type === "boss") return fight();   // 엘리트는 run.elite(map.js)
  if (node.type === "event") {
    // 이벤트가 바닥났으면 조용히 지나간다 — 한 판에 같은 이벤트는 한 번뿐이다
    if (!EV.eventLeft(run)) { mapStep(); return ui.hint("조용한 길이었습니다 — 아무 일도 없었습니다"); }
    return eventStop();
  }
  if (node.type === "camp" || node.type === "campshop") return camp(node.type);
  mapStep();
}


function eventStop() {
  ui.hint("");
  EV.enterEvent(run);
  ui.eventScreen(run, mapStep, () => {
    // 이벤트가 연 전투 — 이기면 적힌 보상, 지면 판이 끝난다. 보통 전투의 카드 보상은 없다
    ui.fightScreen(run, (result) => {
      if (result === "lose") { run.eventFight = null; return ui.endScreen("lose", run, start); }
      EV.afterEventFight(run, true);
      eventStop();
    }, () => { run.eventFight = null; start(); });
  });
}

function camp(kind) {
  ui.hint("");
  R.enterCamp(run, kind);
  ui.campScreen(run, kind === "campshop", mapStep, () => {
    // 휴식(상점) 칸마다 새 진열 — 한 층에 여럿 들를 수 있다
    const at = run.map && run.map.at;
    if (!run.shop || run.shop.floor !== run.floor || run.shop.at !== at) { R.rollShop(run); run.shop.at = at; }
    ui.shopScreen(run, () => camp(kind), { back: "캠프로 돌아갑니다" });
  });
}

boot();
