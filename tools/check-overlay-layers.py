#!/usr/bin/env python3
"""A-619: 손님이 직접 연 창(모달·오버레이)이 쿠키 고지보다 **위에** 있는지 본다.

아래에 있으면 창의 단추가 고지에 덮인다. 덮이면 그 자리를 누른 손가락이
고지의 「필수만」을 눌러, 문의는 사라지고 개인정보 설정만 바뀐다(실측 390x844).
A-610 의 body{padding-bottom} 은 본문만 비키게 하므로 position:fixed 에는 안 닿는다.

어드민·브랜드 포털은 쿠키 고지를 싣지 않으므로 세지 않는다. 넷리파이 배지
(2147483645)는 우리 것이 아니다.
"""
import os, re, sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ('admin', 'brand-portal', 'node_modules', '.git')
NAME = re.compile(r'overlay|modal|dialog|lightbox|drawer|sheet', re.I)
ZIDX = re.compile(r'z-index\s*:\s*(\d+)')


def strip_comments(text):
    """설명문이 검사에 걸리지 않게 줄 수를 지키며 지운다 (A-492·A-531·A-604·A-606)."""
    text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
    return re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)


def banner_z():
    src = strip_comments(open(os.path.join(SRC, 'cookie-consent.js'), encoding='utf-8').read())
    m = ZIDX.search(src)
    return int(m.group(1)) if m else None


def files():
    for root, dirs, names in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith('.')]
        for n in names:
            if n.endswith(('.html', '.css')):
                yield os.path.join(root, n)


def selector_before(text, pos):
    """pos 앞에서 가장 가까운 '{' 를 찾아, 그 앞의 선택자 줄을 돌려준다."""
    brace = text.rfind('{', 0, pos)
    if brace < 0:
        return ''
    start = max(text.rfind('}', 0, brace), text.rfind(';', 0, brace),
                text.rfind('\n\n', 0, brace))
    return text[start + 1:brace].strip().replace('\n', ' ')[-120:]


def main():
    bz = banner_z()
    if bz is None:
        print('검사 못함  쿠키 고지의 z-index 를 못 찾았다')
        return 1

    checked, bad = 0, []
    for path in files():
        text = strip_comments(open(path, encoding='utf-8').read())
        for m in ZIDX.finditer(text):
            brace = text.rfind('{', 0, m.start())
            close = text.find('}', m.end())
            if brace < 0 or close < 0:
                continue
            block = text[brace:close]
            if 'position' not in block or not re.search(r'position\s*:\s*fixed', block):
                continue
            sel = selector_before(text, m.start())
            if not NAME.search(sel):
                continue
            checked += 1
            z = int(m.group(1))
            if z <= bz:
                bad.append('%s  「%s」  z-index %d ≤ 고지 %d' % (
                    os.path.relpath(path, SRC), sel[-50:], z, bz))

    print('검사함  고지 z-index %d · 센 고정 겹칩 %d개' % (bz, checked))
    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다(선택자 이름이 바뀌었나?)')
        return 1
    if bad:
        for b in bad:
            print('  결함 —', b)
        return 1
    print('고지에 덮이는 창 — 없음')
    return 0


sys.exit(main())
