// 부팅과 화면 전환. 게임의 흐름은 여기 한 곳에만 있다.
import { lobbyScreen } from "./home-design.js";
import * as ui from "./ui.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import { initStage, toggleFullscreen } from "./stage.js";

let run = null;

// 첫 화면을 그리기 **전에** 배율부터 건다 — 그 뒤에 걸면 스파인 캔버스가 옛 크기로 만들어진다
initStage();
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
    fight();
  }, start));
}

function fight() {
  // 안내는 화면을 세운 **뒤에** 단다 — screen() 이 들어올 때 지우기 때문이다.
  ui.fightScreen(run, (result) => {
    if (result === "lose") return ui.endScreen("lose", run, start);
    reward();
  });
}

function reward() {
  ui.hint("");
  R.rollReward(run);
  ui.rewardScreen(run, (cardId, flashPick) => {
    R.takeReward(run, cardId);
    R.takeFlash(run, flashPick);
    const { swap } = R.advance(run);
    if (run.done === "clear") return ui.endScreen("clear", run, start);
    if (swap) return ui.swapScreen(run, fight);
    next();
  });
}

// 다음 칸 — 한 층: 전투 → 이벤트 → 전투 → (이벤트) → 캠프 → 전투 → 캠프 + 상점 → 보스
// 이벤트 칸은 층마다 1~2개(docs/08-이벤트.md). 들르는 칸은 전투 번호(node)를 바꾸지 않는다.
function next() {
  if (EV.dueEvent(run)) return eventStop();
  const stop = R.nextStop(run);            // 층 가운데 캠프 · 보스 앞 캠프 + 상점
  if (stop) return camp(stop);
  fight();
}

function eventStop() {
  ui.hint("");
  EV.enterEvent(run);
  ui.eventScreen(run, next, () => {
    // 이벤트가 연 전투 — 이기면 적힌 보상, 지면 판이 끝난다. 보통 전투의 카드 보상은 없다
    ui.fightScreen(run, (result) => {
      if (result === "lose") { run.eventFight = null; return ui.endScreen("lose", run, start); }
      EV.afterEventFight(run, true);
      eventStop();
    });
  });
}

function camp(kind) {
  ui.hint("");
  R.enterCamp(run, kind);
  ui.campScreen(run, kind === "campshop", fight, () => {
    if (!run.shop || run.shop.floor !== run.floor) R.rollShop(run);
    ui.shopScreen(run, () => camp(kind), { back: "캠프로 돌아간다" });
  });
}

boot();
