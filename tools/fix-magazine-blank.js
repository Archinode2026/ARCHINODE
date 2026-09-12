// ARCHINODE — 매거진 기사 백지 복구 (검수대장 A-013, 2026-09-12 노드-화이트)
//
// 증상: magazine/*.html 일부가 <style> 블록 안 `.article-hero{… url('../assets/magazine/placeholders/X.svg` 에서
//       잘린 채 곧바로 공지 바 마크업(`"announcement-bar">…`)이 이어진다. 즉 원본에서
//       `'); background-size: cover; background-position: center; }` + 나머지 CSS 20줄 + `</style></head><body><div class="`
//       구간이 통째로 빠졌다. `</style>`·`</head>`·`<body>`가 없어 브라우저가 문서 전체를 CSS로 읽고 화면이 흰색이 된다.
// 규칙: 잘린 자리 `X.svg"announcement-bar">` 를 정상본(REFS)에서 뽑은 CSS 꼬리 + `</style>\n</head>\n<body>\n<div class="announcement-bar">` 로 치환.
//       정상본은 기사마다 배경 그라데이션(0.6/0.78 · 0.55/0.75)과 줄바꿈 형식이 조금씩 달라, 잘린 파일의 모양에 맞는 정상본을 고른다.
//       기사 본문은 한 글자도 바꾸지 않는다(삽입만). 규칙과 정확히 안 맞는 파일은 건너뛰고 사유를 출력한다.
// 실행:  node tools/fix-magazine-blank.js            → 검사만(dry-run). 대상·건너뜀·삽입 미리보기.
//        node tools/fix-magazine-blank.js --write    → 실제 저장. 끝에 `git add magazine/…` 목록을 출력한다(그대로 붙여넣기).
// 재발 시(자동 발행 템플릿이 또 잘린 원본을 복제하면) 그대로 다시 돌리면 된다.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAG = path.join(ROOT, 'magazine');
const WRITE = process.argv.includes('--write');

// 정상본(대조 기준). 잘린 파일의 모양(그라데이션·줄바꿈)에 따라 하나를 고른다.
//  A: 0.6/0.78 그라데이션, CSS 한 줄 형식  — 정상 75건(view.html 포함) 중 70건이 이 형식(construction-material-supply-shock 등 24건은 URL까지 동일).
//  B: 0.55/0.75 그라데이션, CSS 한 줄 형식 — 05-06 e985d7c 동기 발행분(korea-build-week).
//  C: 0.55/0.75 그라데이션, 미디어쿼리 여러 줄 형식 + 공지 바·헤더 여러 줄 마크업 — 05-06 e985d7c 동기 발행분(bottega-veneta).
const REFS = {
  A: 'construction-material-supply-shock-asphalt-insulation-2026.html',
  B: 'korea-build-week-2026-new-materials.html',
  C: 'bottega-veneta-kwangho-lee-lightful.html',
};

