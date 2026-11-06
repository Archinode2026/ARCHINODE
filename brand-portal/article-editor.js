// brand-portal/article-editor.js
// 매거진 블록 에디터 + Firebase Storage 업로드 + Firestore articles 저장
// 의존(dashboard.html 전역): firebase, db, storage, currentUser, brandData

(function() {
  let blocks = [];
  const $ = id => document.getElementById(id);

  // A-010(2026-11-03): Firestore 쓰기는 오프라인/연결 불안정 시 reject 없이 큐에서 무한 대기한다 —
  // try/catch/finally가 있어도 실패 갈래를 못 타 "Submitting..." 버튼에서 멈춘 것처럼 보였다.
  function archinodeWithTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ARCHINODE_TIMEOUT')), ms))
    ]);
  }

  // ── 렌더 ──
  function render() {
    const cont = $('artBlocks');
    if (!cont) return;
    cont.innerHTML = '';
    if (blocks.length === 0) {
      cont.innerHTML = '<div style="padding:24px;text-align:center;color:#999;font-size:0.88rem;border:1px dashed #ddd;border-radius:6px;">Add a text or image block below to start.</div>';
      return;
    }
    blocks.forEach((b, i) => {
      const el = document.createElement('div');
      el.style.cssText = 'border:1px solid #e5e5e5;border-radius:6px;padding:14px;background:#fff;';
      const ctl = document.createElement('div');
      ctl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      ctl.innerHTML = '<span style="font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;">' + (b.type==='text'?'Text':'Image') + ' · Block ' + (i+1) + '</span>';
      const btnBox = document.createElement('span');
      ['up','down','del'].forEach(act => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = act==='up'?'↑':(act==='down'?'↓':'×');
        btn.title = act==='up'?'Move up':(act==='down'?'Move down':'Delete');
        btn.disabled = (act==='up'&&i===0) || (act==='down'&&i===blocks.length-1);
        btn.style.cssText = 'background:#f0f0f0;border:1px solid #ddd;border-radius:3px;padding:2px 10px;margin-left:4px;cursor:pointer;font-weight:700;'+(act==='del'?'color:#c00;':'');
        btn.addEventListener('click', () => {
          if (act==='up') [blocks[i-1],blocks[i]]=[blocks[i],blocks[i-1]];
          else if (act==='down') [blocks[i+1],blocks[i]]=[blocks[i],blocks[i+1]];
          else if (act==='del' && confirm('Delete this block?')) blocks.splice(i,1);
          render();
        });
        btnBox.appendChild(btn);
      });
      ctl.appendChild(btnBox);
      el.appendChild(ctl);

      if (b.type === 'text') {
        const ta = document.createElement('textarea');
        ta.rows = 4;
        ta.style.cssText = 'width:100%;font-family:inherit;font-size:0.95rem;padding:10px;border:1px solid #ddd;border-radius:4px;resize:vertical;box-sizing:border-box;';
        ta.placeholder = 'Write paragraph text here. Line breaks are preserved.';
        ta.value = b.content || '';
        ta.addEventListener('input', () => { b.content = ta.value; });
        el.appendChild(ta);
      } else {
        const drop = document.createElement('div');
        drop.style.cssText = 'border:2px dashed #ccc;border-radius:6px;padding:24px;text-align:center;background:#fafafa;cursor:pointer;transition:background 0.2s;';
        if (b.url) {
          drop.innerHTML = '<img src="'+b.url+'" style="max-width:100%;max-height:300px;border-radius:4px;display:block;margin:0 auto;"><div style="margin-top:10px;font-size:0.78rem;color:#888;">Click or drop to replace</div>';
        } else if (b.uploading) {
          drop.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:1.6rem;color:#666;"></i><div style="margin-top:8px;color:#666;">Uploading...</div>';
        } else {
          drop.innerHTML = '<i class="fas fa-cloud-upload-alt" style="font-size:2rem;color:#bbb;"></i><div style="margin-top:10px;color:#666;">Click or drag an image here</div><div style="margin-top:6px;font-size:0.72rem;color:#999;">JPG / PNG / WebP, max 5MB after compression</div>';
        }
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/webp';
        fileInput.style.display = 'none';
        drop.addEventListener('click', () => fileInput.click());
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.background = '#eef6ff'; });
        drop.addEventListener('dragleave', () => { drop.style.background = '#fafafa'; });
        drop.addEventListener('drop', e => {
          e.preventDefault();
          drop.style.background = '#fafafa';
          if (e.dataTransfer.files[0]) handleImageFile(b, e.dataTransfer.files[0], i);
        });
        fileInput.addEventListener('change', e => {
          if (e.target.files[0]) handleImageFile(b, e.target.files[0], i);
        });
        el.appendChild(drop);
        el.appendChild(fileInput);

        const altIn = document.createElement('input');
        altIn.type = 'text';
        altIn.placeholder = 'Alt text (for accessibility & SEO)';
        altIn.value = b.alt || '';
        altIn.style.cssText = 'width:100%;margin-top:10px;padding:8px;font-size:0.85rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        altIn.addEventListener('input', () => { b.alt = altIn.value; });
        el.appendChild(altIn);

        const capIn = document.createElement('input');
        capIn.type = 'text';
        capIn.placeholder = 'Caption (optional)';
        capIn.value = b.caption || '';
        capIn.style.cssText = 'width:100%;margin-top:8px;padding:8px;font-size:0.85rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        capIn.addEventListener('input', () => { b.caption = capIn.value; });
        el.appendChild(capIn);
      }
      cont.appendChild(el);

      /* A-271: 전에는 새 블록이 늘 **맨 끝**에 붙었다. 글 사이에 사진을 넣으려면 끝에 만든 뒤
         ↑ 를 여러 번 눌러 올려야 했고, 글이 한 덩어리면 자리가 위/아래 둘뿐이라
         "사이에 못 넣는다" 로 느껴진다. 블록마다 '여기 아래' 추가 단추를 둔다. */
      const ins = document.createElement('div');
      ins.style.cssText = 'display:flex;gap:6px;justify-content:center;margin:6px 0 10px;';
      [['text', '＋ 글', '이 블록 아래에 글 블록 넣기'],
       ['image', '＋ 사진', '이 블록 아래에 사진 블록 넣기']].forEach(pair => {
        const ib = document.createElement('button');
        ib.type = 'button';
        ib.textContent = pair[1];
        ib.title = pair[2];
        ib.style.cssText = 'background:#fff;border:1px dashed #cfc6b6;color:#7a6f5d;border-radius:4px;'
          + 'padding:3px 14px;font-size:0.74rem;cursor:pointer;';
        ib.addEventListener('click', () => {
          blocks.splice(i + 1, 0, pair[0] === 'text'
            ? { type: 'text', content: '' }
            : { type: 'image', url: '', alt: '', caption: '' });
          render();
        });
        ins.appendChild(ib);
      });
      cont.appendChild(ins);
    });
  }

  // ── 이미지 압축 (가로 1600px 초과 시 리사이즈, JPEG 85%) ──
  function compressImage(file) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX) { h = h * (MAX/w); w = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleImageFile(block, file, idx) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      alert('Only JPG, PNG, or WebP allowed'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be under 10MB before compression'); return;
    }
    block.uploading = true;
    render();
    try {
      const blob = await compressImage(file);
      if (!blob) { alert('Failed to read image'); block.uploading = false; render(); return; }
      if (blob.size > 5 * 1024 * 1024) {
        alert('Compressed image still exceeds 5MB. Try a smaller image.');
        block.uploading = false; render(); return;
      }
      const ts = Date.now();
      const ref = storage.ref('articles/' + currentUser.uid + '/temp/' + ts + '_block-' + idx + '.jpg');
      await ref.put(blob);
      block.url = await ref.getDownloadURL();
      block.storagePath = ref.fullPath;
      block.uploading = false;
      render();
    } catch (e) {
      block.uploading = false;
      alert('Upload failed: ' + e.message);
      render();
    }
  }

  // ── 파생값 ──
  function generateSlug(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80) || 'untitled';
  }

  async function getUniqueSlug(baseSlug) {
    try {
      const snap = await db.collection('articles').where('slug', '==', baseSlug).limit(1).get();
      if (snap.empty) return baseSlug;
      let suffix = 2;
      while (suffix < 100) {
        const candidate = baseSlug + '-' + suffix;
        const check = await db.collection('articles').where('slug', '==', candidate).limit(1).get();
        if (check.empty) return candidate;
        suffix++;
      }
      return baseSlug + '-' + Date.now();
    } catch (e) {
      return baseSlug + '-' + Date.now();
    }
  }
  function getExcerpt() {
    const t = blocks.find(b => b.type === 'text' && b.content);
    return t ? t.content.trim().substring(0, 150) : '';
  }
  function getCoverImage() {
    const i = blocks.find(b => b.type === 'image' && b.url);
    return i ? i.url : '';
  }
  function validate(title) {
    if (!title) return 'Title is required';
    if (blocks.length === 0) return 'Add at least one block';
    const hasContent = blocks.some(b => (b.type === 'text' && b.content && b.content.trim()) || (b.type === 'image' && b.url));
    if (!hasContent) return 'Add text or image content';
    if (blocks.some(b => b.type === 'image' && b.uploading)) return 'Wait for images to finish uploading';
    return null;
  }
  /* A-305 → A-310(2026-11-06) 로 다시 짰다. 브론즈가 손계산으로 반례 둘을 찾았다.

     첫 판은 **제목 + 본문**을 합쳐 한글 비율을 쟀다. 그래서
     「2026 밀라노 가구 박람회 현장 리뷰」(한글 16) + 짧은 영어 본문(60자) 이
     ratio 0.21 로 `ko` 가 됐다. 그런데 **유럽 브랜드가 영어로 쓰고 한국 시장용
     제목만 한국어로 다는 것은 이 사업에서 자연스러운 일이다.** 제목이 본문을
     이기면 안 된다.

     그리고 첫 판은 어긋나면 **무조건** 덮어썼다. 두 언어를 일부러 섞은 글에서
     사용자 의도를 지운다.

     그래서 둘 다 바꿨다:
       1. **본문으로 판정한다.** 본문이 짧으면 그때만 제목을 본다
          (사진 기사처럼 본문 텍스트가 거의 없는 글은 제목이 유일한 단서다).
       2. **분명할 때만 덮어쓴다.** 한글 35%% 이상이면 ko, 10%% 이하면 en,
          그 사이는 **애매하므로 고른 값을 존중한다.**
     판정을 바꿀 때는 조용히 하지 않고 폼 안내에 적는다. */
  function langRatio(text) {
    var letters = (String(text || '').match(/[A-Za-z\uac00-\ud7a3]/g) || []).length;
    if (!letters) return null;
    var han = (String(text).match(/[\uac00-\ud7a3]/g) || []).length;
    return { letters: letters, ratio: han / letters };
  }
  function pickLang(title, blocks) {
    var chosen = $('artLang') ? $('artLang').value : 'en';
    var bodyText = '';
    (blocks || []).forEach(function (b) { if (b && b.type === 'text') bodyText += ' ' + String(b.content || ''); });

    var m = langRatio(bodyText);
    if (!m || m.letters < 20) m = langRatio(title);   // 본문이 짧으면 제목이 유일한 단서다
    if (!m || m.letters < 8) return chosen;           // 둘 다 짧으면 판단하지 않는다

    var actual;
    if (m.ratio >= 0.35) actual = 'ko';
    else if (m.ratio <= 0.10) actual = 'en';
    else return chosen;                                // 애매한 구간 — 고른 값을 존중한다

    if (actual !== chosen) {
      if ($('artLang')) $('artLang').value = actual;
      if ($('artFormMsg')) {
        $('artFormMsg').textContent = (actual === 'ko')
          ? '원문 언어를 한국어로 맞췄습니다(본문이 한국어입니다). 다르면 위에서 바꿔 주세요.'
          : 'Original language set to English (the body is in English). Change it above if that is wrong.';
        $('artFormMsg').style.color = '#7a5c32';
      }
    }
    return actual;
  }

  function resetForm() {
    blocks = [];
    if ($('artTitle')) $('artTitle').value = '';
    if ($('artTag')) $('artTag').value = 'Brand Spotlight';
    /* A-305(2026-11-06): 전에는 여기서 매번 'en' 으로 되돌렸다. 자동 판별도 없고
       기본값이 영어라, 한국 브랜드가 한국어로 쓰면서 이 칸을 건드리지 않으면
       lang:'en' 이 박혔다. 그러면 공개 화면의 artSide() 가 원문을 영어로 판정해
       **한국어 글인데 한국어 독자에게 「이 글은 영어 원문만 있습니다」** 가 붙고,
       어드민 카드에는 'EN missing' 이 뜬다(실제로 라이브 더미 2건이 그 상태였다).
       이제 건드리지 않는다 — 마크업의 첫 option 이 기본이고, 쓴 사람이 고른 값은
       다음 글을 쓸 때까지 남는다. 틀리면 아래 제출 직전 교차검증이 잡는다. */
    if ($('artFormMsg')) { $('artFormMsg').textContent = ''; $('artFormMsg').style.color = ''; }
    render();
  }

  // ── 초기화 / 핸들러 바인딩 ──
  function init() {
    if (!$('addArticleBtn') || !$('artBlocks')) return;

    $('addArticleBtn').addEventListener('click', () => {
      // A-213 — 이 폼의 주인을 기록한다 (dashboard.html 의 bpFormUid)
      try { window.bpFormUid = (auth.currentUser && auth.currentUser.uid) || null; } catch (e) {}
      // status 가드 (입점 승인 후만 작성 가능)
      // R-061: 판단은 dashboard.html 의 bpCanSubmit() 하나로 모았다 — 제품 쪽과 규칙이
      // 갈라지지 않게. 안내도 네이티브 alert(영문 한 줄) 대신 단추 옆 자리에 적는다(A-216 과 같은 결).
      if (window.bpCanSubmit && !window.bpCanSubmit()) {
        if (window.bpApplyGate) window.bpApplyGate();
        return;
      }
      $('articleForm').style.display = 'block';
      $('addArticleBtn').style.display = 'none';
      if (blocks.length === 0) blocks.push({type: 'text', content: ''});
      render();
    });

    $('cancelArticle').addEventListener('click', () => {
      const hasContent = blocks.some(b => (b.type==='text'&&b.content&&b.content.trim()) || (b.type==='image'&&b.url));
      if (hasContent && !confirm('Discard this article? Unsaved changes will be lost.')) return;
      resetForm();
      $('articleForm').style.display = 'none';
      $('addArticleBtn').style.display = 'inline-block';
    });

    $('addTextBlockBtn').addEventListener('click', () => {
      blocks.push({type: 'text', content: ''});
      render();
    });
    $('addImageBlockBtn').addEventListener('click', () => {
      blocks.push({type: 'image', url: '', alt: '', caption: ''});
      render();
    });

    $('submitArticle').addEventListener('click', async () => {
      const title = $('artTitle').value.trim();
      const err = validate(title);
      const msg = $('artFormMsg');
      if (err) { msg.textContent = err; msg.style.color = '#c00'; return; }
      msg.textContent = ''; msg.style.color = '';

      const btn = $('submitArticle');
      btn.disabled = true; btn.textContent = 'Submitting...';

      /* A-213 / R-031: brandId 는 실시간 currentUser.uid, brandName 은 페이지가 불러둔
         brandData 에서 왔다 — 수명이 다른 두 출처다. 계정이 바뀌는 틈에 제출하면
         brandId 는 새 계정, brandName 은 옛 브랜드로 저장되고 화면은 정상으로 보인다.
         dashboard.html 의 bpIdentity() 가 둘을 한 객체로 묶어 주고, 어긋나면 멈춘다.
         (본문 이미지는 이미 올라가 있을 수 있다 — 그래도 **문서를 안 만드는 쪽**이 맞다.
          임시 경로(articles/<uid>/temp/)에 남은 파일은 소유권을 어기지 않는다.) */
      const bpId = (typeof bpIdentity === 'function')
          ? bpIdentity(window.bpFormUid) : { ok: false, reason: 'mismatch' };
      if (!bpId.ok) {
        msg.textContent = (typeof bpIdentityMessage === 'function')
            ? bpIdentityMessage(bpId.reason)
            : 'The signed-in account changed. Please reload and resubmit.';
        msg.style.color = '#c00';
        btn.disabled = false; btn.textContent = 'Submit for Review';
        return;
      }

      try {
        const cleanBlocks = blocks
          .filter(b => (b.type === 'text' && b.content && b.content.trim()) || (b.type === 'image' && b.url))
          .map(b => b.type === 'text'
            ? { type: 'text', content: b.content.trim() }
            : { type: 'image', url: b.url, alt: b.alt || '', caption: b.caption || '' }
          );

        await archinodeWithTimeout(db.collection('articles').add({
          brandId: bpId.uid,                 // A-213 — 둘을 한 객체에서 함께
          brandName: bpId.brandName,
          title: title,
          slug: generateSlug(title),
          tag: $('artTag').value,
          blocks: cleanBlocks,
          coverImage: getCoverImage(),
          excerpt: getExcerpt(),
          lang: pickLang(title, cleanBlocks),
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }), 15000);

        try {
          await archinodeWithTimeout(db.collection('mail').add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),  // 2026-11-02 QA: 발송 추적용 생성시각
            to: 'office@archinode.org',
            message: {
              subject: ('[ARCHINODE] 매거진 원고 - ' + (bpId.brandName || 'Unknown') + ': ' + title).substring(0, 180),  // 2026-11-03 QA: rules의 subject<200 제한 초과로 조용히 거부되는 것 방지
              text: [
                '브랜드가 매거진 원고를 제출했습니다.',
                '',
                'Brand: ' + (bpId.brandName || '-'),
                'Title: ' + title,
                'Tag: ' + ($('artTag') ? $('artTag').value : '-'),
                'Lang: ' + ($('artLang') ? $('artLang').value : 'en'),
                'Blocks: ' + cleanBlocks.length + ' (' + cleanBlocks.filter(function(b){return b.type==='text';}).length + ' text, ' + cleanBlocks.filter(function(b){return b.type==='image';}).length + ' image)',
                '',
                'Admin review: https://archinodekr.com/admin/articles.html'
              ].join('\n')
            }
          }), 10000);
        } catch(mailErr) { console.warn('Admin notification skipped:', mailErr); }

        msg.textContent = '✓ Submitted for review';
        msg.style.color = '#0a0';
        resetForm();
        setTimeout(() => {
          $('articleForm').style.display = 'none';
          $('addArticleBtn').style.display = 'inline-block';
          msg.textContent = '';
          if (typeof loadArticles === 'function') loadArticles();
          // R-027: 목록만 다시 읽으면 위쪽 통계 카드가 옛 숫자로 남는다 (제품 쪽과 같은 문제)
          if (typeof window.loadStats === 'function') window.loadStats();
        }, 1500);
      } catch (e) {
        msg.textContent = (e.message === 'ARCHINODE_TIMEOUT')
          ? 'Connection seems slow or offline. Please check your network and try again.'
          : 'Submit failed: ' + e.message;
        msg.style.color = '#c00';
      } finally {
        btn.disabled = false; btn.textContent = 'Submit for Review';
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
