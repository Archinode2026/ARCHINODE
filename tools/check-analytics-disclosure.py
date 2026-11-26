#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""분석 도구를 **켠 것과 고지한 것이 맞는지** 본다 (A-721).

    python3 tools/check-analytics-disclosure.py      → 어긋나면 종료 코드 1

왜 이 검사가 필요한가
---------------------
A-496 이 이 집안의 결함을 한 번 잡았다. 쿠키 배너가 「분석용 쿠키를
사용합니다」라고 말하는데 `GA_ID` 가 비어 있어 **아무것도 로드되지 않았다** —
손님에게 사실이 아닌 고지를 한 셈이었다. 그때 **배너**가 로더를 보고 말하게
고쳤다(`window.__archinodeAnalytics.enabled`).

그런데 **처리방침은 그 연결 밖에 남았다.** 방침은 사람이 쓴 글이라
`GA_ID` 가 바뀌어도 따라오지 않는다. 그래서 두 방향의 거짓말이 가능하다:

  · `GA_ID` 를 넣었는데 방침이 「사용하지 않습니다」라고 말한다 — 고지 없이
    수집하는 것이 되고, 개인정보보호법 위반 소지가 있다
  · `GA_ID` 를 비웠는데 방침이 「사용합니다」라고 말한다 — A-496 과 같은
    거짓말이다(쓰지도 않는 것을 쓴다고 한다)

**켠 것과 적은 것은 함께 움직여야 한다.** 그걸 기계가 본다.

무엇을 보는가
-------------
`analytics-loader.js` 의 `GA_ID` 를 읽어 켜졌는지 가린 뒤,
국문·영문 처리방침 **양쪽**에서 세 자리를 센다 — 처리위탁 · 국외이전 · 쿠키.
한 쪽 언어만 고치는 것이 이 저장소에서 반복된 실수다(A-209·A-674).
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LOADER = 'analytics-loader.js'
POLICIES = [
    ('privacy.html', '국문'),
    ('privacy-en.html', '영문'),
]

# 켜졌을 때 **반드시 있어야** 하는 것 — 세 조항에 각각 하나씩.
# 이름을 느슨하게 보지 않는다: 「Google Analytics」 라고 적혀 있어야 한다.
NEEDLE = 'Google Analytics'
NEED_COUNT = 3

# 켜졌을 때 **있으면 안 되는** 말. 방침이 옛말을 하고 있다는 뜻이다.
STALE = [
    '분석용 쿠키를 사용하지 않습니다',
    'do not currently use analytics cookies',
]


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8', errors='replace').read()


def ga_id():
    """`var GA_ID = …` 의 값. 꺼졌으면 None."""
    s = read(LOADER)
    if s is None:
        return False          # 파일이 없다 — 탐지 실패
    m = re.search(r'var\s+GA_ID\s*=\s*([^;]+);', s)
    if not m:
        return False
    v = m.group(1).strip()
    if v in ('null', 'undefined', "''", '""'):
        return None
    m2 = re.match(r"""['"]([^'"]+)['"]""", v)
    return m2.group(1) if m2 else False


def main():
    gid = ga_id()
    if gid is False:
        print('x %s 에서 GA_ID 를 읽지 못했다 — 탐지가 멈췄다. 모양이 바뀌었나' % LOADER)
        return 1

    on = gid is not None
    print('분석 고지: 측정 ID %s' % ('있음 (' + gid + ')' if on else '없음 — 분석 꺼짐'))

    problems = []
    for rel, label in POLICIES:
        s = read(rel)
        if s is None:
            problems.append('%s 처리방침(%s)이 없다' % (label, rel))
            continue
        n = s.count(NEEDLE)
        stale = [t for t in STALE if t in s]

        if on:
            if n < NEED_COUNT:
                problems.append('%s(%s) — 분석을 켰는데 「%s」가 %d곳뿐이다. '
                                '처리위탁·국외이전·쿠키 **세 조항**에 모두 있어야 한다'
                                % (label, rel, NEEDLE, n))
            for t in stale:
                problems.append('%s(%s) — 분석을 켰는데 방침이 아직 「%s」라고 말한다. '
                                '고지 없이 수집하는 것이 된다' % (label, rel, t))
        else:
            if n > 0:
                problems.append('%s(%s) — 분석이 꺼졌는데 방침이 「%s」를 쓴다고 말한다(%d곳). '
                                'A-496 과 같은 거짓말이다' % (label, rel, NEEDLE, n))
            if not stale:
                problems.append('%s(%s) — 분석이 꺼졌는데 「사용하지 않습니다」라는 말이 없다. '
                                '손님은 쓰는지 안 쓰는지 알 수 없다' % (label, rel))
        print('  %s %s — 「%s」 %d곳%s' % ('✓' if not problems else '·', label, NEEDLE, n,
                                          ' · 옛말 ' + str(len(stale)) + '곳' if stale else ''))

    # 배너가 로더를 보고 말하는 연결(A-496)이 끊기지 않았나
    cc = read('cookie-consent.js') or ''
    if '__archinodeAnalytics' not in cc:
        problems.append('cookie-consent.js 가 `__archinodeAnalytics` 를 안 본다 — '
                        'A-496 이 이어 둔 연결이 끊겼다. 배너가 제멋대로 말하게 된다')

    if problems:
        print()
        print('실패 %d건:' % len(problems))
        for p in problems:
            print('  x %s' % p)
        print()
        print('**켠 것과 적은 것은 함께 움직여야 한다** — 방침에 없는 것을 먼저 켜면 그게 위반이다')
        return 1

    print('결과: 통과 — 켠 것과 고지한 것이 맞는다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
