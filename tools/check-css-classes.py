#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-668 — 마크업·JS 가 쓰는데 **어느 CSS 에도 정의가 없는** 클래스를 센다.

왜 만드는가 (2026-11-23):
  A-667 을 만들며 `adm-btn` 이라는 클래스를 **지어냈다**. 어드민이 실제로 쓰는
  것은 `act-btn` 이다. 그런 클래스는 조용히 실패한다 — 오류도 안 나고, 단추가
  맨 글자로 뜰 뿐이다. 그래서 눈으로만 알 수 있고, 나는 어드민 화면을 로그인
  없이 못 본다. 그때 내 눈이 잡았는데, **눈이 아니라 이것이 잡아야 한다.**

  그 자리에서 전수로 세어 보니 어드민이 쓰는 클래스 177개 중 정의 없는 것이
  9개였고 그중 셋은 **하루 전 내가 만든 것**이었다(A-661). 한 번 세어 본 것은
  검사가 아니다.

무엇을 묻는가 — 좁히는 것이 핵심이다 (2026-11-23 같은 날 정정):
  처음에는 「CSS 에 정의가 없는 클래스」를 전부 셌다. 35개가 나왔고 **거짓
  양성이 쏟아졌다.** 나는 그중 `.hp-newsletter` 를 「허니팟이 손님에게 보인다」는
  급한 결함으로 잘못 알렸다 — 그 입력칸의 **부모가** 인라인으로
  `position:absolute;left:-9999px` 를 걸어 숨기고 있고, 클래스는 JS 가 찾는
  **손잡이**일 뿐이었다(`form.querySelector('.hp-newsletter')`). `.si-promise`
  도 인라인 `style` 로 꾸민다. CSS 에 없다는 것만 보고 부모를 안 읽었다.

  그래서 질문을 좁힌다 — **「꾸미려고 붙였는데 아무 일도 안 하는 클래스」**:
    ㄱ) 어느 CSS 에도 정의가 없고
    ㄴ) 그 클래스를 쓴 자리가 **인라인 style 로 꾸며지지도** 않았고
    ㄷ) JS 가 **선택자로 찾는 손잡이도** 아닌 것
  셋을 다 만족해야 센다. 영원히 빨간 검사는 아무도 안 본다.

주석을 어떻게 보는가 — 그다음으로 중요하다:
  ㄱ) 주석 **안의** 클래스는 쓰는 것이 아니다 → 벗겨 낸다. 안 벗기면
     「`adm-btn` 이라고 썼는데 없다」고 적은 내 주석 때문에 영원히 빨개진다.
  ㄴ) 주석으로 **막아 둔 CSS 규칙**은 정의가 아니다 → 벗겨 낸다. 안 벗기면
     막아 둔 규칙이 정의로 세어져 진짜 결함을 가린다.
  이 둘은 서로 반대 방향이고, 둘 다 깨기 시험으로 확인한다.
