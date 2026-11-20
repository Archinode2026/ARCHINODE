#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""언어가 **주소에** 실리나, 그리고 게이트가 언어로 가려지지 않나 (A-650, 2026-11-21)

왜 있나
------
승리님 지적에서 나왔다. 언어가 `localStorage` 에만 있어서:
  · 영문 화면 링크를 보내도 받는 사람은 **자기 저장값대로** 봤다
  · 구글로 들어온 유럽 브랜드는 한국어 메뉴를 보고 자기 입구를 못 찾았다
주소가 상태를 안 들고 있으면 **공유·북마크·검색 결과가 전부 어긋난다.**
그리고 hreflang 이 0줄이라 검색엔진이 영문판의 존재를 몰랐다.

A-649 에서 머리글의 한 슬롯이 **언어로 대상을 가르던 것**(영어=브랜드 CTA,
한국어=바이어 CTA)을 문(`nav-gate`)으로 떼어냈다. 이 검사는 그게 되돌아가지
않게 지킨다 — 「언어는 언어만, 대상은 문으로」.

무엇을 보나
----------
1) `lang.js` 에 주소 읽기(`langFromUrl`)와 주소 쓰기(`syncLangToUrl`)가
   **주석이 아닌 코드로** 살아 있나
2) 색인되는 쪽마다 hreflang 세 줄(ko·en·x-default)이 canonical 과 짝이 맞나
3) `nav-cta` 와 `announcement-bar` 에 `data-lang-only` 가 붙지 않았나
   (대상을 가르는 자리는 문이어야 한다)

★ 주석을 먼저 걷는다 — A-619·A-641 에서 두 번 걸린 함정이다.

    python3 tools/check-lang-url.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'docs', 'assets', 'previews'}

# 문 안(브랜드 게이트)의 쪽들. 여기서는 대상이 **이미 선언돼** 있으므로
# 언어 가리개가 「대상 가르기」가 아니라 「번역이 덜 됨」이다 — 그쪽은
# check-lang-contract.py 가 본다. 이 검사의 3번 규칙은 **바이어 쪽**에서
# 대상이 언어로 갈리는 것을 막는 것이므로 문 안은 면제한다.
# (면제가 결함을 덮지 않게, 면제한 쪽 수를 끝에 적는다.)
GATE_PAGES = {'for-brands.html', 'list-your-brand.html', 'brand-guide.html',
              'fair-support.html'}


def strip_html_comments(s):
    return re.sub(r'<!--.*?-->', '', s, flags=re.S)


def strip_js_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'(?m)^\s*//.*$', '', s)
    return s


def main():
    bad, checked, gated = [], 0, 0

    # ── 1) lang.js 가 주소를 읽고 쓰나
    lp = os.path.join(ROOT, 'lang.js')
    if not os.path.exists(lp):
        print('  결함 — lang.js 가 없다')
        return 1
    js = strip_js_comments(open(lp, encoding='utf-8', errors='replace').read())
    if not re.search(r'function\s+langFromUrl\s*\(', js):
        bad.append('lang.js: langFromUrl() 이 없다 — 주소의 ?lang= 을 못 읽는다')
    elif not re.search(r'=\s*langFromUrl\s*\(\s*\)', js):
        bad.append('lang.js: langFromUrl() 을 정의만 하고 **부르지 않는다**')
    if not re.search(r'function\s+syncLangToUrl\s*\(', js):
        bad.append('lang.js: syncLangToUrl() 이 없다 — 토글이 주소에 안 실린다')
    elif not re.search(r'(?<!function )\bsyncLangToUrl\s*\(\s*lang\s*\)', js):
        bad.append('lang.js: syncLangToUrl() 을 정의만 하고 **부르지 않는다**')
    if 'replaceState' not in js:
        bad.append('lang.js: replaceState 가 없다 — pushState 면 뒤로가기가 막힌다')

    # ── 2·3) 쪽마다
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in sorted(filenames):
            if not f.endswith('.html'):
                continue
            fp = os.path.join(dirpath, f)
            rel = os.path.relpath(fp, ROOT).replace(os.sep, '/')
            raw = open(fp, encoding='utf-8', errors='replace').read()
            src = strip_html_comments(raw)
            checked += 1

            # 3) 게이트 규약 — 대상을 가르는 자리에 언어 가리개 금지
            in_gate = rel in GATE_PAGES
            if in_gate:
                gated += 1
            for cls, why in () if in_gate else (('nav-cta', '바이어 CTA'), ('announcement-bar', '공지 띠')):
                if re.search(r'class="[^"]*\b%s\b[^"]*"[^>]*data-lang-only' % cls, src):
                    bad.append('%s: %s(%s)에 data-lang-only 가 붙었다 — '
                               '대상은 문(nav-gate)으로 가른다 (A-649)' % (rel, cls, why))

            # 2) hreflang — 색인되는 쪽만
            if re.search(r'<meta[^>]+name=["\']robots["\'][^>]*noindex', src, re.I):
                continue
            m = re.search(r'<link rel="canonical" href="([^"]+)"', src)
            if not m:
                continue
            got = dict(re.findall(
                r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', src))
            for want in ('ko', 'en', 'x-default'):
                if want not in got:
                    bad.append('%s: hreflang="%s" 가 없다 — '
                               '검색엔진이 다른 언어판을 모른다' % (rel, want))
            if got.get('en') and 'lang=en' not in got['en'] and not got['en'].endswith('-en.html'):
                bad.append('%s: hreflang="en" 이 ?lang=en 도 -en.html 도 아니다 — %s'
                           % (rel, got['en'][:60]))

    print('검사함  쪽 %d개 + lang.js (문 안 %d쪽은 3번 규칙 면제)' % (checked, gated))
    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1
    if bad:
        for x in bad[:25]:
            print('  결함 —', x)
        if len(bad) > 25:
            print('  … 그리고 %d건 더' % (len(bad) - 25))
        return 1
    print('언어·주소 규약 — 어긋난 것 없음')
    return 0


sys.exit(main())
