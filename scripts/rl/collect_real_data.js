// scripts/rl/collect_real_data.js
// Fmsim simülasyonundan RL eğitim verisi topla.
// Her aksiyonda (state, action, reward) tuple'ı JSONL dosyasına yaz.
//
// Kullanım: node scripts/rl/collect_real_data.js [match_count]
// Çıktı: scripts/rl/training_data.jsonl (her satır bir transition)

import { startMatch, simulateMinute } from '../../match/simulate.js';
import { deployLineup } from '../../match/positions.js';
import { extractState } from '../../match/ppo_policy.js';

const MATCH_COUNT = parseInt(process.argv[2] || '500', 10);
const OUT_PATH = process.argv[3] || `${import.meta.dirname}/training_data.jsonl`;

import fs from 'fs';

console.log(`=== Fmsim RL Veri Toplama ===`);
console.log(`Maç sayısı: ${MATCH_COUNT}`);
console.log(`Çıktı: ${OUT_PATH}\n`);

// Basit takım oluştur (teamBuilder'ı atla, doğrudan deployLineup)
function makeTeam(name, formation) {
  return {
    name,
    formation,
    players: [],
    homeScore: 0,
    awayScore: 0,
    stats: {
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      possession: { home: 0, away: 0 },
    },
    momentum: 0.5,
    events: [],
    narrativeLog: [],
    tickCount: 0,
    minute: 0,
  };
}

let totalTransitions = 0;
let totalActions = { shoot: 0, cross: 0, pass: 0, dribble: 0, turnover: 0, other: 0 };
const start = Date.now();

const writeStream = fs.createWriteStream(OUT_PATH);

for (let m = 0; m < MATCH_COUNT; m++) {
  // Basit 4-4-2 vs 4-3-3 maç
  const match = {
    home: makeTeam('Home', '442'),
    away: makeTeam('Away', '433'),
    formation: { home: '442', away: '433' },
    homeScore: 0, awayScore: 0,
    stats: {
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      possession: { home: 0, away: 0 },
    },
    momentum: 0.5,
    events: [],
    narrativeLog: [],
    tickCount: 0,
    minute: 0,
    mode: 'manager',
  };

  // Oyuncu üretmek için teamBuilder kullanmak yerine basit placeholder
  // (Bunun yerine real takım database'i kullanılabilir, ama burada sadece
  // simülasyonun nasıl çalıştığını görmek için minimal)
  // Not: Gerçek uygulamada teamBuilder'dan takım çekilir
  try {
    const { buildTeam } = await import('../../match/teamBuilder.js');
    match.home = buildTeam('Home', '442');
    match.away = buildTeam('Away', '433');
  } catch (e) {
    // teamBuilder yoksa placeholder kullan
    console.error('teamBuilder yüklenemedi:', e.message);
    process.exit(1);
  }

  match.homeScore = 0;
  match.awayScore = 0;
  match.stats = {
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    yellowCards: { home: 0, away: 0 },
    redCards: { home: 0, away: 0 },
    possession: { home: 0, away: 0 },
    passesAttempted: { home: 0, away: 0 },
    passesCompleted: { home: 0, away: 0 },
    shotsTotal: { home: 0, away: 0 },
  };
  match.momentum = 0.5;
  match.events = [];
  match.narrativeLog = [];
  match.tickCount = 0;
  match.minute = 0;
  match.mode = 'manager';
  match.phase = { home: 'attacking', away: 'defending' };
  match.phaseCounter = { home: 0, away: 0 };
  match.passChain = { home: 0, away: 0 };
  match.ballSide = 'home';
  match.ballPos = { x: 50, y: 35 };
  match.ballCarrier = null;

  startMatch(match);

  // Maçı oyna, her action'da veri topla
  for (let minute = 0; minute < 90; minute++) {
    const before = match.events.length;
    const beforeScoreHome = match.homeScore;
    const beforeScoreAway = match.awayScore;

    // 1 dakika = 1-3 aksiyon
    simulateMinute(match);

    // Yeni eventlerden transitions çıkar
    const newEvents = match.events.slice(before);
    for (const ev of newEvents) {
      // State çıkar
      const actorId = ev.actor;
      if (!actorId) continue;
      const side = ev.side || match.ballSide;
      const team = match[side];
      if (!team) continue;
      const player = team.players.find(p => p.id === actorId);
      if (!player || !player.live) continue;

      const state = extractState(player, match);

      // Action ve reward belirle
      let action = -1;
      let reward = 0;
      let success = 0;

      switch (ev.type) {
        case 'goal':
          // Şut atan oyuncu → reward
          action = 0; // shoot
          reward = 10;
          success = 1;
          break;
        case 'shot_on_target':
        case 'shot_off_target':
        case 'shot_saved':
          action = 0;
          reward = (ev.type === 'shot_on_target') ? 1 : -1;
          success = (ev.type === 'shot_on_target') ? 0.5 : 0;
          break;
        case 'cross_success':
          action = 1;
          reward = 2;
          success = 1;
          break;
        case 'pass_success':
          action = ev.distance > 30 ? 3 : 2; // long vs short
          reward = ev.distance > 30 ? 2.5 : 1.5;
          success = 1;
          break;
        case 'dribble_success':
          action = 4;
          reward = 1;
          success = 1;
          break;
        case 'turnover':
          action = 4; // dribble denedi ama kaybetti
          reward = -3;
          success = 0;
          break;
        case 'dribble_recovered':
          // dribble başarısız ama takım kurtardı
          action = 4;
          reward = 0;
          success = 0.3;
          break;
        case 'out_of_play':
        case 'throw_in':
        case 'goal_kick':
        case 'corner':
          // set-piece — nötr
          continue;
        default:
          continue;
      }

      // Disk'e yaz
      const transition = JSON.stringify({
        state,
        action,
        reward,
        success,
        minute: ev.minute,
        side,
        type: ev.type,
        player_pos: player.position,
      }) + '\n';
      writeStream.write(transition);
      totalTransitions++;
      if (action === 0) totalActions.shoot++;
      else if (action === 1) totalActions.cross++;
      else if (action === 2 || action === 3) totalActions.pass++;
      else if (action === 4) totalActions.dribble++;
    }
  }

  if ((m + 1) % 50 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  Maç ${m+1}/${MATCH_COUNT} | transition ${totalTransitions} | ${elapsed}s`);
  }
}

writeStream.end();
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n=== BİTTİ ===`);
console.log(`Toplam maç: ${MATCH_COUNT}`);
console.log(`Toplam transition: ${totalTransitions}`);
console.log(`Süre: ${elapsed}s`);
console.log(`Action dağılımı:`, totalActions);
console.log(`Çıktı: ${OUT_PATH}`);
