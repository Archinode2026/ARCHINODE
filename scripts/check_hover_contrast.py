"""호버 상태의 대비를 잰다 (검수대장 A-192).

   실행: python3 scripts/check_hover_contrast.py index.html for-brands.html ...
   필요: playwright + 크롬. 없으면 그냥 건너뛴다(배포 경로에는 묶지 않았다 — 느리다).


   기본 하네스는 마우스를 올리지 않으므로 `:hover` 규칙은 한 번도 측정되지 않는다.
   A-188 에서 흰 글자가 얹힌 금색 버튼의 호버 배경을 --accent(3.83)로 보냈는데
   하네스가 끝까지 조용했던 이유다 — 숨은 상태(display:none)와 같은 종류의 사각지대.
"""
import re
import sys
from playwright.sync_api import sync_playwright

# ─────────────────────────────────────────────────────────────────────────────
# A-443(2026-11-10): 이 검사는 **셋 다 고장이었다.**
#   ① 미달을 찾아도 `sys.exit(1)` 이 없어 **종료코드가 늘 0** 이었다 —
#      check-all.py 의 관문에 묶여 있는데도 **절대 못 막는다.** A-192 를 찾은 것은
#      사람이 손으로 돌려 출력을 읽었기 때문이고, 자동 관문에서는 조용했다.
#   ② 몇 개를 쟀는지 세지 않아, 호버 대상이 0개여도 「미달 0건」으로 통과했다 —
#      A-433 에서 좁은 폭·XSS 두 검사에 붙인 「센 것이 없으면 통과가 아니다」가
#      이 파일에는 **안 붙었다.**
#   ③ `except Exception: continue` 가 호버 시간초과까지 삼켜서, 전부 건너뛴
#      페이지와 전부 멀쩡한 페이지가 **출력에서 구별되지 않았다.**
#   셋을 함께 고친다: 잰 개수·건너뛴 개수를 찍고, 미달이 있거나 잰 것이 0이면 1로 끝낸다.
#
# A-587(2026-11-17): A-443 이 「건너뛴 개수」를 찍게 했지만 **이유를 안 갈랐다.**
#   2026-11-17 실측에서 잰 것 365개에 건너뛴 것이 325개였는데, 갈라 보니
#   안보임 264 · 글자없음 51 · 예외(호버 시간초과) 10 · 배경못읽음 1 이었다.
#   그 안보임 264 가 문제였다 — **호버로만 드러나는 드롭다운 링크는 `is_visible()`
#   을 호버 전에 물어보기 때문에 정의상 전부 건너뛴다.** 호버 대비를 재는 검사가
#   호버로 드러나는 것을 못 재고 있었다. (style.css 174행에 `.nav-dropdown-menu
#   a:hover` 가 자기 호버색을 갖고 있다. 그 10개와 안의 small 10개를 손으로 재
#   보니 지금은 미달 0건이었다 — 구멍은 진짜였고 결함은 아직 없었다.)
#   고친 방법: 숨었다가 드러나는 그릇을 **style.css 에서 뽑아낸다**(평소
#   display:none 인데 .active/:hover 로 드러나는 클래스). 이름을 박아 두면
#   다음에 새 드롭다운이 생길 때 또 조용해진다 — 그 실패를 여러 번 했다.
#   그릇은 **하나씩** 연다. 한꺼번에 열면 오버레이가 서로를 덮어 호버가 시간초과된다.
# ─────────────────────────────────────────────────────────────────────────────

import os
# 저장소 루트. 환경변수 ARCHINODE_ROOT 로 덮어쓸 수 있다.
SRC = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = sys.argv[1:] or ['index.html']

def revealable_classes(css_path):
    """평소 display:none 인데 .active/:hover 로 드러나는 클래스를 style.css 에서 뽑는다.

    이름을 코드에 박지 않는 것이 핵심이다(A-587). 새 드롭다운이 생기면
    스타일 파일에 들어오는 순간 이 검사가 자동으로 따라간다."""
    try:
        css = open(css_path, encoding='utf-8', errors='replace').read()
    except OSError:
        return []
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    hidden, shown = set(), set()
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
        sel = sel.strip()
        if re.search(r'display\s*:\s*none', body):
            for c in re.findall(r'\.([A-Za-z][\w-]*)', sel):
                if not re.search(r'\.%s[\w-]*(\.active|:hover)' % re.escape(c), sel):
                    hidden.add(c)
        if re.search(r'display\s*:\s*(grid|flex|block|inline-block)'
                     r'|opacity\s*:\s*1|visibility\s*:\s*visible', body):
            if '.active' in sel or ':hover' in sel:
                for c in re.findall(r'\.([A-Za-z][\w-]*)', sel):
                    shown.add(c)
    return sorted(hidden & shown)


