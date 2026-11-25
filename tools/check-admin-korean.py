#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""어드민 화면이 **한국어로 말하는지** 본다 — A-692.

2026-11-25 라이브 실측(승리님 크롬, `office@archinode.org`): 한국어 어드민
화면에 `rejected` 가 **파이어스토어에 저장된 날글자 그대로** 떠 있었고,
작업 단추 24개가 `View`·`Approve`·`Reject`·`Suspend`·`Restore` 로 영문이었다.

A-681 과 같은 병이다 — 그때는 주 유입 경로가 어드민 목록에 날글자로 떴다.
**저장하는 말과 보여 주는 말은 다른 것**인데, 한 번 같아지면 아무도 안 고친다.
고장이 아니라 「원래 그런 것」처럼 보이기 때문이다.

말은 `admin/js/admin-core.js` 한 곳에 둔다(`ADM_STATUS`·`ADM_ACT`).
이 검사는 **그 말광을 지나지 않고 화면에 찍는 자리**를 찾는다.

★ 세기 전에 주석을 걷어낸다 — 주석 안의 낱말은 쓰임이 아니다. 이 함정에
  2026-11 한 달에만 일곱 번 걸렸다.
★ 언어 이름(`English`)과 언어 단추(`KO`·`EN`), 상표(`ARCHINODE`)는 그대로가
  맞다. 영문이라고 다 결함이 아니다 — 그걸 안 가르면 **늑대를 외치는 검사**가
  되고, 늑대를 외치는 검사는 아무도 안 본다.
