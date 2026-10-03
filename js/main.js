// 부팅과 화면 전환. 게임의 흐름은 여기 한 곳에만 있다.
import { lobbyScreen } from "./lobby.js";
import * as ui from "./ui.js";
import * as R from "./run.js";
import * as EV from "./events.js";
import * as art from "./art.js";
import * as M from "./map.js";
import { initStage, toggleFullscreen } from "./stage.js";
import { applySettings } from "./settings.js";
import * as S from "./save.js";
import { DEV } from "./dev.js";
import { HERO_DATA, EQUIP, CARDS } from "./cardbook.js";
import * as RULES from "./rules.js";

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
  if (DEV) return devFight();
  start();
}

// 시험 화면(js/dev.js) — 고른 셋으로 첫 싸움에 곧장
function devFight() {
  const rows = {};
  for (const k of DEV.party) rows[k] = HERO_DATA[k].row;
  run = R.newRun(DEV.party, rows);
  if (DEV.foes && DEV.foes.length) run.eventFight = { enemies: DEV.foes, name: "시험 싸움" };   // 시험 — 고른 적과
  if (DEV.drop) run.devDrop = true;                                  // 시험 — 장비를 반드시 떨군다(run.js rollReward)
  if (DEV.gear) {
    const all = Object.values(EQUIP);
    for (const k of DEV.party) for (const sl of RULES.SLOTS) {
      const e = all.find((x) => x.slot === sl && x.affinity === k) || all.filter((x) => x.slot === sl)[DEV.party.indexOf(k) * 3];
      if (e) { run.bag.push(e.id); R.equip(run, k, e.id); }
    }
  }
  fight();
}

async function hasSd() {
  try { const r = await fetch("assets/sd/manifest.json", { cache: "no-store" }); return r.ok; }
  catch { return false; }
}

// 로비 — 이어할 판이 있으면 「이어하기」 가 맨 위에 선다(js/save.js). 새로 떠나면 그 판은 버린다
function start() {
  ui.hint("");
  const go = (party, rows) => { S.clearSave(); run = R.newRun(party, rows); mapStep(); };
  const saved = S.readSave();
  lobbyScreen(() => ui.partyScreen(go, start), {
    // 로비에서 연 도감은 나가면 로비로 · 이어할 판이 있으면 편성으로 못 간다. 그 판에서 받은 축복(shin)은 도감에 밝혀 둔다
    onDex: () => ui.partyScreen(go, start, { view: "도감", dexOnly: !!saved, shin: saved ? saved.run.shin || null : null }),
    onHelp: () => ui.openHelp("상성"),
    resume: saved ? { run: saved.run, go: () => resume(saved) } : null,
  });
}

// 이어하기 — 적어 둔 화면으로 곧장 간다. 칸의 것은 이미 굴려 판에 있으니 다시 굴리지 않는다
// (이벤트 · 캠프 · 상점은 칸마다 한 번만 굴리고, 싸움은 적어 둔 싸움을 그대로 연다)
function resume(saved) {
  run = saved.run;
  const w = run.where || { k: "map" };
  try {
    if (w.k === "fight") return run.eventFight ? eventFight(saved.combat) : fight(saved.combat);
    if (w.k === "fightDone") return run.eventFight ? eventFightDone(w.result) : fightDone(w.result);
    if (w.k === "event") return eventStop();
    if (w.k === "camp") return camp(w.kind);
    if (w.k === "shop") return shop(w.kind);
    return mapStep();
  } catch (e) {
    // 되살린 판이 화면을 못 세우면(데이터가 바뀌었다 따위) 버리고 로비로
    console.warn("이어하기 실패 — 저장을 버립니다", e);
    S.clearSave();
    run = null;
    start();
  }
}

// 판이 끝났다 — 이긴 판 · 진 판은 이어할 수 없게 저장을 지운다
function end(kind) {
  S.clearSave();
  if (run && run.recordOn) ui.saveRecord(run, kind === "clear" ? "우로스 승리" : "우로스 패배");
  ui.endScreen(kind, run, start);
}

function fight(resumed) {
  // 안내는 화면을 세운 **뒤에** 단다 — screen() 이 들어올 때 지우기 때문이다.
  run.where = { k: "fight" };              // 싸움을 열고 굴린 직후 화면(fight-screen.js)이 판과 싸움을 같이 적는다
  ui.fightScreen(run, fightDone, start, { resume: resumed });
}
function fightDone(result) {
  if (result === "lose") return end("lose");
  reward();
}

