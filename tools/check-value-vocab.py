#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-681 — **담는 값의 꼴**과 **읽는 쪽이 기대하는 꼴**이 같은지 본다.

왜 있나 (2026-11-24)
--------------------
고리를 처음부터 끝까지 따라가 보니 거기서 끊겨 있었다(A-680).

  · 분류: 사이트가 저장하는 값은 **대문자**(`Furniture`)인데 수요 리포트의
    지도는 **소문자 키**였다. 한 건도 안 맞아 **브랜드에게 보낼 한 장이 모든
    품목에서 0** 을 보고했다.
  · 경로: 어드민 리드 화면에 **`sourcing-page` 가 없었다** — 우리 주 유입
    경로인데 목록에서 영문 날글자로 떴다. 수요 리포트에는 **`admin-manual`
    이 없었다** — 운영자가 손으로 넣는 전화·전시회 리드가 날글자로 떴다.
    그리고 아무도 담지 않는 추측 키가 한쪽은 `contact`, 다른 쪽은
    `contact-page` 로 갈려 있었다.

조각마다 시험이 있어도 이건 안 잡혔다 — 시험 자료가 **내가 지어낸 꼴**이었기
때문이다. 값의 꼴은 **값이 사는 곳에서 읽어 와야** 한다. 그래서 이 검사는
코드에서 직접 긁어 대조한다.

무엇을 보는가
-------------
① 담는 값이 **읽는 쪽 지도에 다 있는가** (없으면 화면에 날글자가 뜬다)
② 같은 어휘를 든 지도들의 **키가 서로 같은가** (갈라지면 한쪽이 낡는다)
③ 지도에만 있고 **아무도 담지 않는 키**는 알리기만 한다 — 미리 둔 자리일 수
   있다. 다만 **지도끼리는 같아야** 한다(갈린 추측이 A-681 의 절반이었다)
