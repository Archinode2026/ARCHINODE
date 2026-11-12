# -*- coding: utf-8 -*-
"""A-480 — 담당자 개인정보가 공개 브랜드 문서로 되돌아오는 것을 막는다.

승인된 brands 문서는 **문서 전체가 공개 읽기**다. 화면에 안 그려도 질의 한 번으로
담당자 이름·직함·이메일·전화·유입경로·약관동의가 전량 수집됐다(A-480).
그래서 그 8개 항목은 brands/{id}/internal/contact 서브컬렉션으로 옮겼고,
읽는 화면은 admin-core.js 의 admMergeBrandContact(s) 로 읽기 직후 한 번 병합한다.

이 검사가 잡는 되돌림 세 가지:
  1) 쓰기   — 공개 brands 문서에 8개 항목 중 하나라도 다시 쓰는 코드
  2) 읽기   — brands 문서를 읽고 병합 없이 그 항목을 보는 코드(화면이 조용히 빈다)
  3) 규칙   — firestore.rules 에서 internal/contact 블록이 사라지거나 공개로 열리는 것

빈 검사가 되지 않게, 끝에서 '병합해서 읽는 자리'가 실제로 몇 군데 잡혔는지 센다.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PII = ['contactName', 'position', 'email', 'phone',
       'referral', 'referralSource', 'agreedVendorTerms', 'agreedVendorTermsAt']
MERGE_OK = ('admMergeBrandContact', "doc('contact')")
MIN_MERGED_SITES = 6  # 병합해서 읽는 자리의 최소 개수(빈 검사 방지)

errors = []
merged_sites = []


def strip_comments(s):
    """줄/블록 주석을 공백으로 지운다(한글 주석 안의 코드 흉내를 코드로 읽지 않게)."""
    out, i, n = [], 0, len(s)
    while i < n:
        two = s[i:i + 2]
        if two == '//':
            j = s.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i)); i = j
        elif two == '/*':
            j = s.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', s[i:j])); i = j
        else:
            out.append(s[i]); i += 1
    return ''.join(out)


def code_files():
    skip = ('node_modules', '.git', 'functions/node_modules')
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        rel = os.path.relpath(base, ROOT).replace('\\', '/')
        if any(s in rel for s in skip):
            continue
        for f in sorted(files):
            if f.endswith(('.html', '.js')):
                yield os.path.join(rel, f).replace('./', '').replace('\\', '/')


# ── 1) 쓰기: 공개 brands 문서에 개인정보를 쓰지 않는다 ────────────────────────
def object_literal_after(text, start):
    """start 위치의 '{' 부터 짝이 맞는 '}' 까지."""
    i = text.index('{', start)
    depth, j = 0, i
    while j < len(text):
        if text[j] == '{': depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0: return text[i:j + 1]
        j += 1
    return text[i:]


# (파일, 본문서 쓰기를 가리키는 앵커) — 앵커는 파일 안에서 딱 한 번 맞아야 한다
WRITE_SITES = [
    ('list-your-brand.html', r"db\.collection\('brands'\)\.doc\(uid\)\.set\("),
    ('tools/make-qa-user.js', r"db\.collection\('brands'\)\.doc\(user\.uid\);[\s\S]*?ref\.set\("),
]
for rel, pat in WRITE_SITES:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        errors.append('[쓰기] %s 가 없다 — 파일이 사라졌거나 이름이 바뀌었다' % rel)
        continue
    src = strip_comments(io.open(p, encoding='utf-8').read())
    ms = list(re.finditer(pat, src))
    if len(ms) != 1:
        errors.append('[쓰기] %s 에서 브랜드 본문서 쓰기 자리를 %d 군데 찾았다(1 이어야 한다)'
                      % (rel, len(ms)))
        continue
    body = object_literal_after(src, ms[0].end() - 1)
    for f in PII:
        if re.search(r'(^|[{,\s])' + f + r'\s*[:,}]', body):
            errors.append('[쓰기] %s — 공개 brands 문서에 개인정보 "%s" 를 쓴다. '
                          'internal/contact 로 보내라' % (rel, f))
    # contact 쓰기에는 8개가 다 있어야 한다
    cm = re.search(r"collection\('internal'\)\.doc\('contact'\)\.set\(", src)
    if not cm:
        errors.append('[쓰기] %s — internal/contact 쓰기가 없다' % rel)
    else:
        cbody = object_literal_after(src, cm.end() - 1)
        missing = [f for f in PII
                   if not re.search(r'(^|[{,\s])' + f + r'\s*[:,}]', cbody)]
        if missing:
            errors.append('[쓰기] %s — internal/contact 에 빠진 항목: %s'
                          % (rel, ', '.join(missing)))

# ── 2) 읽기: 병합 없이 개인정보를 보지 않는다 ────────────────────────────────
WINDOW = 200
READ = re.compile(r"collection\('brands'\)")
SNAP = re.compile(r"(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*collection\('brands'\)")

for rel in code_files():
    if rel.startswith('tools/'):
        continue
    src = strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())
    lines = src.split('\n')

    def is_site(L):
        return (READ.search(L) and "collection('internal')" not in L
                and not re.search(r'\.(update|set)\(', L))

    starts = [i for i, L in enumerate(lines) if is_site(L)]
    for k, i in enumerate(starts):
        nxt = starts[k + 1] if k + 1 < len(starts) else len(lines)
        end = min(len(lines), nxt, i + WINDOW)
        win = '\n'.join(lines[i:end])
        has_merge_call = 'admMergeBrandContact' in win
        has_contact_doc = "doc('contact')" in win

        # 이 읽기에 묶인 스냅샷 변수
        snaps = set(SNAP.findall(lines[i]))
        for m in re.finditer(r'\.then\(\s*(?:function\s*\(\s*(\w+)|(\w+)\s*=>)', win[:400]):
            snaps.add(m.group(1) or m.group(2))

        raw, merged = set(), set()
        for sv in snaps:                       # X = snap.data()  → 병합 안 된 값
            for m in re.finditer(r'(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?'
                                 + re.escape(sv) + r'\.data\(\)', win):
                raw.add(m.group(1))
        # X = await admMergeBrandContact(...) — 삼항(exists ? ... : null)도 받는다
        for m in re.finditer(r'(?:(?:const|let|var)\s+)?(\w+)\s*=\s*'
                             r'[^;=]{0,160}?admMergeBrandContact\(', win):
            merged.add(m.group(1))
        if has_contact_doc:                    # X = Object.assign({}, X, cdoc.data()) — 포털
            for m in re.finditer(r'(\w+)\s*=\s*Object\.assign\([^;]*\.data\(\)', win):
                merged.add(m.group(1))
        # 목록 순회: **무엇을** 순회하는지 보고 가른다. 아무 map/forEach 의 인자나
        # 브랜드 값으로 세면, 같은 함수 안의 다른 컬렉션(리드·BIM 신청)까지 잡는다.
        mergedlists = set()
        for m in re.finditer(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?'
                             r'admMergeBrandContacts\(', win):
            mergedlists.add(m.group(1))
        for m in re.finditer(r'admMergeBrandContacts\([\s\S]{0,200}?\)\s*\.then\('
                             r'\s*(?:function\s*\(\s*(\w+)|(\w+)\s*=>)', win):
            mergedlists.add(m.group(1) or m.group(2))
        for m in re.finditer(r'(\w+)(?:\.docs)?\.(?:map|forEach)\(\s*'
                             r'(?:function\s*\(\s*(\w+)|(\w+)\s*=>)', win):
            recv, name = m.group(1), (m.group(2) or m.group(3))
            if recv in mergedlists:
                merged.add(name)
            elif recv in snaps:
                raw.add(name)

        raw -= merged                          # 같은 변수를 뒤에서 병합해 덮으면 병합된 것으로 본다
        def pii_on(names):
            out = []
            for d in names:
                for f in PII:
                    if re.search(r'\b' + re.escape(d) + r'\.' + f + r'\b', win):
                        out.append('%s.%s' % (d, f))
            return sorted(set(out))

        bad, good = pii_on(raw), pii_on(merged)
        if bad:
            errors.append('[읽기] %s:%d — brands 문서를 병합 없이 읽고 %s 를 본다. '
                          'admMergeBrandContact() 를 거쳐라'
                          % (rel, i + 1, ', '.join(bad)))
        if good and (has_merge_call or has_contact_doc):
            merged_sites.append('%s:%d (%s)' % (rel, i + 1, ', '.join(good)))

# ── 3) 규칙: internal/contact 블록이 있고 공개가 아니다 ──────────────────────
rp = os.path.join(ROOT, 'firestore.rules')
rules = io.open(rp, encoding='utf-8').read()
m = re.search(r"match\s+/brands/\{brandId\}/internal/contact\s*\{(.*?)\n\s*\}",
              rules, re.S)
if not m:
    errors.append('[규칙] firestore.rules 에 brands/{brandId}/internal/contact 블록이 없다')
else:
    blk = m.group(1)
    if re.search(r'allow\s+read[^;]*:\s*if\s+true', blk):
        errors.append('[규칙] internal/contact 를 공개 읽기로 열어 뒀다 — 옮긴 뜻이 없어진다')
    if 'isAdmin()' not in blk or 'request.auth.uid == brandId' not in blk:
        errors.append('[규칙] internal/contact 는 어드민과 본인만 읽어야 한다 — 조건이 바뀌었다')

# ── 빈 검사 방지 ────────────────────────────────────────────────────────────
if len(merged_sites) < MIN_MERGED_SITES:
    errors.append('[자기검사] 병합해서 읽는 자리를 %d 군데만 찾았다(최소 %d). '
                  '탐지가 멈춘 것이다 — 변수 이름이나 호출 모양이 바뀌었는지 보라'
                  % (len(merged_sites), MIN_MERGED_SITES))

print('병합해서 읽는 자리 %d 군데:' % len(merged_sites))
for s in merged_sites:
    print('  - ' + s)
if errors:
    print('\n실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('\n개인정보 분리 검사 통과')
