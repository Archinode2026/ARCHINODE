#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""움직임 줄이기 설정을 JS 가 거스르지 않나 (A-603, 2026-11-18)

왜 있나
------
CSS 는 제대로 되어 있었다 — reduce 에서 `scroll-behavior` 가 smooth → auto 로
바뀐다. 그런데 「맨 위로」 단추가 `onclick="window.scrollTo({top:0,
behavior:'smooth'})"` 로 **JS 안에 smooth 를 박아** 두었고, **JS 의 behavior 는
CSS 의 scroll-behavior 를 이긴다.** 그래서 설정을 켠 손님에게도 화면이 1.5초
동안 8,234px 을 흘러 올라갔다(실측: 끔 1,446ms / 켬 1,446ms — 차이 없음).

어지럼·편두통으로 그 설정을 켠 사람에게 **사이트에서 가장 큰 움직임**이 그대로
남아 있었다. 다른 움직임은 전부 멈추는데 이것만 안 멈췄다. 같은 자리가
**228쪽**에 복사돼 있었다.

무엇을 보나
----------
`behavior: 'smooth'` 를 쓰는 자리마다, 그 줄이 움직임 줄이기 설정을 보고
결정하는지 본다. 공용 함수(`archiScrollTop`·`archiScrollIntoView`·
`archiReduceMotion`)를 거치거나, 같은 줄에서 설정을 묻고 있으면 통과.
그냥 박아 둔 smooth 는 실패다.

    python3 tools/check-reduced-motion.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'docs', 'assets'}
SMOOTH = re.compile(r"behavior\s*:\s*['\"]smooth['\"]")
GUARD = re.compile(r'archiReduceMotion|archiScrollTop|archiScrollIntoView|'
                   r'prefers-reduced-motion')


def files():
    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in fs:
            if f.endswith(('.html', '.js')):
                yield os.path.join(root, f)


def main():
    bad = []
    guarded = 0
    seen = 0
    helper_ok = False

    an = os.path.join(ROOT, 'a11y-nav.js')
    if os.path.exists(an):
        src = open(an, encoding='utf-8', errors='replace').read()
        # ★ 처음엔 'window.archiScrollTop' in src 로 봤다. 그러면 이름을
        #   archiScrollTopX 로 바꿔도 **부분 문자열이라 통과한다** — 깨뜨려
        #   시험하다 잡았다. 낱말 경계로 본다.
        helper_ok = (re.search(r'window\.archiScrollTop\s*=', src) is not None
                     and re.search(r'window\.archiScrollIntoView\s*=', src) is not None
                     and 'prefers-reduced-motion' in src)
    if not helper_ok:
        bad.append('a11y-nav.js: archiScrollTop·archiScrollIntoView 와 '
                   'prefers-reduced-motion 판단이 있어야 한다 — 228쪽이 이걸 쓴다')

    for p in sorted(files()):
        rel = os.path.relpath(p, ROOT)
        raw = open(p, encoding='utf-8', errors='replace').read()
        # ★ 주석에 적어 둔 말이 검사에 걸리면 「어긋났다」고 잘못 읽는다.
        #   이 검사를 처음 돌렸을 때 **내가 a11y-nav.js 주석에 적어 둔 나쁜 예시**가
        #   걸렸다 — A-492·A-531 이 이미 적어 둔 함정이고 또 밟았다.
        #   줄 수를 지켜야 줄 번호가 맞으므로 글자만 공백으로 바꾼다.
        raw = re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)),
                     raw, flags=re.S)
        raw = re.sub(r'(?m)^(\s*)//.*$', lambda m: m.group(1), raw)
        raw = re.sub(r'(?s)<!--.*?-->', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), raw)
        lines = raw.split('\n')
        for i, line in enumerate(lines):
            if not SMOOTH.search(line):
                continue
            seen += 1
            # 같은 줄 또는 바로 앞 3줄 안에 설정을 보는 흔적이 있으면 통과
            near = '\n'.join(lines[max(0, i - 3):i + 2])
            if GUARD.search(near):
                guarded += 1
            else:
                bad.append('%s:%d 움직임 줄이기 설정을 묻지 않고 smooth 를 박았다 — %s'
                           % (rel, i + 1, line.strip()[:62]))

    # ── 공용 함수를 쓰는데 **그 파일을 싣지 않는** 쪽 ─────────────────────────
    #    고치고 나서 알았다: brand-portal/dashboard.html 은 a11y-nav.js 를 싣지
    #    않는다. 그래서 `window.archiScrollIntoView` 가 없고, 내가 둔 else 갈래가
    #    그대로 smooth 를 쓴다 — **고친 것처럼 보이고 안 고쳐진 상태**였다.
    #    검사가 「공용 함수를 부르니 통과」로 봤으니 검사도 같이 속았다.
    for p2 in sorted(files()):
        if not p2.endswith('.html'):
            continue
        rel2 = os.path.relpath(p2, ROOT)
        src2 = open(p2, encoding='utf-8', errors='replace').read()
        uses = re.search(r'window\.archiScroll(Top|IntoView)|archiReduceMotion\s*\(', src2)
        if uses and 'a11y-nav.js' not in src2:
            bad.append('%s: 공용 함수(%s)를 쓰는데 a11y-nav.js 를 싣지 않는다 — '
                        '그 함수는 없고 smooth 가 그대로 돈다'
                        % (rel2, uses.group(0)))

    if bad:
        print('움직임 줄이기: 어긋난 곳 %d' % len(bad))
        for b in bad:
            print('  - ' + b)
        print('    → window.archiScrollTop(event) / archiScrollIntoView(el) 를 쓰거나,')
        print('      window.archiReduceMotion() 로 물어서 behavior 를 정하라.')
        return 1
    if seen == 0:
        print('움직임 줄이기: 실패 — smooth 를 쓰는 자리가 0곳이다. '
              '훑기가 멈춘 것으로 본다 (A-433).')
        return 1
    print('움직임 줄이기: smooth 쓰는 자리 %d곳 전부 설정을 보고 결정한다' % guarded)
    return 0


if __name__ == '__main__':
    sys.exit(main())
