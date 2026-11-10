#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""검색 오버레이가 세로로 쌓이는지, 결과 글자칸이 살아 있는지 (검수대장 A-445)

왜 있나
    `.search-overlay` 는 `display:flex` 인데 `flex-direction` 선언이 없어서 기본값
    `row` 로 깔렸다. 흐름에 든 자식은 `.search-box` 와 search.js 가 붙이는
    `.search-results` 둘이라 **좌우로 나란히** 놓였고, 360px 에서 기사 제목에 돌아간
    글자칸이 **0px** 였다. 「결과 없음」도 아니고 배지만 남은 화면이었다.

    좁은 폭 검사(check_narrow_width.py)는 **오버레이를 열지 않으므로** 이걸 못 본다.
    그래서 따로 연다.

무엇을 재나
    폭마다 오버레이를 열고 질의를 넣은 뒤
      1) 결과 패널이 검색창 **오른쪽**에 놓이지 않았는지(좌우로 나란히면 실패)
      2) 결과 줄마다 글자칸이 살아 있는지(절대 60px 이상, 패널 폭의 25% 이상)
      3) 잰 줄이 0개면 통과가 아니다 (A-433 · A-443 과 같은 약속)

실행
    (사이트 루트에서) python3 -m http.server 8321 &
    ARCHINODE_ROOT=<루트> python3 scripts/check_search_overlay.py http://127.0.0.1:8321
"""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8321'
PAGES = ['brands.html', 'index.html', 'magazine.html']
WIDTHS = [360, 390, 1133]
QUERY = '욕실'
MIN_TEXT_PX = 60
MIN_TEXT_RATIO = 0.25

JS = r"""
() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height}; };
  const box = document.querySelector('.search-box');
  const res = document.querySelector('.search-results');
  const rows = [];
  document.querySelectorAll('[class*="search-result-item"]').forEach(it => {
    const tx = it.querySelector('[class*="search-result-text"]') || it;
    const bd = it.querySelector('[class*="search-result-type"]');
    rows.push({
      title: (tx.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      textW: r(tx) ? r(tx).w : 0,
      badgeW: bd && r(bd) ? r(bd).w : 0
    });
  });
  return {box: r(box), res: r(res), rows: rows};
}
"""


def main():
    problems = []
    measured_rows = 0
    opened = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        for w in WIDTHS:
            for page in PAGES:
                ctx = b.new_context(viewport={'width': w, 'height': 820})
                pg = ctx.new_page()
                try:
                    pg.goto(BASE + '/' + page, wait_until='networkidle', timeout=30000)
                except Exception as e:
                    problems.append('%s %dpx — 열지 못함: %s' % (page, w, str(e)[:70]))
                    ctx.close()
                    continue
                pg.wait_for_timeout(300)
                try:
                    pg.click('.search-toggle', timeout=4000)
                except Exception:
                    problems.append('%s %dpx — 검색 단추(.search-toggle)가 없거나 안 눌린다' % (page, w))
                    ctx.close()
                    continue
                pg.wait_for_timeout(250)
                inp = pg.query_selector('.search-overlay input, .search-box input')
                if not inp:
                    problems.append('%s %dpx — 오버레이에 입력칸이 없다' % (page, w))
                    ctx.close()
                    continue
                inp.fill(QUERY)
                pg.wait_for_timeout(1200)
                d = pg.evaluate(JS)
                ctx.close()
                opened += 1

                box, res, rows = d.get('box'), d.get('res'), d.get('rows') or []
                if not box or not res:
                    problems.append('%s %dpx — 검색창이나 결과 패널이 없다' % (page, w))
                    continue
                if res['x'] >= box['x'] + box['w'] - 2:
                    problems.append('%s %dpx — 결과가 검색창 **오른쪽**에 놓였다 '
                                    '(검색창 x=%d w=%d · 결과 x=%d w=%d). flex-direction 이 column 인지 봐라'
                                    % (page, w, box['x'], box['w'], res['x'], res['w']))
                for row in rows:
                    measured_rows += 1
                    need = max(MIN_TEXT_PX, res['w'] * MIN_TEXT_RATIO)
                    if row['textW'] < need:
                        problems.append('%s %dpx — "%s" 글자칸 %.0fpx (필요 %.0fpx · 배지 %.0fpx · 패널 %.0fpx)'
                                        % (page, w, row['title'], row['textW'], need, row['badgeW'], res['w']))
        b.close()

    print('연 화면 %d개 (페이지 %d × 폭 %d) · 잰 결과 줄 %d개'
          % (opened, len(PAGES), len(WIDTHS), measured_rows))
    if measured_rows == 0:
        print('결과: 실패 — 잰 결과 줄이 0개다. 센 것이 없으면 통과가 아니다 (A-433 · A-443).')
        return 1
    if problems:
        print('')
        print('어긋남 %d건' % len(problems))
        for x in problems[:30]:
            print('  · ' + x)
        if len(problems) > 30:
            print('  … 그리고 %d건 더' % (len(problems) - 30))
        return 1
    print('결과: 통과 (결과 줄 %d개 측정 · 눌린 글자칸 0건)' % measured_rows)
    return 0


if __name__ == '__main__':
    sys.exit(main())
