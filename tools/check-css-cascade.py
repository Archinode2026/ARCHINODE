#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""죽은 미디어 규칙을 찾는다 (A-411).

    python3 tools/check-css-cascade.py      → 어긋나면 종료 코드 1

무엇을 보나
-----------
`@media` 안에서 어떤 속성을 고쳐 놓고, **파일 뒤쪽에 같은 선택자·같은 속성의
기본 규칙**이 있으면 특정도가 같으므로 **뒤가 이긴다.** 그러면 그 미디어
규칙은 **조용히 죽는다** — 문법도 맞고 선택자도 맞는데 아무 일도 하지 않는다.

A-394 가 정확히 그랬다:

    464행  @media (max-width: 1100px) { .scroll-top { bottom: 84px } }
    812행  .scroll-top { ... bottom: 30px ... }

휴대폰에서 「맨 위로」 단추를 Netlify 배지 위로 올리려 한 수정이 **라이브에서
전혀 작동하지 않았다**(브론즈 21차가 computed `bottom` = 30px 를 재서 잡았다).

★ **내 검증 방법이 이것을 가렸다.** 규칙을 `<style>` 로 **주입**해서 쟀는데,
주입한 스타일은 캐스케이드 **맨 뒤**에 붙으므로 늘 이긴다. 즉 「선언이
맞는지」만 확인하고 「그 선언이 파일에서 이기는지」는 확인하지 않았다.
사람이 눈으로 볼 수 없는 꼴이라 검사로 만든다.

고치는 법
---------
`body ` 를 앞에 붙여 특정도를 올린다(이 저장소의 관례 — A-366·A-377·A-411).
또는 그 블록을 기본 규칙보다 뒤로 옮긴다.
"""
from __future__ import annotations
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['style.css']

# 알고 있고 의도된 자리 — (선택자, 속성, 근거)
# **지우지 마라.** 여기 없는 죽은 규칙은 전부 실패로 뜬다.
KNOWN = [
    ('.footer-col ul li', 'margin-bottom',
     'A-113 이 휴대폰 푸터 항목 간격을 4px 로 줄이려 했는데 780행 기본 규칙(12px)에 '
     '덮여 처음부터 죽어 있었다. **되살리지 않는다** — 브론즈 18차가 390px 에서 '
     '푸터를 재서 링크 15/18 이 44px, 간격 중앙값 11px 로 **지금 상태가 멀쩡하다**고 '
     '확인했다. 3주 전 의도를 되살리면 보이는 간격이 바뀌는데, 그건 지금 고칠 이유가 '
     '없다. 간격을 손볼 일이 생기면 그때 이 줄을 지우고 살리면 된다 (A-411)'),
]


def rules(src):
    """(줄, 미디어조건들, 선택자목록, {속성: 값}) 을 차례대로 낸다.

    A-411 에서 손으로 만든 첫 파서가 **오탐을 냈다** — `@media` 가 닫히는 자리를
    제대로 세지 않아 미디어 밖 규칙을 미디어 안으로 읽었다. 그래서
    `body.home .hero-inner { max-width }` 를 「죽었다」고 보고했는데 라이브
    computed 값은 `100%` 로 **살아 있었다.** 오탐을 내는 검사는 결함보다 나쁘다.

    그래서 중괄호 깊이를 정직하게 세는 꼴로 다시 썼다. 괄호 깊이 스택에
    at-rule 조건을 함께 쌓고, 블록이 닫힐 때 같이 벗긴다.
    """
    s = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    out = []
    stack = []          # at-rule 조건 (깊이별)
    i = 0
    n = len(s)
    buf_start = 0
    while i < n:
        c = s[i]
        if c == '{':
            head = s[buf_start:i].strip()
            if head.startswith('@'):
                stack.append(head)
            else:
                # 선언 블록 — 닫는 괄호까지가 본문
                end = s.find('}', i)
                if end < 0:
                    break
                body = s[i + 1:end]
                sels = [x.strip() for x in head.split(',') if x.strip()]
                decls = {}
                for d in body.split(';'):
                    if ':' not in d:
                        continue
                    k, v = d.split(':', 1)
                    if '{' in k or '}' in k:
                        continue
                    decls[k.strip().lower()] = v.strip()
                if sels and decls:
                    out.append((s[:i].count('\n') + 1, ' and '.join(stack), sels, decls))
                i = end + 1
                buf_start = i
                continue
            i += 1
            buf_start = i
            continue
        if c == '}':
            if stack:
                stack.pop()
            i += 1
            buf_start = i
            continue
        i += 1
    return out


def main():
    problems = []
    notes = []
    for rel in FILES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        src = io.open(p, encoding='utf-8', errors='replace').read()
        rs = rules(src)
        # (선택자, 속성) → [(줄, 미디어, 값)]
        idx = {}
        for line, media, sels, decls in rs:
            for sel in sels:
                for prop, val in decls.items():
                    idx.setdefault((sel, prop), []).append((line, media, val))
        checked = 0
        for (sel, prop), hits in sorted(idx.items()):
            if len(hits) < 2:
                continue
            media_hits = [h for h in hits if h[1]]
            base_hits = [h for h in hits if not h[1]]
            if not media_hits or not base_hits:
                continue
            checked += 1
            for mline, mcond, mval in media_hits:
                later = [b for b in base_hits if b[0] > mline]
                if not later:
                    continue
                bline, _, bval = later[0]
                if any(sel == k and prop == pr for k, pr, _ in KNOWN):
                    continue
                # A-411 정정: 더 뒤에 **같은 조건의 미디어 규칙이 또 있으면**
                # 결과는 같다 — 깨진 것이 아니라 **죽은 중복 코드**다.
                # 처음엔 이 둘을 구분하지 않아 `body.home .hero-inner` 를
                # 「죽었다」고 보고했는데 라이브 computed 값은 의도대로였다.
                revived = [m for m in media_hits
                           if m[0] > bline and m[1] == mcond and m[2] == mval]
                if revived:
                    notes.append(
                        '%s — `%s { %s }` 가 두 번 적혀 있다: %d행 `%s` 는 '
                        '%d행 기본 규칙에 덮여 죽지만, %d행에 같은 선언이 다시 있어 '
                        '**결과는 의도대로다.** 앞쪽이 죽은 중복 코드다'
                        % (rel, sel, prop, mline, mcond, bline, revived[0][0]))
                    continue
                problems.append(
                    '%s — `%s { %s }` 가 죽었다: %d행 `%s` 안의 %s 를 '
                    '%d행 기본 규칙 `%s` 가 덮는다(특정도 같음, 뒤가 이긴다). '
                    '`body ` 접두로 특정도를 올리거나 블록을 뒤로 옮겨라'
                    % (rel, sel, prop, mline, mcond, mval, bline, bval))
        print('검사함  %s — 규칙 %d개, 미디어·기본이 같이 손대는 (선택자·속성) %d쌍'
              % (rel, len(rs), checked))

    print('')
    for x in notes:
        print('기록    %s' % x)
    if problems:
        if notes:
            print('')
        for x in problems:
            print('어긋남  %s' % x)
        return 1
    print('죽은 미디어 규칙 검사 — 깨진 것 없음%s'
          % ('  (죽은 중복 %d건은 위에 적었다)' % len(notes) if notes else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