"""
import os, re, sys, json

ROOT = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'dist', 'build'}

# ── 면제: 까닭을 반드시 적는다. 까닭 없는 면제는 그 자체가 맹점이다(A-652) ──
#
# 이 검사기가 제 면제도 센다 — 「이제 정의가 생긴 면제」와 「아무도 안 쓰는
# 면제」를 보고에 띄운다. 처음 만들 때 visible·fa·fab·far 를 넣었는데 검사기가
# 그 넷 다 묵었다고 알려 줬다(정의가 생겼거나 아무도 안 쓴다). 치웠다.
#
# 아래는 **꾸밈이 자식 쪽에 있는 껍데기 이름**들이다. 클래스 자체는 아무 일도
# 안 하지만 화면은 멀쩡하다. 「아무 일도 안 한다」와 「화면이 깨졌다」는 다르다 —
# 2026-11-23 에 나는 이 둘을 섞어 `.hp-newsletter` 를 급한 결함으로 잘못 알렸다
# (부모가 인라인으로 숨기고 있었다). 그래서 지우지 않고 까닭을 달아 둔다.
# 어드민 쪽 다섯은 **내가 화면을 못 본다** — 로그인이 필요하다. 모양을
# 지어내지 않고 승리님이 보실 수 있는 자리로 남긴다.
INERT = {
    'adm-inquiries':   '어드민 1:1 문의 화면의 껍데기. 자식이 각자 클래스로 꾸며진다. 어드민은 로그인이 필요해 노드가 못 본다 — 모양을 지어내지 않는다',
    'adm-logs':        '어드민 활동 장부 화면의 껍데기. 같은 까닭',
    'adm-notices':     '어드민 공지 화면의 껍데기. 같은 까닭',
    'adm-set-form':    '어드민 설정 폼의 껍데기. 같은 까닭',
    'adm-lead-detail': '리드·문의·회원 세 화면이 쓰는 상세 껍데기. 세 곳이 쓰는데 정의가 없는 것은 **의도일 수도 아닐 수도** 있다 — 승리님이 화면을 보고 정하실 자리',
    'bp-articles-section': 'brands/view.html 브랜드 페이지의 글 목록 구역 껍데기',
    'cp-loading':      'category-products.js 가 「불러오는 중」 문장에 붙인다. 문장 자체는 바탕 p 꾸밈으로 보인다',
    'cp-error-actions':'같은 파일의 오류 안내 속 링크 문단',
    'cta-text':        'index.html CTA 구역의 글 묶음 껍데기. 안쪽 h2·p 가 꾸며진다',
    'products':        '`<section class="categories products">` 의 두 번째 이름. 꾸밈은 `.categories` 가 한다 — 남은 이름이다',
}

# 이어붙여 만드는 이름은 셀 수 없다 — 'adm-reg-toc-' + n 처럼
CONCAT_TAIL = re.compile(r'-$')

def strip_comments_html(s):
    return re.sub(r'<!--[\s\S]*?-->', ' ', s)

def strip_comments_css(s):
    return re.sub(r'/\*[\s\S]*?\*/', ' ', s)

def strip_comments_js(s):
    # 블록 주석만 벗긴다. 줄 주석은 문자열 안의 // (주소 등)를 잘라 먹을 위험이
    # 있어 건드리지 않는다 — 줄 주석 안의 클래스 이름은 거짓 '쓰임'이 되지만,
    # 주소를 잘라 CSS 정의를 잃는 쪽보다 안전하다. 이 한계를 보고에 적는다.
    return re.sub(r'/\*[\s\S]*?\*/', ' ', s)

CLASS_NAME = re.compile(r'^[a-z][a-z0-9-]*$')

def walk(exts):
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(exts):
                yield os.path.join(base, f)

def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')

def read(p):
    with open(p, encoding='utf-8', errors='replace') as fh:
        return fh.read()

def collect_defined():
    """정의된 클래스 — .css 파일 전부 + 모든 html 의 <style> 블록."""
    out, srcs = set(), {}
    for p in walk(('.css',)):
        body = strip_comments_css(read(p))
        for m in re.finditer(r'\.(-?[A-Za-z_][\w-]*)', body):
            out.add(m.group(1)); srcs.setdefault(m.group(1), rel(p))
    for p in walk(('.html',)):
        s = strip_comments_html(read(p))
        for blk in re.findall(r'<style[^>]*>([\s\S]*?)</style>', s):
            for m in re.finditer(r'\.(-?[A-Za-z_][\w-]*)', strip_comments_css(blk)):
                out.add(m.group(1)); srcs.setdefault(m.group(1), rel(p) + ' (쪽 단위 style)')
    # JS 가 **문자열로 주입하는 CSS** 도 정의다 (2026-11-23 같은 날 두 번째 정정).
    # 처음엔 .css 파일과 <style> 블록만 읽어서 `.has-cookie-banner` 를 「정의 없음」
    # 으로 알렸다. 그건 cookie-consent.js 가
    #   'html.has-cookie-banner body .scroll-top{...}'
    # 처럼 문자열로 넣는다. 꾸밈이 어디서 오는지 **한 군데만 보면 틀린다.**
    # 여는 중괄호가 있는 문자열만 CSS 조각으로 읽고, 그 앞부분을 선택자로 본다.
    JS_CSS = re.compile(r"['\"`]([^'\"`\n]*\{[^'\"`\n]*)['\"`]")
    for p in walk(('.js', '.html')):
        body = read(p)
        for m in JS_CSS.finditer(body):
            frag = m.group(1)
            sel = frag.split('{', 1)[0]
            for mm in re.finditer(r'\.(-?[A-Za-z_][\w-]*)', sel):
                out.add(mm.group(1)); srcs.setdefault(mm.group(1), rel(p) + ' (JS 주입 CSS)')
    return out, srcs

# 여는 태그 하나 — 그 태그가 인라인 style 을 가졌는지 함께 보려면 태그째로 잡아야 한다
TAG = re.compile(r'<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)/?>')

def collect_used():
    """쓰는 클래스 → {files, inline, hook}.
       inline: 그 클래스를 쓴 자리 **어딘가가** 인라인 style 로 꾸며진다
       hook:   JS 가 선택자로 찾는다 (꾸미려고 붙인 것이 아니다)"""
    used = {}
    def slot(c):
        return used.setdefault(c, {'files': set(), 'inline': False, 'hook': False})
    def add(c, p, inline=False):
        if not CLASS_NAME.match(c): return
        if CONCAT_TAIL.search(c): return          # 이어붙여 만드는 이름
        d = slot(c); d['files'].add(rel(p))
        if inline: d['inline'] = True

    for p in walk(('.html',)):
        s = strip_comments_html(read(p))
        # <style> 안의 셀렉터를 '쓰임'으로 세면 안 된다
        s = re.sub(r'<style[^>]*>[\s\S]*?</style>', ' ', s)
        for m in TAG.finditer(s):
            attrs = m.group(2) or ''
            cm = re.search(r'''\bclass\s*=\s*["']([^"'<>]*)["']''', attrs)
            if not cm: continue
            has_style = bool(re.search(r'''\bstyle\s*=\s*["']''', attrs))
            for c in cm.group(1).split(): add(c, p, inline=has_style)

    for p in walk(('.js',)):
        s = strip_comments_js(read(p))
        # JS 가 만드는 마크업 — 태그째로 보고 인라인 style 여부를 함께 센다
        for m in re.finditer(r'<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)/?>', s):
            attrs = m.group(2) or ''
            cm = re.search(r'''\bclass\s*=\s*\\?["']([^"'\\<>]*)''', attrs)
            if not cm: continue
            has_style = bool(re.search(r'''\bstyle\s*=\s*\\?["']''', attrs))
            for c in cm.group(1).split(): add(c, p, inline=has_style)
        for m in re.finditer(r'''classList\s*\.\s*(?:add|remove|toggle)\s*\(\s*['"]([a-z][a-z0-9-]*)['"]''', s):
            add(m.group(1), p)
        for m in re.finditer(r'''\bclassName\s*=\s*['"]([^'"]*)['"]''', s):
            for c in m.group(1).split(): add(c, p)

    # 손잡이 — JS·HTML 어디서든 선택자로 찾는 이름
    for p in list(walk(('.js',))) + list(walk(('.html',))):
        s = read(p)
        for m in re.finditer(r'''(?:querySelector|querySelectorAll|getElementsByClassName|closest)\s*\(\s*\\?['"]([^'"\\)]*)''', s):
            for c in re.findall(r'\.([a-z][a-z0-9-]*)', m.group(1)):
                if c in used: used[c]['hook'] = True
                else: slot(c)['hook'] = True
    return used

def main():
    defined, dsrc = collect_defined()
    used = collect_used()
    missing, inline_only, hooks = [], [], []
    for c in sorted(used):
        if c in defined: continue
        if c in INERT: continue
        d = used[c]
        if not d['files']:            continue          # 선택자에만 나온 이름
        if d['hook']:   hooks.append(c);       continue
        if d['inline']: inline_only.append(c); continue
        missing.append((c, sorted(d['files'])))
    # 묵은 면제 — 이제 정의가 생겼거나 아무도 안 쓰는 면제는 치운다
    stale = [c for c in INERT if c not in used]
    now_def = [c for c in INERT if c in defined]

    print('정의 없는 클래스 검사 (A-668)')
    print('  CSS 에 정의된 클래스 %d개 · 마크업·JS 가 쓰는 클래스 %d개' % (len(defined), len(used)))
    if stale:
        print('  ※ 아무도 안 쓰는 면제 %d개 — 치울 것: %s' % (len(stale), ', '.join(sorted(stale))))
    if now_def:
        print('  ※ 이제 정의가 생긴 면제 %d개 — 치울 것: %s' % (len(now_def), ', '.join(sorted(now_def))))
    print('  빼고 센 것 — JS 손잡이 %d개 · 인라인 style 로 꾸미는 자리 %d개' % (len(hooks), len(inline_only)))
    print('  ※ 한계: JS 의 **줄 주석**(//)은 벗기지 않는다 — 주소의 // 를 잘라')
    print('     CSS 정의를 잃는 쪽이 더 위험하기 때문이다. 줄 주석 안에만 적힌')
    print('     클래스 이름은 거짓 쓰임으로 잡힐 수 있다.')
    if not missing:
        print('정의 없는 클래스 — 없음')
        return 0
    print('')
    for c, files in missing:
        print('  .%-26s %s' % (c, ', '.join(files[:4]) + (' …' if len(files) > 4 else '')))
    print('')
    print('정의 없는 클래스 %d개' % len(missing))
    return 1

if __name__ == '__main__':
    sys.exit(main())
