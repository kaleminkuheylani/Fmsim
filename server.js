// server.js — statik dosya sunucu + match engine API
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { makeMatchState } from './match/state.js';
import { startMatch, simulateMinute } from './match/simulate.js';
import { buildTeam } from './match/teamBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, 'site');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// === MATCH STATE (in-memory singleton) ===
let currentMatch = null;
let matchLog = []; // tüm maç boyunca birikmiş log (debug için)

function getPlayerName(match, side, playerId) {
  if (!playerId) return null;
  const team = match?.[side];
  if (!team) return null;
  const p = team.players?.find(x => x.id === playerId || x.name === playerId);
  return p?.name || null;
}

function calcPossession(match) {
  const total = match.stats.possession.home + match.stats.possession.away;
  if (total === 0) return { home: 50, away: 50 };
  return {
    home: Math.round(match.stats.possession.home / total * 100),
    away: Math.round(match.stats.possession.away / total * 100),
  };
}

function snapshot(match) {
  if (!match) return null;
  return {
    minute: match.minute,
    home: {
      name: match.home.name,
      score: match.homeScore,
      formation: match.formation.home,
      yellow: match.stats.yellowCards.home,
      red: match.stats.redCards.home,
    },
    away: {
      name: match.away.name,
      score: match.awayScore,
      formation: match.formation.away,
      yellow: match.stats.yellowCards.away,
      red: match.stats.redCards.away,
    },
    ball: {
      x: Math.round(match.ballPos.x * 10) / 10,
      y: Math.round(match.ballPos.y * 10) / 10,
      side: match.ballSide,
      carrier: getPlayerName(match, match.ballCarrier?.side, match.ballCarrier?.playerId),
    },
    stats: {
      possession: calcPossession(match),
      shots: { ...match.stats.shots },
      shotsOnTarget: { ...match.stats.shotsOnTarget },
      corners: { ...match.stats.corners },
      fouls: { ...match.stats.fouls },
    },
    momentum: Math.round(match.momentum * 100),
    finished: match.minute >= 90,
    eventCount: match.events.length,
    narrativeCount: (match.narrativeLog || []).length,
  };
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readQuery(urlPath) {
  const i = urlPath.indexOf('?');
  if (i === -1) return { path: urlPath, query: {} };
  const pathOnly = urlPath.slice(0, i);
  const qs = new URLSearchParams(urlPath.slice(i + 1));
  const query = {};
  for (const [k, v] of qs) query[k] = v;
  return { path: pathOnly, query };
}

// === API HANDLERS ===

function handleApi(req, res, urlPath) {
  const { path: route, query } = readQuery(urlPath);

  // POST body oku (POST/PUT/PATCH için)
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    return readBody(req).then(body => dispatchApi(req, res, route, query, body));
  }
  return dispatchApi(req, res, route, query, null);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function dispatchApi(req, res, route, query, body) {
  // GET /api/test/start — yeni maç başlat
  if (route === '/api/test/start' && (req.method === 'GET' || req.method === 'POST')) {
    const homeName = (body?.homeName) || query.homeName || 'Galata Boğaz FK';
    const awayName = (body?.awayName) || query.awayName || 'Anadolu Kartalı SK';
    const hForm = (body?.homeFormation) || query.hForm || '442';
    const aForm = (body?.awayFormation) || query.aForm || '433';

    const home = buildTeam(homeName, hForm, true);
    const away = buildTeam(awayName, aForm, false);
    currentMatch = makeMatchState({ home, away, homeFormation: hForm, awayFormation: aForm });
    startMatch(currentMatch);
    matchLog = [];
    return jsonResponse(res, 200, {
      ok: true,
      action: 'start',
      match: snapshot(currentMatch),
      opening: currentMatch.narrativeLog || [],
    });
  }

  // GET /api/test/tick?count=N — N dakika ilerlet (default 1)
  if (route === '/api/test/tick') {
    if (!currentMatch) {
      return jsonResponse(res, 400, { ok: false, error: 'Maç başlatılmadı. Önce /api/test/start' });
    }
    if (currentMatch.minute >= 90) {
      return jsonResponse(res, 200, {
        ok: true,
        action: 'tick',
        skipped: 'Maç bitti (90+)',
        match: snapshot(currentMatch),
      });
    }
    const count = Math.max(1, Math.min(90, parseInt(query.count || '1', 10) || 1));
    const newEvents = [];
    const newNarrative = [];
    for (let i = 0; i < count; i++) {
      if (currentMatch.minute >= 90) break;
      const eventsBefore = currentMatch.events.length;
      const narrBefore = (currentMatch.narrativeLog || []).length;
      simulateMinute(currentMatch);
      // Bu dakikada eklenen event/narrative'leri topla
      const newEvs = currentMatch.events.slice(eventsBefore);
      const newNars = (currentMatch.narrativeLog || []).slice(narrBefore);
      newEvents.push(...newEvs);
      newNarrative.push(...newNars);
    }
    matchLog.push({ minute: currentMatch.minute, events: newEvents, narrative: newNarrative });
    return jsonResponse(res, 200, {
      ok: true,
      action: 'tick',
      count,
      match: snapshot(currentMatch),
      newEvents,
      newNarrative,
    });
  }

  // GET /api/test/run?untilMinute=90 — belirli dakikaya kadar oyna
  if (route === '/api/test/run') {
    if (!currentMatch) {
      return jsonResponse(res, 400, { ok: false, error: 'Maç başlatılmadı. Önce /api/test/start' });
    }
    const target = Math.max(1, Math.min(90, parseInt(query.untilMinute || '90', 10) || 90));
    const newEvents = [];
    const newNarrative = [];
    while (currentMatch.minute < target) {
      const evBefore = currentMatch.events.length;
      const narBefore = (currentMatch.narrativeLog || []).length;
      simulateMinute(currentMatch);
      newEvents.push(...currentMatch.events.slice(evBefore));
      newNarrative.push(...(currentMatch.narrativeLog || []).slice(narBefore));
    }
    return jsonResponse(res, 200, {
      ok: true,
      action: 'run',
      target,
      match: snapshot(currentMatch),
      newEvents,
      newNarrative,
    });
  }

  // GET /api/test/state — sadece snapshot, state değişmez
  if (route === '/api/test/state') {
    return jsonResponse(res, 200, {
      ok: true,
      match: snapshot(currentMatch),
    });
  }

  // GET /api/test/log?limit=N — son N log kaydı
  if (route === '/api/test/log') {
    const limit = Math.max(1, Math.min(500, parseInt(query.limit || '50', 10) || 50));
    return jsonResponse(res, 200, {
      ok: true,
      log: matchLog.slice(-limit),
    });
  }

  // GET /api/test/events — tüm maç olayları (dakika bazlı)
  if (route === '/api/test/events') {
    if (!currentMatch) return jsonResponse(res, 200, { ok: true, events: [] });
    return jsonResponse(res, 200, {
      ok: true,
      events: currentMatch.events,
      narrative: currentMatch.narrativeLog || [],
    });
  }

  // 404 — API bulunamadı
  return jsonResponse(res, 404, { ok: false, error: `Bilinmeyen API rotası: ${route}` });
}

// === STATIC SERVER ===

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // API rotaları
  if (urlPath.startsWith('/api/')) {
    return handleApi(req, res, req.url);
  }

  // SPA fallback: extension yoksa ve kökse index.html
  const hasExt = path.extname(urlPath);
  if (!hasExt || urlPath === '/') {
    return serveFile(res, path.join(SITE, 'index.html'));
  }
  const localPath = path.join(SITE, urlPath);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    return serveFile(res, localPath);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Server Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Narrative Spiker running at http://localhost:${PORT}`);
  console.log(`Test page: http://localhost:${PORT}/test.html`);
});
