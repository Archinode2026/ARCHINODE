#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`scripts/check_badge_shadow.py` 의 음성·양성 시험 (A-687).

진짜 저장소를 안 건드린다 — 임시 폴더의 가짜 쪽으로만 잰다.

왜 가짜 쪽인가: 지금 사이트는 **이미 고쳐져 있어서**(A-558 이 꼬리말 끝에
여백을 뒀다) 진짜 쪽으로는 양성을 만들 수 없다. A-558 의 여백만 되돌려도
법적 링크 아래에 다른 여백 210px 이 남아 재현되지 않았다. **고쳐진 저장소로는
검사기가 일하는지 증명할 수 없다** — 그래서 깨진 세상을 따로 만든다.

여섯 가지:
  ① 쪽 맨 아래 **오른쪽** 링크 → 잡아야 한다 (A-558 의 꼴)
  ② 쪽 맨 아래 **왼쪽** 링크 → 조용해야 한다 (가로로 비켜 있다)
  ③ 맨 아래에서 **63px 넘게 띄운** 오른쪽 링크 → 조용해야 한다 (고친 꼴)
  ④ 맨 아래에서 **40px 만 띄운** 오른쪽 링크 → 잡아야 한다 (덜 띄운 꼴)
  ⑤ 배지와 겹치는 **고정** 단추 → 잡아야 한다 (A-446 의 「맨 위로」 꼴)
  ⑥ 배지 위로 올라간 고정 단추 → 조용해야 한다 (고친 꼴)
"""
import io
import os
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, 'check_badge_shadow.py')

HEAD = ('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">'
        '<title>%s</title><style>body{margin:0}.pad{height:2000px}'
        '.row{display:flex;justify-content:%s;padding:0 20px %dpx}'
        '.fx{position:fixed;right:%dpx;bottom:%dpx;width:44px;height:44px}'
        '</style></head><body>')

def page(title, justify='flex-end', bottom=0, fixed=None):
    s = HEAD % (title, justify, bottom, 0, 0)
    s += '<div class="pad"></div><div class="row"><a href="/x.html">개인정보 처리방침</a></div>'
    if fixed is not None:
        s += '<button class="fx" style="bottom:%dpx" aria-label="맨 위로">↑</button>' % fixed
    return s + '</body></html>'


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    return port


CASES = [
    ('① 맨 아래 오른쪽 링크', page('c1', 'flex-end', 0), True),
    ('② 맨 아래 왼쪽 링크', page('c2', 'flex-start', 0), False),
    ('③ 63px 넘게 띄운 오른쪽 링크', page('c3', 'flex-end', 96), False),
    ('④ 40px 만 띄운 오른쪽 링크', page('c4', 'flex-end', 40), True),
    ('⑤ 배지와 겹치는 고정 단추', page('c5', 'flex-start', 96, fixed=10), True),
    ('⑥ 배지 위로 올라간 고정 단추', page('c6', 'flex-start', 96, fixed=84), False),
]


def main():
    bad = []
    with tempfile.TemporaryDirectory() as d:
        names = []
        for i, (label, html, want_fail) in enumerate(CASES):
            n = 'c%d.html' % (i + 1)
            with io.open(os.path.join(d, n), 'w', encoding='utf-8') as f:
                f.write(html)
            names.append(n)
        port = free_port()
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)], cwd=d,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(1.5)
            base = 'http://127.0.0.1:%d' % port
            for (label, html, want_fail), n in zip(CASES, names):
                r = subprocess.run([sys.executable, '-I', CHECKER, base, n],
                                   capture_output=True, text=True, timeout=240)
                out = (r.stdout or '') + (r.stderr or '')
                got_fail = (r.returncode != 0)
                if got_fail != want_fail:
                    bad.append('%s — %s 를 기대했는데 %s\n        %s'
                               % (label, '실패' if want_fail else '통과',
                                  '실패' if got_fail else '통과',
                                  out.strip().replace('\n', '\n        ')))
        finally:
            srv.terminate()
            try:
                srv.wait(timeout=10)
            except Exception:
                srv.kill()

    if bad:
        print('배지 그늘 검사기 시험 — %d건 어긋남' % len(bad))
        for x in bad:
            print('  - ' + x)
        print('결과: 실패')
        return 1
    print('배지 그늘 검사기 시험 — 6가지 모두 뜻대로')
    print('  맨 아래 오른쪽은 잡고 · 왼쪽은 조용하고 · 넉넉히 띄우면 조용하고')
    print('  덜 띄우면 잡고 · 겹치는 고정 단추는 잡고 · 올라간 것은 조용하다')
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
