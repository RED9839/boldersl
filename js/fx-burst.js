// 궁극기 이펙트 — 원작 파티클(tools/extract-fx.py 가 assets/fx 에 풀어 둔 것)을 전투 위 캔버스 한 장에 흉내 낸다.
//
// 원작 ParticleSystem 의 값싼 몫만 옮겼다 — 버스트·초당 방출, 모양(구·원뿔·원·선), 처음 속도·크기·색·수명,
// 수명에 따른 크기·색·투명도, 시트 애니메이션, 속도·힘·속도 제한. 셰이더 그래프(디졸브·노이즈·UV 흐름)는 없다.
// 그림이 없으면(assets/fx 를 안 꺼낸 기기) loadFx() 가 false 를 주고 나머지는 조용히 아무것도 안 한다.
//
// 쓰는 쪽:
//   if (await loadFx() && hasUltFx("에르핀")) await playUltFx("에르핀", { from: {x, y}, to: {x, y} });
//   await playFx("fx_erpin_ultimate_explosion_1", { x, y, scale: 1, flip: false });
//   preloadUltFx("에르핀");   // 컷인이 도는 동안 미리 받아 둔다
//   preloadFx(["fx_common_hit_slash_1"]);   // 타격 이펙트 — 싸움을 열 때 받아 둔다(첫 타격이 그림을 기다리지 않게)
// x·y 는 화면(뷰포트) 좌표, 그 유닛의 발밑이다 — 원작 이펙트가 발밑을 원점으로 짜여 있다.
// container 를 주면 그 안에 캔버스를 깐다(위치가 static 이 아닌 상자). 없으면 화면 전체에 고정으로 깐다.
// playFx 의 until(초)은 그때까지 걷히며 끝내고, center 는 뿌리에서 멀리 짜인 이펙트를 x 에 가운데 맞춘다.
// 움직임 줄이기(html.calm)나 { calm: true } 면 아무것도 안 하고 바로 끝난다.
//
// 구운 판 — Unity 에서 프레임으로 구운 원작 이펙트(tools/fx-baked.py → assets/fx-baked)가 그 이름에 있으면 흉내 대신 그것을 튼다.
// 시트 한 칸씩 같은 캔버스에 그린다. 색인의 anchor(원점 픽셀)가 발밑에, ppu(시트 px/단위)를 PPU 에 맞춘다.
// scale · dx · dy · reach · fadeFrom · post 는 이펙트마다 손본 값(tools/fx-baked.py 의 TUNE)
//
// 총구 — playFx 의 track(함수, 화면 좌표를 준다)을 주면 매 프레임 그 자리에 붙어 따라간다(스파인 본 — spine-view 의 boneScreen).
// bare 면 TUNE 의 dx · dy 를 안 쓴다(발밑에서 총구까지 손으로 맞춘 몫이라 본에 붙이면 필요 없다)

const BASE = new URL("../assets/fx/", import.meta.url).href;
const BAKED = new URL("../assets/fx-baked/", import.meta.url).href;
const PPU = 16;            // 유니티 1단위 = 16px (scale 1). 유닛 키가 150px 쯤인 전장에 맞췄다 — 원작 궁극기는 유닛 두세 배로 핀다
const CAP = 600;           // 화면에 동시에 뜨는 입자 수
const MAX_DT = 1 / 20;
const FADE = 0.4;          // until 로 끊을 때 걷히는 시간

let index = null, indexP = null;
const heroJson = new Map();     // 그림 이름 → Promise<{ effectName: fx }>
const images = new Map();       // 경로 → Promise<HTMLImageElement|null>
const stages = new Map();       // 상자 → 무대
let live = 0;                   // 모든 무대의 입자 수

const calmNow = () => typeof document === "object" && !!document.documentElement && document.documentElement.classList.contains("calm");
const rand = (r) => (r ? r[0] + Math.random() * (r[1] - r[0]) : 0);

export async function loadFx() {
  if (index) return true;
  if (!indexP) indexP = fetch(BASE + "index.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!bakedP) bakedP = fetch(BAKED + "index.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((j) => { baked = (j && j.effects) || {}; });
  [index] = await Promise.all([indexP, bakedP]);
  return !!index;
}

// ── 구운 판: 시트 쪽을 받고, post 가 있으면 한 번 칠한 캔버스로 바꿔 둔다 ──
let baked = {}, bakedP = null;
const sheets = new Map();       // 이펙트 이름 → Promise<{ b, pages: [그림|캔버스] }|null>

function bakedSheet(name) {
  const b = baked[name];
  if (!b) return null;
  if (!sheets.has(name)) sheets.set(name, Promise.all(b.pages.map((p) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = BAKED + p.file;
  }))).then(async (pages) => {
    if (pages.some((p) => !p)) return null;
    if (b.post) for (let i = 0; i < pages.length; i++) pages[i] = await postSheet(pages[i], b.post);
    return { b, pages };
  }));
  return sheets.get(name);
}

// 어두운 칸 → 주황 반투명(dark), 흰 칸 → 주황(white). 원작 HDR 블룸이 굽기에서 빠진 몫을 메운다.
// 큰 쪽(2048×3852)은 한 번에 돌리면 컷인이 멈칫해 띠로 나눠 쉬어 가며 칠한다
async function postSheet(im, post) {
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const D = post.dark, Wt = post.white, BAND = 256;
  for (let y0 = 0; y0 < cv.height; y0 += BAND) {
    const bh = Math.min(BAND, cv.height - y0), d = g.getImageData(0, y0, cv.width, bh), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      let r = px[i], gr = px[i + 1], bl = px[i + 2], a = px[i + 3];
      const mx = Math.max(r, gr, bl), mn = Math.min(r, gr, bl), l = mx / 255;
      if (D) {
        const x = Math.max(0, Math.min(1, 1 - l / D.below)), w = x * x * (3 - 2 * x);
        if (w > 0) {
          const k = D.base + l * D.gain;
          r += (Math.min(255, D.tint[0] * k) - r) * w; gr += (Math.min(255, D.tint[1] * k) - gr) * w; bl += (Math.min(255, D.tint[2] * k) - bl) * w;
          a *= 1 - w * (1 - D.alpha);
        }
      }
      if (Wt) {
        const sat = (mx - mn) / Math.max(mx, 1);
        const w = Math.max(0, Math.min(1, (Wt.sat - sat) / Wt.sat)) * Math.max(0, Math.min(1, (l - Wt.above) / (1 - Wt.above))) * Wt.amt;
        if (w > 0) { r += (Wt.tint[0] * l - r) * w; gr += (Wt.tint[1] * l - gr) * w; bl += (Wt.tint[2] * l - bl) * w; }
      }
      px[i] = r; px[i + 1] = gr; px[i + 2] = bl; px[i + 3] = a;
    }
    g.putImageData(d, 0, y0);
    await new Promise((r) => setTimeout(r, 0));
  }
  return cv;
}

