#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공개 폼이 담는 칸을 **어느 화면이 읽는지** 본다 (A-712).

    python3 tools/check-written-unread.py      → 어긋나면 종료 코드 1

왜 이 검사가 필요한가
---------------------
같은 종류의 결함이 **세 번** 나왔다:

  · A-491 — 샘플 요청의 **배송지**. 담기만 하고 아무 화면에도 없었다.
            받아 놓고 못 보니 샘플을 보낼 수가 없었다.
  · A-701 — 소싱 문의의 **품목**. 배정할 브랜드를 고르는 바로 그 근거가
            접수 알림 메일 한 통에만 있었다.
  · A-712 — 개인정보 **동의 기록**. 규칙이 **요구**하는 칸인데(없으면 접수가
            거부된다) 보여 주는 코드가 0곳이었다. 손님이 「동의한 적 없다」고
            하거나 삭제를 요구할 때 꺼내 볼 길이 없었다.

세 번 같은 모양으로 나온 것은 우연이 아니다. **폼에 칸을 더할 때 「이 값을
누가 어디서 보는가」를 묻는 자리가 없다.** 그 질문을 여기서 묻는다.

메일은 「보인다」가 아니다
-------------------------
A-701 이 그 함정이었다. 값이 접수 알림 메일에는 있었다. 그런데 그 메일을
지나치거나 며칠 뒤 인박스에서 처리하면 **어느 품목 문의인지 알 길이 없다.**
그래서 **화면**(`admin/`·`brand-portal/`)만 「읽는 쪽」으로 센다.

이 검사가 **보증하지 않는 것**(적어 둔다)
-----------------------------------------
「그 칸 이름이 화면 코드에 **나타나는가**」를 센다. 「실제로 그려지는가」는
세지 않는다 — 읽는 함수가 있는데 **아무도 부르지 않는** 경우는 통과한다.
깨뜨리기로 확인했다: 표시 호출만 떼면 안 울고, 읽는 코드를 통째로 지우면
세 칸을 집어 운다. 원래 결함(A-491·A-701·A-712)은 **이름이 어디에도 없는**
모양이었으므로 그 종류는 잡는다. 더 깊이 보려면 화면을 띄워 재야 하고,
그건 `scripts/` 의 브라우저 검사가 할 일이다.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 공개 폼 — 손님이 담는 쪽
WRITE_FORMS = [
    'list-your-brand.html', 'products/view.html', 'request-consultation.html',
    'sourcing-inquiry.html', 'brands/view.html', 'submit-trend.html',
    'digital-products.html', 'index.html', 'magazine.html', 'trend-report.html',
    'auth/signup.html',
]

# 운영자·브랜드가 보는 화면 — 읽는 쪽
SCREEN_DIRS = ['admin', 'admin/js', 'brand-portal', 'auth']

# 화면에 안 나와도 되는 칸. **까닭을 적지 않으면 두지 않는다.**
#
# ★★ **「내가 고쳤다」는 제외가 아니다.** 처음에 A-712 로 화면에 올린 칸들을
#   「올렸다」는 까닭으로 여기 적었다. 그랬더니 **깨뜨리기가 안 울었다** —
#   표시를 떼도 제외가 가려 주기 때문이다. 제외는 그 순간 거짓이 된다.
#   제외는 「**화면에 나올 필요가 없는** 칸」만이다. 고친 칸은 제외가 아니라
#   **검사 대상**으로 남겨야 고침이 지켜진다. 같은 꼴의 거짓 약속이
#   A-684·A-700 에서 두 번 나왔고 이번이 세 번째다 — 내가 쓴 제외 목록에서.
EXEMPT = {
    'hp': '허니팟 — 손님에게도 운영자에게도 보일 필요가 없다. 비어 있어야 통과한다',
    'createdAt': '접수 시각 — 목록이 이것으로 정렬한다(화면에는 `fmtDate` 로 나온다)',
    'updatedAt': '내부 기록',
    'slug': '주소를 만드는 값 — 링크로 쓰인다',
    'agreedDataTerms': 'BIM 약관 동의 — true 고정이고 규칙이 지킨다',
    'agreedThirdPartyShare': '같음',
    'expiresAt': '어드민이 승인할 때 채운다 — 담는 쪽은 빈 값이다',
    'fileUrl': '어드민이 승인할 때 채운다',
    'reviewerNote': '어드민이 심사할 때 채운다',
    'triageNote': '에이전트가 채운다',
    'reviewedAt': '어드민이 심사할 때 채운다',
    'requesterUid': '규칙이 소유자 확인에 쓴다',
    'userId': '규칙이 쓴다 · 상세의 출처 줄에 uid 로 나온다',
    'products':
        '가입 때 **빈 배열로** 두는 자리다. 실제 제품은 `products` 컬렉션에 '
        '`brandId` 로 들어가므로 이 배열은 읽지 않는 것이 맞다. 지우는 것이 더 '
        '깔끔하지만 담긴 데이터를 손대는 일이라 두고 까닭만 적는다',
    'magazineArticles':
        '같음 — 실제 기사는 `articles` 컬렉션에 있다',
    'https': '글자 안의 주소가 칸 이름으로 읽힌 소음. 위 정규식이 걸러낸다',
}

