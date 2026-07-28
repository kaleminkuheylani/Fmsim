// server/leagueEngine.js
// Lig motoru — haftalar, puan durumu, AI maçları.

import { League } from './match/league.js';

export function createLeague(userTeam = null) {
  const league = new League();
  league.setup(userTeam);
  return league;
}

export function playWeek(gameState) {
  if (!gameState.league) return { ok: false, error: 'No league' };
  return gameState.league.playWeek(gameState.league.currentWeek + 1, (fix) => {
    return { score: { home: 0, away: 0 } };
  });
}

export function getStandings(league) {
  return league.getStandings();
}
