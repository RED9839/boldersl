# -*- coding: utf-8 -*-
"""적 스파인 추출기 — spine/ingame/monster(적)·minion(소환물)을 꺼낸다.

사도 스파인(hero·standing·minimi)은 사도 데스크의 extract-all.py 가 꺼낸다. 그 도구는 적을 안 꺼내서 이것을 따로 둔다.
하는 일은 같다 — 앱플레이어 저장소의 표준 Unity 번들을 adb 로 복사해 UnityPy 로 읽는다.
게임 서버와 통신하지 않고, 보호장치를 건드리지 않는다. 꺼낸 것은 개인 사용 목적이고 저장소에 넣지 않는다.

  python tools/extract-spine.py                          monster 를 assets/monsterspine/ 으로
  python tools/extract-spine.py --kinds monster,minion   소환물까지
  python tools/extract-spine.py --only golem,imoogi      몇 개만
  python tools/extract-spine.py --force                  이미 있는 것도 다시

꺼낸 뒤 npm run spine 으로 게임이 쓰는 몫을 assets/spine/ 에 골라 넣는다.
필요: adb (앱플레이어 것), UnityPy, Pillow
"""
import argparse, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages/spine/ingame"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"
ENV.pop("ELECTRON_RUN_AS_NODE", None)

ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]
# 꺼낸 것을 둘 곳 — 사도의 assets/ingame 과 섞이지 않게 따로 둔다
OUTDIR = {"monster": "monsterspine", "minion": "minionspine"}

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass


def log(m): print(m, flush=True)


def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)


def find_device(exe, serial):
    for dev in ([serial] if serial else PORTS):
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}/monster | head -1", timeout=30)
        if p.returncode == 0 and p.stdout.strip(): return dev
    return None


def adb_ls(exe, dev, path):
    p = adb(exe, dev, "shell", f"ls -1 {path}", timeout=120)
    if p.returncode != 0: return []
    return [l.strip() for l in p.stdout.decode("utf-8", "ignore").splitlines() if l.strip()]


# ── 번들 읽기 — 사도 데스크 extract-all.py 의 decode_spine_dir 와 같다 ──
def text_asset(path):
    import UnityPy
    for o in UnityPy.load(path).objects:
        if o.type.name == "TextAsset":
            r = o.read().m_Script
            return r if isinstance(r, bytes) else r.encode("utf-8", "surrogateescape")
    return None


def textures(path):
    import UnityPy
    return [(d.m_Name, d.image) for d in (o.read() for o in UnityPy.load(path).objects if o.type.name == "Texture2D")]


# 텍스처 번들은 확장자가 없고 _atlas·_material·_skeletondata 가 아닌 것.
# 사도 데스크는 "밑줄이 없는 것"으로 골랐는데, 적은 이름에 밑줄이 든다(e0_uros, meow_renewa) — 그러면 텍스처를 놓친다.
def is_texture(f):
    return "." not in f and not f.endswith(("_atlas", "_material", "_skeletondata"))


def decode(args):
    src, out = args
    name = os.path.basename(src)
    try:
        os.makedirs(out, exist_ok=True)
        skel = atlas = None; pages = []; tex = []
        for f in sorted(os.listdir(src)):
            p = os.path.join(src, f)
            if f.endswith(".skel"):
                b = text_asset(p)
                if b: open(os.path.join(out, f), "wb").write(b); skel = f
            elif f.endswith(".atlas"):
                b = text_asset(p)
                if b:
                    open(os.path.join(out, f), "wb").write(b); atlas = f
                    pages = [l.strip() for l in b.decode("utf-8", "ignore").splitlines() if l.strip().lower().endswith(".png")]
            elif is_texture(f):
                tex += textures(p)
        for pg in pages:
            for tname, img in tex:
                if tname.lower() == pg[:-4].lower(): img.save(os.path.join(out, pg))
        ok = skel and atlas and pages and all(os.path.exists(os.path.join(out, pg)) for pg in pages)
        return name, bool(ok), None if ok else f"skel={skel} atlas={atlas} pages={pages} tex={[t for t, _ in tex]}"
    except Exception as e:
        return name, False, str(e)


def complete(d, n):
    at = os.path.join(d, n + ".atlas")
    if not (os.path.exists(os.path.join(d, n + ".skel")) and os.path.exists(at)): return False
    pages = [l.strip() for l in open(at, encoding="utf-8", errors="ignore") if l.strip().lower().endswith(".png")]
    return bool(pages) and all(os.path.exists(os.path.join(d, pg)) for pg in pages)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets"))
    ap.add_argument("--kinds", default="monster")
    ap.add_argument("--only", default="")
    ap.add_argument("--adb", default=None)
    ap.add_argument("--serial", default=None)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None) or shutil.which("adb")
    if not exe: sys.exit("adb 를 못 찾았습니다. --adb 로 앱플레이어의 adb.exe 를 알려 주세요")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("트릭컬이 깔린 기기를 못 찾았습니다. 앱플레이어를 켜고 게임을 한 번 실행해 두세요")
    log(f"기기 {dev}")

    only = {s.strip() for s in a.only.split(",") if s.strip()}
    tmp = tempfile.mkdtemp(prefix="bolder-spine-")
    try:
        for kind in [k.strip() for k in a.kinds.split(",") if k.strip()]:
            if kind not in OUTDIR: log(f"! {kind} — monster·minion 만 꺼냅니다"); continue
            out = os.path.join(a.out, OUTDIR[kind])
            names = [n for n in adb_ls(exe, dev, f"{BASE}/{kind}") if re.match(r"^[a-z0-9_]+$", n)]
            if only: names = [n for n in names if n in only]
            todo = names if a.force else [n for n in names if not complete(os.path.join(out, n), n)]
            log(f"{kind}: 기기에 {len(names)}개 · 새로 꺼낼 것 {len(todo)}개")
            if not todo: continue
            # 폴더째 한 번에 받는 것이 하나씩 받는 것보다 훨씬 빠르다
            p = adb(exe, dev, "pull", f"{BASE}/{kind}", tmp, timeout=1800)
            if p.returncode != 0: sys.exit(f"복사 실패: {p.stderr.decode('utf-8', 'ignore')[:300]}")
            src = os.path.join(tmp, kind)
            jobs = [(os.path.join(src, n), os.path.join(out, n)) for n in todo if os.path.isdir(os.path.join(src, n))]
            good = 0
            with ProcessPoolExecutor() as ex:
                for name, ok, why in ex.map(decode, jobs):
                    if ok: good += 1
                    else: log(f"  ! {name} — {why}")
            log(f"{kind}: {good}/{len(jobs)} 꺼냄 → {out}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
