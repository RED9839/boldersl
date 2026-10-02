// 그림 어댑터. 게임 코드는 "사도 키"와 "어느 자리인가"만 알고, 무엇을 그릴지는 여기가 정한다.
//
// 자리마다 다른 그림을 쓴다 — 원작이 그렇게 쓰니까.
//   battle  전투    인게임 SD (지금은 heroicons — 252×252 SD 전신)
//   event   이벤트·상점  스탠딩 일러스트 (없으면 SD 로 떨어진다)
//   map     맵 이동  미니미 (아틀라스에서 잘라낸 것)
//
// 그림이 없으면 조용히 한 단계씩 떨어진다 — 자리 그림 → SD → 색과 이름.
// 그래서 하나도 안 꺼내 둔 상태에서도 게임이 돈다.
//
// 인게임 그림은 저장소에 넣지 않는다. 각자 제 기기에서 꺼내 assets/ 에 둔다.

import { loadSpineManifest, hasSpine, spineView } from "./spine-view.js";
import ARTMAP from "./data/artmap.js";
import { ENEMIES, foeLook } from "./data/enemies.js";

const MODES = ["placeholder", "sd", "custom"];

// 자리 → 어느 스파인을 쓰는가. 런타임과 자료가 둘 다 있을 때만 움직이는 그림이 된다.
const SPINE_KIND = { battle: "ingame", foe: "enemy", event: "standing", map: "minimi" };
// 칸 높이 = 게임 세계 몇 단위. 전투 SD 135명의 머리 꼭대기가 가운데값 707 · 상위 10% 917 이다
// (tools 로 잰 값 — 뼈대 원점이 발). 740 이면 보통 사도의 머리가 칸 위끝 가까이 오고, 큰 사도·날개·무기는 칸 밖으로 넘친다.
const SPINE_UNIT = 740;
let useSpine = true;
export function setSpine(on) { useSpine = !!on; }
let mode = "placeholder";

// 자리 → 그림 이름 앞머리. 위에서부터 찾다가 있는 것을 쓴다.
const SLOT = {
  battle: ["", "minimi_"],            // 전투는 SD 가 먼저
  foe: [""],                          // 적은 몬스터 그림 한 장
  event: ["standing_", "", "minimi_"], // 이벤트·상점은 스탠딩이 먼저
  map: ["minimi_", ""],               // 맵은 미니미가 먼저
};

export function setMode(m) { if (MODES.includes(m)) mode = m; }
export function getMode() { return mode; }

// 그 사도의 그림이 실제로 있는지. 없으면 자리표시로 떨어진다.
const manifest = { sd: {}, custom: {} };
export async function loadManifest() {
  await loadSpineManifest();
  for (const m of ["sd", "custom"]) {
    try {
      const r = await fetch(`assets/${m}/manifest.json`, { cache: "no-store" });
      if (r.ok) manifest[m] = await r.json();
    } catch { /* 없으면 없는 대로 — file:// 로 열면 여기로 온다 */ }
  }
}

// 이 자리에서 이 사도에게 쓸 그림. 없으면 null.
function srcFor(key, slot) {
  if (mode === "placeholder") return null;
  const book = manifest[mode] || {};
  for (const prefix of SLOT[slot] || SLOT.battle) {
    const entry = book[prefix + key];
    if (entry) return `assets/${mode}/${entry}`;
  }
  return null;
}

// 어느 자리 그림이 실제로 쓰였는지 — 문서와 검사가 이걸 본다
export function slotOf(key, slot) {
  const kind = SPINE_KIND[slot];
  if (useSpine && kind && hasSpine(kind, spineKey(kind, key))) return kind;
  if (mode === "placeholder") return "placeholder";
  const book = manifest[mode] || {};
  for (const prefix of SLOT[slot] || SLOT.battle) {
    if (book[prefix + key]) return prefix ? prefix.replace(/_$/, "") : "sd";
  }
  return "placeholder";
}

// 적은 다른 적의 그림을 빌려 쓸 수 있다(enemies.js art — 햇팽이 마녀는 햇팽이 스파인)
const spineKey = (kind, key) => (kind === "enemy" && ENEMIES[key] ? foeLook(key).art : key);

// 초상. 그림이 있으면 <img>, 없으면 색과 이름으로 된 자리표시.
// flip — 움직이는 그림을 좌우로 뒤집는다(왼편에 선 아군이 오른쪽의 적을 보게).
// skin — 움직이는 그림에 입힐 스킨(적의 성격 스킨 등).
export function portrait(key, { ko, tint, size = 72, slot = "battle", still = false, flip = false, skin } = {}) {
  const el = document.createElement("div");
  el.className = "art art-" + slot;
  el.style.width = el.style.height = size + "px";

  // 스파인이 있으면 움직이는 그림으로. 없으면 아래로 떨어진다 — 한 줄도 안 바뀐다.
  const kind = SPINE_KIND[slot];
  if (useSpine && !still && kind && hasSpine(kind, spineKey(kind, key))) {
    el.classList.add("art-spine");
    // 싸움터에 서는 큰 칸(전투 SD·적)은 모두 같은 배율로 — 사도 키가 날개·무기 장식에 따라 들쭉날쭉하지 않게.
    // 초상처럼 작은 칸은 얼굴이 보이게 그대로 꽉 맞춘다
    const unit = (kind === "ingame" || kind === "enemy") && size >= 80 ? SPINE_UNIT : 0;
    // 미니미는 한 아틀라스에 모두가 들어 있다 — 스킨 이름이 Mini_<영문 이름>(에르핀 → Mini_Erpin, 대소문자는 안 가린다)
    // 적은 싸움터의 모습 그대로(foeLook) — 적어 둔 스킨(Skin_None · 누루링 Skin_Elf), 없으면 성격 스킨. 아이콘(tools/build-art.js)도 같은 것을 본다
    const foe = kind === "enemy" && ENEMIES[key];
    const own = foe && foeLook(key).skin;
    const wear = own || (kind === "minimi" && !skin && ARTMAP.art && ARTMAP.art[key] ? `Mini_${ARTMAP.art[key]}` : skin);
    // 원작 보스는 화면을 꽉 채우게 그려져 있다(우로스 · M.E.O.W) — 적이 제 배율을 적어 두었으면 그만큼 줄여 싸움터 안에 세운다
    const scale = (foe && foe.scale) || 1;
    spineView(el, kind, spineKey(kind, key), { flip, skin: wear, unit, scale }).then((v) => {
      if (!v) { el.classList.remove("art-spine"); drawStill(el, key, slot, ko, tint); return; }
      el.spine = v;                        // 동작을 바꿀 수 있게(지도에서 걸을 때 등)
    });
    return el;
  }
  drawStill(el, key, slot, ko, tint);
  return el;
}

function drawStill(el, key, slot, ko, tint) {
  const src = srcFor(key, slot);
  if (src) {
    const img = document.createElement("img");
    img.src = src; img.alt = ko || key; img.loading = "lazy";
    img.onerror = () => { img.remove(); fill(el, ko || key, tint); };
    el.appendChild(img);
  } else fill(el, ko || key, tint);
}

function fill(el, ko, tint) {
  el.classList.add("art-ph");
  el.style.setProperty("--tint", tint || "#888");
  el.textContent = String(ko).slice(0, 3);
}
