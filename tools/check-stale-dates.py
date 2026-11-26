#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check-stale-dates.py — A-727

**박아 둔 기한은 아무도 안 보는 사이에 늙는다.**

2026-11-26 하루에 같은 종류를 둘 찾았다:
  · `admin/js/view-settings.js` 의 `freeUntil: '2026-12-31'` — 모든 브랜드가 나눠 쓰는
    전역 무료 종료일. 5주 뒤였고 그날 전원이 한꺼번에 유료가 되는 구조였다 (A-726)
  · `digital-products.html` 의 「Coming H2 2026」 — og:title·meta·배너·배지·빈 상태·
    알림 문구 **여섯 자리**. 그 쪽은 233쪽 메뉴에 걸려 있고 사이트맵에도 있다 (A-727)

둘 다 쓸 때는 맞는 말이었다. 날짜를 적는 순간 「그날 누가 고치러 와야 한다」는 빚이
생기는데 그 빚을 기억하는 장치가 없었다. 검사 74개 중 **날짜가 늙는 것을 보는 것이
0개**였다.

## 묻는 질문 — 「약속한 날이 지났는가」

**지나간 날짜가 전부 거짓말은 아니다.** 「최종 수정일 2026-11-03」은 영원히 맞는 말이고,
「2026-05-13 삭제」 같은 기록도 안 늙는다. 늙는 것은 **앞날을 약속한 날짜**뿐이다.

그래서 두 가지만 본다:

  ① **손님에게 보이는 글** 안에서, 날짜가 **약속하는 말**과 같은 문장에 있을 때
     (출시·예정·까지·오픈·마감·무료 / coming·launch·until·through·by·soon·available)
  ② **설정값의 열쇠 이름이 기한**일 때 (`freeUntil`·`deadline`·`expiresAt`…)
     값이 날짜꼴이면 — 이쪽은 약속하는 말이 없어도 그 자체가 기한이다

## 안 보는 것 (첫 판이 30건을 잘못 울려서 좁혔다)

- **주석** — 까닭을 적은 글이 검사를 울리면 안 된다. ★ 걷을 때 **줄 수를 지킨다**:
  첫 판에 주석을 공백 하나로 바꿔 선번호가 전부 어긋났다
