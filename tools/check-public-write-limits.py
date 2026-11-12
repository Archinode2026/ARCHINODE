# -*- coding: utf-8 -*-
"""A-485~488 — 공개 폼이 쓰는 자리의 울타리가 풀리지 않았는지.

`leads` 와 `bim-requests` 는 **누구나(또는 로그인만 하면) 쓸 수 있는** 컬렉션이다.
전에는 ㄱ) 담기는 키를 세지 않았고 ㄴ) 길이 상한이 규칙에도 폼에도 없었다.
그래서 아무 키나 끼워 넣을 수 있었고(`history` 를 지어내 어드민이 쓴 것처럼),
한 문서를 1MiB 가까이 불릴 수도 있었다.

여기서 보는 것:
  1) 규칙   — keys().hasOnly · 길이 상한 · history 는 어드민만
  2) 폼     — 같은 칸에 maxlength 가 있고 **규칙의 상한보다 크지 않은지**
              (폼이 더 크면 손님이 다 쓰고 나서 거부당한다)
  3) 읽기 규칙 — 없는 필드를 그대로 읽어 목록 질의 전체가 죽지 않는지(A-486)
  4) 공개 페이지 — 로그인 안내에 기본 confirm/alert 을 쓰지 않는지(A-487)
  5) 어드민 검색 결과 주소에 스킴이 붙은 값이 들어가지 않는지(A-488)
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []
rules = io.open(os.path.join(ROOT, 'firestore.rules'), encoding='utf-8').read()


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


rules_code = strip_comments(rules)


def create_clause(coll):
    m = re.search(r"match\s+/" + coll + r"/\{\w+\}\s*\{(.*?)\n    \}", rules_code, re.S)
    if not m:
        return None
    c = re.search(r'allow create:(.*?);', m.group(1), re.S)
    return c.group(1) if c else None


# ── 1) 규칙 ────────────────────────────────────────────────────────────────
for coll, label in [('leads', '리드'), ('bim-requests', '자료 신청')]:
    cl = create_clause(coll)
    if cl is None:
        errors.append('[규칙] %s 의 create 조건을 못 찾았다 — 탐지가 멈췄다' % coll)
        continue
    if 'keys().hasOnly(' not in cl.replace(' ', '').replace('\n', '').replace('keys().hasOnly(', 'keys().hasOnly('):
        if 'hasOnly' not in cl:
            errors.append('[규칙] %s(%s) create 에 키 목록(keys().hasOnly)이 없다 — '
                          '아무 칸이나 끼워 넣을 수 있다' % (coll, label))
    if '.size() <=' not in cl:
        errors.append('[규칙] %s(%s) create 에 길이 상한이 하나도 없다 — '
                      '한 문서를 1MiB 까지 불릴 수 있다' % (coll, label))

lead_cl = create_clause('leads') or ''
if "'history'" in lead_cl and 'isAdmin()' not in lead_cl:
    errors.append('[규칙] leads create 가 history 를 받으면서 어드민 제한이 없다 — '
                  '감사 기록을 지어낼 수 있다')
if 'leadFieldsWithinLimits()' not in lead_cl:
    errors.append('[규칙] leads create 에 leadFieldsWithinLimits() 가 없다')

# 규칙이 정한 상한을 거둬 온다 (폼과 대조할 수치)
CAPS = {}
CAP_RE = re.compile(r"data(?:\.get\(\s*'(\w+)'\s*,\s*''\s*\)|\.(\w+))\.size\(\)\s*<=\s*(\d+)")
for m in CAP_RE.finditer(rules_code):
    key = m.group(1) or m.group(2)
    CAPS[key] = min(int(m.group(3)), CAPS.get(key, 10 ** 9))
for need in ['name', 'email', 'message', 'company', 'phone']:
    if need not in CAPS:
        errors.append('[규칙] "%s" 의 상한을 못 찾았다 — 규칙이 바뀌었거나 탐지가 멈췄다' % need)

# ── 2) 폼의 maxlength 가 규칙 상한 이하인지 ────────────────────────────────
FORMS = {
    'brands/view.html':      {'rfqName': 'name', 'rfqCompany': 'company', 'rfqEmail': 'email', 'rfqMessage': 'message'},
    'products/view.html':    {'rfqName': 'name', 'rfqCompany': 'company', 'rfqEmail': 'email', 'rfqMessage': 'message',
                              'bimName': 'name', 'bimCompany': 'company', 'bimTitle': 'title', 'bimEmail': 'email',
                              'bimPhone': 'phone', 'bimProjectName': 'projectName'},
    'sourcing-inquiry.html': {'srcName': 'name', 'srcCompany': 'company', 'srcEmail': 'email', 'srcMessage': 'message'},
}
checked = 0
for rel, fields in FORMS.items():
    src = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
    for fid, key in fields.items():
        m = re.search(r'<(?:input|textarea)\b[^>]*\bid="' + re.escape(fid) + r'"[^>]*>', src)
        if not m:
            errors.append('[폼] %s 에 입력칸 %s 가 없다 — 칸 이름이 바뀌었나' % (rel, fid))
            continue
        ml = re.search(r'maxlength="(\d+)"', m.group(0))
        if not ml:
            errors.append('[폼] %s / %s 에 maxlength 가 없다 — 규칙이 거부할 때까지 '
                          '손님은 모른다' % (rel, fid))
            continue
        checked += 1
        cap = CAPS.get(key)
        if cap is not None and int(ml.group(1)) > cap:
            errors.append('[폼] %s / %s 의 maxlength=%s 가 규칙 상한 %d 보다 크다 — '
                          '다 쓰고 나서 거부당한다' % (rel, fid, ml.group(1), cap))
if checked < 18:
    errors.append('[자기검사] maxlength 를 %d칸만 확인했다(18칸이어야 한다)' % checked)

# ── 3) 읽기 규칙 (A-486) ───────────────────────────────────────────────────
bare = re.findall(r'allow read:[^;]*?resource\.data\.status\s*==', rules_code, re.S)
if bare:
    errors.append('[읽기] 없는 필드를 그대로 읽는 read 규칙이 %d곳 남았다 — '
                  'status 가 없는 문서 하나로 목록 질의 전체가 죽는다 '
                  "(resource.data.get('status','') 로 바꿔라)" % len(bare))
if rules_code.count("data.get('status', '')") < 3:
    errors.append("[읽기] get('status','') 를 쓰는 자리가 3곳 미만이다 — 탐지가 멈췄다")

# ── 4) 공개 페이지의 기본 대화상자 (A-487) ─────────────────────────────────
for rel in ['products/view.html', 'brands/view.html']:
    code = strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())
    for fn in ['confirm', 'alert']:
        hits = re.findall(r'(?<![\w.])' + fn + r'\s*\(', code)
        if hits:
            errors.append('[대화상자] %s 에 기본 %s() 가 %d곳 있다 — 억제되면 눌러도 '
                          '아무 일도 안 일어난다. likeNote(…, link) 를 써라'
                          % (rel, fn, len(hits)))
    if 'likeNote(msg, isErr, link)' not in code:
        errors.append('[대화상자] %s 의 likeNote 가 link 를 받지 않는다' % rel)

# ── 5) 어드민 검색 결과 주소 (A-488) ───────────────────────────────────────
nav = strip_comments(io.open(os.path.join(ROOT, 'admin/js/admin-nav.js'), encoding='utf-8').read())
if 'adm_safeLocalHref' not in nav:
    errors.append('[주소] admin-nav.js 에 adm_safeLocalHref 가 없다')
if re.search(r'location\.href\s*=\s*ds\.href', nav):
    errors.append('[주소] location.href = ds.href 를 그대로 한다 — 스킴 검사를 거쳐라')

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('공개 쓰기 울타리 검사 통과 — 규칙 상한 %d개 · 폼 %d칸 대조' % (len(CAPS), checked))
