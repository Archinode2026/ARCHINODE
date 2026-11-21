#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""개인정보를 받는 폼의 **명부가 완전한지** (A-656)

왜 있나
-------
`tools/check-form-consent.py` 는 명부(`FORMS`)에 적힌 폼을 꼼꼼히 봅니다 —
고지 블록, 체크박스, 자바스크립트가 그 칸을 읽는지, 고지에 수집 항목·목적·
보유 기간이 다 있는지, 두 언어인지, 처리방침 링크가 실제로 열리는지.
그리고 **명부에 적힌 폼이 사라지면** 실패로 올립니다.

그런데 **명부에 없는 폼이 새로 생기면 아무도 모릅니다.** 방향이 한쪽뿐입니다.
이 구멍은 이미 한 번 결함을 냈습니다 — A-568 의 주석이 그걸 적고 있습니다:
「이 명부에 `auth/` 가 한 번도 오른 적이 없어서 이 검사가 통과하는 동안
그 자리는 비어 있었다.」 그때 쪽을 명부에 넣고 구멍은 그대로 뒀습니다.

그래서 이 검사는 **거꾸로** 봅니다. 저장소를 전수로 훑어 개인정보를 받는 폼을
찾고, 그 쪽이 세 명부 중 하나에 있는지 봅니다. 어디에도 없으면 실패입니다.

세 명부
-------
  ㄱ) `FORMS`     — 동의 체크박스가 필요한 폼. check-form-consent.py 에서 읽습니다
                    (명부를 두 곳에 두면 어긋나므로 **진리는 한 곳**입니다)
  ㄴ) `NEWSLETTER` — 이메일 한 칸만 받는 구독·알림 폼. A-521 승리님 결정:
                    「뉴스레터는 이메일 한 칸뿐이라 체크박스 대신 **안내와 링크**만
                     둔다 — 이름·연락처를 받는 폼 셋에만 동의 칸.」
                    그래서 이쪽은 체크박스가 아니라 **안내문 + 처리방침 링크**를 봅니다
  ㄷ) `EXEMPT`    — 면제. **각 줄에 이유를 적습니다.** 이유 없는 면제는 두지 않습니다 —
                    이유가 적혀 있으면 나중에 그 이유가 더는 맞지 않을 때 사람이 알아봅니다

A-656 에서 이 검사가 바로 한 자리를 찾았습니다: `digital-products.html` 의 출시
알림 폼이 쓰임새를 **윗 문단 산문**으로만 말하고 폼 옆 처리방침 링크가 없었습니다.
이메일 한 칸짜리 폼 여섯 중 다섯은 A-521 의 모양을 지키고 있었는데 그 하나만
달랐습니다.
"""
import re
import os
import sys
import glob

ROOT = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── ㄴ) 이메일 한 칸만 받는 구독·알림 폼 (A-521: 안내문 + 처리방침 링크) ──
NEWSLETTER = [
    'index.html',
    'magazine.html',
    'trend-report.html',
    'sourcing-inquiry.html',
    'brands/view.html',
    'digital-products.html',
]

# ── ㄷ) 면제 — 이유 없는 면제는 두지 않는다 ──
EXEMPT = {
    'auth/login.html':
        '로그인 — 이미 있는 계정의 인증이고, 새로 수집하는 항목이 없다',
    'auth/profile.html':
        '본인이 가입할 때 동의한 자기 정보를 **고치는** 자리다. 새 수집이 아니다',
    'brand-portal/dashboard.html':
        '인증된 브랜드가 자기 브랜드 정보를 고치는 자리다. 개인정보가 아니라 사업자 정보이고, '
        '가입 시점(auth/signup.html)에 동의를 받았다',
}
# ※ `auth/reset-password.html` 은 여기 **없다.** 비밀번호 칸만 있어 수집 항목이
#    아예 없으므로 면제가 아니라 애초에 대상이 아니다. 처음에 면제로 올렸다가
#    「명부에 있는데 폼이 없다」로 이 검사가 되잡아 줘서 뺐다 — 면제 명부가
#    넓으면 그만큼 안 보는 자리가 늘어난다.


def strip_comments(s):
    """셈 전에 주석을 걷는다 — 주석에 적어 둔 말이 폼으로 잡히면 「있다」고 잘못 읽는다.
    (A-492·A-531·A-619·A-641·A-651·A-652 에서 거듭 겪었다)"""
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return s


def forms_registry():
    """진리는 한 곳 — check-form-consent.py 의 FORMS 를 읽는다"""
    path = os.path.join(ROOT, 'tools', 'check-form-consent.py')
    try:
        src = open(path, encoding='utf-8').read()
    except OSError:
        return None
    m = re.search(r'(?m)^FORMS\s*=\s*\[(.*?)^\]', src, re.S)
    if not m:
        return None
    return set(re.findall(r"""\(\s*['"]([^'"]+)['"]""", m.group(1)))


def personal_forms(rel):
    """이 쪽에 개인정보를 받는 폼이 있는가. (종류, 폼 수)"""
    s = strip_comments(open(os.path.join(ROOT, rel), encoding='utf-8', errors='replace').read())
    forms = re.findall(r'<form[^>]*>.*?</form>', s, re.S)
    if not forms:
        return None, 0
    rich, mail = 0, 0
    for f in forms:
        has_mail = bool(re.search(r"""type\s*=\s*['"]email['"]""", f))
        has_rich = bool(re.search(r"""(?:name|id)\s*=\s*['"][^'"]*(?:name|phone|tel|company|position)""", f, re.I)) \
                   or bool(re.search(r"""type\s*=\s*['"]tel['"]""", f))
        if has_mail and has_rich:
            rich += 1
        elif has_mail:
            mail += 1
    if rich:
        return 'rich', rich
    if mail:
        return 'mail', mail
    return None, 0


