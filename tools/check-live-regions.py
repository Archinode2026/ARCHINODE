#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""폼의 결과 안내가 **화면 읽기 프로그램에 들리나** (A-591, 2026-11-18)

왜 있나
------
248쪽 전체에서 `aria-live` · `role="alert"` · `role="status"` 가 **한 번도**
쓰이지 않았다. 폼이 「동의해 주세요」나 「접수됐습니다」를 띄우는 자리가
41군데인데 전부 **눈에만 보이는 안내**였다. 눈으로 못 보는 손님이 소싱 문의를
보내면, 막혔는지 들어갔는지 아무 소식을 못 듣고 그 자리에 앉아 있게 된다.
(WCAG 4.1.3 상태 메시지.)

무엇을 보나
----------
① 명부(COVERED)에 오른 안내 그릇마다 role · aria-live · aria-atomic 이 있는지
② **명부에 없는 새 안내 그릇**이 생겼는지

②가 이 검사의 핵심이다. 명부만 보면 다음에 폼이 하나 늘 때 조용히 지나간다 —
그 실패를 이 저장소에서 여러 번 했다(A-568 은 명부에 `auth/` 가 한 번도 오른
적이 없어서 동의 검사가 통과하는 동안 그 자리가 비어 있었다).
그래서 **훑어서 찾고, 명부에도 제외목록에도 없으면 실패**시킨다.

훑는 범위는 `tools/check-form-consent.py` 의 FORMS 를 **읽어서** 정한다.
두 명부를 손으로 맞추지 않게 하려는 것이다 — 거기에 폼이 추가되면
이 검사도 저절로 그 쪽을 보기 시작한다.

    python3 tools/check-live-regions.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── 안내 그릇 명부: 사람이 하나씩 확인했다 ──────────────────────────────────
#    alert  = 곧바로 알림 (오류 — 보내기가 막혔다는 것은 바로 알아야 한다)
#    status = 공손히 알림 (성공·안내 — 읽던 것을 끊지 않는다)
COVERED = {
    ('contact.html', 'contactSuccess'): 'status',
    ('sourcing-inquiry.html', 'srcErrorMsg'): 'alert',
    ('sourcing-inquiry.html', 'sourcingSuccessWrap'): 'status',
    ('request-consultation.html', 'formError'): 'alert',
    ('request-consultation.html', 'formSuccess'): 'status',
    ('brands/view.html', 'rfqErrorMsg'): 'alert',
    ('brands/view.html', 'rfqSuccessWrap'): 'status',
    ('products/view.html', 'rfqErrorMsg'): 'alert',
    ('products/view.html', 'rfqSuccessWrap'): 'status',
    ('products/view.html', 'bimErrorMsg'): 'alert',
    ('products/view.html', 'bimSuccessWrap'): 'status',
    ('list-your-brand.html', 'formError'): 'alert',
    ('list-your-brand.html', 'vendorTermsError'): 'alert',
    ('list-your-brand.html', 'formSuccess'): 'status',
    ('auth/signup.html', 'signupError'): 'alert',
    ('auth/signup.html', 'signupSuccess'): 'status',
    ('index.html', 'newsletterMsg'): 'status',
    ('magazine.html', 'newsletterMsg'): 'status',
    ('trend-report.html', 'newsletterMsg'): 'status',
    ('trend-report.html', 'articlesErrorState'): 'status',
    ('digital-products.html', 'notifyMsg'): 'status',
}

# ── 훑다가 걸리지만 안내 그릇이 **아닌** 것들. 왜 아닌지 적어 둔다 ──────────
EXCLUDED = {
    'sourcingFormWrap': '폼 덩어리 자체 (접수되면 감춘다)',
    'rfqFormWrap': '폼 덩어리 자체',
    'bimFormWrap': '폼 덩어리 자체',
    'productContent': '상품 본문 그릇',
    'rfqShippingField': '입력칸 한 줄 (조건부로 보인다)',
    'lybOwnNotice': '이미 가진 브랜드 안내 — 폼 결과가 아니라 쪽을 열 때의 사정',
    'lybOwnNoticeText': '위 안내의 글자 칸',
    'alreadyLoggedIn': '로그인 상태에 따라 갈리는 화면',
    'memberSignup': '가입 종류에 따라 갈리는 화면',
    'roleChooser': '가입 종류 고르는 화면',
    'articlesGrid': '글 목록 그릇',
    'articlesMoreWrap': '더 보기 단추 그릇',
    'articlesEmptyState': '글이 없을 때의 빈 화면 — 폼 결과가 아니다',
    'loadMoreWrap': '더 보기 단추 그릇',
    'dpGrid': '상품 목록 그릇',
    'dpEmpty': '상품이 없을 때의 빈 화면',
    'notifyForm': '폼 덩어리 자체',
}

MSGISH = re.compile(r'error|success|msg|message|notice|alert|status|warn', re.I)
TAGPAT = re.compile(r'<(div|p|span)\b([^>]*\bid=["\']([A-Za-z0-9_-]+)["\'][^>]*)>')


