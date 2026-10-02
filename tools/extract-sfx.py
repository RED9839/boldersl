# -*- coding: utf-8 -*-
"""효과음을 꺼낸다 — 원작 Packages/audio/sfx (공용 · hero/<사도> · monster/<적> · minion · scenario).

  python tools/extract-sfx.py [--out assets] [--adb <adb.exe>] [--serial 127.0.0.1:16384] [--opusenc <opusenc.exe>] [--no-pull] [--force]
  → assets/sfx/<원작 경로>.ogg (예: assets/sfx/hero/lion/lion_ultimate.ogg · assets/sfx/sfx_victory.ogg)
    assets/sfx/index.json  { "<경로>": { "d": 초, "b": 바이트, "ch": 채널, "g": 음량 맞춤 } }
  python tools/extract-sfx.py --measure [--force]   이미 구운 것의 세기만 다시 재서 g 를 적는다(기기 없이)

앱플레이어 저장소의 표준 Unity 번들(파일 하나 = AudioClip 하나)을 adb 로 통째 복사(assets/_sfxraw)해 UnityPy 로 읽고 opus 로 굽는다
(tools/extract-select-voice.py 와 같은 길). 게임 서버와 통신하지 않고 보호장치 · 암호 자료(table)는 건드리지 않는다. assets/ 는 gitignore.
대부분 모노 — 모노는 64kbps, 스테레오는 큰 소리(궁극기 · 폭발 · 승리 …)만 96kbps 로 두고 나머지는 모노로 내린다.
배경음 · 대사 · 미니게임 소리는 뺀다(전투 · 화면 효과음이 아니다).

g — 파일마다 세기가 제각각이라(원작 소리는 갈래마다 따로 만들었다) 들리는 크기를 맞추는 배율. 50ms 창의 세기 중
가장 센 창에서 20dB 안쪽 창들만 평균 내(앞뒤 고요 · 긴 꼬리는 빼고) LOUD_T 에 맞춘다. 0.4~2.5 배, 맞춘 마루가 +1dB 를 넘지 않게.
갈래 사이의 크기(화면 소리는 작게 · 치명타는 크게)는 js/data/sfx-map.js 의 v 가 정한다 — js/sfx.js 가 g × v 로 튼다.

필요: UnityPy · opusenc(사도 데스크 pyruntime 옆의 것 · PATH) 또는 imageio-ffmpeg · 세기 재기는 PyAV(av) 또는 imageio-ffmpeg + numpy
"""
import argparse, io, json, os, re, shutil, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages/audio/sfx"
ENV = dict(os.environ); ENV["MSYS_NO_PATHCONV"] = "1"; ENV.pop("ELECTRON_RUN_AS_NODE", None)
ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]
HERE = os.path.dirname(os.path.abspath(__file__))
OPUS_CANDIDATES = [os.path.join(HERE, "..", "..", "사도 데스크", "prototype", "pyruntime", "opusenc.exe")]
# 효과음이 아닌 것 — 배경음 · 사도 대사 · 미니게임 · 로비 풍경 · 주사위 놀이
SKIP = re.compile(r"(^|/)(bgm_|voice_|minispeaki|sfx_windchime|sfx_tricdice)|^minigame/")
# 스테레오로 남길 큰 소리
WIDE = re.compile(r"ultimate|explosion|victory|cutin|clear|fail|defeat|gacha_open3star|earthquake|thunder|lightning")


LOUD_T, G_MIN, G_MAX, PEAK_MAX = -16.0, 0.4, 2.5, 1.12   # 맞출 세기(dBFS) · 배율 범위 · 맞춘 뒤 마루 상한(+1dB)


def log(m): print(m, flush=True)

def samples(path):
    """ogg → (모노 float 배열, 표본율). PyAV 가 없으면 imageio-ffmpeg 로 푼다"""
    import numpy as np
    try:
        import av
        c = av.open(path)
        try:
            sr = c.streams.audio[0].rate
            x = np.concatenate([f.to_ndarray().astype(np.float32) for f in c.decode(audio=0)], axis=1)
        finally: c.close()
        return x.mean(axis=0), sr
    except ImportError:
        import imageio_ffmpeg
        r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
                           capture_output=True, timeout=60)
        return np.frombuffer(r.stdout, dtype=np.float32), 48000

def gain_of(path):
    """들리는 크기를 LOUD_T 에 맞추는 배율 — 못 재면 None"""
    import numpy as np
    try: x, sr = samples(path)
    except Exception: return None
    n = max(1, int(sr * 0.05)); k = len(x) // n
    if k < 1: return None
    p = (x[:k * n].reshape(k, n) ** 2).mean(axis=1)
    top, peak = float(p.max()), float(np.abs(x).max())
    if top <= 0 or peak <= 0: return None
    loud = 10 * np.log10(float(p[p >= top * 0.01].mean()))
    g = min(G_MAX, max(G_MIN, 10 ** ((LOUD_T - loud) / 20)), PEAK_MAX / peak)
    return round(max(G_MIN, g), 2)

