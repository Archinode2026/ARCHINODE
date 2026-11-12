# -*- coding: utf-8 -*-
"""A-482 — 좋아요 카운터가 내 목록의 '변화'에 묶여 있는지.

전에는 규칙이 「+1 은 내 목록에 **있으면**, -1 은 **없으면**」 이었다. 목록은 내가 쓰는
내 문서라, 목록에 한 번 넣어 두고 +1 을 몇 번이든 보낼 수 있었고(주석의 「최대 +1」은
사실이 아니었다), 목록에서 빼 두면 한 번도 좋아하지 않은 아무 승인 문서나 -1 로 0 까지
깎을 수 있었다.

고친 방식은 **두 쪽이 맞물려야** 성립한다:
  규칙   — getAfter 로 「이 쓰기에서 목록이 바뀌었는가」를 본다
  클라이언트 — 목록과 카운터를 **한 묶음(batch)** 으로 쓴다 (따로 쓰면 getAfter 가 지금
             값과 같아져 거부된다)
한쪽만 되돌리면 ㄱ)좋아요가 전부 막히거나 ㄴ)위조가 되살아난다. 그래서 둘을 같이 본다.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []

# ── 규칙 ───────────────────────────────────────────────────────────────────
rules = io.open(os.path.join(ROOT, 'firestore.rules'), encoding='utf-8').read()
m = re.search(r'function\s+isLikeToggle\s*\([^)]*\)\s*\{(.*?)\n    \}', rules, re.S)
if not m:
    errors.append('[규칙] isLikeToggle 을 못 찾았다')
else:
    body = re.sub(r'//[^\n]*', '', m.group(1))
    body = re.sub(r'\s+', ' ', body)
    need = [
        ("+1 쪽 '전에 없었다'", "+ 1 && !(docId in likedList(field))"),
        ("+1 쪽 '후에 있다'",   "&& (docId in likedListAfter(field))"),
        ("-1 쪽 '전에 있었다'", "- 1 && (docId in likedList(field))"),
        ("-1 쪽 '후에 없다'",   "&& !(docId in likedListAfter(field))"),
    ]
    for label, frag in need:
        if frag.replace(' ', '') not in body.replace(' ', ''):
            errors.append('[규칙] isLikeToggle 에 %s 조건이 없다 — 카운터가 목록의 변화에 '
                          '묶이지 않는다' % label)
    if "affectedKeys().hasOnly(['likeCount'])" not in re.sub(r'\s+', '', m.group(1)):
        errors.append("[규칙] affectedKeys().hasOnly(['likeCount']) 가 없다 — "
                      '좋아요 한 번에 다른 칸까지 바꿀 수 있다')

# 이름만 바꿔 치우는 것도 잡는다 — 부분 문자열 검사는 likedListAfterX 를 통과시킨다
if not re.search(r'function\s+likedListAfter\s*\(', rules):
    errors.append('[규칙] likedListAfter 함수 정의가 없다')
elif not re.search(r'function\s+likedListAfter\s*\([^)]*\)\s*\{[^}]*getAfter\s*\(', rules, re.S):
    errors.append('[규칙] likedListAfter 가 getAfter 를 쓰지 않는다 — 쓰기 후 상태를 못 본다')

# ── 클라이언트: likeCount 쓰기는 모두 batch 안에, 목록 쓰기와 한 묶음 ──────────
FILES = ['products/view.html', 'brands/view.html', 'auth/profile.html']
LIKED = ('likedProducts', 'likedBrands')
total = 0
for rel in FILES:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        errors.append('[목록] %s 가 없다' % rel)
        continue
    lines = io.open(p, encoding='utf-8').read().split('\n')
    found = 0
    for i, L in enumerate(lines):
        if not re.search(r'likeCount\s*:', L):
            continue
        if L.lstrip().startswith('//') or L.lstrip().startswith('*'):
            continue
        found += 1
        total += 1
        if not re.search(r'\bbatch\w*\s*\.\s*update\s*\(', L):
            errors.append('[묶음] %s:%d — likeCount 를 batch 가 아닌 곳에서 쓴다. '
                          '목록과 한 묶음이 아니면 규칙이 거부한다\n        %s'
                          % (rel, i + 1, L.strip()[:100]))
            continue
        near = '\n'.join(lines[max(0, i - 4):i + 5])
        # 목록 키는 이름(likedProducts)으로도, 계산된 키([field]:)로도 쓴다
        if not (any(f in near for f in LIKED) or re.search(r'\[\s*\w+\s*\]\s*:', near)):
            errors.append('[묶음] %s:%d — 같은 묶음에서 내 목록(likedProducts/likedBrands)을 '
                          '함께 쓰지 않는다' % (rel, i + 1))
    if not found:
        errors.append('[자기검사] %s 에 likeCount 쓰기가 없다 — 자리가 옮겨졌거나 탐지가 멈췄다' % rel)

if total != 5:
    errors.append('[자기검사] likeCount 쓰기를 %d 곳 찾았다(상세 2 · 브랜드 2 · 내 계정 1 = 5). '
                  '자리가 늘었거나 탐지가 멈췄다' % total)

# 되돌림 감지: 옛 보상 코드(따로 쓰고 실패하면 되돌리기)가 돌아오면 알린다
for rel in FILES:
    src = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
    if re.search(r'catch\s*\(\s*countErr\s*\)', src):
        errors.append('[되돌림] %s — 옛 보상 코드(countErr)가 돌아왔다. '
                      '두 번 따로 쓰는 방식이면 규칙이 거부한다' % rel)

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('likeCount 쓰기 %d곳 모두 한 묶음 · 규칙은 목록의 변화를 본다 — 좋아요 카운터 검사 통과' % total)