def consent_anchor(s):
    """안내문(newsletter-consent) 블록 안의 링크 태그를 **통째로** 돌려준다.

    * 처음에는 privacy.html / privacy-en.html **처럼 생긴 href 만** 정규식으로
      모았다. 그러면 이름이 틀린 링크는 표본에서 **그냥 빠진다** — 부수기에서
      privacy-NOPE.html 로 바꿨는데 검사가 통과했다. 게다가 data-en-href 가
      멀쩡해서 "옆에 링크가 있다" 로도 통과했다.
      **맞아 보이는 것만 모으면 틀린 것은 못 센다.**
      그래서 지금은 블록 안의 <a> 를 통째로 집어 그 안의 모든 href 속성을
      하나하나 확인한다. (A-640 · A-651 · A-652 와 같은 함정의 또 다른 옷)
    """
    for m in re.finditer(r'class\s*=\s*["\']([^"\']*newsletter-consent[^"\']*)["\']', s):
        tail = s[m.end(): m.end() + 600]
        a = re.search(r'<a\b[^>]*>', tail)
        if a:
            return a.group(0)
    return None


def newsletter_ok(rel):
    """A-521 의 모양: 안내문 + 폼 옆 처리방침 링크. 링크가 실제로 열리는지도 본다."""
    s = strip_comments(open(os.path.join(ROOT, rel), encoding='utf-8', errors='replace').read())
    why = []
    if not re.search(r'class\s*=\s*["\'][^"\']*newsletter-consent', s):
        return False, ['안내문(newsletter-consent)이 없다']

    tag = consent_anchor(s)
    if not tag:
        return False, ['안내문 옆에 링크가 없다 (꼬리말 링크는 이 모양이 아니다)']

    hrefs = re.findall(r'((?:data-[a-z-]+-)?href)\s*=\s*["\']([^"\']+)["\']', tag)
    if not hrefs:
        return False, ['안내문 옆 링크에 주소가 없다']

    base = os.path.dirname(os.path.join(ROOT, rel))
    for attr, href in hrefs:
        if not re.search(r'privacy(?:-en)?\.html$', href):
            why.append('%s 가 처리방침이 아닌 곳을 가리킨다: %s' % (attr, href))
            continue
        if not os.path.exists(os.path.normpath(os.path.join(base, href))):
            why.append('%s 가 없는 파일을 가리킨다: %s' % (attr, href))
    attrs = dict(hrefs)
    en = attrs.get('data-en-href')
    if en and not en.endswith('privacy-en.html'):
        why.append('영어에서 영문판으로 가지 않는다: data-en-href=%s' % en)
    return (not why), why


def main() -> int:
    reg = forms_registry()
    if reg is None:
        print('실패: tools/check-form-consent.py 의 FORMS 명부를 읽을 수 없다')
        print('   (명부의 진리는 그 파일 한 곳이다 — 이 검사는 그것을 읽어서 본다)')
        return 1

    pages = sorted(os.path.relpath(p, ROOT).replace(os.sep, '/')
                   for p in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True))
    pages = [p for p in pages if not p.startswith('previews/')]

    unlisted, broken, seen = [], [], []
    for rel in pages:
        kind, n = personal_forms(rel)
        if not kind:
            continue
        seen.append((rel, kind, n))
        if rel in reg or rel in EXEMPT:
            continue
        if rel in NEWSLETTER:
            ok, why = newsletter_ok(rel)
            if not ok:
                broken.append((rel, why))
            continue
        unlisted.append((rel, kind, n))

    # 명부에만 있고 쪽에는 폼이 없는 경우 (NEWSLETTER·EXEMPT 쪽)
    ghosts = [r for r in NEWSLETTER + list(EXEMPT)
              if r in pages and personal_forms(r)[0] is None]
    ghosts += [r for r in NEWSLETTER + list(EXEMPT) if r not in pages]

    print('개인정보를 받는 폼이 있는 쪽 %d개 / 검사한 쪽 %d개' % (len(seen), len(pages)))
    print('   명부: FORMS %d · NEWSLETTER %d · EXEMPT %d' % (len(reg), len(NEWSLETTER), len(EXEMPT)))

    if not unlisted and not broken and not ghosts:
        print('통과: 명부에 없는 폼 0 · A-521 모양을 안 지킨 쪽 0 · 유령 항목 0')
        return 0

    if unlisted:
        print('\n실패 — **어느 명부에도 없는 폼**이 있다:')
        for rel, kind, n in unlisted:
            print('   %-40s %s 폼 %d개' % (rel, '이름·연락처까지' if kind == 'rich' else '이메일 한 칸', n))
        print('   → 동의 칸이 필요한 폼이면 check-form-consent.py 의 FORMS 에 적고,')
        print('     이메일 한 칸이면 이 파일의 NEWSLETTER 에, 면제라면 EXEMPT 에 **이유와 함께** 적는다.')
    if broken:
        print('\n실패 — A-521 의 모양(안내문 + 폼 옆 처리방침 링크)을 안 지킨 쪽:')
        for rel, why in broken:
            print('   %s' % rel)
            for w in why:
                print('      · %s' % w)
    if ghosts:
        print('\n실패 — 명부에 있는데 그 쪽에 폼이 없다(사라졌거나 쪽이 없다):')
        for r in ghosts:
            print('   %s' % r)
    return 1


if __name__ == '__main__':
    sys.exit(main())
