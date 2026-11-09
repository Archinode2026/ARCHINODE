#!/usr/bin/env python3
"""좁은 휴대폰 폭에서 가로로 넘치는 요소를 찾는다 (신설 2026-11-04, 검수대장 A-211).

왜 있나
-------
R-036(홈 구독 폼이 322px 에서 잘림)을 처리하다, 레이아웃 측정이 **390px 부터만**
돌고 있었다는 것을 알았다. 322px(구형·소형 기종)는 한 번도 재지 않았다.
그 결함은 이미 A-160~162 작업에 섞여 고쳐져 있었지만, **못 보고 있었다는 사실**은
그대로였다. 그래서 그 폭을 기본 측정에 넣는다.

`body { overflow-x: hidden }`(A-186) 때문에 문서 폭만 보면 넘침이 안 보인다 —
잘라서 숨기기 때문이다. 그러니 **요소의 오른쪽 끝**을 직접 재야 한다.
자체 스크롤 상자(`overflow-x:auto`) 안쪽은 밀어서 볼 수 있으므로 제외한다.

쓰는 법
-------
    python3 -m http.server 8321 &            # 사이트 루트에서
    python3 scripts/check_narrow_width.py    # 기본 322·360px
    python3 scripts/check_narrow_width.py --base http://127.0.0.1:8321 --widths 300,322,360

넘치는 것이 있으면 종료 코드 1. Playwright 가 필요하므로 deploy.ps1 에는 묶지
않았다(배포 검사는 브라우저 없이 도는 check_escaping.py 만 묶여 있다).

알려진 한계 (실측으로 확인, 2026-11-04)
--------------------------------------
이 검사는 **두 층**으로 본다: ① 문서 폭(`scrollWidth > clientWidth`) ② 넘치는
요소 이름. ①은 믿을 수 있다. ②는 못 집어내는 경우가 있다.

R-036 당시 상태를 index.html 에 다시 심어 시험했더니(`min-width:0` 과 440px
컬럼 규칙 제거) ①은 `422/322` 로 바로 잡았지만 ②는 **구독 폼을 이름으로
집어내지 못했다.** 그러니 "페이지가 걸렸는데 원인 요소가 비어 있다" 는 결과를
"괜찮다" 로 읽지 말고, 그 페이지를 사람이 직접 봐야 한다.

반대 방향도 있다. `index.html` 의 `.cat-circle` 카테고리 캐러셀은 **일부러**
화면 밖으로 뻗는다(28개). 그래서 조상 중에 `overflow-x: auto|scroll` 이 있으면
건너뛴다 — 이 걸러내기가 없으면 의도된 가로 스크롤을 전부 결함으로 보고한다.
`overflow: hidden` 은 걸러내지 않는다(그건 잘라 숨기는 것이라 결함일 수 있다).

`.fade-in`(스크롤 전 `opacity:0`)은 레이아웃은 그대로라 측정에 영향이 없다 —
`opacity` 로 건너뛰지 않는 이유다. `visibility:hidden`·`display:none` 만 건너뛴다.

**가장 큰 한계: 데이터가 없는 화면은 넘치지 않는다.** 이 컨테이너에서는
파이어베이스가 막혀 있어 `brands/view.html`·`products/view.html`·`magazine/view.html`
같은 상세 화면과 어드민 표가 **빈 상태로 측정된다.** 빈 표는 안 넘친다 —
R-075(어드민 표가 휴대폰에서 넘침)를 기본 하네스가 끝까지 못 본 이유가 바로 이것이다.
목록·상세 화면을 제대로 재려면 가짜 Firestore 로 실제 길이의 데이터를 채워야 한다.
이 검사만 통과했다고 그 화면들이 안전하다고 읽으면 안 된다.

이 검사는 **넘침만** 본다. 넘치지 않으면서 못 읽게 되는 경우는 안 잡는다 —
예: `brands/view.html` 의 한국 딜러 칸은 인라인 `grid-template-columns:1fr 1fr` 인데,
한 칸에 긴 URL 이 들어가면 322px 에서 열이 `43px / 219px` 로 쪼개진다(실측).
화면을 넘지는 않으므로 이 검사는 통과로 보고한다.
"""
import argparse, sys

