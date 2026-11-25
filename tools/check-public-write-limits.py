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


def match_block(coll):
    m = re.search(r"match\s+/" + coll + r"/\{\w+\}\s*\{(.*?)\n    \}", rules_code, re.S)
    return m.group(1) if m else None


def create_clause(coll):
    """A-570: 전에는 `allow create:` 한 줄만 돌려줬다. 그래서 울타리를 **도우미
    함수에 담아 둔** 자리(mail 의 mailKeysOk·mailShapeOk)는 「없다」고 읽혔다.
    규칙을 어떻게 적었느냐가 아니라 **무엇을 막느냐**를 봐야 한다 — 같은 match
    블록 안의 함수까지 함께 본다."""
    blk = match_block(coll)
    if blk is None:
        return None
    c = re.search(r'allow create:(.*?);', blk, re.S)
    if not c:
        return None
    funcs = ''.join(m.group(0) for m in re.finditer(r'function\s+\w+\s*\(\)\s*\{.*?\n      \}', blk, re.S))
    return c.group(1) + '\n' + funcs


# ── 1) 규칙 ────────────────────────────────────────────────────────────────
# A-570(브론즈 41차 ④): 여기 컬렉션 **둘만** 적혀 있었다. 그래서 `mail` 과
#   `consultations` 처럼 **비로그인도 쓸 수 있는** 자리가 검사 밖이었고,
#   `mail` 에는 키 울타리가 없어 bcc·from·첨부를 끼워 넣을 수 있었다(A-569).
#   누구나 쓸 수 있는 컬렉션은 전부 여기 적는다.
# ★★ A-696(2026-11-25, 브론즈 2차): **명부를 또 놓쳤다.** A-570 이 둘에서 넷으로
#   늘렸는데, 그 뒤 생긴 `newsletter-subscribers`·`digital-products-notify` 가
#   다시 검사 밖이었다 — 둘 다 울타리도 길이 상한도 없었다.
#   **손으로 적는 명부는 늘 낡는다.** 두 번 같은 자리에서 틀렸으니 명부를
#   한 줄 더 늘리는 것으로는 세 번째를 막을 수 없다. 그래서 **규칙 파일에서
#   공개 쓰기를 전수로 찾아낸다**: `allow create` 가 있으면서 그 조건이 로그인·
#   어드민을 요구하지 **않는** 컬렉션은 전부 누구나 쓸 수 있는 자리다.
#   아래 이름표는 보고를 읽기 쉽게 하는 것일 뿐, **범위를 정하지 않는다.**
LABELS = {'leads': '리드', 'bim-requests': '자료 신청', 'mail': '메일 큐',
          'consultations': '자문 요청', 'newsletter-subscribers': '뉴스레터 구독',
          'digital-products-notify': '출시 알림 신청'}


def _split_top(text, op):
    """**맨 바깥** `op` 로만 가른다. 괄호 안의 같은 기호는 가르지 않는다."""
    out, depth, cur = [], 0, []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if depth == 0 and text.startswith(op, i):
            out.append(''.join(cur)); cur = []; i += len(op); continue
        cur.append(ch); i += 1
    out.append(''.join(cur))
    return [b for b in out if b.strip()]


def _strip_parens(t):
    t = t.strip()
    while t.startswith('(') and t.endswith(')'):
        inner = t[1:-1]
        d = 0
        for ch in inner:
            if ch == '(':
                d += 1
            elif ch == ')':
                d -= 1
            if d < 0:
                return t
        t = inner.strip()
    return t


def _requires_vetted(expr):
    """이 식이 **반드시** 검증된 신분을 요구하는가. 되걸이로 푼다.

    ★★ A-696: 두 번 틀렸다. ① 글자 안에 `isAdmin(` 이 있으면 검증된 것으로
    봤더니, 칸 하나에 붙은 조건까지 신분 문으로 읽혀 공개 쓰기인 `leads` 가
    검사 밖으로 나갔다. ② 그래서 「맨 바깥 `&&` 조각이 신분 문으로 **시작**하면」
    으로 바꿨는데, `(isAdmin() || 동의했으면)` 이 `isAdmin()` 으로 시작하므로
    또 검증된 것으로 읽혔다 — **그건 「또는」이다.** 어드민이 아니어도
    동의만 하면 쓸 수 있으니 공개 쓰기가 맞다.
    두 번 다 **글자의 생김새**로 뜻을 재려 한 탓이다. 조건은 나무이므로
    나무로 읽는다: 「또는」은 **모두** 요구해야 요구하는 것이고, 「그리고」는
    **하나라도** 요구하면 요구하는 것이다.
    """
    expr = _strip_parens(expr)
    alts = _split_top(expr, '||')
    if len(alts) > 1:
        return all(_requires_vetted(x) for x in alts)
    conjs = _split_top(expr, '&&')
    if len(conjs) > 1:
        return any(_requires_vetted(x) for x in conjs)
    return bool(VETTED.match(expr))


