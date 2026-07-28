// match/teamBuilder.js
// Genişletilmiş takım oluşturucu — 22 oyuncu, 11 ilk 11, 11 yedek.

import { generateUniqueName } from './playerName.js';

const POSITIONS_BY_FORMATION = {
  '442': [
    'GK', 'DF', 'DF', 'DF', 'DF',
    'OS', 'OS', 'OS', 'OS',
    'FV', 'FV',
  ],
  '433': [
    'GK', 'DF', 'DF', 'DF', 'DF',
    'OS', 'OS', 'OS',
    'FV', 'FV', 'FV',
  ],
  '352': [
    'GK', 'DF', 'DF', 'DF',
    'OS', 'OS', 'OS', 'OS', 'OS',
    'FV', 'FV',
  ],
  '451': [
    'GK', 'DF', 'DF', 'DF', 'DF',
    'OS', 'OS', 'OS', 'OS', 'OS',
    'FV',
  ],
};

// Pozisyon için ana yetenek
const PRIMARY_ATTRS = {
  GK: 'reflexes',
  DF: 'tackling',
  OS: 'passing',
  FV: 'finishing',
};

// Pozisyon için yetenek dağılımı
const POSITION_ATTRS = {
  GK: { reflexes: 80, positioning: 70, composure: 70, passing: 50 },
  DF: { tackling: 75, marking: 70, interception: 70, aerial: 70, passing: 60 },
  OS: { passing: 75, vision: 70, decisions: 70, firstTouch: 70, dribbling: 65 },
  FV: { finishing: 78, composure: 70, shooting: 70, pace: 70, firstTouch: 70 },
};

// Yıldız oyuncu (her takımda 1-2 tane)
function makeStarBonus() {
  return Math.random() < 0.3 ? 10 : 0;
}

// Oyuncu yeteneklerini pozisyona göre üret
function makeAttrs(position, isStar) {
  const base = { ...POSITION_ATTRS[position] };
  const starBonus = isStar ? makeStarBonus() : 0;
  const variance = () => Math.floor(Math.random() * 8) - 4; // -4..+3
  for (const key in base) {
    base[key] = Math.max(20, Math.min(95, base[key] + variance() + starBonus));
  }
  return base;
}

// === TEK TAKIM ÜRETİCİ ===
// formation: '442' vs.
// substituteStars: 1-3 oyuncu stars=2 (yedeklerden)
export function buildTeam(name, formation = '442', isHome = true) {
  const lineup = POSITIONS_BY_FORMATION[formation] || POSITIONS_BY_FORMATION['442'];

  // 11 ilk 11
  const players = [];
  const usedIds = new Set();
  for (let i = 0; i < lineup.length; i++) {
    const position = lineup[i];
    const isStar = i < 2; // ilk 2 oyuncu stars alabilir
    const stars = isStar && Math.random() < 0.5 ? 2 : (Math.random() < 0.15 ? 3 : 1);
    const pname = generateUniqueName();
    const id = `${isHome ? 'h' : 'a'}_${position.toLowerCase()}_${i}`;
    usedIds.add(id);
    players.push({
      id,
      name: pname,
      position,
      stars,
      attrs: makeAttrs(position, stars >= 2),
      traits: [],
      live: {
        x: 0, y: 0,
        currentStamina: 100,
        currentMorale: 60,
        form: 0,
        extraEffort: 0,
        yellowCount: 0,
        redCard: false,
        injured: false,
        injuryWeeks: 0,
        injuryReason: null,
        passesAttempted: 0,
        passesCompleted: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        saves: 0,
        conceded: 0,
        yellowCards: 0,
        redCardYellow: false,
        foulsCommitted: 0,
        onField: false,
        subOut: false,
      },
    });
  }

  // 11 yedek (her pozisyondan)
  // 1 GK, 3 DF, 4 OS, 3 FV
  const benchSlots = [
    'GK',
    'DF', 'DF', 'DF',
    'OS', 'OS', 'OS', 'OS',
    'FV', 'FV', 'FV',
  ];
  for (let i = 0; i < benchSlots.length; i++) {
    const position = benchSlots[i];
    const isBenchStar = Math.random() < 0.25; // yedeklerden %25 stars=2
    const stars = isBenchStar ? 2 : 1;
    const pname = generateUniqueName();
    let id = `${isHome ? 'h' : 'a'}_b${position.toLowerCase()}_${i}`;
    while (usedIds.has(id)) {
      id = `${id}_${Math.floor(Math.random() * 100)}`;
    }
    usedIds.add(id);
    players.push({
      id,
      name: pname,
      position,
      stars,
      attrs: makeAttrs(position, isBenchStar),
      traits: [],
      live: {
        x: 0, y: 0,
        currentStamina: 100, // yedekler taze
        currentMorale: 60,
        form: 0,
        extraEffort: 0,
        yellowCount: 0,
        redCard: false,
        injured: false,
        passesAttempted: 0,
        passesCompleted: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        saves: 0,
        conceded: 0,
        yellowCards: 0,
        foulsCommitted: 0,
        onField: false,
        subOut: false,
      },
    });
  }

  return { name, players, formation };
}
