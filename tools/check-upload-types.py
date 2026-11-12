# -*- coding: utf-8 -*-
"""A-484 — 업로드 형식 통제가 풀리지 않았는지.

올린 파일은 토큰 URL 로 손님에게 열린다. 토큰 URL 은 Storage 규칙을 타지 않으므로,
「누가 읽을 수 있나」로는 막을 수 없고 **무엇이 올라오나**로 막아야 한다.

두 경로의 방식이 다르다 — 섞으면 둘 다 깨진다:
  · certifications — 공개 브랜드 페이지의 배지로 **그대로 열려야** 한다 → 형식을 좁게(PDF·사진)
  · products-specs — 볼 일이 없다 → **다운로드 강제**(attachment) + 위험 형식 차단
그리고 제품 사진(products)에는 attachment 를 붙이면 **안 된다**(페이지에 그려져야 한다).
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []
storage = io.open(os.path.join(ROOT, 'storage.rules'), encoding='utf-8').read()
portal = io.open(os.path.join(ROOT, 'brand-portal/dashboard.html'), encoding='utf-8').read()


def block(name):
    m = re.search(r"match\s+/" + re.escape(name) + r"/\{uid\}/\{allPaths=\*\*\}\s*\{(.*?)\n    \}",
                  storage, re.S)
    return m.group(1) if m else None


# ── 규칙: 두 경로의 업로드 조건 ─────────────────────────────────────────────
spec = block('products-specs')
if spec is None:
    errors.append('[규칙] products-specs 블록을 못 찾았다')
else:
    w = re.search(r'allow create,\s*update:(.*?);', spec, re.S)
    w = w.group(1) if w else ''
    if 'isAttachment()' not in w:
        errors.append('[규칙] products-specs 업로드가 isAttachment() 를 요구하지 않는다 — '
                      '형식을 속인 HTML 이 브라우저에서 그대로 렌더된다')
    if 'notRenderable()' not in w:
        errors.append('[규칙] products-specs 업로드에 위험 형식 차단(notRenderable)이 없다')
    if 'underFileLimit()' not in w:
        errors.append('[규칙] products-specs 업로드에 용량 제한이 없다')

cert = block('certifications')
if cert is None:
    errors.append('[규칙] certifications 블록을 못 찾았다')
else:
    w = re.search(r'allow create,\s*update:(.*?);', cert, re.S)
    w = w.group(1) if w else ''
    if 'isCertFile()' not in w:
        errors.append('[규칙] certifications 업로드가 isCertFile() 로 형식을 묶지 않는다 — '
                      '공개 브랜드 페이지 배지로 아무 파일이나 열린다')

for fn, must in [('isCertFile', ['application/pdf', 'jpeg']),
                 ('isAttachment', ['contentDisposition', 'attachment']),
                 ('notRenderable', ['text/html', 'svg'])]:
    m = re.search(r'function\s+' + fn + r'\s*\(\)\s*\{(.*?)\n    \}', storage, re.S)
    if not m:
        errors.append('[규칙] %s() 함수가 없다' % fn)
        continue
    for token in must:
        if token not in m.group(1):
            errors.append('[규칙] %s() 에 "%s" 가 없다 — 조건이 느슨해졌다' % (fn, token))
# SVG 는 인증서로 받으면 안 된다(스크립트가 돈다)
m = re.search(r'function\s+isCertFile\s*\(\)\s*\{(.*?)\n    \}', storage, re.S)
if m and 'svg' in m.group(1):
    errors.append('[규칙] isCertFile() 이 SVG 를 받는다 — SVG 는 스크립트가 돈다')

# ── 클라이언트: attachment 를 붙이는 곳과 붙이면 안 되는 곳 ──────────────────
m = re.search(r'async function uploadFile\(file, folder\)\s*\{(.*?)\n    \}', portal, re.S)
if not m:
    errors.append('[포털] uploadFile(file, folder) 를 못 찾았다 — 탐지가 멈췄다')
else:
    body = m.group(1)
    if 'contentDisposition' not in body or 'attachment' not in body:
        errors.append('[포털] 자료 파일 업로드에 contentDisposition: attachment 가 없다 — '
                      '규칙이 거부해서 **업로드 자체가 막힌다**')
    if "folder === 'products-specs'" not in body:
        errors.append('[포털] attachment 를 폴더로 가르지 않는다 — 제품 사진에까지 붙으면 '
                      '공개 페이지의 그림이 전부 다운로드로 바뀐다')
    if not re.search(r'\.put\(file,\s*\w+\)', body):
        errors.append('[포털] put(file, meta) 로 메타데이터를 넘기지 않는다')

# 인증서: 올리기 전 형식 확인 + accept 가 규칙과 같다
if 'CERT_OK' not in portal:
    errors.append('[포털] 인증서 업로드에 올리기 전 형식 확인(CERT_OK)이 없다 — '
                  '규칙 거부 메시지는 사람이 읽을 수 없다')
m = re.search(r'id="certFile"[^>]*accept="([^"]*)"', portal)
if not m:
    errors.append('[포털] certFile 입력칸에 accept 가 없다')
else:
    acc = m.group(1)
    if 'image/*' in acc or 'svg' in acc:
        errors.append('[포털] certFile 의 accept 가 "%s" 다 — 규칙(PDF·jpeg·png·webp)보다 '
                      '넓으면 손님이 고른 뒤에야 거부당한다' % acc)

if errors:
    print('실패 %d 건:' % len(errors))
    for e in errors:
        print('  x ' + e)
    sys.exit(1)
print('업로드 형식 통제 검사 통과 — 인증서는 좁게, 자료 파일은 다운로드 강제')