# 「검증된 신분」을 요구하는 문들. 로그인(isSignedIn)은 **여기 넣지 않는다** —
# 가입은 누구나 스스로 하니 로그인은 걸러 주는 것이 아니다(A-570 이 그래서
# `bim-requests` 를 명부에 넣었다).
VETTED = re.compile(r'\bisAdmin\s*\(|\bisApprovedBrand\s*\(|\bisOwner\s*\(|\bisBrandOwner\s*\(')


def public_write_collections():
    """규칙에서 **어드민·승인 브랜드가 아니어도 쓸 수 있는** 컬렉션을 전수로 찾는다.

    갈래(`||`) 가 하나라도 검증된 신분을 요구하지 않으면 그 컬렉션은 공개 쓰기다.
    `mail` 이 그 꼴이다 — 어드민 갈래와 로그인 갈래 말고 **아무나 쓰는 갈래**가
    하나 있어서, 갈래를 보지 않고 통째로 보면 「어드민 전용」으로 잘못 읽힌다.
    """
    out, seen = [], set()
    for m in re.finditer(r'match\s+/([A-Za-z0-9_-]+)/\{\w+\}\s*\{', rules_code):
        coll = m.group(1)
        if coll in seen:
            continue
        # ★ 분류는 **조건만** 보고 한다. `create_clause()` 는 울타리를 도우미
        #   함수에 담아 둔 경우까지 보려고 함수 본문을 덧붙여 돌려주는데,
        #   그 본문에 `isAdmin(` 이 들어 있으면 공개 쓰기인 `leads`·`consultations`
        #   가 「어드민 전용」으로 잘못 읽힌다. **무엇을 재는지에 따라 볼 글이 다르다** —
        #   울타리를 셀 때는 함수까지, 공개인지 가릴 때는 조건만.
        blk = match_block(coll)
        c = re.search(r'allow create:(.*?);', blk or '', re.S)
        if not c:
            continue
        clause = re.sub(r'\s+', ' ', c.group(1)).strip()
        # ★ `allow create: if …` 의 `if` 를 걷는다. 안 걷으면 첫 조각이
        #   「if isOwner(userId)」가 되어 신분 문을 **맨 앞에 둔 규칙만**
        #   공개로 잘못 읽힌다 — brands·products·users·articles 가 그랬다.
        clause = re.sub(r'^if\b\s*', '', clause)
        if _requires_vetted(clause):
            continue
        seen.add(coll)
        out.append((coll, LABELS.get(coll, coll)))
    return out


_found = public_write_collections()
if len(_found) < 7:
    errors.append('[검사] 공개 쓰기 컬렉션이 %d 개만 보인다 — 전에 7개였다. '
                  '탐지가 멈췄는지 보라' % len(_found))
print('  공개 쓰기 컬렉션 %d개를 전수로 찾았다: %s'
      % (len(_found), ', '.join(c for c, _ in _found)))

for coll, label in _found:
    cl = create_clause(coll)
    if cl is None:
        errors.append('[규칙] %s 의 create 조건을 못 찾았다 — 탐지가 멈췄다' % coll)
        continue
    if 'keys().hasOnly(' not in cl.replace(' ', '').replace('\n', '').replace('keys().hasOnly(', 'keys().hasOnly('):
        if 'hasOnly' not in cl:
            errors.append('[규칙] %s(%s) create 에 키 목록(keys().hasOnly)이 없다 — '
                          '아무 칸이나 끼워 넣을 수 있다' % (coll, label))
    if '.size() <=' not in cl and '.size() <' not in cl:   # A-570: `<` 도 상한이다
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

# ── 1-b) 폼이 담는 키가 규칙의 키 목록 안에 있는지 ─────────────────────────
#   ★ 이 대조가 없으면 조건부로 붙는 칸(예: 샘플 요청의 shippingAddress)이
#     목록에서 빠진 줄 모르고 규칙을 올렸다가 **폼 하나가 통째로 거부된다.**
#     실제로 A-485 를 쓸 때 그 칸이 빠졌고, 이 검사를 만들면서 찾았다.
def allow_list(clause):
    m = re.search(r"keys\(\)\.hasOnly\(\s*\[(.*?)\]\s*\)", clause, re.S)
    return set(re.findall(r"'(\w+)'", m.group(1))) if m else set()


LEAD_FORMS = {
    'brands/view.html': 'leadDoc',
    'products/view.html': 'data',
    'sourcing-inquiry.html': 'leadDoc',
    'admin/js/view-leads.js': 'doc',
}
allowed = allow_list(lead_cl)
if not allowed:
    errors.append('[규칙] leads create 의 키 목록을 읽지 못했다')
