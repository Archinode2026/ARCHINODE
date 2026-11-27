#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check-key-limits.py — A-734

**`hasOnly` 에 적힌 키마다 길이 상한이 있는가.**

`check-public-write-limits.py:191` 이 묻는 것은 「상한이 **하나라도** 있는가」다:

    if '.size() <=' not in cl and '.size() <' not in cl:
        errors.append('... create 에 길이 상한이 하나도 없다')

A-700 이 바로 이 모양을 적어 뒀다 — 「지도를 하나만 등록하면 **「그 하나와 맞는가」만**
묻게 된다」. 그래서 `bim-requests` 가 키 23개 중 **다섯에 상한이 없는 채로** 모든 검사를
통과했다(브론즈 62차 B62-16): `productName`·`brandName`·`fileType`·`productId`·`brandId`.
형제인 `leads` 는 `leadFieldsWithinLimits()` 로 16개를 전부 막는데, `bim-requests` 의
주석은 「A-485: leads 와 같은 이유」라고 적어 놓고 **값이 안 따라왔다.**

## 왜 한 글자가 아니라 결함인가
① 문서 하나가 1MiB 까지 부풀 수 있다(A-485·A-477 이 막으려던 것)
② 그 값이 메일 제목에 들어가면 `subject.size() < 200` 에 걸려 **승인은 됐는데 안내
   메일이 거부**된다 — 손님은 링크 없이 기다린다(B62-4 와 맞물린다)

## 묻는 방법
`match /<컬렉션>/{...}` 블록의 `allow create` 절에서 `hasOnly([...])` 키를 뽑고,
각 키가 **그 절이 실제로 참조할 수 있는 글자** 안에서

  ① `.size() <=` / `.size() <` 로 상한을 받거나
  ② `== <고정값>` 으로 못 박히거나 (`status == 'pending'`)
  ③ 꼴이 못 박히거나 (`is bool` · `is list` · `is timestamp` · `== request.time` · `== null`)
  ④ **까닭과 함께** 면제 명부에 있는지