export function hasUltFx(heroKey) { return !!(index && index.heroes[heroKey] && index.heroes[heroKey].ult.length); }

function heroOf(name) { const e = index && index.effects[name]; return e ? e.hero : null; }

function fxJson(hero) {
  if (!heroJson.has(hero)) heroJson.set(hero, fetch(`${BASE}${hero}/fx.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return heroJson.get(hero);
}

function image(path) {
  if (!images.has(path)) images.set(path, new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = BASE + path;
  }));
  return images.get(path);
}

async function getFx(name) {
  if (!(await loadFx())) return null;
  const hero = heroOf(name);
  if (!hero) return null;
  const fx = (await fxJson(hero))[name];
  if (!fx) return null;
  await Promise.all(fx.em.map((e) => image(e.tex)));
  return fx;
}

export async function preloadUltFx(heroKey) {
  if (!(await loadFx()) || !hasUltFx(heroKey)) return false;
  await Promise.all(index.heroes[heroKey].ult.map((n) => bakedSheet(n) || getFx(n)));
  return true;
}

export async function preloadFx(names) {
  if (!(await loadFx())) return false;
  await Promise.all(names.map((n) => bakedSheet(n) || getFx(n)));
  return true;
}

// ── 무대: 상자마다 캔버스 하나. 할 일이 없으면 DOM 에서 떼고 rAF 를 멈춘다 ──
function stageFor(container) {
  const host = container || document.body;
  let s = stages.get(host);
  if (s) return s;
  const cv = document.createElement("canvas");
  cv.className = "fx-burst";
  const fixed = !container;
  cv.style.cssText = `position:${fixed ? "fixed" : "absolute"};left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60`;
  s = { host, cv, fixed, runs: [], raf: 0, last: 0, w: 0, h: 0, dpr: 1 };
  const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (gl && initGL(s, gl)) s.gl = gl; else s.g2 = cv.getContext("2d");
  stages.set(host, s);
  return s;
}

function attach(s) {
  if (!s.cv.isConnected) s.host.appendChild(s.cv);
  const r = s.fixed ? { width: innerWidth, height: innerHeight } : s.host.getBoundingClientRect();
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  if (r.width !== s.w || r.height !== s.h || dpr !== s.dpr) {
    s.w = r.width; s.h = r.height; s.dpr = dpr;
    s.cv.width = Math.max(1, Math.round(r.width * dpr)); s.cv.height = Math.max(1, Math.round(r.height * dpr));
  }
}

// 뷰포트 좌표 → 무대 좌표
function local(s, x, y) {
  if (s.fixed) return [x, y];
  const r = s.host.getBoundingClientRect();
  return [x - r.left, y - r.top];
}

// ── WebGL — 미리 곱한 알파 하나로 섞는다. 더하기 입자는 알파를 0 으로 내보내면 ONE, ONE 이 된다 ──
// l 은 칸 안의 자리(0~1). 가장자리 EDGE 만큼 걷어 낸다 — 판(메시)에 감던 그림 · 가장자리가 찬 시트 칸이 네모난 테두리로 보이지 않게
const EDGE = 0.05;
const VS = `attribute vec2 p;attribute vec2 t;attribute vec2 l;attribute vec4 c;attribute float a;uniform vec2 r;varying vec2 vt;varying vec2 vl;varying vec4 vc;varying float va;
void main(){gl_Position=vec4(p.x/r.x*2.0-1.0,1.0-p.y/r.y*2.0,0.0,1.0);vt=t;vl=l;vc=c;va=a;}`;
const FS = `precision mediump float;uniform sampler2D s;varying vec2 vt;varying vec2 vl;varying vec4 vc;varying float va;
void main(){vec4 x=texture2D(s,vt);vec2 q=min(vl,1.0-vl);float f=smoothstep(0.0,${EDGE},min(q.x,q.y));
gl_FragColor=vec4(x.rgb*vc.rgb*vc.a,x.a*vc.a*(1.0-va))*f;}`;
const FLOATS = 11;   // x y u v lx ly r g b a add

function initGL(s, gl) {
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return false;
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const at = (n, size, off) => { const l = gl.getAttribLocation(pr, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, FLOATS * 4, off * 4); };
  at("p", 2, 0); at("t", 2, 2); at("l", 2, 4); at("c", 4, 6); at("a", 1, 10);
  s.uRes = gl.getUniformLocation(pr, "r");
  s.verts = new Float32Array(CAP * 6 * FLOATS);
  s.tex = new Map();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  return true;
}

function glTex(s, path, im) {
  let t = s.tex.get(path);
  if (t) return t;
  const gl = s.gl;
  t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  s.tex.set(path, t);
  return t;
}

// 2D 판 — WebGL 이 없을 때. 색은 이미터 처음 색으로 한 번 칠해 둔 그림을 쓴다
const tinted = new Map();
function tintImg(im, path, c, add, sheet) {
  const key = path + (add ? "+" : "") + c.map((v) => Math.round(Math.min(1, v) * 15)).join(",") + (sheet ? `#${sheet.tx}x${sheet.ty}` : "");
  let t = tinted.get(key);
  if (t) return t;
  t = document.createElement("canvas");
  t.width = im.width; t.height = im.height;
  const g = t.getContext("2d");
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = `rgb(${c.slice(0, 3).map((v) => Math.round(Math.min(1, v) * 255)).join(",")})`;
  g.fillRect(0, 0, t.width, t.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(im, 0, 0);
  // 2D 의 lighter 는 알파까지 더해 검은 바탕이 덮인다 — 더하기 그림은 밝기를 알파로 옮겨 둔다.
  // 칸 가장자리는 WebGL 판처럼 EDGE 만큼 걷어 낸다
  const d = g.getImageData(0, 0, t.width, t.height), px = d.data;
  const cw = t.width / (sheet ? sheet.tx : 1), ch = t.height / (sheet ? sheet.ty : 1);
  for (let i = 0; i < px.length; i += 4) {
    let a = px[i + 3];
    if (add) {
      a = (a / 255) * Math.max(px[i], px[i + 1], px[i + 2]);
      if (a > 0) { const k = 255 / Math.max(px[i], px[i + 1], px[i + 2]); px[i] *= k; px[i + 1] *= k; px[i + 2] *= k; }
    }
    const x = (i >> 2) % t.width, y = Math.floor((i >> 2) / t.width), lx = (x % cw) / cw, ly = (y % ch) / ch;
    const e = Math.min(lx, 1 - lx, ly, 1 - ly) / EDGE;
    px[i + 3] = e < 1 ? a * e * e * (3 - 2 * e) : a;
  }
  g.putImageData(d, 0, 0);
  tinted.set(key, t);
  return t;
}

// ── 커브 ──
function keyAt(k, t) {
  if (!k) return 1;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i], f = (t - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * f; }
  return k[k.length - 1][1];
}
function colAt(k, t, out) {
  if (!k) { out[0] = out[1] = out[2] = 1; return; }
  let a = k[0], b = k[0];
  if (t > k[0][0]) { b = k[k.length - 1]; a = b; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { a = k[i - 1]; b = k[i]; break; } }
  const f = b === a ? 0 : (t - a[0]) / ((b[0] - a[0]) || 1);
  for (let j = 0; j < 3; j++) out[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * f;
}

// ── 모양: 방출 공간의 (자리, 방향) — 유니티 기본은 +Z 로 쏜다 ──
function shapePoint(sh) {
  if (!sh) return [0, 0, 0, 0, 0, 1];
  const r = sh.r || 0, th = sh.t == null ? 1 : sh.t;
  const rr = r * (1 - th * Math.random());
  const arc = ((sh.arc || 360) * Math.PI) / 180;
  let p, d;
  switch (sh.k) {
    case "sphere": case "hemi": {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      d = [q * Math.cos(a), q * Math.sin(a), sh.k === "hemi" ? Math.abs(u) : u];
      p = d.map((v) => v * rr); break;
    }
    case "cone": {
      const a = Math.random() * arc, f = th ? Math.sqrt(Math.random()) * th + (1 - th) : 1;
      const cx = Math.cos(a), cy = Math.sin(a), ang = (((sh.a || 0) * Math.PI) / 180) * f;
      p = [cx * r * f, cy * r * f, 0];
      d = [cx * Math.sin(ang), cy * Math.sin(ang), Math.cos(ang)]; break;
    }
    case "circle": case "donut": {
      const a = Math.random() * arc, cx = Math.cos(a), cy = Math.sin(a);
      p = [cx * rr, cy * rr, 0]; d = [cx, cy, 0]; break;
    }
    case "edge": { p = [(Math.random() * 2 - 1) * r, 0, 0]; d = [0, 1, 0]; break; }
    case "box": case "rect": { p = [Math.random() - 0.5, Math.random() - 0.5, sh.k === "box" ? Math.random() - 0.5 : 0]; d = [0, 0, 1]; break; }
    default: p = [0, 0, 0]; d = [0, 0, 1];
  }
  if (sh.rnd || sh.sph) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    const rd = sh.sph ? (Math.hypot(...p) ? p.map((v) => v / Math.hypot(...p)) : d) : [q * Math.cos(a), q * Math.sin(a), u];
    const k = sh.rnd || sh.sph;
    d = d.map((v, i) => v * (1 - k) + rd[i] * k);
  }
  return [p[0], p[1], p[2], d[0], d[1], d[2]];
}
const proj = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z];

// ── 한 번 틀기 ──
function makeRun(fx, o) {
  // 대상 쪽 이펙트가 뿌리에서 멀리 짜여 있으면(원작은 돌진 · 스크립트로 옮겨 가며 튼다) 가로 가운데를 대상에 맞춘다
  let dx = 0;
  if (o.center) {
    const xs = fx.em.filter((e) => !e.m3d).map((e) => e.pos[0]).sort((a, b) => a - b);
    const m = xs.length ? xs[xs.length >> 1] : 0;
    if (Math.abs(m) > 6) dx = -m;
  }
  // top(뷰포트 y)을 주면 가장 높이 짜인 이미터가 그 위로 나가지 않게 이미터 높이만 줄인다(입자 크기 · 움직임은 그대로).
  // 원작 카메라는 싸움터를 넓게 잡아 앨리스 고양이 구름(발밑 15단위 위)이 머리 위에 뜨는데, 이 전장에선 싸움터 밖 꼭대기에 떴다
  let ys = 1;
  if (o.top != null && o.y != null) {
    const hi = Math.max(0, ...fx.em.filter((e) => !e.m3d).map((e) => e.pos[1]));
    const room = o.y - o.top, k = PPU * (o.scale || 1);
    if (hi * k > room && room > 0) ys = room / (hi * k);
  }
  return {
    fx, k: PPU * (o.scale || 1), flip: o.flip ? -1 : 1, t: 0, move: o.move || null, track: o.track || null, ox: o.x, oy: o.y, dx, ys,
    until: o.until || Infinity, fade: 1,
    // 입체 메시(원기둥 · 나선)는 판 한 장으로 그리면 회색 조각이 되어 뺀다. o.only 는 이미터 번호 몇 개만(살펴볼 때)
    ems: fx.em.filter((e, i) => !e.m3d && (!o.only || o.only.includes(i))).map((e) => ({
      e, t0: rand(e.delay), acc: 0, parts: [], img: null, path: e.tex,
      bursts: (e.bursts || []).map((b) => ({ t: b[0], n: b[1], left: b[2] || 1, iv: b[3] || 0.01 })),
    })),
    done: null,
  };
}

// 구운 판 한 번 — center 는 보이는 가운데(cx)가 멀면 대상에 맞추고, top 을 넘으면 통째로 줄인다.
// reach 면 뿌리 앞쪽을 무대 끝까지 가로로 늘인다(sx). 늘이는 것은 앞쪽만 — 총구 쪽 번쩍임은 그대로
function makeBakedRun(sh, o, s) {
  const b = sh.b;
  let k = PPU * (o.scale || 1) * (b.scale || 1);
  const dy = o.bare ? 0 : b.dy || 0;
  if (o.top != null && o.y != null) {
    const hi = b.anchor[1] / b.ppu + dy, room = o.y - o.top;
    if (hi * k > room && room > 0) k = room / hi;
  }
  let dx = o.bare ? 0 : b.dx || 0;
  if (o.center && Math.abs(b.cx) > 6) dx -= b.cx;
  let sx = 1;
  if (b.reach) {
    const lx = local(s, o.x, o.y)[0] + (o.flip ? -1 : 1) * dx * k, have = ((b.w - b.anchor[0]) * k) / b.ppu;
    const need = (o.flip ? lx : s.w - lx) + 40;
    if (have > 0 && need > have) sx = need / have;
  }
  return {
    sheet: sh, fx: { dur: b.frames / b.fps }, ems: [], k, sx, flip: o.flip ? -1 : 1, t: 0, move: null, track: o.track || null, ox: o.x, oy: o.y, dx, dy,
    until: o.until || Infinity, fade: 1, done: null,
  };
}

// 지금 프레임의 쪽 · 칸 · 투명도
function bakedFrame(run) {
  const b = run.sheet.b;
  let f = Math.min(b.frames - 1, Math.floor(run.t * b.fps)), p = 0;
  const tt = f / Math.max(1, b.frames - 1);
  let a = run.fade;
  if (b.fadeFrom != null && tt > b.fadeFrom) a *= Math.max(0, 1 - (tt - b.fadeFrom) / (1 - b.fadeFrom));
  while (p < b.pages.length - 1 && f >= b.pages[p].frames) f -= b.pages[p++].frames;
  return { p, sx: (f % b.cols) * b.w, sy: Math.floor(f / b.cols) * b.h, a };
}

// 화면 조각 둘 — [시트 x0, x1, 화면 X0, X1]. 원점 뒤쪽은 그대로, 앞쪽은 sx 만큼 늘인다
function bakedSpans(run, ox) {
  const b = run.sheet.b, q = run.k / b.ppu, fl = run.flip, ax = b.anchor[0];
  if (run.sx === 1) return [[0, b.w, ox - fl * ax * q, ox + fl * (b.w - ax) * q]];
  return [[0, ax, ox - fl * ax * q, ox], [ax, b.w, ox, ox + fl * (b.w - ax) * q * run.sx]];
}

// 방출하는 시간 — 반복 이미터는 한 바퀴(길어야 1.5초)만
const emitWindow = (e) => (e.loop ? Math.min(e.dur, 1.5) : e.dur) || 0.01;
const avgSc = (e) => (e.sc ? (Math.abs(e.sc[0]) + Math.abs(e.sc[1])) / 2 || 1 : 1);

function spawn(run, em, count) {
  const e = em.e;
  if (!em.img) return;
  for (let i = 0; i < count; i++) {
    if (live >= CAP || em.parts.length >= (e.max || 1000)) return;
    const [px, py, pz, dx, dy, dz] = shapePoint(e.shape);
    const sp = rand(e.speed);
    const P = proj(e.m, px, py, pz), V = proj(e.m, dx * sp, dy * sp, dz * sp);
    const p = {
      x: e.pos[0] + P[0], y: e.pos[1] * run.ys + P[1], vx: V[0], vy: V[1], lvx: V[0], lvy: V[1],
      age: 0, life: Math.max(0.02, rand(e.life)), size: rand(e.size) * avgSc(e),
      rot: rand(e.rot), spin: rand(e.spin), c: null, row: 0, f0: 0, sf: 0, fu: e.flipU ? Math.random() < e.flipU : false,
    };
    // 처음 색 — 둘 사이를 섞거나 몇 개 중 하나
    const cs = e.col;
    if (e.colLerp && cs.length === 2) { const f = Math.random(); p.c = cs[0].map((v, j) => v + (cs[1][j] - v) * f); }
    else p.c = cs[(Math.random() * cs.length) | 0].slice();
    for (let j = 0; j < 4; j++) p.c[j] *= e.tint[j];
    if (e.radial) { const l = Math.hypot(P[0], P[1]) || 1; p.vx += (P[0] / l) * e.radial; p.vy += (P[1] / l) * e.radial; }
    const a = e.sheet;
    if (a) {
      const F = a.row ? a.tx : a.tx * a.ty;
      if (a.row === 1) p.row = (Math.random() * a.ty) | 0; else if (a.row >= 2) p.row = a.row - 2;
      if (a.f) p.f0 = Math.floor(rand(a.f) * F);
      if (a.sf) p.sf = Math.floor(a.sf[1] <= 1 ? rand(a.sf) * F : rand(a.sf));
    }
    em.parts.push(p); live++;
  }
}

// 한 걸음 — 방출하고, 움직이고, 수명이 다한 것을 치운다. 아직 할 일이 있으면 true
function step(run, dt) {
  run.t += dt;
  if (run.sheet) return run.t < run.fx.dur;
  let busy = false;
  for (const em of run.ems) {
    const e = em.e, te = run.t - em.t0;
    if (te < 0) { busy = true; continue; }
    if (e.rate && te <= emitWindow(e)) {
      busy = true;
      em.acc += e.rate * dt;
      const n = Math.floor(em.acc);
      em.acc -= n;
      if (n) spawn(run, em, n);
    }
    for (const b of em.bursts) {
      while (b.left > 0 && te >= b.t) {
        spawn(run, em, Math.floor(b.n) + (Math.random() < b.n % 1 ? 1 : 0));
        b.left--; b.t += b.iv;
      }
      if (b.left > 0) busy = true;
    }
    const ps = em.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); live--; continue; }
      move(e, p, dt);
    }
    if (ps.length) busy = true;
  }
  return busy;
}

