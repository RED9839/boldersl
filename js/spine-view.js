// 스파인 그리기 — 전투 SD·스탠딩·미니미는 부품 단위라 런타임이 있어야 움직인다.
// 사도 데스크와 같은 방식이다(spine-webgl 4.1, .skel + .atlas 직접 읽기).
//
// **런타임 라이선스**: Spine Runtimes 는 쓰는 사람이 각자 Spine Editor 라이선스를 가져야 한다.
// 그래서 이 파일은 런타임이 없으면 조용히 물러난다 — 그때는 art.js 의 그림 한 장으로 떨어진다.
// 자세한 것은 docs/04-스파인.md.
//
// 쓰는 쪽:
//   const v = await spineView(el, "ingame", "erpin");   // 없으면 null
//   v.play("idle"); v.dispose();

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

// el 안에 캔버스를 만들고 그 사도를 그린다. 런타임이나 자료가 없으면 null.
export async function spineView(el, kind, key, { scale = 1, anim } = {}) {
  const sp = spine();
  if (!sp) return null;
  await loadSpineManifest();
  if (!hasSpine(kind, key)) return null;

  const set = kind === "minimi" ? manifest.minimi : manifest[kind][key];
  const dir = kind === "minimi" ? `${ROOT}/minimi` : `${ROOT}/${kind}/${key}`;

  const canvas = document.createElement("canvas");
  canvas.width = el.clientWidth || 200;
  canvas.height = el.clientHeight || 200;
  canvas.style.width = canvas.style.height = "100%";
  el.appendChild(canvas);

  let ctx, renderer;
  try {
    ctx = new sp.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    renderer = new sp.SceneRenderer(canvas, ctx, true);
  } catch { canvas.remove(); return null; }

  let skeleton, state;
  try {
    const atlas = await loadAtlas(sp, ctx, dir, set.atlas, set.pages);
    const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas))
      .readSkeletonData(new Uint8Array(await (await fetch(`${dir}/${set.skel}`)).arrayBuffer()));
    // 미니미는 한 아틀라스에 모두가 들어 있다 — 그 사도의 스킨을 골라 입힌다
    skeleton = new sp.Skeleton(data);
    if (kind === "minimi") {
      const skin = data.findSkin(key) || data.skins.find((s) => s.name.toLowerCase() === key.toLowerCase());
      if (skin) { skeleton.setSkin(skin); skeleton.setSlotsToSetupPose(); }
    }
    state = new sp.AnimationState(new sp.AnimationStateData(data));
    const first = anim && data.findAnimation(anim) ? anim : (data.animations[0] && data.animations[0].name);
    if (first) state.setAnimation(0, first, true);
  } catch { canvas.remove(); return null; }

  let raf = 0, last = performance.now(), dead = false;
  const loop = (now) => {
    if (dead) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    state.update(dt); state.apply(skeleton); skeleton.updateWorldTransform();
    renderer.resize(sp.ResizeMode.Expand);
    ctx.gl.clearColor(0, 0, 0, 0); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    renderer.begin();
    // 캔버스 가운데 아래에 세운다 — 미니미도 스탠딩도 발이 바닥에 닿아야 자연스럽다
    const off = new sp.Vector2(), size = new sp.Vector2();
    skeleton.getBounds(off, size, []);
    const fit = Math.min(canvas.width / (size.x || 1), canvas.height / (size.y || 1)) * 0.9 * scale;
    skeleton.scaleX = skeleton.scaleY = fit;
    skeleton.x = -(off.x + size.x / 2) * fit;
    skeleton.y = -(off.y) * fit - canvas.height / 2;
    skeleton.updateWorldTransform();
    renderer.drawSkeleton(skeleton, true);
    renderer.end();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    play(name, loopIt = true) {
      const a = skeleton.data.findAnimation(name);
      if (a) state.setAnimation(0, name, loopIt);
    },
    animations: () => skeleton.data.animations.map((a) => a.name),
    dispose() { dead = true; cancelAnimationFrame(raf); canvas.remove(); },
  };
}