를 본다. ★ 참조할 수 있는 글자에는 **블록 밖 전역 도우미**가 포함된다 —
`leadFieldsWithinLimits()` 가 파일 앞쪽(55행)에 산다. 블록만 보면 `leads` 가
통째로 거짓 양성이 된다(브론즈도 처음에 그렇게 읽고 「25개 구멍」이라 했다가 정정했다).
"""
from __future__ import annotations
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, 'firestore.rules')

# 상한이 없어도 되는 키 — **까닭과 함께**
EXEMPT = {
    ('consultations', 'category'):
        '선택칸에서 고르는 값이라 임의 문자열이 아니다. 폼이 닫힌 목록을 준다',

    # ⚠️ **확인 대기(2026-11-27, A-734)** — 아래 여섯은 전부 **어드민·포털이 나중에 채우는 칸**인데
    #   `hasOnly` 에 적혀 있어 **공개 생성이 담을 수 있다.** 상한도 꼴 제약도 없다.
    #   `bim-requests` 다섯과 같은 종류지만, 그쪽은 규칙 주석이 「leads 와 같은 이유로 상한을
    #   둔다」고 의도를 적어 두어 바로 고쳤다. 이쪽은 **의도가 적혀 있지 않다** —
    #   「생성 때 아예 없어야」로 조일지, 상한만 둘지는 지금 쓰기를 깨뜨릴 수 있어
    #   밤에 혼자 정하지 않았다. 승리님 확인 뒤 **이 줄들을 지운다**.
    #   확인할 것: 공개 폼(`lead-notify.js`·`products/view.html`·`sourcing-inquiry.html`·
    #   `request-consultation.html`)이 생성 때 이 칸들을 **보내는가**. 안 보내면
    #   `!('k' in request.resource.data)` 로 조이는 것이 맞다.
    ('leads', 'updatedAt'):       '어드민이 나중에 채우는 칸 — 조일지 확인 대기(A-734)',
    ('leads', 'assignedAt'):      '어드민이 배정할 때 채우는 칸 — 조일지 확인 대기(A-734)',
    ('consultations', 'reviewerNote'): '어드민 메모 — 조일지 확인 대기(A-734)',
    ('consultations', 'triageNote'):   '어드민 메모 — 조일지 확인 대기(A-734)',
    ('consultations', 'reviewedAt'):   '어드민이 검토할 때 채우는 칸 — 조일지 확인 대기(A-734)',
    ('inquiries', 'updatedAt'):   '나중에 채우는 칸 — 조일지 확인 대기(A-734)',
}

# 길이를 재지 않아도 되는 꼴
TYPE_PINNED = re.compile(r"\bis\s+(bool|list|timestamp|number|int|float|map)\b")


def strip_comments(s: str) -> str:
    s = re.sub(r'/\*[\s\S]*?\*/', ' ', s)
    return re.sub(r'(?m)//.*$', ' ', s)


def _func_map(code: str) -> dict:
    """최상위 `function 이름(...) { ... }` → 몸통. 중괄호 깊이로 끝을 찾는다."""
    out = {}
    for m in re.finditer(r'function\s+(\w+)\s*\([^)]*\)\s*\{', code):
        i, depth = m.end(), 1
        while i < len(code) and depth:
            if code[i] == '{':
                depth += 1
            elif code[i] == '}':
                depth -= 1
            i += 1
        out[m.group(1)] = code[m.start():i]
    return out


def main() -> int:
    try:
        raw = io.open(RULES, encoding='utf-8').read()
    except OSError as e:
        print('firestore.rules 를 못 읽었다: %s' % e)
        return 1
    code = strip_comments(raw)

    # 전역 도우미(블록 밖)도 참조할 수 있다 — `leadFieldsWithinLimits()` 가 파일 앞쪽에 산다.
    # ★ 첫 판은 여기에 **파일 전체**를 넣었다. 그러면 `leads` 의 `brandName` 상한이
    #   `bim-requests` 의 `brandName` 을 대신 만족시켜, 오늘 넣은 상한을 되돌려도
    #   **깨뜨리기가 안 울었다** — A-708 이 경고한 「통과하지만 아무것도 안 잡는 검사」다.
    #   `function …() { … }` 몸통만 모은다: 도우미는 보이고 **남의 match 블록은 안 보인다**.
    FUNCS = _func_map(code)

    blocks = []
    # ★ 첫 판은 `match /brands/{` 뒤에서 깊이를 세기 시작했는데, 그 `{` 는 블록이 아니라
    #   **경로 조각 `{brandId}`** 의 여는 괄호였다. 그래서 몸통이 `brandId}` 한 조각이 되고
    #   조건에 걸려 **블록 0개**가 됐다 — 「통과」가 아니라 **아무것도 안 본 것**이었다.
    #   경로를 통째로 건너뛰고 **그 다음** `{` 부터 센다.
    for m in re.finditer(r'match\s+(/[\w\-/{}]+)\s*\{', code):
        path = m.group(1)
        coll = path.strip('/').split('/')[0]          # 면제 명부가 쓰는 이름
        name = path.strip('/').replace('{', '<').replace('}', '>')   # 사람이 읽을 이름
        start = m.end()
        depth = 1
        i = start
        while i < len(code) and depth:
            if code[i] == '{':
                depth += 1
            elif code[i] == '}':
                depth -= 1
            i += 1
        blocks.append((coll, name, code[start:i]))

    bad, seen = [], []
    for coll, name, body in blocks:
        cm = re.search(r'allow\s+create\s*:([\s\S]*?);', body)
        if not cm:
            continue
        clause = cm.group(1)
        hm = re.search(r'hasOnly\(\s*\[([\s\S]*?)\]\s*\)', clause)
        if not hm:
            continue
        keys = re.findall(r"'([\w-]+)'", hm.group(1))
        if not keys:
            continue
        # 이 절이 볼 수 있는 글자: 절 자체 + **그 절이 실제로 부르는 도우미**.
        # ★ 두 번 틀렸다. ① 처음엔 파일 전체를 넣어 `leads` 의 상한이 `bim-requests` 를
        #   대신 만족시켰다. ② 그래서 「도우미 몸통 전부」로 줄였는데, 그래도
        #   `leadFieldsWithinLimits()` 안의 `brandName` 상한이 **부르지도 않는 블록**을
        #   만족시켰다. 깨뜨리기가 둘 다 조용해서 알았다 — **부르는 것만** 본다.
        called = set(re.findall(r'\b(\w+)\s*\(', clause))
        scope = clause + '\n' + '\n'.join(FUNCS[f] for f in called if f in FUNCS)
        missing = []
        for k in keys:
            if (coll, k) in EXEMPT:
                continue
            ek = re.escape(k)
            # `.size() ==` 도 상한이다 — 정확한 크기로 못 박은 것이 더 조인 것이다
            #   (`inquiries.history.size() == 1`). A-570 이 `<` 도 상한이라고 적은 것과 같은 결.
            SZ = r"\.size\(\)\s*(?:<|==)"
            pats = [
                r"\[\s*'" + ek + r"'\s*\][^\n]{0,80}?" + SZ,          # data['k'].size() <
                r"\.data\." + ek + r"[^\n]{0,80}?" + SZ,               # data.k.size() <
                r"get\(\s*'" + ek + r"'[^\n]{0,80}?" + SZ,             # get('k','').size() <
                r"\.data\." + ek + r"\s*==",                                    # data.k == 고정값
                r"get\(\s*'" + ek + r"'[^)]*\)\s*==",
                r"\.data\." + ek + r"\s+in\s*\[",                          # data.k in ['a','b'] — 닫힌 목록
                r"\[\s*'" + ek + r"'\s*\]\s+in\s*\[",
                r"!\(\s*'" + ek + r"'\s+in\s+request\.resource\.data\s*\)",   # 생성 때 아예 없어야
                r"\.data\." + ek + r"\s+" + TYPE_PINNED.pattern,
                r"\[\s*'" + ek + r"'\s*\]\s+" + TYPE_PINNED.pattern,
            ]
            if any(re.search(p, scope) for p in pats):
                continue
            missing.append(k)
        seen.append((name, len(keys), len(missing)))
        if missing:
            bad.append((name, keys, missing))

    print('키마다 길이 상한 — 공개 create 블록 %d개를 봤다' % len(seen))
    for name, nk, nm in seen:
        mark = '✓' if not nm else '✗'
        print('  %s %-26s 키 %2d개 · 상한 없는 키 %d개' % (mark, name, nk, nm))

    for name, _, _ in [(n, 0, 0) for (n, k) in EXEMPT]:
        pass
    if EXEMPT:
        print('  · 까닭 적고 면제한 키: %s' % ', '.join('%s.%s' % k for k in EXEMPT))

    if bad:
        print('')
        print('  ✗ **`hasOnly` 에 적어 두고 상한을 안 건 키가 있다**')
        for name, keys, missing in bad:
            print('     %s — %s' % (name, ', '.join(missing)))
        print('')
        print('  까닭: 상한이 없으면 ① 문서가 1MiB 까지 부풀고(A-485·A-477)')
        print('        ② 그 값이 메일 제목에 들어가면 `subject.size() < 200` 에 걸려')
        print('           **승인은 됐는데 안내 메일이 거부**된다(A-734 B62-4).')
        print('  길 둘: ① 규칙에 `.size() <= N` 을 더한다 ② 정당하면 EXEMPT 에 **까닭과 함께**')
        return 1

    print('결과: 통과 — 적어 둔 키마다 상한이나 못 박힌 꼴이 있다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
