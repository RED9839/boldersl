# -*- coding: utf-8 -*-
"""기기에 무엇이 있는지 훑어 "꺼낼 수 있는 것" 목록을 만든다.

추출기는 꺼내는 일만 하고, 무엇을 꺼낼 수 있는지는 알려 주지 않는다. 이 도구가 그 몫이다.
기기를 읽기만 하고 아무것도 내려받지 않는다 — 폴더 이름과 크기, 파일 개수만 센다.

  python tools/survey.py                       docs/02-꺼낼수있는것.md 로 쓴다
  python tools/survey.py --json                assets/available.json 만
  python tools/survey.py --depth 2             더 깊이

필요: adb (앱플레이어 것)
"""
import argparse, json, os, re, subprocess, sys

PKG = "com.epidgames.trickcalrevive"
BASE = f"/sdcard/Android/data/{PKG}/files/Packages"
ENV = dict(os.environ)
ENV["MSYS_NO_PATHCONV"] = "1"
ENV.pop("ELECTRON_RUN_AS_NODE", None)

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

ADB_CANDIDATES = [
    r"C:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
    r"C:\Program Files\Netease\MuMu Player 12\shell\adb.exe",
    r"D:\Program Files\Netease\MuMuPlayer\nx_main\adb.exe",
]
PORTS = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:7555", "127.0.0.1:5555"]

# 이 게임을 만드는 데 쓸모가 있는지 — 목록만 보고는 모르니 아는 것을 적어 둔다.
NOTE = {
    "rawsprites/heroicons":   ("★", "사도 아이콘 252×252 SD 전신 — 지금 카드 그림으로 쓰는 것"),
    "rawsprites/monster":     ("★", "몬스터 아이콘 — 적 그림으로 바로 쓸 수 있다"),
    "rawsprites/skillicons":  ("★", "스킬 아이콘 — 카드 아이콘"),
    "rawsprites/roguelike":   ("★", "게임 안 로그라이크 모드의 UI — 참고할 만하다"),
    "rawsprites/asideicons":  ("○", "어사이드 아이콘"),
    "rawsprites/equipicons":  ("○", "장비 아이콘 — 유물·보상에 쓸 수 있다"),
    "rawsprites/dialoguecut": ("○", "대화 컷신 그림"),
    "rawsprites/story":       ("○", "스토리 그림 — 가장 큰 덩어리"),
    "rawsprites/gacha":       ("·", "뽑기 UI"),
    "rawsprites/stagelist":   ("○", "스테이지 목록 그림 — 지도 칸에 쓸 만하다"),
    "background/atlases":     ("○", "배경 — 전투 배경으로"),
    "spine/ingame":           ("★", "전투용 SD 스파인 (부품 단위 — 런타임 필요)"),
    "spine/standing":         ("○", "스탠딩 스파인 (부품 단위 — 런타임 필요)"),
    "spine/outgame":          ("·", "로비·극장 연출 — 대부분 theme_theater"),
    "spine/minimi":           ("○", "미니미(스틱 SD)"),
    "audio/kor/voice":        ("○", "한국어 음성 — 2.3GB. 사도 데스크가 쓰는 것"),
    "audio/bgm":              ("○", "배경음"),
    "audio/sfx":              ("★", "효과음 — 타격음 등"),
    "table":                  ("×", "게임 표 데이터 — 암호화돼 있다. 푸는 건 이 프로젝트가 하지 않는 일"),
    "prefab":                 ("·", "유니티 프리팹 — 그대로 쓰기 어렵다"),
    "atlases":                ("○", "UI 아이콘 모음 (몬스터·펫·유물 아이콘 포함)"),
    "Movies":                 ("·", "영상"),
    "fonts":                  ("○", "글꼴 — 저작권 확인 필요"),
}

def log(m): print(m, flush=True)

def adb(exe, dev, *a, timeout=300):
    return subprocess.run([exe, "-s", dev, *a], env=ENV, capture_output=True, timeout=timeout)

def sh(exe, dev, cmd, timeout=300):
    p = adb(exe, dev, "shell", cmd, timeout=timeout)
    if p.returncode != 0: return []
    return [l.rstrip() for l in p.stdout.decode("utf-8", "ignore").splitlines() if l.strip()]

def find_device(exe, serial):
    for dev in ([serial] if serial else PORTS):
        subprocess.run([exe, "connect", dev], env=ENV, capture_output=True, timeout=30)
        if sh(exe, dev, f"ls {BASE}/spine", timeout=30): return dev
    return None

