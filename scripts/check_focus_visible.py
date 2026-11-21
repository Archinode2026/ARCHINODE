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
def _default_pages(root):
    """A-657: 기본 표본이 `['index.html']` **한 쪽**이었다. 248쪽 중 1쪽이다.
    쪽마다 20~40초가 걸려 전수는 현실적이지 않으니, **위험한 쪽을 골라낸다**:
      ㄱ) 쪽 단위 <style> 이 :focus / :focus-visible / outline 을 건드리는 쪽
      ㄴ) style.css 를 안 싣는 쪽(두 겹 고리가 아예 없을 수 있다)
      ㄷ) 폴더마다 대표 한 쪽 (같은 판으로 찍힌 쪽들을 한 번은 본다)
    고르는 기준을 **코드에 적어 두는 것**이 요점이다 — 누가 왜 이 표본인지
    물을 수 있어야 한다. 하드코딩한 목록은 그 물음에 답하지 못한다.
    """
    import glob as _g
    def _strip(t):
        t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
        return re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    risky, by_dir = [], {}
    all_pages = sorted(os.path.relpath(q, root).replace(os.sep, '/')
                       for q in _g.glob(os.path.join(root, '**', '*.html'), recursive=True))
    for rel in all_pages:
        if rel.startswith('previews/'):
            continue
        try:
            raw = _strip(open(os.path.join(root, rel), encoding='utf-8', errors='replace').read())
        except OSError:
            continue
        focusable = len(re.findall(r'<(?:a\b[^>]*href|button|input|select|textarea)', raw))
        if not focusable:
            continue
        css = '\n'.join(m.group(1) for m in re.finditer(r'<style[^>]*>(.*?)</style>', raw, re.S))
        has_sc = bool(re.search(r"""href\s*=\s*['"][^'"]*style\.css""", raw))
        if re.search(r':focus(?:-visible)?|outline\s*:', css) or not has_sc:
            risky.append(rel)
        else:
            d = rel.split('/')[0] if '/' in rel else '.'
            by_dir.setdefault(d, rel)
    return risky + [v for v in by_dir.values() if v not in risky]