function move(e, p, dt) {
  if (e.grav) p.vy -= e.grav * dt;
  if (e.force) { const F = e.forceW ? e.force : proj(e.mt || e.m, e.force[0], e.force[1], e.force[2]); p.vx += F[0] * dt; p.vy += F[1] * dt; }
  if (e.drag) { const d = Math.exp(-e.drag * dt); p.vx *= d; p.vy *= d; }
  // 수명 속도(vel)는 매 프레임 더해지는 몫이라 쌓지 않는다. 속도 제한은 둘을 합친 것에 건다
  const V = e.vel ? (e.velW ? e.vel : proj(e.mt || e.m, e.vel[0], e.vel[1], e.vel[2])) : [0, 0];
  let vx = p.vx + V[0], vy = p.vy + V[1];
  if (e.limit != null) {
    const lim = e.limit * avgSc(e), v = Math.hypot(vx, vy);
    if (v > lim) {
      const r = (lim + (v - lim) * Math.pow(1 - (e.damp || 0), dt * 60)) / v;
      vx *= r; vy *= r; p.vx = vx - V[0]; p.vy = vy - V[1];
    }
  }
  if (e.spdMul) { vx *= e.spdMul; vy *= e.spdMul; }
  p.x += vx * dt; p.y += vy * dt;
  p.lvx = vx; p.lvy = vy;
  p.rot += p.spin * dt;
}

