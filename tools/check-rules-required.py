#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""규칙이 **요구하는** 필드를 쓰는 코드가 실제로 담는가 — A-699.

왜 있나
-------
2026-11-25, 브랜드 입점이 **13일째 막혀 있었다.**
`firestore.rules` 의 brands 생성 가지가 `request.resource.data.email is string`
을 요구하는데, 그 문서를 만드는 **유일한 코드**(`list-your-brand.html`)가
A-480 에서 `email` 을 빼 `internal/contact` 로 옮겼다. 옮긴 것은 옳았고
규칙만 옛 요구를 들고 있었다.

손님에게는 이렇게 보인다: Auth 계정은 **먼저** 만들어지고, brands 쓰기가
거부되어 성공 화면에 못 가므로 **임시 비밀번호를 한 번도 못 본다.** 다시
누르면 「이미 가입된 이메일」. 고아 계정만 남기고 영구히 막힌다. 실패는
손님 브라우저의 영문 한 줄로 끝나고 **어디에도 안 남는다.**

왜 검사 66개가 못 봤나
----------------------
`check-public-write-limits.py` 는 **「폼의 키가 규칙 목록 **안**인가」**만 본다.
`check-brand-contact.py` 는 **「`email` 이 공개 문서로 **돌아오면** 실패」**를 본다.
두 검사가 서로 **반대쪽**을 지키고, 그 사이에 이 결함이 떨어졌다.
「규칙이 **요구하는** 것을 코드가 담는가」를 보는 검사가 0개였다.

A-680 이 적은 「조각마다 시험이 있어도 고리는 안 이어진다」가
이번에는 **규칙과 쓰는 코드 사이**에서 반복됐다.

★ 명부가 낡는 것을 막는다
   아래 WRITERS 는 사람이 적는 명부라 낡는다. 그래서 **규칙에 요구가 있는데
   명부에 없는 컬렉션**도 함께 보고한다 — 명부가 전수인지 검사 자신이 묻는다.
   (`check-public-write-limits.py` 가 명부를 늘리면서 둘을 빠뜨린 적이 있다.)
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, 'firestore.rules')

# 컬렉션 → 그 문서를 **만드는** 코드.
#   ('파일', 'var',    '변수이름')   — `const X = { … }` 로 문서를 짓는 꼴
#   ('파일', 'inline', '앵커글자')   — 호출 자리에 객체를 바로 적는 꼴
# ★ 처음에는 「컬렉션 이름」으로 호출을 찾았다가 **다섯 가지 모양**에 다 걸려
#   넘어졌다: `var col = …collection('x')` 뒤에 따로 쓰는 꼴,
#   `batch.set(ref.collection('x').doc(), doc)` 처럼 객체가 **둘째 인자**인 꼴,
#   `collection('users').doc(uid).set({…})` 처럼 중간에 `doc(uid)` 가 끼는 꼴.
#   찾기 어려운 것을 억지로 찾기보다 **어디를 보라고 적어 두는** 쪽이 정직하다.
WRITERS = {
    'brands':                  [('list-your-brand.html', 'inline', "collection('brands').doc(uid).set(")],
    'leads':                   [('sourcing-inquiry.html', 'var', 'leadDoc'),
                                ('brands/view.html', 'var', 'leadDoc'),
                                ('products/view.html', 'var', 'data')],
    'consultations':           [('request-consultation.html', 'var', 'consultDoc')],
    'bim-requests':            [('products/view.html', 'var', 'bimDoc')],
    # A-706: 셋이 쓴다. 전에는 `index.html` 하나만 적어 둬서, 나머지 둘이
    #   빠뜨리는 요구가 생겨도 조용했다.
    'newsletter-subscribers':  [('index.html', 'var', 'subDoc'),
                                ('magazine.html', 'var', 'subDoc'),
                                ('trend-report.html', 'var', 'subDoc')],
    'digital-products-notify': [('digital-products.html', 'var', 'ntDoc')],
    'users':                   [('auth/signup.html', 'inline', "collection('users').doc(uid).set(")],
    # 공개 코드가 만들지 않는 컬렉션 — 비워 두되 **까닭을 적는다**
    'trend-submissions':       [],   # A-489 로 공개 쓰기를 막았다
    'mail':                    [],   # 여러 곳이 쓴다. mailKeysOk 가 따로 지킨다(A-570)
    'articles':                [],   # 브랜드 포털·어드민에서만 만든다
    'products':                [],   # 브랜드 포털·어드민에서만 만든다
    # ★ A-706: 전에는 비워 두고 「로그인한 손님이 만든다 (auth 뒤)」고 적어 뒀다.
    #   **그 주석이 틀렸다** — 담는 자리는 브랜드 포털의 공개 코드다. 로그인이
    #   필요한 것과 「우리 코드가 담지 않는 것」은 다른 말인데 그걸 섞어 적었고,
    #   그래서 이 컬렉션의 요구는 **아무와도 대조되지 않았다.** 빈 명부는
    #   「볼 것이 없다」가 아니라 「안 본다」는 뜻이다 — A-684 와 같은 모양의
    #   거짓 약속이다.
    'inquiries':               [('brand-portal/dashboard.html', 'var', 'doc')],
    'likes':                   [],
    'reviewIssues':            [],
}

