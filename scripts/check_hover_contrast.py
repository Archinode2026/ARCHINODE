"""호버 상태의 대비를 잰다 (검수대장 A-192).

   실행: python3 scripts/check_hover_contrast.py index.html for-brands.html ...
   필요: playwright + 크롬. 없으면 그냥 건너뛴다(배포 경로에는 묶지 않았다 — 느리다).


   기본 하네스는 마우스를 올리지 않으므로 `:hover` 규칙은 한 번도 측정되지 않는다.
   A-188 에서 흰 글자가 얹힌 금색 버튼의 호버 배경을 --accent(3.83)로 보냈는데
   하네스가 끝까지 조용했던 이유다 — 숨은 상태(display:none)와 같은 종류의 사각지대.
"""
import sys
from playwright.sync_api import sync_playwright

import os
# 저장소 루트. 환경변수 ARCHINODE_ROOT 로 덮어쓸 수 있다.
SRC = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = sys.argv[1:] or ['index.html']
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                    '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082')

MEASURE = r"""
(el => {
  const px = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r,g,b]) => { const f = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
                             return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };
  const bgOf = e => { for (let p = e; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = px(cs.backgroundColor);
      if (c && (c.length < 4 || c[3] > 0.95)) return c.slice(0,3);
    } return [255,255,255]; };
  const cs = getComputedStyle(el);
  const fg = px(cs.color); const bg = bgOf(el);
  if (!fg || !bg) return null;
  const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
  const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3.0 : 4.5;
  return {ratio: Math.round(ratio(fg.slice(0,3), bg)*100)/100, need,
          fg: cs.color, bg: 'rgb(' + bg.join(',') + ')', size: Math.round(size*10)/10};
})
"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})

    def route(r):
        u = r.request.url
        if u.startswith('file:'):
            return r.continue_()
        if r.request.resource_type == 'image':
            return r.fulfill(status=200, content_type='image/png', body=PNG)
        return r.fulfill(status=204, body='')
    ctx.route('**/*', route)
    total = 0
    for f in PAGES:
        pg = ctx.new_page()
        pg.goto('file://' + SRC + '/' + f, wait_until='load', timeout=20000)
        pg.wait_for_timeout(500)
        els = pg.query_selector_all('a, button, [role=button]')
        bad = []
        for el in els:
            try:
                if not el.is_visible():
                    continue
                t = (el.inner_text() or '').strip()
                if not t:
                    continue
                before = pg.evaluate(MEASURE, el)
                el.hover(timeout=1500)
                pg.wait_for_timeout(550)  # 전환(0.3s)보다 길게 — 짧으면 전환 중간색을 재서 오탐한다
                after = pg.evaluate(MEASURE, el)
            except Exception:
                continue
            if not after:
                continue
            # 호버에서만 깨지는 것, 또는 호버에서 더 나빠진 것
            if after['ratio'] < after['need'] and (not before or before['ratio'] >= before['need']
                                                   or after['ratio'] < before['ratio']):
                bad.append((t[:26], before, after))
        print(f'{f[:40]:42} 호버 대비 미달 {len(bad)}건')
        seen = set()
        for t, bf, af in bad:
            k = (af['fg'], af['bg'])
            if k in seen:
                continue
            seen.add(k)
            b4 = f'{bf["ratio"]}' if bf else '—'
            print(f'     "{t}" 평상 {b4} → 호버 {af["ratio"]} (필요 {af["need"]}) '
                  f'{af["fg"]} on {af["bg"]}')
        total += len(bad)
        pg.close()
    b.close()
print('합계', total, '건')
