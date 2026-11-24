#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""확대했을 때 고정 요소가 화면을 넘지 않는지 (검수대장 A-593).

   실행: python3 scripts/check_zoom_reflow.py http://127.0.0.1:8321
   필요: playwright + 크로미움 (승리님 기계에서는 못 받는다 — tools/check-all.py 머리글 참고)

왜 있는가
---------
`check_narrow_width.py` 는 폭을 320·360·390 으로 바꿔 보지만 **높이는 늘 크게**
둔다. 그런데 확대는 폭과 높이를 **같이** 줄인다 — 1280x1024 화면에서 400% 로
키우면 CSS 로는 320x256 이 된다. 세로가 256px 밖에 없을 때, 아래에 붙여 둔
`position:fixed` 요소가 글자 접힘으로 커지면 **화면 위로 밀려 나가고, 고정이라
스크롤로도 끌어올 수 없다.**

실제로 그랬다(2026-11-18 실측): 쿠키 동의 배너가 320x256 에서 높이 333px 이 되어
`top:-93px` 로 밀렸고, 제목 「We use cookies」가 화면 위로 완전히 사라졌다.
무엇에 동의하는지 적은 문단 앞부분도 잘렸다. **단추 셋은 보이니까 손님은 읽지
못한 채 누르게 된다.** 검사 41개와 브라우저 검사 5개가 전부 통과하는 동안
그 자리는 비어 있었다 — 아무도 창을 낮춰 본 적이 없었다.

무엇을 재는가
------------
400% 와 300% 확대 크기에서, 보이는 `fixed`·`sticky` 요소마다
  ① 화면 위로(top<0) 또는 아래로(bottom>창높이) 넘치는지
  ② 넘친다면 그 요소 안에서 스크롤할 수 있는지(scrollHeight>clientHeight)
  ③ 그 안의 단추·링크가 화면 안에 있는지
를 본다. 넘치면서 안쪽 스크롤도 안 되면 그 내용은 **영영 닿을 수 없다** → 실패.
②가 되면 닿을 수 있으니 통과로 보되, ③에서 고르는 단추가 화면 밖이면 알린다.
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8321').rstrip('/')
PAGES = sys.argv[2:] or [
    'index.html', 'brands.html', 'categories.html', 'magazine.html', 'about.html',
    'for-brands.html', 'contact.html', 'sourcing-inquiry.html', 'request-consultation.html',
    'list-your-brand.html', 'trend-report.html', 'digital-products.html',
    'privacy.html', 'terms.html', 'brands/view.html', 'products/view.html',
    'auth/login.html', 'auth/signup.html',
]
# 1280x1024 기준 확대 배율 → CSS 창 크기
VIEWS = [('400%', 320, 256), ('300%', 427, 341)]