- **`magazine/`·`magazine.html`** — 기사가 그 시기를 **다루는** 것이지 약속이 아니다
- **`<script>`·`<style>` 안의 글** — 약속은 손님에게 보이는 자리에 있다 (설정값은 ②로 본다)
- **약속하는 말이 없는 날짜** — 「최종 수정일」·「설립 2026년 4월」 같은 기록
"""
from __future__ import annotations
import io, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARN_DAYS = 60

SKIP_DIRS = {'.git', 'node_modules', 'docs', 'tools', 'scripts', 'assets',
             'backup', 'archi-diary', 'sales', 'silvia', '옛사본-2026-04'}
SKIP_PATHS = {'magazine.html'}
SKIP_PREFIX = ('magazine/', 'trend-report/')

# 앞날을 약속하는 말. 이 말과 **같은 문장**에 날짜가 있어야 운다.
PROMISE = re.compile(
    r'(coming|launch|launching|will\s+(?:be|open|start|go)|available\s+from|'
    r'until|through|by\s+(?:the\s+)?(?:end|mid)|starts?|begins?|opens?|'
    r'deadline|expires?|valid\s+(?:until|through)|free\s+(?:until|through)|soon)'
    r'|(출시|예정|오픈|마감|까지\s*무료|무료\s*기간|시작(?:됩니다|합니다|예정)|'
    r'공개\s*예정|종료\s*예정|신청\s*마감)',
    re.I)

# 열쇠 이름 자체가 기한인 설정값
DEADLINE_KEY = re.compile(
    r'\b([A-Za-z_]*(?:freeUntil|validUntil|expiresAt|expiryDate|deadline|'
    r'endsAt|endDate|closesAt|cutoff|launchDate|releaseDate)[A-Za-z_]*)\s*:\s*'
    r'[\'"]((?:20\d{2})[-/.]\d{1,2}[-/.]\d{1,2})[\'"]', re.I)

KNOWN: dict[str, str] = {}
TODAY = datetime.date.today()
MONTHS = {m: i + 1 for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june',
     'july', 'august', 'september', 'october', 'november', 'december'])}


def blank_keep_lines(src: str, pattern: str) -> str:
    """주석을 지우되 **줄 수를 지킨다** — 선번호가 어긋나면 사람이 못 찾아간다."""
    def f(m):
        return re.sub(r'[^\n]', ' ', m.group(0))
    return re.sub(pattern, f, src)


def visible_only(src: str) -> str:
    """손님에게 보이는 자리만 남긴다. script·style 속은 지운다(줄은 지킨다)."""
    s = blank_keep_lines(src, r'<!--[\s\S]*?-->')
    s = blank_keep_lines(s, r'/\*[\s\S]*?\*/')
    s = blank_keep_lines(s, r'(?m)^\s*//.*$')
    s = blank_keep_lines(s, r'<script\b[^>]*>[\s\S]*?</script\s*>')
    s = blank_keep_lines(s, r'<style\b[^>]*>[\s\S]*?</style\s*>')
    return s


def end_of(y, m=None, d=None, half=None, q=None) -> datetime.date:
    """그 표현이 가리키는 기간의 **마지막 날**. 그날이 지나야 거짓이 된다."""
    if d and m:
        return datetime.date(y, m, d)
    if q:
        m2 = q * 3
        return datetime.date(y, m2, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m2 - 1])
    if half:
        return datetime.date(y, 6, 30) if half == 1 else datetime.date(y, 12, 31)
    if m:
        nxt = datetime.date(y + (m == 12), (m % 12) + 1, 1)
        return nxt - datetime.timedelta(days=1)
    return datetime.date(y, 12, 31)


DATE_PATS = [
    (re.compile(r'\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b'),
     lambda m: end_of(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
    (re.compile(r'\bH([12])\s*(20\d{2})\b', re.I),
     lambda m: end_of(int(m.group(2)), half=int(m.group(1)))),
    (re.compile(r'(20\d{2})\s*년?\s*(상|하)반기'),
     lambda m: end_of(int(m.group(1)), half=1 if m.group(2) == '상' else 2)),
    (re.compile(r'\bQ([1-4])\s*(20\d{2})\b', re.I),
     lambda m: end_of(int(m.group(2)), q=int(m.group(1)))),
    (re.compile(r'(20\d{2})\s*년\s*(\d{1,2})\s*월'),
     lambda m: end_of(int(m.group(1)), int(m.group(2)))),
    (re.compile(r'\b(' + '|'.join(MONTHS) + r')\s+(20\d{2})\b', re.I),
     lambda m: end_of(int(m.group(2)), MONTHS[m.group(1).lower()])),
]


def dates_in(text: str):
    for pat, to_end in DATE_PATS:
        for m in pat.finditer(text):
            try:
                yield m.group(0), to_end(m), m.start()
            except ValueError:
                pass


# 문장 단위로 자른다 — 약속하는 말과 날짜가 **같은 문장**에 있어야 한다
SENT = re.compile(r'[^.!?。\n<>]{0,400}')


def scan_copy(rel: str, src: str):
    """① 보이는 글: 약속하는 말과 날짜가 같은 문장에 있을 때"""
    vis = visible_only(src)
    out = []
    for m in SENT.finditer(vis):
        chunk = m.group(0)
        if not chunk.strip() or not PROMISE.search(chunk):
            continue
        for frag, end, off in dates_in(chunk):
            line = vis.count('\n', 0, m.start() + off) + 1
            out.append((rel, line, frag, end, chunk.strip()[:90]))
    return out


def scan_config(rel: str, src: str):
    """② 열쇠 이름이 기한인 설정값"""
    code = blank_keep_lines(src, r'/\*[\s\S]*?\*/')
    code = blank_keep_lines(code, r'(?m)^\s*//.*$')
    code = blank_keep_lines(code, r'<!--[\s\S]*?-->')
    out = []
    for m in DEADLINE_KEY.finditer(code):
        key, val = m.group(1), m.group(2)
        parts = re.split(r'[-/.]', val)
        try:
            end = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
        except ValueError:
            continue
        out.append((rel, code.count('\n', 0, m.start()) + 1, val, end, key + ' (설정값)'))
    return out


def main() -> int:
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(('.html', '.js')):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, '/')
            if rel in SKIP_PATHS or rel.startswith(SKIP_PREFIX):
                continue
            files.append(rel)
    files.sort()

    hits = []
    for rel in files:
        try:
            src = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
        except Exception:
            continue
        hits += scan_copy(rel, src)
        hits += scan_config(rel, src)

    seen, uniq = set(), []
    for h in hits:
        k = (h[0], h[2], h[3])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(h)

    expired, soon, known_hits = [], [], []
    for h in uniq:
        left = (h[3] - TODAY).days
        if left > WARN_DAYS:
            continue
        (known_hits if h[0] in KNOWN else (expired if left < 0 else soon)).append((h, left))

    print('박아 둔 기한 — 쪽 %d개의 **보이는 글과 기한 설정값**을 봤다 (오늘 %s · %d일 안이면 알린다)'
          % (len(files), TODAY.isoformat(), WARN_DAYS))

    for (rel, line, frag, end, ctx), left in known_hits:
        print('  · 아는 자리 %s:%d 「%s」 — %s' % (rel, line, frag, KNOWN[rel]))

    if expired:
        print('')
        print('  ✗ **약속한 날이 지났다** — 지금 화면이 거짓말을 하고 있다')
        for (rel, line, frag, end, ctx), left in expired:
            print('     %s:%d  「%s」 → %s 에 끝났다 (%d일 지남)' % (rel, line, frag, end, -left))
            print('        %s' % ctx)
    if soon:
        print('')
        print('  ! **곧 지난다** — 그날 고치러 올 사람이 정해져 있나')
        for (rel, line, frag, end, ctx), left in soon:
            print('     %s:%d  「%s」 → %s 까지 (%d일 남음)' % (rel, line, frag, end, left))
            print('        %s' % ctx)

    if expired or soon:
        print('')
        print('  길 셋: ① 약속을 지킨다 ② 글에서 날짜를 뺀다 ③ 정당하면 KNOWN 에 **까닭과 함께** 적는다')
        return 1

    print('결과: 통과 — 지났거나 곧 지날 약속이 보이는 글·기한 설정값에 없다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
