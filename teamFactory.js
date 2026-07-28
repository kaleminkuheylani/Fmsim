// server/teamFactory.js
// Takım ve oyuncu üretimi (server tarafı).

import { buildTeam } from '../match/teamBuilder.js';
import { generateUniqueClubName, resetClubPool } from '../match/clubName.js';
import { resetNamePool } from '../match/playerName.js';

export function createUserTeam(name = null) {
  resetNamePool();
  resetClubPool();
  const clubName = name || generateUniqueClubName();
  return buildTeam(clubName, '442', true);
}

export function generateRandomTeam(name = null) {
  const clubName = name || generateUniqueClubName();
  return buildTeam(clubName, '442', false);
}

export function assignAgesAndPotential(team) {
  for (const p of team.players) {
    p.age = 18 + Math.floor(Math.random() * 18);
    p.potential = 50 + (p.stars || 1) * 15 + Math.floor(Math.random() * 10);
    p.value = 1_000_000 + (p.stars || 1) * 2_000_000 + Math.floor(Math.random() * 1_000_000);
    p.wage = 50_000 + (p.stars || 1) * 50_000;
    if (!p.live) p.live = {};
    p.live.rating = 6.0 + (p.stars || 1) + Math.random() * 0.5;
  }
  return team;
}
