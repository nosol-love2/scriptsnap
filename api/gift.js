/**
 * Vercel Serverless — 기프티콘 업로드 API
 * /tmp에 임시 저장 (cold start 시 초기화)
 */

const fs = require('fs');
const path = require('path');
const GIFTS_DIR = path.join('/tmp', 'gifts');
const GIFTS_META = path.join('/tmp', 'gifts.json');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 지원합니다.' });
  }

  const { name, image } = req.body || {};
  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: '이미지를 첨부해주세요.' });
  }

  try {
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

    const entry = {
      name: (name || '익명').trim().slice(0, 50),
      file: filename,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
      time: new Date().toISOString(),
    };
    let gifts = [];
    if (fs.existsSync(GIFTS_META)) {
      gifts = JSON.parse(fs.readFileSync(GIFTS_META, 'utf-8'));
    }
    gifts.push(entry);
    fs.writeFileSync(GIFTS_META, JSON.stringify(gifts, null, 2), 'utf-8');

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: '기프티콘 저장에 실패했습니다.' });
  }
};
