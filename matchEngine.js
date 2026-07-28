// server/matchEngine.js
// Maç motoru wrapper — match/ modüllerini kullanır.

import { makeMatchState } from '../match/state.js';
import { startMatch as startMatchOrig, simulateMinute } from '../match/simulate.js';
import { generateUniqueName } from '../match/playerName.js';
import { buildTeam } from '../match/teamBuilder.js';

export function startMatch(gameState, opponentId) {
  const { userTeam, league } = gameState;
  if (!userTeam) return { ok: false, error: 'No user team' };

  // Rakip
  let opponent;
  if (opponentId && league) {
    opponent = league.teams.find(t => t.id === opponentId);
  }
  if (!opponent) {
    // Random AI takım
    opponent = buildTeam(generateUniqueName() + ' FC', '442', false);
    for (const p of opponent.players) {
      p.age = 18 + Math.floor(Math.random() * 18);
      p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
      p.live = p.live || {};
      p.live.x = 50; p.live.y = 35;
      p.live.currentStamina = 100; p.live.currentMorale = 60;
      p.live.rating = 6.5;
    }
  }

  const match = makeMatchState({
    home: userTeam, away: opponent,
    homeFormation: '442', awayFormation: '442',
  });
  match.mode = 'manager';
  startMatchOrig(match);
  gameState.match = match;
  return { ok: true, match: serializeMatch(match) };
}

export function tickMatch(gameState) {
  if (!gameState.match) return { ok: false, error: 'No active match' };
  if (gameState.match.paused) return { ok: false, error: 'Paused' };
  if (gameState.match.minute >= 90) return { ok: false, error: 'Match finished' };

  const beforeN = gameState.match.narrativeLog.length;
  const beforeE = gameState.match.events.length;
  simulateMinute(gameState.match);
  const newNarratives = gameState.match.narrativeLog.slice(beforeN);
  const newEvents = gameState.match.events.slice(beforeE);

  return {
    ok: true,
    minute: gameState.match.minute,
    homeScore: gameState.match.homeScore,
    awayScore: gameState.match.awayScore,
    finished: gameState.match.minute >= 90,
    newEvents,
    newNarratives,
    pendingInjury: gameState.match.pendingInjury || null,
  };
}

export function manualSubstitution(gameState, outId, inId) {
  if (!gameState.match?.substitution) return { ok: false, error: 'No active match' };
  const side = gameState.match.ballSide;
  // Her iki tarafı da kontrol et
  for (const s of ['home', 'away']) {
    const team = gameState.match[s];
    const out = team.players.find(p => p.id === outId);
    if (out) {
      const sub = gameState.match.substitution.manualSub(s, outId, inId);
      if (sub.ok) {
        gameState.match.events.push(sub.event);
        gameState.match.narrativeLog.push({
          minute: gameState.match.minute,
          type: 'substitution',
          text: `🔄 Değişiklik: ${out.name} çıktı, ${team.players.find(p=>p.id===inId)?.name} girdi (Manuel).`,
        });
      }
      return sub;
    }
  }
  return { ok: false, error: 'Player not found' };
}

// Frontend için serialize
function serializeMatch(match) {
  return {
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homeName: match.home.name,
    awayName: match.away.name,
    events: match.events,
    narrativeLog: match.narrativeLog,
  };
}

export function generateNarrative(data) {
  return `[${data.minute}'] ${data.text || 'Narrative üretildi'}`;
}
