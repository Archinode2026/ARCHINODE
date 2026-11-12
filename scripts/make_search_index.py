#!/usr/bin/env python3
"""ARCHINODE search-index.json 자동 재생성 스크립트.

사이트 내 검색 색인을 재생성한다.
포함 대상: 카테고리, 서브카테고리, 브랜드, 매거진 글, 트렌드 리포트 글, 주요 랜딩 페이지
스키마: {type, name_en, name_ko, desc_en, desc_ko, url}

사용법: python3 scripts/make_search_index.py
결과: search-index.json 덮어쓰기
"""

from __future__ import annotations
import html as html_mod
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {"archi-diary", "node_modules", ".git", "sales", "docs", "silvia",
                "admin", "auth", "brand-portal", "scripts", "downloads"}


STRIP_TAGS = re.compile(r"<[^>]+>")
# 속성값 안에 `>` 가 들어 있는 태그가 있다 — for-brands 의 히어로는
# `data-en-html="… <em>Korea's USD 48B</em> …"` 이라 `[^>]*` 로는 **첫 `<em>` 에서
# 잘린다**. 그러면 두 언어 값이 둘 다 안 잡히고 제목 폴백으로 떨어진다(실측).
# 따옴표 안은 통째로 건너뛰는 꼴로 받는다.
TAG_ATTRS = r'((?:"[^"]*"|\'[^\']*\'|[^>])*)'
H1_RE = re.compile(r"<h1" + TAG_ATTRS + r">(.*?)</h1>", re.S)
TITLE_RE = re.compile(r"<title" + TAG_ATTRS + r">")


def _attr(attrs: str, name: str) -> str:
    m = re.search(r'%s\s*=\s*"([^"]*)"' % re.escape(name), attrs)
    if not m:
        m = re.search(r"%s\s*=\s*'([^']*)'" % re.escape(name), attrs)
    return m.group(1) if m else ""


def h1_bilingual(html: str) -> tuple[str, str]:
    """A-508: h1 에서 두 언어 이름을 뽑는다. 세 가지 모양을 전부 본다.

    전에는 `data-en` **다음에** `data-ko` 가 오는 한 가지 모양만 봤다. 그래서
      · 속성 차례가 뒤집힌 h1
      · `data-en-html` 을 쓰는 h1 (for-brands 의 히어로)
      · 토막 span 으로 갈라 쓴 h1 (list-your-brand: 「List Your Brand on」 +
        ARCHINODE + 「에 브랜드를 등록하세요」)
    셋이 전부 빠져나갔고, 그 쪽은 제목 폴백으로 떨어져 **두 언어 칸에 같은
    영어가 들어갔다**(브론즈 34차 N34-8).
    """
    m = H1_RE.search(html)
    if not m:
        return "", ""
    attrs, inner = m.group(1), m.group(2)
    en = _attr(attrs, "data-en") or STRIP_TAGS.sub("", _attr(attrs, "data-en-html"))
    ko = _attr(attrs, "data-ko") or STRIP_TAGS.sub("", _attr(attrs, "data-ko-html"))
    if en and ko:
        return en.strip(), ko.strip()
    # 토막 span 을 이어 붙인다 — 속성이 있으면 그 언어 값을, 없으면 글자 그대로
    pen = []
    pko = []
    pos = 0
    found_attr = False
    for sm in re.finditer(r"<span([^>]*)>(.*?)</span>", inner, re.S):
        plain = STRIP_TAGS.sub("", inner[pos:sm.start()])
        if plain.strip():
            pen.append(plain)
            pko.append(plain)
        sa, stext = sm.group(1), STRIP_TAGS.sub("", sm.group(2))
        sen = _attr(sa, "data-en")
        sko = _attr(sa, "data-ko")
        if sen or sko:
            found_attr = True
            pen.append(sen)
            pko.append(sko)
        else:
            pen.append(stext)
            pko.append(stext)
        pos = sm.end()
    tail = STRIP_TAGS.sub("", inner[pos:])
    if tail.strip():
        pen.append(tail)
        pko.append(tail)
    if found_attr:
        a = re.sub(r"\s+", " ", "".join(pen)).strip()
        b = re.sub(r"\s+", " ", "".join(pko)).strip()
        if a and b:
            return a, b
    return "", ""