REVEALABLE = revealable_classes(os.path.join(SRC, 'style.css'))
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
    # 크롬 경로를 고정하면 다른 기계에서 못 돈다. 환경변수 → 시스템 크롬 → playwright 기본.
    _exe = os.environ.get('PLAYWRIGHT_CHROME')
    if not _exe and os.path.exists('/usr/bin/google-chrome'):
        _exe = '/usr/bin/google-chrome'
    b = (p.chromium.launch(executable_path=_exe, args=['--no-sandbox']) if _exe
         else p.chromium.launch(args=['--no-sandbox']))
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
    measured = 0      # A-443: 실제로 평상/호버를 다 잰 요소 수
    reasons = {'안보임': 0, '글자없음': 0, '예외': 0, '배경못읽음': 0}
    exc_kinds = {}
    revealed_measured = 0   # A-587: 열어서 추가로 잰 것
    skipped = 0       # A-443: 안 보임·글자 없음·시간초과로 건너뛴 수
    for f in PAGES:
        pg = ctx.new_page()
        pg.goto('file://' + SRC + '/' + f, wait_until='load', timeout=20000)
        pg.wait_for_timeout(500)
        els = pg.query_selector_all('a, button, [role=button]')
        bad = []
        for el in els:
            try:
                if not el.is_visible():
                    skipped += 1; reasons['안보임'] += 1
                    continue
                t = (el.inner_text() or '').strip()
                if not t:
                    skipped += 1; reasons['글자없음'] += 1
                    continue
                before = pg.evaluate(MEASURE, el)
                el.hover(timeout=1500)
                pg.wait_for_timeout(550)  # 전환(0.3s)보다 길게 — 짧으면 전환 중간색을 재서 오탐한다
                after = pg.evaluate(MEASURE, el)
            except Exception as _e:
                skipped += 1; reasons['예외'] += 1
                exc_kinds[type(_e).__name__] = exc_kinds.get(type(_e).__name__, 0) + 1
                continue
            if not after:
                skipped += 1; reasons['배경못읽음'] += 1
                continue
            measured += 1
            # 호버에서만 깨지는 것, 또는 호버에서 더 나빠진 것
            if after['ratio'] < after['need'] and (not before or before['ratio'] >= before['need']
                                                   or after['ratio'] < before['ratio']):
                bad.append((t[:26], before, after))
        # ── A-587: 숨었다가 드러나는 그릇을 하나씩 열어 그 안의 링크도 잰다 ──
        #    한꺼번에 열면 오버레이가 서로를 덮어 호버가 전부 시간초과된다.
        for cls in REVEALABLE:
            n_open = pg.evaluate("""(c) => {
                const els = document.querySelectorAll('.' + c);
                els.forEach(e => e.classList.add('active'));
                return els.length;
            }""", cls)
            if n_open:
                pg.wait_for_timeout(250)
                for el in pg.query_selector_all('.%s a, .%s button' % (cls, cls)):
                    try:
                        if not el.is_visible():
                            skipped += 1; reasons['안보임'] += 1
                            continue
                        txt = (el.inner_text() or '').strip()
                        if not txt:
                            skipped += 1; reasons['글자없음'] += 1
                            continue
                        before = pg.evaluate(MEASURE, el)
                        el.hover(timeout=1500)
                        pg.wait_for_timeout(550)
                        after = pg.evaluate(MEASURE, el)
                    except Exception as _e:
                        skipped += 1; reasons['예외'] += 1
                        exc_kinds[type(_e).__name__] = exc_kinds.get(type(_e).__name__, 0) + 1
                        continue
                    if not after:
                        skipped += 1; reasons['배경못읽음'] += 1
                        continue
                    measured += 1
                    revealed_measured += 1
                    if after['ratio'] < after['need'] and (not before or before['ratio'] >= before['need']
                                                           or after['ratio'] < before['ratio']):
                        bad.append(('[열어서] ' + txt[:18], before, after))
            # 닫고 다음 그릇으로
            pg.evaluate("""(c) => document.querySelectorAll('.' + c)
                                   .forEach(e => e.classList.remove('active'))""", cls)
            pg.wait_for_timeout(120)

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

print('')
print('잰 요소 %d개 · 건너뛴 것 %d개 · 미달 %d건' % (measured, skipped, total))
print('  건너뛴 이유: ' + ' / '.join('%s %d' % (k, v) for k, v in reasons.items()))
print('  열어서 잰 것: %d개 (숨은 그릇 %d종: %s)'
      % (revealed_measured, len(REVEALABLE), ', '.join('.' + c for c in REVEALABLE) or '없음'))
if exc_kinds:
    print('  예외 종류: ' + ', '.join('%s %d' % (k, v) for k, v in exc_kinds.items()))

# A-587: 숨은 그릇이 있는데 열어서 잰 것이 0이면, 드러나는 링크를 또 못 잰 것이다.
if REVEALABLE and revealed_measured == 0:
    print('결과: 실패 — 숨었다가 드러나는 그릇 %d종을 찾았는데 그 안에서 잰 것이 0개다. '
          '호버로 드러나는 링크를 또 못 재고 있다 (A-587).' % len(REVEALABLE))
    sys.exit(1)

# A-587: 예외로 빠진 것이 잰 것의 20%를 넘으면 조용한 통과를 믿을 수 없다.
if reasons['예외'] > max(20, measured * 0.2):
    print('결과: 실패 — 호버가 예외로 빠진 것이 %d개다(잰 것 %d개). '
          '이 정도면 「미달 0건」이 쟀다는 뜻이 아니다 (A-587).' % (reasons['예외'], measured))
    sys.exit(1)

if measured == 0:
    print('결과: 실패 — 잰 요소가 0개다. 센 것이 없으면 통과가 아니다 (A-433 · A-443).')
    sys.exit(1)
if total:
    print('결과: 실패 — 호버에서 깨지는 글자 %d건' % total)
    sys.exit(1)
print('결과: 통과 (요소 %d개 측정 · 미달 0건)' % measured)
