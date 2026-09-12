/* ARCHINODE 어드민 서비스워커 (2026-09-12, 어드민 PWA 설치형 — 엑사 EX Works app/sw.js 축약)
 *
 * ★ 캐시 금지 — 엑사·매치보스 규칙, 정식 오픈 전.
 *   일부러 아무것도 캐시하지 않는다. 요청을 그대로 통과시키기만 한다.
 *   이유: 지금은 화면을 계속 고치며 배포하는 단계라, 캐시를 두면 옛 화면이 남아
 *   "새로고침해도 안 바뀐다"가 가장 잡기 어려운 문제가 된다.
 *   이 파일이 필요한 이유는 캐시가 아니라 **앱 설치(PWA) 조건을 충족하기 위해서**다.
 *   범위(scope)는 /admin/ 만 — 공개 페이지에는 붙이지 않는다.
 *
 * 나중에 오프라인 지원이 필요해지면 그때 캐시 전략을 넣되,
 * html·js 는 반드시 network-first 로 둘 것. 안 그러면 배포가 반영되지 않는다.
 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
    // 새 워커가 바로 페이지를 맡고, 혹시 옛 워커가 남긴 캐시가 있으면 전부 지운다(캐시 0 보장)
    e.waitUntil(
        (self.caches ? caches.keys() : Promise.resolve([]))
            .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
            .then(function () { return self.clients.claim(); })
    );
});
self.addEventListener('fetch', function () { /* 통과 — respondWith 없음, 캐시 없음 */ });
