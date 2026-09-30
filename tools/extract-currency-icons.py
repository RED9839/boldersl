# -*- coding: utf-8 -*-
"""재화 아이콘(골드 따위)을 꺼낸다.

게임 화면의 골드는 「✦」 글자였다. 원작에는 재화마다 아이콘이 있고, 묶음 아틀라스
atlases/currencyicons 에 들어 있다. 이름을 미리 모르니 **통째로** 이름 그대로 꺼내고 이름 목록을 함께 적는다.

  python tools/extract-currency-icons.py [--out assets] [--adb <adb.exe>] [--serial 127.0.0.1:16384]
  → assets/currency/<스프라이트 이름>.png · assets/currency/manifest.json(이름 → 파일 · 크기)

앱플레이어 저장소의 표준 Unity 번들을 adb 로 복사해 UnityPy 로 읽는다(extract-ui-icons.py 와 같은 길).
게임 서버와 통신하지 않고, 보호장치를 건드리지 않는다. 꺼낸 그림은 개인 사용 목적이고 저장소에 넣지 않는다(assets/ 는 gitignore).

필요: UnityPy, Pillow
"""
import argparse, json, os, re, subprocess, sys, tempfile

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages"
BUNDLE = "atlases/currencyicons"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"          # 깃배시가 /sdcard/... 를 윈도우 경로로 바꿔 버린다
ENV.pop("ELECTRON_RUN_AS_NODE", None)
ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]


def log(m): print(m, flush=True)

def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)

def find_device(exe, serial):
    for dev in ([serial] if serial else []) + PORTS:
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}/{BUNDLE}", timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return dev
    return None

def safe(name):
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip() or "unnamed"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets")
    ap.add_argument("--adb")
    ap.add_argument("--serial")
    ap.add_argument("--bundle", help="adb 대신 이미 받아 둔 번들 파일")
    a = ap.parse_args()
    try:
        import UnityPy
        from PIL import Image
    except ImportError as e:
        sys.exit(f"{e.name} 가 필요합니다: pip install UnityPy Pillow")

    local = a.bundle
    if not local:
        exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
        if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
        dev = find_device(exe, a.serial)
        if not dev: sys.exit("앱플레이어를 못 찾았습니다. MuMu 를 켜고 게임을 한 번 실행하세요.")
        log(f"기기 {dev}")
        tmp = os.path.join(tempfile.gettempdir(), "trickcal-currency")
        os.makedirs(tmp, exist_ok=True)
        local = os.path.join(tmp, "currencyicons")
        if not os.path.exists(local):
            p = adb(exe, dev, "pull", f"{BASE}/{BUNDLE}", local, timeout=900)
            if p.returncode != 0: sys.exit("adb pull 실패: " + p.stderr.decode("utf-8", "replace")[:200])
    log(f"번들 {os.path.getsize(local) // 1024}KB")

    env = UnityPy.load(local)
    out = os.path.join(a.out, "currency")
    os.makedirs(out, exist_ok=True)
    made = {}

    atlas = next((o.read() for o in env.objects if o.type.name == "SpriteAtlas"), None)
    if atlas is not None:
        # 묶음 아틀라스 — 이름표와 자리(rect)를 짝지어 자른다(extract-ui-icons.py 와 같은 셈)
        names = list(atlas.m_PackedSpriteNamesToIndex)
        rdm = atlas.m_RenderDataMap
        if len(names) != len(rdm): sys.exit(f"이름 {len(names)}개와 자리 {len(rdm)}개가 안 맞습니다.")
        tex = {o.path_id: o.read().image for o in env.objects if o.type.name == "Texture2D"}
        log(f"아틀라스 '{atlas.m_Name}' 스프라이트 {len(names)}개")
        for i, name in enumerate(names):
            (_, d) = rdm[i]
            im = tex.get(d.texture.m_PathID)
            if im is None: continue
            r = d.textureRect
            x, y, w, h = int(r.x), int(r.y), int(round(r.width)), int(round(r.height))
            piece = im.crop((x, im.height - y - h, x + w, im.height - y))   # 유니티는 왼쪽 아래가 0
            rot = (d.settingsRaw >> 2) & 0xF
            if rot == 1: piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
            elif rot == 2: piece = piece.transpose(Image.FLIP_TOP_BOTTOM)
            elif rot == 3: piece = piece.transpose(Image.ROTATE_180)
            elif rot == 4: piece = piece.transpose(Image.ROTATE_90)
            f = safe(name) + ".png"
            piece.save(os.path.join(out, f))
            made[name] = {"file": f"assets/currency/{f}", "size": list(piece.size)}
    else:
        # 낱장 스프라이트 · 텍스처
        for o in env.objects:
            if o.type.name not in ("Sprite", "Texture2D"): continue
            try:
                t = o.read(); name = t.m_Name
                if name in made: continue
                f = safe(name) + ".png"
                t.image.save(os.path.join(out, f))
                made[name] = {"file": f"assets/currency/{f}", "size": list(t.image.size)}
            except Exception as e:
                log(f"  ! {o.type.name} 읽기 실패: {e}")

    man = {"_meta": {"source": f"{BUNDLE} 에서 이름 그대로 꺼냈다.", "tool": "tools/extract-currency-icons.py"}, "icons": made}
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(man, fh, ensure_ascii=False, indent=1)
    log(f"아이콘 {len(made)}장 → {out}/")
    for n, m in sorted(made.items()): log(f"  {n:<40} {m['size'][0]}×{m['size'][1]}")


if __name__ == "__main__":
    main()
