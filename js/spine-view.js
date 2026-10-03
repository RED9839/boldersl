// 스파인 그리기 — 전투 SD·스탠딩·미니미는 부품 단위라 런타임이 있어야 움직인다.
// 사도 데스크와 같은 방식이다(spine-webgl 4.1, .skel + .atlas 직접 읽기).
//
// **런타임 라이선스**: Spine Runtimes 는 쓰는 사람이 각자 Spine Editor 라이선스를 가져야 한다.
// 그래서 이 파일은 런타임이 없으면 조용히 물러난다 — 그때는 art.js 의 그림 한 장으로 떨어진다.
// 자세한 것은 docs/04-스파인.md.
//
// 쓰는 쪽:
//   const v = await spineView(el, "ingame", "erpin");   // 없으면 null
//   v.play("Attack1_1"); v.dispose();   // 한 번 하고 Idle 로 돌아온다
//
// 게임 .skel 은 4.1 이다. 런타임도 4.1 이어야 한다 — 4.2 부터 바이너리 형식이 바뀌어 못 읽는다.

import { rate as battleRate } from "./speed.js";

const ROOT = "assets/spine";
let manifest = null;
let failed = false;

const spine = () => globalThis.spine || null;

export function hasRuntime() { return !!spine(); }

// 그래픽 품질 — 캔버스를 화면 픽셀의 몇 배로 그리나(1 · 0.75 · 0.5). 낮추면 흐려지는 대신 가볍다(js/settings.js)
let renderScale = 1;
export function setRenderScale(f) { renderScale = f > 0 && f <= 1 ? f : 1; }

export async function loadSpineManifest() {
  if (manifest || failed) return manifest;
  try {
    const r = await fetch(`${ROOT}/manifest.json`, { cache: "no-store" });
    if (!r.ok) throw new Error("no manifest");
    manifest = await r.json();
  } catch { failed = true; }
  return manifest;
}

// 이 사도의 이 자리 스파인이 실제로 있는지
export function hasSpine(kind, key) {
  if (!manifest || !spine()) return false;
  if (kind === "minimi") return !!manifest.minimi;
  return !!(manifest[kind] && manifest[kind][key]);
}

async function loadAtlas(sp, gl, dir, atlasFile, pages) {
  const text = await (await fetch(`${dir}/${atlasFile}`)).text();
  const atlas = new sp.TextureAtlas(text);
  const byName = {};
  await Promise.all(pages.map((p) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { byName[p] = new sp.GLTexture(gl, img); res(); };
    img.onerror = rej;
    img.src = `${dir}/${p}`;
  })));
  for (const page of atlas.pages) page.setTexture(byName[page.name] || Object.values(byName)[0]);
  return atlas;
}

// 한 번 만든 그림을 다시 쓴다.
// 전투 화면은 카드를 낼 때마다 통째로 다시 그려서, 그때마다 새로 만들면 WebGL 컨텍스트가 한 번에 열세 개씩 늘었다
// (카드 열다섯 장에 이백 개 — 브라우저는 열여섯 개쯤에서 오래된 것을 버린다). 쉬는 동작도 매번 처음부터 다시 시작했다.
// 그래서 화면에서 떨어진 캔버스를 모아 두었다가, 같은 사도·같은 크기를 다시 그릴 때 새 자리로 옮겨 붙인다.
const pool = [];
// 브라우저는 WebGL 컨텍스트를 열여섯 개쯤까지만 들고 있다. 화면에 선 것(전투 6~8) + 쉬는 것이 그 안에 들어와야
// 오래된 것이 버려지지 않는다 — 14 로 두었을 때 창을 오가면 사도가 하얗게 또는 그림 한 장으로 바뀌었다.
const POOL_MAX = 6;

function evict() {
  while (pool.length > POOL_MAX) {
    const i = pool.findIndex((v) => !v.canvas.isConnected);
    if (i < 0) return;                       // 모두 화면에 있다 — 버릴 것이 없다
    pool[i].api.dispose();
  }
}

