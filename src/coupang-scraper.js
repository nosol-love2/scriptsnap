/**
 * 쿠팡 파트너스 수익 스크래핑
 *
 * 기존 engine.js의 CDP 연결을 활용하여
 * Chrome 프로필에 저장된 쿠팡 로그인 세션으로 수익 데이터를 가져온다.
 */

const path = require('path');
const fs = require('fs');
const engine = require('./browser/engine');

const REVENUE_PATH = path.join(__dirname, '..', 'data', 'revenue.json');

function loadRevenue() {
  try {
    if (fs.existsSync(REVENUE_PATH)) {
      return JSON.parse(fs.readFileSync(REVENUE_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveRevenue(data) {
  const dir = path.dirname(REVENUE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REVENUE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 쿠팡 파트너스 수익 리포트 페이지에서 데이터 스크래핑
 */
async function syncRevenue() {
  let page = null;

  try {
    console.log('[coupang] 수익 동기화 시작...');

    const { page: newPage } = await engine.launch();
    page = newPage;

    // 쿠팡 파트너스 리포트 페이지로 이동
    console.log('[coupang] 쿠팡 파트너스 리포트 페이지 이동...');
    await page.goto('https://partners.coupang.com/#affiliate/reports/performance', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // 로그인 상태 확인
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      throw new Error('쿠팡 파트너스 로그인이 필요합니다. Chrome에서 먼저 로그인해주세요.');
    }

    // 리포트 테이블 데이터 추출 시도
    const scrapedData = await page.evaluate(() => {
      const results = [];

      // 요약 영역에서 커미션 데이터 찾기
      const summaryTexts = document.querySelectorAll(
        '.summary-value, .commission-value, .report-summary td, ' +
        '[class*="commission"], [class*="revenue"], [class*="earning"]'
      );

      // 테이블 행에서 데이터 추출
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const texts = Array.from(cells).map(c => c.textContent.trim());
            results.push(texts);
          }
        }
      }

      // 페이지의 주요 수치 텍스트도 수집
      const allText = document.body.innerText;

      // 커미션 관련 숫자 패턴 찾기 (₩ 또는 원)
      const commissionMatches = allText.match(/(?:커미션|수익|commission|earning)[^\d]*?([\d,]+)\s*원?/gi) || [];
      const totalMatches = allText.match(/(?:합계|총|total)[^\d]*?([\d,]+)\s*원?/gi) || [];

      return {
        tables: results.slice(0, 50),
        commissionTexts: commissionMatches.slice(0, 10),
        totalTexts: totalMatches.slice(0, 10),
        pageTitle: document.title,
        bodySnippet: allText.slice(0, 2000),
      };
    });

    console.log('[coupang] 페이지 데이터 수집 완료');
    console.log(`[coupang] 테이블 행: ${scrapedData.tables.length}, 커미션 텍스트: ${scrapedData.commissionTexts.length}`);

    // 수집한 데이터 파싱하여 revenue.json에 저장
    const today = new Date().toISOString().slice(0, 10);
    const entries = loadRevenue();
    let newEntries = 0;

    // 테이블 데이터에서 날짜별 커미션 추출
    for (const row of scrapedData.tables) {
      // 날짜 패턴 찾기 (YYYY-MM-DD 또는 YYYY.MM.DD 또는 MM/DD)
      const dateCell = row.find(cell => /\d{4}[-./]\d{2}[-./]\d{2}/.test(cell));
      // 금액 패턴 찾기 (숫자+원 또는 ₩+숫자)
      const amountCell = row.find(cell => /[\d,]+\s*원|₩\s*[\d,]+/.test(cell));

      if (dateCell && amountCell) {
        const dateMatch = dateCell.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
        const amountMatch = amountCell.match(/([\d,]+)/);

        if (dateMatch && amountMatch) {
          const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          const amount = Number(amountMatch[1].replace(/,/g, ''));

          if (amount > 0) {
            // 중복 체크: 같은 날짜의 쿠팡 수익이 이미 있으면 스킵
            const exists = entries.some(e =>
              e.date === date && e.type === 'coupang' && e.note === '자동 동기화'
            );

            if (!exists) {
              entries.push({
                date,
                type: 'coupang',
                amount,
                note: '자동 동기화',
                time: new Date().toISOString(),
              });
              newEntries++;
            }
          }
        }
      }
    }

    // 커미션 텍스트에서 오늘 수익 추출 시도
    if (newEntries === 0 && scrapedData.commissionTexts.length > 0) {
      for (const text of scrapedData.commissionTexts) {
        const match = text.match(/([\d,]+)/);
        if (match) {
          const amount = Number(match[1].replace(/,/g, ''));
          if (amount > 0) {
            const exists = entries.some(e =>
              e.date === today && e.type === 'coupang' && e.note === '자동 동기화'
            );
            if (!exists) {
              entries.push({
                date: today,
                type: 'coupang',
                amount,
                note: '자동 동기화',
                time: new Date().toISOString(),
              });
              newEntries++;
              break;
            }
          }
        }
      }
    }

    if (newEntries > 0) {
      saveRevenue(entries);
    }

    console.log(`[coupang] 동기화 완료: ${newEntries}건 추가`);

    return {
      newEntries,
      scraped: {
        tableRows: scrapedData.tables.length,
        commissionTexts: scrapedData.commissionTexts.length,
        pageTitle: scrapedData.pageTitle,
      },
      message: newEntries > 0
        ? `${newEntries}건의 수익 데이터를 동기화했습니다.`
        : '새로운 수익 데이터가 없습니다. (이미 동기화되었거나 데이터를 찾을 수 없음)',
      bodySnippet: scrapedData.bodySnippet,
    };
  } finally {
    try { await engine.close(page); } catch {}
  }
}

module.exports = { syncRevenue };
