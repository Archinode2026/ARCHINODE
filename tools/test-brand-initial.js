#!/usr/bin/env node
/* 브랜드 머리글자 — 두 사본이 같은 답을 내는지 (검수대장 A-444)
 *
 * 왜 있나
 *   `brandInitial` 이 `brands.html` 과 `brands/view.html` **두 곳**에 따로 있다.
 *   A-407 에서 카테고리 대응표 사본 셋이 어긋난 적이 있으므로, 사본이 둘이면
 *   둘이 같은 답을 내는지 기계가 봐야 한다.
 *
 *   그리고 이 함수는 **원시 이름**을 받아야 한다. 이스케이프된 문자열을 주면
 *   `&Tradition` → `&amp;Tradition` → 답이 `A` 가 되어 조용히 틀린다.
 *   `brands/view.html` 에는 이미 이스케이프된 `brandName` 변수가 바로 위에 있어서
 *   헷갈리기 쉽다 — 호출부가 원시 값을 주는지도 여기서 본다.
 *
 * 실행: node tools/test-brand-initial.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const fails = [];
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  통과  ' + label); }
    else { fails.push(label + (detail ? ' — ' + detail : '')); console.log('  어긋남 ' + label + (detail ? ' — ' + detail : '')); }
}

// 중괄호 짝을 세어 함수 하나를 떼어 온다
function extract(src, header) {
    const i = src.indexOf(header);
    if (i < 0) return null;
    let depth = 0, j = src.indexOf('{', i);
    if (j < 0) return null;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
    }
    return null;
}

const FILES = ['brands.html', path.join('brands', 'view.html')];
const fns = {};
for (const rel of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const code = extract(src, 'function brandInitial(name)');
    if (!code) { fails.push(rel + ': brandInitial 을 떼어내지 못했다 — 모양이 바뀌었나'); continue; }
    fns[rel] = new Function(code + '; return brandInitial;')();
}

console.log('브랜드 머리글자 시험\n');
console.log('[1] 두 사본이 다 있다');
ok('brands.html 에서 함수를 떼어냈다', !!fns['brands.html']);
ok('brands/view.html 에서 함수를 떼어냈다', !!fns[path.join('brands', 'view.html')]);

const CASES = [
    ['&Tradition', 'T', '기호로 시작하는 실제 브랜드'],
    ['+Halle', 'H', '기호로 시작하는 실제 브랜드'],
    ['101 Copenhagen', '1', '숫자로 시작하는 실제 브랜드'],
    ['[테스트-브론즈] QA Brand', '테', '괄호로 시작'],
    ['oska', 'O', '소문자 → 대문자'],
    ['테스트', '테', '한글'],
    ['"quoted"', 'Q', '따옴표로 시작'],
    ['  spaced', 'S', '앞 공백'],
    ['', '?', '빈 문자열'],
    [null, '?', 'null'],
    [undefined, '?', 'undefined'],
    ['---', '?', '글자가 하나도 없다'],
    ['&amp;Tradition', 'A', '★ 이스케이프된 값을 주면 조용히 틀린다 — 호출부는 원시 값을 줘야 한다'],
];

console.log('\n[2] 값마다 두 사본이 같은 답을 낸다');
for (const [input, want, why] of CASES) {
    const got = [];
    for (const rel of FILES) if (fns[rel]) got.push([rel, fns[rel](input)]);
    const same = got.length === FILES.length && got.every(([, v]) => v === got[0][1]);
    const right = got.length > 0 && got[0][1] === want;
    ok(JSON.stringify(input) + ' → ' + JSON.stringify(want) + '  (' + why + ')',
       same && right, got.map(([r, v]) => r + '=' + JSON.stringify(v)).join(' / '));
}

console.log('\n[3] 호출부가 원시 이름을 넘긴다');
const view = fs.readFileSync(path.join(ROOT, 'brands', 'view.html'), 'utf8');
ok('brands/view.html 이 brandInitial(brand.brandName) 로 부른다 (이스케이프된 brandName 이 아니다)',
   /brandInitial\(\s*brand\.brandName\s*\)/.test(view) && !/brandInitial\(\s*brandName\s*\)/.test(view));
const list = fs.readFileSync(path.join(ROOT, 'brands.html'), 'utf8');
ok('brands.html 이 brandInitial(b.brandName) 로 부른다',
   /brandInitial\(\s*b\.brandName\s*\)/.test(list));

console.log('\n────────────────────────────────────────');
if (fails.length) {
    console.log('어긋난 시험 %d개 / 통과 %d개\n', fails.length, pass);
    fails.forEach((f) => console.log('  · ' + f));
    process.exit(1);
}
console.log('머리글자 시험 — 통과 %d개, 어긋난 것 없음', pass);
