#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""고정 막(넷리파이 배지)에 **영영 깔리는** 누를 거리를 찾는다 — A-687.

왜 만들었나
-----------
같은 사고가 세 번 났다.
  A-446  「맨 위로」 단추가 데스크톱에서 배지에 75% 덮여 가운데가 안 눌렸다
  A-451  긴 쪽 네 곳에 「맨 위로」가 아예 없었다 (같은 자리를 손으로 고치다 발견)
  A-558  꼬리말의 **약관·개인정보 처리방침 링크**가 배지에 완전히 덮여 있었다.
         그 둘은 쪽의 **마지막 내용**이라 더 굴릴 수가 없다 — 영구히 배지 아래였다.
         법으로 두게 한 링크가 닿지 않는 자리에 있었던 셈이다.
세 번 다 **사람이 눈으로** 찾았다. 그리고 세 번 다 「그 자리만」 고쳤다.

왜 기하로 푸나
---------------
배지는 `position: fixed` 라 **굴려도 화면 오른쪽 아래에 그대로 있다.** 그러니
「어느 굴림 위치에서 닿는가」는 굴려 보지 않고 **식으로** 풀린다. 굴림 위치를
표본으로 찍으면 찍은 자리 사이를 놓치지만, 식은 안 놓친다.

  누를 거리의 **문서 좌표** (cy1, cy2), 창 높이 vh, 배지 윗선 by1 = vh - 63
  굴림 s 에서 화면 좌표는 (cy1 - s, cy2 - s)

  · 온전히 보이려면      s >= cy2 - vh  이고  s <= cy1
  · 배지를 벗어나려면    cy2 - s <= by1   →   s >= cy2 - by1
  · 굴릴 수 있는 범위     0 <= s <= maxScroll

  by1 < vh 이므로 cy2 - by1 > cy2 - vh — 묶는 쪽은 배지 조건이다. 그래서
      lo = max(0, cy2 - by1),  hi = min(cy1, maxScroll)
  **lo > hi 이면 어떤 굴림 위치에서도 배지를 못 벗어난다.**

쪽의 **맨 아래** 내용이 정확히 그 꼴이다: cy2 ~ 문서높이 이고
maxScroll = 문서높이 - vh 이므로 lo = 문서높이 - vh + 63 > maxScroll = hi.
A-558 이 바로 이것이었다.

배지 크기
---------
라이브 실측(2026-11-25, archinodekr.com): `#nl-badge-frame`,
`position:fixed; right:0; bottom:0; width:196px; height:63px;
z-index:2147483645`. A-558 이 적은 63px 과 같다.
★ 오른쪽 기준은 `innerWidth` 가 아니라 **`documentElement.clientWidth`** 다 —
데스크톱에서 둘이 15px 다르고(고전 스크롤바), `right:0` 은 스크롤바를 뺀
자리에 붙는다. 처음에 `innerWidth` 로 보고 「여백 15px」이라고 읽을 뻔했다.

★ 로컬 서버에는 배지가 **없다**. 그래서 배지를 **대역으로 세워** 잰다 —
있는 것을 재는 것이 아니라 「저 자리에 우리 것이 영구히 깔리는가」를 묻는다.
그게 맞는 질문이다. 유료 플랜으로 배지를 꺼도(승리님 결정 ⓑ-9) 이 검사는
그대로 값을 한다 — 쪽 맨 아래에 63px 을 비워 두라는 규칙은 남는다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8321').rstrip('/')
PAGES = sys.argv[2:] or [
    'index.html', 'brands.html', 'categories.html', 'magazine.html', 'about.html',
    'for-brands.html', 'contact.html', 'sourcing-inquiry.html', 'request-consultation.html',
    'list-your-brand.html', 'trend-report.html', 'digital-products.html',
    'privacy.html', 'privacy-en.html', 'terms.html', 'brand-guide.html', 'submit-trend.html',
    'brands/view.html', 'products/view.html', 'auth/login.html', 'auth/signup.html',
    # 매거진 기사 — A-673 이 단 「문」이 본문 끝에 있다. 끝에 있는 것은
    # 배지에 깔리기 가장 쉬운 자리다.
    'magazine/agm-thermroof-roofing-material-2026.html',
    'magazine/4th-basic-architecture-policy-plan-2026-2030.html',
]
VIEWS = [('데스크톱', 1440, 900), ('노트북', 1133, 800),
         ('태블릿', 768, 1024), ('휴대폰', 390, 844)]

