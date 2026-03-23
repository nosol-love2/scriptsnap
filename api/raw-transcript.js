/**
 * Vercel Serverless — 원본 자막 추출 API
 * YouTube InnerTube API 직접 호출 (외부 패키지 없음, 비용 0)
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 지원합니다.' });
  }

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'url을 입력해주세요.' });
  }

  const videoId = parseVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: '올바른 YouTube URL을 입력해주세요.' });
  }

  try {
    const transcript = await fetchTranscript(videoId);
    res.json({ result: transcript });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── YouTube 자막 추출 ──────────────────────────

async function fetchTranscript(videoId) {
  let tracks = await fetchTracksViaInnerTube(videoId);
  if (!tracks || tracks.length === 0) {
    tracks = await fetchTracksViaWebPage(videoId);
  }
  if (!tracks || tracks.length === 0) {
    throw new Error('이 영상에는 자막이 없습니다.');
  }

  const track =
    tracks.find(t => t.languageCode === 'ko') ||
    tracks.find(t => t.languageCode === 'en') ||
    tracks[0];

  try {
    const host = new URL(track.baseUrl).hostname;
    if (!host.endsWith('.youtube.com') && !host.endsWith('.google.com')) {
      throw new Error('유효하지 않은 자막 URL');
    }
  } catch { throw new Error('유효하지 않은 자막 URL'); }

  const xmlRes = await fetch(track.baseUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!xmlRes.ok) throw new Error('자막 데이터를 가져올 수 없습니다.');

  const xml = await xmlRes.text();
  const texts = parseTranscriptXml(xml);
  if (texts.length === 0) throw new Error('자막 파싱에 실패했습니다.');

  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchTracksViaInnerTube(videoId) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch { return null; }
}

async function fetchTracksViaWebPage(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': USER_AGENT } });
    const html = await res.text();
    if (html.includes('class="g-recaptcha"')) throw new Error('YouTube CAPTCHA 발생');
    const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match) return null;
    return JSON.parse(match[1])?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch (err) {
    if (err.message.includes('CAPTCHA')) throw err;
    return null;
  }
}

function parseTranscriptXml(xml) {
  const texts = [];
  const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    const inner = m[1];
    const sTexts = [];
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let s;
    while ((s = sRegex.exec(inner)) !== null) sTexts.push(s[1]);
    const text = sTexts.length > 0 ? sTexts.join('') : inner.replace(/<[^>]+>/g, '');
    const decoded = decodeEntities(text).trim();
    if (decoded) texts.push(decoded);
  }
  if (texts.length > 0) return texts;

  const tRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = tRegex.exec(xml)) !== null) {
    const decoded = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
    if (decoded) texts.push(decoded);
  }
  return texts;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\n/g, ' ');
}

function parseVideoId(url) {
  try {
    const w = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (w) return w[1];
    const s = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (s) return s[1];
    const sh = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (sh) return sh[1];
    return null;
  } catch { return null; }
}
