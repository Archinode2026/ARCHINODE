# -*- coding: utf-8 -*-
"""A-470 — 소분류 이름이 **한 페이지 안에서** 다섯 자리 전부 같은지 본다.

왜 이 검사가 필요한가:
  A-465 에서 소분류 23개의 한국어 이름을 정본으로 합쳤는데, **`og:title` 11곳이
  옛 이름으로 남았다.** 원인은 이렇다 — `og:title` 은 속성값이라 `&` 가
  `&amp;` 로 이스케이프돼 있고, `<title>` · JSON-LD 는 날 `&` 를 쓴다.
  내 치환은 날 `&` 형태만 찾아서 `&` 가 든 이름 11개는 og 만 안 바뀌었다.
  (라이브에서 69개를 전수로 재서 찾았다. 소셜 공유 미리보기에 뜨는 자리다.)

  `check-category-labels.py` 는 **사본 네 개**(brands/view · products/view ·
  brand-portal · list-your-brand)를 페이지 h1 과 맞춰 보지만, **한 페이지 안의
  다섯 자리**는 아무도 안 봤다. 이 검사가 그 자리를 맡는다.

정본: 그 페이지의 `<h1 data-en data-ko>` (A-407 이 정한 정본).
비교 대상: `<title>` · `og:title` · JSON-LD `name` · 빵부스러기 `span.current`
          · 부모 카테고리 페이지의 카드 `<h3 data-ko>` · `search-index.json` 의 name_ko.
`&` 는 이스케이프 여부와 무관하게 같은 글자로 본다.
"""
import io, json, os, re, sys, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

def norm(s):
    """&amp; 와 & 를 같게 본다. 공백도 한 칸으로."""
    if s is None:
        return None
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()

def pick(pat, s, grp=1):
    m = re.search(pat, s, re.S)
    return m.group(grp) if m else None

# ── 소분류 페이지 모으기 ──
pages = []
for parent in sorted(os.listdir('categories')):
    d = os.path.join('categories', parent)
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if f.endswith('.html'):
            pages.append((parent, f[:-5], os.path.join(d, f)))

# ── 부모 페이지의 카드 이름 ──
cards = {}
for parent in sorted({p for p, _, _ in pages}):
    pp = os.path.join('categories', parent + '.html')
    if not os.path.exists(pp):
        continue
    s = io.open(pp, encoding='utf-8').read()
    for m in re.finditer(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', s, re.S):
        href, inner = m.group(1), m.group(2)
        h3 = re.search(r'<h3[^>]*data-en="([^"]*)"[^>]*data-ko="([^"]*)"', inner)
        if not h3:
            continue
        slug = href.split('/')[-1].replace('.html', '')
        cards[(parent, slug)] = (norm(h3.group(1)), norm(h3.group(2)))

# ── 색인 ──
idx = {}
for o in json.load(io.open('search-index.json', encoding='utf-8')):
    u = o.get('url') or ''
    m = re.match(r'^categories/([^/]+)/([^/]+)\.html$', u)
    if m:
        idx[(m.group(1), m.group(2))] = (norm(o.get('name_en')), norm(o.get('name_ko')))

bad = []
checked = 0

for parent, slug, path in pages:
    s = io.open(path, encoding='utf-8').read()
    h1 = re.search(r'<h1[^>]*data-en="([^"]*)"[^>]*data-ko="([^"]*)"', s)
    if not h1:
        bad.append('%s — 정본으로 쓸 h1[data-en][data-ko] 가 없다' % path)
        continue
    en, ko = norm(h1.group(1)), norm(h1.group(2))
    checked += 1

    seen = {
        # A-507: `<title>` 에 data-en/data-ko 가 붙었다. 속성을 허용하지 않으면
        # 69페이지가 한꺼번에 「title 가 없다」로 떨어진다(실제로 떨어졌다).
        'title':      pick(r'<title[^>]*>(.*?)</title>', s),
        'og:title':   pick(r'<meta\s+property="og:title"\s+content="([^"]*)"', s),
        'JSON-LD name': pick(r'"name"\s*:\s*"([^"]*—[^"]*)"', s),
        '빵부스러기': None,
    }
    cur = re.search(r'<span class="current"[^>]*data-en="([^"]*)"[^>]*data-ko="([^"]*)"', s)

    for label in ('title', 'og:title', 'JSON-LD name'):
        v = norm(seen[label])
        if v is None:
            bad.append('%s — %s 가 없다' % (path, label))
            continue
        # 「<EN> — <KO> | <부모> | ARCHINODE」 꼴
        m = re.match(r'^(.*?)\s*—\s*(.*?)\s*\|', v)
        if not m:
            bad.append('%s — %s 가 「EN — KO |」 꼴이 아니다: %r' % (path, label, v))
            continue
        if norm(m.group(1)) != en or norm(m.group(2)) != ko:
            bad.append('%s — %s 가 어긋난다: %r / %r  (정본 %r / %r)'
                       % (path, label, norm(m.group(1)), norm(m.group(2)), en, ko))

    if not cur:
        bad.append('%s — 빵부스러기 span.current[data-en][data-ko] 가 없다' % path)
    elif (norm(cur.group(1)), norm(cur.group(2))) != (en, ko):
        bad.append('%s — 빵부스러기가 어긋난다: %r / %r  (정본 %r / %r)'
                   % (path, norm(cur.group(1)), norm(cur.group(2)), en, ko))

    c = cards.get((parent, slug))
    if c is None:
        bad.append('%s — 부모 페이지(categories/%s.html)에 이 소분류 카드가 없다' % (path, parent))
    elif c != (en, ko):
        bad.append('%s — 부모 카드가 어긋난다: %r / %r  (정본 %r / %r)'
                   % (path, c[0], c[1], en, ko))

    i = idx.get((parent, slug))
    if i is None:
        bad.append('%s — search-index.json 에 이 소분류가 없다' % path)
    elif i != (en, ko):
        bad.append('%s — 색인이 어긋난다: %r / %r  (정본 %r / %r)'
                   % (path, i[0], i[1], en, ko))

print('검사함  소분류 %d개 × 자리 6개(title · og:title · JSON-LD · 빵부스러기 · 부모 카드 · 색인) = %d자리'
      % (checked, checked * 6))

if bad:
    print('\n어긋난 것 %d건:' % len(bad))
    for b in bad:
        print('  ' + b)
    sys.exit(1)

print('소분류 이름 — 한 페이지 안에서도 어긋난 자리 없음')