// 입자 하나의 네 꼭짓점(화면 px)과 uv
const C = [0, 0, 0];
function quad(run, ox, oy, e, p, out) {
  const k = run.k, fl = run.flip, t = p.age / p.life;
  let s = p.size * keyAt(e.sizeOL, t) * (e.sizeK || 1) * k;
  let cx = ox + fl * p.x * k, cy = oy - p.y * k;
  if (e.pivot) { cx += fl * e.pivot[0] * s; cy -= e.pivot[1] * s; }
  let ux, uy, vx, vy;
  if (e.quad) {
    const q = e.quad, cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    const ax = q[0] * cr + q[2] * sr, ay = q[1] * cr + q[3] * sr, bx = -q[0] * sr + q[2] * cr, by = -q[1] * sr + q[3] * cr;
    const sz = s / 2, sv = sz * (e.asp || 1);
    // v 는 아래로 — 그림 윗줄(v0)이 판의 +y(위)에 온다. 거꾸로 두면 불꽃·흙먼지가 뒤집혀 밑단 띠가 위에서 각진 덩어리로 보인다
    ux = fl * ax * sz; uy = -ay * sz; vx = -fl * bx * sv; vy = by * sv;
  } else {
    let w = s, h = s * (e.sy || 1) * (e.asp || 1);
    if (e.sc) { w *= Math.abs(e.sc[0]) / ((Math.abs(e.sc[0]) + Math.abs(e.sc[1])) / 2 || 1); h *= Math.abs(e.sc[1]) / ((Math.abs(e.sc[0]) + Math.abs(e.sc[1])) / 2 || 1); }
    if (e.ext) { w *= e.ext[0]; h *= e.ext[1]; }
    if (e.flat) h *= 0.35;
    let ang = -p.rot * fl;
    if (e.stretch) {
      const vsx = fl * p.lvx * k, vsy = -p.lvy * k, v = Math.hypot(vsx, vsy);
      const len = w * e.stretch[0] + v * (e.stretch[1] || 0);
      ang = v > 1e-3 ? Math.atan2(vsy, vsx) : 0;
      h = w; w = Math.max(len, w * 0.2);
    }
    const c = Math.cos(ang), sn = Math.sin(ang);
    ux = (c * w) / 2; uy = (sn * w) / 2; vx = (-sn * h) / 2; vy = (c * h) / 2;
    if (e.sc && e.sc[0] * fl < 0) { ux = -ux; uy = -uy; }
  }
  out[0] = cx - ux - vx; out[1] = cy - uy - vy;   // 왼위
  out[2] = cx + ux - vx; out[3] = cy + uy - vy;   // 오른위
  out[4] = cx + ux + vx; out[5] = cy + uy + vy;   // 오른아래
  out[6] = cx - ux + vx; out[7] = cy - uy + vy;   // 왼아래
  // 시트 칸
  let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
  const a = e.sheet;
  if (a) {
    const F = a.row ? a.tx : a.tx * a.ty;
    let f;
    if (a.fps) f = Math.floor(p.age * a.fps);
    else if (a.fk) f = Math.floor(keyAt(a.fk, ((t * (a.cyc || 1)) % 1)) * F);
    else f = p.f0;
    f = ((f + p.sf) % F + F) % F;
    const col = f % a.tx, row = a.row ? p.row : Math.floor(f / a.tx);
    u0 = col / a.tx; u1 = (col + 1) / a.tx; v0 = row / a.ty; v1 = (row + 1) / a.ty;
  }
  if (p.fu) { const x = u0; u0 = u1; u1 = x; }
  out[8] = u0; out[9] = v0; out[10] = u1; out[11] = v1;
  // 색
  colAt(e.colOL, t, C);
  out[12] = p.c[0] * C[0]; out[13] = p.c[1] * C[1]; out[14] = p.c[2] * C[2];
  out[15] = Math.max(0, Math.min(1, p.c[3] * keyAt(e.alphaOL, t) * run.fade));
}

