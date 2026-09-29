# -*- coding: utf-8 -*-
"""사도 아이콘 추출기 — rawsprites/heroicons(252×252 SD 전신)와 skillicons 를 꺼낸다.

사도 데스크의 extract-all.py 는 스파인(부품 단위)만 꺼낸다. 카드 게임에는 통짜 그림 한 장이 필요해서
이 도구를 따로 둔다. 하는 일은 같다 — 앱플레이어 저장소의 표준 Unity 번들을 adb 로 복사해 UnityPy 로 읽는다.
게임 서버와 통신하지 않고, 보호장치를 건드리지 않는다. 꺼낸 그림은 개인 사용 목적이고 저장소에 넣지 않는다.

  python tools/extract-icons.py --out assets [--adb <adb.exe>] [--serial 127.0.0.1:16384]
                                [--kinds heroicons,skillicons] [--only alice,erpin]

필요: UnityPy, Pillow
"""
import argparse, os, re, shutil, subprocess, sys, tempfile

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages"
RAW = f"{BASE}/rawsprites"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"
ENV.pop("ELECTRON_RUN_AS_NODE", None)

ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]


# 윈도우 콘솔이 cp949 면 em dash 같은 글자에서 터진다. 출력만 utf-8 로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass


def log(msg):
    print(msg, flush=True)


def adb(adb_exe, dev, *args, timeout=600):
    return subprocess.run([adb_exe, "-s", dev, *args], env=ENV, capture_output=True, timeout=timeout)


def find_device(adb_exe, serial):
    """트릭컬 데이터가 실제로 있는 기기를 고른다. 주소가 여럿이어도 대개 같은 기기다."""
    cands = [serial] if serial else PORTS
    for dev in cands:
        subprocess.run([adb_exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(adb_exe, dev, "shell", f"ls {RAW}/heroicons | head -1", timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return dev
    return None


def adb_ls(adb_exe, dev, path):
    p = adb(adb_exe, dev, "shell", f"ls -1 {path}", timeout=120)
    if p.returncode != 0:
        return []
    return [l.strip() for l in p.stdout.decode("utf-8", "ignore").splitlines() if l.strip()]


def adb_pull(adb_exe, dev, remote, local):
    os.makedirs(os.path.dirname(local) or ".", exist_ok=True)
    p = adb(adb_exe, dev, "pull", remote, local, timeout=3600)
    if p.returncode != 0:
        msg = (p.stderr or p.stdout).decode("utf-8", "ignore").strip()[-300:]
        raise RuntimeError(f"adb pull 실패 {remote}: {msg}")


def biggest_texture(path):
    """번들 안에서 가장 큰 Texture2D 하나. 아이콘 번들은 보통 한 장뿐이다."""
    import UnityPy
    best = None
    for o in UnityPy.load(path).objects:
        if o.type.name != "Texture2D":
            continue
        d = o.read()
        img = d.image
        if img is None:
            continue
        if best is None or img.width * img.height > best[1].width * best[1].height:
            best = (d.m_Name, img)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets")
    ap.add_argument("--adb")
    ap.add_argument("--serial")
    ap.add_argument("--kinds", default="heroicons")
    ap.add_argument("--only", help="쉼표로 구분한 이름만 (없으면 전부)")
    a = ap.parse_args()

    adb_exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
    if not adb_exe:
        sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")

    dev = find_device(adb_exe, a.serial)
    if not dev:
        sys.exit(f"트릭컬 데이터가 있는 기기를 찾지 못했습니다 ({RAW}/heroicons). 앱플레이어에서 게임을 한 번 띄워 주세요.")
    log(f"기기: {dev}")

    only = set(x.strip().lower() for x in a.only.split(",")) if a.only else None
    tmp = tempfile.mkdtemp(prefix="icons-")
    try:
        for kind in [k.strip() for k in a.kinds.split(",") if k.strip()]:
            names = [n for n in adb_ls(adb_exe, dev, f"{RAW}/{kind}") if re.match(r"^[a-z0-9_]+$", n)]
            if only:
                names = [n for n in names if n.lower() in only]
            if not names:
                log(f"[{kind}] 받을 것이 없습니다")
                continue

            out = os.path.join(a.out, kind)
            os.makedirs(out, exist_ok=True)
            log(f"[{kind}] {len(names)}개 — 한 번에 복사하는 중…")
            src = os.path.join(tmp, kind)
            # 폴더째 한 번에 끌어온다 (하나씩 439번 pull 하는 것보다 훨씬 빠르다)
            adb_pull(adb_exe, dev, f"{RAW}/{kind}", src)
            root = os.path.join(src, kind) if os.path.isdir(os.path.join(src, kind)) else src

            ok = bad = 0
            for i, n in enumerate(names, 1):
                p = os.path.join(root, n)
                if not os.path.exists(p):
                    bad += 1
                    continue
                try:
                    hit = biggest_texture(p)
                    if not hit:
                        bad += 1
                        continue
                    hit[1].save(os.path.join(out, n + ".png"))
                    ok += 1
                except Exception as e:
                    bad += 1
                    log(f"  ? {n}: {e}")
                if i % 50 == 0:
                    log(f"  … {i}/{len(names)}")
            log(f"[{kind}] 완료 — {ok}장 저장, {bad}개 건너뜀 → {out}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
