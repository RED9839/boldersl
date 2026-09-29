# -*- coding: utf-8 -*-
"""그린 카드 일러스트를 웹에 낼 크기로 줄인다.

원본은 1024×1536 PNG 로 장당 2.7MB 다. 카드가 화면에 뜨는 크기는 152×230 이고,
고해상도 화면을 넉넉히 잡아도 456×690 이면 된다. 1215장이면 3.1GB 와 0.3GB 의 차이다.

원본 .png 는 그대로 두고 옆에 .webp 를 만든다. tools/build-cardart.js 가 webp 를 먼저 본다.
다시 뽑거나 크기를 바꾸고 싶으면 원본이 그대로 있다.

  python tools/shrink-cardart.py                  아직 안 줄인 것만
  python tools/shrink-cardart.py --all            전부 다시
  python tools/shrink-cardart.py --width 512      너비를 달리
  python tools/shrink-cardart.py --quality 88

필요: Pillow
"""
import argparse, os, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets", "cardart")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=512, help="줄일 너비 (기본 512 — 카드는 화면에서 152px 로 뜬다)")
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--all", action="store_true", help="이미 줄인 것도 다시")
    a = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow 가 필요합니다: pip install Pillow")

    if not os.path.isdir(SRC):
        sys.exit(f"{SRC} 가 없습니다. 아직 그린 것이 없습니다.")

    before = after = 0
    made = skipped = 0
    for hero in sorted(os.listdir(SRC)):
        d = os.path.join(SRC, hero)
        if not os.path.isdir(d): continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith(".png"): continue
            png = os.path.join(d, name)
            webp = png[:-4] + ".webp"
            if os.path.exists(webp) and not a.all:
                skipped += 1
                before += os.path.getsize(png); after += os.path.getsize(webp)
                continue
            im = Image.open(png)
            if im.width > a.width:
                h = round(im.height * a.width / im.width)
                im = im.resize((a.width, h), Image.LANCZOS)
            # 카드는 테두리까지 꽉 차게 그려서 알파가 필요 없다. 있으면 그대로 둔다.
            im.save(webp, "WEBP", quality=a.quality, method=6)
            made += 1
            before += os.path.getsize(png); after += os.path.getsize(webp)

    if not (made or skipped):
        print("줄일 것이 없습니다.")
        return
    mb = lambda n: f"{n / 1048576:.1f}MB"
    print(f"줄인 것 {made}장" + (f" · 이미 있던 것 {skipped}장" if skipped else ""))
    print(f"  {mb(before)} → {mb(after)}  ({after_pct(before, after)})")
    n = made + skipped
    if n:
        per = after / n / 1024
        print(f"  장당 {per:.0f}KB · 1215장이면 {after / n * 1215 / 1073741824:.2f}GB")
    print("")
    print("원본 .png 는 그대로 있습니다. 이제 한 줄: node tools/build-cardart.js")


def after_pct(a, b):
    if not a: return "-"
    return f"{b / a * 100:.0f}%"


if __name__ == "__main__":
    main()