PROBE = """
() => {
  const vh = innerHeight, vw = innerWidth;
  const out = [];
  document.querySelectorAll('body *').forEach(e => {
    const cs = getComputedStyle(e);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const b = e.getBoundingClientRect();
    if (b.height <= 0 || b.width <= 0) return;
    /* fixed 와 sticky 는 다르다.
       - fixed: 화면에 못질돼 있다. 넘치면 스크롤로도 못 끌어온다 → 넘침 자체가 문제.
       - sticky: 굴리면 올라와 붙는다. 그래서 창보다 **키가 클 때만** 일부가 영영 숨는다.
       처음엔 둘을 같이 봤다가 digital-products.html 의 sticky 머리글(166px, 창 256px)을
       「닿을 수 없다」고 잘못 읽었다 — 굴리면 다 보이는 것이었다. 규칙을 갈랐다. */
    const boxOver = (cs.position === 'fixed')
      ? ((b.top < -1) || (b.bottom > vh + 1))
      : (b.height > vh + 1);
    const scrollable = e.scrollHeight > e.clientHeight + 1 &&
                       (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
    /* 요소의 네모가 창에 들어가도 **안의 내용이 넘쳐 나올** 수 있다
       (max-height 는 걸었는데 overflow-y:visible 인 경우). 깨뜨려 시험하다
       그 자리를 내 검사가 통과시키는 것을 봤다 — 네모만 보고 있었다.
       그래서 **자손의 자리**를 직접 본다: 글이나 조작거리를 담은 자손이
       창 밖에 있으면, 그것이 손님이 못 보는 내용이다. */
    const escaped = [];
    e.querySelectorAll('*').forEach(d => {
      const dcs = getComputedStyle(d);
      if (dcs.display === 'none' || dcs.visibility === 'hidden') return;
      const db = d.getBoundingClientRect();
      if (db.height <= 0 || db.width <= 0) return;
      const own = (d.childNodes ? [...d.childNodes] : [])
        .filter(n => n.nodeType === 3 && n.nodeValue.trim()).length > 0;
      const ctrl = /^(button|a|input|select|textarea)$/i.test(d.tagName);
      if (!own && !ctrl) return;
      if (db.top < -1 || db.bottom > vh + 1 || db.left < -1 || db.right > vw + 1) {
        escaped.push(((d.innerText || d.value || '').trim().slice(0, 20)) || d.tagName.toLowerCase());
      }
    });
    /* 누를 거리가 **정말로 눌리는지** 본다 (A-594).
       줄바꿈된 inline 링크는 getBoundingClientRect() 가 두 줄을 감싸는 큰 네모라서
       그 안에 **글자가 없는 빈 자리**가 섞인다. 거기를 찍으면 옆 형제가 잡혀
       「가려졌다」고 잘못 읽는다 — 2026-11-18 에 내가 그렇게 읽어 멀쩡한 링크를
       결함으로 셌다. 그래서 getClientRects() 로 **줄마다의 네모**를 받아 그 안에서만
       찍는다. 한 점이라도 닿으면 그 거리는 닿는 것으로 본다. */
    const ctrls = [];
    e.querySelectorAll('button, a[href], input, select, textarea').forEach(c => {
      const ccs = getComputedStyle(c);
      if (ccs.display === 'none' || ccs.visibility === 'hidden') return;
      const rects = [...c.getClientRects()].filter(r => r.width > 1 && r.height > 1);
      if (!rects.length) return;
      let hitSome = false, blocker = '', byDialog = false;
      for (const r of rects) {
        for (const fx of [0.3, 0.5, 0.7]) {
          for (const fy of [0.35, 0.5, 0.65]) {
            const x = Math.round(r.left + r.width * fx);
            const y = Math.round(r.top + r.height * fy);
            if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit === c || (hit && c.contains(hit)) || (hit && hit.contains(c))) hitSome = true;
            else if (hit && !blocker) {
              /* A-594: 동의 배너처럼 `role=dialog` 인 것이 본문을 덮는 것은
                 **그게 하는 일**이다 — 손님이 고르고 나면 비킨다. 그것을
                 「못 누른다」고 세면 검사가 늑대를 외치게 되고, 늑대를 외치는
                 검사는 아무도 안 본다. 그래서 대화상자가 가린 것은 따로 센다.
                 대화상자 **자신의** 누를 거리는 그대로 본다 — A-593 이 바로
                 그 자리였다. */
              const dlg = hit.closest('[role=dialog]');
              if (dlg && !dlg.contains(c)) { byDialog = true; }
              else {
                blocker = hit.id ? '#' + hit.id
                  : (typeof hit.className === 'string' && hit.className
                     ? '.' + hit.className.split(' ')[0] : hit.tagName);
              }
            }
          }
        }
      }
      ctrls.push({t: (c.innerText || c.value || c.getAttribute('aria-label') || '').trim().slice(0, 18),
                  inView: hitSome, blocker: blocker, byDialog: byDialog});
    });
    /* A-594: 넘침과 **가림**은 다른 일이다.
       처음엔 넘치는 요소만 골라 그 안의 누를 거리를 봤다. 그래서 넘치지는
       않는데 다른 막이 위에 떠서 못 누르는 자리를 **아예 들여다보지 않았다** —
       깨뜨려 시험하다 내 검사가 그 상태를 통과시키는 것을 봤다.
       그래서 둘 중 하나라도 있으면 보고한다. */
    const anyBlocked = ctrls.some(c => !c.inView && !c.byDialog);
    if (!boxOver && escaped.length === 0 && !anyBlocked) return;
    out.push({
      boxOver, escaped: escaped.slice(0, 5), escapedN: escaped.length,
      tag: e.tagName.toLowerCase(), id: e.id || '',
      cls: (typeof e.className === 'string' ? e.className : '').split(' ')[0].slice(0, 24),
      pos: cs.position, h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom),
      scrollable, overflowY: cs.overflowY,
      ctrlsOut: ctrls.filter(c => !c.inView && !c.byDialog)
                     .map(c => c.t + (c.blocker ? ' <-' + c.blocker : '')),
      ctrlsByDialog: ctrls.filter(c => !c.inView && c.byDialog).map(c => c.t),
      ctrlsAll: ctrls.length
    });
  });
  /* A-683/A-685: 여기까지는 **무엇이 가리는가**만 봤다 — `fixed` 와 `sticky`
     요소, 그리고 그 안의 누를 거리. 그래서 **무엇이 잘리는가**를 못 봤다.
     400% 확대에서 첫 쪽 `section.hero` 는 `height:100vh` + `overflow:hidden`
     인데 안의 내용이 창보다 83px 커서 **위가 잘려 나갔다**. 잘린 것은 굴려도
     안 돌아온다 — 쪽을 굴리면 상자째 움직일 뿐 자름선이 상자에 붙어 다닌다.
     대표 문구와 윗꼬리가 그렇게 사라져 있었고 검사 62개가 전부 통과시켰다.
     그래서 **세로로 잘려 나간 글·누를 거리**를 따로 센다.
     - `overflow-y` 가 hidden/clip 인 것만 (auto/scroll 이면 굴려서 닿는다)
     - `fixed` 는 위에서 이미 본다
     - 글자를 **자기가 가진** 자손이나 누를 거리만 (꾸밈 상자는 잘려도 된다)
     - `opacity:0` · `aria-hidden` 아래는 뺀다 — 슬라이드·탭처럼 **일부러**
       치워 둔 것을 결함으로 세면 늑대를 외치게 된다 */
  const clipped = [];
  document.querySelectorAll('body *').forEach(e => {
    const cs = getComputedStyle(e);
    if (!/hidden|clip/.test(cs.overflowY)) return;
    if (cs.position === 'fixed') return;
    const r = e.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) return;
    const lost = [];
    e.querySelectorAll('*').forEach(d => {
      const dcs = getComputedStyle(d);
      if (dcs.display === 'none' || dcs.visibility === 'hidden' || dcs.opacity === '0') return;
      if (d.closest('[aria-hidden="true"]')) return;
      const b = d.getBoundingClientRect();
      if (b.height <= 0 || b.width <= 0) return;
      const own = (d.childNodes ? [...d.childNodes] : [])
        .filter(n => n.nodeType === 3 && n.nodeValue.trim()).length > 0;
      const ctrl = /^(a|button|input|select|textarea)$/i.test(d.tagName);
      if (!own && !ctrl) return;
      const over = Math.max(r.top - b.top, b.bottom - r.bottom);
      if (over > 4) lost.push(((d.innerText || d.value || '').trim().slice(0, 24)
                               || d.tagName.toLowerCase()) + ' (' + Math.round(over) + 'px)');
    });
    if (lost.length) clipped.push({
      tag: e.tagName.toLowerCase(), id: e.id || '',
      cls: (typeof e.className === 'string' ? e.className : '').split(' ')[0].slice(0, 24),
      h: Math.round(r.height), lost: lost.slice(0, 4), n: lost.length
    });
  });
  return {vh, vw, items: out, clipped};
}
"""


