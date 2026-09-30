# -*- coding: utf-8 -*-
"""성격·역할·열 아이콘을 꺼낸다.

도감 카드에 붙이는 작은 표들이다. 지금까지는 글자 한 자('딜'·'광')로 때웠는데,
원작에는 제대로 된 아이콘이 있다.

  성격  Common_UnitPersonality_{Naive,Mad,Cool,Gloomy,Jolly,Resonance}
  역할  Common_UnitClass_0001..0003          탱커·딜러·서포터
  위치  Common_Position{Front,Middle,Back}   전열·중열·후열

이것들은 낱장이 아니라 **묶음 아틀라스**(atlases/commonicons) 안에 눌려 있다.
2048×2048 한 장에 402개가 들어 있고, SpriteAtlas 개체가 이름표와 자리(rect)를 들고 있다.

  python tools/extract-ui-icons.py [--out assets] [--adb <adb.exe>] [--serial 127.0.0.1:16384]

앱플레이어 저장소의 표준 Unity 번들을 adb 로 복사해 UnityPy 로 읽는다.
게임 서버와 통신하지 않고, 보호장치를 건드리지 않는다. 꺼낸 그림은 개인 사용 목적이고 저장소에 넣지 않는다.

필요: UnityPy, Pillow
"""
import argparse, json, os, subprocess, sys, tempfile

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

# 아틀라스 안의 이름 → 우리가 쓸 이름. 기획서 낱말로 적는다.
WANT = {
    "Common_UnitPersonality_Naive": "성격_순수",
    "Common_UnitPersonality_Mad": "성격_광기",
    "Common_UnitPersonality_Cool": "성격_냉정",
    "Common_UnitPersonality_Gloomy": "성격_우울",
    "Common_UnitPersonality_Jolly": "성격_활발",
    "Common_UnitPersonality_Resonance": "성격_공명",
    # 0001 이 탱커인 줄 알았는데 꺼내 보니 붉은 바탕에 검과 지팡이였다 — 딜러다.
    # 0002 가 파란 방패(탱커), 0003 이 주황 십자(서포터)다. 그림을 보고 고쳤다.
    "Common_UnitClass_0001": "역할_딜러",
    "Common_UnitClass_0002": "역할_탱커",
    "Common_UnitClass_0003": "역할_서포터",
    "Common_PositionFront": "위치_전열",
    "Common_PositionMiddle": "위치_중열",
    "Common_PositionBack": "위치_후열",
    # 세력 레일에 쓴다. 기획서의 종족 여덟과 딱 맞는다.
    "Common_UnitRace_Fairy": "종족_요정",
    "Common_UnitRace_Elf": "종족_엘프",
    "Common_UnitRace_Furry": "종족_수인",
    "Common_UnitRace_Witch": "종족_마녀",
    "Common_UnitRace_Dragon": "종족_용족",
    "Common_UnitRace_Spirit": "종족_정령",
    "Common_UnitRace_Ghost": "종족_유령",
    "Common_UnitRace_Mystic": "종족_미스틱",
    "Common_Star1On": "별_켜짐",
    "Common_Star1Off": "별_꺼짐",
}

# 잘라낸 것이 맞는지 보는 자다. 원작 속성 색은 정해져 있다 —
# 이름표 차례가 어긋나면 색부터 틀어지므로, 색 하나로 잘못 자른 것을 잡을 수 있다.
HUE = {
    "성격_순수": "초록", "성격_광기": "빨강", "성격_냉정": "하늘",
    "성격_우울": "보라", "성격_활발": "노랑", "성격_공명": "누런 회색",
}
def which_hue(rgb):
    r, g, b = rgb
    if r > 150 and g > 140 and b < 90 and abs(r - g) < 60: return "노랑"
    if r > 150 and g < 110 and b < 110: return "빨강"
    if b > 160 and g > 140 and r < 110: return "하늘"
    if b > 160 and r < 160 and g < 120: return "보라"
    if g > 140 and r < 130: return "초록"
    if abs(r - g) < 40 and abs(g - b) < 60 and r > 120: return "누런 회색"
    return "모르겠다"


def log(m): print(m, flush=True)

def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)