def title_bilingual(html: str) -> tuple[str, str]:
    """A-507 이 220쪽의 `<title>` 에 달아 둔 두 언어 값을 쓴다.

    제목은 「이름 | 부모 | ARCHINODE」 꼴이라 **첫 토막**만 쓴다. 한국어 쪽이
    「English — 한국어」로 적혀 있으면 영어 머리를 떼어 한국어만 남긴다 —
    색인의 한국어 이름 칸에 영어가 섞이지 않게.
    """
    m = TITLE_RE.search(html)
    if not m:
        return "", ""
    attrs = m.group(1)
    en = html_mod.unescape(_attr(attrs, "data-en")).split("|")[0].strip()
    ko = html_mod.unescape(_attr(attrs, "data-ko")).split("|")[0].strip()
    if en and ko and ko.startswith(en + " — "):
        ko = ko[len(en) + 3:].strip()
    return en, ko


def extract_title_desc(html: str) -> tuple[str, str, str, str]:
    """페이지에서 name_en, name_ko, desc_en, desc_ko 추출."""
    name_en, name_ko = h1_bilingual(html)
    if not (name_en and name_ko):
        name_en, name_ko = title_bilingual(html)
    if not (name_en and name_ko):
        name_en = name_ko = ""
    if name_en and name_ko:
        pass
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

    # ── A-401(2026-11-09): 히어로 설명문을 두 언어로 가져온다 ──────────────────
    # 위의 메타 description 갈래는 **한 값을 두 언어에 똑같이 넣는다**
    # (`desc_ko = desc_en = meta`). 그래서 220개 중 `desc_en == desc_ko` 가 89개,
    # **`desc_ko` 에 한글이 없는 것이 82개**였다(브론즈 19차 실측). A-397 로 검색이
    # 살아나자마자 한국어 결과 설명 82개가 영어로 보이는 자리다.
    #
    # 카테고리·서브카테고리 페이지에는 `<h1 data-en data-ko>` 바로 뒤에
    # **두 언어 설명 `<p>`** 가 있다(A-381 이 354곳을 번역해 둔 그것). class 가
    # 없어서 위의 subtitle/lead 규칙에 안 걸렸다. 그래서 **h1 뒤를 본다** —
    # 범위를 1,500자로 묶어 푸터·입점 CTA 의 두 언어 문단을 집지 않게 한다.
    #
    # 매거진 기사 130편은 한국어 본문이라 그대로 둔다 — 설명이 한국어인 것이
    # 맞고, 영어 화면에서도 「Korean Articles」라고 이름부터 알리고 있다(A-348).
    # `data-en-html` 도 받는다 — 홈의 히어로 제목이 `<h1 data-en-html="Launch Korea.<br>...">`
    # 라서 `data-en` 만 보면 안 걸렸다.
    h1m = re.search(r'<h1[^>]*data-en(?:-html)?\s*=\s*["\'][^"\']+["\'][^>]*>', html)
    if h1m:
        window = html[h1m.end():h1m.end() + 1500]
        pm = re.search(r'<p[^>]*data-en\s*=\s*["\']([^"\']{20,})["\'][^>]*data-ko\s*=\s*["\']([^"\']{10,})["\']', window)
        if pm:
            desc_en = pm.group(1).strip()
            desc_ko = pm.group(2).strip()

    return name_en, name_ko, desc_en, desc_ko


# A-508(브론즈 34차 N34-2): 들어갈 페이지 목록을 **손으로 적어 두었더니** 그 목록이
# 사이트맵보다 뒤처졌다 — `sourcing-inquiry`·`categories`·`terms`·`privacy`·
# `brand-guide`·`submit-trend` 여섯 쪽이 색인에 아예 없었다. 손님이 「소싱 문의」를
# 쳐도 안 나온다. 목록을 두 군데 적어 두면 갈린다(A-444·A-466·A-468 과 같은 실패).
# 그래서 **사이트맵을 정본으로 읽는다** — 공개 페이지의 정의는 거기 하나다.
_PAGE_URLS = None
# 사이트맵에는 있지만 색인에서는 빼는 쪽과, 그 까닭
PAGE_EXCLUDE = {
    # 한 항목이 두 언어를 다 담으므로 영문 쌍둥이는 넣지 않는다(두 줄로 나온다)
    "privacy-en.html",
}


