#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""초점 고리가 **실제로 보이는지** 잰다 (검수대장 A-589).

   실행: python3 scripts/check_focus_visible.py index.html brands.html ...
   필요: playwright + 크로미움. 승리님 기계에서는 못 받으니 컨테이너에서 돈다
         (까닭과 실행법은 tools/check-all.py 머리글).

왜 있는가
---------
style.css 3947행의 `:focus-visible` 은 **두 겹**으로 설계돼 있다 —
어두운 테두리(#141414) + 그 바깥의 흰 후광(rgba(255,255,255,0.92)).
「어느 바탕에서도 둘 중 하나는 반드시 보인다」는 약속이다(A-456 에서 배운 것).

그런데 그 약속을 **한 번도 재 본 적이 없다.** 설계 의도가 적혀 있을 뿐이다.
A-587 이 같은 모양이었다 — 호버 대비 검사가 있는데 호버로 드러나는 것을
못 재고 있었다. 초점은 더 중요하다: 키보드로만 쓰는 사람은 고리가 안 보이면
지금 어디 있는지 모른 채 넘긴다(WCAG 2.4.7, 그리고 고리 자체의 대비는 1.4.11).

무엇을 재는가
------------
Tab 을 눌러 **정말로 초점이 가는 자리마다** 멈춰서,
  ① `:focus-visible` 이 걸렸는지
  ② 테두리와 후광이 각각 **그 뒤에 있는 바탕**과 몇 대 몇인지
  ③ 둘 중 **큰 쪽이 3:1 이상**인지 (WCAG 1.4.11 비텍스트 대비)
를 본다. 둘 다 3:1 미만이면 그 자리는 실패다.

`.focus()` 를 부르지 않고 **Tab 키를 누른다.** `:focus-visible` 은 키보드로
왔는지를 브라우저가 판단해서 거는 가상 클래스라, 프로그램으로 초점만 옮기면
걸리지 않는 경우가 있다 — 그러면 「고리가 없다」고 잘못 읽는다.
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright

SRC = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = sys.argv[1:] or ['index.html']
MAX_TABS = int(os.environ.get('ARCHINODE_MAX_TABS', '70'))
NEED = 3.0          # WCAG 1.4.11 비텍스트 대비
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                    '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082')

MEASURE = r"""
(el => {
  const nums = s => { const m = String(s).match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const l = [lum(a), lum(b)].sort((x, y) => y - x); return (l[0] + 0.05) / (l[1] + 0.05); };
  const over = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1;
    return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a)]; };

  // 고리는 요소 **바깥**에 그려진다 → 뒤에 있는 것은 조상의 바탕이다.
  const backdrop = e => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;  // 사진 위 — 합성 가정이 안 선다
      const c = nums(cs.backgroundColor);
      if (c && (c.length < 4 || c[3] > 0.95)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };

  const cs = getComputedStyle(el);
  const bg = backdrop(el);
  if (!bg) return {skip: 'photo'};

  const ow = parseFloat(cs.outlineWidth) || 0;
  const hasOutline = ow > 0 && cs.outlineStyle !== 'none';
  const oc = nums(cs.outlineColor);
  const outlineRatio = (hasOutline && oc) ? ratio(over(oc, bg), bg) : 0;

  // box-shadow 에서 색을 뽑는다 (후광)
  let haloRatio = 0, haloColor = null;
  const sh = cs.boxShadow || 'none';
  if (sh !== 'none') {
    const m = sh.match(/rgba?\([^)]*\)/g);
    const spread = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(sh);
    const hasSpread = spread ? Math.abs(parseFloat(spread[4])) > 0 : /\d+px/.test(sh);
    if (m && hasSpread) {
      for (const c of m) {
        const v = nums(c);
        if (!v) continue;
        const r = ratio(over(v, bg), bg);
        if (r > haloRatio) { haloRatio = r; haloColor = c; }
      }
    }
  }

  // 테두리: 쉬는 상태와 견준다. 바뀐 테두리가 **쉬던 테두리**와 3:1 이면
  // 키보드 사용자는 변화를 본다 (WCAG 1.4.11 은 바뀐 부분의 대비를 묻는다).
  let borderChange = 0, borderOnBg = 0, bNow = null, bRest = null;
  try {
    const rest = JSON.parse(el.dataset.archiRest || 'null');
    const bwNow = parseFloat(cs.borderTopWidth) || 0;
    if (rest && bwNow > 0 && cs.borderTopStyle !== 'none') {
      bNow = nums(cs.borderTopColor);
      bRest = nums(rest.bc);
      const restW = parseFloat(rest.bw) || 0;
      if (bNow && bRest) {
        const nowC = over(bNow, bg), restC = over(bRest, bg);
        borderChange = ratio(nowC, restC);
        borderOnBg = ratio(nowC, bg);
        // 테두리가 **없다가 생긴** 경우도 변화다
        if (restW === 0 || rest.bs === 'none') borderChange = Math.max(borderChange, borderOnBg);
      }
    }
  } catch (e) {}

  const r = el.getBoundingClientRect();
  return {
    borderChange: Math.round(borderChange * 100) / 100,
    borderOnBg: Math.round(borderOnBg * 100) / 100,
    borderNow: bNow ? cs.borderTopColor : 'none',
    borderRest: bRest ? (JSON.parse(el.dataset.archiRest || '{}').bc || 'none') : 'none',
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    onscreen: r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 34) : '',
    text: (el.innerText || el.value || '').trim().slice(0, 24).replace(/\s+/g, ' '),
    fv: el.matches(':focus-visible'),
    outlineRatio: Math.round(outlineRatio * 100) / 100,
    haloRatio: Math.round(haloRatio * 100) / 100,
    ringBest: Math.round(Math.max(outlineRatio, haloRatio) * 100) / 100,
    best: Math.round(Math.max(outlineRatio, haloRatio,
                              Math.min(borderChange, borderOnBg)) * 100) / 100,
    outline: hasOutline ? (cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor) : 'none',
    halo: haloColor || 'none',
    bg: 'rgb(' + bg.map(Math.round).join(',') + ')'
  };
})
"""

