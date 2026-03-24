/**
 * Vercel Serverless — 이벤트 트래킹 API
 * POST /api/track { type: "pageview" | "coupang" | "extraction" }
 */

const fs = require('fs');
const path = require('path');
const ANALYTICS_PATH = path.join('/tmp', 'analytics.json');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 지원합니다.' });
  }

  const { type } = req.body || {};
  if (!['pageview', 'coupang', 'extraction'].includes(type)) {
    return res.status(400).json({ error: 'type이 올바르지 않습니다.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const data = loadAnalytics();
  const key = todayKey();
  if (!data[key]) {
    data[key] = { pageViews: 0, extractions: 0, coupangClicks: 0, messages: 0, gifts: 0, uniqueIPs: [] };
  }
  const day = data[key];
  if (type === 'pageview') day.pageViews++;
  else if (type === 'extraction') day.extractions++;
  else if (type === 'coupang') day.coupangClicks++;
  if (ip && !day.uniqueIPs.includes(ip)) {
    day.uniqueIPs.push(ip);
  }
  saveAnalytics(data);

  return res.json({ ok: true });
};
