// server/index.js
// Narrative Spiker — Express backend
// REST API: takım yönetimi, transfer, maç, lig, persistence
//
// Endpoints:
//   GET  /api/health                        - sağlık kontrolü
//   GET  /api/state                         - tüm state (user, league, season)
//   POST /api/reset                         - yeni oyun, lig sıfırla
//   POST /api/match/start                   - yeni maç başlat
//   POST /api/match/tick                    - 1 dakika ilerlet
//   POST /api/match/pause                   - duraklat
//   POST /api/match/resume                  - devam et
//   POST /api/match/injury-sub              - sakatlık için yedek seç
//   GET  /api/transfer/market               - piyasayı getir
//   POST /api/transfer/buy                  - oyuncu satın al
//   GET  /api/league/standings             - puan durumu
//   POST /api/league/play-week              - haftayı oyna
//   GET  /api/players/:id                   - oyuncu detayı
//   GET  /api/players/:id/development       - gelişim grafiği

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createGameState, resetGameState, saveState, loadState } from './gameState.js';
import { tickMatch, startMatch, manualSubstitution, generateNarrative } from './matchEngine.js';
import { buyPlayer, sellPlayer } from './transferEngine.js';
import { getStandings, playWeek } from './leagueEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Statik frontend (build edilmiş) — birkaç olası konum
const possibleStaticPaths = [
  path.join(__dirname, '..', 'site'),
  path.join(__dirname, '..', '..', 'site'),
  path.join('/app', 'site'),
  path.join(process.cwd(), 'site'),
  path.join(process.cwd(), '..', 'site'),
  path.join(process.cwd(), '..', '..', 'site'),
];
for (const p of possibleStaticPaths) {
  try {
    if (fs.existsSync(p)) {
      app.use(express.static(p));
      console.log(`📁 Static files: ${p}`);
      break;
    }
  } catch {}
}

// === STATE ===
let gameState = createGameState();

// === HEALTH ===
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), state: gameState ? 'ready' : 'empty' });
});

// === STATE ===
app.get('/api/state', (req, res) => {
  res.json(gameState);
});

app.post('/api/reset', (req, res) => {
  gameState = createGameState(req.body || {});
  res.json({ ok: true, state: gameState });
});

app.post('/api/save', (req, res) => {
  saveState(gameState);
  res.json({ ok: true });
});

app.post('/api/load', (req, res) => {
  const loaded = loadState();
  if (loaded) {
    gameState = loaded;
    res.json({ ok: true, state: gameState });
  } else {
    res.status(404).json({ ok: false, error: 'No saved state' });
  }
});

// === MATCH ===
app.post('/api/match/start', (req, res) => {
  const { opponentId } = req.body;
  const result = startMatch(gameState, opponentId);
  res.json(result);
});

app.post('/api/match/tick', (req, res) => {
  const result = tickMatch(gameState);
  res.json(result);
});

app.post('/api/match/pause', (req, res) => {
  if (gameState.match) {
    gameState.match.paused = true;
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: 'No active match' });
  }
});

app.post('/api/match/resume', (req, res) => {
  if (gameState.match) {
    gameState.match.paused = false;
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: 'No active match' });
  }
});

app.post('/api/match/injury-sub', (req, res) => {
  const { outId, inId } = req.body;
  if (!gameState.match) return res.status(400).json({ ok: false, error: 'No active match' });
  const result = manualSubstitution(gameState, outId, inId);
  res.json(result);
});

// === TRANSFER ===
app.get('/api/transfer/market', (req, res) => {
  const market = gameState.transferMarket || new TransferMarket();
  res.json({ players: market.players });
});

app.post('/api/transfer/buy', (req, res) => {
  const { playerId, fromTeam } = req.body;
  const result = buyPlayer(gameState, playerId, fromTeam);
  res.json(result);
});

app.post('/api/transfer/sell', (req, res) => {
  const { playerId, askingPrice } = req.body;
  const result = sellPlayer(gameState, playerId, askingPrice);
  res.json(result);
});

// === LEAGUE ===
app.get('/api/league/standings', (req, res) => {
  if (!gameState.league) return res.status(400).json({ ok: false, error: 'No league' });
  res.json(getStandings(gameState.league));
});

app.post('/api/league/play-week', (req, res) => {
  if (!gameState.league) return res.status(400).json({ ok: false, error: 'No league' });
  const result = playWeek(gameState);
  res.json(result);
});

// === PLAYER ===
app.get('/api/players/:id', (req, res) => {
  const id = req.params.id;
  for (const team of [gameState.userTeam, ...(gameState.league?.teams || [])]) {
    if (!team?.players) continue;
    const p = team.players.find(x => x.id === id);
    if (p) return res.json(p);
  }
  res.status(404).json({ error: 'Player not found' });
});

app.get('/api/players/:id/development', (req, res) => {
  // Gelişim geçmişi (basit versiyon)
  const id = req.params.id;
  // ... gerçek uygulamada veritabanı olur
  res.json({ playerId: id, history: [] });
});

// === NARRATIVE (debug) ===
app.post('/api/narrative/generate', (req, res) => {
  const text = generateNarrative(req.body);
  res.json({ text });
});

// === FALLBACK ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'site', 'index.html'));
});

// === START ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚽ Narrative Spiker backend: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
