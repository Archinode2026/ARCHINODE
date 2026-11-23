#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-668 — check-css-classes.py 를 **모형 디렉터리**로 검증한다.

진짜 저장소를 깨서 재면 248쪽을 복사해야 하고, 되돌리다 멈추면 수정을 날린다
(A-481·A-483 에서 두 번 그랬다). 그래서 작은 모형을 세우고 거기서 깬다.
검사기는 ARCHINODE_ROOT 를 받으므로 모형을 가리키면 그대로 돈다.
"""
import os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, 'check-css-classes.py')

ran = fails = 0
def expect(label, root, want_code, want_in=None, want_not_in=None):
    global ran, fails
    ran += 1
    env = dict(os.environ); env['ARCHINODE_ROOT'] = root
    r = subprocess.run([sys.executable, CHECKER], capture_output=True, text=True, env=env)
    bad = []
    if r.returncode != want_code:
        bad.append('종료코드 %d (바란 것 %d)' % (r.returncode, want_code))
    if want_in and want_in not in r.stdout:
        bad.append('나와야 할 글자 없음: ' + want_in)
    if want_not_in and want_not_in in r.stdout:
        bad.append('나오면 안 되는 글자 나옴: ' + want_not_in)
    if bad:
        fails += 1
        print('   ✗ ' + label)
        for b in bad: print('       ' + b)
        print('       ---- 검사기가 찍은 것 ----')
        for ln in r.stdout.strip().split('\n')[-8:]: print('       ' + ln)
    else:
        print('   · ' + label)

def fixture(css='', html='', js=''):
    d = tempfile.mkdtemp(prefix='cssfix-')
    with open(os.path.join(d, 'site.css'), 'w', encoding='utf-8') as f: f.write(css)
    with open(os.path.join(d, 'page.html'), 'w', encoding='utf-8') as f: f.write(html)
    with open(os.path.join(d, 'app.js'), 'w', encoding='utf-8') as f: f.write(js)
    return d

TRASH = []
def F(**kw):
    d = fixture(**kw); TRASH.append(d); return d

print('── ① 깨끗한 모형은 조용해야 한다')
expect('정의가 다 있으면 통과', F(
    css='.box { color: red; }\n.lab { color: blue; }\n',
    html='<div class="box"><span class="lab">x</span></div>\n'),
    0, want_in='없음')

print('\n── ② 지어낸 클래스를 잡는다 (adm-btn 사건의 모양)')
expect('정의 없는 클래스를 잡는다', F(
    css='.box { color: red; }\n',
    html='<div class="box"><button class="adm-btn">x</button></div>\n'),
    1, want_in='.adm-btn')

print('\n── ③ 주석으로 막아 둔 CSS 는 정의가 아니다')
expect('막아 둔 규칙은 안 센다', F(
    css='.box { color: red; }\n/* .lab { color: blue; } */\n',
    html='<div class="box"><span class="lab">x</span></div>\n'),
    1, want_in='.lab')

print('\n── ④ 덫: 주석 **안에만** 적힌 이름은 쓰임이 아니다 (조용해야 한다)')
expect('HTML 주석 안의 이름은 안 센다', F(
    css='.box { color: red; }\n',
    html='<!-- 전에 class="ghost-class" 라고 썼다가 지웠다 -->\n<div class="box">x</div>\n'),
    0, want_not_in='.ghost-class')
expect('CSS 주석 안의 이름도 안 센다', F(
    css='/* .ghost-class 는 .box 로 바꿨다 */\n.box { color: red; }\n',
    html='<div class="box">x</div>\n'),
    0, want_not_in='ghost-class')

print('\n── ⑤ 인라인 style 로 꾸미는 자리는 빼고 센다 (si-promise 사건)')
expect('인라인 style 이 있으면 안 잡는다', F(
    css='.box { color: red; }\n',
    html='<section class="inline-styled" style="padding:44px 0;">x</section>\n<div class="box">y</div>\n'),
    0, want_not_in='.inline-styled')

print('\n── ⑥ JS 손잡이는 빼고 센다 (hp-newsletter 사건)')
expect('querySelector 로 찾는 이름은 안 잡는다', F(
    css='.box { color: red; }\n',
    html='<div class="box"><input class="hp-field"></div>\n',
    js="var hp = form.querySelector('.hp-field');\n"),
    0, want_not_in='.hp-field')

print('\n── ⑦ JS 가 문자열로 주입하는 CSS 도 정의다 (has-cookie-banner 사건)')
expect('주입 CSS 를 정의로 읽는다', F(
    css='.box { color: red; }\n',
    html='<html class="has-banner"><div class="box">x</div></html>\n',
    js="st.textContent = 'html.has-banner .box{bottom:4px;}';\n"),
    0, want_not_in='.has-banner')
expect('주입 CSS 가 없으면 잡는다', F(
    css='.box { color: red; }\n',
    html='<html class="has-banner"><div class="box">x</div></html>\n',
    js="/* 주입하던 줄을 지웠다 */\n"),
    1, want_in='.has-banner')

print('\n── ⑧ 이어붙여 만드는 이름은 셀 수 없다')
expect('끝이 하이픈인 이름은 안 잡는다', F(
    css='.box { color: red; }\n',
    html='<div class="box">x</div>\n',
    js="el.innerHTML = '<p class=\"toc-item-' + n + '\">x</p>';\n"),
    0, want_not_in='toc-item-')

for d in TRASH:
    shutil.rmtree(d, ignore_errors=True)

print('')
if fails:
    print('실패: %d건 / %d건 중' % (fails, ran)); sys.exit(1)
print('통과: %d건 전부' % ran)