def page_urls() -> set:
    global _PAGE_URLS
    if _PAGE_URLS is None:
        sm = (ROOT / "sitemap.xml")
        if not sm.exists():
            raise SystemExit("sitemap.xml 이 없다 — 색인에 넣을 페이지 목록의 정본이다")
        urls = re.findall(r"<loc>([^<]+)</loc>", sm.read_text(encoding="utf-8"))
        out = set()
        for u in urls:
            rel = re.sub(r"^https?://[^/]+/", "", u).strip()
            rel = rel or "index.html"
            if "/" in rel:
                continue                      # 카테고리·기사는 아래 갈래가 맡는다
            if rel in PAGE_EXCLUDE:
                continue
            out.add(rel)
        if len(out) < 10:
            raise SystemExit("사이트맵에서 뿌리 페이지를 %d개만 읽었다 — 형식이 바뀌었나?" % len(out))
        _PAGE_URLS = out
    return _PAGE_URLS


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
    elif relpath.replace(os.sep, "/") in page_urls():
        typ = "page"
    else:
        return None

    name_en, name_ko, desc_en, desc_ko = extract_title_desc(html)

    # A-167: 여기서 뽑은 값은 '이스케이프된 HTML' 이다. search-index.json 의 계약은
    # 평문이고, 소비자(search.js)가 출력할 때 이스케이프한다. 여기서 풀지 않으면
    # 색인에 &apos; · &#x27; 같은 엔티티가 글자로 들어가고, 소비자가 제대로
    # 이스케이프하는 순간 사용자 화면에 &apos; 가 그대로 찍힌다.
    name_en, name_ko, desc_en, desc_ko = (html_mod.unescape(x) for x in (name_en, name_ko, desc_en, desc_ko))

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


def build_items(quiet: bool = False) -> list:
    """A-508: 만드는 일과 쓰는 일을 가른다.

    색인은 **만들어 두고 커밋하는 물건**이라, 페이지를 고치고 이 스크립트를
    다시 돌리지 않으면 **조용히 묵는다**. 검사기가 같은 결과를 메모리에서
    만들어 커밋된 파일과 견주려면 쓰기와 떨어져 있어야 한다.
    """
    items = []
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        item = process_file(p, str(rel))
        if item:
            items.append(item)

    # ───────────────────────────────────────────────────────────────────────
    # A-449(2026-11-10): 서브카테고리 69개 **전부** parent_en/parent_ko 가 없었다.
    #
    #   `search.js` 는 서브카테고리 결과의 **부제로 부모 이름**을 쓰고
    #   (`sub = lang === 'ko' ? item.parent_ko : item.parent_en`),
    #   점수에서도 「부모 이름이 질의를 품으면 30점」 가지를 둔다. 그런데 색인이
    #   그 필드를 **한 번도 넣은 적이 없어서** 부제는 늘 비었고 30점 가지는
    #   **돌 수 없는 죽은 코드**였다.
    #
    #   눈에 띈 계기(브론즈 27차 8번): 「아웃도어」를 검색하면 「아웃도어 조명」이
    #   **두 줄** 나온다 — `categories/lighting/outdoor-lighting.html` 과
    #   `categories/outdoor/outdoor-lighting.html`. 부제가 비어 있으니 손님 눈에는
    #   **똑같은 두 줄**이고 어느 걸 눌러야 할지 알 수 없다. 같은 모양이
    #   「스팀룸」(bathroom / wellness)에도 있다.
    #
    #   부모는 경로에 이미 있다 — `categories/<부모>/<자식>.html`. 같은 실행에서
    #   만든 category 항목의 이름을 끌어다 쓴다(새 대응표를 만들지 않는다).
    # ───────────────────────────────────────────────────────────────────────
    cat_by_slug = {}
    for it in items:
        if it["type"] == "category":
            slug = it["url"].split("/")[-1].rsplit(".", 1)[0]
            cat_by_slug[slug] = it
    filled = missing = 0
    for it in items:
        if it["type"] != "subcategory":
            continue
        parts = it["url"].split("/")
        parent = cat_by_slug.get(parts[1]) if len(parts) > 2 else None
        if parent:
            it["parent_en"] = parent["name_en"]
            it["parent_ko"] = parent["name_ko"]
            filled += 1
        else:
            missing += 1
    if missing:
        raise SystemExit(
            "서브카테고리 %d개의 부모 카테고리를 찾지 못했다 — 경로 규약이 바뀌었나?" % missing)
    if not quiet:
        print("부모를 채운 서브카테고리: %d개" % filled)

    # 정렬: type → url
    type_order = {"page": 0, "category": 1, "subcategory": 2, "brand": 3,
                  "article": 4, "trend-report": 5}
    items.sort(key=lambda x: (type_order.get(x["type"], 9), x["url"]))
    return items


def serialize(items: list) -> str:
    """커밋된 파일과 **한 글자까지** 같아야 한다 — 검사기가 이걸로 견준다."""
    return json.dumps(items, ensure_ascii=False, indent=2) + "\n"


def main():
    items = build_items()
    out = ROOT / "search-index.json"
    out.write_text(serialize(items), encoding="utf-8")

    print(f"search-index.json 재생성 완료")
    print(f"  총 항목: {len(items)}")

    from collections import Counter
    by_type = Counter(x["type"] for x in items)
    print(f"  타입별:")
    for t, n in by_type.most_common():
        print(f"    {t:15s} {n}")


if __name__ == "__main__":
    main()
