// /workspace/site/js/entry.js
// Re-export everything app.js needs — tek entry

export {
  makeMatchState,
  PITCH,
  findPlayer,
  findPlayerByPos,
  isOnField,
  inAnyBox,
  inHomeBox,
  inAwayBox,
  zoneOf,
  threatOf,
} from '../../match/state.js';

export { startMatch, simulateMinute } from '../../match/simulate.js';
export { createNarrator, Narrator } from '../../match/narrator.js';
export { buildTeam } from '../../match/teamBuilder.js';
export { generateUniqueClubName, generateMatchClubs, resetClubPool } from '../../match/clubName.js';
export { generateUniqueName, resetNamePool } from '../../match/playerName.js';
export { League, LEAGUE_SIZE, WEEKS_PER_SEASON, SEASON_STARTING_BUDGET } from '../../match/league.js';
export { createDevelopment, DevelopmentEngine } from '../../match/development.js';
export { TransferMarket, ClubBudget, calculatePlayerValue, calculateWage, generateOfferResponse } from '../../match/transfer.js';
export { createSubstitution, MAX_SUBSTITUTIONS } from '../../match/substitution.js';
export { createMotivation, MotivationEngine } from '../../match/motivation.js';

// Commentlib'i de dışarı aç
export {
  pick, pickOne, getComment, fillTemplate,
  all as allComments, keys, stats as commentStats,
} from '../../match/commentlib/index.js';
