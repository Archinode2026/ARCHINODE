// brand-portal/article-editor.js
// 매거진 블록 에디터 + Firebase Storage 업로드 + Firestore articles 저장
// 의존(dashboard.html 전역): firebase, db, storage, currentUser, brandData

(function() {
  let blocks = [];
  const $ = id => document.getElementById(id);

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
  function resetForm() {
    blocks = [];
    if ($('artTitle')) $('artTitle').value = '';
    if ($('artTag')) $('artTag').value = 'Brand Spotlight';
    if ($('artLang')) $('artLang').value = 'en';
    if ($('artFormMsg')) { $('artFormMsg').textContent = ''; $('artFormMsg').style.color = ''; }
    render();
  }

  // ── 초기화 / 핸들러 바인딩 ──
  function init() {
    if (!$('addArticleBtn') || !$('artBlocks')) return;

    $('addArticleBtn').addEventListener('click', () => {
      // status 가드 (입점 승인 후만 작성 가능)
      const status = window.brandData && window.brandData.status;
      if (status !== 'approved') {
        alert('Article writing is available after your brand is approved.\nCurrent status: ' + (status || 'unknown'));
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

      try {
        const cleanBlocks = blocks
          .filter(b => (b.type === 'text' && b.content && b.content.trim()) || (b.type === 'image' && b.url))
          .map(b => b.type === 'text'
            ? { type: 'text', content: b.content.trim() }
            : { type: 'image', url: b.url, alt: b.alt || '', caption: b.caption || '' }
          );

        await db.collection('articles').add({
          brandId: currentUser.uid,
          brandName: brandData.brandName || '',
          title: title,
          slug: generateSlug(title),
          tag: $('artTag').value,
          blocks: cleanBlocks,
          coverImage: getCoverImage(),
          excerpt: getExcerpt(),
          lang: $('artLang') ? $('artLang').value : 'en',
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        try {
          await db.collection('mail').add({
            to: 'office@archinode.org',
            message: {
              subject: '[ARCHINODE] 매거진 원고 - ' + (brandData.brandName || 'Unknown') + ': ' + title,
              text: [
                '브랜드가 매거진 원고를 제출했습니다.',
                '',
                'Brand: ' + (brandData.brandName || '-'),
                'Title: ' + title,
                'Tag: ' + ($('artTag') ? $('artTag').value : '-'),
                'Lang: ' + ($('artLang') ? $('artLang').value : 'en'),
                'Blocks: ' + cleanBlocks.length + ' (' + cleanBlocks.filter(function(b){return b.type==='text';}).length + ' text, ' + cleanBlocks.filter(function(b){return b.type==='image';}).length + ' image)',
                '',
                'Admin review: https://archinodekr.com/admin/articles.html'
              ].join('\n')
            }
          });
        } catch(mailErr) { console.warn('Admin notification skipped:', mailErr); }

        msg.textContent = '✓ Submitted for review';
        msg.style.color = '#0a0';
        resetForm();
        setTimeout(() => {
          $('articleForm').style.display = 'none';
          $('addArticleBtn').style.display = 'inline-block';
          msg.textContent = '';
          if (typeof loadArticles === 'function') loadArticles();
        }, 1500);
      } catch (e) {
        msg.textContent = 'Submit failed: ' + e.message;
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
