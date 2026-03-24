/**
 * ScriptSnap 공통 상단 네비게이션
 * 모든 서브 페이지에서 <script src="/shared-nav.js"></script> 로 로드
 */
(function () {
  const SERVICES = [
    { name: 'ScriptSnap', desc: '유튜브 자막 추출', href: '/', icon: '🎬' },
    { name: '점심뭐먹지', desc: '점심 메뉴 추천', href: '/lunch/', icon: '🍱' },
    // 새 서비스 추가 시 여기에 추가
  ];

  // 현재 경로로 활성 서비스 판별
  const path = location.pathname;
  function isActive(href) {
    if (href === '/') return path === '/' || path === '/index.html';
    return path.startsWith(href);
  }

  // 스타일 주입
  const style = document.createElement('style');
  style.textContent = `
    .snav {
      background: #111118;
      border-bottom: 1px solid #222;
      font-family: -apple-system, 'Segoe UI', sans-serif;
      position: relative;
      z-index: 9999;
    }
    .snav-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 16px;
      display: flex;
      align-items: center;
      height: 40px;
      gap: 4px;
    }
    .snav-brand {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      margin-right: 12px;
      text-decoration: none;
      white-space: nowrap;
    }
    .snav-brand span { color: #ef4444; }
    .snav-sep {
      width: 1px;
      height: 16px;
      background: #333;
      margin: 0 8px;
    }
    .snav-links {
      display: flex;
      gap: 2px;
      overflow-x: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .snav-links::-webkit-scrollbar { display: none; }
    .snav-link {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
      color: #888;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .snav-link:hover {
      background: #1e1e2a;
      color: #ccc;
    }
    .snav-link.active {
      background: #1e1e2a;
      color: #fff;
      font-weight: 600;
    }
    .snav-icon { font-size: 14px; }

    /* 모바일 */
    @media (max-width: 480px) {
      .snav-inner { padding: 0 10px; }
      .snav-brand { font-size: 12px; margin-right: 6px; }
      .snav-link { font-size: 11px; padding: 4px 8px; }
    }
  `;
  document.head.appendChild(style);

  // HTML 생성
  const nav = document.createElement('div');
  nav.className = 'snav';
  nav.innerHTML = `
    <div class="snav-inner">
      <a href="/" class="snav-brand"><span>Sol</span>Set</a>
      <div class="snav-sep"></div>
      <div class="snav-links">
        ${SERVICES.map(s => `
          <a href="${s.href}" class="snav-link${isActive(s.href) ? ' active' : ''}">
            <span class="snav-icon">${s.icon}</span>
            ${s.name}
          </a>
        `).join('')}
      </div>
    </div>
  `;

  // body 최상단에 삽입
  document.body.insertBefore(nav, document.body.firstChild);
})();