// 잘린 자리. placeholders/<이름>.svg 바로 뒤에 `"announcement-bar">` 가 붙어 있어야 한다(정확히 1회).
const CUT_RE = /url\('\.\.\/assets\/magazine\/placeholders\/([a-z]+)\.svg"announcement-bar">/g;

function count(s, needle) { return s.split(needle).length - 1; }

// 정상본의 <style> 블록에서 `.article-hero{… url('…')` 뒤 꼬리를 뽑는다.
//  heroTail : url 닫는 `')` 뒤 ~ 그 줄 끝 (예: `; background-size: cover; background-position: center; }`)
//  rest     : 그 다음 줄부터 `</style>` 직전까지의 CSS 줄들
function loadRef(name) {
  const p = path.join(MAG, name);
  const raw = fs.readFileSync(p, 'utf8');
  if (count(raw, '<style>') !== 1 || count(raw, '</style>') !== 1 || count(raw, '</head>') !== 1 || count(raw, '<body>') !== 1) {
    throw new Error(`정상본 ${name} 이 정상이 아니다(style/head/body 태그 수) — 다른 정상본을 REFS에 지정할 것`);
  }
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const s = lines.indexOf('<style>');
  const e = lines.indexOf('</style>');
  const heroIdx = lines.findIndex((l, i) => i > s && i < e && l.startsWith('.article-hero {') && l.includes("url('"));
  if (heroIdx < 0) throw new Error(`정상본 ${name} 에서 .article-hero url 줄을 못 찾음`);
  const hero = lines[heroIdx];
  const close = hero.indexOf("')", hero.indexOf("url('"));
  if (close < 0) throw new Error(`정상본 ${name} .article-hero url 닫힘 없음`);
  const heroTail = hero.slice(close + 2);              // "; background-size: cover; background-position: center; }"
  const rest = lines.slice(heroIdx + 1, e);            // 나머지 CSS 줄들
  if (!heroTail.includes('background-size') || rest.length < 15 || !rest.some(l => l.startsWith('@media'))) {
    throw new Error(`정상본 ${name} CSS 꼬리 모양이 예상과 다름 — 사람이 확인할 것`);
  }
  return { name, heroTail, rest };
}

// 잘린 파일이 어느 정상본 형식인지 판정
function pickVariant(text) {
  const multiHero = /\n\.article-hero \{\n/.test(text);          // `.article-hero {` 가 여러 줄 형식(tailored-classic 1건)
  const g = text.match(/linear-gradient\(rgba\(10,10,10,(0\.\d+)\), rgba\(10,10,10,(0\.\d+)\)\)/);
  if (!g) return null;
  const grad = `${g[1]}/${g[2]}`;
  if (multiHero) return grad === '0.55/0.75' ? 'C' : null;
  if (grad === '0.6/0.78') return 'A';
  if (grad === '0.55/0.75') return 'B';
  return null;
}

function buildInsert(ref, variant, eol) {
  // 여러 줄 형식(C)은 `.article-hero {` 규칙 자체도 여러 줄이라 닫는 부분을 같은 형식으로 맞춘다.
  const heroClose = variant === 'C'
    ? `');${eol}  background-size: cover;${eol}  background-position: center;${eol}}`
    : `')${ref.heroTail}`;
  return heroClose + eol + ref.rest.join(eol) + eol + '</style>' + eol + '</head>' + eol + '<body>' + eol + '<div class="announcement-bar">';
}

function main() {
  const refs = { A: loadRef(REFS.A), B: loadRef(REFS.B), C: loadRef(REFS.C) };
  const files = fs.readdirSync(MAG).filter(f => f.endsWith('.html')).sort();

  const fixed = [], skipped = [], normal = [];
  for (const f of files) {
    const p = path.join(MAG, f);
    const raw = fs.readFileSync(p, 'utf8');
    const broken = count(raw, '</style>') === 0 || count(raw, '<body') === 0;
    if (!broken) { normal.push(f); continue; }

    // (a) 잘린 지점이 규칙과 정확히 일치하는지
    const reasons = [];
    if (count(raw, '<style>') !== 1) reasons.push(`<style> ${count(raw, '<style>')}회`);
    if (count(raw, '</style>') !== 0) reasons.push(`</style> 있음`);
    if (count(raw, '</head>') !== 0) reasons.push(`</head> 있음`);
    if (count(raw, '<body') !== 0) reasons.push(`<body 있음`);
    if (count(raw, '</body>') !== 1) reasons.push(`</body> ${count(raw, '</body>')}회`);
    if (count(raw, '</html>') !== 1) reasons.push(`</html> ${count(raw, '</html>')}회`);
    const cuts = [...raw.matchAll(CUT_RE)];
    if (cuts.length !== 1) reasons.push(`잘린 자리 패턴 ${cuts.length}회(1회여야)`);
    const variant = pickVariant(raw);
    if (!variant) reasons.push('그라데이션/줄바꿈 형식이 정상본 A·B·C 어느 것과도 안 맞음');
    if (reasons.length) { skipped.push({ f, why: reasons.join(', ') }); continue; }

    // (b) 삽입
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const ref = refs[variant];
    const insert = buildInsert(ref, variant, eol);
    const out = raw.replace(CUT_RE, (m, svg) => `url('../assets/magazine/placeholders/${svg}.svg${insert}`);

    // (c) 결과 검사: 태그 각 1회, 줄 수 증가, 원문(잘린 자리 밖)은 그대로
    const chk = [];
    for (const t of ['<style>', '</style>', '</head>', '<body>', '</body>', '</html>']) if (count(out, t) !== 1) chk.push(`${t} ${count(out, t)}회`);
    const before = raw.split('\n').length, after = out.split('\n').length;
    if (after <= before) chk.push(`줄 수 ${before}→${after} 안 늘어남`);
    if (out.length !== raw.length + insert.length - '"announcement-bar">'.length) chk.push('삽입 외 바이트가 달라짐');
    if (chk.length) { skipped.push({ f, why: '결과 검사 실패: ' + chk.join(', ') }); continue; }

    if (WRITE) fs.writeFileSync(p, out, 'utf8');
    fixed.push({ f, variant, before, after });
  }

  console.log(`magazine/*.html ${files.length}건 — 정상 ${normal.length} · 잘림 ${fixed.length + skipped.length} (복구 ${WRITE ? '저장' : '가능'} ${fixed.length} · 건너뜀 ${skipped.length})`);
  console.log(`정상본: A=${REFS.A} · B=${REFS.B} · C=${REFS.C}`);
  for (const x of fixed) console.log(`  ${WRITE ? '복구' : '대상'} [${x.variant}] ${x.f}  줄 ${x.before}→${x.after}`);
  for (const x of skipped) console.log(`  건너뜀 ${x.f} — ${x.why}`);
  if (!WRITE) console.log('\n(검사만 했다. 실제 저장은 --write)');
  if (WRITE && fixed.length) {
    console.log('\n# git add 목록 (경로 지정 — git add -A 금지):');
    console.log('git add ' + fixed.map(x => `magazine/${x.f}`).join(' '));
  }
  process.exitCode = skipped.length ? 1 : 0;
}

main();
