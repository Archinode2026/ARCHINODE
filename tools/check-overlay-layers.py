#!/usr/bin/env python3
"""A-629: 손님이 직접 연 것(모달·검색창·햄버거 메뉴)이 쿠키 고지보다 **위에** 있는지.

층 규약:  모달 100001 이상  >  머리글 100000  >  쿠키 고지 99999

왜 중요한가: 아래에 있으면 그 자리를 누른 손가락이 고지의 단추를 누른다. 브론즈 47차
실측으로, 메뉴에서 「자재 소싱 문의」를 누르면 「필수만」이 눌려 **손님이 고른 적 없는
개인정보 선택이 저장됐다**(320px 에서는 「모두 수락」).

A-619 의 첫 판은 세 가지를 놓쳤다(브론즈 47차 N47-7).
  ① `position:fixed` 만 봤다 — 메뉴 패널은 `absolute` 이고 머리글의 쌓임 문맥에
     갇혀 있었다. 그래서 **진짜 깨진 창을 못 봤다.**
  ② 선택자 이름이 overlay|modal|… 에 걸려야 셌다 — `.main-nav.active` 는 안 걸린다.
  ③ `.pd-lightbox` 처럼 **아무 쪽에서도 쓰지 않는 죽은 선택자**를 통과 항목으로
     세어 「5개를 지켰다」는 자신감을 부풀렸다.
그리고 `.js` 가 심는 스타일은 아예 안 봤다.
"""
import os, re, sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ('admin', 'brand-portal', 'node_modules', '.git')
NAME = re.compile(r'overlay|modal|dialog|lightbox|drawer|sheet|main-nav\.active', re.I)
ZIDX = re.compile(r'z-index\s*:\s*(\d+)')
POS = re.compile(r'position\s*:\s*(fixed|absolute|sticky)')


def strip_comments(text):
    """설명문이 검사에 걸리지 않게 줄 수를 지키며 지운다 (A-492·A-531·A-604·A-606)."""
    text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
    return re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)


def files(exts):
    for root, dirs, names in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith('.')]
        for n in names:
            if n.endswith(exts):
                yield os.path.join(root, n)


def read(path):
    return strip_comments(open(path, encoding='utf-8').read())


def banner_z():
    m = ZIDX.search(read(os.path.join(SRC, 'cookie-consent.js')))
    return int(m.group(1)) if m else None


def header_z():
    """머리글의 z-index. 메뉴 패널이 이 안에 갇히므로 이것이 패널의 실제 층이다."""
    css = read(os.path.join(SRC, 'style.css'))
    m = re.search(r'\.header\s*\{([^{}]*)\}', css)
    if not m:
        return None
    z = ZIDX.search(m.group(1))
    return int(z.group(1)) if z else None


def selector_before(text, pos):
    brace = text.rfind('{', 0, pos)
    if brace < 0:
        return ''
    start = max(text.rfind('}', 0, brace), text.rfind(';', 0, brace), text.rfind('\n\n', 0, brace))
    return text[start + 1:brace].strip().replace('\n', ' ')[-120:]


def used_names():
    """HTML·JS 에 실제로 등장하는 class·id 이름. 죽은 선택자를 걸러내는 데 쓴다."""
    blob = []
    for p in files(('.html', '.js')):
        blob.append(read(p))
    return '\n'.join(blob)


def main():
    bz, hz = banner_z(), header_z()
    if bz is None:
        print('검사 못함  쿠키 고지의 z-index 를 못 찾았다'); return 1
    if hz is None:
        print('검사 못함  .header 의 z-index 를 못 찾았다'); return 1

    bad, dead, checked = [], [], 0

    # ── 규약 ①: 머리글이 고지 위여야 한다 (메뉴 패널이 그 안에 갇혀 있다)
    if hz <= bz:
        bad.append('.header z-index %d ≤ 고지 %d — 머리글 안의 햄버거 메뉴가 고지 밑으로 들어간다' % (hz, bz))

    # ── 규약 ②: 메뉴 패널은 스스로 굴러가야 한다 (N47-2)
    css = read(os.path.join(SRC, 'style.css'))
    m = re.search(r'\.main-nav\.active\s*\{([^{}]*)\}', css)
    if not m:
        bad.append('.main-nav.active 규칙을 못 찾았다')
    else:
        blk = m.group(1)
        if 'max-height' not in blk or 'overflow-y' not in blk:
            bad.append('.main-nav.active 에 max-height·overflow-y 가 없다 — 패널이 화면보다 길면 아래쪽이 안 닿는다')

    # ── 규약 ③: 손님이 연 겹칩은 머리글 위여야 한다 (.js 가 심는 것까지 센다)
    names = used_names()
    for path in files(('.html', '.css', '.js')):
        text = read(path)
        for z in ZIDX.finditer(text):
            brace = text.rfind('{', 0, z.start())
            close = text.find('}', z.end())
            if brace < 0 or close < 0:
                continue
            block = text[brace:close]
            # 손님이 **여는** 창만 센다 - position:fixed 로 화면을 덮는 것.
            # 카드 안 장식(예: body.home .editorial-overlay 는 absolute, inset:0 이고
            # z-index 2 다)은 이름에 overlay 가 들어가도 창이 아니다.
            # 메뉴 패널은 absolute 이므로 위의 규약 1, 2 가 따로 지킨다.
            if not re.search(r'position\s*:\s*fixed', block):
                continue
            sel = selector_before(text, z.start())
            if not NAME.search(sel):
                continue
            # cookie-consent.js 가 심는 고지 자신은 기준점이므로 뺀다
            if 'archi-cookie-banner' in sel or 'cc-' in sel:
                continue
            val = int(z.group(1))
            short = sel[-50:]
            # 죽은 선택자인가 — 이름이 HTML·JS 어디에도 안 쓰이면 지키는 척만 하는 것이다
            cls = re.findall(r'[.#]([A-Za-z0-9_-]+)', sel)
            alive = any(re.search(r'["\'\s.#]' + re.escape(c) + r'["\'\s.:,)]', names) for c in cls) if cls else True
            if not alive:
                dead.append('%s  「%s」  어느 쪽에서도 쓰지 않는다' % (os.path.relpath(path, SRC), short))
                continue
            checked += 1
            if val <= hz:
                bad.append('%s  「%s」  z-index %d ≤ 머리글 %d' % (os.path.relpath(path, SRC), short, val, hz))

    print('검사함  고지 %d < 머리글 %d < 모달 · 센 살아 있는 겹칩 %d개' % (bz, hz, checked))
    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다(선택자 이름이 바뀌었나?)')
        return 1
    for d in dead:
        print('  결함 — 죽은 선택자를 지키는 척하고 있다:', d)
    for b in bad:
        print('  결함 —', b)
    if dead or bad:
        return 1
    print('고지·머리글에 덮이는 창 — 없음')
    return 0


sys.exit(main())