"""
from __future__ import annotations
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8', errors='replace').read()

def opt_values(rel, select_id):
    """<select id=...> 의 option value 들."""
    s = read(rel)
    if s is None: return None
    m = re.search(r'id="' + re.escape(select_id) + r'"[\s\S]*?</select>', s)
    if not m: return None
    return set(v for v in re.findall(r'<option[^>]*value="([^"]*)"', m.group(0)) if v)

def checkbox_values(rel, group_id):
    s = read(rel)
    if s is None: return None
    m = re.search(r'id="' + re.escape(group_id) + r'"[\s\S]*?</(?:div|fieldset)>', s)
    if not m: return None
    return set(v for v in re.findall(r'value="([^"]*)"', m.group(0)) if v)

KEY_RE = re.compile(r"""\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))\s*:""")

def obj_keys(rel, name):
    """var NAME = { ... }; 의 **가장 바깥 깊이** 키들.

    처음에는 정규식 두 개로 긁었는데 ``(?m)^\s*(\w+)\s*:`` 가 **줄 맨 앞
    하나만** 읽었다. 지도가 한 줄에 키 넷을 적는 꼴이어서(`Furniture: '가구',
    Bathroom: '욕실', …`) 나머지 셋을 놓쳤고, 멀쩡한 지도를 「어긋났다」고
    보고했다. 그리고 값이 객체인 지도(`LEAD_SOURCES`)에서는 안쪽 `en`·`ko`
    까지 키로 셌다. 그래서 **중괄호 깊이를 세어** 깊이 1의 키만 받는다.
    """
    s = read(rel)
    if s is None: return None
    m = re.search(re.escape(name) + r'\s*=\s*\{([\s\S]*?)\n\};', s)
    if not m: return None
    body = m.group(1)
    body = re.sub(r'/\*[\s\S]*?\*/', ' ', body)
    body = '\n'.join(l.split('//')[0] if '//' in l and 'http' not in l else l
                     for l in body.split('\n'))
    out, depth, i, n = set(), 0, 0, len(body)
    while i < n:
        ch = body[i]
        if ch in '{[(':
            depth += 1; i += 1; continue
        if ch in '}])':
            depth -= 1; i += 1; continue
        if depth == 0 and (ch in "'\"" or ch.isalpha() or ch == '_'):
            mm = KEY_RE.match(body, i)
            if mm:
                out.add(mm.group(1) or mm.group(2) or mm.group(3))
                i = mm.end(); continue
        i += 1
    return out

def arr_keys(rel, name, field='key'):
    """var NAME = [ {key:'x', ...}, ... ]; 의 key."""
    s = read(rel)
    if s is None: return None
    m = re.search(re.escape(name) + r'\s*=\s*\[([\s\S]*?)\n\];', s)
    if not m: return None
    return set(re.findall(field + r":\s*'([^']+)'", m.group(1)))

def literal_values(rel, field):
    """코드가 `field: 'x'` 로 **담는** 값."""
    s = read(rel)
    if s is None: return set()
    return set(re.findall(re.escape(field) + r":\s*'([^']+)'", s))

# ── 어휘 명부 ────────────────────────────────────────────────────────────
# writers: 값을 **담는** 자리 / readers: 그 값을 **읽어 이름을 붙이는** 지도
# fallback: 담기는 값이 아니라 빈 값에 붙이는 이름 — 읽는 쪽에만 있어도 된다
VOCAB = [
    dict(name='분류(category)',
         writers={
             '소싱 폼 #srcCategory':      lambda: opt_values('sourcing-inquiry.html', 'srcCategory'),
             '포털 제품 #prodCategory':   lambda: opt_values('brand-portal/dashboard.html', 'prodCategory'),
             '포털 브랜드 체크박스':      lambda: checkbox_values('brand-portal/dashboard.html', 'editCategoryGroup'),
         },
         readers={
             'DMD_CAT_KO': lambda: obj_keys('admin/js/view-demand.js', 'DMD_CAT_KO'),
             'DMD_CAT_EN': lambda: obj_keys('admin/js/view-demand.js', 'DMD_CAT_EN'),
         },
         fallback=set()),
    dict(name='경로(source)',
         writers={
             '공개 폼·어드민이 담는 값': lambda: (
                 literal_values('sourcing-inquiry.html', 'source')
                 | literal_values('brands/view.html', 'source')
                 | literal_values('products/view.html', 'source')
                 | literal_values('admin/js/view-leads.js', 'source')),
         },
         readers={
             'DMD_SRC_KO':   lambda: obj_keys('admin/js/view-demand.js', 'DMD_SRC_KO'),
             'DMD_SRC_EN':   lambda: obj_keys('admin/js/view-demand.js', 'DMD_SRC_EN'),
             'LEAD_SOURCES': lambda: obj_keys('admin/js/view-leads.js', 'LEAD_SOURCES'),
         },
         fallback={'unknown'}),
    dict(name='유형(type)',
         writers={
             '규칙이 허용하는 값': lambda: set(re.findall(
                 r"'([a-z-]+)'", (re.search(r"type in \[([^\]]*)\]", read('firestore.rules') or '') or
                                  type('x', (), {'group': lambda self, n: ''})()).group(1))),
         },
         # A-700: 읽는 지도가 **둘**이다. 전에는 어드민 것만 등록해 두어
         #   「읽는 지도 1개」로 통과했고, 그 사이 포털의 `INBOX_TYPES` 는
         #   다섯 중 **셋**만 들고 있었다 — 빠진 둘이 하필 `sourcing`(주 유입
         #   경로)과 `sample-request`(브랜드가 물건을 보내야 하는 요청)였다.
         #   지도를 하나만 등록하면 「그 하나와 맞는가」만 묻게 된다.
         readers={'LEAD_TYPES': lambda: arr_keys('admin/js/view-leads.js', 'LEAD_TYPES'),
                  'INBOX_TYPES(포털)': lambda: obj_keys('brand-portal/dashboard.html', 'INBOX_TYPES')},
         fallback=set()),
    dict(name='업종(industry)',
         writers={
             '가입 #signupIndustry':     lambda: opt_values('auth/signup.html', 'signupIndustry'),
             '소싱 폼 #srcIndustry':     lambda: opt_values('sourcing-inquiry.html', 'srcIndustry'),
             '브랜드 문의 #rfqIndustry': lambda: opt_values('brands/view.html', 'rfqIndustry'),
             '제품 문의 #rfqIndustry':   lambda: opt_values('products/view.html', 'rfqIndustry'),
         },
         readers={
             'LEAD_INDUSTRIES': lambda: arr_keys('admin/js/view-leads.js', 'LEAD_INDUSTRIES'),
             'DMD_IND_KO':      lambda: obj_keys('admin/js/view-demand.js', 'DMD_IND_KO'),
             # A-704: 포털도 업종을 읽는다(전에는 **날글자 키를 그대로** 찍었다).
             #   A-670 이 공개 폼 셋에 업종 칸을 넣은 뒤로 값이 실제로 들어온다.
             'INBOX_INDUSTRIES(포털)': lambda: obj_keys('brand-portal/dashboard.html', 'INBOX_INDUSTRIES'),
         },
         fallback=set()),
]

def main():
    probs, notes = [], []
    print('값의 꼴 검사 (A-681)')
    for v in VOCAB:
        wr, rd = {}, {}
        for k, f in v['writers'].items():
            got = f()
            if got is None:
                probs.append('%s: 담는 자리를 못 읽었다 — 「%s」 모양이 바뀌었나' % (v['name'], k))
            elif got:
                wr[k] = got
        for k, f in v['readers'].items():
            got = f()
            if got is None:
                probs.append('%s: 읽는 지도를 못 읽었다 — 「%s」 모양이 바뀌었나' % (v['name'], k))
            elif got:
                rd[k] = got
        if not wr or not rd:
            probs.append('%s: 담는 자리나 읽는 지도를 하나도 못 읽었다' % v['name'])
            continue

        written = set()
        for s in wr.values():
            written |= s

        # ① 담는 값이 읽는 쪽에 다 있는가
        for k, keys in sorted(rd.items()):
            miss = sorted(written - keys - v['fallback'])
            if miss:
                probs.append('%s: 담는 값이 「%s」에 없다 — %s (화면에 날글자로 뜬다)'
                             % (v['name'], k, ', '.join(miss)))
        # ② 담는 자리끼리도 같아야 한다
        names = sorted(wr)
        if len(names) > 1:
            base = wr[names[0]]
            for n in names[1:]:
                d = sorted(base ^ wr[n])
                if d:
                    probs.append('%s: 담는 자리가 갈라졌다 — 「%s」와 「%s」의 차 %s'
                                 % (v['name'], names[0], n, ', '.join(d)))
        # ③ 읽는 지도끼리 같아야 한다 (fallback 은 빼고)
        rnames = sorted(rd)
        if len(rnames) > 1:
            base = rd[rnames[0]] - v['fallback']
            for n in rnames[1:]:
                d = sorted(base ^ (rd[n] - v['fallback']))
                if d:
                    probs.append('%s: 읽는 지도가 갈라졌다 — 「%s」와 「%s」의 차 %s'
                                 % (v['name'], rnames[0], n, ', '.join(d)))
        # ④ 아무도 안 담는 키는 알리기만
        for k, keys in sorted(rd.items()):
            extra = sorted(keys - written - v['fallback'])
            if extra:
                notes.append('%s: 「%s」에만 있고 아무도 담지 않는 키 — %s (미리 둔 자리일 수 있다)'
                             % (v['name'], k, ', '.join(extra)))
        print('  %-18s 담는 자리 %d곳(값 %d개) · 읽는 지도 %d개'
              % (v['name'], len(wr), len(written), len(rd)))

    for n in notes:
        print('  ※ ' + n)
    if probs:
        print('')
        for p in probs:
            print('  ✗ ' + p)
        print('\n어긋남 %d건' % len(probs))
        print('담는 값과 읽는 이름표는 **함께** 고친다 (A-498 · A-680 · A-681).')
        return 1
    print('값의 꼴 — 어긋난 것 없음')
    return 0

if __name__ == '__main__':
    sys.exit(main())
