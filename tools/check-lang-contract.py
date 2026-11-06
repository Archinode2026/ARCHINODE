#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ARCHINODE 언어 규약 검사기 (A-362, 2026-11-06)

왜 있나
  2026-11-06 하루에 같은 부류의 결함이 여섯 번 나왔다
  (A-352 · A-354 · A-355 · A-357 · A-361 · A-363). 사람이 매번 세는 대신
  규약을 코드로 적어 둔다. 표준 라이브러리만 쓰므로 설치할 것이 없다.

      python3 tools/check-lang-contract.py        # 리포 뿌리에서

검사 항목
  [1] 다시 그린 뒤 칠하기            A-347 · A-352 · A-354
      `archinode:lang` 을 듣고 data-en/data-ko 를 단 조각을 innerHTML 로 다시
      박는 화면은, 첫 렌더 뒤와 수신기 안 두 자리에서 `applyLangAgain()` 을
      불러야 한다. lang.js 는 모든 경로가 applyLanguage() → broadcastLang()
      순서라, 신호를 받아 다시 박은 조각은 그 칠하기를 이미 지나쳐 있다.
      ※ index.html 히어로는 넣지 않는다 — data-* 를 거치지 않고 heroData 에서
        언어를 골라 직접 넣으므로 다시 칠할 것이 없다(A-361).
  [2] 안에 든 글                     A-355 · A-357 · A-358
      data-en·data-ko 짝이 있는 요소의 글은 둘 중 하나와 같아야 한다.
      제3의 글이면 칠하기 전 엉뚱한 언어가 보이거나 칠한 뒤 글이 잘려 나간다.
      한국어 기사(magazine*)는 data-ko 기준, 나머지는 data-en 기준.
  [3] 외짝 속성                      A-355
      **접미사마다** 짝이어야 한다 — data-en-placeholder 가 있으면
      data-ko-placeholder 도 있어야 한다. 한쪽만 있으면 그 언어에서 안 바뀐다.
      예외: 카테고리 드롭다운(`nav-dropdown-menu`)은 영어 이름과 한국어 이름을
      늘 나란히 보여 주는 의도된 꼴이라 data-en 단독이 맞다.
  [4] 버전 도장                      A-360
      한 파일의 참조는 사이트 전체에서 같은 도장 하나여야 한다.
      반만 달려 있으면 도장을 올려도 절반만 올라간다.
  [5] lang.js 가 모르는 접미사        A-363
      HTML 이 쓰는 접미사는 lang.js 가 훑는 접미사여야 한다. `-title` 이 이렇게
      빠져 있었다 — 달아 놓고 안 듣는 죽은 속성이었다. 지원 목록은 lang.js 에서
      직접 읽으므로 이 검사가 코드와 어긋날 일이 없다.

