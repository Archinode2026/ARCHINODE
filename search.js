// ═══════════════════════════════════════════════════════════
// ARCHINODE Search System
// ═══════════════════════════════════════════════════════════

(function() {
  var searchData = null;
  var searchInput = null;
  var resultsContainer = null;
  var isLoaded = false;
  var brandIndex = null; // Firestore 승인 브랜드 목록 캐시 (A-072: 정적 search-index.json엔 brand 타입이 없음)
  var brandIndexLoading = false;
  var badItemWarned = false;

  // ─────────────────────────────────────────────────────────────────────────
  // A-397(2026-11-09): 검색이 227 페이지에서 통째로 죽어 있었다.
  //
  // `list-your-brand.html:783` 은 카테고리를 체크박스로 받아
  // `category: [...].map(cb => cb.value)` 로 **항상 배열**로 저장한다.
  // 그런데 아래 search() 는 `(item.category || '').toLowerCase()` 로
  // **문자열을 전제**했다. 배열은 truthy 라 `|| ''` 를 통과하고
  // `.toLowerCase` 가 없어 예외가 던져진다. 그 예외가 search() 밖으로
  // 나가 renderResults 가 영영 안 불리고 **화면이 빈 채로 남았다** —
  // 「결과 없음」조차 안 떴다. 승인 브랜드 3곳 중 한 곳이 배열이면
  // 사이트 전체 검색이 멈춘다.
  //
  // 배열은 잘못된 데이터가 아니라 **신청서가 설계대로 넣은 모양**이다.
  // 그래서 데이터를 고치는 게 아니라 **읽는 쪽이 어떤 모양이든 받도록** 한다.
  // ─────────────────────────────────────────────────────────────────────────
  function text(v, sep) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) {
      return v.filter(function(x) { return x !== null && x !== undefined && x !== ''; })
              .map(function(x) { return text(x, sep); })
              .join(sep === undefined ? ' ' : sep);
    }
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';   // 객체·함수는 검색어로 쓸 것이 없다
  }

  function lc(v) { return text(v).toLowerCase(); }

  // Determine base path relative to current page
  function getBasePath() {
    var path = window.location.pathname;
    // Count depth from root
    var parts = path.split('/').filter(function(p) { return p && !p.includes('.html'); });
    // Remove leading empty or domain parts
    var depth = 0;
    if (path.includes('/categories/') && path.split('/categories/')[1] && path.split('/categories/')[1].includes('/')) {
      depth = 2; // categories/bathroom/something.html
    } else if (path.includes('/magazine/') || path.includes('/brands/') || path.includes('/categories/')) {
      depth = 1;
    } else if (path.includes('/brand-portal/') || path.includes('/admin/') || path.includes('/auth/')) {
      depth = 1;
    }
    var prefix = '';
    for (var i = 0; i < depth; i++) prefix += '../';
    return prefix;
  }

  // Load search index
  function loadSearchIndex(callback) {
    if (searchData) { callback(); return; }
    var basePath = getBasePath();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', basePath + 'search-index.json', true);
    /* A-353(2026-11-06): 전에는 **세 갈래가 모두 콜백을 버렸다** — 파싱 실패 · 200 이 아닌 응답 ·
       네트워크 오류. 그러면 loadAllIndexes 가 다음 단계(loadBrandIndex)에 못 가고
       renderResults 가 **영영 안 불린다.** 사용자는 타이핑해도 아무 반응이 없다 —
       「결과가 없습니다」조차 안 뜬다. 조용한 실패 그 자체다.
       같은 파일의 loadBrandIndex 는 실패해도 `brandIndex = []; callback();` 으로
       **제대로 넘긴다** — 한 파일 안에서 두 함수가 같은 상황을 다르게 다루고 있었다.
       여기도 같은 약속으로 맞춘다: 색인이 없으면 빈 배열로 두고 콜백은 반드시 부른다.
       그러면 검색은 브랜드(Firestore)만으로라도 돌고, 안 되면 「결과가 없습니다」가 뜬다.
       (브론즈 11차 발견. 재현 조건은 search-index.json 이 404/500 이거나 끊길 때 —
        A-285 에서 _redirects 가 이 파일을 막았다면 정확히 이 증상이었다.) */
    function giveUp(why) {
      console.warn('[search] 색인을 못 읽었습니다 — 브랜드 검색만으로 진행합니다:', why);
      if (!searchData) { searchData = []; isLoaded = true; }
      callback();
    }
    xhr.onload = function() {
      if (xhr.status !== 200) { giveUp('HTTP ' + xhr.status); return; }
      try {
        searchData = JSON.parse(xhr.responseText);
        isLoaded = true;
        callback();
      } catch(e) {
        giveUp('파싱 실패: ' + e.message);
      }
    };
    xhr.onerror = function() { giveUp('네트워크 오류'); };
    xhr.ontimeout = function() { giveUp('시간 초과'); };
    xhr.send();
  }

  // Load live brand index from Firestore (approved brands only).
  // search-index.json has no 'brand' entries since the site moved brand
  // pages from static files to Firestore-driven brands/view.html?id=slug,
  // so brand name search is served from this live query instead.
  function loadBrandIndex(callback) {
    if (brandIndex !== null) { callback(); return; }
    if (brandIndexLoading) {
      // Another call is already loading; wait briefly then proceed with whatever we have.
      setTimeout(function() { callback(); }, 300);
      return;
    }
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
      // Firebase not loaded on this page; degrade gracefully with no brand results.
      brandIndex = [];
      callback();
      return;
    }
    brandIndexLoading = true;
    db.collection('brands').where('status', '==', 'approved').get().then(function(snapshot) {
      var list = [];
      snapshot.forEach(function(doc) {
        var b = doc.data();
        if (!b.brandName || !b.slug) return;
        list.push({
          type: 'brand',
          name_en: text(b.brandName),
          name_ko: text(b.brandName),
          desc_en: '',
          desc_ko: '',
          parent_en: '',
          parent_ko: '',
          country: text(b.country),
          category: text(b.category, ', '),
          url: 'brands/view.html?id=' + encodeURIComponent(text(b.slug))
        });
      });
      brandIndex = list;
      brandIndexLoading = false;
      callback();
    }).catch(function(err) {
      console.warn('Failed to load brand index:', err);
      brandIndex = [];
      brandIndexLoading = false;
      callback();
    });
  }

  // Load both the static index and the live brand index, then run callback once.
  function loadAllIndexes(callback) {
    loadSearchIndex(function() {
      loadBrandIndex(callback);
    });
  }

  // Search function
  function search(query) {
    if (!searchData || !query) return [];
    var q = query.toLowerCase().trim();
    if (q.length < 1) return [];

    var results = [];
    var basePath = getBasePath();
    var combined = searchData.concat(brandIndex || []);

    for (var i = 0; i < combined.length; i++) {
      // A-397: 항목 하나 때문에 검색 전체가 멈추던 것을 막는다. lc() 로 이미
      //        모양 문제는 없어졌지만, 색인은 밖에서 들어오는 데이터다 —
      //        한 줄이 나쁘면 그 줄만 건너뛰고 나머지는 찾아 준다.
      try {
      var item = combined[i];
      var score = 0;
      var nameEn = lc(item.name_en);
      var nameKo = lc(item.name_ko);
      var descEn = lc(item.desc_en);
      var descKo = lc(item.desc_ko);
      var parentEn = lc(item.parent_en);
      var parentKo = lc(item.parent_ko);
      var country = lc(item.country);
      var category = lc(item.category);

      // Exact name match (highest priority)
      if (nameEn === q || nameKo === q) {
        score = 100;
      }
      // Name starts with query
      else if (nameEn.indexOf(q) === 0 || nameKo.indexOf(q) === 0) {
        score = 80;
      }
      // Name contains query
      else if (nameEn.indexOf(q) !== -1 || nameKo.indexOf(q) !== -1) {
        score = 60;
      }
      // Description/parent/country contains query
      else if (descEn.indexOf(q) !== -1 || descKo.indexOf(q) !== -1) {
        score = 40;
      }
      else if (parentEn.indexOf(q) !== -1 || parentKo.indexOf(q) !== -1) {
        score = 30;
      }
      else if (country.indexOf(q) !== -1 || category.indexOf(q) !== -1) {
        score = 20;
      }

      // Type priority boost
      if (score > 0) {
        if (item.type === 'brand') score += 5;
        else if (item.type === 'category') score += 4;
        else if (item.type === 'subcategory') score += 3;
        // A-349: 여기도 색인에 없는 'magazine' 을 보고 있었다 — 그래서 기사 130편이
        //        타입 가점을 **하나도 못 받고** 브랜드·카테고리 아래로 밀렸다.
        else if (item.type === 'article') score += 2;

        results.push({
          item: item,
          score: score,
          url: basePath + text(item.url)
        });
      }
      } catch (e) {
        if (!badItemWarned) {
          badItemWarned = true;
          console.warn('검색 색인의 항목 하나를 건너뛴다 (A-397):', e && e.message, combined[i]);
        }
      }
    }

    // Sort by score descending
    results.sort(function(a, b) { return b.score - a.score; });
    return results.slice(0, 12); // Max 12 results
  }

  // Get type label
  function getTypeLabel(type, lang) {
    var labels = {
      category: { en: 'Category', ko: '카테고리' },
      subcategory: { en: 'Subcategory', ko: '서브카테고리' },
      brand: { en: 'Brand', ko: '브랜드' },
      // A-349(2026-11-06): A-348 이 *.html 만 쓸어서 이 파일이 통째로 비껴갔다.
      // 헤더·푸터는 「Korean Articles」인데 검색 결과 라벨만 「Magazine」이면 한 화면에서 이름이 갈린다.
      magazine: { en: 'Korean Articles', ko: '매거진' },
      article: { en: 'Korean Articles', ko: '매거진' },      // A-073: 인덱스는 article로 저장, 표시는 섹션 이름
      'trend-report': { en: 'Brand Articles', ko: '브랜드 아티클' },
      page: { en: 'Page', ko: '페이지' }
    };
    var l = labels[type] || { en: type, ko: type };
    return lang === 'ko' ? l.ko : l.en;
  }

  // Get type icon
  function getTypeIcon(type) {
    var icons = {
      category: 'fas fa-th-large',
      subcategory: 'fas fa-tag',
      brand: 'fas fa-building',
      magazine: 'fas fa-newspaper',
      article: 'fas fa-newspaper',
      'trend-report': 'fas fa-chart-line',
      page: 'fas fa-file'
    };
    return icons[type] || 'fas fa-link';
  }

  // Render results
  // A-167: 색인(search-index.json)의 계약은 '평문' 이다. innerHTML 로 넣으므로
  // 출력할 때 한 번 이스케이프해야 한다. 이게 없으면 색인 값의 마크업이 그대로
  // 실행되고(주입), 반대로 색인에 엔티티가 들어 있으면 두 겹이 되어 화면에 찍힌다.
  // 색인을 만드는 scripts/make_search_index.py 가 unescape 로 평문을 보장한다.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderResults(results) {
    if (!resultsContainer) return;
    var lang = localStorage.getItem('archinode-lang') || 'en';

    if (results.length === 0) {
      var q = searchInput ? searchInput.value.trim() : '';
      if (q.length > 0) {
        resultsContainer.innerHTML = '<div class="search-no-results">' +
          (lang === 'ko' ? '검색 결과가 없습니다.' : 'No results found.') +
          '</div>';
      } else {
        resultsContainer.innerHTML = '<div class="search-hint">' +
          (lang === 'ko' ? '브랜드, 카테고리, 매거진을 검색하세요' : 'Search brands, categories, Korean articles') +
          '</div>';
      }
      return;
    }

    var html = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var item = r.item;
      var name = lang === 'ko' && item.name_ko ? item.name_ko : item.name_en;
      var sub = '';

      if (item.type === 'subcategory') {
        sub = (lang === 'ko' ? item.parent_ko : item.parent_en) || '';
      } else if (item.type === 'brand') {
        var catText = text(item.category, ' · ');
        sub = text(item.country) + (catText ? ' · ' + catText : '');
      } else if (item.type === 'category') {
        sub = lang === 'ko' ? (item.desc_ko || '') : (item.desc_en || '');
      } else if (item.type === 'article') {
        /* A-349: 색인의 기사 타입은 'article' 이다. 전에는 'magazine' 을 보고 있었는데
           색인에 그런 타입이 **아예 없어서**(article 130 · subcategory 69 · page 10 ·
           category 10 · trend-report 1) 이 분기는 한 번도 안 돌았다. 그 안의
           `name = item.name_en` 이 살아났다면 한국어 화면에서 기사 제목이 영어로 굳었을
           것이다 — 목록이 보는 사람 언어를 안 따르는 그 결함(A-347)과 같은 종류다.
           제목(name)은 위의 기본값이 이미 언어를 따르므로 건드리지 않고,
           부제에 반대쪽 언어 제목을 보여 준다. */
        sub = (lang === 'ko' ? (item.name_en || '') : (item.name_ko || '')).substring(0, 60);
      }

      html += '<a href="' + esc(r.url) + '" class="search-result-item">' +
        '<i class="' + getTypeIcon(item.type) + ' search-result-icon"></i>' +
        '<div class="search-result-text">' +
          '<div class="search-result-name">' + esc(name) + '</div>' +
          (sub ? '<div class="search-result-sub">' + esc(sub) + '</div>' : '') +
        '</div>' +
        '<span class="search-result-type">' + getTypeLabel(item.type, lang) + '</span>' +
      '</a>';
    }
    resultsContainer.innerHTML = html;
  }

  // Initialize search
  function initSearch() {
    // Find the search overlay
    var overlay = document.getElementById('searchOverlay');
    if (!overlay) return;

    // Get existing input
    searchInput = overlay.querySelector('.search-box input');
    if (!searchInput) return;

    // Create results container if not exists
    resultsContainer = overlay.querySelector('.search-results');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.className = 'search-results';
      var searchBox = overlay.querySelector('.search-box');
      if (searchBox) {
        searchBox.parentNode.insertBefore(resultsContainer, searchBox.nextSibling);
      }
    }

    // Listen for input
    searchInput.addEventListener('input', function() {
      var q = this.value.trim();
      if (q.length === 0) {
        renderResults([]);
        return;
      }
      loadAllIndexes(function() {
        var results = search(q);
        renderResults(results);
      });
    });

    // Preload on overlay open
    var searchToggleBtns = document.querySelectorAll('.search-toggle');
    for (var i = 0; i < searchToggleBtns.length; i++) {
      searchToggleBtns[i].addEventListener('click', function() {
        loadAllIndexes(function() {});
        // Focus input after overlay opens
        setTimeout(function() {
          if (searchInput) searchInput.focus();
        }, 100);
      });
    }

    // Clear on overlay close
    var closeBtn = overlay.querySelector('.search-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        if (searchInput) searchInput.value = '';
        if (resultsContainer) resultsContainer.innerHTML = '';
      });
    }

    // Navigate results with keyboard
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var firstResult = resultsContainer.querySelector('.search-result-item');
        if (firstResult) {
          firstResult.click();
        }
      }
    });

    // A-098: 검색 오버레이가 열려 있을 때 Tab 포커스가 뒤 화면 콘텐츠로 빠져나가지 않도록
    // 포커스 트랩 — 오버레이 안에서만 포커스가 돌아간다. Esc는 기존 핸들러가 닫음.
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search');
    overlay.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      if (!overlay.classList.contains('active')) return;
      var focusable = overlay.querySelectorAll('input, button, a[href], .search-result-item, [tabindex]:not([tabindex="-1"])');
      focusable = Array.prototype.filter.call(focusable, function(el){
        return !el.hasAttribute('disabled') && el.offsetParent !== null;
      });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }
})();
