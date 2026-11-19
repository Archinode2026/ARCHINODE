#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「본문으로 건너뛰기」가 탭 차례의 **첫째**인가 (A-643, 2026-11-20)

왜 있나
------
브론즈 49차 N49-8. `order-complete.html` 에서 건너뛰기 링크가 `<body>` 가 아니라
**머리글 전체 뒤**(309~349행 다음)에 적혀 있었다. 실측으로 탭 차례 **12번째**였다
(다른 쪽은 전부 1번째). 건너뛰기 링크는 머리글의 링크 열한 개를 **지나치라고**
있는 것인데, 그 열한 개를 다 지나야 닿았다 — 있으나 마나였다.

A-237 이 231쪽에 이 링크를 넣을 때 자리까지 함께 세지 않았다. 「있는가」와
「첫째인가」는 다른 질문이고, 지금까지 앞의 것만 셌다.

무엇을 보나
----------
건너뛰기 링크가 있는 쪽마다, 그 링크 **앞에** 초점 받을 수 있는 것이 하나도
없어야 한다. 주석은 먼저 걷는다(A-619·A-641 에서 두 번 걸린 함정).

    python3 tools/check-skip-link-first.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'docs', 'assets'}
SKIP = re.compile(r'<a[^>]+class="[^"]*\bskip-link\b', re.I)
# 초점을 받을 수 있는 것 — 건너뛰기 링크 앞에 이게 있으면 안 된다
FOCUSABLE = re.compile(
    r'<(?:a\s[^>]*href=|button\b|select\b|textarea\b|summary\b|input\b)', re.I)


def strip_comments(s):
    return re.sub(r'<!--.*?-->', '', s, flags=re.S)


def main():
    checked, bad = 0, []
    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in sorted(fs):
            if not f.endswith('.html'):
                continue
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, ROOT).replace(os.sep, '/')
            src = strip_comments(open(fp, encoding='utf-8', errors='replace').read())
            m = SKIP.search(src)
            if not m:
                continue            # 건너뛰기를 안 두는 운영 도구 — 이 검사 밖이다
            checked += 1
            bodym = re.search(r'<body[^>]*>', src, re.I)
            start = bodym.end() if bodym else 0
            before = src[start:m.start()]
            first = FOCUSABLE.search(before)
            if first:
                # 몇 개가 앞서는지도 알려 준다 — 하나인지 열하나인지는 다른 이야기다
                cnt = len(FOCUSABLE.findall(before))
                line = src[:m.start()].count('\n') + 1
                bad.append('%s: 건너뛰기 앞에 초점 받는 것이 %d개 있다 '
                           '(첫째는 %s… / 링크는 %d행)'
                           % (rel, cnt, first.group(0)[:18], line))

    print('검사함  건너뛰기 링크를 둔 쪽 %d개' % checked)
    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1
    if bad:
        for x in bad[:20]:
            print('  결함 —', x)
        if len(bad) > 20:
            print('  … 그리고 %d쪽 더' % (len(bad) - 20))
        print('     까닭: 건너뛰기는 머리글을 **지나치라고** 있다. 머리글 뒤에 두면 있으나 마나다.')
        return 1
    print('건너뛰기 링크가 탭 차례 첫째가 아닌 쪽 — 없음')
    return 0


sys.exit(main())
