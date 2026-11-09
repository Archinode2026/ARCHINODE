#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ARCHINODE 사진 크기 만들기 (A-379, 2026-11-09)

`tools/fetch-photos.ps1` 이 받아 둔 `assets/photos/<id>-1800.jpg` 원본에서,
**HTML 이 실제로 가리키는 크기만** 만든다. 가리키지 않는 파생 파일은 지운다.
원본(-1800)은 지우지 않는다 — 지우면 다음에 스크립트가 전부 다시 받는다.
(그 일이 2026-11-09 에 실제로 있었다: 내가 원본을 지워서 92장을 다시 받게 했다.)

    python3 tools/make-photo-sizes.py          # 리포 뿌리에서
"""
import io, os, re, sys, collections
from PIL import Image, ImageOps

D = 'assets/photos'

def used_paths():
    """HTML 이 가리키는 assets/photos/* 파일 이름을 모은다."""
    want = set()
    for root, ds, fs in os.walk('.'):
        ds[:] = [d for d in ds if d not in ('node_modules', '.git')]
        for fn in sorted(fs):
            if not fn.endswith('.html'):
                continue
            p = os.path.join(root, fn).replace('\\', '/')
            if 'backup' in p or '/docs/' in p:
                continue
            s = io.open(p, encoding='utf-8', errors='replace').read()
            for m in re.findall(r'assets/photos/([A-Za-z0-9._-]+\.jpg)', s):
                want.add(m)
    return want

def main():
    if not os.path.isdir(D):
        print('%s 가 없다.' % D, file=sys.stderr); return 2
    want = used_paths()
    have = {f for f in os.listdir(D) if f.endswith('.jpg')}
    masters = {f for f in have if f.endswith('-1800.jpg')}

    made = collections.Counter(); total = collections.Counter(); missing_master = []
    for f in sorted(want - have):
        m = re.match(r'(photo-[a-z0-9-]+)-(\d+)\.jpg$', f)
        if not m:
            missing_master.append(f); continue
        pid, size = m.group(1), m.group(2)
        src = os.path.join(D, pid + '-1800.jpg')
        if not os.path.exists(src):
            missing_master.append(f); continue
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        if size == '240':
            g = ImageOps.fit(im, (240, 240), Image.LANCZOS, centering=(0.5, 0.5))
        else:
            w = int(size)
            g = im.copy() if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        out = os.path.join(D, f)
        g.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
        made[size] += 1; total[size] += os.path.getsize(out)

    # 아무도 안 가리키는 파생 파일은 지운다 (원본은 남긴다)
    orphan = sorted((have | set(want)) - want - masters)
    removed = 0
    for f in orphan:
        q = os.path.join(D, f)
        if os.path.exists(q):
            os.remove(q); removed += 1

    kept = sorted(f for f in os.listdir(D) if f.endswith('.jpg') and not f.endswith('-1800.jpg'))
    size_kept = sum(os.path.getsize(os.path.join(D, f)) for f in kept)
    print('HTML 이 가리키는 파일: %d' % len(want))
    for s in sorted(made):
        print('  새로 만든 %-5s %3d장  %5.1f MB' % (s, made[s], total[s] / 1048576))
    print('  지운 파생 파일: %d' % removed)
    print('  커밋할 파생 파일: %d장  %.1f MB' % (len(kept), size_kept / 1048576))
    print('  원본(-1800, git 제외): %d장' % len(masters))
    if missing_master:
        print('  ★ 원본이 없어 못 만든 것: %s' % missing_master, file=sys.stderr)
        return 1
    bad = sorted(want - set(os.listdir(D)))
    if bad:
        print('  ★ 가리키는데 없는 파일: %s' % bad, file=sys.stderr)
        return 1
    print('  가리키는 파일이 전부 있다.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
