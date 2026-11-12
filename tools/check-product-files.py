# -*- coding: utf-8 -*-
"""A-483 — 자료 파일(카탈로그·BIM·3D)의 다운로드 URL 이 공개 제품 문서로 돌아오지 않는지.

승인된 제품 문서는 **문서 전체가 공개 읽기**다. 거기에 다운로드 URL 이 있으면
「로그인 → 신청 → 어드민 승인 → 7일 링크」 절차가 **아무것도 막지 못한다**(제품 JSON
한 번이면 URL 이 나온다). 그래서 URL 은 `products/{id}/internal/files` 로 옮기고,
공개 문서에는 **있는지 여부**(hasCatalogPdf·hasBimFile·hasModel3d)만 둔다.

잡는 되돌림:
  1) 공개 제품 문서에 URL 을 쓰는 코드(값으로 — FieldValue.delete() 는 괜찮다)
  2) 공개 페이지가 URL 을 다시 읽는 것
  3) 어드민 화면이 병합 없이 읽는 것(파일 칸이 조용히 빈다)
  4) 규칙: internal 블록 소실·공개화, Storage 의 products-specs 공개 읽기 복귀
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELDS = ['catalogPdf', 'bimFile', 'model3d']
errors = []


def strip_comments(s):
    out, i, n = [], 0, len(s)
    while i < n:
        two = s[i:i + 2]
        if two == '//':
            j = s.find('\n', i); j = n if j < 0 else j
            out.append(' ' * (j - i)); i = j
        elif two == '/*':
            j = s.find('*/', i + 2); j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', s[i:j])); i = j
        else:
            out.append(s[i]); i += 1
    return ''.join(out)


def read(rel):
    return strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())


# ── 1) 공개 제품 문서에 URL 을 쓰지 않는다 ──────────────────────────────────
portal = read('brand-portal/dashboard.html')
lines = portal.split('\n')
writes_internal = len(re.findall(r"collection\('internal'\)\s*\.\s*doc\('files'\)", portal))
if writes_internal < 3:
    errors.append('[자기검사] 포털의 internal/files 접근이 %d 곳이다(수정 읽기 1 + 수정 쓰기 1 + '
                  '등록 쓰기 1 = 3 이상이어야 한다)' % writes_internal)

def literal_prefix(src, pos, span=220):
    """pos 를 담은 객체 리터럴의 여는 중괄호를 찾아, 그 **직전** 조각을 돌려준다.
       「주변 몇 줄에 무엇이 있나」로 가르면 같은 batch 안의 internal 쓰기 때문에
       바로 옆 본문서 쓰기가 그냥 통과한다(A-481 에서 같은 실수를 했다)."""
    depth, k = 0, pos
    while k > 0:
        k -= 1
        if src[k] == '}':
            depth += 1
        elif src[k] == '{':
            if depth == 0:
                break
            depth -= 1
    return src[max(0, k - span):k], src[:k].count('\n') + 1


for m in re.finditer(r'\b(catalogPdf|bimFile|model3d)\s*:', portal):
    stmt_end = portal.find('\n', m.start())
    stmt = portal[m.start():stmt_end if stmt_end > 0 else len(portal)]
    if re.search(r':\s*\w*FV\w*\.delete\(\)', stmt):
        continue                      # 옛 자리를 지우는 것은 바라는 일이다
    prefix, line = literal_prefix(portal, m.start())
    if "doc('files')" in prefix:
        continue                      # internal/files 쓰기 — 여기가 제 자리다
    if 'getElementById' in prefix or re.search(r'\bfiles\s*=\s*$', prefix.rstrip()):
        continue                      # 폼에서 집어 둔 File 객체 꾸러미
    if re.search(r'(prevFiles|newFiles)\s*=\s*$', prefix.rstrip()):
        continue                      # 지역 변수
    errors.append('[쓰기] brand-portal/dashboard.html:%d — 공개 제품 문서에 자료 파일 URL 을 '
                  '쓰는 것으로 보인다\n        %s' % (line, stmt.strip()[:100]))

# 공개 문서에는 여부 칸이 있어야 한다
for f in ['hasCatalogPdf', 'hasBimFile', 'hasModel3d']:
    if portal.count(f) < 2:
        errors.append('[쓰기] 포털이 %s 를 등록·수정 **양쪽**에 쓰지 않는다 '
                      '(한쪽만 쓰면 단추가 한쪽에서만 뜬다)' % f)

# ── 2) 공개 페이지는 URL 을 읽지 않는다 ─────────────────────────────────────
pub = read('products/view.html')
for f in FIELDS:
    for m in re.finditer(r'\bp\.' + f + r'\b', pub):
        line = pub[:m.start()].count('\n') + 1
        # 옛 문서 호환으로 **있는지 여부**만 보는 것은 괜찮다. 판단은 **그 줄 안에서**만
        # 한다 — 앞뒤 120자를 보면 바로 아래 줄의 pHas 때문에 URL 을 읽는 줄도 통과한다.
        bol = pub.rfind('\n', 0, m.start()) + 1
        eol = pub.find('\n', m.start())
        stmt = pub[bol:eol if eol > 0 else len(pub)]
        if re.search(r'pHas\w*\s*=\s*!!\(', stmt):
            continue
        errors.append('[공개] products/view.html:%d — 공개 페이지가 자료 파일 URL(p.%s)을 '
                      '읽는다. 여부(hasBimFile 등)만 봐라' % (line, f))
if not re.search(r'pHasBim\s*=', pub):
    errors.append('[공개] products/view.html 에 여부 판정(pHasBim)이 없다 — 탐지가 멈췄다')

# ── 3) 어드민은 병합해서 읽는다 ─────────────────────────────────────────────
merged = 0
for rel, label in [('admin/dashboard.html', '제품 상세'), ('admin/bim-requests.html', '신청 승인')]:
    src = read(rel)
    if 'admMergeProductFiles' not in src:
        errors.append('[어드민] %s(%s)가 admMergeProductFiles 를 거치지 않는다 — '
                      '자료 파일 칸이 조용히 빈다' % (rel, label))
    else:
        merged += 1
if 'async function admMergeProductFiles' not in read('admin/js/admin-core.js'):
    errors.append('[어드민] admin-core.js 에 admMergeProductFiles 가 없다')
if merged < 2:
    errors.append('[자기검사] 병합해서 읽는 어드민 화면이 %d곳이다(2곳이어야 한다)' % merged)

# ── 4) 규칙 ────────────────────────────────────────────────────────────────
rules = io.open(os.path.join(ROOT, 'firestore.rules'), encoding='utf-8').read()
m = re.search(r"match\s+/products/\{productId\}/internal/\{docId\}\s*\{(.*?)\n    \}", rules, re.S)
if not m:
    errors.append('[규칙] products/{productId}/internal/{docId} 블록이 없다')
else:
    blk = m.group(1)
    if re.search(r'if\s+true', blk):
        errors.append('[규칙] internal/files 를 공개로 열어 뒀다 — 옮긴 뜻이 없어진다')
    if 'isAdmin()' not in blk or '.data.brandId' not in blk:
        errors.append('[규칙] internal/files 는 어드민과 소유 브랜드만 읽어야 한다')
    if not re.search(r'allow\s+write[^;]*getAfter\(', blk, re.S):
        errors.append('[규칙] internal/files 쓰기가 getAfter 를 쓰지 않는다 — 제품 등록은 '
                      '본문서와 한 묶음이라 그 순간 부모 문서가 없다(get 은 거부된다)')

storage = io.open(os.path.join(ROOT, 'storage.rules'), encoding='utf-8').read()
sm = re.search(r"match\s+/products-specs/\{uid\}/\{allPaths=\*\*\}\s*\{(.*?)\n    \}", storage, re.S)
if not sm:
    errors.append('[Storage] products-specs 블록을 못 찾았다')
elif re.search(r'allow\s+read[^;]*:\s*if\s+true', sm.group(1)):
    errors.append('[Storage] products-specs 가 다시 공개 읽기다 — read 는 목록(list)까지 '
                  '허용하므로 전 브랜드 자료 파일을 훑어 받아갈 수 있다')

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('공개 문서에 URL 없음 · 어드민 2곳 병합 · 규칙/Storage 닫힘 — 자료 파일 분리 검사 통과')
