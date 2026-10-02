# -*- coding: utf-8 -*-
"""적 아이콘이 싸움터의 모습과 같게 — 맞는 아이콘이 없는 적은 전투 스파인을 그대로 한 장 찍어 둔다.

게임의 몬스터 아이콘(assets/monster/icon_<이름><성격>.png)은 성격마다 한 벌이지만 다 있지는 않다.
저주 인형은 종족마다 한 장뿐(성격 없음)이고, 엘프 병사는 순수 한 장, 누루링은 아예 없다 — 그래서 아이콘을
아무거나 집으면 싸움터에서 입는 성격 스킨 · 종족 스킨과 색이 달랐다.
이 도구는 그런 적만 골라, 싸움터와 같은 스파인 · 같은 스킨(enemies.js foeLook)으로 쉬는 자세 한 장을 찍어
assets/monster/still_<그림>_<스킨>.png 로 둔다. tools/build-art.js 가 아이콘이 없으면 이것을 쓴다.

  python tools/build-foe-stills.py          맞는 아이콘이 없는 적만(없는 것만 새로)
  python tools/build-foe-stills.py --all    모두 다시

먼저 서버가 떠 있어야 한다: npm run serve. 필요: selenium, 크롬, Pillow
"""
import argparse, base64, io, json, os, sys, time, urllib.request

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MON = os.path.join(ROOT, "assets", "monster")
SIZE = 202                                  # 게임 아이콘과 같은 크기

# 어느 적을 찍을지 — 아이콘이 맞으면 안 찍는다(tools/build-art.js 와 같은 규칙)
PLAN = """
const [done] = arguments;
(async () => {
  const { ENEMIES, foeLook } = await import('/js/data/enemies.js');
  const out = [];
  for (const k of Object.keys(ENEMIES)) { const l = foeLook(k); out.push({ key: k, art: l.art, skin: l.skin }); }
  done(JSON.stringify(out));
})().catch((e) => done('err ' + e));
"""
# 한 장 찍기 — 큰 칸에 꽉 맞춰 그리고, 그린 프레임에서 바로 읽는다(WebGL 은 프레임이 지나면 버퍼를 비운다)
SNAP = """
const [art, skin, done] = arguments;
(async () => {
  const SV = await import('/js/spine-view.js');
  await SV.loadSpineManifest();
  if (!SV.hasSpine('enemy', art)) return done('nospine');
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '720px', height: '720px', zIndex: 99999, background: 'transparent' });
  document.body.appendChild(box);
  const v = await SV.spineView(box, 'enemy', art, { skin: skin || undefined });
  if (!v) { box.remove(); return done('noview'); }
  const c = box.querySelector('canvas');
  let n = 0;
  const grab = () => {
    if (++n < 12) return requestAnimationFrame(grab);
    const url = c.toDataURL('image/png');
    v.dispose(); box.remove();
    done(url);
  };
  requestAnimationFrame(grab);
})().catch((e) => done('err ' + e));
"""


def crop_square(png):
    from PIL import Image
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    bb = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bb: return None
    im = im.crop(bb)
    w, h = im.size
    s = max(w, h)
    pad = round(s * 0.04)
    sq = Image.new("RGBA", (s + pad * 2, s + pad * 2), (0, 0, 0, 0))
    sq.alpha_composite(im, ((s - w) // 2 + pad, s - h + pad))        # 발을 아래에 붙인다(아이콘처럼)
    return sq.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        sys.exit("selenium 이 필요합니다: pip install selenium")
    base = f"http://127.0.0.1:{a.port}"
    try: urllib.request.urlopen(base, timeout=3)
    except Exception: sys.exit(f"{base} 가 안 뜹니다. 먼저 서버를 켜세요: npm run serve")

    o = Options()
    for f in ("--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
              "--hide-scrollbars", "--window-size=900,900", "--force-device-scale-factor=1"):
        o.add_argument(f)
    d = webdriver.Chrome(options=o)
    d.set_script_timeout(90)
    made = skipped = 0
    try:
        d.get(base + "/"); time.sleep(1.5)
        plan = json.loads(d.execute_async_script(PLAN))
        have = set(os.listdir(MON)) if os.path.isdir(MON) else set()
        seen = set()
        for p in plan:
            tail = (p["skin"] or "").replace("Skin_", "").lower()
            if f"icon_{p['art']}{tail}.png" in have and not a.all: continue      # 맞는 아이콘이 있다
            name = f"still_{p['art']}_{tail or 'default'}.png"
            if name in seen: continue
            seen.add(name)
            if name in have and not a.all: skipped += 1; continue
            url = d.execute_async_script(SNAP, p["art"], p["skin"])
            if not url.startswith("data:image/png"):
                print(f"  못 찍음 {p['key']} ({p['art']} {p['skin']}): {url}"); continue
            sq = crop_square(base64.b64decode(url.split(",", 1)[1]))
            if sq is None: print(f"  빈 그림 {p['key']} ({p['art']} {p['skin']})"); continue
            sq.save(os.path.join(MON, name))
            made += 1
            print(f"  {name}  ← {p['key']}")
    finally:
        d.quit()
    print(f"찍음 {made} · 이미 있음 {skipped} → assets/monster/still_*.png  (다음: node tools/build-art.js)")


if __name__ == "__main__":
    main()