PAGES = sys.argv[1:] or _default_pages(SRC)
# A-657: 70 고정이면 초점 갈 자리가 107개인 쪽(index.html)을 다 못 돈다.
#        쪽마다 실제 개수를 세어 그보다 넉넉히 돈다(아래 tab_budget).
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

        coverage = []
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
            # A-657: 이 쪽의 초점 갈 자리를 세어 예산을 잡는다(+8 여유)
            tab_budget = pg.evaluate(
                "() => document.querySelectorAll('a[href],button,input,select,textarea,"
                "[tabindex]:not([tabindex=\\\"-1\\\"])').length") + 8
            tab_budget = max(MAX_TABS, min(tab_budget, 400))
            for _ in range(tab_budget):
                pg.keyboard.press('Tab')
                # 전환(transition)보다 길게 기다린다. `.hero-dot` 은 `transition: all 0.3s`
                # 라서 55ms 에 재면 **중간색**을 읽는다 — 2026-11-18 에 내가 그렇게 재서
                # 「히어로 점의 고리가 안 보인다」고 잘못 읽었다(실측값 rgb(35,27,16) 과
                # 알파 0.204 는 CSS 어디에도 없는 숫자였다). 호버 대비 검사가 같은 까닭으로
                # 550ms 를 기다린다 — 같은 실수를 같은 저장소에서 두 번 했다.
                pg.wait_for_timeout(420)
                el = pg.evaluate_handle("() => document.activeElement")
                try:
                    # ★ A-657: 열쇠를 **요소 자체**로 만든다.
                    #   전에는 `태그#id.class|글자18자` 였다. 그런데 히어로 점 10개는
                    #   id 도 글자도 없어서 **열 개가 같은 열쇠**였고, 두 번째 점에서
                    #   「한 바퀴 돌았다」로 읽고 `break` 했다 — index.html 의 초점 갈
                    #   자리 107개 중 **16개만 재고 「통과」**라고 말했다.
                    #   위에서 모든 초점 요소에 `data-archi-fidx` 를 박아 뒀으니
                    #   그걸 쓰면 같은 요소로 돌아온 것만 한 바퀴다.
                    key = pg.evaluate(
                        "(e) => { if (!e) return 'none';"
                        " const ix = e.dataset ? e.dataset.archiFidx : undefined;"
                        " const base = e.tagName + '#' + (e.id||'') + '.' +"
                        "   (typeof e.className === 'string' ? e.className : '');"
                        " return (ix !== undefined && ix !== '') ? ('ix:' + ix + '|' + base)"
                        "   : (base + '|' + ((e.innerText||e.value||'').slice(0,18))); }", el)
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
            # A-657: 몇 개를 **못 쟀는지**도 센다. 로그인이 필요한 쪽은
            #   화면이 「Loading…」에서 멈춰 초점 요소의 대부분이 DOM 에 없다.
            #   brand-portal/dashboard.html 은 초점 요소 86개 중 **4개**만
            #   잴 수 있었다. 이걸 적지 않고 「통과」라고만 하면, 안 잰 82개가
            #   통과한 것처럼 읽힌다 — 오늘 하루 그 실수를 네 번 봤다.
            # 셋을 따로 센다 — 안 쟀다고 다 같은 까닭이 아니다.
            #   dom     : DOM 에 있는 초점 요소
            #   tabbable: 그중 **실제로 Tab 차례에 드는 것**(화면에 있고 숨지 않은 것)
            #   stops   : 내가 실제로 멈춘 자리
            # magazine.html 은 dom 189 · tabbable 64 였다 — 「더 보기」로 125개가
            # `display:none` 이어서다. 숨은 칸이 Tab 차례에 없는 건 **정상**이다.
            # 반대로 로그인 쪽은 dom 자체가 작다(화면이 Loading 에서 멈춘다).
            cnt = pg.evaluate("""() => {
              const sel = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
              const all = [...document.querySelectorAll(sel)];
              const tab = all.filter(e => {
                const c = getComputedStyle(e);
                if (c.display === 'none' || c.visibility === 'hidden') return false;
                if (e.disabled) return false;
                return !!(e.offsetParent || c.position === 'fixed');
              });
              return {dom: all.length, tab: tab.length};
            }""")
            coverage.append((f, stops, cnt['dom'], cnt['tab']))
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

    # ── A-657: 못 쟀으면 못 쟀다고 적는다. 그리고 **까닭을 단정하지 않는다** ──
    #   처음 쓴 판은 「로그인이 필요한 쪽은…」이라고 까닭을 박아 놨는데,
    #   magazine.html 은 로그인 쪽이 아니라 「더 보기」로 125개가 숨은 것이었다.
    #   재지도 않은 까닭을 적으면 그 줄이 틀린 말을 한다. 그래서 숫자로 가른다.
    missed = [c for c in coverage if c[3] and c[1] < c[3] * 0.8]        # Tab 차례인데 못 쟀다
    gated  = [c for c in coverage if c[2] and c[3] < c[2] * 0.5]        # DOM 에 있는데 Tab 차례가 아니다
    if missed:
        print('')
        print('  ※ **덜 쟀다** — Tab 차례에 드는 자리인데 내가 못 멈춘 곳이 있다.')
        print('     검사기 쪽 문제일 수 있다(한 바퀴 판정, 예산 상한 등). 봐야 한다.')
        for f, st, dom, tab in missed:
            print('       %-38s Tab 차례 %3d개 중 %3d개만 쟀다' % (f, tab, st))
    if gated:
        print('')
        print('  ※ **Tab 차례에 안 드는 자리가 많다** — 아래 쪽들은 DOM 에 있는 초점 요소의')
        print('     절반 이상이 숨어 있다. 두 가지 중 하나이고, 숫자만으로는 못 가른다:')
        print('       ㄱ) 「더 보기」·접힌 메뉴처럼 **원래 숨어 있는 것** (정상)')
        print('       ㄴ) 로그인이 필요해 화면이 「Loading…」에서 멈춘 것')
        print('     ㄴ이면 저는 로그인하지 않으므로(규칙) **승리님만 확인할 수 있습니다** —')
        print('     로그인한 채로 Tab 을 눌러 고리가 보이는지 봐 주세요.')
        for f, st, dom, tab in gated:
            print('       %-38s DOM %3d개 · Tab 차례 %3d개 · 쟀 %3d개' % (f, dom, tab, st))
    thin = missed or gated

    if total_stops == 0:
        print('결과: 실패 — 초점이 간 자리가 0개다. 센 것이 없으면 통과가 아니다 (A-433 · A-443).')
        return 1
    if total_bad:
        print('결과: 실패 — 키보드로 쓰는 사람이 지금 어디 있는지 모르는 자리 %d건' % total_bad)
        return 1
    if thin:
        print('결과: 통과(쟀 자리만) — 정거장 %d개 전부 3:1 이상. 다만 위 %d쪽은 덜 쟀다.'
              % (total_stops, len(thin)))
    else:
        print('결과: 통과 (초점 정거장 %d개 측정 · 전부 3:1 이상)' % total_stops)
    return 0


if __name__ == '__main__':
    sys.exit(run(PAGES))
