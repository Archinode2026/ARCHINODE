#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-534 — 한국어가 영어 화면으로 새는 자리.

왜 있나
-------
이미 있던 두 검사는 **각각 반쪽**만 본다.
  · `check-lang-contract.py` [3] 은 **짝이 한쪽만** 있을 때를 잡는다
    (data-en-placeholder 는 있는데 data-ko-placeholder 가 없다).
  · `check-bilingual-messages.py` 는 **영어로만** 나오는 안내를 잡는다.
둘 다 「두 언어 속성이 **아예 없는** 한국어 글자」는 보지 못한다. 그 틈으로
세 건이 지나갔다:
  · A-526  푸터 사업자 신원이 232쪽에서 한국어 전용 — 법정 표시다
  · A-529  약관 최종 수정일이 한 줄에 두 언어
  · A-532  카테고리 카드가 한국어 화면에서 「가구 / 가구」로 겹침
셋 다 검사가 아니라 사람이 찾았다. 그래서 이 검사를 둔다.

무엇을 보는가
-------------
공개 페이지의 **눈에 보이는 글** 중 한글이 든 것이, 언어를 바꿀 길을 가지고
있는지 본다. 다음 중 하나면 덮인 것으로 친다.
  · 자기나 조상에 data-ko / data-ko-html 이 있다 (lang.js 가 다시 칠한다)
  · data-lang-only 가 붙어 있다 (그 언어에서만 보인다)
  · 내비 드롭다운 안이다 (영문 이름과 한글 이름을 **함께** 보여 주는 자리)

한국어로 쓰는 쪽은 아예 보지 않는다 — 매거진·트렌드 기사와 `privacy.html`
(영문 짝은 `privacy-en.html` 이 따로 있다).

예외 명부
---------
덮이지 않았지만 그래도 맞는 자리가 있다. 등기 상호처럼 번역하면 안 되는 말,
또는 스크립트가 한국 손님에게만 띄우는 안내다. 그런 것은 아래 EXCEPT 에
**이유와 몇 곳인지까지** 적어 둔다. 세어 둔 수와 다르면 — 하나가 사라져도,
하나가 늘어도 — 실패로 친다. 「예외」라고 적어 두면 그 뒤로 몇 개가 더
들어와도 조용한 명부가 되는 것을 막는다.

허수 방지
---------
들여다본 페이지가 90개 밑이면 실패로 본다. 검사가 조용히 아무것도 안 보게
되는 일을 막는다. (매거진·트렌드 기사를 빼고 나면 100쪽 안팎이다.)

    python3 tools/check-lang-leak.py