끝값: 어긋난 것이 있으면 1, 없으면 0.
"""
import io, os, re, sys, collections
from html.parser import HTMLParser

VOID = {'br','img','input','meta','link','hr','source','area','base',
        'col','embed','param','track','wbr'}
SKIP_DIRS = {'node_modules', '.git'}
SKIP_PARTS = ('backup', 'docs/', '옛사본')

REPAINT_SCREENS = ['brands/view.html', 'magazine/view.html', 'trend-report.html']
STAMPED_ASSETS = ['lang.js', 'search.js', 'articles-lang.js', 'style.css']
# [3] 두 언어를 늘 함께 보여 주는 의도된 자리
BILINGUAL_CONTAINERS = ('nav-dropdown-menu',)
# [2b] 가리개 안의 글이 어긋났을 때, **승리님 규칙에 걸리는 내용이면 실패**로 본다.
# A-365 에서 「가격 노출은 영어에만」·「딜러 얘기는 한국 고객에 노출 금지」로 지운
# 171곳을 가려낸 것과 **같은 패턴**이다 — 기준을 두 벌 만들지 않는다.
SENSITIVE = re.compile(r'[$€₩]\s?[\d,]|\d+\s*(?:만원|원|USD|EUR)|무료|딜러|검증|모니터링|수수료|커미션|스크리닝')


class Walker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.hits = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        anc = (self.stack[-1]['anc'] if self.stack else '') + ' ' + d.get('class', '')
        # 조상이 건 청중 가리개를 물려받는다 — 그 블록은 한 언어에서만 보인다
        gate = d.get('data-lang-only') or (self.stack[-1]['gate'] if self.stack else None)
        if tag in VOID:
            self._keep(tag, d, self.getpos()[0], [], anc, gate)
            return
        self.stack.append({'tag': tag, 'd': d, 'txt': [],
                           'line': self.getpos()[0], 'anc': anc, 'gate': gate})

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                e = self.stack.pop(i)
                for _ in range(len(self.stack) - i):
                    self.stack.pop()
                self._keep(e['tag'], e['d'], e['line'], e['txt'], e['anc'], e['gate'])
                return

    def handle_data(self, data):
        if self.stack:
            self.stack[-1]['txt'].append(data)

    def _keep(self, tag, d, line, txt, anc, gate):
        if not any(k.startswith('data-en') or k.startswith('data-ko') for k in d):
            return
        self.hits.append({'tag': tag, 'line': line, 'inner': ''.join(txt).strip(),
                          'd': d, 'anc': anc, 'gate': gate})


def html_files(root='.'):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
        for fn in sorted(filenames):
            if not fn.endswith('.html'):
                continue
            p = os.path.join(dirpath, fn).replace('\\', '/')
            if p.startswith('./'):
                p = p[2:]
            if any(s in p for s in SKIP_PARTS):
                continue
            yield p


def supported_suffixes():
    """lang.js 가 실제로 훑는 접미사를 lang.js 에서 읽는다 — 손으로 적어 두면 어긋난다."""
    s = io.open('lang.js', encoding='utf-8').read()
    found = set(re.findall(r"'\[data-'\s*\+\s*lang\s*\+\s*'(-[a-z-]+)?\]'", s))
    return {x or '' for x in found}


def suffix_of(key):
    for pre in ('data-en', 'data-ko'):
        if key == pre:
            return ''
        if key.startswith(pre + '-'):
            return key[len(pre):]
    return None


def is_ko_primary(path):
    return path == 'magazine.html' or path.startswith('magazine/')


def is_generated(inner):
    return '${' in inner or '" +' in inner or "' +" in inner


def block_after(s, i):
    depth = 0
    for j in range(i, len(s)):
        if s[j] == '{':
            depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                return s[i:j]
    return ''


def check_repaint(problems):
    for p in REPAINT_SCREENS:
        if not os.path.exists(p):
            problems.append(('[1] 다시그린뒤칠하기', p, 0,
                             '화면이 없다 — REPAINT_SCREENS 목록을 손봐야 한다'))
            continue
        s = io.open(p, encoding='utf-8').read()
        # 실제 **호출 지점**만 센다. 전에는 'applyLangAgain' 글자를 셌는데
        # `typeof window.applyLangAgain === 'function') window.applyLangAgain()` 한 줄에
        # 두 번 나오므로 호출 지점 1곳이 2곳으로 세졌다 — 검사가 통과해 버렸다(A-364).
        calls = [s[:m.start()].count('\n') + 1
                 for m in re.finditer(r'applyLangAgain\s*\(\s*\)', s)]
        m = re.search(r"addEventListener\(\s*'archinode:lang'", s)
        if not m:
            problems.append(('[1] 다시그린뒤칠하기', p, 0,
                             'archinode:lang 수신기가 없다'))
            continue
        brace = s.find('{', m.start())
        blk = block_after(s, brace) if brace != -1 else ''
        lo = s[:brace].count('\n') + 1
        hi = lo + blk.count('\n')
        inside = [c for c in calls if lo <= c <= hi]
        outside = [c for c in calls if not (lo <= c <= hi)]
        if not inside:
            problems.append(('[1] 다시그린뒤칠하기', p, lo,
                             '수신기 안에서 applyLangAgain() 을 부르지 않는다'))
        if not outside:
            problems.append(('[1] 다시그린뒤칠하기', p, 0,
                             '첫 렌더 뒤에 applyLangAgain() 을 부르는 자리가 없다 — 수신기 안에만 있다'))


def check_elements(problems, supported, deferred):
    for p in html_files():
        try:
            w = Walker()
            w.feed(io.open(p, encoding='utf-8', errors='replace').read())
        except Exception as e:
            problems.append(('[0] 파싱', p, 0, '파싱 실패: %s' % e))
            continue
        for h in w.hits:
            d = h['d']
            # [3] 접미사마다 짝
            sufs = collections.defaultdict(set)
            for k in d:
                sfx = suffix_of(k)
                if sfx is None:
                    continue
                sufs[sfx].add('en' if k.startswith('data-en') else 'ko')
            bilingual = any(c in h['anc'] for c in BILINGUAL_CONTAINERS)
            for sfx, langs in sorted(sufs.items()):
                # [5] lang.js 가 모르는 접미사
                if sfx not in supported:
                    problems.append(('[5] 모르는접미사', p, h['line'],
                                     '<%s> data-{en,ko}%s 를 달았는데 lang.js 가 그 접미사를 훑지 않는다 — 안 듣는 속성이다'
                                     % (h['tag'], sfx)))
                    continue
                if len(langs) == 2:
                    continue
                if bilingual and langs == {'en'}:
                    continue    # 의도된 두 언어 병기
                # A-365: data-lang-only 가 걸린 블록은 **그 언어에서만 보인다.**
                # 반대 언어의 속성은 쓰이지 않으므로 없는 것이 맞다 — 오히려 남아 있으면
                # 한국 고객이 받는 HTML 소스에 영어 전용 문구의 번역문이 실린다(A-358).
                if h['gate'] in ('en', 'ko') and langs == {h['gate']}:
                    continue
                missing = 'data-ko%s' % sfx if langs == {'en'} else 'data-en%s' % sfx
                problems.append(('[3] 외짝속성', p, h['line'],
                                 '<%s> %s 가 없다 — 그 언어에서 안 바뀐다'
                                 % (h['tag'], missing)))
            en, ko, inner = d.get('data-en'), d.get('data-ko'), h['inner']

            # [6] A-365: 한 언어에서만 보이는 블록에 **반대 언어의 민감한 글**이 남아 있으면,
            # 화면에는 안 보여도 상대 청중이 받는 HTML 소스에 실려 나간다.
            if h['gate'] in ('en', 'ko'):
                other = ko if h['gate'] == 'en' else en
                if other and SENSITIVE.search(other):
                    problems.append(('[6] 소스에 남은 반대언어', p, h['line'],
                                     '<%s> data-lang-only="%s" 인데 data-%s 에 가격·딜러 얘기가 남아 있다 — %r'
                                     % (h['tag'], h['gate'],
                                        'ko' if h['gate'] == 'en' else 'en', other[:60])))

            # [2b] A-358: 한 언어에서만 보이는 블록은 **보이는 글도 그 언어**여야 한다.
            # 짝이 없어도(A-365 로 반대 언어를 지운 자리) 이 검사는 돌아야 한다 —
            # 처음엔 짝이 있을 때만 봐서 A-358 을 되살려도 안 잡혔다(음성 테스트로 확인).
            if h['gate'] in ('en', 'ko') and inner and not is_generated(inner):
                want = (en if h['gate'] == 'en' else ko)
                if want and want.strip() and inner != want.strip():
                    msg = ('<%s> data-lang-only="%s" 블록인데 보이는 글이 data-%s 가 아니다 — %r'
                           % (h['tag'], h['gate'], h['gate'], inner[:60]))
                    if SENSITIVE.search(inner) or SENSITIVE.search(want):
                        problems.append(('[2] 안에든글', p, h['line'], msg))
                    else:
                        # 칠하기 전 한순간의 깜빡임이고 내용이 민감하지 않다.
                        # 「자재 소싱 문의」 링크처럼 사이트 전체에 퍼진 묵은 자리라
                        # 세어서 알리기만 한다 — A-368 참고.
                        deferred.append((p, h['line'], msg))

            # [2] 안에 든 글 — 짝이 둘 다 있을 때만 의미가 있다
            if en is None or ko is None or not inner:
                continue
            if not en.strip() or not ko.strip():
                continue
            if is_generated(inner):
                continue
            if inner != en.strip() and inner != ko.strip():
                problems.append(('[2] 안에든글', p, h['line'],
                                 '<%s> 안에 든 글이 data-en 도 data-ko 도 아니다 — %r'
                                 % (h['tag'], inner[:60])))
                continue


def check_stamps(problems):
    seen = {a: collections.Counter() for a in STAMPED_ASSETS}
    for p in html_files():
        s = io.open(p, encoding='utf-8', errors='replace').read()
        for a in STAMPED_ASSETS:
            for q in re.findall(r'(?<=["/])' + re.escape(a) + r'(\?v=[0-9a-z]+)?(?=")', s):
                seen[a][q or '(도장없음)'] += 1
    notes = []
    for a in STAMPED_ASSETS:
        if len(seen[a]) > 1:
            problems.append(('[4] 버전도장', a, 0,
                             '참조가 여러 도장으로 갈라져 있다 — %s. 도장을 올려도 일부만 올라간다'
                             % dict(seen[a])))
        elif seen[a] and list(seen[a]) == ['(도장없음)']:
            # 브론즈 13차: 갈라짐만 보면 **전부 빠진 것**은 통과한다.
            # style.css 가 그 꼴이다. 승리님이 캐시 전략을 「지금은 넘어간다」로
            # 정하셨으므로(A-360) 실패로 세지 않고 보류로 알린다.
            notes.append('%s — 참조 %d곳 전부 도장이 없다(ETag 재검증에 의존). 캐시 전략 결정 보류 중, A-360 참고'
                         % (a, sum(seen[a].values())))
    return notes


def main():
    if not os.path.exists('lang.js'):
        print('리포 뿌리에서 실행해라 (lang.js 가 보이는 곳).', file=sys.stderr)
        return 2
    supported = supported_suffixes()
    if not supported:
        print('lang.js 에서 지원 접미사를 읽지 못했다 — 검사기를 손봐야 한다.', file=sys.stderr)
        return 2
    problems = []
    check_repaint(problems)
    deferred = []
    check_elements(problems, supported, deferred)
    notes = check_stamps(problems) or []

    print('lang.js 가 훑는 접미사: %s'
          % ', '.join(sorted(x or '(없음)' for x in supported)))
    for n in notes:
        print('보류  %s' % n)
    if deferred:
        print('보류  가리개 안에서 보이는 글이 그 언어가 아닌 자리 %d곳 / %d파일 — '
              '칠하기 전 한순간만 보이고 내용은 민감하지 않다(대부분 「자재 소싱 문의」 링크). '
              '쓸지 말지는 결정 대기, A-368 참고'
              % (len(deferred), len(set(x[0] for x in deferred))))
    if not problems:
        print('언어 규약 검사 — 어긋난 것 없음 (검사 6종)')
        return 0
    by = collections.Counter(x[0] for x in problems)
    print('언어 규약 검사 — 어긋난 것 %d건' % len(problems))
    for k, v in sorted(by.items()):
        print('   %-22s %d' % (k, v))
    print()
    for kind, path, line, msg in problems[:200]:
        print('%s %s%s' % (kind, path, (':%d' % line) if line else ''))
        print('    %s' % msg)
    if len(problems) > 200:
        print('... 그리고 %d건 더' % (len(problems) - 200))
    return 1


if __name__ == '__main__':
    sys.exit(main())