def reveal_test(pg, el, m):
    """고리가 없는 자리가 **나타남으로** 초점을 알리는지 잰다.

    평소 화면 밖에 있다가 초점이 오면 들어오는 것(건너뛰기 링크)은 고리가 없어도
    키보드 사용자가 안다. 이름을 코드에 박으면 다음에 같은 패턴이 하나 더 생길 때
    조용히 실패하므로, **초점을 떼었을 때 자리가 변하는지**를 직접 잰다.

    돌려주는 값: 움직였으면 (초점 있을 때 rect, 뗐을 때 rect), 아니면 None.
    """
    try:
        focused = m['rect']
        pg.evaluate("(e) => { e.blur(); }", el)
        pg.wait_for_timeout(420)
        blurred = pg.evaluate(
            "(e) => { const r = e.getBoundingClientRect();"
            " return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }", el)
        # 다시 초점을 줘서 Tab 차례를 잇는다
        pg.evaluate("(e) => e.focus()", el)
        pg.wait_for_timeout(120)
    except Exception:
        return None
    if not blurred:
        return None
    # 자리가 눈에 띄게 달라졌나 (16px 이상 움직였거나 크기가 달라졌나)
    dx, dy = abs(focused[0] - blurred[0]), abs(focused[1] - blurred[1])
    dw, dh = abs(focused[2] - blurred[2]), abs(focused[3] - blurred[3])
    if max(dx, dy) >= 16 or max(dw, dh) >= 16:
        return (focused, blurred)
    return None


