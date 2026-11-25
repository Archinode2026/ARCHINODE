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
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN = os.path.join(ROOT, 'admin')
CORE = os.path.join(ADMIN, 'js', 'admin-core.js')

HTML_COMMENT = re.compile(r'<!--.*?-->', re.S)
JS_BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
JS_LINE_COMMENT = re.compile(r'(?m)^\s*//[^\n]*$')

# 화면에 찍히면 안 되는 영문 **작업** 낱말 (말광을 지나야 한다)
ACT_WORDS = ['View', 'Approve', 'Reject', 'Suspend', 'Restore', 'Review',
             'Cancel', 'Confirm', 'Delete', 'Page']
BTN_TEXT = re.compile(r'>\s*(' + '|'.join(ACT_WORDS) + r')\s*</(?:button|a)>')

# 저장값을 그대로 찍는 자리
RAW_STATUS = [
    re.compile(r'\$\{\s*[A-Za-z_]\w*\.status\s*\}'),              # ${b.status}
    re.compile(r'escapeHtml\(\s*[A-Za-z_]\w*\.status\b[^)]*\)'),  # escapeHtml(d.status || 'pending')
]


def strip(text, is_js):
    text = HTML_COMMENT.sub('', text)
    text = JS_BLOCK_COMMENT.sub('', text)
    if is_js:
        text = JS_LINE_COMMENT.sub('', text)
    return text


def files():
    out = []
    for base, dirs, names in os.walk(ADMIN):
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