MIN_FIELDS = 15


def blank(m):
    return '\n' * m.group(0).count('\n')


def strip_comments(s):
    s = re.sub(r'<!--[\s\S]*?-->', blank, s)
    s = re.sub(r'/\*[\s\S]*?\*/', blank, s)
    return '\n'.join('' if l.lstrip().startswith('//') else l for l in s.split('\n'))


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8', errors='replace').read()


def written():
    """파이어스토어 쓰기 묶음에서 칸 이름을 **기계가 읽어** 모은다."""
    out = {}
    for f in WRITE_FORMS:
        s = read(f)
        if s is None:
            continue
        s = strip_comments(s)
        for m in re.finditer(r'\{(?:[^{}]|\{[^{}]*\})*?createdAt(?:[^{}]|\{[^{}]*\})*?\}', s, re.S):
            blk = m.group(0)
            if 'serverTimestamp' not in blk:
                continue
            # 앞에 따옴표가 오면 **글자 안**이다 — `'https://…'` 가 칸 이름으로
            #   읽혀 소음이 됐다. 칸 이름은 따옴표 바로 뒤에 오지 않는다.
            for km in re.finditer(r"(?:^|[\s,{])(?<!['\"])([a-zA-Z]\w{2,})\s*:", blk):
                out.setdefault(km.group(1), set()).add(f)
    return out


def screen_sources():
    out = []
    for d in SCREEN_DIRS:
        p = os.path.join(ROOT, d)
        if not os.path.isdir(p):
            continue
        for n in sorted(os.listdir(p)):
            if n.endswith('.html') or n.endswith('.js'):
                rel = os.path.relpath(os.path.join(p, n), ROOT).replace(os.sep, '/')
                s = read(rel)
                if s:
                    out.append((rel, strip_comments(s)))
    return out


def main():
    flds = written()
    if len(flds) < MIN_FIELDS:
        print('x 담는 칸이 %d개만 보인다 — 쓰기 묶음을 못 읽고 있다. 탐지가 멈췄는지 보라'
              % len(flds))
        return 1

    screens = screen_sources()
    problems, notes = [], []
    checked = 0

    for fld in sorted(flds):
        if fld in EXEMPT:
            continue
        checked += 1
        readers = [rel for rel, src in screens
                   if re.search(r'\.' + re.escape(fld) + r'\b', src)]
        if readers:
            continue
        problems.append('「%s」 — %s 가 담는데 **어느 화면도 읽지 않는다**. '
                        '받아 놓고 꺼내 볼 길이 없다'
                        % (fld, ' · '.join(sorted(flds[fld]))))

    print('담았는데 안 읽는 칸: 칸 %d가지 중 %d가지를 봤다(까닭 있는 제외 %d) · 화면 %d개'
          % (len(flds), checked, len(flds) - checked, len(screens)))
    for n in sorted(set(notes)):
        print('  (%s)' % n)

    if problems:
        print()
        print('실패 %d건:' % len(problems))
        for p in sorted(problems):
            print('  x %s' % p)
        print()
        print('**메일에만 있는 것은 보인다고 할 수 없다**(A-701) — 화면에서 꺼낼 수 있어야 한다')
        return 1

    print('결과: 통과 — 담는 칸은 모두 어느 화면에서 꺼낼 수 있다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
