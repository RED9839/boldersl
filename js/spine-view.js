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

const ROOT = "assets/spine";
let manifest = null;
let failed = false;

const spine = () => globalThis.spine || null;

export function hasRuntime() { return !!spine(); }

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
const POOL_MAX = 14;

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
export async function spineView(el, kind, key, { scale = 1, anim, flip = false, skin } = {}) {
  const sp = spine();
  if (!sp) return null;
  await loadSpineManifest();
  if (!hasSpine(kind, key)) return null;

  const w = el.clientWidth || 200, h = el.clientHeight || 200;
  const id = `${kind}|${key}|${w}x${h}|${scale}|${anim || ""}|${flip ? "f" : ""}|${skin || ""}`;
  const spare = pool.find((v) => v.id === id && !v.canvas.isConnected);
  if (spare) { el.appendChild(spare.canvas); spare.wake(); return spare.api; }

  const set = kind === "minimi" ? manifest.minimi : manifest[kind][key];
  const dir = kind === "minimi" ? `${ROOT}/minimi` : `${ROOT}/${kind}/${key}`;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = canvas.style.height = "100%";
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
    const wear = byName(kind === "minimi" ? key : skin) || (data.defaultSkin ? null : data.skins[0]);
    if (wear) { skeleton.setSkin(wear); skeleton.setSlotsToSetupPose(); }
    state = new sp.AnimationState(new sp.AnimationStateData(data));
  } catch { drop(); return null; }

  // 동작 이름은 스켈레톤마다 대소문자가 섞여 있다 — 이름으로 찾되 대소문자는 안 가린다
  const findAnim = (name) => name && (skeleton.data.findAnimation(name)
    || skeleton.data.animations.find((a) => a.name.toLowerCase() === name.toLowerCase()));
  // 쉬는 동작. 전투 SD 는 135명 모두 Idle 이 있다. 없으면 첫 동작으로.
  const rest = findAnim(anim) || findAnim("Idle") || skeleton.data.animations[0];
  if (rest) state.setAnimation(0, rest.name, true);

  // 크기와 자리는 쉬는 자세로 한 번만 잰다. 매 프레임 재면 휘두르는 동작마다 몸이 커졌다 작아졌다 한다.
  state.apply(skeleton); skeleton.updateWorldTransform();
  const off = new sp.Vector2(), size = new sp.Vector2();
  skeleton.getBounds(off, size, []);

  let raf = 0, last = performance.now(), dead = false;
  const loop = (now) => {
    raf = 0;
    // 화면에서 떨어지면 멈춘다. 다시 붙을 때 wake() 가 이어 돌린다.
    if (dead || !canvas.isConnected) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    state.update(dt); state.apply(skeleton);
    // 캔버스는 화면에 실제로 찍히는 픽셀만큼 잡는다. renderer.resize() 는 CSS 크기 × devicePixelRatio 로 잡아서
    // 화면 배율(js/stage.js 의 zoom — QHD 1.6배)을 모르고, 그러면 사도가 뿌옇게 늘어난다.
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.gl.viewport(0, 0, cw, ch);
    renderer.camera.setViewport(cw, ch);
    renderer.camera.update();
    ctx.gl.clearColor(0, 0, 0, 0); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    renderer.begin();
    // 캔버스 가운데 아래에 세운다 — 미니미도 스탠딩도 발이 바닥에 닿아야 자연스럽다
    const fit = Math.min(canvas.width / (size.x || 1), canvas.height / (size.y || 1)) * 0.9 * scale;
    skeleton.scaleY = fit;
    skeleton.scaleX = flip ? -fit : fit;
    skeleton.x = (flip ? 1 : -1) * (off.x + size.x / 2) * fit;
    skeleton.y = -(off.y) * fit - canvas.height / 2;
    skeleton.updateWorldTransform();
    renderer.drawSkeleton(skeleton, true);
    renderer.end();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const api = {
    // 한 번만 하는 동작(공격·피격)은 끝나면 쉬는 동작으로 돌아온다. 없는 이름이면 아무 일도 없다.
    play(name, loopIt = false) {
      const a = findAnim(name);
      if (!a) return false;
      state.setAnimation(0, a.name, loopIt);
      if (!loopIt && rest) state.addAnimation(0, rest.name, true, 0);
      return true;
    },
    animations: () => skeleton.data.animations.map((a) => a.name),
    dispose() {
      dead = true; cancelAnimationFrame(raf); drop();
      const i = pool.findIndex((v) => v.api === api);
      if (i >= 0) pool.splice(i, 1);
    },
  };
  // 멈춰 있던 동안의 시간은 건너뛴다 — 한꺼번에 몰아 돌리면 동작이 튄다
  const wake = () => { if (!dead && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  pool.push({ id, canvas, api, wake });
  evict();
  return api;
}