def scan(exe, dev, path):
    """path 아래 한 단계 — (이름, KB, 파일수) 목록. 크기 순."""
    out = []
    lines = sh(exe, dev, f'for d in {path}/*; do n=$(ls -1 "$d" 2>/dev/null | wc -l); s=$(du -sk "$d" 2>/dev/null | cut -f1); echo "$s|$n|$(basename "$d")"; done', timeout=600)
    for l in lines:
        parts = l.split("|")
        if len(parts) != 3: continue
        try: kb = int(parts[0].strip())
        except ValueError: continue
        out.append({"name": parts[2].strip(), "kb": kb, "files": int(parts[1].strip() or 0)})
    out.sort(key=lambda x: -x["kb"])
    return out

def mb(kb): return f"{kb/1024:.1f}MB" if kb >= 1024 else f"{kb}KB"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adb"); ap.add_argument("--serial")
    ap.add_argument("--json", action="store_true", help="문서 없이 JSON 만")
    ap.add_argument("--out", default="docs/02-꺼낼수있는것.md")
    a = ap.parse_args()

    exe = a.adb or next((p for p in ADB_CANDIDATES if os.path.exists(p)), None)
    if not exe: sys.exit("adb.exe 를 찾지 못했습니다. --adb 로 알려 주세요.")
    dev = find_device(exe, a.serial)
    if not dev: sys.exit("트릭컬 데이터가 있는 기기가 없습니다. 앱플레이어에서 게임을 한 번 띄워 주세요.")
    log(f"기기: {dev}")

    log("최상위를 세는 중…")
    top = scan(exe, dev, BASE)
    # 덩어리가 큰 것들만 한 단계 더 들어간다 (전부 들어가면 몇 분씩 걸린다)
    DEEP = ["rawsprites", "spine", "audio", "background", "atlases", "prefab", "table"]
    tree = {}
    for t in top:
        if t["name"] in DEEP:
            log(f"  {t['name']} 안을 세는 중…")
            tree[t["name"]] = scan(exe, dev, f"{BASE}/{t['name']}")
    if "audio" in tree:                       # audio/kor 는 한 겹 더 (voice 하나뿐)
        log("  audio/kor 안을 세는 중…")
        tree["audio/kor"] = scan(exe, dev, f"{BASE}/audio/kor")

    data = {"_meta": {"device": dev, "base": BASE}, "top": top, "tree": tree}
    os.makedirs("assets", exist_ok=True)
    with open("assets/available.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"→ assets/available.json")
    if a.json: return

    total = sum(t["kb"] for t in top)
    L = []
    L.append("# 꺼낼 수 있는 것")
    L.append("")
    L.append("> `tools/survey.py` 가 기기를 훑어 자동으로 만든 것입니다. 손으로 고치지 마세요.")
    L.append(f"> 읽기만 하고 내려받지 않습니다. 전부 합쳐 **{mb(total)}**.")
    L.append("")
    L.append("표시: ★ 이 게임에 바로 쓸 것 · ○ 쓸 만함 · · 당장은 아님 · × 못 읽음")
    L.append("")
    L.append("스파인·스프라이트 번들은 암호화돼 있지 않아 UnityPy 로 그대로 읽힙니다.")
    L.append("`table` 만 암호화돼 있습니다 — **보호를 푸는 일은 하지 않습니다.** 수치가 필요하면 직접 정합니다.")
    L.append("")
    L.append("'항목'은 그 폴더 바로 아래의 개수입니다. 그 안에 또 폴더가 있으면 실제 파일은 더 많습니다.")
    L.append("")
    L.append("## 큰 덩어리")
    L.append("")
    L.append("| | 종류 | 용량 | 설명 |")
    L.append("|---|---|---|---|")
    for t in top[:14]:
        mark, note = NOTE.get(t["name"], ("", ""))
        L.append(f"| {mark} | `{t['name']}` | {mb(t['kb'])} | {note} |")
    L.append("")

    for key, items in tree.items():
        if not items: continue
        L.append(f"## {key}")
        L.append("")
        L.append("| | 이름 | 용량 | 항목 | 설명 |")
        L.append("|---|---|---|---|---|")
        # 큰 것 40개 + 표시를 달아 둔 것은 작아도 반드시 보여 준다
        shown, rest = [], []
        for i, it in enumerate(items):
            if i < 40 or f"{key}/{it['name']}" in NOTE: shown.append(it)
            else: rest.append(it)
        for it in shown:
            mark, note = NOTE.get(f"{key}/{it['name']}", ("", ""))
            L.append(f"| {mark} | `{it['name']}` | {mb(it['kb'])} | {it['files']} | {note} |")
        if rest:
            L.append(f"| | *…그 밖 {len(rest)}개* | {mb(sum(x['kb'] for x in rest))} | {sum(x['files'] for x in rest)} | |")
        L.append("")

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    log(f"→ {a.out}")

if __name__ == "__main__":
    main()
