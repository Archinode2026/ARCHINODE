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
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          searchData = JSON.parse(xhr.responseText);
          isLoaded = true;
          callback();
        } catch(e) {
          console.warn('Search index parse error:', e);
        }
      }
    };
    xhr.onerror = function() { console.warn('Failed to load search index'); };
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
          name_en: b.brandName,
          name_ko: b.brandName,
          desc_en: '',
          desc_ko: '',
          parent_en: '',
          parent_ko: '',
          country: b.country || '',
          category: b.category || '',
          url: 'brands/view.html?id=' + b.slug
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
      var item = combined[i];
      var score = 0;
      var nameEn = (item.name_en || '').toLowerCase();
      var nameKo = (item.name_ko || '').toLowerCase();
      var descEn = (item.desc_en || '').toLowerCase();
      var descKo = (item.desc_ko || '').toLowerCase();
      var parentEn = (item.parent_en || '').toLowerCase();
      var parentKo = (item.parent_ko || '').toLowerCase();
      var country = (item.country || '').toLowerCase();
      var category = (item.category || '').toLowerCase();

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
          url: basePath + item.url
        });
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
        sub = (item.country || '') + (item.category ? ' · ' + item.category : '');
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
