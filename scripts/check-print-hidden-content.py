"""인쇄할 때 **종이에 안 나오는 내용**이 있나 — A-646(브론즈 50차 N50-6).

까닭: `.fade-in`(style.css 960행)은 `opacity: 0` 으로 시작해서 스크롤로
`.visible` 이 붙을 때 열린다. **인쇄는 스크롤을 하지 않는다.** 그래서 안 열린
칸이 투명한 채로 찍히는데 **높이는 차지하므로 빈 종이**가 된다. 움직임 줄이기
블록에는 이 처방이 있었는데 인쇄 블록에는 없었다.

브론즈 실측: about.html 10장 중 **6장 백지** · magazine.html 6장 중 **3장 백지** ·
쪽 18개 합계 79장 중 9장(11.4%). 회사 소개와 매거진을 인쇄하면 본문이 종이에
없었다.

★ 이 검사기가 왜 따로 필요한가. A-630·A-640 의 인쇄 검사기 둘은 대비와 겹침을
  재려고 **보이는 요소만** 골랐다(`checkVisibility`). 그래서 opacity 0 인 칸은
  표본에서 **조용히 빠졌다** — 안 보이는 글자의 대비를 세지 않으려던 올바른
  처방이, 안 보이는 것 자체가 결함일 때는 눈을 가렸다.
  **안 보이는 것을 빼고 재면, 안 보이는 것이 결함일 때 못 찾는다.**
  그래서 이 검사기는 거꾸로 **안 보이는 것만** 센다.

무엇을 보나: 인쇄 매체에서, 글자를 담고 있으면서 ① opacity < 0.05 이거나
② visibility: hidden 인데 ③ 높이를 차지하는 요소. 셋이 겹치면 백지다.
(`display:none` 은 높이를 안 차지하므로 센 적이 없다 — 일부러 숨긴 것이다.)
"""
import sys, os, glob

MIN_CHARS = 40      # 글자 40자 미만은 장식·아이콘일 수 있다
MIN_H = 24          # 높이 24px 미만은 종이 한 장을 비울 수 없다

JS = r"""() => {
  const out = [];
  document.querySelectorAll('body *').forEach(function (e) {
    const txt = (e.textContent || '').trim();
    if (txt.length < __MINCHARS__) return;
    const cs = getComputedStyle(e);
    if (cs.display === 'none') return;                  // 일부러 뺀 것
    const op = parseFloat(cs.opacity || '1');
    const hid = (op < 0.05) || cs.visibility === 'hidden';
    if (!hid) return;
    const r = e.getBoundingClientRect();
    if (r.height < __MINH__) return;
    // 조상이 이미 숨어 있으면 조상만 센다 (중복 방지)
    let p = e.parentElement, dup = false;
    while (p && p !== document.body) {
      const pc = getComputedStyle(p);
      if (parseFloat(pc.opacity || '1') < 0.05 || pc.visibility === 'hidden') { dup = true; break; }
      p = p.parentElement;
    }
    if (dup) return;
    out.push({tag: e.tagName.toLowerCase(), cls: String(e.className || '').split(' ')[0],
              op: op, vis: cs.visibility, h: Math.round(r.height),
              chars: txt.length, ex: txt.slice(0, 22)});
  });
  return out;
}""".replace('__MINCHARS__', str(MIN_CHARS)).replace('__MINH__', str(MIN_H))


def main():
    if len(sys.argv) < 2:
        print('쓰기: check-print-hidden-content.py <밑주소> [쪽...]')
        return 1
    base = sys.argv[1].rstrip('/')
    pages = sys.argv[2:]
    root = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))
    if not pages:
        SKIP = {'.git', 'node_modules', '.netlify', 'docs', 'assets', 'previews'}
        found = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP]
            for f in filenames:
                if f.endswith('.html'):
                    found.append(os.path.relpath(os.path.join(dirpath, f), root)
                                 .replace(os.sep, '/'))
        pages = sorted(found)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('검사 못함  playwright 가 없다 — 컨테이너에서 돌려라')
        return 1

    total, bad, chars = 0, [], 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for page in pages:
            ctx = b.new_context(viewport={'width': 1280, 'height': 900})
            ctx.route('**/*', lambda r: r.continue_()
                      if ('127.0.0.1' in r.request.url or 'localhost' in r.request.url)
                      else r.abort())
            pg = ctx.new_page()
            try:
                pg.goto('%s/%s' % (base, page), wait_until='load', timeout=25000)
            except Exception as e:
                print('  못 열었다 %s — %s' % (page, str(e)[:50]))
                ctx.close()
                continue
            pg.wait_for_timeout(800)
            pg.emulate_media(media='print')
            pg.wait_for_timeout(400)
            rows = pg.evaluate(JS)
            total += 1
            for r in rows:
                chars += r['chars']
                bad.append('%-40s <%s class=%-14s> 투명%.2f %s 높이%4dpx 글자%5d 「%s」'
                           % (page, r['tag'], r['cls'][:14], r['op'], r['vis'],
                              r['h'], r['chars'], r['ex']))
            ctx.close()
        b.close()

    print('검사함  쪽 %d개' % total)
    if total == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1
    if bad:
        for x in bad[:25]:
            print('  결함 — 인쇄에서 종이에 안 나온다:', x)
        if len(bad) > 25:
            print('  … 그리고 %d자리 더' % (len(bad) - 25))
        print('  합계 %d자리 · 종이에서 사라지는 글자 %d자' % (len(bad), chars))
        print('     까닭: 높이는 차지하면서 투명하므로 **빈 종이**가 된다.')
        return 1
    print('인쇄에서 종이에 안 나오는 내용 — 없음')
    return 0


sys.exit(main())