"""
import io
import os
import re
from html.parser import HTMLParser
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN = os.path.join(ROOT, 'admin')
# A-703: 전에는 `admin/` 안만 걸었다. 그래서 **브랜드 포털**은 범위 밖이었고,
#   거기 브랜드 자기 상태가 파이어스토어 날글자로 그대로 떠 있었다.
#   A-692 가 「로그인 사각지대가 낳은 결함」이라고 적은 그 사각지대가
#   포털에는 그대로 남아 있었다 — 검사의 **범위**도 사각지대를 만든다.
PORTAL = os.path.join(ROOT, 'brand-portal')
CORE = os.path.join(ADMIN, 'js', 'admin-core.js')

HTML_COMMENT = re.compile(r'<!--.*?-->', re.S)
JS_BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
JS_LINE_COMMENT = re.compile(r'(?m)^\s*//[^\n]*$')

# 화면에 찍히면 안 되는 영문 **작업** 낱말 (말광을 지나야 한다)
ACT_WORDS = ['View', 'Approve', 'Reject', 'Suspend', 'Restore', 'Review',
             'Cancel', 'Confirm', 'Delete', 'Page']

# ── 전수 훑기 (A-698) ────────────────────────────────────────────────────
# 위 `ACT_WORDS` 는 **고친 낱말을 지키는** 목록이다. 그것만으로는 같은 종류를
# 전부 못 찾는다 — 실제로 `Refresh`·`Download CSV` 단추 9개가 목록에 없어
# 영원히 안 걸렸다(브론즈 2026-11-25). 「고친 것을 지키는 검사」와 「같은
# 종류를 전부 찾는 검사」는 **다른 물건**이다. 그래서 거꾸로도 본다:
# 화면에 글자를 내는 요소인데 **영문뿐이고 `data-ko` 가 없는** 것을 전부 센다.
# ★★ A-716(2026-11-25, 브론즈 57차 ⑤): 전에는 아래 정규식이 그물이었다 —
#   `<(button|a|th|…)…>([^<>]+)</\1>`. **자식 태그가 하나라도 있으면 통째로
#   못 봤다.** 그런데 A-698 이 쓴 고치는 방법이 바로 「글자를 `<span>` 으로
#   감싸기」였다. 즉 **고친 자리는 보이고 안 고친 자리는 안 보이는** 그물이었다.
#   게다가 `<div>`·`<p>` 는 태그 명부에 아예 없었다.
#   그물 밖에 **71곳**이 있었다 — 한국어 어드민인데 기사 심사 화면의 상태
#   거르개 탭이 `Pending`·`Reviewing`·`Revision Req` 영문이었고, 통계 카드
#   이름표·머리글 링크·「불러오는 중」 문구도 전부 영문이었다. 포털에서는
#   브랜드가 KR 로 토글해도 제목 넷이 영문으로 남았다.
#   **정규식으로 중첩된 마크업을 읽으려 한 것이 틀렸다.** 파서로 바꿨다 —
#   요소마다 **자기 직속 글자**만 모으므로 자식 태그가 있어도 보인다.
TAGS = {'button', 'a', 'th', 'td', 'label', 'option', 'legend', 'summary',
        'h1', 'h2', 'h3', 'h4', 'div', 'p', 'li', 'strong', 'em', 'span'}
VOID = {'br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'col'}


class _UiText(HTMLParser):
    """요소마다 **직속 텍스트 노드**만 모은다(자식 태그의 글자는 그 자식 것)."""

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=False)
        self.stack = []
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append([tag, dict(attrs), [], self.getpos()[0]])

    def handle_startendtag(self, tag, attrs):
        return

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                el = self.stack.pop(i)
                del self.stack[i:]
                txt = ''.join(el[2]).strip()
                if el[0] in TAGS and txt:
                    self.out.append((el[3], el[1], txt))
                return

    def handle_data(self, data):
        if self.stack:
            self.stack[-1][2].append(data)


def ui_texts(markup):
    p = _UiText()
    try:
        p.feed(markup)
    except Exception:
        pass            # 깨진 마크업이면 본 것까지만 쓴다
    return p.out
SCRIPT_BLOCK = re.compile(r'<script\b.*?</script>', re.S | re.I)


def _drop_big_selects(text):
    out, i = [], 0
    for m in re.finditer(r'<select\b.*?</select>', text, re.S | re.I):
        if m.group(0).lower().count('<option') > 30:
            out.append(text[i:m.start()])
            out.append('\n' * m.group(0).count('\n'))   # 줄 번호를 지킨다
            i = m.end()
    out.append(text[i:])
    return ''.join(out)


class _BigSelect(object):
    sub = staticmethod(lambda text: _drop_big_selects(text))


BIG_SELECT = _BigSelect()
ENTITY_ONLY = re.compile(r'^(&[a-zA-Z]+;|&#\d+;|[\s×✕✖·—–-])+$')
HANGUL = re.compile(r'[가-힣]')
LATIN = re.compile(r'[A-Za-z]')

# 영문이 맞는 것들 — 까닭을 적어 둔다. 안 가르면 늑대를 외치는 검사가 된다.
ENGLISH_OK = {
    'ARCHINODE': '상표',
    'ADMIN': '상표 옆 배지',
    'KO': '언어 단추',
    'EN': '언어 단추',
    'English': '언어 **이름** — 본문 언어를 고르는 탭이라 영문이 맞다',
    'CSV': '파일 형식 이름',
    'BIM': '업계 용어 (한국 현장도 BIM 이라 부른다)',
    'ID': '식별자',
    'KR / EN': '포털의 언어 토글 — 언어 **코드**다',
}

# 글이 아닌 것들 — 번역 대상이 아니다
NOT_TEXT = re.compile(r'\$\{|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|^https?://')
BTN_TEXT = re.compile(r'>\s*(' + '|'.join(ACT_WORDS) + r')\s*</(?:button|a)>')

# 저장값을 그대로 찍는 자리
RAW_STATUS = [
    re.compile(r'\$\{\s*[A-Za-z_]\w*\.status\s*\}'),              # ${b.status}
    re.compile(r'escapeHtml\(\s*[A-Za-z_]\w*\.status\b[^)]*\)'),  # escapeHtml(d.status || 'pending')
    # A-703: 포털은 **대입**으로 찍었다 — `badge.textContent = brandData.status;`
    #   위 두 꼴만 보다가 깨뜨리기 시험이 **안 울어서** 알았다. 패턴으로 찾는
    #   검사는 **내가 본 꼴만** 찾는다. 깨뜨려 보지 않으면 그걸 모른다.
    re.compile(r'\.(?:textContent|innerHTML|innerText)\s*=\s*[A-Za-z_]\w*\.status\b'),
]


def _blank(m):
    """지운 자리에 **줄바꿈만 남긴다.**

    A-703: 전에는 통째로 지웠다. 그래서 주석이나 `<script>` 뒤에 있는 모든
    보고의 **줄 번호가 밀렸다** — `admin/articles.html:439` 를 `:418` 이라고
    말했다. 21줄 어긋난 자리를 열면 엉뚱한 코드가 있으니, 승리님은 「검사기가
    헛소리한다」고 여기고 보고를 믿지 않게 된다. **틀린 줄 번호는 못 찾은 것보다
    나쁘다** — 찾았다고 말하면서 엉뚱한 데를 가리키기 때문이다.
    줄 수를 지키면 보고한 자리가 곧 파일의 그 자리다.
    """
    return '\n' * m.group(0).count('\n')


def strip(text, is_js):
    text = HTML_COMMENT.sub(_blank, text)
    text = JS_BLOCK_COMMENT.sub(_blank, text)
    if is_js:
        text = JS_LINE_COMMENT.sub(_blank, text)
    return text


def files():
    out = []
    for root in (ADMIN, PORTAL):
      for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
        for n in names:
            if n.endswith('.html') or n.endswith('.js'):
                out.append(os.path.join(base, n))
    return sorted(out)


def main():
    problems = []
    if not os.path.exists(CORE):
        print('admin/js/admin-core.js 가 없다')
        print('결과: 실패')
        return 1
    core = io.open(CORE, encoding='utf-8').read()

    # ① 말광이 자리에 있는가
    for need in ('ADM_STATUS', 'ADM_ACT', 'admStatusBadge', 'admActText', 'admActAttr'):
        if need not in core:
            problems.append('admin-core.js 에 `%s` 가 없다 — 말광이 사라졌다' % need)
    # 상태 넷은 firestore.rules 가 묶어 둔 값이다. 하나라도 빠지면 그 상태만 날글자로 샌다.
    for st in ('pending', 'approved', 'suspended', 'rejected'):
        if not re.search(r'\b%s\s*:\s*\{' % st, core):
            problems.append('ADM_STATUS 에 `%s` 가 없다 (firestore.rules 가 쓰는 값이다)' % st)

    seen, users = 0, 0
    for f in files():
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if rel.endswith('admin/js/admin-core.js'):
            continue
        raw = io.open(f, encoding='utf-8', errors='replace').read()
        s = strip(raw, f.endswith('.js'))
        seen += 1

        for m in BTN_TEXT.finditer(s):
            line = s[:m.start()].count('\n') + 1
            problems.append('%s:%d — 단추 글자가 영문 그대로다 「%s」. '
                            'admActText()/admActAttr() 를 지나게 하라' % (rel, line, m.group(1)))
        # 한 줄에 두 꼴이 겹쳐 잡히면(class 속성과 글자) **한 번만** 말한다.
        # 같은 결함을 두 번 말하는 검사기는 사람을 대충 보게 만든다.
        hit_lines = set()
        # 전수: 영문뿐인데 두 언어 짝이 없는 UI 글자 (A-698)
        # ★ `<script>` 안은 뺀다. 거기서 긁으면 `' + escapeHtml(x) + '` 같은
        #   **JS 문자열 조각**이 「영문 글자」로 잡혀 거짓 양성이 쏟아진다.
        #   대신 JS 가 만드는 UI 는 위의 ACT_WORDS·RAW_STATUS 가 본다 —
        #   이 훑기는 **마크업에 박힌 글자**만 책임진다. 반쪽인 것을 적어 둔다.
        # ★ `.js` 파일에는 걷어낼 `<script>` 가 없다. 거기 있는 HTML 조각은
        #   `'<option…>' + escapeHtml(t(en, ko)) + '</option>'` 처럼 **이미 두 언어를
        #   지나는 올바른 코드**인데, 글자로만 보면 「영문뿐」으로 잡혀 거짓 양성이
        #   13건 쏟아졌다. 이 훑기는 **마크업(.html)** 만 책임진다.
        markup = SCRIPT_BLOCK.sub(_blank, s) if f.endswith('.html') else ''
        # ★ **긴 선택 목록은 자료이지 UI 글이 아니다.** 포털까지 걷게 하자
        #   나라 이름 85개가 쏟아졌다(`Croatia`·`Cuba`…) — 그건 영문이 맞고,
        #   번역하면 오히려 브랜드가 자기 나라를 못 찾는다. 선택지가 30개를
        #   넘는 `<select>` 는 자료 목록으로 보고 통째로 뺀다.
        #   (상태 거르개처럼 **짧은** 목록은 그대로 본다 — 거기 영문이 남으면
        #    진짜 결함이다.)
        markup = BIG_SELECT.sub(markup)
        for _line, _at, txt in ui_texts(markup):
            attrs = ' '.join('%s="%s"' % (k, v or '') for k, v in _at.items())
            if not txt or len(txt) > 40:
                continue
            if ENTITY_ONLY.match(txt):
                continue            # &times; 같은 기호 단추는 글이 아니다
            if NOT_TEXT.search(txt):
                continue            # 템플릿 자리표시자 · 이메일 주소 · 주소는 글이 아니다
            if not LATIN.search(txt) or HANGUL.search(txt):
                continue
            if txt in ENGLISH_OK:
                continue
            if 'data-ko' in attrs:
                continue
            problems.append('%s:%d — 영문뿐인데 두 언어 짝이 없다 「%s」' % (rel, _line, txt))

        for pat in RAW_STATUS:
            for m in pat.finditer(s):
                line = s[:m.start()].count('\n') + 1
                if line in hit_lines:
                    continue
                hit_lines.add(line)
                problems.append('%s:%d — 저장값을 그대로 찍는다 「%s」. '
                                'admStatusBadge()/admStatusText() 를 지나게 하라'
                                % (rel, line, m.group(0)[:40]))

        # ② 말광을 쓰면서 admin-core 를 안 싣는 쪽
        if re.search(r'adm(StatusBadge|StatusText|ActText|ActAttr)\s*\(', s):
            users += 1
            if f.endswith('.html') and 'admin-core.js' not in raw:
                problems.append('%s — 말광을 쓰는데 admin-core.js 를 안 싣는다' % rel)

    if seen == 0:
        print('결과: 실패 — 본 파일이 0개다 (A-433)')
        return 1

    print('어드민 한국어: 파일 %d개를 보고, 말광을 쓰는 쪽 %d개를 쟀다' % (seen, users))
    if problems:
        print('')
        for x in problems[:30]:
            print('  - ' + x)
        if len(problems) > 30:
            print('  … 그 밖 %d건' % (len(problems) - 30))
        print('결과: 실패 — 한국어 화면에 영문·날글자가 샌다')
        return 1
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
