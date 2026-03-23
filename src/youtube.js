/**
 * YouTube 자막 직접 추출 — 외부 패키지 없이 YouTube API 직접 호출
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * videoId로 자막 추출
 * 1차: InnerTube API (Android 클라이언트)
 * 2차: 웹 페이지 파싱 폴백
 */
async function fetchTranscript(videoId) {
  // 1차: InnerTube API
  let tracks = await fetchTracksViaInnerTube(videoId);

  // 2차: 웹 페이지 파싱
  if (!tracks || tracks.length === 0) {
    tracks = await fetchTracksViaWebPage(videoId);
  }

  if (!tracks || tracks.length === 0) {
    throw new Error('이 영상에는 자막이 없습니다.');
  }

  // 한국어 우선 → 영어 → 첫번째
  const track =
    tracks.find(t => t.languageCode === 'ko') ||
    tracks.find(t => t.languageCode === 'en') ||
    tracks[0];

  const baseUrl = track.baseUrl;

  // baseUrl 호스트 검증
  try {
    const host = new URL(baseUrl).hostname;
    if (!host.endsWith('.youtube.com') && !host.endsWith('.google.com')) {
      throw new Error('유효하지 않은 자막 URL');
    }
  } catch {
    throw new Error('유효하지 않은 자막 URL');
  }

  // 자막 XML 가져오기
  const xmlRes = await fetch(baseUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!xmlRes.ok) throw new Error('자막 데이터를 가져올 수 없습니다.');

  const xml = await xmlRes.text();
  const texts = parseTranscriptXml(xml);

  if (texts.length === 0) {
    throw new Error('자막 파싱에 실패했습니다.');
  }

  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * InnerTube API로 caption tracks 가져오기
 */
async function fetchTracksViaInnerTube(videoId) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
          },
        },
        videoId,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch {
    return null;
  }
}

/**
 * 웹 페이지에서 caption tracks 파싱 (폴백)
 */
async function fetchTracksViaWebPage(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const html = await res.text();

    if (html.includes('class="g-recaptcha"')) {
      throw new Error('YouTube가 CAPTCHA를 요구합니다. 잠시 후 다시 시도하세요.');
    }

    // ytInitialPlayerResponse에서 captionTracks 추출
    const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match) return null;

    const playerResponse = JSON.parse(match[1]);
    return playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch (err) {
    if (err.message.includes('CAPTCHA')) throw err;
    return null;
  }
}

/**
 * 자막 XML 파싱
 * 두 가지 형식 지원: <text> (레거시) / <p><s> (신규)
 */
function parseTranscriptXml(xml) {
  const texts = [];

  // 신규 형식: <p t="..." d="..."><s>text</s></p>
  const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const inner = pMatch[1];
    // <s> 태그 안의 텍스트 추출
    const sTexts = [];
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      sTexts.push(sMatch[1]);
    }
    const text = sTexts.length > 0
      ? sTexts.join('')
      : inner.replace(/<[^>]+>/g, '');
    const decoded = decodeEntities(text).trim();
    if (decoded) texts.push(decoded);
  }

  if (texts.length > 0) return texts;

  // 레거시 형식: <text start="..." dur="...">text</text>
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let tMatch;
  while ((tMatch = textRegex.exec(xml)) !== null) {
    const decoded = decodeEntities(tMatch[1].replace(/<[^>]+>/g, '')).trim();
    if (decoded) texts.push(decoded);
  }

  return texts;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\n/g, ' ');
}

module.exports = { fetchTranscript };
