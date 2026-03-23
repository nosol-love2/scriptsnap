/**
 * Vercel Serverless — 쪽지 API
 * /tmp에 임시 저장 (cold start 시 초기화)
 * 실제 운영 시 DB(Vercel KV, Supabase 등) 연동 권장
 */

const fs = require('fs');
const path = require('path');
const MESSAGES_PATH = path.join('/tmp', 'messages.json');

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
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
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
      time: new Date().toISOString(),
    };

    try {
      let messages = [];
      if (fs.existsSync(MESSAGES_PATH)) {
        messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
      }
      messages.push(entry);
      fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2), 'utf-8');
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: '메시지 저장에 실패했습니다.' });
    }
  }

  if (req.method === 'GET') {
    if (req.query?.admin !== '1') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    try {
      let messages = [];
      if (fs.existsSync(MESSAGES_PATH)) {
        messages = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
      }
      return res.json({ messages });
    } catch {
      return res.json({ messages: [] });
    }
  }

  return res.status(405).json({ error: 'GET 또는 POST만 지원합니다.' });
};
