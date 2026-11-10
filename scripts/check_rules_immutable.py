#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""firestore.rules — 「없는 필드를 비교하는 불변 검사」 찾기 (A-441)

왜 있나
    Firestore 규칙은 **문서에 없는 키를 읽으면 식 전체가 오류**가 되고, 그 분기는 거부된다.
    그래서 아래 모양은 함정이다.

        function notChanging(field) {
          return request.resource.data[field] == resource.data[field];
        }

    보호 필드 중 하나라도 문서에 없으면(브랜드 문서의 history, 승인 전 제품의 approvedAt,
    미게시 글의 publishedAt) 소유자가 자기 문서를 **아무것도** 못 고친다. 2026-11-10 실측:
    승인 브랜드 3곳 전부(실제 브랜드 oska 포함) 포털 저장이 permission-denied 였다.

    안전한 모양은 공식 문서의 이것뿐이다 —
        !request.resource.data.diff(resource.data).affectedKeys().hasAny([...])
    diff() 는 없는 키에도 오류를 내지 않고, 값 변경뿐 아니라 '없던 보호 필드를 새로 넣는 것'
    까지 같이 막는다.

이 검사의 한계 (분명히 적어 둔다)
    잡는 것은 **인덱싱 비교 모양** 뿐이다. `resource.data.someField == ...` 같은 점 접근은
    읽기 규칙에서 정당하게 쓰이므로 건드리지 않는다. 즉 이 검사는 A-441 의 재발을 막지만
    「없는 필드 접근」 전부를 막지는 못한다.

쓰는 법
    python3 scripts/check_rules_immutable.py [규칙파일]
"""
import io
import os
import re
import sys

PAT_BAD = [
    (re.compile(r'request\.resource\.data\[[^\]]+\]\s*==\s*resource\.data\['),
     'request.resource.data[필드] == resource.data[필드]'),
    (re.compile(r'(?<!request\.)resource\.data\[[^\]]+\]\s*==\s*request\.resource\.data\['),
     'resource.data[필드] == request.resource.data[필드]'),
]
PAT_SAFE = re.compile(r'\.diff\(\s*resource\.data\s*\)\s*\.affectedKeys\(\)')


def strip_comments(text):
    out = []
    for line in text.split('\n'):
        out.append(re.sub(r'//.*$', '', line))
    return '\n'.join(out)


def main():
    root = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'firestore.rules')
    if not os.path.exists(path):
        print('규칙 파일이 없다: %s' % path)
        return 1
    raw = io.open(path, encoding='utf-8').read()
    code = strip_comments(raw)

    bad = []
    for i, line in enumerate(code.split('\n'), 1):
        for pat, label in PAT_BAD:
            if pat.search(line):
                bad.append((i, label, line.strip()))

    safe = len(PAT_SAFE.findall(code))
    allows = len(re.findall(r'allow\s+update', code))

    print('검사한 규칙 파일: %s' % os.path.relpath(path, root))
    print('  allow update 절 %d개 · 안전한 diff().affectedKeys() 비교 %d개' % (allows, safe))

    if bad:
        print('')
        print('위험: 없는 필드를 읽을 수 있는 불변 비교 %d곳' % len(bad))
        for n, label, text in bad:
            print('  %s:%d  %s' % (os.path.basename(path), n, label))
            print('        %s' % text)
        print('')
        print('고치는 법 — 그 묶음을 하나로 바꿔라:')
        print("  && notChangingAny(['필드1', '필드2', ...])")
        print("  function notChangingAny(fields) {")
        print("    return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields);")
        print("  }")
        return 1

    if allows and safe == 0:
        print('')
        print('주의: allow update 가 %d개인데 안전한 불변 비교가 하나도 없다.' % allows)
        print('      불변 보호를 통째로 지웠는지 확인해라 (이 검사가 할 수 있는 말은 여기까지다).')
        return 1

    print('통과 — 인덱싱 불변 비교 0곳')
    return 0


if __name__ == '__main__':
    sys.exit(main())
