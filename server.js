/**
 * ScriptSnap 서버
 *
 * 1단계: youtube-transcript로 자막 직접 추출 (무료, 서버비용 0)
 * 2단계: Claude 웹 자동화로 가공 (night-agent 방식)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchTranscript } = require('./src/youtube');
const engine = require('./src/browser/engine');
const claude = require('./src/browser/claude');
const { buildPrompt } = require('./src/prompts');

const app = express();
const PORT = Number(process.env.PORT) || 3500;

let isProcessing = false;
let isSyncing = false;

// ─── Admin IP 화이트리스트 ───────────────────────
const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

function isAdminIp(req) {
  const ip = getClientIp(req);
  // IPv6 loopback/mapped 처리
  const normalized = ip.replace(/^::ffff:/, '');
  return ADMIN_IPS.includes(normalized) || normalized === '127.0.0.1' || normalized === '::1';
}

function requireAdmin(req, res, next) {
  if (!isAdminIp(req)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }
  next();
}

// ─── Analytics 헬퍼 ─────────────────────────────
const ANALYTICS_PATH = path.join(__dirname, 'data', 'analytics.json');
const REVENUE_PATH = path.join(__dirname, 'data', 'revenue.json');

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadAnalytics() {
  try {
    if (fs.existsSync(ANALYTICS_PATH)) {
      return JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveAnalytics(data) {
  const dir = path.dirname(ANALYTICS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function trackEvent(type, ip) {
  const data = loadAnalytics();
  const key = todayKey();
  if (!data[key]) {
    data[key] = { pageViews: 0, extractions: 0, coupangClicks: 0, messages: 0, gifts: 0, uniqueIPs: [] };
  }
  const day = data[key];
  if (type === 'pageview') day.pageViews++;
  else if (type === 'extraction') day.extractions++;
  else if (type === 'coupang') day.coupangClicks++;
  else if (type === 'message') day.messages++;
  else if (type === 'gift') day.gifts++;
  if (ip && !day.uniqueIPs.includes(ip)) {
    day.uniqueIPs.push(ip);
  }
  saveAnalytics(data);
}

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

// ─── IP 헬퍼 (admin 체크보다 먼저 선언) ──────────

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip
    || req.connection?.remoteAddress
    || 'unknown';
}

// ─── IP 기반 하루 1회 제한 ────────────────────────
const ipUsage = new Map(); // ip → dateString

function isIpRateLimited(ip) {
  const last = ipUsage.get(ip);
  if (!last) return false;
  return last === new Date().toDateString();
}

function markIpUsed(ip) {
  ipUsage.set(ip, new Date().toDateString());
  // 오래된 항목 정리 (매 100개마다)
  if (ipUsage.size > 10000) {
    const today = new Date().toDateString();
    for (const [k, v] of ipUsage) {
      if (v !== today) ipUsage.delete(k);
    }
  }
}

app.use(express.json({ limit: '10mb' }));

// Dashboard는 static 전에 IP 체크
app.get('/dashboard.html', (req, res, next) => {
  if (!isAdminIp(req)) {
    return res.status(403).send('접근 권한이 없습니다.');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── API: 이벤트 트래킹 ─────────────────────────

app.post('/api/track', (req, res) => {
  const { type } = req.body || {};
  if (!['pageview', 'coupang', 'extraction'].includes(type)) {
    return res.status(400).json({ error: 'type이 올바르지 않습니다.' });
  }
  const ip = getClientIp(req);
  trackEvent(type, ip);
  res.json({ ok: true });
});

// ─── API: 수익/비용 관리 ─────────────────────────

app.post('/api/revenue', requireAdmin, (req, res) => {
  const { date, type, amount, note } = req.body || {};
  if (!date || !type || amount == null) {
    return res.status(400).json({ error: 'date, type, amount를 입력해주세요.' });
  }
  if (!['coupang', 'hosting', 'other'].includes(type)) {
    return res.status(400).json({ error: 'type이 올바르지 않습니다.' });
  }
  const entries = loadRevenue();
  entries.push({
    date: String(date).slice(0, 10),
    type,
    amount: Number(amount),
    note: (note || '').slice(0, 200),
    time: new Date().toISOString(),
  });
  saveRevenue(entries);
  res.json({ ok: true });
});

app.get('/api/revenue', requireAdmin, (req, res) => {
  res.json(loadRevenue());
});

// ─── API: Analytics 조회 (admin 전용) ────────────

app.get('/api/analytics', requireAdmin, (req, res) => {
  const data = loadAnalytics();
  // uniqueIPs를 카운트로 변환
  const result = {};
  for (const [date, day] of Object.entries(data)) {
    result[date] = { ...day, uniqueIPs: Array.isArray(day.uniqueIPs) ? day.uniqueIPs.length : 0 };
  }
  res.json(result);
});

// ─── API: 대본 추출 ──────────────────────────────

app.post('/api/extract', async (req, res) => {
  const { url, mode } = req.body;

  if (!url || !mode) {
    return res.status(400).json({ error: 'url과 mode를 입력해주세요.' });
  }

  const videoId = parseVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: '올바른 YouTube URL을 입력해주세요.' });
  }

  if (isProcessing) {
    return res.status(429).json({ error: '다른 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.' });
  }

  isProcessing = true;
  let page = null;

  try {
    console.log(`\n[server] 요청: videoId=${videoId}, mode=${mode}`);

    // ── 1단계: YouTube 자막 직접 추출 (무료) ──
    console.log('[server] YouTube 자막 추출 중...');
    const transcript = await fetchTranscript(videoId);
    console.log(`[server] 자막 추출 완료 (${transcript.length}자)`);

    // ── 2단계: Claude 웹 자동화로 가공 ──
    const prompt = buildPrompt(transcript, mode);

    console.log('[server] Claude 웹 자동화 시작...');
    const { page: newPage } = await engine.launch();
    page = newPage;

    await claude.newConversation(page);
    await claude.sendMessage(page, prompt);
    await claude.waitForAnswer(page);

    const result = await claude.extractAnswer(page);
    console.log(`[server] 가공 완료 (${result.length}자)`);

    trackEvent('extraction', getClientIp(req));
    res.json({ result, transcriptLength: transcript.length });
  } catch (err) {
    console.error('[server] 실패:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { await engine.close(page); } catch {}
    isProcessing = false;
  }
});

// ─── API: 자막만 추출 (AI 가공 없이, 완전 무료) ──

app.post('/api/raw-transcript', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url을 입력해주세요.' });
  }

  const clientIp = getClientIp(req);
  if (isIpRateLimited(clientIp)) {
    return res.status(429).json({ error: '하루 1회 무료 추출이 완료되었습니다. Pro 버전을 준비 중입니다!' });
  }

  const videoId = parseVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: '올바른 YouTube URL을 입력해주세요.' });
  }

  try {
    console.log(`[server] 원본 자막 요청: videoId=${videoId}, ip=${clientIp}`);
    const transcript = await fetchTranscript(videoId);
    markIpUsed(clientIp);
    trackEvent('extraction', clientIp);
    res.json({ result: transcript });
  } catch (err) {
    console.error('[server] 자막 추출 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 쪽지 보내기 ─────────────────────────────

const MESSAGES_PATH = path.join(__dirname, 'data', 'messages.json');

app.post('/api/message', (req, res) => {
  const { email, name, message } = req.body || {};
  if (!email || !email.trim()) {
    return res.status(400).json({ error: '이메일을 입력해주세요.' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' });
  }

  const entry = {
    email: email.trim().slice(0, 100),
    name: (name || '익명').trim().slice(0, 50),
    message: message.trim().slice(0, 2000),
    ip: getClientIp(req),
    time: new Date().toISOString(),
  };

  try {
    let messages = [];
    if (fs.existsSync(MESSAGES_PATH)) {
      messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
    }
    messages.push(entry);
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2), 'utf-8');
    trackEvent('message', getClientIp(req));
    console.log(`[message] ${entry.email} (${entry.name}): ${entry.message.slice(0, 50)}...`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[message] 저장 실패:', err.message);
    res.status(500).json({ error: '메시지 저장에 실패했습니다.' });
  }
});

// ─── API: 기프티콘 업로드 ─────────────────────────

const GIFTS_DIR = path.join(__dirname, 'data', 'gifts');
const GIFTS_META = path.join(__dirname, 'data', 'gifts.json');

app.post('/api/gift', (req, res) => {
  const { name, image } = req.body || {};
  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: '이미지를 첨부해주세요.' });
  }

  try {
    // base64 → 파일 저장
    const match = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: '올바른 이미지 형식이 아닙니다.' });

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: '5MB 이하 이미지만 가능합니다.' });
    }

    const filename = `gift_${Date.now()}.${ext}`;
    if (!fs.existsSync(GIFTS_DIR)) fs.mkdirSync(GIFTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(GIFTS_DIR, filename), buffer);

    // 메타데이터 저장
    const entry = {
      name: (name || '익명').trim().slice(0, 50),
      file: filename,
      ip: getClientIp(req),
      time: new Date().toISOString(),
    };
    let gifts = [];
    if (fs.existsSync(GIFTS_META)) {
      gifts = JSON.parse(fs.readFileSync(GIFTS_META, 'utf-8'));
    }
    gifts.push(entry);
    fs.writeFileSync(GIFTS_META, JSON.stringify(gifts, null, 2), 'utf-8');
    trackEvent('gift', getClientIp(req));
    console.log(`[gift] ${entry.name}님이 기프티콘 전송: ${filename}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[gift] 저장 실패:', err.message);
    res.status(500).json({ error: '기프티콘 저장에 실패했습니다.' });
  }
});

// ─── API: 쪽지/기프티콘 확인 (admin 전용) ──────────

app.get('/api/messages', requireAdmin, (req, res) => {
  try {
    let messages = [];
    if (fs.existsSync(MESSAGES_PATH)) {
      messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
    }
    let gifts = [];
    if (fs.existsSync(GIFTS_META)) {
      gifts = JSON.parse(fs.readFileSync(GIFTS_META, 'utf-8'));
    }
    res.json({ messages, gifts });
  } catch {
    res.json({ messages: [], gifts: [] });
  }
});

// 기프티콘 이미지 열람 (admin 전용)
app.get('/api/gifts/:filename', requireAdmin, (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const filepath = path.join(GIFTS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
  res.sendFile(filepath);
});

// ─── API: Admin IP 체크 ──────────────────────────

app.get('/api/admin-check', (req, res) => {
  if (!isAdminIp(req)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }
  res.json({ ok: true, ip: getClientIp(req) });
});

// ─── API: 쿠팡 수익 동기화 ──────────────────────

app.post('/api/sync-revenue', requireAdmin, async (req, res) => {
  if (isSyncing) {
    return res.status(429).json({ error: '이미 동기화 중입니다.' });
  }
  isSyncing = true;
  try {
    const scraper = require('./src/coupang-scraper');
    const result = await scraper.syncRevenue();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[sync-revenue] 실패:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    isSyncing = false;
  }
});

// ─── YouTube URL → videoId ───────────────────────

function parseVideoId(url) {
  try {
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];

    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];

    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];

    return null;
  } catch { return null; }
}

// ─── 서버 시작 ────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ScriptSnap 서버 실행 중`);
  console.log(`  http://localhost:${PORT}\n`);
});