SCROLL_JS = ('() => document.querySelectorAll("*").forEach(e => {'
             ' const cs = getComputedStyle(e);'
             ' if ((cs.position === "fixed" || cs.position === "sticky") &&'
             ' e.scrollHeight > e.clientHeight + 1) e.scrollTop = e.scrollHeight; })')

def main():
    hard = []     # 닿을 수 없는 내용 — 실패
    soft = []     # 스크롤로 닿지만 고르는 단추가 화면 밖 — 알림
    seen = 0

    with sync_playwright() as p:
        exe = os.environ.get('PLAYWRIGHT_CHROME')
        if not exe and os.path.exists('/usr/bin/google-chrome'):
            exe = '/usr/bin/google-chrome'
        b = (p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe
             else p.chromium.launch(args=['--no-sandbox']))
        for label, w, h in VIEWS:
            ctx = b.new_context(viewport={'width': w, 'height': h})
            for page in PAGES:
                pg = ctx.new_page()
                try:
                    pg.goto(BASE + '/' + page, wait_until='load', timeout=20000)
                except Exception:
                    pg.close()
                    continue
                pg.wait_for_timeout(600)
                r = pg.evaluate(PROBE)
                # 안쪽으로 굴러가는 고정 그릇은 굴림을 끝까지 내려 한 번 더 본다.
                # 바닥에 붙은 줄이 본문을 잠깐 덮는 것은 정상이다 — 어느 굴림
                # 위치에서든 한 번 닿으면 닿는 것으로 본다(A-594).
                try:
                    pg.evaluate(SCROLL_JS)
                    pg.wait_for_timeout(220)
                    r2 = pg.evaluate(PROBE)
                    still = {}
                    for it2 in r2['items']:
                        still[it2['tag'] + '#' + it2['id']] = set(it2['ctrlsOut'])
                    for it1 in r['items']:
                        k = it1['tag'] + '#' + it1['id']
                        # A-686: 굴린 뒤 목록에 **없다**는 것은 「정보가 없다」가
                        # 아니라 **「막힌 것이 하나도 없다」**는 뜻이다. PROBE 는
                        # 막힌 것도 넘친 것도 없는 요소를 아예 안 담기 때문이다.
                        # 그걸 「정보 없음」으로 읽고 굴리기 전 목록을 그대로 두어서,
                        # **굴리면 닿는 링크를 「어느 굴림 위치에서도 안 닿는다」고
                        # 16쪽에서 보고**했다 — 동의 고지의 「Privacy Policy」다.
                        # 실측(427x341): 굴리기 전 두 줄 다 막힘(.cc-more/.cc-accept),
                        # 배너를 끝까지 굴린 뒤 두 줄 다 9점 전부 닿음.
                        # 비어 있는 집합과 교집합하면 비워지는 것이 맞다.
                        it1['ctrlsOut'] = [x for x in it1['ctrlsOut']
                                           if x in still.get(k, set())]
                except Exception:
                    pass
                seen += 1
                for c in r.get('clipped', []):
                    nm = '<%s%s%s>' % (c['tag'], ('#' + c['id']) if c['id'] else '',
                                       (' .' + c['cls']) if c['cls'] else '')
                    hard.append('%s %s %s 높이%dpx (창 %d) — **잘려서 영영 안 보이는 '
                                '내용 %d개** (overflow-y 가 hidden 이라 굴려도 안 '
                                '돌아온다): %s'
                                % (label, page, nm, c['h'], r['vh'], c['n'],
                                   ', '.join(c['lost'])))
                for it in r['items']:
                    name = '<%s%s%s>' % (it['tag'], ('#' + it['id']) if it['id'] else '',
                                         (' .' + it['cls']) if it['cls'] else '')
                    where = '%s %s %s 높이%dpx top%d bottom%d (창 %d)' % (
                        label, page, name, it['h'], it['top'], it['bottom'], r['vh'])
                    if it['boxOver'] and not it['scrollable']:
                        why = ('고정 요소라 스크롤로도 못 끌어온다' if it['pos'] == 'fixed'
                               else '끈적 요소인데 창보다 키가 커서 굴려도 일부가 숨는다')
                        detail = ''
                        if it['escapedN']:
                            detail = ' 창 밖으로 나간 내용 %d개: %s' % (
                                it['escapedN'], ', '.join(repr(x) for x in it['escaped']))
                        hard.append('%s — 안쪽 스크롤이 안 된다(overflow-y:%s). %s.%s'
                                    % (where, it['overflowY'], why, detail))
                    if it.get('ctrlsByDialog'):
                        soft.append('%s — 대화상자가 가린 거리 %d개(고르고 나면 비킨다): %s'
                                    % (where, len(it['ctrlsByDialog']),
                                       ', '.join(it['ctrlsByDialog'][:3])))
                    if it['ctrlsOut']:
                        # 두 굴림 위치에서 모두 안 닿은 것만 남아 있다 → 정말 못 누른다
                        hard.append('%s — 누를 거리 %d개가 **어느 굴림 위치에서도** 안 닿는다: %s'
                                    % (where, len(it['ctrlsOut']), ', '.join(it['ctrlsOut'][:4])))
                pg.close()
            ctx.close()
        b.close()

    if soft:
        print('확대 넘침: 스크롤로는 닿지만 고르는 자리가 화면 밖 %d건' % len(soft))
        for s in soft:
            print('  ? ' + s)
    if hard:
        print('확대 넘침: 닿을 수 없는 고정 요소 %d건' % len(hard))
        for x in hard:
            print('  - ' + x)
        print('결과: 실패 — 확대한 손님이 영영 볼 수 없는 내용이 있다')
        return 1
    if seen == 0:
        print('결과: 실패 — 본 화면이 0개다. 센 것이 없으면 통과가 아니다 (A-433).')
        return 1
    print('확대 넘침: 화면 %d개 측정 (400%%·300%%) · 닿을 수 없는 고정 요소 0건' % seen)
    if soft:
        print('결과: 통과 (다만 위의 알림 %d건은 눈으로 한 번 보라)' % len(soft))
    else:
        print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
