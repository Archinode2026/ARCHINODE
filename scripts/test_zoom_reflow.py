#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`scripts/check_zoom_reflow.py` 의 음성·양성 시험 (A-686).

이 검사기는 **거짓 실패를 16쪽에서 내고 있었다.** 굴림 전후를 교집합하는
코드가 이랬다:

    if k in still:
        it1['ctrlsOut'] = [x for x in it1['ctrlsOut'] if x in still[k]]

굴린 뒤 **아무것도 안 막히면 PROBE 는 그 요소를 아예 안 담는다.** 그래서
`k` 가 `still` 에 없고, 코드는 그것을 「정보가 없다」로 읽어 **굴리기 전의
막힌 목록을 그대로 남겼다.** 뜻은 정반대였다 — 없다는 것은 「막힌 것이
하나도 없다」는 뜻이다. 그 바람에 동의 고지의 「Privacy Policy」 링크가
16쪽에서 「어느 굴림 위치에서도 안 닿는다」로 보고됐다. 실제로는 배너를
안에서 굴리면 9점 전부 닿는다(427x341 실측).

**진짜 저장소를 안 건드린다** — 임시 폴더에 가짜 쪽 셋을 써서 그것만 잰다.

시험 셋:
  ① 범위 안에서 진짜로 막힌 단추 → 반드시 실패해야 한다 (입을 막지 않았는지)
  ② 굴리면 닿는 단추 → 반드시 통과해야 한다 (거짓 실패가 돌아왔는지)
  ③ `overflow:hidden` 그릇에 잘려 영영 안 보이는 글 → 반드시 실패해야 한다
     (A-683 의 꼴. 첫 쪽 대표 문구가 그렇게 사라져 있었는데 검사 62개가
      전부 통과시켰다)
"""
import io
import os
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, 'check_zoom_reflow.py')

HARD = """<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>hard</title>
<style>body{margin:0;height:3000px}
 .bar{position:fixed;left:0;right:0;bottom:0;height:120px;background:#eee;z-index:9}
 .btn{position:absolute;left:20px;top:40px;width:160px;height:44px}
 .cover{position:absolute;inset:0;background:rgba(0,0,0,.2);z-index:5}
</style></head><body>
<div class="bar"><button class="btn">영영 못 누름</button><div class="cover"></div></div>
</body></html>"""

SOFT = """<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>soft</title>
<style>body{margin:0;height:3000px}
 .bar{position:fixed;left:0;right:0;bottom:0;height:120px;overflow-y:auto;background:#eee;z-index:9}
 .tall{height:400px;position:relative}
 .btn{position:absolute;left:20px;top:330px;width:160px;height:44px}
 .cover{position:absolute;left:0;right:0;top:0;height:300px;background:#ccc;z-index:5}
</style></head><body>
<div class="bar"><div class="tall"><div class="cover"></div><button class="btn">굴리면 닿음</button></div></div>
</body></html>"""

# A-683 과 같은 꼴: 100vh 상자에 그보다 큰 내용을 아래로 붙이고 overflow:hidden.
# 위로 넘친 글은 잘리고, 쪽을 굴려도 자름선이 상자에 붙어 다니므로 안 돌아온다.
CLIP = """<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>clip</title>
<style>body{margin:0;height:3000px}
 .hero{position:relative;height:100vh;min-height:100vh;overflow:hidden;
       display:flex;align-items:flex-end}
 .inner{height:520px}
</style></head><body>
<section class="hero"><div class="inner">
  <p>영영 잘려 안 보이는 윗동입니다 — 굴려도 안 돌아옵니다</p>
  <p>두 번째 줄</p><p>세 번째 줄</p><p>네 번째 줄</p><p>다섯 번째 줄</p>
  <p>여섯 번째 줄</p><p>일곱 번째 줄</p><p>여덟 번째 줄</p>
</div></section>
</body></html>"""


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def main():
    bad = []
    with tempfile.TemporaryDirectory() as d:
        for name, body in (('hard.html', HARD), ('soft.html', SOFT), ('clip.html', CLIP)):
            with io.open(os.path.join(d, name), 'w', encoding='utf-8') as f:
                f.write(body)
        port = free_port()
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)],
                               cwd=d, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(1.5)
            base = 'http://127.0.0.1:%d' % port

            def run(page):
                r = subprocess.run([sys.executable, '-I', CHECKER, base, page],
                                   capture_output=True, text=True, timeout=240)
                return r.returncode, (r.stdout or '') + (r.stderr or '')

            cases = [
                ('① 진짜 막힌 단추', 'hard.html', True, '영영 못 누름'),
                ('② 굴리면 닿는 단추', 'soft.html', False, None),
                ('③ 잘려서 안 보이는 글', 'clip.html', True, None),
            ]
            for label, page, want_fail, must_say in cases:
                code, out = run(page)
                got_fail = (code != 0)
                if got_fail != want_fail:
                    bad.append('%s — %s 를 기대했는데 %s\n        %s'
                               % (label, '실패' if want_fail else '통과',
                                  '실패' if got_fail else '통과',
                                  out.strip().replace('\n', '\n        ')))
                elif must_say and must_say not in out:
                    bad.append('%s — 실패는 맞는데 메시지에 「%s」 가 없다\n        %s'
                               % (label, must_say, out.strip().replace('\n', '\n        ')))
        finally:
            srv.terminate()
            try:
                srv.wait(timeout=10)
            except Exception:
                srv.kill()

    if bad:
        print('확대 넘침 검사기 시험 — %d건 어긋남' % len(bad))
        for x in bad:
            print('  - ' + x)
        print('결과: 실패')
        return 1
    print('확대 넘침 검사기 시험 — 3가지 모두 뜻대로')
    print('  ① 진짜 막힌 단추를 잡는다 (고침이 입을 막지 않았다)')
    print('  ② 굴리면 닿는 단추는 조용하다 (A-686 의 거짓 실패가 안 돌아왔다)')
    print('  ③ 잘려서 안 보이는 글을 잡는다 (A-683 의 꼴)')
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
