#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-540 — 개인정보를 받는 폼마다 고지·동의가 서 있는지.

왜 있나
-------
2026-11-14 브론즈 38차가 네 가지를 한꺼번에 찾았는데, **검사 36개가 하나도
잡지 못했다.**
  · A-535  동의가 `required` 하나에만 기대고 있었다. 자바스크립트는 그 칸을
           한 번도 읽지 않았고, contact.html 은 제출 처리기가 아예 없었다.
  · A-535  동의한 사실이 아무 데도 남지 않았다 — 칸만 세우고 결과를 버렸다.
  · A-537  고지도 동의도 없이 개인정보를 받던 폼이 넷 더 있었다.
  · A-539  처리방침이 실제 받는 항목과 달랐다.
폼은 늘어나는데 고지는 따라오지 않는다. 그래서 **폼을 세는** 검사를 둔다.

무엇을 보는가
-------------
개인정보를 받는 폼 하나하나에 대해:
  1. 수집 고지 블록(`form-consent`)이 있다
  2. 동의 체크박스가 있고 `required` 다
  3. **자바스크립트가 그 체크박스를 읽는다** — `required` 는 손님의 실수를
     막는 장치이지 보증이 아니다. 속성 하나가 없어지면 그대로 통과한다.
  4. 고지에 수집 항목·목적·보유 기간 세 가지가 다 있다
  5. 고지가 **두 언어**다(영어로 보는 손님에게도 읽혀야 한다, A-526)
  6. 거부할 권리를 적어 두었다
  7. 개인정보 처리방침으로 가는 링크가 있고, 영어에서는 영문판으로 가며,
     **그 주소가 실제로 있는 파일을 가리킨다**. A-547(브론즈 39차): 글자만 보던
     이 검사가 통과하는 동안 서브폴더 쪽의 링크 셋이 404 였다 — 손님이 무엇에
     동의하는지 보려고 누르는 바로 그 링크였다. 같은 파일 푸터의 ../privacy.html
     은 멀쩡해서 눈으로는 티가 안 났다.
그리고 동의 사실을 남기는지 — 저장하는 폼은 문서에, Formspree 로 보내는
폼은 체크박스의 `name` 으로.

명부
----
아래 FORMS 가 **이 저장소에서 개인정보를 받는 폼 전부**다. 새 폼을 만들면
여기 적어야 한다. 적지 않으면 이 검사는 그 폼을 보지 않는다 — 그러니
명부에 적힌 폼이 실제로 그 파일에 있는지도 함께 본다(사라졌으면 실패).

    python3 tools/check-form-consent.py
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (파일, 체크박스 id, 동의를 남기는 꼴)
#   'doc'       — 저장 문서에 privacyConsent 를 담는다
#   'formspree' — 체크박스에 name 을 줘서 함께 전송한다
FORMS = [
    ('contact.html',               'agreePrivacyContact',    'formspree'),
    ('sourcing-inquiry.html',      'agreePrivacySourcing',   'doc'),
    ('request-consultation.html',  'agreePrivacyConsult',    'doc'),
    ('brands/view.html',           'agreePrivacyRfqBrand',   'doc'),
    ('products/view.html',         'agreePrivacyRfqProduct', 'doc'),
    ('products/view.html',         'agreePrivacyBim',        'doc'),
    ('list-your-brand.html',       'agreePrivacyLyb',        'doc'),
]

# 고지에 반드시 있어야 하는 세 가지 (라벨, 한국어 꼴, 영어 꼴)
PARTS = [
    ('수집 항목', '수집 항목:', 'What we collect:'),
    ('수집 목적', '수집 목적:', 'Why:'),
    ('보유 기간', '보유 기간:', 'How long:'),
]


def strip_comments(s):
    """주석을 줄 수를 지키며 지운다. 주석에 적어 둔 말이 검사에 걸리면
    「있다」고 잘못 읽는다 — 같은 함정을 여러 번 겪었다(A-492·A-531)."""
    s = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'(?m)^[^\n\'"]*?//[^\n]*$', lambda m: '', s)
    return s


def consent_block(s, cid):
    """체크박스를 감싸는 form-consent 블록의 글자를 돌려준다. 없으면 None."""
    i = s.find('id="%s"' % cid)
    if i < 0:
        return None
    start = s.rfind('<div class="form-consent"', 0, i)
    if start < 0:
        return None
    end = s.find('</div>', s.find('form-consent-note', start))
    if end < 0:
        end = i + 2000
    return s[start:end]


