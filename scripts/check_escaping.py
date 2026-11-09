#!/usr/bin/env python3
"""ARCHINODE 이스케이프 계약 검사 (검수대장 A-167).

왜 필요한가
-----------
이 저장소에는 '같은 글자가 세 가지 표현'으로 돌아다닌다.

  1. HTML 소스        — 이스케이프된 표현 (`&apos;` · `&#x27;`)
  2. JSON / Firestore — 평문 (`'`)
  3. 화면 출력        — 소비자가 그때 한 번 이스케이프

어느 한 곳에서 표현을 혼동하면 두 가지 증상이 나온다.

  · 두 번 이스케이프 → 사용자 화면에 `&apos;` 가 글자로 찍힌다
    `data-en` / `data-ko` 는 lang.js 가 `getAttribute` 로 읽어 `textContent` 로 넣는다.
    즉 속성은 HTML 파서가 한 번 풀면 평문이 되어야 한다. `&amp;apos;` 는 한 겹 많다.

  · 평문이어야 할 JSON 에 엔티티가 섞임 → 소비자가 '제대로' 이스케이프하는 순간
    모든 엔티티가 화면에 드러난다. 반대로 소비자가 이스케이프를 안 하면
    눈에는 괜찮아 보이지만 색인 값의 마크업이 그대로 실행된다(주입).

실행
----
    python3 scripts/check_escaping.py          → 위반이 있으면 종료 코드 1
    python3 scripts/check_escaping.py --fix    → 이중 이스케이프만 자동 복구

A-167 에서 이 두 증상을 다 겪었다. 증상만 고치면 글이 새로 들어올 때 또 들어오므로
계약을 코드로 못 박아 둔다.
"""
from __future__ import annotations
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'archi-diary', 'docs', 'downloads', 'assets'}

ENTITY = r'(?:amp|lt|gt|quot|apos|nbsp|ndash|mdash|hellip|#x?[0-9a-fA-F]+);'
DOUBLE = re.compile(r'&amp;(' + ENTITY + r')')
ANY_ENTITY = re.compile(r'&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;')

# 평문을 담기로 한 JSON 파일들 — 소비자가 출력 시점에 이스케이프한다
PLAIN_JSON = ['search-index.json']


# ── A-405(2026-11-09): 주석은 세지 않는다 ─────────────────────────────────────
# 이 검사는 `deploy.ps1` 에 묶여 **push 를 막는다.** 그런데
# `list-your-brand.html:924` 의 **주석** 한 줄에서 오탐이 나고 있었다:
#
#     // (&amp; 를 마지막에 풀어야 "&amp;lt;" 가 "<" 로 두 번 풀리지 않는다.)
#
# 이스케이프 위험을 **설명하는 주석**이라 그 글자가 당연히 들어 있다. 화면에
# 나가는 내용이 아니다. 그런데 검사가 이것을 위반으로 세어 종료 코드 1 을
# 돌려주므로, `deploy.ps1` 로 배포하면 **멀쩡한 저장소에서 push 가 막힌다.**
#
# 오탐으로 막는 검사는 결국 우회된다 — 그래서 주석을 가린 뒤 센다.
# 다만 **가린 것을 조용히 버리지 않고** 따로 알린다: 가리는 규칙이 틀려
# 진짜 위반을 놓치면 그 줄이 눈에 남아야 한다.
#
# 가리는 것은 셋뿐이다(좁게 잡는다 — 넓게 가리면 진짜 위반을 놓친다):
#   · HTML 주석 `<!-- ... -->`
#   · `/* ... */` 블록 (JS·CSS 공통)
#   · 줄의 **처음**이 `//` 인 줄 (URL 의 `https://` 는 줄 처음에 안 온다)
COMMENT_PATTERNS = [
    re.compile(r'<!--.*?-->', re.S),
    re.compile(r'/\*.*?\*/', re.S),
    re.compile(r'^[ \t]*//[^\n]*', re.M),
]


def mask_comments(s):
    """주석을 같은 길이의 공백으로 바꾼 사본. 길이가 같아 자릿수가 어긋나지 않는다."""
    out = s
    for pat in COMMENT_PATTERNS:
        out = pat.sub(lambda m: ' ' * len(m.group(0)), out)
    return out


def walk(exts):
    for root, ds, fs in os.walk(ROOT):
        ds[:] = [d for d in ds if d not in SKIP_DIRS]
        for fn in sorted(fs):
            if fn.endswith(exts):
                yield os.path.join(root, fn)


def check_double(fix=False):
    """HTML·JSON 에 두 번 이스케이프된 엔티티가 있는지.

    A-405: 주석 안의 것은 `in_comment` 로 따로 모아 돌려준다 — 실패로 세지
    않지만 출력에는 남긴다."""
    bad, fixed, in_comment = [], 0, []
    for p in walk(('.html', '.json')):
        s = io.open(p, encoding='utf-8', errors='replace').read()
        hits = DOUBLE.findall(s)
        if not hits:
            continue
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        masked = mask_comments(s)
        real = DOUBLE.findall(masked)
        if len(real) < len(hits):
            in_comment.append((rel, len(hits) - len(real)))
        if not real and not fix:
            continue
        hits = real or hits
        if fix:
            n = 0
            while True:
                s, k = DOUBLE.subn(r'&\1', s)
                if not k:
                    break
                n += k
            io.open(p, 'w', encoding='utf-8').write(s)
            fixed += n
            print(f'  고침 {rel}: {n}건')
        else:
            bad.append((rel, len(hits), sorted(set('&amp;' + h for h in hits))[:3]))
    return bad, fixed, in_comment


def check_plain_json():
    """평문이어야 할 JSON 에 엔티티가 섞였는지."""
    bad = []
    for name in PLAIN_JSON:
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        try:
            data = json.load(io.open(p, encoding='utf-8'))
        except Exception as e:
            bad.append((name, 0, [f'JSON 파싱 실패: {e}']))
            continue
        found = []

        def scan(v):
            if isinstance(v, str):
                found.extend(ANY_ENTITY.findall(v))
            elif isinstance(v, dict):
                for x in v.values():
                    scan(x)
            elif isinstance(v, list):
                for x in v:
                    scan(x)
        scan(data)
        if found:
            bad.append((name, len(found), sorted(set(found))[:4]))
    return bad


def main():
    fix = '--fix' in sys.argv
    print('── 이중 이스케이프 (HTML · JSON)')
    bad1, fixed, in_comment = check_double(fix=fix)
    if fix:
        print(f'  복구 {fixed}건')
        bad1, _, in_comment = check_double(fix=False)
    if bad1:
        for rel, n, ex in bad1:
            print(f'  ✗ {rel}: {n}건  예: {", ".join(ex)}')
    else:
        print('  ✓ 없음')
    if in_comment:
        for rel, n in in_comment:
            print(f'  (주석 {n}건은 세지 않았다 — {rel}. A-405)')

    print('── 평문 JSON 에 섞인 엔티티')
    bad2 = check_plain_json()
    if bad2:
        for rel, n, ex in bad2:
            print(f'  ✗ {rel}: {n}건  예: {", ".join(ex)}')
            print('     → scripts/make_search_index.py 가 html.unescape 를 거치는지 확인하고 재생성한다')
    else:
        print('  ✓ 없음')

    fail = bool(bad1 or bad2)
    print('\n결과:', '위반 있음' if fail else '통과')
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
