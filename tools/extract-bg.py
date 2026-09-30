# -*- coding: utf-8 -*-
"""전투 배경 추출기 — background/stage 의 층 조각을 꺼내 16:9 한 장으로 겹쳐 둔다.

게임 배경은 한 장이 아니라 층(하늘·먼 숲·나무·바닥·앞 풀)이 따로 흐르는 조각이다.
조각은 background/atlases/bg_stageN_1(아틀라스 텍스처)에, 어느 조각이 어디인지는
background/stage/bg_stageN_1/bg_stageN_1_k(스프라이트, k 가 작을수록 뒤)에 있다.
놓는 자리(프리팹)는 따로라, 여기서는 바닥 층의 지평선에 뒤 층들의 발을 맞춰 세운다.

  python tools/extract-bg.py                        모든 스테이지 → assets/bg/
  python tools/extract-bg.py --only stage3_1,stage1_1

adb 로 복사해 UnityPy 로 읽기만 한다. 꺼낸 것은 개인 사용 목적이고 저장소에 넣지 않는다.
필요: adb (앱플레이어 것), UnityPy, Pillow
"""
import argparse, os, re, shutil, subprocess, sys, tempfile
from PIL import Image

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages/background"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"
ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]
W, H = 2048, 1152   # 16:9

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass


def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)


def find_device(exe, serial):
    for dev in ([serial] if serial else PORTS):
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}/stage | head -1", timeout=30)
        if p.returncode == 0 and p.stdout.strip(): return dev
    return None


def layers(atlas_path, sprite_dir):
    """층 조각을 뒤에서 앞 순서로. 스프라이트의 렌더 키 (GUID, id) 로 아틀라스 칸을 찾아 잘라 낸다."""
    import UnityPy
    gk = lambda g: tuple(sorted(vars(g).items())) if hasattr(g, "__dict__") else repr(g)
    tex, rd = None, {}
    for o in UnityPy.load(atlas_path).objects:
        if o.type.name == "Texture2D": tex = o.read().image
        elif o.type.name == "SpriteAtlas":
            for key, data in o.read().m_RenderDataMap: rd[(gk(key[0]), key[1])] = data
    out = []
    for f in sorted(os.listdir(sprite_dir), key=lambda n: int(re.findall(r"\d+$", n)[0]) if re.findall(r"\d+$", n) else 0):
        for o in UnityPy.load(os.path.join(sprite_dir, f)).objects:
            if o.type.name != "Sprite": continue
            s = o.read()
            data = rd.get((gk(s.m_RenderDataKey[0]), s.m_RenderDataKey[1]))
            if data is None: continue
            r = data.textureRect
            out.append(tex.crop((int(r.x), int(tex.height - r.y - r.height), int(r.x + r.width), int(tex.height - r.y))).convert("RGBA"))
    return out


def horizon(im):
    """바닥 층에서 땅이 시작하는 줄 — 위에서부터 한 줄이 거의 다 찬 첫 줄."""
    a = im.getchannel("A")
    w, h = im.size
    for y in range(h):
        row = a.crop((0, y, w, y + 1)).histogram()
        if sum(row[200:]) > w * 0.92: return y
    return h // 3


def compose(ls):
    """가장 큰 조각이 바닥이다. 바닥은 아래에 붙이고, 그보다 뒤 층은 지평선에 발을 맞춰 가로를 채운다.
    바닥보다 앞 층(풀잎)은 화면 아래에 붙인다."""
    if not ls: return None
    gi = max(range(len(ls)), key=lambda i: ls[i].size[0] * ls[i].size[1])
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    fit = lambda im: im.resize((W, max(1, round(im.height * W / im.width))), Image.LANCZOS)
    ground = fit(ls[gi])
    gy = H - ground.height
    hz = gy + horizon(ground)
    back = [fit(im) for im in ls[:gi]]
    # 맨 뒤 층의 윗줄 빛깔로 하늘을 먼저 칠한다 — 층이 화면 꼭대기까지 안 닿아도 검은 띠가 안 남게
    if back:
        top = back[0].crop((0, 0, W, 4)).convert("RGB").resize((1, 1), Image.BOX).getpixel((0, 0))
        canvas.paste(top + (255,), (0, 0, W, H))
    for i, im in enumerate(back):
        # 뒤 층일수록 지평선보다 조금 위에 발을 둔다(먼 것은 높이 보인다)
        lift = (len(back) - i - 1) * 18
        y = hz - im.height + 40 - lift
        if i == 0: y = min(y, 0) if im.height >= hz else y
        canvas.alpha_composite(im, (0, max(-im.height + 1, y)))
    canvas.alpha_composite(ground, (0, gy))
    for im in ls[gi + 1:]:
        f = fit(im)
        canvas.alpha_composite(f, (0, H - f.height))
    return canvas.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "bg"))
    ap.add_argument("--only", default="")
    ap.add_argument("--adb", default=None)
    ap.add_argument("--serial", default=None)
    a = ap.parse_args()
    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None) or shutil.which("adb")
    if not exe: sys.exit("adb 를 못 찾았습니다")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("트릭컬이 깔린 기기를 못 찾았습니다. 앱플레이어를 켜 두세요")

    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="bolder-bg-")
    try:
        for sub in ("stage", "atlases"):
            p = adb(exe, dev, "pull", f"{BASE}/{sub}", tmp, timeout=1800)
            if p.returncode != 0: sys.exit(f"복사 실패: {p.stderr.decode('utf-8', 'ignore')[:300]}")
        only = {("bg_" + s.strip()).replace("bg_bg_", "bg_") for s in a.only.split(",") if s.strip()}
        names = sorted(n for n in os.listdir(os.path.join(tmp, "stage")) if not only or n in only)
        good = 0
        for n in names:
            atlas = os.path.join(tmp, "atlases", n)
            if not os.path.exists(atlas): print(f"  ! {n} — 아틀라스 없음"); continue
            try:
                img = compose(layers(atlas, os.path.join(tmp, "stage", n)))
                if img is None: print(f"  ! {n} — 조각 없음"); continue
                img.save(os.path.join(a.out, n.replace("bg_", "") + ".jpg"), quality=90)
                good += 1
            except Exception as e:
                print(f"  ! {n} — {e}")
        print(f"배경 {good}/{len(names)} → {a.out}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
