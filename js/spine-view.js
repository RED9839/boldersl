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
//   같은 배율로 그리면 날개·지팡이는 칸 밖으로 나간다 — 그래서 캔버스를 칸보다 크게(가로 3배·세로 2배) 잡고
//   발(뼈대 원점)을 칸 바닥 가운데에 세운다. 칸 크기와 자리 잡기는 그대로라 배치가 흔들리지 않는다.
export const OVER_W = 3, OVER_H = 2;
export async function spineView(el, kind, key, { scale = 1, anim, flip = false, skin, unit = 0 } = {}) {
  const sp = spine();
  if (!sp) return null;
  await loadSpineManifest();
  if (!hasSpine(kind, key)) return null;

  const w = el.clientWidth || 200, h = el.clientHeight || 200;
  // 크기는 열쇠에 넣지 않는다 — 캔버스 크기는 그리는 고리가 매 프레임 화면에 맞춰 다시 잡는다.
  // 넣어 두었더니 싸움터 높이에 따라 크기가 바뀌는 전투 화면에서 다시 쓰질 못하고 카드 한 장마다 컨텍스트가 늘어 하얗게 버려졌다.
  const id = `${kind}|${key}|${scale}|${anim || ""}|${flip ? "f" : ""}|${skin || ""}|${unit}`;
  const spare = pool.find((v) => v.id === id && !v.canvas.isConnected);
  if (spare) {
    // 새 칸에도 「넘쳐도 된다」 표시를 단다 — 빠뜨렸더니 옮겨 붙인 캔버스가 칸(둥근 네모)에 잘려 보였다
    if (unit) el.classList.add("art-over");
    el.appendChild(spare.canvas); spare.wake(); return spare.api;
  }

  const set = kind === "minimi" ? manifest.minimi : manifest[kind][key];
  const dir = kind === "minimi" ? `${ROOT}/minimi` : `${ROOT}/${kind}/${key}`;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = canvas.style.height = "100%";
  if (unit) {
    // 칸보다 크게, 바닥 가운데에 맞춰 — 넘친 부분이 옆 사도의 클릭을 가로채지 않게 한다
    Object.assign(canvas.style, { position: "absolute", left: `${-(OVER_W - 1) * 50}%`, bottom: "0",
      width: `${OVER_W * 100}%`, height: `${OVER_H * 100}%`, pointerEvents: "none" });
    el.classList.add("art-over");
  }
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
    if (unit) {
      // 모두 같은 배율 — 칸 높이 = unit 단위. 발(원점)은 칸 바닥 가운데, 발밑 그림자 몫만 조금 띄운다
      const boxH = canvas.height / OVER_H;
      const fit = (boxH / unit) * scale;
      skeleton.scaleY = fit;
      skeleton.scaleX = flip ? -fit : fit;
      skeleton.x = 0;
      skeleton.y = -canvas.height / 2 + boxH * 0.05;
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
    play(name, loopIt = false, then) {
      const a = findAnim(name);
      if (!a) return false;
      state.setAnimation(0, a.name, loopIt);
      const b = !loopIt && findAnim(then);
      if (b) state.addAnimation(0, b.name, false, 0);
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
  // 컨텍스트를 브라우저가 거둬 가면(창을 오갈 때 · 너무 많을 때) 그 자리에 새로 그린다
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const host = canvas.parentElement;
    api.dispose();
    if (host && host.isConnected) spineView(host, kind, key, { scale, anim, flip, skin, unit });
  }, { once: true });
  pool.push({ id, canvas, api, wake });
  evict();
  return api;
}
