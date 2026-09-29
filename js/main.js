// 부팅과 화면 전환. 게임의 흐름은 여기 한 곳에만 있다.
import { lobbyScreen } from "./home-design.js";
import * as ui from "./ui.js";
import * as R from "./run.js";
import * as art from "./art.js";

let run = null;

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
    fight();
  });
}

boot();
