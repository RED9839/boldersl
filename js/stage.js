// 화면 배율 — 한 벌의 배치를 어느 화면에서나 같은 모양으로 보여 준다.
//
// PC 는 1600×900 을 기준으로 짜고 창에 맞춰 통째로 키운다(FHD 1.2배 · QHD 1.6배).
// 기준보다 넓은 화면(21:9·16:10 창)은 세로에 맞추고 남는 가로를 배치가 채운다 — 그래서 가로는 늘고 세로는 늘 900 이다.
//
// 휴대폰은 가로로만 한다(카제나처럼). 900 줄을 폰 높이(390~412px)에 맞추면 글자가 5px 가 되니
// 휴대폰은 기준 높이를 540 으로 낮추고, 그만큼 글자와 누를 곳을 키운 배치(css/stage.css 의 .phone)를 쓴다.
// 세로로 들면 돌려 달라고만 한다.
//
// 배율은 CSS zoom 으로 건다. 그 안에서 vw·vh 는 배율을 먹어 어긋나므로 쓰지 않는다 —
// 대신 --app-w · --app-h (배율을 뺀 논리 크기)를 쓴다.

const DESK_W = 1600, DESK_H = 900;
const PHONE_H = 540;
const root = document.documentElement;
let zoom = 1;

// 손가락으로 하는 작은 화면인가. 창을 좁힌 PC 는 휴대폰이 아니다.
const isPhone = () => matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) <= 600;

export function getZoom() { return zoom; }

function fit() {
  const W = innerWidth, H = innerHeight;
  const phone = isPhone();
  const portrait = phone && H > W;
  root.classList.toggle("phone", phone);
  root.classList.toggle("portrait", portrait);
  root.classList.toggle("touch", matchMedia("(pointer: coarse)").matches);

  if (portrait) zoom = 1;                                  // 돌려 달라는 안내만 보인다
  else if (phone) zoom = H / PHONE_H;
  else zoom = Math.max(0.5, Math.min(W / DESK_W, H / DESK_H));
  // 소수 끝자리가 길면 테두리가 뭉개진다 — 1/100 로 끊는다
  zoom = Math.floor(zoom * 100) / 100;

  root.style.zoom = String(zoom);
  root.style.setProperty("--z", String(zoom));
  root.style.setProperty("--app-w", `${W / zoom}px`);
  root.style.setProperty("--app-h", `${H / zoom}px`);
}

export function initStage() {
  // 가짜 DOM(tools/smoke.js)에는 창 크기가 없다 — 그때는 배율 없이 돈다
  if (typeof innerWidth !== "number" || typeof matchMedia !== "function") return;
  fit();
  addEventListener("resize", fit);
  // 휴대폰은 돌릴 때 resize 가 늦게 오기도 한다
  addEventListener("orientationchange", () => setTimeout(fit, 150));
}

// 전체화면 — 휴대폰은 주소창이 화면을 먹어서 사실상 이게 있어야 한다. 되면 가로로 잠근다.
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    await root.requestFullscreen({ navigationUI: "hide" });
    if (isPhone() && screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape").catch(() => {});
  } catch { /* 막힌 브라우저(아이폰 사파리)는 그냥 둔다 */ }
}
