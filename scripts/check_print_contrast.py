#!/usr/bin/env python3
"""A-630: 인쇄했을 때 글자가 **흰 종이 위에서 읽히는지**.

왜 필요한가: 브론즈 47차가 PDF 를 그림으로 떠서 보니, contact.html 의 마지막 장이
눈으로는 **완전한 백지**였다(흰색 아닌 픽셀 0.17%). 글자는 PDF 안에 있는데 색이
흰 종이 위의 흰 글자였다 — 사업자등록번호 같은 법정 표시사항까지. 대비 1.03~1.10:1.

까닭: 화면에서는 꼬리말 배경이 남색이라 밝은 글자가 읽힌다. 그런데 브라우저는
**배경을 기본으로 인쇄하지 않는다**. 그래서 밝은 글자만 남는다. `@media print` 에
`.footer{color:#666}` 가 있었지만 `body .footer`(명시도가 더 높고 뒤에 온다)가 이겼다.

그 자리의 옛 주석은 「여기서 인쇄를 할 수 없어 특정도 규칙으로만 보장했고 눈으로는
못 봤다」고 적고 있었다. 보장은 틀렸다. 그래서 **재는 검사**를 둔다.

쓰는 법 (컨테이너):
    python3 -m http.server 8321 &
    python3 scripts/check_print_contrast.py http://127.0.0.1:8321
"""
import re
import sys

MIN = 4.5          # WCAG AA 본문
PAGES = ['index.html', 'contact.html', 'sourcing-inquiry.html', 'list-your-brand.html',
         'privacy.html', 'terms.html', 'about.html', 'for-brands.html']


def contrast_on_white(css_color):
    nums = re.findall(r'[\d.]+', css_color or '')
    if len(nums) < 3:
        return None
    r, g, b = [float(x) / 255 for x in nums[:3]]
    a = float(nums[3]) if len(nums) > 3 else 1.0
    # 흰 종이 위에 알파 합성
    r, g, b = r * a + 1 - a, g * a + 1 - a, b * a + 1 - a
    f = lambda u: u / 12.92 if u <= 0.03928 else ((u + 0.055) / 1.055) ** 2.4
    lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    return round(1.05 / (lum + 0.05), 2)


JS = """() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('body *').forEach(function (e) {
    const txt = (e.textContent || '').trim();
    if (!txt) return;
    if (e.children.length > 0) return;                 // 글자를 직접 든 잎만
    /* ★ 조상이 display:none 이면 이 요소의 계산값은 여전히 display:block 이다.
       그래서 자기만 보면 **숨은 것을 센다** — 첫 판에서 인쇄 때 숨는 쿠키 고지의
       자식들을 결함으로 셌다(「Necessary Only」·「We use cookies」).
       getClientRects() 는 숨은 가지 전체에서 0 이므로 그것으로 센다.
       (같은 함정: check-field-labels.py 의 _hidden_stack — 「0으로 세어 보기」) */
    if (e.getClientRects().length === 0) return;
    /* A-636(브론즈 48차 N48-8): getClientRects() 만으로는 **닫힌 <details> 안**과
       content-visibility 로 가려진 것이 안 걸러진다 — 꼬리말 「더 보기」 안 링크 9개가
       모든 쪽에서 걸렸고 index 에서는 197종이었다. 즉 **안 보이는 글자의 대비를
       세고 있었다.** checkVisibility 를 함께 쓴다(없는 브라우저는 그냥 통과). */
    if (typeof e.checkVisibility === 'function' &&
        !e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return;
    const key = e.tagName + '|' + (e.className || '') + '|' + cs.color;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tag: e.tagName, cls: String(e.className || '').split(' ')[0],
               color: cs.color, text: txt.slice(0, 26) });
  });
  return out;
}"""


def main():
    if len(sys.argv) < 2:
        print('검사 못함  주소를 주세요 (예: http://127.0.0.1:8321)')
        return 1
    base = sys.argv[1].rstrip('/')
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('검사 못함  playwright 가 없다 — 컨테이너에서 돌려라')
        return 1

    checked, bad = 0, []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for page in PAGES:
            ctx = b.new_context(viewport={'width': 1280, 'height': 900})
            ctx.route('**/*', lambda r: r.continue_()
                      if ('127.0.0.1' in r.request.url or 'localhost' in r.request.url)
                      else r.abort())
            pg = ctx.new_page()
            try:
                pg.goto('%s/%s' % (base, page), wait_until='load', timeout=20000)
            except Exception as e:
                print('  못 열었다 %s — %s' % (page, str(e)[:50]))
                ctx.close()
                continue
            pg.wait_for_timeout(1200)
            pg.emulate_media(media='print')
            pg.wait_for_timeout(400)
            for row in pg.evaluate(JS):
                k = contrast_on_white(row['color'])
                if k is None:
                    continue
                checked += 1
                if k < MIN:
                    bad.append('%s  <%s class=%s>  %s  대비 %s  「%s」' % (
                        page, row['tag'].lower(), row['cls'][:20], row['color'], k, row['text']))
            ctx.close()
        b.close()

    print('검사함  쪽 %d개 · 인쇄 매체에서 글자 든 요소 %d종' % (len(PAGES), checked))
    if checked == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1
    if bad:
        for x in bad[:40]:
            print('  결함 — 흰 종이에서 안 읽힌다:', x)
        if len(bad) > 40:
            print('  … 그리고 %d종 더' % (len(bad) - 40))
        return 1
    print('흰 종이에서 안 읽히는 글자 — 없음 (기준 %s:1)' % MIN)
    return 0


sys.exit(main())
