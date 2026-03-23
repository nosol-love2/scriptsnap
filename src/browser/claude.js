/**
 * Claude 웹 자동화 — ScriptSnap 전용
 * night-agent의 base-ai.js + claude.js 패턴을 경량화
 */

const engine = require('./engine');
const selectors = require('../../config/selectors.json');

const TIMEOUT_MS = Number(process.env.ANSWER_TIMEOUT_MS) || 300000;

/**
 * 셀렉터 탐색 (주 → 대체 순서)
 */
async function findElement(page, key, timeout = 5000) {
  const primary = selectors[key];
  const alt = selectors[`${key}_alt`];

  for (const sel of [primary, alt]) {
    if (!sel) continue;
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout });
      return el;
    } catch {}
  }
  return null;
}

/**
 * 새 시크릿 대화 시작
 */
async function newConversation(page) {
  console.log('[claude] 시크릿 대화 시작...');
  await engine.safeGoto(page, 'https://claude.ai/new?incognito');

  // 로그인 체크
  const loginSel = selectors.login_required;
  if (loginSel) {
    const count = await page.locator(loginSel).count();
    if (count > 0) throw new Error('Claude 로그인 필요 — 브라우저에서 먼저 로그인하세요');
  }
  console.log('[claude] 대화 준비 완료');
}

/**
 * 메시지 전송
 */
async function sendMessage(page, text) {
  console.log(`[claude] 메시지 전송 (${text.length}자)`);

  const input = await findElement(page, 'input', 15000);
  if (!input) throw new Error('Claude 입력 필드를 찾을 수 없습니다');

  // 텍스트 입력: 대부분 insertText + 마지막 10자 타이핑
  const TAIL = 10;
  await input.click();
  await page.waitForTimeout(300);

  if (text.length <= TAIL) {
    const delay = { min: Number(process.env.TYPING_DELAY_MIN) || 30, max: Number(process.env.TYPING_DELAY_MAX) || 80 };
    for (const char of text) {
      const d = Math.floor(Math.random() * (delay.max - delay.min + 1)) + delay.min;
      await page.keyboard.type(char, { delay: d });
    }
  } else {
    const pastePart = text.slice(0, -TAIL);
    const typePart = text.slice(-TAIL);

    await page.keyboard.insertText(pastePart);
    await page.waitForTimeout(500);

    const delay = { min: Number(process.env.TYPING_DELAY_MIN) || 30, max: Number(process.env.TYPING_DELAY_MAX) || 80 };
    for (const char of typePart) {
      const d = Math.floor(Math.random() * (delay.max - delay.min + 1)) + delay.min;
      await page.keyboard.type(char, { delay: d });
    }
  }

  // 전송
  const sendBtn = await findElement(page, 'send_button', 5000);
  if (sendBtn) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  console.log('[claude] 메시지 전송 완료');
  await page.waitForTimeout(1000);
}

/**
 * 답변 대기
 */
async function waitForAnswer(page) {
  const startTime = Date.now();
  const baselineCount = await countAnswerContainers(page);

  console.log(`[claude] 답변 대기 시작 (타임아웃: ${TIMEOUT_MS / 1000}초)`);

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT_MS) throw new Error('답변 대기 타임아웃');

    // 로딩 인디케이터 대기
    try {
      const sel = selectors.loading_indicator || selectors.loading_indicator_alt;
      if (sel) {
        await page.waitForSelector(sel, { state: 'hidden', timeout: Math.min(TIMEOUT_MS - elapsed, 60000) });
      }
    } catch {}

    // 전송 버튼 재활성화 확인
    let sendReady = false;
    try {
      const btn = await findElement(page, 'send_button', 1000);
      if (btn) sendReady = !(await btn.isDisabled());
    } catch {}

    // DOM 안정화
    let domStable = false;
    try {
      await engine.waitForStable(page, 3000, 10000);
      domStable = true;
    } catch {}

    // stop 버튼 체크
    let stopVisible = false;
    try {
      const stop = await findElement(page, 'stop_button', 1500);
      stopVisible = stop !== null;
    } catch {}

    if (sendReady && domStable && !stopVisible) {
      // 텍스트 안정성 확인 (5초 간격)
      const lenBefore = await getAnswerLength(page);
      await page.waitForTimeout(5000);
      const lenAfter = await getAnswerLength(page);
      if (lenAfter <= lenBefore) break;
      console.log(`[claude] 텍스트 증가 중 (${lenBefore}→${lenAfter}) → 추가 대기`);
      continue;
    }

    // Fallback: 새 응답 컨테이너 + stop 없음
    const currentCount = await countAnswerContainers(page);
    if (currentCount > baselineCount && !stopVisible && elapsed > 30000) {
      const lenBefore = await getAnswerLength(page);
      await page.waitForTimeout(5000);
      const lenAfter = await getAnswerLength(page);
      if (lenAfter <= lenBefore) {
        console.log('[claude] Fallback 답변 감지');
        break;
      }
    }

    await page.waitForTimeout(2000);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[claude] 답변 완료 (${duration}초)`);
}

/**
 * 답변 텍스트 추출
 */
async function extractAnswer(page) {
  const parts = await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll(
      '.font-claude-response, [data-testid="chat-message-content"]'
    );
    for (const el of elements) {
      const text = el.innerText || '';
      if (text.trim()) results.push(text.trim());
    }
    return results;
  });

  if (parts.length === 0) throw new Error('답변을 찾을 수 없습니다');

  // 마지막 응답 (가장 최신)
  return parts[parts.length - 1];
}

// ─── 헬퍼 ────────────────────────────────────────

async function countAnswerContainers(page) {
  for (const sel of [selectors.answer_container, selectors.answer_container_alt]) {
    if (!sel) continue;
    try {
      const count = await page.locator(sel).count();
      if (count > 0) return count;
    } catch {}
  }
  return 0;
}

async function getAnswerLength(page) {
  try {
    return await page.evaluate(() => {
      let total = 0;
      document.querySelectorAll('.font-claude-response, [data-testid="chat-message-content"]')
        .forEach(el => { total += (el.innerText || '').length; });
      return total;
    });
  } catch { return 0; }
}

module.exports = { newConversation, sendMessage, waitForAnswer, extractAnswer };
