/**
 * Vercel Serverless — Analytics 조회 API (admin IP 전용)
 * GET /api/analytics
 */

const fs = require('fs');
const path = require('path');
const ANALYTICS_PATH = path.join('/tmp', 'analytics.json');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET만 지원합니다.' });
  }
  if (!isAdminIp(req)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  try {
    let data = {};
    if (fs.existsSync(ANALYTICS_PATH)) {
      data = JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf-8'));
    }
    // uniqueIPs를 카운트로 변환
    const result = {};
    for (const [date, day] of Object.entries(data)) {
      result[date] = { ...day, uniqueIPs: Array.isArray(day.uniqueIPs) ? day.uniqueIPs.length : 0 };
    }
    return res.json(result);
  } catch {
    return res.json({});
  }
};
