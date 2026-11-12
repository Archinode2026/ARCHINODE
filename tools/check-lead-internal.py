# -*- coding: utf-8 -*-
"""A-481 — 리드의 어드민 전용 기록이 배정된 브랜드에게 새지 않는지.

배정된 브랜드는 `leads` 문서를 **통째로** 읽는다(규칙상 그래야 인박스가 돈다).
Firestore 에는 필드 단위 읽기가 없으므로 「화면에 안 그린다」로는 아무것도 가려지지 않는다.
그래서 어드민 메모와 어드민이 남긴 상태 메모·어드민 이메일은
`leads/{id}/internal/admin` 으로 옮겼고, 문서의 `history[]` 에 남는 어드민 줄은
**뼈대만**(status · at · byRole) 이다.

잡는 되돌림:
  1) 리드 **본문서**에 adminNote 를 쓰는 코드
  2) 본문서 history 에 넣는 **어드민 줄**에 by(이메일)나 note(메모 본문)를 다시 담는 코드
  3) 규칙에서 internal 블록이 사라지거나, 브랜드의 history 축소 금지가 풀리는 것

빈 검사가 되지 않게 어드민 줄 3자리와 internal 쓰기 자리를 센다.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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


# ── 1) 본문서에 adminNote 를 쓰지 않는다 ────────────────────────────────────
WRITERS = ['admin/js/view-leads.js', 'brands/view.html', 'products/view.html',
           'sourcing-inquiry.html', 'request-consultation.html', 'contact.html',
           'brand-portal/dashboard.html']
for rel in WRITERS:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        errors.append('[목록] %s 가 없다 — WRITERS 를 손봐라' % rel)
        continue
    src = read(rel)
    for m in re.finditer(r'adminNote\s*:', src):
        # 이 키가 든 **객체 리터럴의 여는 중괄호**까지 거꾸로 올라가, 그 **직전**이
        # 어떤 호출인지 본다. 「앞 400자 안에 doc('admin') 이 있으면 통과」로 두면
        # 바로 위에 internal 쓰기가 있는 batch 안의 본문서 쓰기가 그냥 통과한다.
        depth, k = 0, m.start()
        while k > 0:
            k -= 1
            if src[k] == '}':
                depth += 1
            elif src[k] == '{':
                if depth == 0:
                    break
                depth -= 1
        prefix = src[max(0, k - 160):k]
        if "doc('admin')" in prefix or 'doc("admin")' in prefix:
            continue
        line = src[:m.start()].count('\n') + 1
        errors.append('[본문서] %s:%d — 리드 본문서에 adminNote 를 쓴다. '
                      "leads/{id}/internal/admin 으로 보내라" % (rel, line))

# ── 2) 어드민 줄(byRole:'admin')에 by·note 를 담지 않는다 ───────────────────
src = read('admin/js/view-leads.js')
# 문서에 **넣는** 줄만 센다 — 화면에서 합쳐 그리는 Object.assign 은 세지 않는다
admin_entries = re.findall(r"entry\s*=\s*(\{[^{}]*byRole\s*:\s*'admin'[^{}]*\})", src)
if len(admin_entries) != 3:
    errors.append('[자기검사] 문서에 넣는 어드민 이력 줄이 %d 개다(배정·상태변경·수동등록 셋이어야 한다). '
                  '자리가 늘었거나 탐지가 멈췄다' % len(admin_entries))
for e in admin_entries:
    for bad in ('by', 'note'):
        if re.search(r'(^|[{,\s])' + bad + r'\s*:', e):
            errors.append('[이력] 문서에 넣는 어드민 줄에 %s 가 다시 들어 있다 → %s'
                          % (bad, e.strip()[:90]))

internal_writes = len(re.findall(r"collection\('internal'\)\s*\.\s*doc\('admin'\)", src))
if internal_writes < 3:
    errors.append('[자기검사] view-leads.js 의 internal/admin 접근이 %d 곳이다'
                  '(읽기 1 + 쓰기 3 이상이어야 한다)' % internal_writes)

# 어드민 메모를 읽어 놓고 못 읽었을 때 빈 값으로 덮어쓰지 않는지(가드)
if '_internalFailed' not in src:
    errors.append('[가드] internal/admin 읽기 실패 시 메모를 빈 값으로 덮어쓰는 것을 막는 '
                  '가드(_internalFailed)가 없다')

# ── 3) 규칙 ────────────────────────────────────────────────────────────────
rules = io.open(os.path.join(ROOT, 'firestore.rules'), encoding='utf-8').read()
m = re.search(r"match\s+/leads/\{leadId\}/internal/\{docId\}\s*\{(.*?)\n\s*\}", rules, re.S)
if not m:
    errors.append('[규칙] leads/{leadId}/internal/{docId} 블록이 없다')
elif 'isAdmin()' not in m.group(1) or re.search(r'if\s+true', m.group(1)):
    errors.append('[규칙] leads 의 internal 블록이 어드민 전용이 아니다')

lead_blk = re.search(r"match\s+/leads/\{leadId\}\s*\{(.*?)\n    \}", rules, re.S)
if not lead_blk:
    errors.append('[규칙] leads 블록을 못 찾았다')
else:
    b = lead_blk.group(1)
    if 'history' not in b or 'size() >=' not in b:
        errors.append('[규칙] 브랜드 update 에 history 축소 금지(size() >=)가 없다 — '
                      'history: [] 로 감사 기록을 지울 수 있다')

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('어드민 줄 %d개 · internal/admin 접근 %d곳 — 리드 내부기록 분리 검사 통과'
      % (len(admin_entries), internal_writes))
