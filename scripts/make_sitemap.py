#!/usr/bin/env python3
"""ARCHINODE sitemap.xml 자동 재생성 스크립트.

전체 HTML 페이지를 스캔해 sitemap.xml로 재생성한다.
- 어드민·인증·브랜드 포털 등 사용자 접근 불가 페이지는 자동 제외
- lastmod는 각 파일의 git commit 최종 수정일 사용 (git 없으면 파일 mtime)
- priority는 페이지 종류별 자동 부여

사용법: python3 scripts/make_sitemap.py
결과: sitemap.xml 덮어쓰기
"""

from __future__ import annotations
import os
import subprocess
from pathlib import Path
from datetime import datetime

BASE_URL = "https://archinodekr.com"
ROOT = Path(__file__).resolve().parent.parent  # 프로젝트 루트

# sitemap 제외 대상
EXCLUDE_DIRS = {
    "archi-diary", "node_modules", ".git", "sales", "docs", "silvia",
    "admin", "auth", "brand-portal", "scripts", "downloads",
}
EXCLUDE_FILES = {
    "404.html", "privacy-en.html",  # 다국어 페이지 중 en 별도 파일
}

# priority 결정
def priority_for(path: Path) -> tuple[float, str]:
    """priority + changefreq 결정."""
    s = str(path)
    name = path.name
    if name == "index.html":
        return 1.0, "weekly"
    if name in ("about.html", "brands.html", "categories.html",
                "magazine.html", "trend-report.html", "for-brands.html",
                "list-your-brand.html", "digital-products.html",
                "request-consultation.html", "contact.html"):
        return 0.9, "weekly"
    if s.startswith("categories/"):
        # 1단계 카테고리
        if len(path.parts) == 2:
            return 0.8, "monthly"
        # 서브카테고리
        return 0.7, "monthly"
    if s.startswith("brands/") or s.startswith("magazine/") or s.startswith("trend-report/"):
        # view.html 같은 라우터는 제외
        if name == "view.html":
            return None, None  # 스킵
        return 0.7, "monthly"
    return 0.5, "monthly"


def get_lastmod(path: Path) -> str:
    """git 커밋 최종 수정일 (없으면 파일 mtime)."""
    try:
        r = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(path)],
            capture_output=True, text=True, cwd=ROOT, timeout=5,
        )
        date = (r.stdout or "").strip()
        if date and len(date) == 10:
            return date
    except Exception:
        pass
    # 폴백: 파일 mtime
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")


def main():
    urls: list[dict] = []
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        # exclude directory
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if rel.name in EXCLUDE_FILES:
            continue
        pr, cf = priority_for(rel)
        if pr is None:
            continue
        urls.append({
            "loc": f"{BASE_URL}/{str(rel).replace(os.sep, '/')}",
            "lastmod": get_lastmod(p),
            "changefreq": cf,
            "priority": pr,
        })

    # 정렬: priority 내림차순, loc 알파벳 오름차순
    urls.sort(key=lambda u: (-u["priority"], u["loc"]))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lines.extend([
            "  <url>",
            f"    <loc>{u['loc']}</loc>",
            f"    <lastmod>{u['lastmod']}</lastmod>",
            f"    <changefreq>{u['changefreq']}</changefreq>",
            f"    <priority>{u['priority']}</priority>",
            "  </url>",
        ])
    lines.append("</urlset>")

    out = ROOT / "sitemap.xml"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"sitemap.xml 재생성 완료")
    print(f"  총 URL: {len(urls)}")
    print(f"  파일: {out}")
    # 카테고리별 분포
    from collections import Counter
    by_prefix = Counter()
    for u in urls:
        prefix = u["loc"].replace(BASE_URL + "/", "").split("/")[0]
        by_prefix[prefix if "/" in u["loc"].replace(BASE_URL + "/", "") else "root"] += 1
    print(f"  분포:")
    for k, v in by_prefix.most_common():
        print(f"    {k:20s} {v}")


if __name__ == "__main__":
    main()