def measure(sdir, force):
    """구워 둔 것의 g 를 채운다(--force 면 모두 다시)"""
    ipath = os.path.join(sdir, "index.json")
    index = json.load(open(ipath, encoding="utf-8"))
    todo = [k for k, v in index.items() if force or "g" not in v]
    def one(k):
        g = gain_of(os.path.join(sdir, k + ".ogg"))
        if g is not None: index[k]["g"] = g
        return g is not None
    with ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4) - 1)) as ex: ok = sum(ex.map(one, todo))
    with open(ipath, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    log(f"세기 — {ok}/{len(todo)}개 재서 g 를 적었다 (assets/sfx/index.json)")

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
        if p and os.path.exists(p):
            return lambda dst, kbps, mono: [p, "--quiet", "--bitrate", str(kbps), "--vbr", *(["--downmix-mono"] if mono else []), "-", dst]
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        return lambda dst, kbps, mono: [ff, "-loglevel", "error", "-y", "-i", "pipe:0", *(["-ac", "1"] if mono else []),
                                        "-c:a", "libopus", "-b:a", f"{kbps}k", "-vbr", "on", dst]
    except ImportError:
        sys.exit("opusenc.exe 를 찾지 못했습니다 — --opusenc 로 알려 주세요.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets")
    ap.add_argument("--adb"); ap.add_argument("--serial"); ap.add_argument("--opusenc")
    ap.add_argument("--no-pull", action="store_true", help="assets/_sfxraw 에 이미 받아 둔 것으로")
    ap.add_argument("--force", action="store_true", help="이미 구운 것도 다시")
    ap.add_argument("--measure", action="store_true", help="굽지 않고 세기(g)만 다시 잰다")
    a = ap.parse_args()
    if a.measure: return measure(os.path.join(a.out, "sfx"), a.force)
    try:
        import UnityPy
    except ImportError:
        sys.exit("UnityPy 가 필요합니다: pip install UnityPy")
    raw = os.path.join(a.out, "_sfxraw", "sfx")
    if not a.no_pull:
        exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
        if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
        dev = find_device(exe, a.serial)
        if not dev: sys.exit("앱플레이어를 못 찾았습니다. MuMu 를 켜고 게임을 한 번 실행하세요.")
        log(f"기기 {dev} — 효과음 폴더를 통째로 받는다")
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        r = adb(exe, dev, "pull", BASE, os.path.dirname(raw), timeout=1800)
        if r.returncode != 0: sys.exit("받기 실패: " + r.stderr.decode("utf-8", "replace")[:200])
    if not os.path.isdir(raw): sys.exit(f"{raw} 가 없습니다 — --no-pull 을 빼고 다시.")
    enc = encoder(a.opusenc)

    names = []
    for root, _, fs in os.walk(raw):
        for fn in fs:
            rel = os.path.relpath(os.path.join(root, fn), raw).replace("\\", "/")
            if not SKIP.search(rel): names.append(rel)
    names.sort()
    sdir = os.path.join(a.out, "sfx")
    ipath = os.path.join(sdir, "index.json")
    index = {}
    if os.path.exists(ipath) and not a.force:
        try: index = json.load(open(ipath, encoding="utf-8"))
        except Exception: index = {}
    log(f"효과음 {len(names)}개 (뺀 것 — 배경음 · 대사 · 미니게임)")

    def one(rel):
        dst = os.path.join(sdir, rel + ".ogg")
        if not a.force and rel in index and os.path.exists(dst): return "skip"
        try:
            wav = None
            for o in UnityPy.load(os.path.join(raw, rel)).objects:
                if o.type.name == "AudioClip":
                    wav = next(iter(o.read().samples.values()), None); break
            if wav is None: return "bad"
            w = wave.open(io.BytesIO(wav))
            ch, dur = w.getnchannels(), w.getnframes() / max(1, w.getframerate())
            mono = ch == 1 or not WIDE.search(rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            r = subprocess.run(enc(dst, 64 if mono else 96, mono and ch > 1), input=wav, capture_output=True, timeout=120)
            if r.returncode != 0: return "bad"
            index[rel] = {"d": round(dur, 2), "b": os.path.getsize(dst), "ch": 1 if mono else ch}
            g = gain_of(dst)
            if g is not None: index[rel]["g"] = g
            return "ok"
        except Exception as e:
            log(f"  ! {rel}: {str(e)[:80]}"); return "bad"

    n = {"ok": 0, "skip": 0, "bad": 0}
    with ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4) - 1)) as ex:
        for i, res in enumerate(ex.map(one, names), 1):
            n[res] += 1
            if i % 500 == 0: log(f"  {i}/{len(names)}")
    index = {k: index[k] for k in sorted(index) if os.path.exists(os.path.join(sdir, k + ".ogg"))}
    with open(ipath, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(v["b"] for v in index.values())
    log(f"새로 {n['ok']} · 이미 있음 {n['skip']} · 실패 {n['bad']} — 색인 {len(index)}개 {total / 1024 / 1024:.1f}MB (assets/sfx/index.json)")


if __name__ == "__main__":
    main()
