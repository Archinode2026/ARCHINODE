/* ===== ARCHINODE Language Toggle (KR / EN) ===== */
(function() {
  // Detect language: saved preference > browser/location > default 'en'
  let currentLang = localStorage.getItem('archinode-lang');

  if (!currentLang) {
    // Auto-detect: Korean browser or Korean locale → 'ko', else 'en'
    var browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    currentLang = (browserLang === 'ko' || browserLang.startsWith('ko-')) ? 'ko' : 'en';
  }

  // Apply language on load
  document.addEventListener('DOMContentLoaded', function() {
    ensureLangButton();
    applyLanguage(currentLang);
    updateLangButton(currentLang);
  });

  // Auto-inject a floating language toggle if the page has no .lang-switch
  // (covers minimal-header pages: auth/*, brand-portal/*, admin/*, etc.)
  function ensureLangButton() {
    if (document.querySelector('.lang-switch')) return;
    var btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'lang-switch lang-switch-floating';
    btn.setAttribute('onclick', 'toggleLang(event); return false;');
    btn.textContent = 'KR / EN';
    btn.style.cssText = [
      'position:fixed',
      'top:14px',
      'right:16px',
      'z-index:9999',
      'font-size:0.75rem',
      'font-weight:500',
      'color:#666',
      'background:#fff',
      'border:1px solid #ddd',
      'padding:4px 10px',
      'border-radius:3px',
      'text-decoration:none',
      'font-family:Inter,"Noto Sans KR",sans-serif',
      'transition:all 0.2s',
      'cursor:pointer',
      'box-shadow:0 1px 3px rgba(0,0,0,0.08)'
    ].join(';') + ';';
    document.body.appendChild(btn);
  }

  // Toggle language function (global)
  window.toggleLang = function(e) {
    if (e) e.preventDefault();
    currentLang = currentLang === 'en' ? 'ko' : 'en';
    localStorage.setItem('archinode-lang', currentLang);
    applyLanguage(currentLang);
    updateLangButton(currentLang);
  };

  function applyLanguage(lang) {
    // Update all elements with data-en and data-ko attributes
    document.querySelectorAll('[data-en][data-ko]').forEach(function(el) {
      var text = el.getAttribute('data-' + lang);
      if (text !== null) {
        // Check if element has child elements we should preserve
        if (el.querySelector('i, svg, img, span.logo-sub')) {
          // Replace only the first text node
          var nodes = el.childNodes;
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType === Node.TEXT_NODE && nodes[i].textContent.trim()) {
              nodes[i].textContent = text;
              break;
            }
          }
        } else {
          el.textContent = text;
        }
      }
    });

    // Update elements with data-en-html and data-ko-html (for innerHTML)
    document.querySelectorAll('[data-en-html][data-ko-html]').forEach(function(el) {
      var html = el.getAttribute('data-' + lang + '-html');
      if (html !== null) {
        el.innerHTML = html;
      }
    });

    // Update placeholder attributes
    document.querySelectorAll('[data-en-placeholder][data-ko-placeholder]').forEach(function(el) {
      var ph = el.getAttribute('data-' + lang + '-placeholder');
      if (ph !== null) {
        el.placeholder = ph;
      }
    });

    // Update html lang attribute
    document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';
  }

  function updateLangButton(lang) {
    var btns = document.querySelectorAll('.lang-switch');
    btns.forEach(function(btn) {
      if (lang === 'ko') {
        btn.innerHTML = '<strong>KR</strong> / EN';
      } else {
        btn.innerHTML = 'KR / <strong>EN</strong>';
      }
    });
  }
})();
