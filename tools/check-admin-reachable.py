#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""어드민 화면에 **메뉴에서 닿을 수 있는지** 본다 (A-711).

    python3 tools/check-admin-reachable.py      → 어긋나면 종료 코드 1

왜 이 검사가 필요한가
---------------------
`admin/bim-requests.html` 은 사이드바 메뉴 17곳에도, 대시보드 카드 9장에도,
다른 어드민 쪽의 머리글 내비에도 없었다. 저장소에서 그 쪽을 가리키는 자리는
알림 메일 본문 한 줄뿐이었다.

한국 건축사가 제품 쪽에서 BIM·CAD 파일을 요청하면 `bim-requests` 에 담기고
승인 대기로 선다. 승리님이 어드민에 로그인해 메뉴를 다 눌러도 그 목록에
닿을 수 없고, **주소를 손으로 치거나 알림 메일에서 URL 을 찾아야** 했다.
A-624 가 기록한 메일 실패가 재발하면 요청은 쌓이고 아무 화면도 그 사실을
말하지 않는다 — **닿을 수 없는 화면은 없는 화면과 같다.**

링크 검사(`check-links.py`)로는 안 잡힌다. 그 검사는 「적힌 링크가 살아
있는가」를 묻고, 이건 「**적힌 링크가 없다**」는 문제다. 없는 것은 깨지지 않는다.

제외는 까닭을 적는다
--------------------
메뉴에 없어도 되는 쪽이 있다. 까닭 없이 제외하지 않는다 — 까닭을 적어 두면
그 까닭이 **낡았을 때** 다음 사람이 알아본다(실제로 `trend-submissions` 의
까닭은 A-489 가 확인했고 아직 참이다).
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAV = 'admin/js/admin-nav.js'

EXEMPT = {
    'dashboard.html':
        '어드민의 중심 쪽 자체다 — 모든 `view` 항목이 여기 해시로 모인다',
    'trend-submissions.html':
        'A-489 가 확인했다: 이 컬렉션에 **쓰는 코드가 사이트에 없다**. '
        '`submit-trend.html` 은 안내 쪽이고 폼도 제출 핸들러도 없다. '
        '기능이 생기면 그때 메뉴에 올린다 — `admin-nav.js:44` 에 그렇게 적혀 있다',
}


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8', errors='replace').read()


def main():
    nav = read(NAV)
    if nav is None:
        print('x %s 를 못 읽었다 — 메뉴가 없으면 셀 수 없다' % NAV)
        return 1

    targets = set(re.findall(r"target:\s*'([^']+)'", nav))
    if len(targets) < 10:
        print('x 메뉴 항목이 %d개만 보인다 — 탐지가 멈췄는지 보라' % len(targets))
        return 1

    admin_dir = os.path.join(ROOT, 'admin')
    pages = sorted(n for n in os.listdir(admin_dir) if n.endswith('.html'))

    problems, notes = [], []
    for n in pages:
        if n in targets:
            continue
        if n in EXEMPT:
            notes.append('%s — %s' % (n, EXEMPT[n]))
            continue
        problems.append('admin/%s 에 메뉴에서 닿을 길이 없다. '
                        '운영자는 주소를 손으로 쳐야 한다' % n)

    # 거울상: 메뉴가 **없는 쪽**을 가리키면 그것도 결함이다(A-658 과 같은 모양)
    for t in sorted(targets):
        if not t.endswith('.html'):
            continue
        if not os.path.exists(os.path.join(admin_dir, t)):
            problems.append('메뉴가 admin/%s 를 가리키는데 그 파일이 없다' % t)

    print('어드민 닿기: 쪽 %d개 · 메뉴 항목 %d개를 맞춰 봤다' % (len(pages), len(targets)))
    for x in sorted(notes):
        print('  (까닭 있는 제외: %s)' % x)

    if problems:
        print()
        print('실패 %d건:' % len(problems))
        for p in sorted(problems):
            print('  x %s' % p)
        print()
        print('닿을 수 없는 화면은 없는 화면과 같다 — 접수는 쌓이고 아무도 모른다')
        return 1

    print('결과: 통과 — 모든 어드민 쪽에 메뉴에서 닿는다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
