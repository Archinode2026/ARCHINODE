#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""입력칸에 **이름**이 붙어 있나 (A-595, 2026-11-18)

왜 있나
------
`list-your-brand.html` 의 13칸 중 **7칸이 라벨과 이어져 있지 않았다.** 화면에는
「담당자」·「직책」·「이메일」이 또박또박 적혀 있는데, `<label>` 에 `for=` 가 없어서
**글자와 칸이 남남이었다.** 화면 읽기 프로그램으로 그 칸에 들어가면 「편집창」
이라고만 들린다 — 무엇을 적는 칸인지 알 수 없다. placeholder 는 라벨이 아니다:
글자를 치면 사라지고, 읽기 프로그램마다 읽는 방식이 다르다.

같은 파일의 `brandName`·`country`·`website` 세 칸은 `for=` 가 **있었다.**
규칙이 없던 것이 아니라 **지키다 말았던 것**이고, 그래서 아무도 몰랐다.
(WCAG 1.3.1 · 3.3.2 · 4.1.2)

무엇을 보나
----------
보이는 입력칸마다 이름의 **출처**가 있는지 본다 — `label[for]`, 감싸는 `<label>`,
`aria-label`, `aria-labelledby`, `title`. placeholder 하나만 있는 것은 **이름이
없는 것으로 센다.**

허니팟(봇을 잡는 빈 칸)은 이름이 없어야 **맞다.** 이름을 보고 가리지 않고
**성질을 재서** 가린다 — `tabindex="-1"`, `aria-hidden="true"`, 화면 밖으로 밀어
둔 자리(left/top 이 음수로 큰 값), `display:none`. 이름으로 가리면 다음에 다른
이름의 허니팟이 생길 때 또 조용해진다.

    python3 tools/check-field-labels.py