REQ = re.compile(r"request\.resource\.data\.([A-Za-z_]\w*)\s+is\s+\w+")
MATCH = re.compile(r"match\s+/([A-Za-z_][\w-]*)/\{")


def rules_requirements():
    """컬렉션 → allow create 가 요구하는 필드 묶음."""
    src = io.open(RULES, encoding='utf-8').read()
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'(?m)//[^\n]*$', '', src)
    out = {}
    for m in MATCH.finditer(src):
        coll = m.group(1)
        tail = src[m.end():]
        stop = MATCH.search(tail)
        block = tail[:stop.start()] if stop else tail
        mc = re.search(r'allow\s+create\s*:(.*?);', block, re.S)
        if not mc:
            continue
        body = mc.group(1)
        keys = set(REQ.findall(body))
        # ★ **선택 항목을 요구로 세면 안 된다.** 규칙은 선택을
        #   `(!('X' in request.resource.data) || request.resource.data.X is bool)`
        #   으로 적는다. 처음엔 안쪽의 `is bool` 만 보고 「요구한다」고 읽어
        #   멀쩡한 폼 다섯에 늑대를 외쳤다(A-490 의 notifyPending).
        optional = set(re.findall(r"!\(\s*'([A-Za-z_]\w*)'\s+in\s+request\.resource\.data", body))
        keys -= optional
        #   `isAdmin() ||` 갈래 안에만 있는 요구도 손님에게는 요구가 아니다.
        #   지금은 그런 자리가 없어 보지 않는다 — 생기면 여기서 갈라야 한다.
        if keys:
            out.setdefault(coll, set()).update(keys)
    return out


def _obj_keys(src, open_brace):
    """`open_brace` 의 `{` 부터 짝을 맞춰 **맨 위 단계** 키를 뽑는다.

    ★ 줄 단위로 읽다가 한 줄짜리 객체
      (`const ntDoc = { email: email, hp: '', createdAt: … };`)
      를 **통째로 못 봤다.** 줄은 사람이 보기 좋으라고 나눈 것일 뿐이다 —
      키가 어디 있는지는 **깊이**가 정한다. 글자를 훑으며 깊이를 센다.
    """
    depth, k = 0, open_brace
    n = len(src)
    keys = []
    quote = None
    while k < n:
        c = src[k]
        if quote:
            if c == '\\':
                k += 2
                continue
            if c == quote:
                quote = None
            k += 1
            continue
        if c in ('"', "'", '`'):
            quote = c
            k += 1
            continue
        if c in '{[(':
            depth += 1
        elif c in '}])':
            depth -= 1
            if depth == 0:
                break
        elif depth == 1 and (c.isalpha() or c == '_'):
            m = re.match(r'([A-Za-z_]\w*)\s*:', src[k:])
            if m and (k == 0 or not (src[k - 1].isalnum() or src[k - 1] in '_.')):
                keys.append(m.group(1))
                k += m.end()
                continue
        k += 1
    return set(keys)


def _var_keys(src, name):
    """`const name = { … }` 의 키. 못 찾으면 None."""
    m = re.search(r'\b(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*\{', src)
    if not m:
        return None
    return _obj_keys(src, src.index('{', m.start()))


def written_keys(path, how, what):
    """그 문서가 **실제로 담는** 맨 위 단계 키."""
    src = io.open(os.path.join(ROOT, path), encoding='utf-8', errors='replace').read()
    if how == 'var':
        return _var_keys(src, what)
    i = src.find(what)
    if i < 0:
        return None
    b = src.find('{', i)
    return _obj_keys(src, b) if b >= 0 else None


def main():
    problems, checked = [], 0
    reqs = rules_requirements()
    if not reqs:
        print('결과: 실패 — 규칙에서 요구 필드를 하나도 못 읽었다. 모양이 바뀌었나 (A-433)')
        return 1

    for coll in sorted(reqs):
        need = reqs[coll]
        if coll not in WRITERS:
            problems.append('규칙이 `%s` 에 %s 를 요구하는데 **이 검사의 명부에 없다** — '
                            '명부가 낡았다. 만드는 코드를 찾아 WRITERS 에 적어라'
                            % (coll, sorted(need)))
            continue
        for path, how, what in WRITERS[coll]:
            keys = written_keys(path, how, what)
            if keys is None:
                problems.append('%s 에서 `%s` 를 못 찾았다 — 코드가 옮겨졌나' % (path, what))
                continue
            checked += 1
            missing = sorted(need - keys)
            if missing:
                problems.append('**%s** — 규칙이 요구하는 %s 를 `%s` 가 담지 않는다. '
                                '쓰기가 permission-denied 로 거부된다'
                                % (coll, missing, path))

    if checked == 0:
        print('결과: 실패 — 대조한 쓰기가 0개다. 센 것이 없으면 통과가 아니다 (A-433)')
        return 1

    print('규칙 요구 대조: 컬렉션 %d개에 요구가 있고, 쓰는 코드 %d곳을 맞춰 봤다'
          % (len(reqs), checked))
    if problems:
        print('')
        for x in problems:
            print('  - ' + x)
        print('결과: 실패 — 규칙이 요구하는데 코드가 안 담는 자리가 있다')
        return 1
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
