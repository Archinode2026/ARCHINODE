#!/usr/bin/env python3
"""ARCHINODE search-index.json 자동 재생성 스크립트.

사이트 내 검색 색인을 재생성한다.
포함 대상: 카테고리, 서브카테고리, 브랜드, 매거진 글, 트렌드 리포트 글, 주요 랜딩 페이지
스키마: {type, name_en, name_ko, desc_en, desc_ko, url}

사용법: python3 scripts/make_search_index.py
결과: search-index.json 덮어쓰기
"""

from __future__ import annotations
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {"archi-diary", "node_modules", ".git", "sales", "docs", "silvia",
                "admin", "auth", "brand-portal", "scripts", "downloads"}


def extract_title_desc(html: str) -> tuple[str, str, str, str]:
    """페이지에서 name_en, name_ko, desc_en, desc_ko 추출."""
    # <title> or <h1> data-en/data-ko
    name_en = ""
    name_ko = ""
    # h1 data-en/ko
    m = re.search(r'<h1[^>]*data-en\s*=\s*["\']([^"\']+)["\'][^>]*data-ko\s*=\s*["\']([^"\']+)["\']', html)
    if m:
        name_en, name_ko = m.group(1), m.group(2)
    else:
        # article-hero span.tag (매거진 글 전용)
        m = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
        if m:
            name_ko = m.group(1).strip()
            name_en = name_ko

    if not name_en:
        # <title>
        m = re.search(r'<title[^>]*>([^<]+)</title>', html)
        if m:
            title = m.group(1).strip()
            # "제목 | ARCHINODE ..." 형식에서 앞부분만
            name_ko = title.split("|")[0].strip()
            name_en = name_ko

    # 메타 description
    desc_en = ""
    desc_ko = ""
    m = re.search(r'<meta[^>]*name\s*=\s*["\']description["\'][^>]*content\s*=\s*["\']([^"\']+)["\']', html)
    if m:
        desc_ko = m.group(1).strip()
        desc_en = desc_ko

    # subtitle / lead / og:description 폴백
    if not desc_en:
        m = re.search(r'<meta[^>]*property\s*=\s*["\']og:description["\'][^>]*content\s*=\s*["\']([^"\']+)["\']', html)
        if m:
            desc_ko = m.group(1).strip()
            desc_en = desc_ko

    # data-en/data-ko subtitle
    m = re.search(r'<p[^>]*class="[^"]*(?:subtitle|lead)[^"]*"[^>]*data-en\s*=\s*["\']([^"\']+)["\'][^>]*data-ko\s*=\s*["\']([^"\']+)["\']', html)
    if m:
        desc_en = m.group(1).strip()
        desc_ko = m.group(2).strip()

    return name_en, name_ko, desc_en, desc_ko


def process_file(path: Path, relpath: str) -> dict | None:
    """HTML 파일에서 색인 항목 생성."""
    try:
        html = path.read_text(encoding="utf-8")
    except Exception:
        return None

    # 유형 결정
    if relpath.startswith("categories/") and relpath.count("/") == 1:
        typ = "category"
    elif relpath.startswith("categories/") and relpath.count("/") == 2:
        typ = "subcategory"
    elif relpath.startswith("brands/") and path.name != "view.html":
        typ = "brand"
    elif relpath.startswith("magazine/") and path.name != "view.html":
        typ = "article"
    elif relpath.startswith("trend-report/") and path.name != "view.html":
        typ = "trend-report"
    elif path.name in ("index.html", "about.html", "for-brands.html", "brands.html",
                        "magazine.html", "trend-report.html", "digital-products.html",
                        "request-consultation.html", "contact.html", "list-your-brand.html"):
        typ = "page"
    else:
        return None

    name_en, name_ko, desc_en, desc_ko = extract_title_desc(html)

    # 값 검증
    if not name_en and not name_ko:
        return None

    return {
        "type": typ,
        "name_en": name_en or name_ko,
        "name_ko": name_ko or name_en,
        "desc_en": desc_en or "",
        "desc_ko": desc_ko or "",
        "url": relpath.replace(os.sep, "/"),
    }


def main():
    items = []
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        item = process_file(p, str(rel))
        if item:
            items.append(item)

    # 정렬: type → url
    type_order = {"page": 0, "category": 1, "subcategory": 2, "brand": 3,
                  "article": 4, "trend-report": 5}
    items.sort(key=lambda x: (type_order.get(x["type"], 9), x["url"]))

    out = ROOT / "search-index.json"
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"search-index.json 재생성 완료")
    print(f"  총 항목: {len(items)}")

    from collections import Counter
    by_type = Counter(x["type"] for x in items)
    print(f"  타입별:")
    for t, n in by_type.most_common():
        print(f"    {t:15s} {n}")


if __name__ == "__main__":
    main()
