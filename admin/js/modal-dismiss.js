/* 사유 입력 창을 **언제 닫아도 되는가** — A-689
 *
 * 왜 있나
 * -------
 * 승리님 보고(2026-11-25): 「삭제할 때 쓰는 창이 다른 화면 누르면 그냥 꺼진다.
 * 메시지를 다 입력하고 컨펌을 누르기 전까지는 안 꺼지게 해 달라」
 *
 * 열어 보니 `#modal` 을 닫는 길이 넷인데 **셋이 약속(Promise)을 안 풀었다**:
 *   · 바깥 클릭  → closeModal()      — 약속 미해결
 *   · X 단추     → closeModal()      — 약속 미해결
 *   · hashchange → closeModal()      — 약속 미해결
 *   · Esc·취소·확인 → safeResolve()  — 해결
 * 그래서 X 를 누르면 창은 사라지는데 `await openReasonModal(...)` 이 **영영
 * 안 돌아온다.** 어드민 눈에는 「아무 일도 안 일어난 것」으로 보인다.
 * 적은 글이 날아가는 것보다 이쪽이 더 조용하고 더 나쁘다.
 *
 * 규칙
 * ----
 *   바깥 클릭   → 무시한다 (승리님이 말씀하신 바로 그 자리)
 *   탭 이동     → 무시한다. 적던 글을 저 때문에 잃지 않는다
 *   X 단추      → **취소로 친다.** 분명한 의사표시이고, 창을 닫을 길이
 *                 하나도 없으면 그게 갇힘이다
 *   취소        → 취소
 *   확인        → 확인
 *   Esc         → **적은 글이 없을 때만** 취소. 글이 있으면 무시한다.
 *                 Esc 를 아예 막으면 키보드만 쓰는 사람이 닫을 길이 줄고,
 *                 그대로 두면 한 번 잘못 눌러 200자가 날아간다. 적은 것이
 *                 없을 때만 듣는 쪽이 둘 다 지킨다.
 *
 * ★ 이 규칙을 순수 함수로 떼어 둔 까닭: 어드민 화면은 로그인이 있어야 열려
 *   노드가 눈으로 못 본다(A-657·A-680 과 같은 사각지대). 눈으로 못 보는
 *   자리일수록 **판단을 순수 함수에 두고 시험으로 묶어야** 한다.
 */
(function (w) {
    'use strict';

    /**
     * @param {string} source  'backdrop' | 'hash' | 'x' | 'cancel' | 'confirm' | 'escape'
     * @param {boolean} hasText 사유 칸에 적은 글이 있는가
     * @returns {'ignore'|'cancel'|'confirm'}
     */
    function reasonDismiss(source, hasText) {
        switch (source) {
            case 'confirm': return 'confirm';
            case 'cancel':
            case 'x':       return 'cancel';
            case 'escape':  return hasText ? 'ignore' : 'cancel';
            case 'backdrop':
            case 'hash':    return 'ignore';
            default:        return 'ignore';   // 모르는 길은 닫지 않는다
        }
    }

    w.reasonDismiss = reasonDismiss;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { reasonDismiss: reasonDismiss };
    }
})(typeof window !== 'undefined' ? window : globalThis);
