# -*- coding: utf-8 -*-
"""사도가 아닌 인물의 스탠딩 스파인을 그림 한 장으로 굽는다 — 지금은 겨우살이(원작 폴더 noone) 하나.

스파인은 WebGL 컨텍스트를 하나씩 먹어서, 축복 목록처럼 작은 얼굴이 여러 번 나오는 자리에는 못 쓴다.
그래서 쉬는 동작(Idle_1)의 첫 장면을 진짜 브라우저로 한 번 그려 PNG 로 남긴다.

  python tools/bake-npc.py          (npm run npc) assets/sd/npc/noone.png(전신) · noone_face.png(얼굴)

먼저: node tools/build-spine.js (assets/spine/standing/noone 이 있어야 한다) · 서버(npm run serve)
필요: selenium, 크롬. assets/ 는 저장소에 안 들어간다 — 각자 제 기기에서 꺼내 굽는다.
"""
import argparse, base64, os, sys, time, urllib.request

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
NPCS = ["noone"]

# 브라우저 안에서 — 뼈대를 쉬는 자세로 세우고, 보이는 것 전체와 머리 둘레를 각각 캔버스에 그려 dataURL 로 돌려준다
JS = r"""
const [key, done] = arguments;
(async () => {
  const sp = window.spine;
  const man = await (await fetch(location.origin + "/assets/spine/manifest.json", { cache: "no-store" })).json();
  const set = man.standing[key];
  if (!set) return done({ err: "manifest 에 " + key + " 이 없다 — node tools/build-spine.js" });
  const dir = location.origin + "/assets/spine/standing/" + key;
  const draw = async (W, H, frame) => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = new sp.ManagedWebGLRenderingContext(c, { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    const atlas = new sp.TextureAtlas(await (await fetch(dir + "/" + set.atlas)).text());
    for (const p of atlas.pages) {
      const img = new Image(); await new Promise((r) => { img.onload = r; img.src = dir + "/" + p.name; });
      p.setTexture(new sp.GLTexture(ctx, img));
    }
    const bin = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas));
    const data = bin.readSkeletonData(new Uint8Array(await (await fetch(dir + "/" + set.skel)).arrayBuffer()));
    const sk = new sp.Skeleton(data);
    const st = new sp.AnimationState(new sp.AnimationStateData(data));
    const idle = data.animations.find((a) => a.name === "Idle_1") || data.animations.find((a) => /^Idle/i.test(a.name));
    if (idle) st.setAnimation(0, idle.name, true);
    st.update(0); st.apply(sk); sk.updateWorldTransform();
    const off = new sp.Vector2(), size = new sp.Vector2(); sk.getBounds(off, size, []);
    const head = sk.bones.find((b) => /^head$/i.test(b.data.name)) || sk.bones.find((b) => /head/i.test(b.data.name));
    const box = frame(off, size, head);
    const r = new sp.SceneRenderer(c, ctx, true);
    r.camera.viewportWidth = W; r.camera.viewportHeight = H;
    r.camera.position.x = box.x + box.w / 2; r.camera.position.y = box.y + box.h / 2;
    r.camera.zoom = Math.max(box.w / W, box.h / H);
    ctx.gl.clearColor(0, 0, 0, 0); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    r.begin(); r.drawSkeleton(sk, true); r.end();
    const url = c.toDataURL("image/png");
    const lose = ctx.gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    return { url, head: head ? head.data.name : null };
  };
  // 전신 — 보이는 것 전체, 세로 1024
  const full = await draw(768, 1024, (o, s) => {
    const k = Math.max(s.x / 768, s.y / 1024) * 1.02;
    return { x: o.x + s.x / 2 - 384 * k, y: o.y, w: 768 * k, h: 1024 * k };
  });
  // 얼굴 — 머리 뼈 둘레(없으면 위쪽 4할), 정사각 256. 키 높이의 0.36 을 한 변으로(머리 뼈는 목에 있어 조금 위로 올린다)
  const face = await draw(256, 256, (o, s, head) => {
    const side = s.y * 0.36;
    const cx = head ? head.worldX - side * 0.06 : o.x + s.x / 2;
    const cy = head ? head.worldY + side * 0.3 : o.y + s.y - side / 2;
    return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
  });
  done({ full: full.url, face: face.url, head: face.head });
})().catch((e) => done({ err: String(e) }));
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    base = f"http://127.0.0.1:{a.port}"
    try: urllib.request.urlopen(base, timeout=3)
    except Exception: sys.exit(f"{base} 가 안 뜹니다. 먼저 서버를 켜세요: npm run serve")
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    o = Options()
    for f in ("--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=800,600"):
        o.add_argument(f)
    d = webdriver.Chrome(options=o)
    out = os.path.join(ROOT, "assets", "sd", "npc")
    os.makedirs(out, exist_ok=True)
    try:
        d.set_script_timeout(60)
        d.get(base + "/vendor/")   # 게임을 띄우지 않고 같은 출처(서버의 폴더 목록 쪽)에서 런타임만 싣는다
        d.execute_script("const s=document.createElement('script');s.src='/vendor/spine-webgl.min.js';document.head.appendChild(s);")
        for _ in range(40):
            if d.execute_script("return !!window.spine"): break
            time.sleep(0.25)
        for key in NPCS:
            r = d.execute_async_script(JS, key)
            if r.get("err"): print(f"  ! {key} — {r['err']}"); continue
            for name, url in ((f"{key}.png", r["full"]), (f"{key}_face.png", r["face"])):
                with open(os.path.join(out, name), "wb") as fh: fh.write(base64.b64decode(url.split(",", 1)[1]))
            # 전신은 위아래 빈 몫을 잘라 낸다(보이지 않는 부품까지 잰 테두리라 머리 위가 비었다) — 발이 그림 바닥에 오게
            try:
                from PIL import Image
                fp = os.path.join(out, f"{key}.png")
                im = Image.open(fp); bb = im.getbbox()
                if bb: im.crop(bb).save(fp)
            except ImportError: pass
            print(f"  {key} — 전신 · 얼굴(머리 뼈 {r['head'] or '없음 — 위쪽 4할'}) → assets/sd/npc/")
    finally:
        d.quit()


if __name__ == "__main__":
    main()
