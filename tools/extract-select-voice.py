# -*- coding: utf-8 -*-
"""편성 대사(사도를 파티에 넣을 때 하는 말)를 꺼낸다 — 원작 음성 갈래 `decksetting`.

사도 데스크의 추출(extract-all.py)은 로비 · 전투 대사만 받아서 이 갈래가 없다. 사도마다 두 마디(decksetting1 · 2).

  python tools/extract-select-voice.py [--out assets] [--adb <adb.exe>] [--serial 127.0.0.1:16384] [--opusenc <opusenc.exe>]
  → assets/voice/<사도>/decksetting1.ogg … · assets/voice/index.json 을 폴더 기준으로 다시 짓는다

앱플레이어 저장소의 표준 Unity 번들(파일 하나 = AudioClip 하나)을 adb 로 복사해 UnityPy 로 읽고 opus 40kbps 로 굽는다
(사도 데스크 _voice_job 과 같은 길). 게임 서버와 통신하지 않고 보호장치를 건드리지 않는다. assets/ 는 gitignore.

필요: UnityPy · opusenc(사도 데스크 pyruntime 옆의 것 · PATH) 또는 imageio-ffmpeg
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages/audio/kor/voice/hero"
CAT = "decksetting"
ENV = dict(os.environ); ENV["MSYS_NO_PATHCONV"] = "1"; ENV.pop("ELECTRON_RUN_AS_NODE", None)
ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]
HERE = os.path.dirname(os.path.abspath(__file__))
OPUS_CANDIDATES = [os.path.join(HERE, "..", "..", "사도 데스크", "prototype", "pyruntime", "opusenc.exe")]
KEY_RE = re.compile(r"^([a-z]+?)(\d[\d_-]*)?(?:_(skin\d+))?$")   # 사도 데스크 build_voice_index 와 같은 규칙


def log(m): print(m, flush=True)

def adb(exe, dev, *a, timeout=600):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)

def find_device(exe, serial):
    for dev in ([serial] if serial else []) + PORTS:
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        p = adb(exe, dev, "shell", f"ls {BASE}", timeout=30)
        if p.returncode == 0 and p.stdout.strip(): return dev
    return None

def encoder(path):
    for p in ([path] if path else []) + OPUS_CANDIDATES + [shutil.which("opusenc") or ""]:
        if p and os.path.exists(p): return lambda dst: [p, "--quiet", "--bitrate", "40", "--vbr", "-", dst]
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        return lambda dst: [ff, "-loglevel", "error", "-y", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "40k", "-vbr", "on", dst]
    except ImportError:
        sys.exit("opusenc.exe 를 찾지 못했습니다 — --opusenc 로 알려 주세요.")

def build_index(vdir):
    index = {}
    for hero in sorted(os.listdir(vdir)):
        hdir = os.path.join(vdir, hero)
        if not os.path.isdir(hdir): continue
        for fn in sorted(os.listdir(hdir)):
            if not fn.endswith(".ogg"): continue
            mm = KEY_RE.match(fn[:-4])
            if not mm: continue
            index.setdefault(hero, {}).setdefault(mm.group(3) or "base", {}).setdefault(mm.group(1), []).append(f"{hero}/{fn}")
    with open(os.path.join(vdir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets")
    ap.add_argument("--adb"); ap.add_argument("--serial"); ap.add_argument("--opusenc")
    a = ap.parse_args()
    try:
        import UnityPy
    except ImportError:
        sys.exit("UnityPy 가 필요합니다: pip install UnityPy")
    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
    if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("앱플레이어를 못 찾았습니다. MuMu 를 켜고 게임을 한 번 실행하세요.")
    enc = encoder(a.opusenc)
    log(f"기기 {dev}")

    # 사도 폴더마다 편성 대사 파일 이름 — 한 번의 셸로 모두 훑는다
    p = adb(exe, dev, "shell", f"cd {BASE} && for h in *; do for f in $h/voice_*_{CAT}*; do [ -e \"$f\" ] && echo $f; done; done", timeout=120)
    files = [l.strip() for l in p.stdout.decode("utf-8", "replace").splitlines() if l.strip() and "_selective_" not in l]
    log(f"편성 대사 {len(files)}개 · 사도 {len({f.split('/')[0] for f in files})}명")

    tmp = os.path.join(tempfile.gettempdir(), "trickcal-selectvoice")
    os.makedirs(tmp, exist_ok=True)
    vdir = os.path.join(a.out, "voice")
    ok = skip = bad = 0
    for i, rel in enumerate(files, 1):
        hero, fn = rel.split("/", 1)
        m = re.match(rf"^voice_[a-z0-9]+_({CAT}[\d_-]*(?:_skin\d+)?)$", fn)
        if not m: continue
        dst = os.path.join(vdir, hero, m.group(1) + ".ogg")
        if os.path.exists(dst): skip += 1; continue
        local = os.path.join(tmp, hero + "__" + fn)
        if not os.path.exists(local):
            r = adb(exe, dev, "pull", f"{BASE}/{rel}", local, timeout=120)
            if r.returncode != 0: bad += 1; continue
        try:
            wav = None
            for o in UnityPy.load(local).objects:
                if o.type.name == "AudioClip":
                    wav = next(iter(o.read().samples.values()), None); break
            if wav is None: bad += 1; continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            r = subprocess.run(enc(dst), input=wav, capture_output=True, timeout=120)
            if r.returncode == 0: ok += 1
            else: bad += 1
        except Exception as e:
            bad += 1; log(f"  ! {rel}: {str(e)[:80]}")
        if i % 50 == 0: log(f"  {i}/{len(files)}")
    idx = build_index(vdir)
    n = sum(1 for h in idx.values() if CAT in h.get("base", {}))
    log(f"새로 {ok} · 이미 있음 {skip} · 실패 {bad} — 편성 대사가 있는 사도 {n}명 (index.json 다시 지음)")


if __name__ == "__main__":
    main()