def main() -> int:
    bad = []
    seen = 0

    for rel, cid, how in FORMS:
        path = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.exists(path):
            bad.append((rel, cid, '파일이 없다 — 명부를 고쳐라'))
            continue
        raw = open(path, encoding='utf-8').read()
        s = strip_comments(raw)
        seen += 1

        if 'id="%s"' % cid not in s:
            bad.append((rel, cid, '이 체크박스가 없다 — 폼이 사라졌으면 명부에서 지워라'))
            continue

        # ② required
        m = re.search(r'<input[^>]*id="%s"[^>]*>' % re.escape(cid), s)
        tag = m.group(0) if m else ''
        if 'required' not in tag:
            bad.append((rel, cid, '동의 칸에 required 가 없다'))

        # ③ 자바스크립트가 읽는가 — 여기가 A-535 의 핵심
        if ("getElementById('%s')" % cid) not in s and ('getElementById("%s")' % cid) not in s:
            bad.append((rel, cid, '자바스크립트가 이 칸을 읽지 않는다 — required 가 '
                                  '없어지면 동의 없이 통과한다'))

        # ④⑤ 고지 블록과 세 가지, 두 언어
        blk = consent_block(s, cid)
        if blk is None:
            bad.append((rel, cid, '수집 고지 블록(form-consent)이 없다'))
        else:
            for label, ko, en in PARTS:
                if ko not in blk:
                    bad.append((rel, cid, '고지에 %s 가 없다' % label))
                elif en not in blk:
                    bad.append((rel, cid, '%s 가 한국어로만 있다 — 영어로 보는 손님은 '
                                          '못 읽는다' % label))
            # ⑥ 거부할 권리
            if 'form-consent-note' not in blk:
                bad.append((rel, cid, '거부할 권리 안내가 없다'))
            # ⑦ 처리방침 링크 — 영어에서는 영문판으로, 그리고 **실제로 있는 곳**으로
            if 'privacy.html' not in blk:
                bad.append((rel, cid, '고지에 개인정보 처리방침 링크가 없다'))
            elif 'privacy-en.html' not in blk:
                bad.append((rel, cid, '영어 화면에서도 한국어 처리방침으로 간다 — '
                                      'data-en-href 가 없다'))
            else:
                base = os.path.dirname(rel)
                for attr in ('href', 'data-en-href', 'data-ko-href'):
                    for m in re.finditer(r'\b%s="([^"]*)"' % re.escape(attr), blk):
                        url = m.group(1)
                        if url.startswith(('http://', 'https://', '#', 'mailto:', 'tel:')):
                            continue
                        # <base href="/"> 를 쓰는 쪽은 뿌리에서 푼다
                        if '<base' in s and re.search(r'<base[^>]*href="/"', s):
                            target = url.lstrip('/')
                        else:
                            target = os.path.normpath(os.path.join(base, url))
                        if not os.path.exists(os.path.join(ROOT, target.replace('/', os.sep))):
                            bad.append((rel, cid,
                                        '%s="%s" 가 없는 곳을 가리킨다 — 동의하기 전에 '
                                        '무엇에 동의하는지 보려는 손님이 404 를 맞는다'
                                        % (attr, url)))

        # ⑧ 동의한 사실을 남기는가
        if how == 'formspree':
            if 'name=' not in tag:
                bad.append((rel, cid, 'Formspree 로 보내는데 체크박스에 name 이 없다 — '
                                      '동의가 전송되지 않는다(받아 놓고 버린다)'))
        else:
            if 'privacyConsent' not in s:
                bad.append((rel, cid, '저장 문서에 privacyConsent 를 담지 않는다 — '
                                      '동의한 사실이 남지 않는다'))

    # 허수 방지 — 명부가 비거나 줄어들면 검사가 멈춘 것이다
    if seen < len(FORMS):
        bad.append(('(검사 자체)', '', '폼 %d개만 봤다 — 명부에는 %d개가 있다'
                    % (seen, len(FORMS))))

    if bad:
        print('어긋남 %d건' % len(bad))
        for rel, cid, why in bad[:40]:
            print('  · %-26s %-24s %s' % (rel, cid, why))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        print()
        print('  개인정보를 받는 자리에는 ㄱ)무엇을 왜 얼마나 받는지 ㄴ)동의 ㄷ)동의한 사실의 기록')
        print('  셋이 다 있어야 한다. 새 폼을 만들었으면 tools/check-form-consent.py 의 FORMS 에 적어라.')
        return 1

    print('폼 동의 — 개인정보를 받는 폼 %d개, 고지·동의·기록 모두 있음' % seen)
    return 0


if __name__ == '__main__':
    sys.exit(main())
