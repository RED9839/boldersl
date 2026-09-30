# -*- coding: utf-8 -*-
"""아티팩트 · 스펠 카드 아이콘을 꺼낸다 — 장비 · 중립 카드 그림.

원작 「차원 대충돌」의 아이콘이 묶음 아틀라스 두 개에 눌려 있다.

  atlases/artifacticons   ArtifactIcon_<번호>    → assets/gear/ArtifactIcon_<번호>.png
  atlases/spellicons      SpellCardIcon_<번호>   → assets/spell/SpellCardIcon_<번호>.png

번호와 우리 이름(장비 · 중립 카드)의 짝은 tools/gear-icons.json 이 들고 있다. 게임의 표(trickcaltables)는
암호가 걸려 있어 열지 않는다 — 짝은 나무위키 문서의 그림과 픽셀로 견줘 맞췄다(tools/gear-icons.json _meta). 그다음 node tools/build-cardart.js 가 이어 붙인다.

  python tools/extract-gear-icons.py [--out assets] [--adb <adb.exe>] [--serial 127.0.0.1:16384]

앱플레이어 저장소의 표준 Unity 번들을 adb 로 복사해 UnityPy 로 읽는다.
게임 서버와 통신하지 않고, 보호장치를 건드리지 않는다. 꺼낸 그림은 개인 사용 목적이고 저장소에 넣지 않는다.

필요: UnityPy, Pillow
"""
import argparse, os, subprocess, sys, tempfile

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"          # 깃배시가 /sdcard/... 를 윈도우 경로로 바꿔 버린다
ENV.pop("ELECTRON_RUN_AS_NODE", None)

ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]
BUNDLES = [("artifacticons", "gear", "ArtifactIcon_"), ("spellicons", "spell", "SpellCardIcon_")]


def log(m): print(m, flush=True)

def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)

def find_device(exe, serial):
    for dev in ([serial] if serial else []) + PORTS:
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}/atlases/artifacticons", timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return dev
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets")
    ap.add_argument("--adb")
    ap.add_argument("--serial")
    a = ap.parse_args()

    try:
        import UnityPy
        from PIL import Image
    except ImportError as e:
        sys.exit(f"{e.name} 가 필요합니다: pip install UnityPy Pillow")

    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
    if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("앱플레이어를 못 찾았습니다. MuMu 를 켜고 게임을 한 번 실행하세요.")
    log(f"기기 {dev}")

    tmp = os.path.join(tempfile.gettempdir(), "trickcal-gearicons")
    os.makedirs(tmp, exist_ok=True)
    for bundle, sub, prefix in BUNDLES:
        local = os.path.join(tmp, bundle)
        p = adb(exe, dev, "pull", f"{BASE}/atlases/{bundle}", local, timeout=900)
        if p.returncode != 0:
            sys.exit("adb pull 실패: " + p.stderr.decode("utf-8", "replace")[:200])

        env = UnityPy.load(local)
        atlas = next((o.read() for o in env.objects if o.type.name == "SpriteAtlas"), None)
        if atlas is None: sys.exit(f"{bundle}: SpriteAtlas 를 못 찾았습니다.")
        names = list(atlas.m_PackedSpriteNamesToIndex)
        rdm = atlas.m_RenderDataMap
        if len(names) != len(rdm):
            sys.exit(f"{bundle}: 이름 {len(names)}개와 자리 {len(rdm)}개가 안 맞습니다 — 차례로 짝지을 수 없습니다.")
        tex = {o.path_id: o.read().image for o in env.objects if o.type.name == "Texture2D"}

        out = os.path.join(a.out, sub)
        os.makedirs(out, exist_ok=True)
        n = 0
        for i, name in enumerate(names):
            if not name.startswith(prefix): continue          # 응원 카드(CheerCardIcon) 따위는 안 쓴다
            d = rdm[i][1]
            im = tex.get(d.texture.m_PathID)
            if im is None: continue
            r = d.textureRect
            x, y, w, h = int(r.x), int(r.y), int(round(r.width)), int(round(r.height))
            # 유니티 텍스처는 왼쪽 아래가 0 이다. PIL 은 왼쪽 위다.
            piece = im.crop((x, im.height - y - h, x + w, im.height - y))
            rot = (d.settingsRaw >> 2) & 0xF        # SpriteSettings: 1비트 packed · 1비트 mode · 4비트 rotation(0 없음 1 좌우 2 상하 3 180도 4 90도)
            if rot == 1: piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
            elif rot == 2: piece = piece.transpose(Image.FLIP_TOP_BOTTOM)
            elif rot == 3: piece = piece.transpose(Image.ROTATE_180)
            elif rot == 4: piece = piece.transpose(Image.ROTATE_90)
            piece.thumbnail((256, 256))
            piece.save(os.path.join(out, name + ".webp"), "WEBP", quality=88)
            n += 1
        log(f"{bundle} → {out}  {n}장")
    log("다음: node tools/build-cardart.js")


if __name__ == "__main__":
    main()
