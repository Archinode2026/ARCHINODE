// ARCHINODE — 검증용 계정 만들기 (2026-09-12 신설, 단번 tools/make-reviewer.js 축약)
//
// Firebase Auth 계정을 만든다. 비밀번호는 만들지 않는다(로그인은 bronze-token.js 브리지로만).
// 이미 있으면 그대로 두고 uid 만 알려준다. 지우지 않는다(테스트 데이터 규칙). 인증은 tools/_cred.js.
//
// 실행 (tools 폴더에서 npm install 먼저):
//   node tools/make-qa-user.js                                               → qa-bronze@archinodekr.com (어드민 화이트리스트 계정)
//   node tools/make-qa-user.js --email qa-brand@archinodekr.com --brand      → [테스트-브론즈] 브랜드 계정 + brands 문서(approved)
//   node tools/make-qa-user.js --email qa-pro@archinodekr.com --pro          → [테스트-브론즈] 전문가 계정 + users 문서
//
// ⚠️ qa-bronze 가 어드민으로 동작하려면 firebase-config.js 의 ADMIN_EMAILS 와 firestore.rules 의 isAdmin() 두 곳에
//    그 이메일이 들어 있어야 한다(코드·규칙 변경은 화이트 → 지휘 창 배포). 이 스크립트는 계정만 만든다.

const { initAdmin, arg } = require('./_cred');
const has = (n) => process.argv.includes(n);
const email = arg('--email', 'qa-bronze@archinodekr.com');

(async () => {
  const { admin, how, who, from } = initAdmin();
  console.log(`[인증] ${how} (${who}) · firebase-admin ← ${from}`);
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  let user;
  try { user = await admin.auth().getUserByEmail(email); console.log(`[있음] ${email} → uid ${user.uid}`); }
  catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await admin.auth().createUser({ email, emailVerified: true, displayName: '[테스트-브론즈] ' + email.split('@')[0], disabled: false });
    console.log(`[생성] ${email} → uid ${user.uid}`);
  }

  if (has('--brand')) {
    const ref = db.collection('brands').doc(user.uid);
    if ((await ref.get()).exists) { console.log('[있음] brands 문서'); }
    else {
      await ref.set({
        brandName: '[테스트-브론즈] QA Brand', slug: 'test-bronze-qa-brand', email, contactName: '[테스트-브론즈]', position: 'QA', phone: '010-0000-0001',
        country: 'Korea', category: 'Furniture', website: 'https://archinodekr.com', description: '[테스트-브론즈] 자동 검수용 브랜드. 지우지 마세요 — 오픈 전 일괄 정리 대상.',
        referral: 'QA', status: 'approved', statusReason: '[테스트-브론즈] 검증용 승인', createdAt: now, updatedAt: now,
        history: [{ status: 'approved', by: 'make-qa-user.js', at: new Date().toISOString(), note: '[테스트-브론즈] 검증용 생성' }],
      });
      console.log('[생성] brands/' + user.uid + ' (approved, [테스트-브론즈])');
    }
  }
  if (has('--pro')) {
    const ref = db.collection('users').doc(user.uid);
    if ((await ref.get()).exists) { console.log('[있음] users 문서'); }
    else {
      await ref.set({ name: '[테스트-브론즈] QA Pro', email, company: '[테스트-브론즈]', profession: 'architect', role: 'professional', createdAt: now, likes: { products: [], brands: [] } });
      console.log('[생성] users/' + user.uid + ' ([테스트-브론즈])');
    }
  }
  console.log('\n만든 것은 지우지 않습니다. 목록: ' + email + (has('--brand') ? ' + brands 문서' : '') + (has('--pro') ? ' + users 문서' : ''));
  process.exit(0);
})().catch((e) => { console.error('[오류]', e.message || e); process.exit(1); });
