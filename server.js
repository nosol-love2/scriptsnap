/**
 * ScriptSnap 서버
 *
 * 1단계: youtube-transcript로 자막 직접 추출 (무료, 서버비용 0)
 * 2단계: Claude 웹 자동화로 가공 (night-agent 방식)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { fetchTranscript } = require('./src/youtube');
const engine = require('./src/browser/engine');
const claude = require('./src/browser/claude');
const { buildPrompt } = require('./src/prompts');

const app = express();
const PORT = Number(process.env.PORT) || 3500;

let isProcessing = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  const videoId = parseVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: '올바른 YouTube URL을 입력해주세요.' });
  }

  try {
    console.log(`[server] 원본 자막 요청: videoId=${videoId}`);
    const transcript = await fetchTranscript(videoId);
    res.json({ result: transcript });
  } catch (err) {
    console.error('[server] 자막 추출 실패:', err.message);
    res.status(500).json({ error: err.message });
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