const Q = new Float32Array(16);
function drawGL(s) {
  const gl = s.gl;
  gl.viewport(0, 0, s.cv.width, s.cv.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(s.uRes, s.w, s.h);
  const V = s.verts;
  let n = 0, cur = null;
  const flush = () => { if (!n) return; gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, n * FLOATS), gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, n); n = 0; };
  for (const run of s.runs) {
    const [ox, oy] = runOrigin(s, run);
    if (run.sheet) {
      const b = run.sheet.b, F = bakedFrame(run);
      if (F.a <= 0.003) continue;
      const im = run.sheet.pages[F.p], tex = glTex(s, "baked:" + b.pages[F.p].file, im);
      if (tex !== cur) { flush(); gl.bindTexture(gl.TEXTURE_2D, tex); cur = tex; }
      if (n + 12 > CAP * 6) flush();
      const q = run.k / b.ppu, Y0 = oy - (b.anchor[1] + run.dy * b.ppu) * q, Y1 = Y0 + b.h * q;
      const v0 = F.sy / im.height, v1 = (F.sy + b.h) / im.height;
      for (const [x0, x1, X0, X1] of bakedSpans(run, ox)) {
        const u0 = (F.sx + x0) / im.width, u1 = (F.sx + x1) / im.width;
        // 칸 가장자리 걷기(l)는 안 쓴다 — 0.5 에 두면 그대로
        for (const [X, Y, u, v] of [[X0, Y0, u0, v0], [X1, Y0, u1, v0], [X1, Y1, u1, v1], [X0, Y0, u0, v0], [X1, Y1, u1, v1], [X0, Y1, u0, v1]]) {
          const o = n * FLOATS;
          V[o] = X; V[o + 1] = Y; V[o + 2] = u; V[o + 3] = v; V[o + 4] = 0.5; V[o + 5] = 0.5;
          V[o + 6] = 1; V[o + 7] = 1; V[o + 8] = 1; V[o + 9] = F.a; V[o + 10] = 0;
          n++;
        }
      }
      continue;
    }
    for (const em of run.ems) {
      if (!em.img || !em.parts || !em.parts.length) continue;
      const tex = glTex(s, em.path, em.img);
      if (tex !== cur) { flush(); gl.bindTexture(gl.TEXTURE_2D, tex); cur = tex; }
      const add = em.e.add ? 1 : 0;
      for (const p of em.parts) {
        if (n + 6 > CAP * 6) flush();
        quad(run, ox, oy, em.e, p, Q);
        if (Q[15] <= 0.003) continue;
        for (const [xi, yi, u, v, lx, ly] of [[0, 1, Q[8], Q[9], 0, 0], [2, 3, Q[10], Q[9], 1, 0], [4, 5, Q[10], Q[11], 1, 1], [0, 1, Q[8], Q[9], 0, 0], [4, 5, Q[10], Q[11], 1, 1], [6, 7, Q[8], Q[11], 0, 1]]) {
          const o = n * FLOATS;
          V[o] = Q[xi]; V[o + 1] = Q[yi]; V[o + 2] = u; V[o + 3] = v; V[o + 4] = lx; V[o + 5] = ly;
          V[o + 6] = Q[12]; V[o + 7] = Q[13]; V[o + 8] = Q[14]; V[o + 9] = Q[15]; V[o + 10] = add;
          n++;
        }
      }
    }
  }
  flush();
}