def find_device(exe, serial):
    for dev in ([serial] if serial else []) + PORTS:
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}/atlases/commonicons", timeout=30)
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
        from PIL import Image, ImageStat
    except ImportError as e:
        sys.exit(f"{e.name} 가 필요합니다: pip install UnityPy Pillow")

    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
    if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("앱플레이어를 못 찾았습니다. MuMu 를 켜고 게임을 한 번 실행하세요.")
    log(f"기기 {dev}")

    tmp = os.path.join(tempfile.gettempdir(), "trickcal-uiicons")
    os.makedirs(tmp, exist_ok=True)
    local = os.path.join(tmp, "commonicons")
    if not os.path.exists(local):
        p = adb(exe, dev, "pull", f"{BASE}/atlases/commonicons", local, timeout=900)
        if p.returncode != 0:
            sys.exit("adb pull 실패: " + p.stderr.decode("utf-8", "replace")[:200])
    log(f"번들 {os.path.getsize(local) // 1024}KB")

    env = UnityPy.load(local)
    atlas = next((o.read() for o in env.objects if o.type.name == "SpriteAtlas"), None)
    if atlas is None: sys.exit("SpriteAtlas 를 못 찾았습니다.")
    names = list(atlas.m_PackedSpriteNamesToIndex)
    rdm = atlas.m_RenderDataMap
    if len(names) != len(rdm):
        sys.exit(f"이름 {len(names)}개와 자리 {len(rdm)}개가 안 맞습니다 — 차례로 짝지을 수 없습니다.")
    idx = {n: i for i, n in enumerate(names)}
    log(f"아틀라스 '{atlas.m_Name}' 스프라이트 {len(names)}개")

    tex = {}
    for o in env.objects:
        if o.type.name == "Texture2D":
            t = o.read()
            tex[o.path_id] = t.image

    def cut(name):
        (_, d) = rdm[idx[name]]
        im = tex.get(d.texture.m_PathID)
        if im is None: return None
        r = d.textureRect
        x, y, w, h = int(r.x), int(r.y), int(round(r.width)), int(round(r.height))
        # 유니티 텍스처는 왼쪽 아래가 0 이다. PIL 은 왼쪽 위다.
        piece = im.crop((x, im.height - y - h, x + w, im.height - y))
        rot = (d.settingsRaw >> 2) & 0xF        # SpriteSettings: 1비트 packed · 1비트 mode · 4비트 rotation(0 없음 1 좌우 2 상하 3 180도 4 90도)
        if rot == 1: piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
        elif rot == 2: piece = piece.transpose(Image.FLIP_TOP_BOTTOM)
        elif rot == 3: piece = piece.transpose(Image.ROTATE_180)
        elif rot == 4: piece = piece.transpose(Image.ROTATE_90)
        return piece

    out = os.path.join(a.out, "uiicons")
    os.makedirs(out, exist_ok=True)
    made, gone, wrong = {}, [], []
    for src, ko in WANT.items():
        if src not in idx: gone.append(src); continue
        piece = cut(src)
        if piece is None: gone.append(src); continue
        piece.save(os.path.join(out, ko + ".png"))
        made[ko] = piece.size

        # 색으로 스스로 본다 — 차례가 어긋났으면 여기서 걸린다
        if ko in HUE:
            rgb = piece.convert("RGBA")
            px = [p[:3] for p in list(rgb.getdata()) if p[3] > 120]
            if px:
                mean = tuple(sum(c[i] for c in px) // len(px) for i in range(3))
                got = which_hue(mean)
                if got != HUE[ko]: wrong.append(f"{ko} — {HUE[ko]} 여야 하는데 {got} {mean}")

    man = {
        "_meta": {
            "source": "atlases/commonicons (SpriteAtlas 'CommonIcons') 에서 이름으로 잘라냈다.",
            "tool": "tools/extract-ui-icons.py",
            "note": "성격 여섯 · 역할 셋 · 위치 셋 · 종족 여덟 · 별 둘. 도감의 작은 표에 쓴다.",
        },
        "icons": {ko: f"assets/uiicons/{ko}.png" for ko in made},
    }
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)

    log("")
    log(f"아이콘 {len(made)}/{len(WANT)}장 → {out}/")
    for ko, size in made.items(): log(f"  {ko:<10} {size[0]}×{size[1]}")
    if gone: log(f"  ! 아틀라스에 없는 이름 {len(gone)}: {', '.join(gone)}")
    log("")
    if wrong:
        log("색이 안 맞습니다 — 이름과 자리가 어긋났을 수 있습니다:")
        for w in wrong: log(f"  ! {w}")
        sys.exit(1)
    log("성격 여섯 빛깔이 원작과 같습니다 — 이름과 자리가 제대로 짝지어졌습니다.")


if __name__ == "__main__":
    main()
