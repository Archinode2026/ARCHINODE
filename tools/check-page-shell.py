#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-675 — **옛 세대 쪽 틀**을 쓰는 쪽을 잡는다.

2026-11-24 진단. 승리님 결정 목록에 「`privacy-en.html` 을 공용 CSS 로 (지금까지
13번 따로 고쳤습니다)」가 올라 있었다. 열어 보니 **CSS 중복이 아니었다** —
그 쪽은 사이트 꾸밈 전체를 **다른 마크업 낱말로** 들고 있는 옛 틀이다:

    지금 틀 (privacy.html 등)   옛 틀 (privacy-en.html)
    footer-col · footer-grid    footer-column · footer-content · footer-copyright
    search-box · search-overlay search-bar · search-input
    scroll-top                  scroll-to-top
    page-hero · breadcrumb      content · company-info

마크업이 다르니 `style.css` 가 닿지 않고, 그래서 그 쪽은 **쪽 단위 CSS 20,794자**
로 자기 꾸밈을 따로 들고 있다 — 변수 대신 `#332e27`·`#fff` 하드코딩, 컨테이너
폭도 다르다(1400px 대 변수, 좌우 20px 대 40px). 전역 수정(A-206 어두운 머리글
대비 · A-630 인쇄 · A-648 굵기 · A-652 꼬리말 투명도)이 **전부 이 쪽을 비껴갔다.**

**고치는 일은 CSS 삭제가 아니라 쪽을 지금 틀로 다시 짜는 것**이고, 법률 쪽이라
브라우저 실측 없이 밤에 혼자 할 일이 아니다. 그래서 여기서는 두 가지만 한다:
  ① 옛 틀 낱말을 쓰는 쪽을 **센다** — 새로 생기면 바로 잡힌다
  ② 알려진 쪽은 KNOWN 에 **까닭과 함께** 둔다. 영원히 빨간 검사는 아무도 안 본다
"""
from __future__ import annotations
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'docs', 'scripts', 'tools', 'assets'}

# 옛 틀만 쓰는 낱말 → 지금 틀의 짝
OLD_SHELL = {
    'footer-column':   'footer-col',
    'footer-content':  'footer-grid',
    'footer-copyright': 'footer-business-info',
    'footer-bottom-left': 'footer-bottom-links',
    'search-bar':      'search-box',
    'search-input':    '(지금 틀은 search-overlay 안에서 다룬다)',
    'scroll-to-top':   'scroll-top',
}

# 알려진 쪽 — 까닭을 반드시 적는다
KNOWN = {
    'privacy-en.html':
        '옛 세대 틀. 쪽 단위 CSS 20,794자로 자기 꾸밈을 따로 든다. 지금 틀로 다시 '
        '짜야 하고(법률 쪽이라 브라우저 실측 필요) 승리님 목록 ⓔ-19 에 있다. '
        '전역 수정이 비껴간 이력: A-206 · A-630 · A-641 · A-648 · A-652',
}

def walk():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                yield os.path.join(base, f)

def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')

def main():
    found = {}
    for p in walk():
        s = io.open(p, encoding='utf-8', errors='replace').read()
        s = re.sub(r'<!--[\s\S]*?-->', '', s)
        body = re.sub(r'<(script|style)[\s\S]*?</\1>', '', s)
        # 클래스 **이름 하나하나**로 쪼개 비교한다. 정규식으로 문자열 안을 보면
        # `class="x-footer-column"` 도 `\bfooter-column\b` 에 걸린다(하이픈이 단어
        # 경계다) — 멀쩡한 클래스를 옛 틀로 오인한다. 2026-11-24 에 내 깨기 시험 ②가
        # 안 울려서 알았다. **시험이 안 울리면 시험을 의심하기 전에 검사기를 본다.**
        names = set()
        for m in re.finditer(r'class="([^"]*)"', body):
            for c in m.group(1).split():
                names.add(c)
        hits = sorted(n for n in names if n in OLD_SHELL)
        if hits:
            found[rel(p)] = sorted(hits)

    new_pages = {k: v for k, v in found.items() if k not in KNOWN}
    stale = [k for k in KNOWN if k not in found]

    print('쪽 틀 세대 검사 (A-675)')
    print('  옛 틀 낱말 %d종을 센다 · 아는 쪽 %d개' % (len(OLD_SHELL), len(KNOWN)))
    for k in sorted(KNOWN):
        mark = '있음' if k in found else '**이제 안 쓴다**'
        print('     %-22s %s' % (k, mark))
        if k in found:
            print('        쓰는 낱말: %s' % ', '.join(found[k]))
    if stale:
        print('  ※ 이제 옛 틀을 안 쓰는 쪽 %d개 — KNOWN 에서 치울 것: %s' % (len(stale), ', '.join(stale)))
    if new_pages:
        print('')
        for k, v in sorted(new_pages.items()):
            print('  ✗ 옛 틀로 만든 쪽이다: %s' % k)
            for old in v:
                print('       class="%s" → 지금 틀은 %s' % (old, OLD_SHELL[old]))
        print('\n옛 틀 쪽 %d개' % len(new_pages))
        return 1
    print('옛 틀로 **새로 만든** 쪽 — 없음')
    return 0

if __name__ == '__main__':
    sys.exit(main())