// 보상 화면은 없다 — 골드 · 장비 · 은총 · 신탁은 전투 중에 떨어져 오른쪽 목록에 쌓이고, 이기면 이미 챙겼다(fight-screen.js fightScreen)
function reward() {
  ui.hint("");
  run.elite = false;                       // 엘리트 보상은 한 번
  // 보스를 넘었을 때만 층이 바뀐다(run.js 의 advance). 그 밖의 싸움은 지도로 돌아간다
  if (!R.isBoss(run)) return mapStep();
  const next = R.advance(run);             // 층이 바뀐다 — 사도 교체는 없다
  if (run.done === "clear") return end("clear");
  // 층 보스의 몫 — 가진 고유 카드 한 장이 복제됐다(run.js bossCopy) — 화면을 세운 뒤에 알린다
  // 안내 한 줄은 못 보고 지나갔다 — 카드를 가운데 창으로 보여 준다(ui.js bossCopyNote)
  const note = () => { if (next.copied && CARDS[next.copied]) ui.bossCopyNote(run, next.copied); };
  // 마지막 층의 보스를 넘으면 뿌리 깊은 곳 — 상점 없이 캠프 한 번, 떠나면 곧장 마지막 싸움(우로스). 그것을 이겨야 판을 깬다
  if (next.final) { camp("final"); return note(); }
  mapStep();
  note();
}

// 지도 — 칸을 마칠 때마다 여기로 돌아와 다음 칸을 고른다(js/map.js · docs/10-지도.md).
// 한 층: 전투 → 갈림길(전투 · 이벤트 · 상점) 두 줄 → 캠프 → 갈림길 두 줄 → 캠프 + 상점 → 보스
function mapStep() {
  ui.hint("");
  run.where = { k: "map" };
  S.writeSave(run);
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


// 이벤트 — 들어올 때 한 번 굴리고(events.js enterEvent) 곧장 적는다. 고를 때마다 화면(ui.js eventScreen)이 적는다
function eventStop() {
  ui.hint("");
  EV.enterEvent(run);
  run.where = { k: "event" };
  S.writeSave(run);
  ui.eventScreen(run, mapStep, () => eventFight());
}

// 이벤트가 연 전투 — 이기면 적힌 보상, 지면 판이 끝난다. 보통 전투의 카드 보상은 없다
function eventFight(resumed) {
  run.where = { k: "fight" };
  ui.fightScreen(run, eventFightDone, start, { resume: resumed });
}
function eventFightDone(result) {
  if (result === "lose") { run.eventFight = null; return end("lose"); }
  EV.afterEventFight(run, true);
  eventStop();
}

// 캠프 — 수련 선택지는 들어올 때 한 번 굴린다(run.js enterCamp). kind "final" 은 마지막 싸움 앞의 캠프 — 떠나면 지도가 아니라 싸움으로
function camp(kind) {
  ui.hint("");
  R.enterCamp(run, kind);
  run.where = { k: "camp", kind };
  S.writeSave(run);
  ui.campScreen(run, kind === "campshop", kind === "final" ? finalGo : mapStep, () => shop(kind));
}
// 우로스 앞 — 여기까지의 판 기록을 보내겠냐고 묻는다(2026-10 사용자: 다른 사람의 기록을 모아 밸런스를 잰다 — functions/api/record.js).
// 보내기를 고르면 우로스를 이기든 지든 끝난 뒤 결과를 한 번 더 보낸다(end)
function finalGo() {
  ui.recordAsk(run, (yes) => {
    if (yes) { run.recordOn = true; S.writeSave(run); ui.saveRecord(run, "우로스 전"); }
    fight();
  });
}

// 상점 — 휴식(상점) 칸마다 새 진열. 한 층에 여럿 들를 수 있다. 진열은 그 칸에서 한 번만 굴린다
function shop(kind) {
  const at = run.map && run.map.at;
  if (!run.shop || run.shop.floor !== run.floor || run.shop.at !== at) { R.rollShop(run); run.shop.at = at; }
  run.where = { k: "shop", kind };
  S.writeSave(run);
  ui.shopScreen(run, () => camp(kind), { back: "캠프로 돌아갑니다" });
}

boot();
