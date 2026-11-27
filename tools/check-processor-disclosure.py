#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/check-processor-disclosure.py — A-730

**개인정보를 받는 제3자가 처리방침 명단에 있는가.**

2026-11-26 브론즈 60차가 찾았다: 처리방침이 메일 발송 수탁자를
「Google LLC (Gmail SMTP)」로 적고 있었는데 **그 경로는 쓴 적이 없다.**
A-139 실측은 `smtps://resend@smtp.resend.com:465` 였다. 두 방향의 거짓말이
있었다 — 아무것도 안 받는 Gmail 이 명단에 있고, 실제로 받는 Resend 는 없었다.
명단에 없는 수탁자는 **손님이 거부권을 행사할 수도 없다**(제28조의8).

어디서 어긋났나: 2026-11-02 설치 **계획안**은 Gmail 이었는데 실제 설치가 Resend 로
갔고 그 문서가 안 따라왔다. A-500 이 계획을 사실로 읽어 방침에 심었고,
A-721(같은 날)이 **바로 그 목록에** GA4 한 줄을 더하면서도 이 줄은 다시 안 봤다.

## 묻는 것 셋 — **양방향**

① **저장소가 실제로 부르는 바깥 호스트**가 전부 방침에 올라 있는가 (전수, 코드에서 긁는다)
   — 모르는 호스트가 새로 생기면 **사람이 판단하라고 울린다.** 조용히 들어오지 못하게.

② **스위치가 달린 로더**가 켜졌는데 방침에 없지는 않은가
   — `analytics-loader.js` 의 `GA_ID`, `sentry-loader.js` 의 `DSN`.
   A-721 이 GA4 에서 겪은 그대로다: **방침에 없는 것을 먼저 켜면 그게 위반이다.**
   `sentry-loader.js` 는 지금 꺼져 있지만 231쪽이 싣고 있고 파일 자신이
   「한울님이 채워야 함」이라고 적어 두었다 — 채우는 날 아무도 방침을 안 본다.

③ **방침에 적힌 이름이 실제로 쓰이는가** (역방향, A-731 에서 더함)
   — A-730 은 커밋 메시지에 「**두 방향의 거짓말**」이라고 적었는데 자동화한 것은
     한 방향뿐이었다. 그래서 브론즈 61차가 **고친 날 두 줄 아래**에서 같은 종류를
     또 찾았다: `Stripe, Inc.` 가 수탁자·국외이전에 적혀 있는데 코드에 **Stripe 로
     나가는 경로가 0곳**이고, 2026-05-14 일지는 「한국 사업자는 Stripe 가입 불가」를
     적고 결제를 페이팔+Toss 로 바꿨다고 기록한다.
   — 과잉 고지라 덜 위험해 보이지만, **거부권(제28조의8)의 대상을 틀리게 알려 주는 것**이라
     방향이 다르다. 손님은 안 가는 곳에 대해 거부권을 행사하고, 실제로 가는 곳은 못 막는다.

## 안 보는 것
- 주석 안의 주소. ★ HTML 은 `<script>` 안에서만 JS 주석을 걷는다(A-728 의 `image/*` 덫).
  `lang.js` 가 뺀 `api.country.is` 가 주석에만 남아 있는데, 안 걷으면 살아 있다고 잘못 센다.
