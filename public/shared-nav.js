/**
 * SolSet 공통 네비게이션 + 교차 프로모션
 *
 * 각 서비스에서 <script src="/shared-nav.js"></script> 로 로드
 * - 상단 네비: 서비스별 고유 컬러, 활성 탭 강조
 * - 하단 교차 프로모션: 다른 서비스 유도 카드 (페이지뷰↑ 수익↑)
 */
(function () {
  const SERVICES = [
    {
      id: 'scriptsnap',
      name: 'ScriptSnap',
      desc: '유튜브 자막 추출',
      href: '/',
      icon: '🎬',
      color: '#E74C3C',
      colorLight: '#FDEDEC',
      colorDark: '#C0392B',
      promo: '유튜브 영상 → 자막 텍스트 변환',
      promoSub: 'URL만 넣으면 즉시 추출, 완전 무료',
    },
    {
      id: 'lunch',
      name: '점심뭐먹지',
      desc: '점심 메뉴 추천',
      href: '/lunch/',
      icon: '🍱',
      color: '#3182F6',
      colorLight: '#EBF3FE',
      colorDark: '#1B64DA',
      promo: '6가지 취향으로 찾는 오늘의 점심',
      promoSub: '30초 테스트로 메뉴 고민 해결',
    },
    // ─ 새 서비스 추가 ─
  ];

  const path = location.pathname;
  function isActive(s) {
    if (s.href === '/') return path === '/' || path === '/index.html';
    return path.startsWith(s.href);
  }

  const current = SERVICES.find(isActive) || SERVICES[0];
  const others = SERVICES.filter(s => s.id !== current.id);

  // ── 스타일 ──
  const style = document.createElement('style');
  style.textContent = `
    /* ═══ 상단 네비게이션 ═══ */
    .snav {
      background: #fff;
      border-bottom: 1px solid #F2F3F5;
      font-family: 'Noto Sans KR', -apple-system, 'Segoe UI', sans-serif;
      position: sticky;
      top: 0;
      z-index: 9999;
    }
    .snav-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      height: 48px;
      gap: 6px;
    }
    .snav-brand {
      font-size: 15px;
      font-weight: 800;
      color: #191F28;
      text-decoration: none;
      white-space: nowrap;
      letter-spacing: -0.3px;
    }
    .snav-brand em {
      font-style: normal;
      color: ${current.color};
    }
    .snav-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: #D1D6DB;
      margin: 0 8px;
    }
    .snav-links {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .snav-links::-webkit-scrollbar { display: none; }
    .snav-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      color: #8B95A1;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .snav-link:hover {
      background: #F7F8F9;
      color: #4E5968;
    }
    .snav-link .snav-icon { font-size: 15px; }
    .snav-link .snav-name { line-height: 1; }

    /* 활성 탭 — 서비스 컬러 적용 */
    ${SERVICES.map(s => `
      .snav-link[data-id="${s.id}"].active {
        background: ${s.colorLight};
        color: ${s.color};
        font-weight: 700;
      }
    `).join('')}

    /* ═══ 교차 프로모션 카드 ═══ */
    .snav-promo-wrap {
      max-width: 600px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .snav-promo {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border-radius: 14px;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s;
      margin-bottom: 12px;
    }
    .snav-promo:active { transform: scale(0.98); }
    .snav-promo-icon {
      width: 48px; height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }
    .snav-promo-text { flex: 1; min-width: 0; }
    .snav-promo-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .snav-promo-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .snav-promo-sub {
      font-size: 12px;
      margin-top: 2px;
      opacity: 0.7;
    }
    .snav-promo-arrow {
      font-size: 18px;
      flex-shrink: 0;
      opacity: 0.5;
    }

    /* 프로모 카드 — 서비스별 컬러 */
    ${SERVICES.map(s => `
      .snav-promo[data-id="${s.id}"] {
        background: ${s.colorLight};
        color: ${s.color};
      }
      .snav-promo[data-id="${s.id}"] .snav-promo-icon {
        background: ${s.color};
        color: #fff;
      }
      .snav-promo[data-id="${s.id}"] .snav-promo-title {
        color: #191F28;
      }
      .snav-promo[data-id="${s.id}"] .snav-promo-sub {
        color: #4E5968;
      }
    `).join('')}

    /* ═══ 다크모드 페이지 대응 (ScriptSnap 등) ═══ */
    body[data-theme="dark"] .snav,
    .dark-page .snav {
      background: #1a1b23;
      border-bottom-color: #27272a;
    }
    body[data-theme="dark"] .snav-brand,
    .dark-page .snav-brand { color: #fff; }
    body[data-theme="dark"] .snav-dot,
    .dark-page .snav-dot { background: #3f3f46; }
    body[data-theme="dark"] .snav-link,
    .dark-page .snav-link { color: #71717a; }
    body[data-theme="dark"] .snav-link:hover,
    .dark-page .snav-link:hover {
      background: #27272a;
      color: #a1a1aa;
    }
    ${SERVICES.map(s => `
      body[data-theme="dark"] .snav-link[data-id="${s.id}"].active,
      .dark-page .snav-link[data-id="${s.id}"].active {
        background: ${s.color}22;
        color: ${s.color};
      }
    `).join('')}

    /* 다크모드 프로모 */
    ${SERVICES.map(s => `
      body[data-theme="dark"] .snav-promo[data-id="${s.id}"],
      .dark-page .snav-promo[data-id="${s.id}"] {
        background: ${s.color}18;
      }
      body[data-theme="dark"] .snav-promo[data-id="${s.id}"] .snav-promo-title,
      .dark-page .snav-promo[data-id="${s.id}"] .snav-promo-title {
        color: #e4e4e7;
      }
      body[data-theme="dark"] .snav-promo[data-id="${s.id}"] .snav-promo-sub,
      .dark-page .snav-promo[data-id="${s.id}"] .snav-promo-sub {
        color: #a1a1aa;
      }
    `).join('')}

    @media (max-width: 480px) {
      .snav-inner { padding: 0 14px; height: 44px; }
      .snav-brand { font-size: 14px; }
      .snav-link { font-size: 12px; padding: 5px 10px; }
      .snav-promo-wrap { padding: 0 16px; }
    }
  `;
  document.head.appendChild(style);

  // ── 네비게이션 바 ──
  const nav = document.createElement('div');
  nav.className = 'snav';
  nav.innerHTML = `
    <div class="snav-inner">
      <a href="/" class="snav-brand"><em>Sol</em>Set</a>
      <div class="snav-dot"></div>
      <div class="snav-links">
        ${SERVICES.map(s => `
          <a href="${s.href}" class="snav-link${isActive(s) ? ' active' : ''}" data-id="${s.id}">
            <span class="snav-icon">${s.icon}</span>
            <span class="snav-name">${s.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  // ScriptSnap 페이지는 다크 배경이므로 다크모드 클래스 추가
  if (current.id === 'scriptsnap') {
    document.body.classList.add('dark-page');
  }

  // ── 교차 프로모션 카드 (페이지 하단에 다른 서비스 유도) ──
  if (others.length > 0) {
    // 삽입 위치: footer 앞 또는 body 끝
    function insertPromo() {
      const wrap = document.createElement('div');
      wrap.className = 'snav-promo-wrap';

      others.forEach(s => {
        wrap.innerHTML += `
          <a href="${s.href}" class="snav-promo" data-id="${s.id}">
            <div class="snav-promo-icon">${s.icon}</div>
            <div class="snav-promo-text">
              <div class="snav-promo-label">${s.desc}</div>
              <div class="snav-promo-title">${s.promo}</div>
              <div class="snav-promo-sub">${s.promoSub}</div>
            </div>
            <div class="snav-promo-arrow">&rarr;</div>
          </a>
        `;
      });

      // 적절한 삽입 위치 찾기
      const footer = document.querySelector('.footer, footer, .cpg-disclosure');
      const supportSection = document.querySelector('.support-section');
      if (supportSection) {
        supportSection.parentNode.insertBefore(wrap, supportSection);
      } else if (footer) {
        footer.parentNode.insertBefore(wrap, footer);
      } else {
        document.body.appendChild(wrap);
      }
    }

    // DOM 준비 후 삽입
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', insertPromo);
    } else {
      // 약간 지연 — 각 페이지 JS가 DOM 빌드 완료한 뒤 삽입
      setTimeout(insertPromo, 100);
    }
  }
})();