def run(pages):
    revealed_ok = []
    total_bad = 0
    total_stops = 0
    skipped_photo = 0
    no_fv = 0
    rows_bad = []

    with sync_playwright() as p:
        exe = os.environ.get('PLAYWRIGHT_CHROME')
        if not exe and os.path.exists('/usr/bin/google-chrome'):
            exe = '/usr/bin/google-chrome'
        b = (p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe
             else p.chromium.launch(args=['--no-sandbox']))
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})

        def route(r):
            if r.request.url.startswith('file:'):
                return r.continue_()
            if r.request.resource_type == 'image':
                return r.fulfill(status=200, content_type='image/png', body=PNG)
            return r.fulfill(status=204, body='')
        ctx.route('**/*', route)

        for f in pages:
            pg = ctx.new_page()
            pg.goto('file://' + SRC + '/' + f, wait_until='load', timeout=20000)
            pg.wait_for_timeout(500)
            # A-589: 입력칸은 `outline: none`(style.css 1375행)이고 초점을 **테두리 색**으로
            # 알린다(`border-color: var(--black)`). 고리만 보면 입력칸 22곳을 전부
            # 「안 보인다」고 잘못 읽는다 — 2026-11-18 에 내가 그렇게 읽었다.
            # 그래서 **쉬는 상태의 테두리 색을 미리 적어 두고** 초점이 왔을 때와 견준다.
            pg.evaluate("""() => {
              const sel = 'a[href], button, input, select, textarea, [tabindex]';
              document.querySelectorAll(sel).forEach((e, i) => {
                e.dataset.archiFidx = String(i);
                const cs = getComputedStyle(e);
                e.dataset.archiRest = JSON.stringify({
                  bc: cs.borderTopColor, bw: cs.borderTopWidth, bs: cs.borderTopStyle
                });
              });
            }""")
            pg.evaluate("() => document.body.focus()")
            bad = []
            stops = 0
            seen = set()
            for _ in range(MAX_TABS):
                pg.keyboard.press('Tab')
                # 전환(transition)보다 길게 기다린다. `.hero-dot` 은 `transition: all 0.3s`
                # 라서 55ms 에 재면 **중간색**을 읽는다 — 2026-11-18 에 내가 그렇게 재서
                # 「히어로 점의 고리가 안 보인다」고 잘못 읽었다(실측값 rgb(35,27,16) 과
                # 알파 0.204 는 CSS 어디에도 없는 숫자였다). 호버 대비 검사가 같은 까닭으로
                # 550ms 를 기다린다 — 같은 실수를 같은 저장소에서 두 번 했다.
                pg.wait_for_timeout(420)
                el = pg.evaluate_handle("() => document.activeElement")
                try:
                    key = pg.evaluate(
                        "(e) => e ? (e.tagName + '#' + (e.id||'') + '.' + "
                        "(typeof e.className === 'string' ? e.className : '') + '|' + "
                        "((e.innerText||e.value||'').slice(0,18))) : 'none'", el)
                except Exception:
                    break
                if key == 'none' or key.startswith('BODY#') or key.startswith('HTML#'):
                    continue   # body/html 은 class 가 붙어도 초점 정거장이 아니다
                if key in seen:
                    break           # 한 바퀴 돌았다
                seen.add(key)
                m = pg.evaluate(MEASURE, el)
                if not m:
                    continue
                if m.get('skip') == 'photo':
                    skipped_photo += 1
                    continue
                stops += 1
                if not m['fv']:
                    no_fv += 1
                if m['best'] < NEED:
                    # 고리가 없어도 **제가 나타나는 것**이 알림인 자리가 있다
                    # (건너뛰기 링크: 평소 화면 밖에 있다가 초점이 오면 들어온다).
                    # 이름을 박지 않고 **실제로 움직이는지** 재서 가린다.
                    moved = reveal_test(pg, el, m)
                    if moved:
                        revealed_ok.append((f, m, moved))
                    else:
                        bad.append(m)
            total_stops += stops
            total_bad += len(bad)
            print('%-42s 정거장 %2d개 · 안 보이는 고리 %d건' % (f[:40], stops, len(bad)))
            shown = set()
            for m in bad:
                k = (m['outline'], m['halo'], m['bg'])
                if k in shown:
                    continue
                shown.add(k)
                rows_bad.append((f, m))
                print('     <%s %s%s> "%s"' % (m['tag'], ('#' + m['id']) if m['id'] else '',
                                               (' .' + m['cls']) if m['cls'] else '', m['text']))
                print('       고리: 테두리 %s (대비 %.2f) · 후광 %s (대비 %.2f)'
                      % (m['outline'], m['outlineRatio'], m['halo'], m['haloRatio']))
                print('       테두리색: %s ← 쉴 때 %s (변화 %.2f · 바탕 위 %.2f)'
                      % (m['borderNow'], m['borderRest'], m['borderChange'], m['borderOnBg']))
                print('       뒤 바탕 %s → 큰 쪽 %.2f (필요 %.1f)' % (m['bg'], m['best'], NEED))
            pg.close()
        b.close()

    print('')
    print('초점 정거장 %d개 측정 · 안 보이는 고리 %d건 (사진 위라 건너뜀 %d · :focus-visible 안 걸린 자리 %d)'
          % (total_stops, total_bad, skipped_photo, no_fv))
    if revealed_ok:
        print('  고리 대신 **나타남으로** 알리는 자리 %d개 (실측으로 가렸다):' % len(revealed_ok))
        for f, m, mv in revealed_ok:
            print('     %s <%s%s> "%s"  초점 %s ← 뗀 뒤 %s'
                  % (f, m['tag'], ('.' + m['cls']) if m['cls'] else '', m['text'], mv[0], mv[1]))

    if total_stops == 0:
        print('결과: 실패 — 초점이 간 자리가 0개다. 센 것이 없으면 통과가 아니다 (A-433 · A-443).')
        return 1
    if total_bad:
        print('결과: 실패 — 키보드로 쓰는 사람이 지금 어디 있는지 모르는 자리 %d건' % total_bad)
        return 1
    print('결과: 통과 (초점 정거장 %d개 측정 · 전부 3:1 이상)' % total_stops)
    return 0


if __name__ == '__main__':
    sys.exit(run(PAGES))
