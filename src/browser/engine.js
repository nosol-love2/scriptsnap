/**
 * Playwright 브라우저 엔진 — CDP 연결 (night-agent 경량화 버전)
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');

let _browser = null;
let _context = null;

const CDP_PORT = Number(process.env.CDP_PORT) || 9222;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

/**
 * CDP 포트 응답 확인
 */
async function isCdpReady() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Chrome을 디버그 모드로 시작
 */
async function startChromeDebug() {
  const profilePath = (process.env.CHROME_PROFILE_PATH
    || `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`)
    .replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
  const profileName = process.env.CHROME_PROFILE_NAME || 'Profile 2';

  // 기존 Chrome 종료
  console.log('[engine] Chrome 종료 중...');
  try {
    execSync('powershell.exe -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"', {
      windowsHide: true, timeout: 10000,
    });
  } catch {}
  await new Promise(r => setTimeout(r, 3000));

  // Chrome 디버그 모드 시작
  console.log(`[engine] Chrome 시작 (profile: ${profileName}, port: ${CDP_PORT})`);
  const psCmd = [
    `Start-Process`,
    `'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'`,
    `-ArgumentList`,
    `'--remote-debugging-port=${CDP_PORT}','--user-data-dir=${profilePath}','--profile-directory=${profileName}','--no-first-run','--no-default-browser-check'`,
  ].join(' ');

  try {
    execSync(`powershell.exe -Command "${psCmd}"`, { windowsHide: true, timeout: 10000 });
  } catch (err) {
    console.warn('[engine] Chrome Start-Process 실패:', err.message);
  }

  // CDP 대기 (최대 20초)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isCdpReady()) {
      console.log('[engine] Chrome CDP 연결 준비 완료');
      return true;
    }
  }
  return false;
}

/**
 * 브라우저 연결
 */
async function launch() {
  const cdpReady = await isCdpReady();

  if (cdpReady) {
    console.log('[engine] 기존 Chrome에 연결');
  } else {
    const ok = await startChromeDebug();
    if (!ok) {
      throw new Error(`Chrome CDP 연결 실패 (port: ${CDP_PORT})`);
    }
  }

  _browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = _browser.contexts();
  _context = contexts[0];
  if (!_context) throw new Error('Chrome 컨텍스트를 찾을 수 없습니다.');

  const page = await _context.newPage();
  console.log('[engine] 브라우저 연결 완료');
  return { browser: _browser, context: _context, page };
}

/**
 * Cloudflare 대기
 */
async function waitForCloudflare(page, timeoutMs = 60000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const content = await page.content();
    const isCloudflare =
      content.includes('Verify you are human') ||
      content.includes('Just a moment') ||
      content.includes('cf-challenge') ||
      content.includes('보안 확인 수행 중');

    if (!isCloudflare) return true;
    console.log('[engine] Cloudflare 대기 중...');
    await page.waitForTimeout(3000);
  }
  return false;
}

/**
 * 안전한 페이지 이동 (Cloudflare 대기 포함)
 */
async function safeGoto(page, url, opts = {}) {
  const { timeout = 30000 } = opts;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  const passed = await waitForCloudflare(page);
  if (!passed) throw new Error(`Cloudflare 통과 실패: ${url}`);
  await page.waitForTimeout(2000);
}

/**
 * DOM 안정화 대기
 */
async function waitForStable(page, stableMs = 3000, timeoutMs = 300000) {
  const timeout = Number(process.env.ANSWER_TIMEOUT_MS) || timeoutMs;
  await page.waitForFunction(
    (ms) => new Promise(resolve => {
      let timer = setTimeout(() => resolve(true), ms);
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve(true), ms);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }),
    stableMs,
    { timeout }
  );
}

/**
 * 연결 해제 (탭만 닫기)
 */
async function close(page) {
  try {
    if (page && !page.isClosed()) await page.close();
    if (_browser) {
      await _browser.close();
      _browser = null;
      _context = null;
    }
  } catch {}
}

module.exports = { launch, close, safeGoto, waitForStable, isCdpReady };
