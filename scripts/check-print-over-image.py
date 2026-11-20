"""인쇄에서 글이 사진(<img>) 위에 얹히는 자리를 센다 — A-640(브론즈 49차 N49-2).

까닭: A-630 은 「인쇄에서 흰 종이 위 흰 글자」를 막으려고 글자를 **전부 먹색으로**
덮고 배경을 죽였다. 그런데 배경(gradient)은 죽어도 **<img> 는 찍힌다.** 이 사이트의
띠·카드는 전부 한 가지 꼴이라 — `relative` 상자 + 꽉 찬 `<img>` + 그 위
`*-overlay`(어두운 그라데이션 + 흰 글자) — 그라데이션만 사라지고 사진은 남아,
종이에서 **사진 위 먹글씨**가 됐다. 브론즈 실측 최저 대비 1.02:1.

★ 재는 규칙은 **색이 아니라 기하**다. 사진의 픽셀은 쪽마다·기사마다 다르므로
  「이 사진 위에서 대비가 몇이냐」로는 아무것도 보장할 수 없다. 그래서
  **인쇄 매체에서 글자가 <img> 와 겹치지 않는다**는 쪽으로 잡는다.
  (기사 섬네일 위의 작은 딱지처럼 사진이 *내용*인 자리는, 사진을 빼는 대신
   딱지를 흐름으로 돌려 사진 *앞*에 오게 했다 — style.css 인쇄 블록 ㅁ 참고.)

★ 자산 115MB 를 들이지 않으려고 그림 요청은 1x1 PNG 로 받아친다. 재는 것이
  픽셀이 아니라 상자이므로 결과는 같고, <img> 가 깨지지 않아 상자가 제대로 선다.

부숴 보기(2026-11-20): ㄱ블록 제거 → 울림 · .category-card-image 만 빼기 → 울림 ·
히어로 picture 되살리기 → 울림 · A-640 전체 제거 → 34자리 · **주석 안에만
display:block 적기 → 안 울림**(덫). 성한 상태 0자리.
"""
import sys, base64, os, glob

PNG = base64.b64decode(
    b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    b'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

MIN_FRAC = 0.5      # 글자 상자의 절반 넘게 사진에 걸친 것만 — 모서리 1~2px 스침은 뺀다
MIN_IMG = 24        # 24px 미만은 아이콘·로고다. 글의 바탕이 아니다

JS = r"""() => {
  const imgs = [];
  document.querySelectorAll('img, picture, video').forEach(function (m) {
    if (typeof m.checkVisibility === 'function' &&
        !m.checkVisibility({contentVisibilityAuto:true, opacityProperty:true, visibilityProperty:true})) return;
    const r = m.getBoundingClientRect();
    if (r.width < __MINIMG__ || r.height < __MINIMG__) return;
    if (parseFloat(getComputedStyle(m).opacity || '1') < 0.05) return;
    imgs.push({r: r, tag: m.tagName.toLowerCase(),
               cls: String(m.className || '').split(' ')[0]});
  });

  const out = [];
  const seen = new Set();
  document.querySelectorAll('body *').forEach(function (e) {
    const txt = (e.textContent || '').trim();
    if (!txt) return;
    if (e.children.length > 0) return;                 // 글자를 직접 든 잎만
    if (e.getClientRects().length === 0) return;
    /* A-636 에서 배운 것: getClientRects 만으로는 닫힌 <details> 안과
       content-visibility 가 안 걸러진다 — 안 보이는 글자를 셌다. */
    if (typeof e.checkVisibility === 'function' &&
        !e.checkVisibility({contentVisibilityAuto:true, opacityProperty:true, visibilityProperty:true})) return;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return;
    const t = e.getBoundingClientRect();
    if (t.width < 2 || t.height < 2) return;

    for (const m of imgs) {
      const ox = Math.min(t.right, m.r.right) - Math.max(t.left, m.r.left);
      const oy = Math.min(t.bottom, m.r.bottom) - Math.max(t.top, m.r.top);
      if (ox <= 1 || oy <= 1) continue;
      const frac = (ox * oy) / (t.width * t.height);
      if (frac < __MINFRAC__) continue;
      const key = e.tagName + '|' + String(e.className||'').split(' ')[0] + '|' + m.cls;
      if (seen.has(key)) break;
      seen.add(key);
      out.push({tag: e.tagName.toLowerCase(), cls: String(e.className || '').split(' ')[0],
                over: m.tag + (m.cls ? '.' + m.cls : ''),
                frac: Math.round(frac * 100), text: txt.slice(0, 24)});
      break;
    }
  });
  return out;
}""".replace('__MINIMG__', str(MIN_IMG)).replace('__MINFRAC__', str(MIN_FRAC))


def main():
    if len(sys.argv) < 2:
        print('쓰기: check-print-over-image.py <밑주소> [쪽...]')
        return 1
    base = sys.argv[1].rstrip('/')
    pages = sys.argv[2:]
    if not pages:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # ★ A-646(브론즈 50차): 처음에는 `glob(root/*.html)` — **최상위 쪽만** 봤다.
        #   그래서 쪽 19개를 재고 「통과」라고 적었는데, 하위 폴더 229쪽은
        #   **한 번도 안 봤다.** 그 틈에 `.subcat-overlay`(categories/ 79쪽·449자리,
        #   인쇄 대비 최저 1.36:1)가 그대로 남아 있었다 — A-640 이 잡은 것과
        #   완전히 같은 꼴인데 선택자 목록에서만 빠져 있었다.
        #   「쪽 19개 통과」는 거짓말은 아니었지만, **고칠 목록을 19쪽에서 뽑았다.**
        #   표본이 좁으면 통과도 좁다. 이제 하위 폴더를 걸어 전부 본다.
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

    def route(r):
        u = r.request.url
        if '127.0.0.1' not in u and 'localhost' not in u:
            return r.abort()
        if r.request.resource_type == 'image':
            return r.fulfill(status=200, content_type='image/png', body=PNG)
        return r.continue_()

    total, bad = 0, []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for page in pages:
            ctx = b.new_context(viewport={'width': 1280, 'height': 900})
            ctx.route('**/*', route)
            pg = ctx.new_page()
            try:
                pg.goto('%s/%s' % (base, page), wait_until='load', timeout=20000)
            except Exception as e:
                print('  못 열었다 %s — %s' % (page, str(e)[:50]))
                ctx.close()
                continue
            pg.wait_for_timeout(900)
            pg.emulate_media(media='print')
            pg.wait_for_timeout(400)
            for r in pg.evaluate(JS):
                bad.append('%-24s <%s class=%-18s> 사진 %-20s %d%% 「%s」' % (
                    page, r['tag'], r['cls'][:18], r['over'][:20], r['frac'], r['text']))
            total += 1
            ctx.close()
        b.close()

    print('검사함  쪽 %d개' % total)
    if total == 0:
        print('  결함 — 센 것이 0이다. 0은 통과가 아니다')
        return 1
    if bad:
        for x in bad[:40]:
            print('  결함 — 인쇄에서 사진 위에 글:', x)
        if len(bad) > 40:
            print('  … 그리고 %d자리 더' % (len(bad) - 40))
        print('  합계 %d자리' % len(bad))
        return 1
    print('인쇄에서 사진 위에 올라온 글 — 없음')
    return 0


sys.exit(main())
