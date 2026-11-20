#!/usr/bin/env python3
"""어두운 컨테이너 위의 글자 명암비 — 실측 검사기 (A-652)

왜 만들었나
-----------
A-193 과 A-206 이 「밝은 배경용 토큰을 어두운 컨테이너에 올리면 2.3:1」이라는
**같은 결함을 두 번** 잡았다. 그런데 A-206 은 `.lang-switch-btn` 만 고치고
마크업의 `.lang-switch` 를 빠뜨려, 로그인·회원가입·비밀번호재설정·프로필·
브랜드대시보드 **다섯 쪽**에서 2.27:1 이 그대로 남아 있었다(A-652).
기존 명암비 검사기는 `PAGES = sys.argv[1:] or ['index.html']` — 기본 표본이
**한 쪽**이어서 못 봤다. auth/·brand-portal/·admin/ 은 색인이 안 되니
거의 모든 쓸기에서 빠져 있었는데, **색인 안 되는 쪽이 사람이 안 보는 쪽은 아니다.**
로그인 창은 오히려 가장 많이 보는 쪽이다.

무엇을 재나
-----------
계산한 색이 아니라 **브라우저가 실제로 칠한 색**을 잰다. 조상을 거슬러 올라가
실효 배경을 찾고, 그 위 글자의 WCAG 2.1 명암비를 센다.
기준: 4.5:1. 큰 글자(24px 이상, 또는 18.66px 이상이고 700 이상)는 3:1.
"""
import asyncio, json, sys, glob, os
from playwright.async_api import async_playwright

JS = r"""() => {
  // ── 색 파싱: rgb()/rgba() → [r,g,b,a] ────────────────────────────────
  const parse = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return [+m[0], +m[1], +m[2], m.length >= 4 ? +m[3] : 1];
  };
  // ★ 반투명을 건너뛰지 않는다 — 합성해서 실제로 보이는 색을 만든다.
  //   A-652: 처음 쓴 판은 알파가 1이 아니면 return null 로 **건너뛰었다**.
  //   그런데 꼬리말 아랫줄이 rgba(...,0.52) 여서, 가장 의심스러운 자리를
  //   정확히 빼고 재고 있었다. (A-646 과 같은 함정의 다른 옷)
  const over = (fg, bg) => {                       // fg 를 bg 위에 올린다
    const a = fg[3];
    return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1];
  };
  const lum = (rgb) => {
    const f = (v) => { v = v/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(rgb[0]) + 0.7152*f(rgb[1]) + 0.0722*f(rgb[2]);
  };
  // 조상의 배경을 모아 **불투명한** 실효 배경을 만든다
  const effBg = (el) => {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.999) break; }
      n = n.parentElement;
    }
    const docBg = parse(getComputedStyle(document.documentElement).backgroundColor);
    let base = (docBg && docBg[3] >= 0.999) ? docBg : [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  // 글자 자체의 알파 × 조상들의 opacity
  const effText = (el, bg) => {
    const c = parse(getComputedStyle(el).color);
    if (!c) return null;
    let a = c[3], n = el;
    while (n && n.nodeType === 1) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!isNaN(o) && o < 1) a *= o;
      n = n.parentElement;
    }
    if (a <= 0.02) return null;                    // 사실상 안 보이는 글자는 명암비의 문제가 아니다
    return over([c[0], c[1], c[2], a], bg);
  };
  const ratio = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1,L2)+0.05) / (Math.min(L1,L2)+0.05);
  };
  const pathOf = (el) => {
    const p = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; p.unshift(s); break; }
      const cls = (n.className && typeof n.className === 'string')
        ? n.className.trim().split(/\s+/).slice(0,2).map(c=>'.'+c).join('') : '';
      p.unshift(s + cls);
    }
    return p.join(' > ');
  };

  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const txt = (t.nodeValue || '').trim();
    if (!txt) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!el.offsetParent && cs.position !== 'fixed' && el !== document.body) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (el.closest('[aria-hidden="true"]')) continue;

    const bg = effBg(el);
    if (lum(bg) > 0.18) continue;                  // 어두운 컨테이너만
    const fg = effText(el, bg);
    if (!fg) continue;

    const cr = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const w = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && w >= 700);
    const need = large ? 3.0 : 4.5;
    if (cr + 0.005 < need) {
      out.push({ sel: pathOf(el), text: txt.slice(0, 34), cr: +cr.toFixed(2),
                 need: need, size: cs.fontSize, w: String(w), color: cs.color,
                 bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')' });
    }
  }
  return out;
}"""

async def run(root, pages):
    bad = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        for f in pages:
            try:
                await pg.goto('file://' + os.path.join(root, f), wait_until='load')
                await pg.wait_for_timeout(300)
                r = await pg.evaluate(JS)
            except Exception as e:
                bad[f] = [{'sel': '(쪽을 못 열었다)', 'text': str(e)[:60], 'cr': 0, 'need': 0,
                           'size': '-', 'w': '-', 'color': '-', 'bg': '-'}]
                continue
            if r:
                bad[f] = r
        await b.close()
    return bad

def main():
    root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else '.'
    pages = sys.argv[2:]
    if not pages:
        # ★ 기본 표본이 전수다 — 기존 검사기는 기본이 index.html 한 쪽이어서 못 봤다
        pages = sorted(os.path.relpath(p, root) for p in glob.glob(os.path.join(root, '**', '*.html'), recursive=True))
        pages = [p for p in pages if not p.startswith('previews' + os.sep)]
    bad = asyncio.run(run(root, pages))
    n = sum(len(v) for v in bad.values())
    print('어두운 컨테이너 명암비 — %d쪽 측정' % len(pages))
    if not bad:
        print('통과: 기준 미달 0자리')
        return 0
    for f, items in sorted(bad.items()):
        print('\n── %s  (%d자리)' % (f, len(items)))
        for x in items:
            print('   %5.2f:1 (기준 %.1f)  %-7s %-4s %-22s %s' %
                  (x['cr'], x['need'], x['size'], x['w'], x['color'], x['sel']))
            print('        글: %s' % x['text'])
    print('\n실패: %d쪽 %d자리' % (len(bad), n))
    return 1

if __name__ == '__main__':
    sys.exit(main())