"""
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'docs', 'assets'}
CONTROLS = {'input', 'select', 'textarea'}
NOT_FIELDS = {'hidden', 'submit', 'button', 'image', 'reset'}

OFFSCREEN = re.compile(r'(left|top)\s*:\s*-\s*\d{3,}px')
HIDDEN_CSS = re.compile(r'display\s*:\s*none|visibility\s*:\s*hidden')


class Scan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.fields = []          # (tag, attrs, 감싸는 label 있나, 숨었나)
        self.labels_for = set()   # for= 값
        self.ids = set()
        self._label_depth = 0
        self._hidden_stack = []   # 숨은 조상 수

    def _is_hidden(self, a):
        st = a.get('style', '') or ''
        if a.get('aria-hidden') == 'true':
            return True
        if HIDDEN_CSS.search(st) or OFFSCREEN.search(st):
            return True
        return False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        hid = self._is_hidden(a)
        if tag == 'label':
            self._label_depth += 1
            if a.get('for'):
                self.labels_for.add(a['for'])
        if tag in CONTROLS:
            ty = (a.get('type') or '').lower()
            if ty not in NOT_FIELDS:
                # ★ 처음엔 bool(self._hidden_stack) 를 봤다. 그 더미에는 숨지
                #   않은 조상도 None 으로 쌓이므로 **깊이만 있으면 참**이 되어,
                #   보이는 칸까지 전부 「숨었다」로 세고 본 칸이 0개가 됐다.
                #   「센 것이 0이면 통과가 아니다」는 관문이 그걸 바로 잡아 줬다.
                self.fields.append((tag, a, self._label_depth > 0,
                                    hid or bool([x for x in self._hidden_stack if x])))
        if tag not in ('input', 'br', 'img', 'hr', 'meta', 'link'):
            if hid:
                self._hidden_stack.append(tag)
            else:
                self._hidden_stack.append(None)

    def handle_endtag(self, tag):
        if tag == 'label' and self._label_depth > 0:
            self._label_depth -= 1
        if tag not in ('input', 'br', 'img', 'hr', 'meta', 'link'):
            if self._hidden_stack:
                self._hidden_stack.pop()

    @property
    def _hidden_ancestors(self):
        return [x for x in self._hidden_stack if x]


def html_files():
    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in fs:
            if f.endswith('.html'):
                yield os.path.join(root, f)


def main():
    bad = []
    checked = 0
    honeypots = 0

    for path in sorted(html_files()):
        rel = os.path.relpath(path, ROOT)
        try:
            src = open(path, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        s = Scan()
        try:
            s.feed(src)
        except Exception:
            continue

        for tag, a, wrapped, hidden in s.fields:
            fid = a.get('id', '')
            # 허니팟·숨은 칸은 이름이 없어야 맞다 — 성질로 가린다
            if hidden or a.get('tabindex') == '-1':
                honeypots += 1
                continue
            checked += 1
            has = False
            if (a.get('aria-label') or '').strip():
                has = True
            lb = (a.get('aria-labelledby') or '').strip()
            if lb and any(x in s.ids for x in lb.split()):
                has = True
            if fid and fid in s.labels_for:
                has = True
            if wrapped:
                has = True
            if (a.get('title') or '').strip():
                has = True
            if not has:
                ph = (a.get('placeholder') or '').strip()
                why = ('placeholder 뿐 (%r)' % ph[:26]) if ph else '이름이 아예 없다'
                bad.append('%s <%s%s>: %s' % (rel, tag,
                                              (' #' + fid) if fid else '', why))

    # ── A-596: autocomplete 값이 표준 이름인가 ───────────────────────────────
    #    틀린 autocomplete 는 **없는 것보다 나쁘다** — 브라우저가 엉뚱한 값을
    #    채운다. 2026-11-18 에 자동 추측기가 회사명 칸을 사람 이름으로,
    #    가입 비밀번호를 current-password 로, 프로젝트 이름을 사람 이름으로
    #    짚었다. 그래서 손으로 명부를 쓰고, 오타는 이 검사로 막는다.
    OK_TOKENS = {
        'off', 'on', 'name', 'honorific-prefix', 'given-name', 'additional-name',
        'family-name', 'honorific-suffix', 'nickname', 'username',
        'new-password', 'current-password', 'one-time-code',
        'organization-title', 'organization', 'street-address',
        'address-line1', 'address-line2', 'address-line3',
        'address-level1', 'address-level2', 'address-level3', 'address-level4',
        'country', 'country-name', 'postal-code',
        'cc-name', 'cc-number', 'cc-exp', 'cc-csc', 'cc-type',
        'transaction-currency', 'transaction-amount', 'language',
        'bday', 'bday-day', 'bday-month', 'bday-year', 'sex',
        'tel', 'tel-country-code', 'tel-national', 'tel-area-code',
        'tel-local', 'tel-extension', 'impp', 'url', 'photo', 'email',
    }
    for path in sorted(html_files()):
        rel = os.path.relpath(path, ROOT)
        src = open(path, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'autocomplete=["\']([^"\']*)["\']', src):
            raw = m.group(1).strip().lower()
            if not raw:
                bad.append('%s: autocomplete 값이 비어 있다' % rel)
                continue
            parts = [x for x in raw.split() if x]
            unknown = [x for x in parts
                       if x not in OK_TOKENS and not x.startswith(('section-',))
                       and x not in ('shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager')]
            if unknown:
                bad.append('%s: autocomplete="%s" 는 표준 이름이 아니다 (%s) '
                           '— 브라우저가 엉뚱한 값을 채운다'
                           % (rel, raw, ', '.join(unknown)))

    if bad:
        print('입력칸 이름: 이름 없는 칸 %d개' % len(bad))
        for b in bad:
            print('  - ' + b)
        print('    → `<label for="…">` 로 이어 주거나(보기는 안 바뀐다), 라벨을 둘 자리가')
        print('      없으면 aria-label 과 data-ko-aria-label 을 넣어라.')
        return 1
    if checked == 0:
        print('입력칸 이름: 실패 — 본 칸이 0개다. 센 것이 없으면 통과가 아니다 (A-433).')
        return 1
    print('입력칸 이름: 보이는 칸 %d개 전부 이름 있음 (허니팟·숨은 칸 %d개는 제외)'
          % (checked, honeypots))
    return 0


if __name__ == '__main__':
    sys.exit(main())
