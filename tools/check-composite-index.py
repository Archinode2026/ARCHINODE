#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check-composite-index.py — A-729

**복합 색인을 요구하는 쿼리는 색인이 없으면 화면을 조용히 비운다.**

파이어스토어는 `where('a','==',x).orderBy('b')` 처럼 **거르는 필드와 정렬하는 필드가
다르면** 복합 색인을 요구한다. 색인이 없으면 `failed-precondition` 으로 던지는데,
그 오류를 아무도 잡지 않으면 화면은 **오류도 안 내고 그냥 빈다.**

그리고 결정적으로 — **`firestore.indexes.json` 은 git push 로 배포되지 않는다.**
규칙과 마찬가지로 따로 올려야 한다. 2026-11-26 현재 이 파일은 **한 번도 배포된 적이
없다.** 즉 선언돼 있다는 것이 **살아 있다는 뜻이 아니다.**

이 저장소는 이미 그 사고를 겪었다 — A-153: 「`where('brandId') + orderBy('createdAt')` 가
복합 색인을 요구하는데 색인이 배포돼 있지 않아 failed-precondition 으로 던지고,
통계 카드용 조회(orderBy 없음)만 성공해서 **개수는 1인데 목록은 텅 빈** 상태가 됐다.
실패를 아무도 잡지 않아 안내조차 없었다.」 A-104 도 같은 꼴이었다(매거진 목록).

## 묻는 질문

복합 색인을 요구하는 쿼리마다 **`failed-precondition` 되묻기가 가까이 있는가.**

선언 여부가 아니라 **되묻기**를 요구하는 까닭: 선언은 배포를 보장하지 않는다.
되묻기가 있으면 색인이 없어도 화면이 산다(정렬만 클라이언트로 내려온다).
지금 이 저장소가 실제로 쓰는 방식이 그것이다 —
`category-products.js` · `trend-report.html` · `brand-portal/dashboard.html` 셋 다.

선언은 **따로 알린다**: 선언돼 있으면 배포만 하면 되고, 없으면 되묻기가 영구 경로다.

## 안 묻는 것

- **동등 비교만 있는 쿼리.** `where('a','==',x).where('b','==',y)` 는 파이어스토어가
  단일 필드 색인을 합쳐 처리한다 — 복합 색인이 필요 없다.
- 주석 안의 쿼리 모양. ★ HTML 은 `<script>` 블록 **안에서만** 주석을 걷는다 —
  속성의 `image/*` 를 블록 주석 시작으로 읽는 덫이 있다(A-728).
