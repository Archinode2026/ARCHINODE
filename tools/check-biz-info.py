#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-503 — 사업자 신원 표시가 모든 공개 페이지에 같은 값으로 서 있는지.

왜 있는가
---------
전자상거래법 제13조제1항은 통신판매업자에게 **상호·대표자·주소·전화번호·
전자우편주소·사업자등록번호·통신판매업 신고번호**를 사이버몰에 표시하도록
한다. 2026-11-13 에 세어 보니 234개 페이지에 상호·대표자·사업자등록번호·
주소·이메일은 있었고 **통신판매업 신고번호만 한 곳도 없었다.**

그리고 이 저장소는 푸터를 **파일마다 복사해 둔다**(234벌). A-444·A-466·
A-468 에서 되풀이된 실패가 그것이다 — 「사본이 갈려 하나만 고쳐진다」.
그래서 이 검사는 *있는지*만 보지 않고 **값이 전부 같은지**를 본다.

무엇을 보는가
-------------
  1. 푸터 사업자 블록이 있는 모든 페이지에 7종 표시가 다 있는지
  2. 신고번호 문자열이 저장소 전체에서 **한 가지**인지(사본 갈림)
  3. 약관·처리방침(국·영문)에도 신고번호가 있는지
  4. 결제 길목(digital-products.html 구매창)에 신원 표시가 있는지
  5. 허수 방지 — 들여다본 페이지가 220개 밑으로 떨어지면 실패로 본다
     (검사가 조용히 아무것도 안 보게 되는 일을 막는다)

    python3 tools/check-biz-info.py
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 저장소에 적혀 있어야 하는 값 — 통신판매업신고증(제2026-안양동안-0318호) 기준
BIZ_NO      = '640-03-02879'
REPORT_NO   = '2026-안양동안-0318'
REPORT_EN   = '2026-Anyang Dongan-0318'
ORG         = '안양시 동안구청'
NAME        = '비비들리바이브'
ADDR        = '흥안대로 528'
EMAIL       = 'office@archinode.org'
# A-518(2026-11-13): 제13조제1항의 마지막 칸. 신고증에 없어 A-503 때는 비워 뒀고,
# 승리님이 알려 주셔서 채웠다. 국내 꼴과 국제 꼴 둘 다 쓰므로 숫자만 견준다.
TEL_KO      = '070-8602-1319'
TEL_EN      = '+82 70 8602 1319'

# 푸터 블록을 두지 않는 자리 — 관리자·로그인·포털(손님이 물건을 사는 길목이 아니다)
EXEMPT_PREFIX = ('admin' + os.sep, 'auth' + os.sep, 'brand-portal' + os.sep)

MIN_PAGES = 220          # 허수 방지 — 이보다 적게 봤으면 검사가 멈춘 것이다


def html_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.git', '__pycache__')]
        for fn in sorted(filenames):
            if fn.endswith('.html'):
                yield os.path.join(dirpath, fn)


def main() -> int:
    bad = []
    seen = 0
    report_variants = set()

    for path in html_files():
        rel = os.path.relpath(path, ROOT)
        s = open(path, encoding='utf-8').read()

        # 신고번호가 어떤 꼴로 적혀 있는지 모아 둔다 — 사본이 갈렸는지 보려고
        for m in re.finditer(r'제?\s*(20\d{2}-[^\s<|)]{2,24}-\d{3,5})\s*호?', s):
            v = m.group(1)
            if '안양' in v or 'Anyang' in v:
                report_variants.add(v)

        if 'footer-business-info' not in s:
            continue
        if rel.startswith(EXEMPT_PREFIX):
            continue
        seen += 1

        missing = [label for label, needle in (
            ('상호', NAME),
            ('사업자등록번호', BIZ_NO),
            ('통신판매업신고번호', REPORT_NO),
            ('신고기관', ORG),
            ('주소', ADDR),
            ('전화', TEL_KO),
            ('이메일', EMAIL),
        ) if needle not in s]
        if missing:
            bad.append((rel, '푸터에 없음: ' + ' · '.join(missing)))

    # 2) 약관·처리방침 — 푸터 말고 본문에도 있어야 한다
    for rel, needles in (
        ('privacy.html',    [(REPORT_NO, '제2조(회사 정보)'), (TEL_KO, '제2조의 전화번호')]),
        ('terms.html',      [(REPORT_NO, '사업자 정보 상자'), (REPORT_EN, '영문 사업자 정보'),
                             (TEL_KO, '한국어 전화번호'), (TEL_EN, '영문 전화번호')]),
        ('privacy-en.html', [(REPORT_EN, 'Article 2 (Company Information)'), (TEL_EN, '영문 전화번호')]),
    ):
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            bad.append((rel, '파일이 없다'))
            continue
        s = open(p, encoding='utf-8').read()
        for needle, where in needles:
            if needle not in s:
                # 무엇이 없는지 그대로 말한다 — 전에는 전화가 없어도 「신고번호가
                # 없다」고 적었다(깨뜨리기에서 드러났다).
                bad.append((rel, '%s 가 비어 있다 — 「%s」를 찾지 못했다' % (where, needle)))

    # 3) 결제 길목 — 돈을 내기 전에 파는 사람이 누구인지 보여야 한다
    dp = os.path.join(ROOT, 'digital-products.html')
    if os.path.exists(dp):
        s = open(dp, encoding='utf-8').read()
        i = s.find('function dpOpenBuy')
        buy = s[i:] if i >= 0 else ''
        if not buy:
            bad.append(('digital-products.html', 'dpOpenBuy 를 못 찾았다 — 함수 이름이 바뀌었나'))
        else:
            for label, needle in (('상호', NAME), ('사업자등록번호', BIZ_NO),
                                  ('신고번호', REPORT_NO), ('주소', ADDR),
                                  ('전화(한국어)', TEL_KO), ('전화(영문)', TEL_EN)):
                if needle not in buy:
                    bad.append(('digital-products.html', '구매창에 %s 가 없다' % label))

    # 4) 사본 갈림 — 신고번호가 두 가지 이상이면 어딘가 손이 덜 갔다
    if len(report_variants) > 1:
        bad.append(('(저장소 전체)', '신고번호가 여러 꼴로 적혀 있다: ' + ' / '.join(sorted(report_variants))))

    # 5) 허수 방지
    if seen < MIN_PAGES:
        bad.append(('(검사 자체)', '푸터 블록을 %d개만 봤다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (seen, MIN_PAGES)))

    if bad:
        print('어긋남 %d건' % len(bad))
        for rel, why in bad[:40]:
            print('  · %-44s %s' % (rel, why))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        return 1

    print('사업자 신원 표시 — 페이지 %d개, 신고번호 한 가지(%s) · 전화 %s. 어긋남 없음'
          % (seen, REPORT_NO, TEL_KO))
    return 0


if __name__ == '__main__':
    sys.exit(main())