"""
from __future__ import annotations
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANGUL = re.compile(r'[가-힣]')
MIN_PAGES = 90

SKIP_DIR = {'node_modules', '.git', '__pycache__'}
# 운영자 화면과 도구는 손님이 보는 쪽이 아니다
SKIP_PREFIX = ('admin/', 'auth/', 'brand-portal/', 'tools/', 'scripts/')
# 한국어로 쓰는 쪽 — 영문 짝이 따로 있거나 한국어 기사다
KO_BY_DESIGN = ('magazine/', 'trend-report/')
KO_BY_DESIGN_FILES = {'privacy.html'}

VOID = {'br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'area',
        'base', 'col', 'embed', 'param', 'track', 'wbr'}

# 스크립트가 한국 손님에게만 띄우는 덩어리 — 기본은 display:none 이다.
# 이 안은 통째로 한국어가 맞다.
KO_ONLY_IDS = {'bgKoNotice'}

# 덮이지 않았지만 맞는 자리. (파일, 찾을 꼴, 몇 곳, 왜 괜찮은가)
# 수가 달라지면 — 줄어도 늘어도 — 실패한다.
EXCEPT = [
    ('privacy-en.html', r'비비들리바이브 \(VIVIDELIVIBE\)', 2,
     '등기 상호 — 영문 처리방침에서도 등기된 한글 상호를 그대로 적는다(본문·푸터)'),
    ('privacy-en.html', r'박승리 \(Seungri Park\)', 1,
     '등기 대표자 이름 — 영문을 괄호로 함께 적는다'),
    ('privacy-en.html', r'Privacy Policy \(한국어\)', 1,
     '한국어판으로 가는 링크 이름 — 한국어라고 적혀 있어야 찾는다'),
    ('privacy-en.html', r'경기도 안양시 동안구 흥안대로 528', 2,
     '등기 주소 — 영문을 함께 적되 한글 원문을 남긴다(제2조·문의처)'),
    ('contact.html', r'경기도 안양시 동안구 흥안대로 528', 1,
     '영문 주소 바로 밑의 한글 주소 — 한국에서 길을 찾거나 택배를 보낼 때 쓴다'),
    ('request-consultation.html', r'[가-힣]', 8,
     '드롭다운 선택지 8개가 영문과 한글을 한 줄에 함께 보여 준다(관심 분야 4 · '
     '예산 4). **글자 자체가 문의로 저장되는 값**이라 함부로 바꾸면 묵은 기록과 '
     '견줄 수 없다 — 바꿀지는 승리님 판단 대기(2026-11-14). 수를 세어 두었으므로 '
     '이 쪽에 한국어가 하나라도 더 새면 9곳이 되어 걸린다'),
]


class Scan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.hits = []
        self.mute = 0

    def covered(self):
        for tag, a in self.stack:
            if 'data-ko' in a or 'data-ko-html' in a:
                return True
            if 'data-lang-only' in a:
                return True
            if 'nav-dropdown' in a.get('class', ''):
                return True
            if a.get('id') in KO_ONLY_IDS:
                return True
        return False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'template'):
            self.mute += 1
        if tag not in VOID:
            self.stack.append((tag, a))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'template') and self.mute:
            self.mute -= 1
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, d):
        if self.mute or not HANGUL.search(d):
            return
        t = ' '.join(d.split())
        if not t or self.covered():
            return
        self.hits.append((self.getpos()[0],
                          self.stack[-1][0] if self.stack else '?', t))


def strip_comments(s):
    """주석을 **줄 수를 지키며** 지운다. 그냥 지우면 줄 번호가 밀려 검사가
    엉뚱한 자리를 가리킨다(A-531 과 같은 부류의 실수)."""
    return re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)


def pages():
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIR]
        for f in sorted(fn):
            if not f.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/')
            if rel.startswith(SKIP_PREFIX) or rel.startswith(KO_BY_DESIGN):
                continue
            if rel in KO_BY_DESIGN_FILES:
                continue
            yield rel, os.path.join(dp, f)


def main() -> int:
    bad = []
    seen = 0
    counted = [0] * len(EXCEPT)
    rx = [re.compile(pat) for _f, pat, _n, _w in EXCEPT]

    for rel, path in pages():
        seen += 1
        p = Scan()
        try:
            p.feed(strip_comments(open(path, encoding='utf-8').read()))
        except Exception as e:
            bad.append((rel, 0, '읽지 못했다: %s' % e))
            continue
        for line, tag, text in p.hits:
            hit = None
            for i, (f, _pat, _n, _why) in enumerate(EXCEPT):
                if f == rel and rx[i].search(text):
                    hit = i
                    break
            if hit is not None:
                counted[hit] += 1
                continue
            bad.append((rel, line, '<%s> %s' % (tag, text[:62])))

    # 명부의 수가 달라졌으면 — 줄어도 늘어도 — 사람이 다시 봐야 한다
    for i, (f, pat, want, why) in enumerate(EXCEPT):
        if counted[i] != want:
            bad.append(('(예외 명부)', 0,
                        '%s 의 「%s」 를 %d곳으로 적어 뒀는데 %d곳이다 — 명부를 고치거나 '
                        '늘어난 자리를 손봐라 (사유: %s)' % (f, pat, want, counted[i], why)))

    if seen < MIN_PAGES:
        bad.append(('(검사 자체)', 0,
                    '페이지를 %d개만 봤다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (seen, MIN_PAGES)))

    if bad:
        print('덮이지 않은 한국어 %d곳' % len(bad))
        for rel, line, why in bad[:40]:
            print('  · %-34s %5s  %s' % (rel, line or '', why))
        if len(bad) > 40:
            print('  … 그리고 %d곳 더' % (len(bad) - 40))
        print()
        print('  영어로 보는 손님에게는 이 글이 읽히지 않는다.')
        print('  data-en/data-ko 를 달거나, 그 언어에서만 보일 자리면 data-lang-only 를 달아라.')
        print('  번역하면 안 되는 말이면 tools/check-lang-leak.py 의 EXCEPT 에 **이유와 함께** 적어라.')
        return 1

    print('한국어가 새는 자리 — 페이지 %d개, 예외 %d건. 어긋남 없음' % (seen, len(EXCEPT)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