BW, BH = 196, 63

PROBE = """(badge) => {
  const BW = badge[0], BH = badge[1];
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  const sy = window.scrollY;
  const bx1 = vw - BW, by1 = vh - BH;
  const out = [];
  const seen = new Set();
  document.querySelectorAll('a[href], button, input, select, textarea, [role=button]')
    .forEach(c => {
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      if (c.disabled) return;
      if (c.tabIndex < 0) return;
      /* 줄바꿈된 inline 링크는 getBoundingClientRect() 가 여러 줄을 감싸는 큰
         네모라 빈 자리가 섞인다(A-594). 줄마다 본다 — 한 줄이라도 배지를
         벗어날 수 있으면 그 링크는 닿는다. */
      const rects = [...c.getClientRects()].filter(r => r.width > 1 && r.height > 1);
      if (!rects.length) return;
      /* 고정·끈적 요소는 굴려도 안 비킨다. 굴림으로 푸는 식이 안 통하므로
         따로 본다 — 지금 배지와 겹치면 그걸로 끝이다. */
      let fixed = false;
      for (let e = c; e && e !== document.body; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') { fixed = true; break; }
      }
      let ok = false, why = '';
      for (const r of rects) {
        const cx1 = r.left, cx2 = r.right;
        if (cx2 <= bx1 || cx1 >= vw) { ok = true; break; }   /* 가로로 이미 비켜 있다 */
        if (fixed) {
          if (r.bottom <= by1) { ok = true; break; }
          why = '고정 요소라 굴려도 안 비킨다';
          continue;
        }
        const cy1 = r.top + sy, cy2 = r.bottom + sy;
        const lo = Math.max(0, cy2 - by1);
        const hi = Math.min(cy1, maxScroll);
        if (lo <= hi) { ok = true; break; }
        why = (cy2 > maxScroll + by1)
          ? '쪽의 맨 아래라 더 굴릴 수가 없다'
          : '어떤 굴림 위치에서도 배지 자리를 벗어나지 못한다';
      }
      if (ok) return;
      const t = (c.innerText || c.value || c.getAttribute('aria-label') || '').trim();
      const key = t + '|' + why;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        t: t.slice(0, 30) || c.tagName.toLowerCase(),
        href: (c.getAttribute && (c.getAttribute('href') || '')).slice(0, 44),
        why: why
      });
    });
  return {vw, vh, maxScroll, items: out};
}"""


def main():
    problems = []
    seen = 0
    with sync_playwright() as p:
        exe = os.environ.get('PLAYWRIGHT_CHROME')
        if not exe and os.path.exists('/usr/bin/google-chrome'):
            exe = '/usr/bin/google-chrome'
        b = (p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe
             else p.chromium.launch(args=['--no-sandbox']))
        for label, w, h in VIEWS:
            ctx = b.new_context(viewport={'width': w, 'height': h})
            for page in PAGES:
                pg = ctx.new_page()
                try:
                    pg.goto(BASE + '/' + page, wait_until='load', timeout=20000)
                except Exception:
                    pg.close()
                    continue
                pg.wait_for_timeout(500)
                try:
                    r = pg.evaluate(PROBE, [BW, BH])
                except Exception:
                    pg.close()
                    continue
                seen += 1
                for it in r['items']:
                    problems.append(
                        '%s %s — 「%s」%s %s'
                        % (label, page, it['t'],
                           (' (' + it['href'] + ')') if it['href'] else '',
                           it['why']))
                pg.close()
            ctx.close()
        b.close()

    if seen == 0:
        print('결과: 실패 — 본 화면이 0개다. 센 것이 없으면 통과가 아니다 (A-433)')
        return 1
    if problems:
        print('배지 그늘: 영영 깔리는 누를 거리 %d건' % len(problems))
        for x in problems:
            print('  - ' + x)
        print('')
        print('배지는 남의 iframe 이라 가리거나 없애지 않는다 (A-558 에서 정함).')
        print('우리 것이 그 %dx%d 자리를 비켜야 한다.' % (BW, BH))
        print('결과: 실패 — 어떤 굴림 위치에서도 누를 수 없는 자리가 있다')
        return 1
    print('배지 그늘: 화면 %d개 측정 (%s) · 영영 깔리는 누를 거리 0건'
          % (seen, ' · '.join(v[0] for v in VIEWS)))
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
