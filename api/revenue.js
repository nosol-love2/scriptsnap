/**
 * Vercel Serverless — 수익/비용 관리 API (admin IP 전용)
 * POST /api/revenue { date, type, amount, note }
 * GET  /api/revenue
 */

const fs = require('fs');
const path = require('path');
const REVENUE_PATH = path.join('/tmp', 'revenue.json');

const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || 'unknown';
}

function isAdminIp(req) {
  const ip = getClientIp(req).replace(/^::ffff:/, '');
  return ADMIN_IPS.includes(ip) || ip === '127.0.0.1' || ip === '::1';
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
  fs.writeFileSync(REVENUE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = async function handler(req, res) {
  if (!isAdminIp(req)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  if (req.method === 'POST') {
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
    return res.json({ ok: true });
  }

  if (req.method === 'GET') {
    return res.json(loadRevenue());
  }

  return res.status(405).json({ error: 'GET 또는 POST만 지원합니다.' });
};