function draw2D(s) {
  const g = s.g2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, s.cv.width, s.cv.height);
  for (const run of s.runs) {
    const [ox, oy] = runOrigin(s, run);
    if (run.sheet) {
      const b = run.sheet.b, F = bakedFrame(run);
      if (F.a <= 0.003) continue;
      const im = run.sheet.pages[F.p], q = run.k / b.ppu, d = s.dpr, Y0 = oy - (b.anchor[1] + run.dy * b.ppu) * q;
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = F.a;
      for (const [x0, x1, X0, X1] of bakedSpans(run, ox)) {
        g.setTransform(d * (X1 - X0) / (x1 - x0), 0, 0, d * q, d * X0, d * Y0);
        g.drawImage(im, F.sx + x0, F.sy, x1 - x0, b.h, 0, 0, x1 - x0, b.h);
      }
      continue;
    }
    for (const em of run.ems) {
      if (!em.img || !em.parts || !em.parts.length) continue;
      const im = tintImg(em.img, em.path, [em.e.tint[0] * em.e.col[0][0], em.e.tint[1] * em.e.col[0][1], em.e.tint[2] * em.e.col[0][2]], em.e.add, em.e.sheet);
      g.globalCompositeOperation = em.e.add ? "lighter" : "source-over";
      for (const p of em.parts) {
        quad(run, ox, oy, em.e, p, Q);
        if (Q[15] <= 0.003) continue;
        // 네 꼭짓점 → 아핀 (단위 사각형이 왼위·오른위·왼아래로)
        const d = s.dpr;
        g.setTransform((Q[2] - Q[0]) * d, (Q[3] - Q[1]) * d, (Q[6] - Q[0]) * d, (Q[7] - Q[1]) * d, Q[0] * d, Q[1] * d);
        g.globalAlpha = Q[15];
        const W = im.width, H = im.height;
        g.drawImage(im, Q[8] * W, Q[9] * H, (Q[10] - Q[8]) * W, (Q[11] - Q[9]) * H, 0, 0, 1, 1);
      }
    }
  }
  g.globalAlpha = 1;
}

function runOrigin(s, run) {
  const sx = run.flip * run.dx * run.k;
  // 본을 따라간다 — 못 찾으면(그림이 다시 그려지는 사이) 마지막 자리 그대로
  if (run.track) { const p = run.track(); if (p) { run.ox = p.x; run.oy = p.y; } }
  if (!run.move) return local(s, run.ox + sx, run.oy);
  const m = run.move, f = Math.min(1, run.t / (m.dur || 0.35));
  const e = f * f * (3 - 2 * f);
  return local(s, m.from.x + (m.to.x - m.from.x) * e + sx, m.from.y + (m.to.y - m.from.y) * e);
}

