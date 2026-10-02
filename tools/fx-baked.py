# -*- coding: utf-8 -*-
"""구운 이펙트 — Unity 에서 프레임으로 구운 원작 이펙트(시트)를 assets/fx-baked 에 옮기고 색인을 쓴다.

C:\\work\\fxbake (저장소 밖) 의 web/<프리팹>/ 에 sheets.py 가 만든 WebP 시트와 <프리팹>.json 이 있다.
궁극기는 web, 공용 타격 이펙트(prefab/prefabeffecthit — FxBaker.BakeHitsBatch → sheets.py)는 web_hit 에 따로 둔다.
js/fx-burst.js 는 이펙트 이름에 구운 판이 있으면 파티클 흉내 대신 이것을 튼다(이펙트마다 — 없는 사도는 그대로).

  python tools/fx-baked.py                  C:\\work\\fxbake\\web · web_hit 에서 옮긴다
  python tools/fx-baked.py --src <폴더> …    다른 곳에서(여럿이면 합친다)

나오는 것: assets/fx-baked/index.json · assets/fx-baked/<이름 소문자>/<이름 소문자>_<쪽>.webp
assets/ 는 gitignore — 원작 그림은 저장소에 넣지 않는다. 손볼 값(TUNE)은 여기 두어 다시 옮겨도 남는다.
필요: Pillow
"""
import argparse, json, os, shutil, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "fx-baked")

# 이펙트마다 손볼 값 — 없으면 그대로(scale 1, 자리 그대로, 후처리 없음)
#   scale  파티클 흉내와 같은 셈(유니티 1단위 = PPU 16px × scale) 위에 더 곱하는 배율
#   dx·dy  자리를 유니티 단위로 옮긴다(dy 는 위로). 원작은 총구 · 지팡이 끝 같은 소켓에 띄우는데 여기는 발밑이 원점이다
#   reach  뿌리 앞쪽(가로)을 싸움터 끝까지 늘인다 — 굽는 카메라 밖으로 잘린 레이저
#   fadeFrom  프레임 차례(0~1) 이 뒤로 끝까지 걷는다
#   post   시트를 받을 때 한 번 칠한다 —
#     dark  {below, alpha, tint, base, gain}  어두운 칸(밝기 < below)을 tint 쪽으로 · 알파를 alpha 배로. 밝기 결은 base + 밝기×gain
#     white {sat, above, tint, amt}           채도 < sat · 밝기 > above 인 흰 칸을 tint 로 amt 만큼
# 에르핀 폭발의 검은 연기 · 흰 고리 — 원작은 HDR 블룸으로 주황 반투명으로 읽히는데 굽기에선 불투명 검정 · 흰색으로 남았다
TUNE = {
    "FX_Erpin_Ultimate_Explosion_1": {
        "scale": 1.4, "fadeFrom": 0.45,
        "post": {
            "dark": {"below": 0.3, "alpha": 0.55, "tint": [255, 140, 50], "base": 0.7, "gain": 3},
            "white": {"sat": 0.25, "above": 0.55, "tint": [255, 165, 60], "amt": 0.85},
        },
    },
    # 아멜리아 — 원작은 총구에 띄운다. 레이저는 굽는 카메라(±24단위) 밖이 잘려 싸움터 끝까지 늘인다
    # 총구는 발밑에서 앞으로 16단위 · 위로 6단위쯤(SD 가 PPU 16 셈으로 크다). 줄기가 싸움터를 다 덮지 않게 0.8 배
    "FX_Amelia_Ultimate_Laser_1": {"scale": 0.8, "dx": 16, "dy": 6, "reach": True},
    "FX_Amelia_Ultimate_Laser_2": {"scale": 0.8, "dx": 16, "dy": 6, "reach": True},
    "FX_Amelia_Ultimate_Charge_1": {"dx": 16, "dy": 6},
    "FX_Amelia_Ultimate_Charge_2": {"dx": 16, "dy": 6},
}


def visible_cx(d, js):
    """모든 프레임을 합친 보이는 영역의 가로 가운데 — 원점에서 유니티 단위로(뿌리에서 멀리 짜인 이펙트를 대상에 맞출 때)"""
    fw, fh, cols = js["frameWidth"], js["frameHeight"], js["columns"]
    x0, x1 = fw, 0
    for p in js["pages"]:
        a = Image.open(os.path.join(d, p["file"])).convert("RGBA").getchannel("A").point(lambda v: 255 if v > 16 else 0)
        for i in range(p["frames"]):
            bb = a.crop(((i % cols) * fw, (i // cols) * fh, (i % cols + 1) * fw, (i // cols + 1) * fh)).getbbox()
            if bb: x0, x1 = min(x0, bb[0]), max(x1, bb[2])
    return 0 if x1 <= x0 else round(((x0 + x1) / 2 - js["anchor"]["x"]) / js["pixelsPerUnit"], 2)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", nargs="+", default=[r"C:\work\fxbake\web", r"C:\work\fxbake\web_hit"])
    a = ap.parse_args()
    srcs = [s for s in a.src if os.path.isdir(s)]
    if not srcs: sys.exit(f"없음: {a.src}")
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    effects, total = {}, 0
    for name, d in sorted((n, os.path.join(s, n)) for s in srcs for n in os.listdir(s)):
        jp = os.path.join(d, name + ".json")
        if not os.path.isfile(jp): continue
        js = json.load(open(jp, encoding="utf-8"))
        key = name.lower()
        os.makedirs(os.path.join(OUT, key))
        pages = []
        for i, p in enumerate(js["pages"]):
            fn = f"{key}_{i}.webp"
            shutil.copyfile(os.path.join(d, p["file"]), os.path.join(OUT, key, fn))
            total += os.path.getsize(os.path.join(OUT, key, fn))
            pages.append({"file": f"{key}/{fn}", "frames": p["frames"]})
        e = {
            "fps": js["fps"], "frames": js["frames"], "w": js["frameWidth"], "h": js["frameHeight"], "cols": js["columns"],
            "pages": pages, "anchor": [js["anchor"]["x"], js["anchor"]["y"]], "ppu": js["pixelsPerUnit"],
            "cx": visible_cx(d, js), "dur": js["inGameDuration"],
        }
        e.update(TUNE.get(name, {}))
        effects[key] = e
        print(f"  {key}: {js['frames']}f {js['frameWidth']}x{js['frameHeight']} {len(pages)}쪽 cx {e['cx']}")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"source": "Unity 로 구운 원작 이펙트(tools/fx-baked.py)", "effects": effects}, f, ensure_ascii=False, indent=1)
    print(f"{len(effects)}개, 시트 {total / 1024:.0f} KB → {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
