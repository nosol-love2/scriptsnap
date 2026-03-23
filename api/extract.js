/**
 * Vercel Serverless — AI 가공 추출 API
 * 원본 자막 추출 후 → Claude 웹 자동화 서버로 프록시
 *
 * 환경변수 CLAUDE_SERVER_URL이 있으면 로컬 Claude 서버로 전달
 * 없으면 원본 자막만 반환 (AI 가공 미지원 안내)
 */

const rawHandler = require('./raw-transcript');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 지원합니다.' });
  }

  const { url, mode } = req.body || {};
  if (!url || !mode) {
    return res.status(400).json({ error: 'url과 mode를 입력해주세요.' });
  }

  // Claude 서버가 설정되어 있으면 프록시
  const claudeServer = process.env.CLAUDE_SERVER_URL;
  if (claudeServer) {
    try {
      const proxyRes = await fetch(`${claudeServer}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode }),
      });
      const data = await proxyRes.json();
      return res.status(proxyRes.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: `AI 서버 연결 실패: ${err.message}` });
    }
  }

  // Claude 서버 없으면 원본 자막만 반환
  return res.status(503).json({
    error: 'AI 가공 기능은 현재 준비 중입니다. "원본 자막" 모드를 이용해주세요.',
  });
};