PAGES = [
    'index.html', 'about.html', 'brands.html', 'categories.html', 'contact.html',
    'privacy.html', 'terms.html', 'sourcing-inquiry.html', '404.html', 'for-brands.html',
    'list-your-brand.html', 'magazine.html', 'trend-report.html', 'request-consultation.html',
    'digital-products.html', 'brand-guide.html', 'submit-trend.html',
    'brands/view.html', 'products/view.html', 'magazine/view.html',
    'auth/login.html', 'auth/signup.html', 'auth/profile.html', 'auth/reset-password.html',
    'admin/dashboard.html', 'admin/articles.html', 'brand-portal/dashboard.html',
]

PROBE = """() => {
  const de = document.documentElement, vw = window.innerWidth, out = [];
  const inScroller = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflow)) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.left < -1000) continue;                 // 화면 밖에 일부러 둔 것(허니팟 등)
    if (r.right > vw + 1 && !inScroller(el)) {
      out.push({sel: el.tagName.toLowerCase() +
                     (typeof el.className === 'string' && el.className
                        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
                over: Math.round(r.right - vw),
                txt: (el.textContent || '').trim().slice(0, 24)});
    }
  }
  return {sw: de.scrollWidth, cw: de.clientWidth, over: out.slice(0, 4)};
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8321')
    ap.add_argument('--widths', default='322,360')
    args = ap.parse_args()
    widths = [int(w) for w in args.widths.split(',') if w.strip()]

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Playwright 가 없습니다: pip install playwright && playwright install chromium')
        return 2

    bad = 0

    skipped = 0

    measured = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w in widths:
            print('── %dpx ──' % w)
            for p in PAGES:
                pg = b.new_page(viewport={'width': w, 'height': 760},
                                is_mobile=True, has_touch=True, device_scale_factor=2)
                try:
                    pg.goto(args.base + '/' + p, wait_until='networkidle', timeout=20000)
                    pg.wait_for_timeout(600)
                    d = pg.evaluate(PROBE)
                except Exception as e:
                    print('   ? %-44s 열지 못함: %s' % (p, str(e).splitlines()[0][:60]))
                    skipped += 1
                    pg.close()
                    continue
                measured += 1
                if d['over'] or d['sw'] > d['cw']:
                    bad += 1
                    print('   X %-44s 문서 %d/%d' % (p, d['sw'], d['cw']))
                    for o in d['over']:
                        print('       %-38s %+5dpx 「%s」' % (o['sel'][:38], o['over'], o['txt']))
                else:
                    print('   . %-44s OK' % p)
                pg.close()
        b.close()
    # A-433(2026-11-09): **못 연 페이지를 조용히 건너뛰고 「통과」라고 적었다.**
    # 컨테이너에서 서버 없이 처음 돌렸더니 27페이지가 전부 ERR_CONNECTION_REFUSED 인데
    # 결과는 「통과 (넘치는 페이지 0개)」였다 — **빈손으로 통과하는 검사**다.
    # 센 것이 0이면 통과가 아니라 **아무것도 모르는 것**이다.
    if skipped:
        print('\n결과: 실패 — **%d 페이지를 열지 못했다.** 센 것이 없으면 통과가 아니다.' % skipped)
        print('        로컬 서버가 떠 있는지 보라:  python3 -m http.server 8321   (사이트 루트에서)')
        return 1
    if measured == 0:
        print('\n결과: 실패 — 잰 페이지가 0개다.')
        return 1
    print('\n결과: %s (%d페이지 × %d폭 측정 · 넘치는 페이지 %d개)'
          % ('통과' if bad == 0 else '실패', len(PAGES), len(widths), bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
