# -*- coding: utf-8 -*-
"""미니미를 아틀라스에서 잘라낸다.

인게임 SD·스탠딩은 부품 단위 스파인이라(Arm_L, Body, Head…) 그림 한 장으로 못 쓴다.
그런데 **미니미는 다르다** — 아틀라스 하나에 캐릭터마다 영역이 통째로 하나씩 들어 있다(1,677개).
그래서 스파인 런타임 없이 잘라내기만 하면 된다.

  python tools/build-minimi.py [--all]

기본은 편성 여덟만. --all 이면 아틀라스에 있는 것 전부.
필요: Pillow
"""
import argparse
import io
import json
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
AS = os.path.join(HERE, "..", "assets")
SRC = os.path.join(AS, "minimi")
OUT = os.path.join(AS, "sd")

# 기획서 사도 → 아틀라스 이름. tools/link-art.js 가 만든 표를 읽는다(아틀라스는 파스칼 표기).
def load_map():
    p = os.path.join(HERE, "..", "js", "data", "artmap.js")
    if not os.path.exists(p):
        return {}
    t = io.open(p, encoding="utf-8").read()
    i, j = t.index("{"), t.rindex("}")
    return json.loads(t[i:j + 1]).get("art", {})


def parse_atlas(path):
    """스파인 아틀라스에서 영역을 읽는다. {이름: {x,y,w,h,rotate}}

    이 판의 아틀라스는 속성 줄에 들여쓰기가 없다(스파인 4.x 간결 형식).
    그래서 들여쓰기가 아니라 **콜론 유무**로 이름과 속성을 가른다 —
    콜론이 없는 줄이 영역 이름이고, 있는 줄이 그 영역의 속성이다.
    """
    regions = {}
    name = None
    cur = {}

    def flush():
        if name and "bounds" in cur:
            x, y, w, h = (int(n) for n in cur["bounds"].split(","))
            regions[name] = {"x": x, "y": y, "w": w, "h": h, "rotate": cur.get("rotate", "").strip()}

    for raw in io.open(path, encoding="utf-8"):
        line = raw.strip()
        if not line:
            continue
        if ":" in line:
            k, _, v = line.partition(":")
            cur[k.strip()] = v
            continue
        # 콜론이 없다 = 새 영역 이름 (맨 첫 줄의 .png 는 페이지 이름이라 건너뛴다)
        flush()
        if line.lower().endswith(".png"):
            name, cur = None, {}
            continue
        name, cur = line, {}
    flush()
    return regions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="아틀라스에 있는 것 전부")
    a = ap.parse_args()

    atlas = os.path.join(SRC, "minimi.atlas")
    page = os.path.join(SRC, "Minimi.png")
    if not os.path.exists(atlas) or not os.path.exists(page):
        sys.exit(f"{SRC} 에 minimi.atlas / Minimi.png 이 없습니다. 먼저 추출하세요 — README 참고.")

    from PIL import Image
    sheet = Image.open(page).convert("RGBA")
    regions = parse_atlas(atlas)
    print(f"아틀라스 영역 {len(regions)}개")

    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(io.open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {}

    # 아틀라스 이름은 파스칼 표기(Alice, AliceSkin1). 소문자로 맞춰 찾는다.
    lower = {k.lower(): k for k in regions}
    artmap = load_map()
    want = list(lower) if a.all else list(artmap.keys())
    if not artmap and not a.all:
        sys.exit("js/data/artmap.js 가 없습니다. 먼저 node tools/link-art.js 를 돌리세요.")

    got = miss = 0
    for key in want:
        # 키는 기획서 이름(한글), 아틀라스는 영문 파스칼 표기다
        art = artmap.get(key, key)
        name = lower.get(art.lower())
        if not name:
            miss += 1
            continue
        r = regions[name]
        # rotate: 90 이면 아틀라스에 90도 돌아가 들어 있다 — 잘라서 되돌린다
        if r["rotate"] == "90":
            box = (r["x"], r["y"], r["x"] + r["h"], r["y"] + r["w"])
            im = sheet.crop(box).transpose(Image.ROTATE_90)
        else:
            im = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        im.save(os.path.join(OUT, f"minimi_{key}.png"))
        manifest[f"minimi_{key}"] = f"minimi_{key}.png"
        got += 1

    json.dump(manifest, io.open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"미니미 {got}장 → assets/sd/" + (f" · 아틀라스에 없는 이름 {miss}개" if miss else ""))


if __name__ == "__main__":
    main()