function tick(s, now) {
  const dt = Math.min(MAX_DT, Math.max(0, (now - (s.last || now)) / 1000));
  s.last = now;
  attach(s);
  for (const run of s.runs) {
    run.fade = Math.max(0, Math.min(1, (run.until - run.t) / FADE));
    if (step(run, dt) && run.t < run.fx.dur + 1.5 && run.t < run.until) continue;
    for (const em of run.ems) { live -= em.parts.length; em.parts.length = 0; }
    run.dead = true;
    run.done();
  }
  s.runs = s.runs.filter((r) => !r.dead);
  if (s.gl) drawGL(s); else draw2D(s);
  if (s.runs.length) s.raf = requestAnimationFrame((t) => tick(s, t));
  else { s.raf = 0; s.last = 0; s.cv.remove(); }
}

export async function playFx(name, o = {}) {
  if (o.calm || calmNow() || typeof document !== "object") return false;
  await loadFx();
  const sh = await bakedSheet(name);
  const fx = sh ? null : await getFx(name);
  if (!sh && !fx) return false;
  const s = stageFor(o.container);
  if (!s.gl && !s.g2) return false;
  attach(s);
  const run = sh ? makeBakedRun(sh, o, s) : makeRun(fx, o);
  for (const em of run.ems) em.img = await image(em.path);
  return new Promise((res) => {
    run.done = () => res(true);
    s.runs.push(run);
    if (!s.raf) { attach(s); s.raf = requestAnimationFrame((t) => tick(s, t)); }
  });
}

// ── 궁극기 한 벌 — 이름 낱말로 자리와 차례를 가른다 ──
// 앞(준비·시전·충전)은 바로, 본(폭발·타격·바닥…)은 조금 뒤. 시전자 쪽 낱말이 없으면 대상 쪽에 둔다.
// 투사체는 시전자에서 대상으로 날아가고, 레이저는 시전자에서 대상 쪽을 보고 뻗는다.
const AT_CASTER = /(ready|cast|charge|start|aura|buff|player|meditation|book|energy|craft|happy|spawn|muzzle|rise|summon|wing|shield|heal|barrier|roar|breath|clap|personal)/;
const AT_TARGET = /(explosion|hit|ground|crash|impact|rain|thunder|stomp|meteor|slash|attack|bomb|burst|boom|crack|wave|field|area|decal|target|fall|strike|drop|lightning|fire|ice|smoke|trace)/;
const PRE = /(ready|cast|charge|start|meditation|aura)/;
// 물결(wave)도 원작은 스크립트로 싸움터를 가로질러 옮긴다(뿌리 뒤로 수십 단위 꼬리가 짜여 있다) — 투사체처럼 날린다
const PROJ = /(proj|projectile|bullet|missile|shot|arrow|throw|(^|_)wave(_|$))/;
const BEAM = /(laser|lazer|beam|ray\b|line)/;
// 시전자 쪽에서 총구(무기 끝)에 붙는 것 — 모으기 · 쏘기 · 레이저. 마법진(cast) · 기운(aura)은 발밑 그대로
const MUZZLE = /(charge|muzzle|shot|fire|laser|lazer|beam|ray\b)/;

const MAX_ULT = 8;

