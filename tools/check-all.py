#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ARCHINODE 검사 모음 — 있는 검사를 한 번에 돌린다.

    python3 tools/check-all.py          → 어긋난 것이 있으면 종료 코드 1
    python3 tools/check-all.py --list   → 무엇을 돌리는지만 보여 준다

왜 필요한가 (A-406)
-------------------
2026-11-09 에 세어 보니 검사·시험 도구가 **여덟 개**였고 두 폴더에
흩어져 있었다(`scripts/` 넷, `tools/` 넷). 그런데 **배포 경로(`tools/deploy.ps1`)에
묶여 있던 것은 `check_escaping.py` 하나**였다. 나머지 일곱은 **사람이
기억해야** 돌았다.

A-329 → A-385 에서 이미 같은 실패를 겪었다: 사각지대를 적어 두고
「다음부터 확인하자」로 남기면 그 사각지대는 그대로 있다. 검사를 만들어도
**부르는 자리가 없으면 똑같다.**

그리고 그날 돌려 보니 **`check_escaping.py` 가 실제로 어긋나 있었다** —
주석 한 줄 때문에 오탐이었고(A-405 에서 고쳤다), `deploy.ps1` 로 배포하면
멀쩡한 저장소에서 push 가 막히는 상태였다. 아무도 몰랐던 이유는
승리님이 `git push` 로 직접 밀기 때문이다. **부르지 않는 검사는 틀린 채로
썩는다.**

검사를 새로 만들면
------------------
아래 CHECKS 에 한 줄 더해라. 그게 작업의 일부다.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (이름, 실행기, 경로, 왜 있는가)
#   실행기: 'py' = 이 파이썬, 'node' = node
CHECKS = [
    ('이스케이프 계약',      'py',   'scripts/check_escaping.py',
     'A-167 · A-405 — 두 번 이스케이프된 엔티티, 평문 JSON 에 섞인 엔티티'),
    ('언어 규약',            'py',   'tools/check-lang-contract.py',
     'A-362 ~ A-402 — 다시 칠하기 · 짝 · 돈·딜러 문구 · 막다른 링크 (검사 8종)'),
    ('독립 CSS 페이지',      'py',   'tools/check-standalone-css.py',
     'A-385 — style.css 를 안 싣는 페이지가 공용 처방을 놓쳤는지'),
    ('검색 회귀',            'node', 'tools/test-search.js',
     'A-397 · A-401 · A-402 — 배열 category · 언어 판정 · 색인 설명'),
]

# Playwright 가 있어야 도는 것들 — 없으면 건너뛴다(실패가 아니다)
BROWSER_CHECKS = [
    ('호버 대비',  'py', 'scripts/check_hover_contrast.py', '호버 상태의 글자 대비'),
    ('좁은 폭',    'py', 'scripts/check_narrow_width.py',   '좁은 화면에서 넘침'),
    ('XSS 출력',   'py', 'scripts/check_xss_output.py',     '출력 이스케이프'),
]


def have_playwright():
    try:
        import playwright  # noqa: F401
        return True
    except Exception:
        return False


def runner_for(kind):
    if kind == 'py':
        return [sys.executable]
    exe = shutil.which('node')
    return [exe] if exe else None


def run_one(name, kind, rel, why, verbose):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        return ('없음', '파일이 없다: ' + rel)
    cmd = runner_for(kind)
    if not cmd:
        return ('건너뜀', 'node 를 찾지 못했다')
    try:
        p = subprocess.run(cmd + [path], cwd=ROOT, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=600)
    except subprocess.TimeoutExpired:
        return ('시간초과', '600초를 넘겼다')
    out = (p.stdout or '') + (p.stderr or '')
    tail = [l for l in out.strip().split('\n') if l.strip()]
    if verbose:
        for l in tail:
            print('      ' + l)
    elif p.returncode != 0:
        for l in tail[-12:]:
            print('      ' + l)
    # 어긋났을 때는 바로 위에 출력 꼬리를 이미 찍었으므로 요약을 붙이지 않는다.
    # (스택 트레이스의 마지막 줄이 요약으로 잡혀 「Node.js v22」 같은 것이 뜬다.)
    return ('통과' if p.returncode == 0 else '어긋남', '')


def main():
    if '--list' in sys.argv:
        print('늘 도는 검사:')
        for name, kind, rel, why in CHECKS:
            print('  %-18s %-36s %s' % (name, rel, why))
        print('\nPlaywright 가 있을 때만 도는 검사:')
        for name, kind, rel, why in BROWSER_CHECKS:
            print('  %-18s %-36s %s' % (name, rel, why))
        return 0

    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    pw = have_playwright()
    todo = list(CHECKS)
    skipped_browser = []
    if pw:
        todo += BROWSER_CHECKS
    else:
        skipped_browser = [c[0] for c in BROWSER_CHECKS]

    results = []
    for name, kind, rel, why in todo:
        print('[검사] %s  (%s)' % (name, rel))
        state, note = run_one(name, kind, rel, why, verbose)
        print('   → %s%s' % (state, ('  · ' + note) if note and state != '통과' else ''))
        results.append((name, state, rel))

    print('')
    print('─' * 60)
    bad = [r for r in results if r[1] not in ('통과', '건너뜀')]
    okn = sum(1 for r in results if r[1] == '통과')
    if skipped_browser:
        print('건너뜀  %s — Playwright 가 없다' % ' · '.join(skipped_browser))
        print('        pip install playwright && playwright install chromium')
    if bad:
        print('어긋난 검사 %d개 / 통과 %d개' % (len(bad), okn))
        for name, state, rel in bad:
            print('   · %-18s %s  (%s)' % (name, state, rel))
        print('')
        print('고치고 다시 돌려라. 하나씩 보려면:')
        for name, state, rel in bad:
            print('   python3 %s' % rel if rel.endswith('.py') else '   node %s' % rel)
        return 1
    print('검사 %d개 전부 통과' % okn)
    return 0


if __name__ == '__main__':
    sys.exit(main())
