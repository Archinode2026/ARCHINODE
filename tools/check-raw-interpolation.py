# -*- coding: utf-8 -*-
"""A-471 — 브랜드가 입력한 값을 **날것으로** innerHTML 에 꽂는 자리를 찾는다.

왜 이 검사가 필요한가:
  같은 자료(제품·브랜드)를 그리는 사본이 다섯이다 — products/view.html ·
  brands/view.html · brand-portal/dashboard.html · category-products.js ·
  auth/profile.html. A-218 이 「출력 측 XSS 전수」를 했는데 **둘이 빠졌다**:
  `category-products.js`(공개 카테고리 69개 페이지를 그린다)와
  `auth/profile.html`. 제품명에 `"><img src=x onerror=...>` 를 넣고 승인만
  받으면 손님 브라우저에서 돌았다.
  저장소에 `scripts/check_xss_output.py` 가 있지만 **Playwright 가 필요**해서
  승리님 기계에서는 한 번도 돈 적이 없다(cdn.playwright.dev 가 막힌다).
  이 검사는 소스만 읽는다 — 어디서든 돈다.

규칙: 아래 파일의 HTML 템플릿 안에서 `${...}` 가 자료 필드를 **직접** 가리키면
      안 된다. 반드시 이스케이프를 거친 지역 변수(pName · bSlug …)를 쓴다.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# 같은 자료를 그리는 사본 전부
FILES = [
    'category-products.js',
    'auth/profile.html',
    'products/view.html',
    'brands/view.html',
    'brand-portal/dashboard.html',
    'admin/dashboard.html',
]

# 바깥에서 들어오는 값들 — 사람이 입력하거나 브랜드가 쓴 것
FIELDS = ('name', 'brandName', 'brandSlug', 'materials', 'title', 'slug', 'imageUrl',
          'logoUrl', 'collection', 'description', 'designer', 'dimensions', 'content',
          'country', 'category', 'subcategory', 'priceRange', 'moq', 'leadTime',
          'reviewerNote', 'statusReason', 'email', 'companyName', 'contactName',
          'koreanDealer', 'supplyType', 'catalogPdf', 'bimFile', 'model3d',
          # A-471 추가 — brands/view.html 의 딜러·인증 블록이 전부 날값이었다
          'address', 'showroom', 'contact', 'website', 'fileUrl', 'newStatus', 'reviewerNote')

# ── 찾는 방법 ──
# `${...}` 통째로 잡으면 **겹친 템플릿을 놓친다**: `${a.b ? `..${a.b}..` : ''}` 에서
# `[^}]*` 가 안쪽의 `}` 에서 끊겨 바깥 하나로 먹히고, 안쪽 날값은 따로 안 걸린다.
# (admin/dashboard.html:613 의 `${opts.brandName}` 를 그렇게 놓쳤다.)
# 그래서 **토큰 단위**로 센다: `<짧은이름>.<필드>` 를 하나씩 보고, 바로 앞이
# 이스케이프 호출이면 통과, 뒤가 조건 자리(`?` · `&&` · `||` · `)`)면 통과.
# 토큰이 **이스케이프 호출의 괄호 안에** 있나. 바로 앞만 보면
# `${escapeHtml(safeUrl(... 'https://' + dealer.website))}` 처럼 한 겹 안쪽에
# 있는 값을 놓친다(brands/view.html:897 에서 그렇게 걸렸다 — 코드는 맞았다).
ESC_OPEN = re.compile(
    r'(?:escapeHtml|esc|inbox_esc|safeUrl|bpSafeUrl|rvSafeUrl|encodeURIComponent)\s*\(')

def wrapped(before):
    """before 는 같은 치환 자리(`${`) 안에서 토큰 앞까지의 글자."""
    last = None
    for m in ESC_OPEN.finditer(before):
        last = m
    if last is None:
        return False
    # 그 괄호가 토큰 앞에서 닫혔는지 센다
    depth = 0
    for ch in before[last.end() - 1:]:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
    return depth > 0
TOKEN = re.compile(r'\b([A-Za-z_$][\w$]{0,12})\.(' + '|'.join(FIELDS) + r')\b')
# 조건 자리: 바로 뒤가 `?`·`&&`·`||`·`)` 이거나, 속성 몇 단계를 더 타고 나서 그렇다
# (`b.koreanDealer.name ?` 처럼). 값 자리는 `}` 나 글자가 뒤따른다.
COND_AFTER = re.compile(r'^(\.[\w$]+)*\s*(\?|&&|\|\||\)|===|!==|==|!=)')
# 화면에 안 들어가는 자리
SKIP_LINE = ('storage.ref(', '.ref(', 'db.collection(', 'console.')
SKIP_VARS = ('sub',)          # 하드코딩된 SUBCATEGORIES 리터럴

bad = []
checked = 0

for rel in FILES:
    if not os.path.exists(rel):
        bad.append('%s — 파일이 없다 (검사 목록을 고쳐라)' % rel)
        continue
    s = io.open(rel, encoding='utf-8').read()
    if 'escapeHtml' not in s:
        bad.append('%s — escapeHtml 이 아예 없다' % rel)
    lines = s.split('\n')
    for ln, line in enumerate(lines, 1):
        if any(k in line for k in SKIP_LINE):
            continue
        for m in TOKEN.finditer(line):
            var, field = m.group(1), m.group(2)
            if var in SKIP_VARS:
                continue
            # 템플릿 치환 자리 안인가 — 같은 줄에서 앞쪽에 `${` 가 열려 있나
            before = line[:m.start()]
            if '${' not in before:
                continue
            if before.rfind('${') < before.rfind('}'):
                continue
            checked += 1
            region = before[before.rfind('${') + 2:]
            if wrapped(region):
                continue
            if COND_AFTER.match(line[m.end():]):
                continue
            bad.append('%s:%d — 날값 `%s.%s` 가 템플릿에 들어간다 (이스케이프한 지역 변수를 써라)'
                       % (rel, ln, var, field))

print('검사함  같은 자료를 그리는 사본 %d개 · 자료 필드 %d종 · 치환 자리의 토큰 %d개'
      % (len(FILES), len(FIELDS), checked))

if bad:
    print('\n어긋난 것 %d건:' % len(bad))
    for b in bad:
        print('  ' + b)
    sys.exit(1)

print('날값 꽂기 — 없음')