// el 안에 캔버스를 만들고 그 사도를 그린다. 런타임이나 자료가 없으면 null.
// flip — 좌우를 뒤집는다. 게임 SD 는 왼쪽을 보고 서 있어서, 왼편에 선 아군은 뒤집어야 적을 본다.
// skin — 입힐 스킨. 적은 성격마다 한 벌씩(Skin_Naive·Skin_Mad…) 들고 있고 기본 스킨이 비어 있기도 하다.
// unit — 칸 높이가 게임 세계로 몇 단위인가. 주면 **모두 같은 배율**로 그린다(원작 전투처럼).
//   안 주면 그림 전체(날개·무기·이펙트까지)를 칸에 꽉 맞추는데, 그러면 장식이 큰 사도일수록 몸이 작아졌다.
//   같은 배율로 그리면 날개·지팡이는 칸 밖으로 나간다 — 그래서 캔버스를 칸보다 크게(가로 3배·세로 2배 이상) 잡고
//   발(뼈대 원점)을 칸 바닥 가운데에 세운다. 칸 크기와 자리 잡기는 그대로라 배치가 흔들리지 않는다.
//   얼마나 크게 잡을지는 그 사도의 **모든 동작이 닿는 곳**을 처음 한 번 재서 정한다(reachOf) — 3배 · 2배로 못 박았더니
//   실비아의 양산 · 은분수(Skill1_1 은 발에서 칸 높이의 2배 옆까지)가 옆 사도 칸에서 칼로 자른 듯 잘렸다.
export const OVER_W = 3, OVER_H = 2;
// 너무 큰 캔버스는 막는다 — 칸 높이를 1 로 잰 몫. 옆으로는 발에서 양쪽 3, 위로 3, 발 아래로 0.6
const REACH_CAP = { side: 3, up: 3, down: 0.6 };

// 보이는 것만의 테두리 — 스켈레톤의 getBounds 는 투명하게 꺼 둔 부품(먼지 · 등장 이펙트)까지 세서
// 커버러스의 쉬는 자세가 왼쪽으로 칸 높이 5배를 차지했다. 색 알파가 거의 0 인 칸은 뺀다. 없으면 null
const VBUF = new Float32Array(4096);
function visibleBox(sp, skeleton) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const slot of skeleton.drawOrder) {
    const at = slot.getAttachment();
    if (!at || slot.color.a * (at.color ? at.color.a : 1) < 0.05) continue;
    let n = 0;
    if (at instanceof sp.RegionAttachment) { at.computeWorldVertices(slot, VBUF, 0, 2); n = 8; }
    else if (at instanceof sp.MeshAttachment && at.worldVerticesLength <= VBUF.length) { n = at.worldVerticesLength; at.computeWorldVertices(slot, 0, n, VBUF, 0, 2); }
    for (let i = 0; i < n; i += 2) {
      x0 = Math.min(x0, VBUF[i]); x1 = Math.max(x1, VBUF[i]);
      y0 = Math.min(y0, VBUF[i + 1]); y1 = Math.max(y1, VBUF[i + 1]);
    }
  }
  return isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