- 우리 도메인(`archinode*`)과 상대 경로.
"""
from __future__ import annotations
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'docs', 'tools', 'scripts', 'assets',
             'backup', 'archi-diary', 'sales', 'silvia', '옛사본-2026-04'}
POLICIES = ['privacy.html', 'privacy-en.html']

# 바깥 호스트 → 방침에 **반드시 있어야 하는 글자**(국문·영문 공통으로 찾는다)
HOST_OWNER = {
    'fonts.googleapis.com':    'Google Fonts',
    'fonts.gstatic.com':       'Google Fonts',
    'www.gstatic.com':         'Firebase',
    'www.google.com':          'reCAPTCHA',
    'www.googletagmanager.com': 'Google Analytics',
    'formspree.io':            'Formspree',
    'browser.sentry-cdn.com':  None,   # 스위치로 따로 본다(지금은 안 불린다)
}

# 스위치가 달린 로더: (파일, 켜짐 판정 정규식, 방침에 있어야 하는 글자, 사람이 읽을 이름)
SWITCHES = [
    ('analytics-loader.js', re.compile(r"var\s+GA_ID\s*=\s*['\"]G-[\w-]+['\"]"),
     'Google Analytics', 'GA4 측정'),
    ('sentry-loader.js', re.compile(r"var\s+DSN\s*=\s*['\"]https?://"),
     'Sentry', 'Sentry 오류 트래킹'),
]

# ③ **인프라 수탁자** — 코드에서 긁을 수 없는 것. 메일 발송처는 Firebase 확장 설정에
#    있고 저장소에는 호스트 호출이 없다. 그래서 여기에 **근거와 함께** 적고, 방침 양쪽에
#    그 글자가 있는지 센다. ★ 손으로 쓴 명부는 낡는다(A-696·A-700·A-709b·A-715) —
#    그래서 근거를 같이 적는다: 바꾼 사람이 근거부터 보게 하려고.
INFRA = [
    ('Plus Five Five',
     '안내·알림 메일 발송(Resend). 근거: 검수대장 A-139 실측 — '
     '`SMTP smtps://resend@smtp.resend.com:465, FROM noreply@archinodekr.com`. '
     '법인명은 Resend 기업 약관에서 확인(「Plus Five Five, Inc.」, Resend 는 서비스 이름). '
     '메일 발송처를 바꾸면 **이 줄과 방침 양쪽을 같이** 고쳐야 한다'),
]

# 방침 표에 적혀 있어도 **코드 호출이 없는 것이 맞는** 항목. 까닭을 함께 적는다.
POLICY_EXEMPT = {
    'ARCHINODE 입점 브랜드 및 제조사(유럽 등 해외 소재)':
        '업체가 아니라 **입점 브랜드 전체**를 가리키는 항목이다(A-724). 호스트가 있을 수 없다',
    'Brands and manufacturers listed on ARCHINODE (located in Europe and elsewhere)':
        '위 항목의 영문판',
    'Google LLC':
        '국외이전 표의 **총괄 항목** — Firebase(인증·보관·Cloud Functions)가 사이트의 바탕이다. '
        '세부 서비스는 같은 표에 따로 적혀 있고, 호스트는 www.gstatic.com 으로 잡힌다',
    'Netlify, Inc.':
        '호스팅. 사이트 자체가 그 위에서 돌므로 코드에 호출이 없는 것이 맞다 — 근거: netlify.toml',
    'PayPal Holdings, Inc.':
        '디지털 상품 결제. 결제 주소는 상품 데이터(`DP_PRODUCTS[].payUrl`)에 들어가고 '
        '지금 상품이 0개라 코드에 호스트가 없다. `digital-products.html` 의 `dpPayUrl()` 이 '
        'paypal.com 만 허용하는 것이 쓰는 증거다',
}

# 방침의 수탁·국외이전 구역 (이 안의 <strong>이름:</strong> 만 본다)
POLICY_SECTIONS = {
    'privacy.html':    ('제6조의2 (개인정보 처리업무의 위탁)', '제7조 (이용자의 권리)'),
    'privacy-en.html': ('6A. Entrustment', '7. Rights of Data Subjects'),
}
NAME_IN_TABLE = re.compile(r'<strong>([^<]{2,70}?):\s*</strong>')

CALL = re.compile(
    r'(?:src|action)\s*=\s*["\']https?://([A-Za-z0-9.-]+)'
    r'|fetch\(\s*["\']https?://([A-Za-z0-9.-]+)'
    r'|rel=["\'](?:preconnect|stylesheet|dns-prefetch)["\'][^>]*href=["\']https?://([A-Za-z0-9.-]+)')


def strip_comments(src: str, is_html: bool) -> str:
    if is_html:
        s = re.sub(r'<!--[\s\S]*?-->', ' ', src)

        def inner(m):
            b = re.sub(r'/\*[\s\S]*?\*/', ' ', m.group(2))
            b = re.sub(r'(?m)^\s*//.*$', ' ', b)
            return m.group(1) + b + m.group(3)
        return re.sub(r'(<script\b[^>]*>)([\s\S]*?)(</script\s*>)', inner, s)
    s = re.sub(r'/\*[\s\S]*?\*/', ' ', src)
    return re.sub(r'(?m)^\s*//.*$', ' ', s)


def policy_texts():
    out = {}
    for p in POLICIES:
        raw = io.open(os.path.join(ROOT, p), encoding='utf-8').read()
        out[p] = re.sub(r'<!--[\s\S]*?-->', ' ', raw)   # 주석에 적어 둔 것은 고지가 아니다
    return out


def main() -> int:
    pol = policy_texts()
    hosts = {}
    nfile = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if not f.endswith(('.html', '.js')):
                continue
            rel = os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/')
            try:
                src = io.open(os.path.join(dp, f), encoding='utf-8').read()
            except Exception:
                continue
            nfile += 1
            for m in CALL.finditer(strip_comments(src, rel.endswith('.html'))):
                h = m.group(1) or m.group(2) or m.group(3)
                if h and 'archinode' not in h:
                    hosts.setdefault(h, set()).add(rel)

    print('제3자 고지 — 쪽 %d개에서 바깥 호출 %d종을 긁었다' % (nfile, len(hosts)))

    bad = []
    for h in sorted(hosts):
        if h not in HOST_OWNER:
            bad.append(('모르는 호스트', h,
                        '방침에 올릴 처리자인지 **사람이 판단해야 한다**. 쓰는 쪽 %d개: %s'
                        % (len(hosts[h]), ', '.join(sorted(hosts[h])[:3]))))
            continue
        owner = HOST_OWNER[h]
        if owner is None:
            continue
        miss = [p for p in POLICIES if owner not in pol[p]]
        if miss:
            bad.append(('고지 누락', '%s → 「%s」' % (h, owner),
                        '없는 방침: %s' % ', '.join(miss)))
        else:
            print('  · %-26s → 「%s」 양쪽 방침에 있음' % (h, owner))

    for owner, why in INFRA:
        miss = [p for p in POLICIES if owner not in pol[p]]
        if miss:
            bad.append(('인프라 수탁자 고지 누락', owner, '없는 방침: %s — %s' % (', '.join(miss), why)))
        else:
            print('  · %-26s 양쪽 방침에 있음 (인프라 — 코드에 호출 없음)' % owner)

    for fname, on_re, owner, label in SWITCHES:
        fp = os.path.join(ROOT, fname)
        if not os.path.exists(fp):
            continue
        body = strip_comments(io.open(fp, encoding='utf-8').read(), False)
        on = bool(on_re.search(body))
        miss = [p for p in POLICIES if owner not in pol[p]]
        if on and miss:
            bad.append(('켰는데 고지 없음', '%s (%s)' % (label, fname),
                        '없는 방침: %s — **방침에 없는 것을 먼저 켜면 그게 위반이다**(A-721)'
                        % ', '.join(miss)))
        elif on:
            print('  · %-26s 켜짐 · 양쪽 방침에 「%s」 있음' % (label, owner))
        else:
            print('  · %-26s 꺼짐 — 켜는 날 방침 %s 에 「%s」를 먼저 올려야 한다'
                  % (label, '둘 다' if len(miss) == 2 else '쪽', owner))

    # ③ 역방향 — 방침에 적힌 이름이 실제로 쓰이는가
    known_names = set(POLICY_EXEMPT) | {o for o in HOST_OWNER.values() if o} | {o for o, _ in INFRA} \
                  | {o for _, _, o, _ in SWITCHES}
    for pol_file, (start, end) in POLICY_SECTIONS.items():
        try:
            raw = io.open(os.path.join(ROOT, pol_file), encoding='utf-8').read()
            body = re.sub(r'<!--[\s\S]*?-->', ' ', raw)
            i, j = body.index(start), body.index(end, body.index(start))
        except (OSError, ValueError):
            continue
        for name in dict.fromkeys(NAME_IN_TABLE.findall(body[i:j])):
            if name in POLICY_EXEMPT:
                continue
            if any(k in name for k in known_names):
                continue
            bad.append(('방침에만 있고 쓰지 않음', '%s (%s)' % (name, pol_file),
                        '코드에도 인프라 목록에도 근거가 없다. **안 가는 곳에 거부권을 알리면 '
                        '손님은 거부권의 대상을 틀리게 안다**(제28조의8). 안 쓰면 방침에서 빼고, '
                        '쓰는데 코드에 안 보이면 `POLICY_EXEMPT` 에 **까닭과 함께** 적어라'))

    if bad:
        print('')
        print('  ✗ 어긋남 %d건' % len(bad))
        for kind, what, why in bad:
            print('     [%s] %s' % (kind, what))
            print('        %s' % why)
        print('')
        print('  길 셋: ① 방침 **국문·영문 양쪽**에 올린다 ② 안 쓰면 호출을 뺀다'
              ' ③ 고지가 필요 없는 호스트면 `HOST_OWNER` 에 **까닭과 함께** None 으로 적는다')
        return 1

    print('결과: 통과 — 부르는 제3자와 고지한 제3자가 맞는다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
