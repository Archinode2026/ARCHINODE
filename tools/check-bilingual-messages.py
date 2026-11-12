# -*- coding: utf-8 -*-
"""A-492 — 손님에게 보이는 안내가 영어로만 나오지 않는지 (공개 페이지).

이 사이트는 한국 시장을 보고 만든다. 그런데 **막히는 순간에 나오는 문장**들이
영어로만 박혀 있었다 — 입점 신청의 오류 7개, 비밀번호 재설정 8개, 문의 폼 3개.
읽을 수 없는 안내는 안내가 아니다.

고칠 때 삼항(`lang === 'en' ? … : …`)으로만 고르면 **A-222 의 함정**에 빠진다:
그 문장이 심기는 시점이 `lang.js` 가 `documentElement.lang` 을 세우기 전일 수 있고,
손님이 나중에 한/영 토글을 눌러도 이미 박힌 글자는 안 바뀐다.
그래서 `data-en`/`data-ko` 를 **함께** 달아야 한다.

이 검사가 보는 것:
  1) 공개 페이지에서 `textContent = '영문만'` 꼴로 손님용 문장을 심는 자리
  2) 그 자리를 대신하는 도우미(lybSay·rpSay·rfqSay)가 실제로 쓰이고 있는지(빈 검사 방지)
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 어드민·포털·도구는 뺀다(운영자 화면이고 t(en,ko) 관례가 따로 있다)
SKIP_DIRS = {'node_modules', '.git', 'admin', 'tools', 'scripts', 'docs', 'backup',
             'brand-portal', '옛사본-2026-04', 'archi-diary', 'sales', 'silvia'}
HANGUL = re.compile(r'[가-힣]')
ASSIGN = re.compile(r"\.(?:textContent|innerText)\s*=\s*\(?\s*'([^']{15,})'")
HELPERS = ['lybSay(', 'rpSay(', 'rfqSay(']
errors = []
found = []


def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)


for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
    for f in sorted(files):
        if not f.endswith(('.html', '.js')):
            continue
        p = os.path.join(base, f)
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        src = strip_comments(io.open(p, encoding='utf-8', errors='replace').read())
        for m in ASSIGN.finditer(src):
            txt = m.group(1)
            if HANGUL.search(txt):
                continue                      # 한국어가 들어 있으면 이중언어 처리된 것
            if '{' in txt or '}' in txt or txt.startswith('.'):
                continue                      # CSS·선택자 문자열
            if not re.search(r'[A-Za-z]{3}.*\s.*[A-Za-z]', txt):
                continue                      # 문장이 아니다(값·코드)
            line = src[:m.start()].count('\n') + 1
            found.append((rel, line, txt[:80]))

for rel, line, txt in found:
    errors.append('[영어만] %s:%d — 손님용 안내가 영어로만 심긴다\n        %s' % (rel, line, txt))

# 빈 검사 방지 — 도우미가 실제로 쓰이고 있어야 한다
used = 0
for rel in ['list-your-brand.html', 'auth/reset-password.html', 'brands/view.html',
            'products/view.html', 'sourcing-inquiry.html']:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        errors.append('[목록] %s 가 없다' % rel)
        continue
    s = io.open(p, encoding='utf-8').read()
    n = sum(s.count(h) for h in HELPERS)
    if n == 0:
        errors.append('[되돌림] %s 에서 이중언어 도우미가 사라졌다 — 영어로 되돌아갔을 수 있다' % rel)
    used += n
if used < 20:
    errors.append('[자기검사] 이중언어 도우미 호출이 %d곳이다(정의 5 + 호출 17 = 22 안팎이어야 한다). '
                  '탐지가 멈췄는지 보라' % used)

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('공개 페이지 안내문 이중언어 검사 통과 — 도우미 호출 %d곳, 영어만 남은 문장 0건' % used)
