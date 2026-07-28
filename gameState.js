// server/gameState.js
// Oyun durumu yönetimi — başlangıç, kaydetme, yükleme.
//
// In-memory + dosya tabanlı persistence. Production'da Redis/PostgreSQL kullanılabilir.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUserTeam, generateRandomTeam, assignAgesAndPotential } from './teamFactory.js';
import { createLeague } from './leagueEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_DIR = path.join(__dirname, '.state');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// State dizinini oluştur
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// === FACTORY ===
export function createGameState(options = {}) {
  const userTeam = createUserTeam(options.userTeamName);
  assignAgesAndPotential(userTeam);
  const league = createLeague(userTeam);
  return {
    userTeam,
    league,
    match: null, // aktif maç
    transferMarket: null, // piyasa cache
    mode: 'manager', // normal | manager
    createdAt: Date.now(),
  };
}

export function resetGameState(options = {}) {
  return createGameState(options);
}

// === PERSISTENCE ===
export function saveState(state) {
  try {
    // match durumunu serialize etme (state içinde)
    const toSave = {
      userTeam: state.userTeam,
      league: state.league,
      mode: state.mode,
      createdAt: state.createdAt,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
    return true;
  } catch (e) {
    console.error('State save error:', e);
    return false;
  }
}

export function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...data, match: null };
  } catch (e) {
    console.error('State load error:', e);
    return null;
  }
}
