// match/state.js
// Maç state şeması. engine3 ile aynı isimlendirme prensibi:
//   mevcut değişken isimleri birebir, ek alanlar state'e eklenir.

// Saha grid'i: 100x70 (boy x en)
//   x: 0-100 (kale yönü)
//   y: 0-70 (kanat)
//
//   Kale ev sahibi:  x=0
//   Kale deplasman:  x=100
//
//   Ceza sahası ev:  x ∈ [0, 16]
//   Ceza sahası dep: x ∈ [84, 100]
//   Orta saha ortası: x = 50

export const PITCH = {
  width: 100,
  height: 70,
  homeGoal: { x: 0, y: 35 },
  awayGoal: { x: 100, y: 35 },
  homePenaltyArea: { xMin: 0, xMax: 16, yMin: 17, yMax: 53 },
  awayPenaltyArea: { xMin: 84, xMax: 100, yMin: 17, yMax: 53 },
  homeSixYard: { xMin: 0, xMax: 6, yMin: 28, yMax: 42 },
  awaySixYard: { xMin: 94, xMax: 100, yMin: 28, yMax: 42 },
  center: { x: 50, y: 35 },
};

export function inHomeBox(x, y) {
  return x >= PITCH.homePenaltyArea.xMin && x <= PITCH.homePenaltyArea.xMax
    && y >= PITCH.homePenaltyArea.yMin && y <= PITCH.homePenaltyArea.yMax;
}
export function inAwayBox(x, y) {
  return x >= PITCH.awayPenaltyArea.xMin && x <= PITCH.awayPenaltyArea.xMax
    && y >= PITCH.awayPenaltyArea.yMin && y <= PITCH.awayPenaltyArea.yMax;
}
export function inAnyBox(x, y) {
  return inHomeBox(x, y) || inAwayBox(x, y);
}

// Pozisyon derecesi: topun sahadaki bölgesi
export function zoneOf(x, y) {
  if (x < 16) return 'DEFENSIVE_THIRD';
  if (x < 32) return 'DEFENSIVE_MID';
  if (x < 50) return 'MIDFIELD_LEFT';
  if (x < 68) return 'MIDFIELD_RIGHT';
  if (x < 84) return 'ATTACKING_MID';
  return 'ATTACKING_THIRD';
}

// Tehdit seviyesi (0-1): top ne kadar tehlikeli (ev sahibi saldırıyor varsayımı)
export function threatOf(x, y, side) {
  // side: 'home' → ev hücumunda x yüksek tehlikeli
  //       'away' → deplasman hücumunda x düşük tehlikeli
  if (side === 'home') return x / 100;
  return (100 - x) / 100;
}

export function makeMatchState({ home, away, homeFormation = '442', awayFormation = '442', weather = 'sunny', pitch = 'dry', referee = 'fair' } = {}) {
  return {
    // === engine3 ile uyumlu alanlar ===
    home, away,
    minute: 0,
    homeScore: 0, awayScore: 0,
    events: [],                 // [{ minute, type, side, actor, x, y, text, ... }]
    ballPos: { x: 50, y: 35 },
    ballSide: Math.random() < 0.5 ? 'home' : 'away',
    ballCarrier: null,          // { side, playerId }
    matchVars: { weather, pitch, referee, derby: false },

    // === ek alanlar (Match Engine) ===
    config: {
      goalBoost: 1.0,
      tickMs: 1500,             // WS push aralığı
      substitutions: { home: 5, away: 5 },
      playerMentionInterval: 3,
    },
    pitch: PITCH,

    // istatistikler
    stats: {
      possession: { home: 0, away: 0 },     // 0-100 yüzde, güncellenecek
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      offsides: { home: 0, away: 0 },
      passesCompleted: { home: 0, away: 0 },
      passesAttempted: { home: 0, away: 0 },
    },

    // momentum (0.5 = denge, >0.5 home lehine)
    momentum: 0.5,

    // son olay bilgisi (narrative engine için)
    lastEvent: null,
    lastEventMinute: -100,
    lastEventType: null,

    // taktik & formasyon
    tactics: { home: { id: 'normal', changes: 0 }, away: { id: 'normal', changes: 0 } },
    formation: { home: homeFormation, away: awayFormation },

    // dakika başına sayaçlar (poss hesabı için)
    tickCount: 0,
  };
}

// Oyuncu state'den canlı bul
export function findPlayer(match, side, playerId) {
  const team = match[side];
  return team?.players?.find(p => p.id === playerId || p.name === playerId) || null;
}

export function findPlayerByPos(match, side, role) {
  const team = match[side];
  return team?.players?.find(p => p.position === role && p.onField) || null;
}

// Oyuncu maçta mı?
export function isOnField(match, side, playerId) {
  return !!findPlayer(match, side, playerId);
}
