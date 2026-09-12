// ARCHINODE — 테스트 자료 스캔 (읽기 전용, 2026-09-12 신설. 엑사 tools/scan-test-data.js 를 옮김)
//
// 이 스크립트는 절대 아무것도 쓰거나 지우지 않는다 — .get() 만 사용한다.
// 실행:  cd tools ; npm install ; node scan-test-data.js <서비스계정키파일경로>
//        (서비스계정 키는 Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키. 저장소 밖에 둘 것.)
//
// 무엇을 하는가: 아래 COLLECTIONS 의 모든 문서를 읽어, 문자열 필드에 "테스트로 보이는 값"이 있는지 찾아
// 콘솔에 목록으로 출력한다. 삭제는 하지 않는다 — 규정집 1-12 "테스트 데이터는 한울님이 정한 때 한 번에 정리".

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('사용법: node scan-test-data.js <서비스계정키파일경로>');
  process.exit(1);
}

const path = require('path');
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('[중단] firebase-admin 이 없습니다. tools 폴더에서 `npm install` 을 먼저 실행하세요.');
  process.exit(1);
}

const serviceAccount = require(path.resolve(keyPath));

// 프로젝트가 다르면(실수로 다른 열쇠를 넣으면) 즉시 중단 — 방향 착오 방지.
if (serviceAccount.project_id !== 'archinode-8ab04') {
  console.error(`[중단] 이 열쇠는 프로젝트 "${serviceAccount.project_id}" 의 것입니다. archinode-8ab04 가 아닙니다.`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const db = admin.firestore();

// 스캔할 컬렉션 — 루트 CLAUDE.md 5절의 전체 목록.
const COLLECTIONS = [
  'brands', 'products', 'articles', 'users', 'leads', 'trend-submissions',
  'consultations', 'digital-products-notify', 'newsletter-subscribers', 'mail',
];

// "테스트로 보이는 값" 판정. 정식 마커는 [테스트-○○] 하나다. 나머지는 의심 패턴(사람이 최종 확인).
const MARKER = /\[테스트-[^\]]*\]/;
const SUSPECT = [
  /\[TEST[-\]]/i,            // 옛 형식
  /\btest(?:er|ing)?\b/i,     // test, tester, testing
  /테스트|테스터/,
  /@example\.(com|org|net)/i,
  /@test\./i,
  /dummy|sample|lorem/i,
  /브론즈|bronze/i,
];

function walk(value, out, prefix) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') { out.push([prefix, value]); return; }
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, out, `${prefix}[${i}]`)); return; }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return; // Timestamp
    for (const [k, v] of Object.entries(value)) walk(v, out, prefix ? `${prefix}.${k}` : k);
  }
}

(async () => {
  let total = 0, marked = 0, suspect = 0;
  for (const col of COLLECTIONS) {
    let snap;
    try { snap = await db.collection(col).get(); }
    catch (e) { console.log(`\n## ${col} — 읽기 실패: ${e.message}`); continue; }
    const hits = [];
    snap.forEach((doc) => {
      total++;
      const fields = [];
      walk(doc.data(), fields, '');
      const m = fields.filter(([, v]) => MARKER.test(v));
      const s = m.length ? [] : fields.filter(([, v]) => SUSPECT.some((re) => re.test(v)));
      if (m.length) { marked++; hits.push({ id: doc.id, kind: '마커', where: m.slice(0, 3) }); }
      else if (s.length) { suspect++; hits.push({ id: doc.id, kind: '의심', where: s.slice(0, 3) }); }
    });
    console.log(`\n## ${col} — 문서 ${snap.size}개, 마커 ${hits.filter(h => h.kind === '마커').length}, 의심 ${hits.filter(h => h.kind === '의심').length}`);
    for (const h of hits) {
      console.log(`  [${h.kind}] ${h.id}`);
      for (const [f, v] of h.where) console.log(`      ${f} = ${String(v).slice(0, 80).replace(/\n/g, ' ')}`);
    }
  }
  console.log(`\n=== 합계: 문서 ${total}개 · [테스트-] 마커 ${marked}건 · 의심 ${suspect}건 (삭제는 하지 않음 — 사람이 확인) ===`);
  process.exit(0);
})().catch((e) => { console.error('[오류]', e); process.exit(1); });