// 그 뼈대의 모든 동작을 훑어(동작마다 13장면) 발(원점)에서 가장 멀리 닿는 곳을 잰다 — 칸 높이 1 기준.
// 좌우는 큰 쪽으로 같게 잡는다(뒤집어 그려도 같고, 발이 캔버스 가운데에 남는다).
// 등장(Spawn)은 넣지 않는다 — 보스는 화면 밖 멀리서 걸어 들어와서(커버러스 칸 높이 5배) 그것까지 담으면 캔버스가 터무니없이 커진다.
// 대신 몸이 그 테두리 안에 처음 들어오는 때(spawnFrom, 동작 길이의 몫)를 재어 등장을 거기서부터 튼다 — 잘린 채 날아 들어오지 않게
function reachOf(sp, skeleton, unit, scale) {
  const out = { side: 0, up: 0, down: 0 }, spawn = [];
  try {
    const st = new sp.AnimationState(new sp.AnimationStateData(skeleton.data));
    const [sx, sy, x, y] = [skeleton.scaleX, skeleton.scaleY, skeleton.x, skeleton.y];
    skeleton.scaleX = skeleton.scaleY = 1; skeleton.x = skeleton.y = 0;
    for (const a of skeleton.data.animations) {
      const isSpawn = /^spawn/i.test(a.name);
      const te = st.setAnimation(0, a.name, false);
      for (let i = 0; i <= 12; i++) {
        te.trackTime = (a.duration * i) / 12;
        skeleton.setToSetupPose(); st.apply(skeleton); skeleton.updateWorldTransform();
        const bx = visibleBox(sp, skeleton);
        if (!bx) continue;
        if (isSpawn) { if (/^spawn$/i.test(a.name)) spawn.push([i / 12, bx]); continue; }
        out.side = Math.max(out.side, -bx.x0, bx.x1);
        out.up = Math.max(out.up, bx.y1);
        out.down = Math.max(out.down, -bx.y0);
      }
    }
    skeleton.setToSetupPose();
    [skeleton.scaleX, skeleton.scaleY, skeleton.x, skeleton.y] = [sx, sy, x, y];
  } catch { return null; }
  const k = scale / unit;
  const r = {
    side: Math.min(REACH_CAP.side, out.side * k + 0.06),
    up: Math.min(REACH_CAP.up, out.up * k + 0.1),            // 발은 칸 바닥에서 5% 떠 있다(아래 loop) — 그 몫과 여유
    down: Math.min(REACH_CAP.down, Math.max(0, out.down * k - 0.05)),
    spawnFrom: 0,
  };
  // 등장 — 몸이 캔버스 안에 들어온 첫 장면부터(처음부터 안이면 0)
  const inside = (bx) => -bx.x0 * k <= r.side + 0.02 && bx.x1 * k <= r.side + 0.02 && bx.y1 * k <= r.up + 0.02 && -bx.y0 * k <= r.down + 0.1;
  const first = spawn.findIndex(([, bx]) => inside(bx));
  if (first > 0) r.spawnFrom = Math.min(0.9, spawn[first][0]);
  else if (first < 0 && spawn.length) r.spawnFrom = 0.9;
  return r;
}
// mix — 동작이 바뀔 때 섞는 시간(초). 0 이면 바로 바뀐다(전투). 로비의 메인 사도는 부드럽게 섞는다
// bust — 머리부터 몸의 이 몫(0~1)만 칸 높이에 맞춘다. 아래는 칸 밖으로 잘린다(고학년 컷인의 상반신)
// body — 테두리 대신 몸으로 세운다: 머리 본을 칸 위에서 이 몫(0~1)에, 발(원점)을 칸 바닥에, 머리를 가로 가운데에.
//   테두리는 떠 있는 왕관 · 큰 무기 · 날개까지 세서 사도마다 크기와 가운데가 들쭉날쭉했다(2026-10 사용자: 편성 칸). 머리 본이 없으면 bust 로
export async function spineView(el, kind, key, { scale = 1, anim, flip = false, skin, unit = 0, mix = 0, bust = 0, body = 0 } = {}) {
  const sp = spine();
  if (!sp) return null;
  await loadSpineManifest();
  if (!hasSpine(kind, key)) return null;

  const w = el.clientWidth || 200, h = el.clientHeight || 200;
  // 크기는 열쇠에 넣지 않는다 — 캔버스 크기는 그리는 고리가 매 프레임 화면에 맞춰 다시 잡는다.
  // 넣어 두었더니 싸움터 높이에 따라 크기가 바뀌는 전투 화면에서 다시 쓰질 못하고 카드 한 장마다 컨텍스트가 늘어 하얗게 버려졌다.
  const id = `${kind}|${key}|${scale}|${anim || ""}|${flip ? "f" : ""}|${skin || ""}|${unit}|${mix}|${bust || ""}|${body || ""}`;
  const spare = pool.find((v) => v.id === id && !v.canvas.isConnected);
  if (spare) {
    // 새 칸에도 「넘쳐도 된다」 표시를 단다 — 빠뜨렸더니 옮겨 붙인 캔버스가 칸(둥근 네모)에 잘려 보였다
    if (unit) el.classList.add("art-over");
    el.appendChild(spare.canvas); if (spare.place) spare.place(el);
    // 다시 쓰는 그림은 쉬는 동작부터 — 전투에서 달려 나가던(승리 뒤 walkOut) 자세 그대로 캠프에 서 있었다(2026-10 사용자: 우로스가 캠프에서 달리기)
    spare.api.toRest();
    spare.wake(); return spare.api;
  }

  const set = kind === "minimi" ? manifest.minimi : manifest[kind][key];
  const dir = kind === "minimi" ? `${ROOT}/minimi` : `${ROOT}/${kind}/${key}`;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = canvas.style.height = "100%";
  // 칸에서 넘치는 몫 — w · h 는 칸 너비 · 높이의 배수, down 은 발 아래로 칸 높이의 몫(reachOf 가 잰 뒤 place 가 정한다)
  const over = { w: OVER_W, h: OVER_H, down: 0, side: 0 };
  // 칸보다 크게, 발을 칸 바닥 가운데에 맞춰 — 넘친 부분이 옆 사도의 클릭을 가로채지 않게 한다.
  // 가로는 칸 너비의 배수라 칸의 가로세로 비를 보고 정한다(옆으로 닿는 거리는 칸 높이로 잰다)
  const place = (host) => {
    if (!unit) return;
    const asp = (host.clientHeight || h) / (host.clientWidth || w);
    over.w = Math.max(OVER_W, 2 * over.side * asp);
    Object.assign(canvas.style, { position: "absolute", left: `${-(over.w - 1) * 50}%`, bottom: `${-over.down * 100}%`,
      width: `${over.w * 100}%`, height: `${over.h * 100}%`, pointerEvents: "none" });
  };
  if (unit) { place(el); el.classList.add("art-over"); }
  el.appendChild(canvas);

  let ctx, renderer;
  const drop = () => {
    const lose = ctx && ctx.gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    canvas.remove();
  };
  try {
    ctx = new sp.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    renderer = new sp.SceneRenderer(canvas, ctx, true);
  } catch { drop(); return null; }

  let skeleton, state;
  try {
    const atlas = await loadAtlas(sp, ctx, dir, set.atlas, set.pages);
    const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas))
      .readSkeletonData(new Uint8Array(await (await fetch(`${dir}/${set.skel}`)).arrayBuffer()));
    // 미니미는 한 아틀라스에 모두가 들어 있다 — 그 사도의 스킨을 골라 입힌다
    skeleton = new sp.Skeleton(data);
    const byName = (n) => n && (data.findSkin(n) || data.skins.find((s) => s.name.toLowerCase() === n.toLowerCase()));
    // 먹보곰처럼 기본 스킨이 아예 없는 것도 있다 — 그때는 첫 스킨이라도 입혀야 보인다
    let wear = byName(skin || (kind === "minimi" ? key : null));
    // 스킨을 정하지 않았으면 원작처럼 「Normal」 을 입힌다(기본 스킨은 뒤에 깔린다).
    // 부품이 Normal 에만 든 사도가 16명이다 — 기본 스킨만 입히면 다야는 왼쪽 뿔이, 타이다 · 알레트는 몸이 통째로 빠졌다.
    // Normal 과 자리가 겹치지 않는 부품 스킨(코미의 Weapon)은 같이 입히고, 같은 자리를 바꾸는 변형(다야의 Horn_Cut)은 뺀다
    if (!wear) {
      const extras = data.skins.filter((s) => s !== data.defaultSkin);
      const normal = extras.find((s) => s.name.toLowerCase() === "normal");
      const base = normal || (data.defaultSkin ? null : extras[0]);
      if (base) {
        wear = new sp.Skin("wear");
        wear.addSkin(base);
        const used = new Set(base.getAttachments().map((e) => e.slotIndex));
        // 스탠딩은 Normal 만 — 덧스킨이 거의 다 이벤트 소품 · 변신이다(에르핀 Event_1 종이봉투 · 에르핀_왕도 Shackles ·
        // 시저 Villain · 아일라 Transform 등 33명). 원작 로비도 Normal 로 선다. 덧스킨이 부품인 것은 전투 SD(코미 Weapon)뿐
        for (const x of kind === "standing" ? [] : extras) {
          if (x === base || x.getAttachments().some((e) => used.has(e.slotIndex))) continue;
          wear.addSkin(x);
          for (const e of x.getAttachments()) used.add(e.slotIndex);
        }
      }
    }
    if (wear) { skeleton.setSkin(wear); skeleton.setSlotsToSetupPose(); }
    const stateData = new sp.AnimationStateData(data);
    stateData.defaultMix = mix;
    state = new sp.AnimationState(stateData);
  } catch { drop(); return null; }

  // 동작 이름은 스켈레톤마다 대소문자가 섞여 있다 — 이름으로 찾되 대소문자는 안 가린다
  const findAnim = (name) => name && (skeleton.data.findAnimation(name)
    || skeleton.data.animations.find((a) => a.name.toLowerCase() === name.toLowerCase()));
  // 쉬는 동작. 전투 SD 는 135명 모두 Idle 이 있다. 없으면 첫 동작으로.
  // 스탠딩은 「Idle」이 없고 Idle_1 · Idle_2 … 뿐이다 — 없으면 Idle_1, 그다음 Idle_ 로 시작하는 첫 것. 첫 동작(Angry_1 따위)으로 떨어지면 화난 채 서 있다
  const rest = findAnim(anim) || findAnim("Idle") || findAnim("Idle_1")
    || skeleton.data.animations.find((a) => /^Idle_\d+$/i.test(a.name)) || skeleton.data.animations[0];
  if (rest) state.setAnimation(0, rest.name, true);

  // 크기와 자리는 쉬는 자세로 한 번만 잰다. 매 프레임 재면 휘두르는 동작마다 몸이 커졌다 작아졌다 한다.
  state.apply(skeleton); skeleton.updateWorldTransform();
  const off = new sp.Vector2(), size = new sp.Vector2();
  skeleton.getBounds(off, size, []);
  // 몸으로 세우기 — 쉬는 자세의 머리 본 자리(발이 원점). 위로 서 있지 않으면(본이 없거나 아래) 쓰지 않는다
  const headBone = body ? skeleton.bones.find((b) => /(^|_)Head$/i.test(b.data.name)) : null;
  const bodyAt = headBone && headBone.worldY > 1 ? { x: headBone.worldX, y: headBone.worldY } : null;
  // 같은 배율로 서는 칸 — 동작이 닿는 곳까지 캔버스를 넓힌다(옆 칸 · 위 · 발 아래)
  let spawnFrom = 0;
  if (unit) {
    const r = reachOf(sp, skeleton, unit, scale);
    if (r) {
      spawnFrom = r.spawnFrom;
      over.side = r.side;
      over.h = Math.max(OVER_H, r.up + r.down);
      over.down = r.down;
      place(el);
    }
    state.apply(skeleton); skeleton.updateWorldTransform();
  }

  let raf = 0, last = performance.now(), dead = false;
  let frozen = 0;                 // 이때(performance.now)까지 시간을 멈춘다 — 맞는 순간의 멈칫(히트스톱)
  // 교감 본 — held 동안은 끌린 만큼, 놓으면 짧게 줄어 제자리로. max = 스켈레톤 단위, 고무줄처럼 부드럽게 제한
  const grab = { bone: null, max: 120, dx: 0, dy: 0, held: false };
  function grabApply(dt) {
    const b = grab.bone;
    if (!grab.held) {
      const f = Math.exp(-dt / 0.06); grab.dx *= f; grab.dy *= f;
      if (Math.abs(grab.dx) + Math.abs(grab.dy) < 0.5) { grab.bone = null; return; }
    }
    const pa = b.parent; if (!pa) return;
    const det = pa.a * pa.d - pa.b * pa.c; if (!det) return;
    let lx = (grab.dx * pa.d - grab.dy * pa.b) / det, ly = (grab.dy * pa.a - grab.dx * pa.c) / det;
    const R = grab.max, len = Math.hypot(lx, ly);
    if (len > 1e-3) { const k = R * (1 - Math.exp(-len / R)) / len; lx *= k; ly *= k; }
    b.x += lx; b.y += ly;
  }
  const loop = (now) => {
    raf = 0;
    // 화면에서 떨어지면 멈춘다. 다시 붙을 때 wake() 가 이어 돌린다.
    if (dead || !canvas.isConnected) return;
    // 전투 배속(js/speed.js) — 전투 화면이 떠 있는 동안만 2배. 로비 · 편성의 그림은 늘 1배다
    const dt = now < frozen ? 0 : Math.min(0.1, (now - last) / 1000) * battleRate(); last = now;
    if (grab.bone) { grab.bone.x = grab.bone.data.x; grab.bone.y = grab.bone.data.y; }
    state.update(dt); state.apply(skeleton);
    if (grab.bone) grabApply(dt);
    // 캔버스는 화면에 실제로 찍히는 픽셀만큼 잡는다. renderer.resize() 는 CSS 크기 × devicePixelRatio 로 잡아서
    // 화면 배율(js/stage.js 의 zoom — QHD 1.6배)을 모르고, 그러면 사도가 뿌옇게 늘어난다.
    // 크기는 배치 크기(clientWidth — 배율 zoom 은 안 먹은 값) × 배율로 잰다. getBoundingClientRect 는 transform 까지 먹어서
    // 컷인처럼 커지며 들어오는 그림(scale 1 → 1.08)은 캔버스를 매 프레임 새로 잡았다(그때마다 버퍼를 비우고 다시 만든다)
    const z = parseFloat(document.documentElement.style.zoom) || 1, dpr = (window.devicePixelRatio || 1) * renderScale * z;
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.gl.viewport(0, 0, cw, ch);
    renderer.camera.setViewport(cw, ch);
    renderer.camera.update();
    ctx.gl.clearColor(0, 0, 0, 0); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    renderer.begin();
    // 캔버스 가운데 아래에 세운다 — 미니미도 스탠딩도 발이 바닥에 닿아야 자연스럽다
    if (unit) {
      // 모두 같은 배율 — 칸 높이 = unit 단위. 발(원점)은 칸 바닥 가운데, 발밑 그림자 몫만 조금 띄운다
      const boxH = canvas.height / over.h;
      const fit = (boxH / unit) * scale;
      skeleton.scaleY = fit;
      skeleton.scaleX = flip ? -fit : fit;
      skeleton.x = 0;
      skeleton.y = -canvas.height / 2 + boxH * (over.down + 0.05);
    } else if (bodyAt) {
      // 발은 칸 바닥 조금 위, 머리 본은 칸 위에서 body 몫 — 가로는 머리가 가운데
      const H = canvas.height, foot = 0.03;
      // 모자 · 뿔 · 왕관이 높으면 칸 위로 잘렸다 — 쉬는 자세의 꼭대기(off.y + size.y)가 칸 안에 들게 줄인다(2026-10 사용자: 「위로 너무 크면 짤린다」).
      // 너무 작아지지 않게 0.72 배까지만(떠 있는 큰 무기 따위는 조금 잘려도 몸이 작아지는 것보다 낫다)
      const want = (H * (1 - body - foot) / bodyAt.y) * scale;
      const top = off.y + size.y, room = H * (1 - foot - 0.025);
      const fit = top > 0 ? Math.max(want * 0.72, Math.min(want, room / top)) : want;
      (globalThis.__topFit = globalThis.__topFit || {})[key] = +(fit / want).toFixed(3);   // 시험 도구가 얼마나 줄였는지 본다
      skeleton.scaleY = fit;
      skeleton.scaleX = flip ? -fit : fit;
      skeleton.x = (flip ? 1 : -1) * bodyAt.x * fit;
      skeleton.y = -H / 2 + H * foot;
    } else if (bust) {
      // 머리 꼭대기를 칸 위끝 조금 아래에 — 가로는 가운데
      const fit = (canvas.height / ((size.y || 1) * bust)) * scale;
      skeleton.scaleY = fit;
      skeleton.scaleX = flip ? -fit : fit;
      skeleton.x = (flip ? 1 : -1) * (off.x + size.x / 2) * fit;
      skeleton.y = canvas.height * 0.47 - (off.y + size.y) * fit;
    } else {
      const fit = Math.min(canvas.width / (size.x || 1), canvas.height / (size.y || 1)) * 0.9 * scale;
      skeleton.scaleY = fit;
      skeleton.scaleX = flip ? -fit : fit;
      skeleton.x = (flip ? 1 : -1) * (off.x + size.x / 2) * fit;
      skeleton.y = -(off.y) * fit - canvas.height / 2;
    }
    skeleton.updateWorldTransform();
    renderer.drawSkeleton(skeleton, true);
    renderer.end();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const api = {
    // 한 번만 하는 동작(공격·피격)은 끝나면 쉬는 동작으로 돌아온다. 없는 이름이면 아무 일도 없다.
    // then — 끝나면 이어서 할 동작 하나(골디의 Touch_Idle → Touch_End 처럼 짝을 이룬 것). 그것까지 하고 쉰다.
    //   여럿이면 배열로 — 고학년 스킬처럼 Ultimate1_1 → 1_2 → … 로 이어지는 것
    // hold — 끝나도 쉬는 동작으로 가지 않고 마지막 자세로 멈춰 있는다(대사가 끝날 때까지 붙들기). 돌아갈 때는 toRest()
    // from — 그 동작의 이 초부터(등장 동작의 화면 밖에서 뛰어드는 앞부분을 건너뛸 때)
    play(name, loopIt = false, then, { hold = false, from = 0 } = {}) {
      const a = findAnim(name);
      if (!a) return false;
      const te = state.setAnimation(0, a.name, loopIt);
      if (from > 0 && te) te.trackTime = Math.min(from, a.duration);
      for (const n of loopIt ? [] : [].concat(then || [])) {
        const b = findAnim(n);
        if (b) state.addAnimation(0, b.name, false, 0);
      }
      if (!loopIt && !hold && rest) state.addAnimation(0, rest.name, true, 0);
      return true;
    },
    toRest() { if (rest) state.setAnimation(0, rest.name, true); },
    // ms 동안 동작을 멈춘다(그리기는 계속). 겹치면 더 늦게 풀리는 쪽으로
    pause(ms) { frozen = Math.max(frozen, performance.now() + ms / battleRate()); },
    // 교감 본을 잡는다 — re 에 맞는 본이 있으면 true. drag 는 누른 자리부터 움직인 양(화면 px), letGo 로 놓는다
    grab(re, max = 120) {
      const b = skeleton.bones.find((x) => re.test(x.data.name));
      if (!b) return false;
      if (grab.bone && grab.bone !== b) { grab.bone.x = grab.bone.data.x; grab.bone.y = grab.bone.data.y; }
      Object.assign(grab, { bone: b, max, dx: 0, dy: 0, held: true });
      return true;
    },
    drag(dxClient, dyClient) {
      if (!grab.bone || !grab.held) return;
      const r = canvas.getBoundingClientRect();
      const kx = r.width ? canvas.width / r.width : 1, ky = r.height ? canvas.height / r.height : 1;
      grab.dx = dxClient * kx; grab.dy = -dyClient * ky;          // 화면은 y 아래로, 스켈레톤은 위로
    },
    letGo() { grab.held = false; },
    animations: () => skeleton.data.animations.map((a) => a.name),
    has: (name) => !!findAnim(name),
    current: () => { const t = state.getCurrent(0); return t && t.animation ? t.animation.name : null; },
    duration: (name) => { const a = findAnim(name); return a ? a.duration : 0; },
    // 등장(Spawn)을 어디서부터 틀까 — 동작 길이의 몫. 멀리서 날아 들어오는 앞부분은 캔버스 밖이라 잘려 보인다(reachOf)
    spawnFrom: () => spawnFrom,
    // 동작에 찍힌 이벤트 [{ name, time(초), s(문자 값), i(정수 값) }] — 원작은 Event · SFX · Voice · NextAni 따위에
    // 게임 표의 번호(1001409 …)를 문자 값으로 단다. 이름만으로 뜻은 모르니 쓰는 쪽(fight-screen 의 strikeOf)이 짐작한다
    events(name) {
      const a = findAnim(name), out = [];
      if (!a) return out;
      for (const tl of a.timelines) if (tl.events) for (const e of tl.events) out.push({ name: e.data.name, time: e.time, s: e.stringValue || "", i: e.intValue });
      return out.sort((x, y) => x.time - y.time);
    },
    // 교감(로비의 메인 사도) — 본을 찾고, 누른 자리를 스켈레톤 좌표로 바꾼다.
    // 카메라는 캔버스 가운데가 원점(y 위로)이고 스켈레톤 좌표는 캔버스 픽셀이다
    get skeleton() { return skeleton; },
    toWorld(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: (clientX - r.left) / r.width * canvas.width - canvas.width / 2, y: canvas.height / 2 - (clientY - r.top) / r.height * canvas.height };
    },
    // 본 하나의 화면(뷰포트) 자리 — 마지막으로 그린 프레임의 것. toWorld 의 거꾸로(뒤집기 · 배율은 본 좌표에 이미 들어 있다).
    // name 은 이름 그대로, 또는 정규식(처음 맞는 본). tip 이면 뿌리가 아니라 본 끝(길이만큼 앞 — 총 몸통 본이면 총구).
    // 없거나 캔버스가 화면에 없으면 null
    boneScreen(name, tip = false) {
      const b = typeof name === "string" ? skeleton.findBone(name) : skeleton.bones.find((x) => name.test(x.data.name));
      const r = canvas.getBoundingClientRect();
      if (!b || !r.width || !r.height || !canvas.width || !canvas.height) return null;
      const L = tip ? b.data.length : 0, wx = b.worldX + b.a * L, wy = b.worldY + b.c * L;
      return { x: r.left + (wx + canvas.width / 2) * (r.width / canvas.width), y: r.top + (canvas.height / 2 - wy) * (r.height / canvas.height) };
    },
    dispose() {
      dead = true; cancelAnimationFrame(raf); drop();
      const i = pool.findIndex((v) => v.api === api);
      if (i >= 0) pool.splice(i, 1);
    },
  };
  // 멈춰 있던 동안의 시간은 건너뛴다 — 한꺼번에 몰아 돌리면 동작이 튄다
  const wake = () => { if (!dead && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  // 컨텍스트를 브라우저가 거둬 가면(창을 오갈 때 · 너무 많을 때) 그 자리에 새로 그린다
  // 칸이 들고 있던 손잡이(el.spine)도 새것으로 바꾸고 하던 동작을 잇는다 — 안 바꾸면 버려진 것을 붙들어 고학년 · 공격 동작이 안 보였다
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const host = canvas.parentElement, cur = state.getCurrent(0);
    const was = cur && cur.animation && cur.animation !== rest ? { n: cur.animation.name, loop: cur.loop } : null;
    api.dispose();
    if (!host || !host.isConnected) return;
    spineView(host, kind, key, { scale, anim, flip, skin, unit, mix, bust, body }).then((v) => {
      if (!v) return;
      if (host.spine === api) host.spine = v;
      if (was) v.play(was.n, was.loop);
    });
  }, { once: true });
  api.bodyFit = !!bodyAt;               // 몸으로 세웠다 — 부르는 쪽이 따로 가운데를 맞출 필요가 없다
  pool.push({ id, canvas, api, wake, place });
  evict();
  return api;
}