def form_pages():
    """check-form-consent.py 의 FORMS 를 읽어 훑을 쪽을 정한다.

    돌려주는 값: (쪽 집합, 연동이 살아 있나)

    ★ 2026-11-18: 처음에는 FORMS 를 못 읽어도 아래 네 쪽을 더해서 돌려줬다.
      그러면 연동이 끊겼을 때 **훑는 범위가 조용히 4쪽으로 줄어든 채 통과한다** —
      깨뜨려 시험하다 내가 그걸 잡았다. 명부 연동이 끊긴 것은 통과가 아니라
      실패로 다뤄야 한다. 이 저장소에서 「조용히 좁아지는 검사」에 여러 번 속았다.
    """
    pages = set()
    linked = False
    p = os.path.join(ROOT, 'tools', 'check-form-consent.py')
    try:
        src = open(p, encoding='utf-8').read()
    except OSError:
        src = ''
    block = re.search(r'FORMS\s*=\s*\[(.*?)\n\]', src, re.S)
    if block:
        for m in re.finditer(r"\(\s*'([^']+\.html)'", block.group(1)):
            pages.add(m.group(1))
        linked = len(pages) > 0
    # 뉴스레터·알림 신청은 폼이지만 동의 명부에 없다(개인정보 고지 대상이 아니라서).
    pages.update(['index.html', 'magazine.html', 'trend-report.html', 'digital-products.html'])
    return pages, linked


def main():
    bad = []
    unknown = []
    checked = 0

    pages, linked = form_pages()
    if not linked:
        print('안내 들림: 실패 — check-form-consent.py 의 FORMS 를 읽지 못했다. '
              '훑는 범위가 조용히 좁아진 채로 통과하지 않게 여기서 멈춘다.')
        return 1

    for page in sorted(pages):
        fp = os.path.join(ROOT, page)
        if not os.path.exists(fp):
            continue
        t = open(fp, encoding='utf-8', errors='replace').read()
        for m in TAGPAT.finditer(t):
            tag, attrs, eid = m.group(1), m.group(2), m.group(3)
            cls = re.search(r'class=["\']([^"\']*)["\']', attrs)
            clsv = cls.group(1) if cls else ''
            hidden = 'display:none' in attrs.replace(' ', '')
            if not (MSGISH.search(eid) or MSGISH.search(clsv)):
                continue
            # 그 id 를 이 쪽의 JS 가 실제로 쓰나
            if ("'%s'" % eid) not in t and ('"%s"' % eid) not in t:
                continue
            key = (page, eid)
            if key in COVERED:
                checked += 1
                want = COVERED[key]
                role = re.search(r'\brole=["\']([^"\']+)["\']', attrs)
                live = re.search(r'aria-live=["\']([^"\']+)["\']', attrs)
                atomic = re.search(r'aria-atomic=["\']([^"\']+)["\']', attrs)
                if not role or role.group(1) != want:
                    bad.append('%s #%s: role 이 %s 여야 한다 (지금 %s)'
                               % (page, eid, want, role.group(1) if role else '없음'))
                    continue
                need_live = 'assertive' if want == 'alert' else 'polite'
                if not live or live.group(1) != need_live:
                    bad.append('%s #%s: aria-live 가 %s 여야 한다 (지금 %s)'
                               % (page, eid, need_live, live.group(1) if live else '없음'))
                if not atomic or atomic.group(1) != 'true':
                    bad.append('%s #%s: aria-atomic="true" 가 없다 — 글이 바뀔 때 '
                               '일부만 읽힌다' % (page, eid))
            elif eid in EXCLUDED:
                continue
            else:
                unknown.append('%s #%s <%s class="%s">%s'
                               % (page, eid, tag, clsv, ' (처음에 숨어 있다)' if hidden else ''))

    # 명부에 올렸는데 마크업에서 사라진 것도 잡는다
    for (page, eid) in sorted(COVERED):
        fp = os.path.join(ROOT, page)
        if not os.path.exists(fp):
            bad.append('%s: 쪽이 없다 (명부에 #%s 가 올라 있다)' % (page, eid))
            continue
        t = open(fp, encoding='utf-8', errors='replace').read()
        if not re.search(r'<(div|p|span)\b[^>]*\bid=["\']%s["\']' % re.escape(eid), t):
            bad.append('%s #%s: 명부에 있는데 마크업에서 사라졌다' % (page, eid))

    if unknown:
        print('안내 들림: 명부에 없는 안내 그릇 %d개' % len(unknown))
        for u in unknown:
            print('  ? ' + u)
        print('    → 결과 안내라면 COVERED 에 role 과 함께 올리고, 아니면 EXCLUDED 에')
        print('      **왜 아닌지** 적어서 올려라. 둘 다 안 하면 이 검사는 통과하지 않는다.')
    if bad:
        print('안내 들림: 어긋난 곳 %d개' % len(bad))
        for b in bad:
            print('  - ' + b)
    if unknown or bad:
        return 1
    if checked == 0:
        print('안내 들림: 실패 — 본 것이 0개다. 센 것이 없으면 통과가 아니다 (A-433).')
        return 1
    print('안내 들림: 안내 그릇 %d개 전부 역할·aria-live·aria-atomic 있음 (쪽 %d개)'
          % (checked, len(pages)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