// pick = { i, n } — SD 고학년이 갈래 n 개 중 i 번째(앨리스 불 · 번개 · 바람, 에피카 싸움터 · 사막 · 바다)면
// 이펙트도 그 갈래만. 갈래는 이름 첫 낱말 — 셋 이상 든 낱말이 꼭 n 개면 그것, 아니면 낱말이 모두 n 개일 때. 이름 차례로 맞춘다
export function ultPlan(heroKey, pick) {
  if (!hasUltFx(heroKey)) return [];
  const word = (name) => name.replace(/^fx_[a-z0-9]+_(ultimate_|ult_|skill_?|personal_?)?/, "");
  let names = index.heroes[heroKey].ult;
  if (pick && pick.n > 1) {
    const cnt = new Map();
    for (const x of names) { const k = word(x).split("_")[0]; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const big = [...cnt.keys()].filter((k) => cnt.get(k) >= 3);
    const ways = big.length === pick.n ? big : cnt.size === pick.n ? [...cnt.keys()] : null;
    if (ways) names = names.filter((x) => word(x).split("_")[0] === ways[pick.i % pick.n]);
  }
  // 궁극기가 여러 갈래(에피카의 battlefield · desert …)면 가장 큰 갈래 하나만 — 다 틀면 화면이 엉킨다
  if (names.length > MAX_ULT) {
    const n = {};
    for (const x of names) { const k = word(x).split("_")[0]; n[k] = (n[k] || 0) + 1; }
    const [top, cnt] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    if (cnt >= 3) names = names.filter((x) => word(x).split("_")[0] === top);
    names = names.slice(0, MAX_ULT);
  }
  return names.map((name) => {
    const w = word(name);
    const proj = PROJ.test(w), beam = !proj && BEAM.test(w);
    const at = proj ? "move" : beam ? "caster" : AT_TARGET.test(w) && !/(cast|charge)/.test(w) ? "target" : AT_CASTER.test(w) ? "caster" : "target";
    const pre = !proj && PRE.test(w);
    // again — 여러 번 때리는 창 동안 다시 트는 것(레이저 · 타격 · 베기). 원작은 SD 이벤트마다 다시 튼다(아멜리아 레이저 0.2초마다)
    const again = !pre && (beam || /(hit|slash|stab)/.test(w));
    return { name, at, pre, again, muzzle: at === "caster" && MUZZLE.test(w), dur: (index.effects[name] || {}).dur || 1 };
  });
}

// 본 이펙트(폭발 · 타격)가 터지기까지 몇 ms — playUltFx 의 기다림과 같은 셈. 화면이 타격(숫자 · 체력)을 여기에 맞춘다.
// 아직 안 읽었거나 이펙트가 없으면 0
// 투사체가 있으면 쏘고 나서 대상에 닿기까지(ms) — 쏘는 순간을 아는 쪽(SD 이벤트)이 타격을 이만큼 늦춘다
export function ultLagMs(heroKey, pick) {
  return ultPlan(heroKey, pick).some((p) => p.at === "move") ? 330 : 0;
}

export function ultImpactMs(heroKey) {
  if (!hasUltFx(heroKey)) return 0;
  const plan = ultPlan(heroKey);
  const pre = plan.filter((p) => p.pre);
  let t = pre.length ? 1000 * Math.min(0.6, Math.max(...pre.map((p) => p.dur)) * 0.5) : 0;
  if (plan.some((p) => p.at === "move")) t += 330;
  return Math.round(t);
}

// o.impact(ms) — SD 동작이 쏘는/때리는 순간(스파인 이벤트). 주면 준비 이펙트는 바로, 본 이펙트 · 투사체는 그때 튼다.
//   o.end(ms) 는 여러 번 때리는 창의 끝(아멜리아 레이저) — 그때까지는 걷지 않는다. 안 주면 예전처럼 이펙트 길이로 셈한다
// o.pick — ultPlan 의 갈래. o.top — 이펙트가 넘지 않을 위끝(뷰포트 y)
// o.muzzle() — 시전자의 총구(화면 좌표, 없으면 null). 주면 총구 쪽 이펙트(MUZZLE)가 거기 붙어 따라간다
// o.dash — 시전자가 달려가 부딪친다(에르핀). to 가 부딪치는 자리 — 대상 쪽 이펙트를 가운데로 옮기지 않고(흙먼지 꼬리가 달려온 길에 남게)
//   대상 쪽 준비 이펙트도 부딪치기 조금 전에 튼다
export async function playUltFx(heroKey, o = {}) {
  if (o.calm || calmNow() || !(await loadFx()) || !hasUltFx(heroKey)) return false;
  const from = o.from || o.to, to = o.to || o.from;
  if (!from) return false;
  const t0 = performance.now();
  await preloadUltFx(heroKey);
  const plan = ultPlan(heroKey, o.pick);
  const flip = to.x < from.x;
  const base = { container: o.container, scale: o.scale, calm: false, top: o.top };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sync = o.impact != null, lag = plan.some((p) => p.at === "move") ? 330 : 0;
  // 한 벌은 타격 뒤 1.2초(모두 합쳐 적어도 1.6초)면 걷힌다 — 원작 루프 · 긴 잔불이 다음 수까지 남지 않게
  const end = sync ? Math.max(1.6, (Math.max(o.impact, o.end || 0) + lag) / 1000 + 0.9)
    : Math.max(1.6, ultImpactMs(heroKey) / 1000 + 1.2);
  const left = () => Math.max(FADE, end - (performance.now() - t0) / 1000);
  // 같은 차례 안에서 _1 · _2 … 는 조금씩 어긋나게
  const fire = (list, gap) => Promise.all(list.map((p, i) => wait(i * gap).then(() => {
    if (p.at === "move") return playFx(p.name, { ...base, x: from.x, y: from.y, flip, move: { from, to, dur: 0.35 }, until: left() });
    const m = p.muzzle && o.muzzle ? o.muzzle() : null;
    if (m) return playFx(p.name, { ...base, x: m.x, y: m.y, flip, until: left(), track: o.muzzle, bare: true });
    const pt = p.at === "caster" ? from : to;
    return playFx(p.name, { ...base, x: pt.x, y: pt.y, flip, until: left(), center: p.at === "target" && !o.dash });
  })));
  const pre = plan.filter((p) => p.pre), main = plan.filter((p) => !p.pre && p.at !== "move"), proj = plan.filter((p) => p.at === "move");
  const pending = [];
  if (sync) {
    // 그림을 받느라 늦은 만큼은 빼고 기다린다 — SD 동작은 이미 돌고 있다
    const until = (ms) => wait(Math.max(0, ms - (performance.now() - t0)));
    if (o.dash) {
      pending.push(fire(pre.filter((p) => p.at === "caster"), 60));
      const near = pre.filter((p) => p.at !== "caster");
      if (near.length) pending.push(until(Math.max(0, o.impact - 250)).then(() => fire(near, 60)));
    } else if (pre.length) pending.push(fire(pre, 60));
    await until(o.impact);
    if (proj.length) pending.push(fire(proj, 80));
    pending.push(fire(main.filter((p) => p.at === "caster"), 60));
    await until(o.impact + lag);
    pending.push(fire(main.filter((p) => p.at === "target"), 90));
    // 때리는 창(o.marks — SD 이벤트 시각)이 길면 레이저 · 타격을 그 시각에 다시 튼다. 한 번 튼 것이 걷힐 즈음마다
    const again = main.filter((p) => p.again), marks = o.marks || [];
    if (again.length && o.end > o.impact) {
      const gap = Math.max(500, 800 * Math.max(...again.map((p) => p.dur)));
      let next = o.impact + gap;
      for (const m of marks) {
        if (m < next || m > o.end) continue;
        await until(m + (again.some((p) => p.at === "target") ? lag : 0));
        pending.push(fire(again, 60));
        next = m + gap;
      }
    }
    await Promise.all(pending);
    return true;
  }
  if (pre.length) {
    pending.push(fire(pre, 60));
    await wait(1000 * Math.min(0.6, Math.max(...pre.map((p) => p.dur)) * 0.5));
  }
  if (proj.length) {
    pending.push(fire(proj, 80));
    await wait(330);
  }
  // 시전자 쪽 본 이펙트 먼저, 대상 쪽은 그 뒤를 바로 잇는다
  pending.push(fire(main.filter((p) => p.at === "caster"), 60));
  pending.push(fire(main.filter((p) => p.at === "target"), 90));
  await Promise.all(pending);
  return true;
}