"""
from __future__ import annotations
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'docs', 'tools', 'scripts', 'assets',
             'backup', 'archi-diary', 'sales', 'silvia', '옛사본-2026-04'}
LOOKBACK = 25     # orderBy 앞으로 이 줄 수까지가 같은 쿼리
FALLBACK_NEAR = 90  # 되묻기가 이 줄 수 안에 있으면 지켜진 것으로 본다

# 되묻기 없이 두어도 되는 자리는 까닭과 함께
KNOWN: dict[str, str] = {}

WHERE = re.compile(r"\.where\(\s*['\"]([\w.]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]")
ORDER = re.compile(r"\.orderBy\(\s*['\"]([\w.]+)['\"]")
COLL  = re.compile(r"\.collection\(\s*['\"]([\w-]+)['\"]\s*\)")
RANGE_OPS = {'<', '<=', '>', '>=', '!=', 'in', 'not-in', 'array-contains-any'}


def blank_keep_lines(src: str, pattern: str) -> str:
    return re.sub(pattern, lambda m: re.sub(r'[^\n]', ' ', m.group(0)), src)


def strip_comments(src: str, is_html: bool) -> str:
    """★ A-728: HTML 에 블록 주석을 걷으면 속성의 `image/*` 가 주석 시작으로 읽혀
       수천 자가 지워진다. HTML 은 script 블록 **안에서만** 걷는다."""
    if is_html:
        s = blank_keep_lines(src, r'<!--[\s\S]*?-->')

        def inner(m):
            b = blank_keep_lines(m.group(2), r'/\*[\s\S]*?\*/')
            b = blank_keep_lines(b, r'(?m)^\s*//.*$')
            return m.group(1) + b + m.group(3)
        return re.sub(r'(<script\b[^>]*>)([\s\S]*?)(</script\s*>)', inner, s)
    s = blank_keep_lines(src, r'/\*[\s\S]*?\*/')
    return blank_keep_lines(s, r'(?m)^\s*//.*$')


def needs_index(wheres, order_field):
    """복합 색인이 필요한가 — 거르는 필드와 정렬 필드가 다르거나, 범위 비교가 섞였을 때"""
    if not wheres:
        return False
    for field, op in wheres:
        if op in RANGE_OPS:
            return True
        if field != order_field:
            return True
    return False


def declared(idx, coll, wheres, order_field):
    want_eq = {f for f, op in wheres}
    for entry in idx:
        if entry.get('collectionGroup') != coll:
            continue
        fields = [f['fieldPath'] for f in entry.get('fields', [])]
        if order_field in fields and want_eq.issubset(set(fields)):
            return True
    return False


def main() -> int:
    try:
        idx = json.load(io.open(os.path.join(ROOT, 'firestore.indexes.json'), encoding='utf-8')).get('indexes', [])
    except Exception as e:
        print('firestore.indexes.json 을 못 읽었다: %s' % e)
        return 1

    files = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if f.endswith(('.html', '.js')):
                files.append(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/'))
    files.sort()

    unguarded, guarded, used_idx = [], [], set()
    for rel in files:
        try:
            raw = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
        except Exception:
            continue
        if '.orderBy(' not in raw:
            continue
        lines = strip_comments(raw, rel.endswith('.html')).split('\n')
        for i, line in enumerate(lines):
            for om in ORDER.finditer(line):
                ofield = om.group(1)
                ctx = '\n'.join(lines[max(0, i - LOOKBACK):i + 1])
                wheres = WHERE.findall(ctx)
                if not needs_index(wheres, ofield):
                    continue
                colls = COLL.findall(ctx)
                coll = colls[-1] if colls else '?'
                near = '\n'.join(lines[max(0, i - FALLBACK_NEAR):min(len(lines), i + FALLBACK_NEAR)])
                has_fb = 'failed-precondition' in near
                dec = declared(idx, coll, wheres, ofield)
                if dec:
                    used_idx.add((coll, ofield))
                item = (rel, i + 1, coll, wheres, ofield, dec)
                (guarded if has_fb else unguarded).append(item)

    print('복합 색인 — 쪽 %d개에서 정렬 쿼리를 봤다 (선언된 색인 %d개)' % (len(files), len(idx)))
    print('  ※ firestore.indexes.json 은 **git push 로 배포되지 않는다** — 선언 ≠ 살아 있음')

    for rel, ln, coll, ws, of, dec in guarded:
        print('  · 지켜짐 %s:%d  %s  where=%s → orderBy %s  %s'
              % (rel, ln, coll, [f'{a} {b}' for a, b in ws], of,
                 '(선언 있음)' if dec else '(선언 없음 — 되묻기가 영구 경로다)'))

    bad = [x for x in unguarded if x[0] not in KNOWN]
    if bad:
        print('')
        print('  ✗ **되묻기가 없다** — 색인이 없으면 이 화면은 오류도 없이 그냥 빈다')
        for rel, ln, coll, ws, of, dec in bad:
            print('     %s:%d  %s  where=%s → orderBy %s' % (rel, ln, coll, [f'{a} {b}' for a, b in ws], of))
            print('        선언: %s' % ('firestore.indexes.json 에 있음 (다만 배포됐는지는 모른다)'
                                        if dec else '**없다** — 색인도 되묻기도 없다'))
        print('')
        print('  고치는 길 둘: ① `err.code === \'failed-precondition\'` 이면 orderBy 를 빼고'
              ' 다시 물어 **클라이언트에서 정렬**한다(A-153·A-623 이 쓴 방식)'
              ' ② 정당하면 KNOWN 에 **까닭과 함께** 적는다')
        return 1

    dead = [(e.get('collectionGroup'),
             [f['fieldPath'] for f in e.get('fields', [])]) for e in idx
            if not any(c == e.get('collectionGroup') for c, _ in used_idx)]
    if dead:
        print('')
        print('  · 쓰는 쿼리를 못 찾은 선언 %d개 (지우라는 뜻은 아니다 — 배포 전에 확인하라는 뜻)' % len(dead))
        for c, f in dead:
            print('     %s: %s' % (c, ' + '.join(f)))

    print('결과: 통과 — 복합 색인을 요구하는 쿼리에 모두 되묻기가 있다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