else:
    for rel, var in LEAD_FORMS.items():
        src = strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())
        m = re.search(r'(?:const|let|var)\s+' + var + r'\s*=\s*\{', src)
        if not m:
            errors.append('[폼] %s 에서 리드 객체(%s)를 못 찾았다 — 탐지가 멈췄다' % (rel, var))
            continue
        i = src.index('{', m.end() - 1)
        d, j = 0, i
        while j < len(src):
            if src[j] == '{': d += 1
            elif src[j] == '}':
                d -= 1
                if d == 0: break
            j += 1
        keys = set(re.findall(r'(?m)^\s*([A-Za-z_]\w*)\s*:', src[i:j + 1]))
        # 리터럴 뒤에 조건부로 더 붙이는 칸까지 센다 (data.shippingAddress = … 꼴)
        for mm in re.finditer(r'\b' + var + r'\.([A-Za-z_]\w*)\s*=[^=]', src):
            keys.add(mm.group(1))
        extra = sorted(k for k in keys - allowed)
        if extra:
            errors.append('[키] %s 가 담는 칸 %s 이(가) 규칙의 키 목록에 없다 — '
                          '규칙을 올리는 순간 이 폼이 통째로 거부된다' % (rel, ', '.join(extra)))

# 자료 신청(bim-requests)도 같은 대조 — 이쪽도 공개 제품 페이지의 폼이다
bim_cl = create_clause('bim-requests') or ''
bim_allowed = allow_list(bim_cl)
if not bim_allowed:
    errors.append('[규칙] bim-requests create 의 키 목록을 읽지 못했다')
else:
    src = strip_comments(io.open(os.path.join(ROOT, 'products/view.html'), encoding='utf-8').read())
    m = re.search(r"collection\('bim-requests'\)\.add\(", src)
    if not m:
        errors.append('[폼] products/view.html 에서 자료 신청 쓰기를 못 찾았다 — 탐지가 멈췄다')
    else:
        i = src.index('{', m.end() - 1)
        d, j = 0, i
        while j < len(src):
            if src[j] == '{': d += 1
            elif src[j] == '}':
                d -= 1
                if d == 0: break
            j += 1
        keys = set(re.findall(r'(?m)^\s*([A-Za-z_]\w*)\s*:', src[i:j + 1]))
        extra = sorted(keys - bim_allowed)
        if extra:
            errors.append('[키] 자료 신청 폼이 담는 칸 %s 이(가) 규칙의 키 목록에 없다 — '
                          '규칙을 올리는 순간 신청이 통째로 거부된다' % ', '.join(extra))

# ── 2) 폼의 maxlength 가 규칙 상한 이하인지 ────────────────────────────────
FORMS = {
    'brands/view.html':      {'rfqName': 'name', 'rfqCompany': 'company', 'rfqEmail': 'email', 'rfqMessage': 'message'},
    'products/view.html':    {'rfqName': 'name', 'rfqCompany': 'company', 'rfqEmail': 'email', 'rfqMessage': 'message',
                              'rfqShipping': 'shippingAddress',
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
if checked < 19:
    errors.append('[자기검사] maxlength 를 %d칸만 확인했다(19칸이어야 한다)' % checked)

# ── 3) 읽기 규칙 (A-486) ───────────────────────────────────────────────────
bare = re.findall(r'allow read:[^;]*?resource\.data\.status\s*==', rules_code, re.S)
if bare:
    errors.append('[읽기] 없는 필드를 그대로 읽는 read 규칙이 %d곳 남았다 — '
                  'status 가 없는 문서 하나로 목록 질의 전체가 죽는다 '
                  "(resource.data.get('status','') 로 바꿔라)" % len(bare))
if rules_code.count("data.get('status', '')") < 3:
    errors.append("[읽기] get('status','') 를 쓰는 자리가 3곳 미만이다 — 탐지가 멈췄다")

# ── 4) 기본 대화상자 (A-487 · A-560 · A-561) ──────────────────────────────
# A-563(브론즈 40차): 여기 **파일 두 개가 손으로 박혀** 있었다. 그래서 어드민과
#   브랜드 포털은 검사 밖이었고, 거기 기본 confirm() 이 **11곳** 남아 있었다.
#   크롬이 대화상자를 차단하면 confirm() 은 언제나 false 라 조용히 되돌아간다 —
#   A-302 · A-309 · A-487 · A-560 · A-561 로 같은 원인이 다섯 번 고쳐졌다.
#   목록을 손으로 적는 대신 **손님과 운영자가 쓰는 쪽을 전부** 훑는다.
def _dialog_targets():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in ('node_modules', '.git', '__pycache__', 'tools',
                                    'scripts', 'docs', 'backup', 'archi-diary')]
        for fn in sorted(filenames):
            if fn.endswith('.html') or (fn.endswith('.js') and 'brand-portal' in dirpath):
                out.append(os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, '/'))
    return out

for rel in _dialog_targets():
    code = strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())
    for fn in ['confirm', 'alert']:
        hits = re.findall(r'(?<![\w.])' + fn + r'\s*\(', code)
        if hits:
            how = ('likeNote(…, link)' if rel in ('products/view.html', 'brands/view.html')
                   else ('admConfirm()·admSay()' if rel.startswith('admin/')
                         else 'pConfirm()·pNote()'))
            errors.append('[대화상자] %s 에 기본 %s() 가 %d곳 있다 — 억제되면 눌러도 '
                          '아무 일도 안 일어난다. %s 를 써라'
                          % (rel, fn, len(hits), how))
    if rel in ('products/view.html', 'brands/view.html') and 'likeNote(msg, isErr, link)' not in code:
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
