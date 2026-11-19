#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""관리·포털·인증 쪽에 색인 금지 표시가 있나 (A-642, 2026-11-20)

왜 있나
------
브론즈 49차 N49-6 을 좇다 드러났다. Netlify 는 `publish = "."` 로 저장소를
통째로 올린다. 그래서 `admin/` 7쪽과 `brand-portal/dashboard.html` 이
**누구나 열 수 있는 주소**로 서 있었는데, 그 중 **어느 쪽에도 noindex 가 없었다**
(auth/ 3쪽만 갖고 있었다).

robots.txt 에는 Disallow 가 적혀 있었다. 그러나 robots.txt 는 **기어다니는 것만**
막고 **색인은 못 막는다** — 다른 데서 링크가 걸리면 내용을 안 읽은 채로도
주소가 검색결과에 선다. 그래서 쪽마다 meta 를 넣고 `_headers` 로 한 번 더 덮었다.

※ 데이터가 새는 문제가 아니다. firestore.rules 의 관리 쓰기는 전부 isAdmin()
  이메일 허용목록을 거치고 공개 생성은 허니팟을 거친다 — 여기서 막는 것은
  **노출**이지 접근이 아니다. 그래도 관리 화면의 구조·필드 이름·수집 항목이
  검색에 서는 것은 그 자체로 손해다.

무엇을 보나
----------
1) PRIVATE_DIRS 밑의 모든 .html 에 `<meta name="robots" ... noindex ...>` 가 있나
2) `_headers` 에 그 구역마다 `X-Robets-Tag: noindex` 가 있나

★ **주석을 먼저 걷어낸다.** 같은 날 A-641 에서 check-standalone-css.py 가
  `/* */` 안에 적힌 처방을 「있다」로 읽는 것을 발견했고, A-619 에서도 HTML
  주석에 적힌 「style.css」를 「싣는다」로 읽었다. 문자열로 세는 검사기는
  주석부터 걷어낼 것 — 세 번째라 이 검사기는 처음부터 그렇게 적는다.

    python3 tools/check-noindex.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVATE_DIRS = ['admin', 'brand-portal', 'auth']
ROBOTS_META = re.compile(
    r'<meta[^>]+name\s*=\s*["\']robots["\'][^>]*content\s*=\s*["\'][^"\']*noindex', re.I)
XROBOTS = re.compile(r'^\s*X-Robots-Tag\s*:\s*[^\n]*noindex', re.I | re.M)


def strip_comments(s):
    """HTML 주석과 CSS/JS 블록 주석을 걷는다 — 주석은 표시가 아니다."""
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return s


def main():
    missing_meta, checked = [], 0
    for d in PRIVATE_DIRS:
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for root, dirs, fs in os.walk(full):
            dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules')]
            for f in sorted(fs):
                if not f.endswith('.html'):
                    continue
                rel = os.path.relpath(os.path.join(root, f), ROOT).replace(os.sep, '/')
                src = strip_comments(
                    open(os.path.join(root, f), encoding='utf-8', errors='replace').read())
                # 리다이렉트 껍데기는 내용이 없다 — 그래도 표시는 있어야 한다
                checked += 1
                if not ROBOTS_META.search(src):
                    missing_meta.append(rel)

    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1

    missing_hdr = []
    hp = os.path.join(ROOT, '_headers')
    if not os.path.exists(hp):
        missing_hdr.append('_headers 파일 자체가 없다')
    else:
        raw = open(hp, encoding='utf-8', errors='replace').read()
        # 주석 줄(#) 걷기 — _headers 는 # 주석을 쓴다
        body = '\n'.join(l for l in raw.splitlines() if not l.lstrip().startswith('#'))
        # 경로 구역별로 쪼개서, 그 구역 안에 X-Robots-Tag 가 있는지 본다
        for d in PRIVATE_DIRS:
            want = '/%s/*' % d
            i = body.find(want)
            if i < 0:
                missing_hdr.append('%s 구역이 _headers 에 없다' % want)
                continue
            nxt = body.find('\n/', i + 1)
            chunk = body[i:nxt if nxt > 0 else len(body)]
            if not XROBOTS.search(chunk):
                missing_hdr.append('%s 구역에 X-Robots-Tag: noindex 가 없다' % want)

    print('검사함  비공개 구역 html %d쪽 · _headers 구역 %d개'
          % (checked, len(PRIVATE_DIRS)))
    if missing_meta or missing_hdr:
        for rel in missing_meta:
            print('  결함 — 색인 금지 meta 가 없다:', rel)
        for m in missing_hdr:
            print('  결함 — _headers:', m)
        print('     까닭: robots.txt 의 Disallow 는 기어다니는 것만 막고 색인은 못 막는다.')
        return 1
    print('비공개 구역 색인 금지 표시 — 빠진 곳 없음')
    return 0


sys.exit(main())
