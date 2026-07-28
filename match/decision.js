// match/decision.js
// Oyuncunun karar mekanizması — PRIORITY TREE (rastgele ağırlık değil)
//
// Oyuncu "düşünür" (context-aware):
//   1. Kale yakın ve açıksa + yetenek yeterliyse → ŞUT
//   2. Önünde rakip var + arkadaşı daha iyi pozisyondaysa → PAS
//   3. Kanattaysa + ceza sahasına yakınsa + crossing iyiyse → ORTA
//   4. Gerideyse + defansif taktikteyse → GERİ PAS veya TUT
//   5. DEFAULT: DRIBLING (sür)
//
// "Zeka" = decisions + vision. Yüksek zeka:
//   - Daha uzaktan şut çeker
//   - Daha uzak rakibi görür (pas kararı)
//   - Daha iyi pas hedefi seçer
// Edge case'lerde (eşit koşullar) küçük bir randomness var — gerçek futbolda
// oyuncu "şaşırabilir" veya "farklı seçebilir". Bu yüzden 1-2 yerde Math.random().

import { getEffective } from './calc.js';
import { inAnyBox, inHomeBox, inAwayBox } from './state.js';

// === YARDIMCI: nokta-segment mesafesi ===
// p noktasının (px, py) ile (x1,y1)-(x2,y2) segmenti arasındaki en kısa mesafe
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// === ZEKA SEVİYESİ (0-100) ===
// Oyuncunun "durum değerlendirme" kalitesi
function intelligence(player) {
  const decisions = getEffective(player, 'decisions');
  const vision = getEffective(player, 'vision');
  return decisions * 0.55 + vision * 0.45;
}

// === TAKTİK ÇARPANLARI (deterministik threshold değişimi) ===
// Ofansif taktik → şut eşiği düşer, dribling artar
// Defansif taktik → pas eşiği yükselir, hold/recycle artar
const TACTIC_THRESHOLDS = {
  defansif: { shootRange: -6, passDetection: -3, holdBoost: 1.5 },
  kontra:   { shootRange:  2, passDetection:  0, holdBoost: 0.5 },
  kanat:    { shootRange: -2, passDetection:  0, holdBoost: 0.7 },
  merkez:   { shootRange: -1, passDetection:  2, holdBoost: 0.8 },
  ofansif:  { shootRange:  4, passDetection:  0, holdBoost: 0.3 },
  normal:   { shootRange:  0, passDetection:  0, holdBoost: 1.0 },
};

// === KARAR 1: ŞUT ETMELİ Mİ? ===
// Kale yakın mı, açık mı, oyuncunun yetenekleri yeterli mi?
function shouldShoot(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const inBox = inAnyBox(ball.x, ball.y);
  const intel = intelligence(player);
  const composure = getEffective(player, 'composure');
  const finishing = getEffective(player, 'finishing');

  // Pozisyon kısıtı: sadece FV ve OS şut çekebilir
  if (player.position !== 'FV' && player.position !== 'OS') return false;
  // GK asla şut çekmez
  if (player.position === 'GK') return false;

  // Şut aralığı (intelligence + taktik + pozisyon)
  const tactic = TACTIC_THRESHOLDS[match.tactics?.[side]?.id || 'normal'];
  let shootRange = 16 + (intel - 50) / 5 + tactic.shootRange; // 6-26 arası
  if (player.position === 'FV') shootRange += 5;

  const goalX = side === 'home' ? 100 : 0;
  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  if (distToGoal > shootRange) return false;

  // Kutuda: neredeyse her zaman şut (oyuncu bitirmeli)
  if (inBox) {
    // Düşük composure bazen panik yapar (kale ağzında pas atabilir)
    if (composure < 35 && Math.random() < 0.3) return false;
    return true;
  }

  // Kutunun dışında: blok var mı kontrol et
  const opp = side === 'home' ? match.away : match.home;
  const opponentsBlocking = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const d = distPointToSegment(p.live.x, p.live.y, ball.x, ball.y, goalX, 35);
    return d < 5; // 5 birim yakın = şut çizgisini kapatıyor
  }).length;
  if (opponentsBlocking > 0) return false;

  // Uzak şut: bitiricilik + composure yeterli mi?
  if (distToGoal > 18) {
    const shootPower = finishing * 0.6 + composure * 0.4;
    if (shootPower < 55) return false;
  }

  return true;
}

// === KARAR 2: PAS ATMALI MI? ===
// Önünde rakip var mı + takım arkadaşı daha iyi pozisyonda mı?
function shouldPass(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const intel = intelligence(player);
  const vision = getEffective(player, 'vision');
  const tactic = TACTIC_THRESHOLDS[match.tactics?.[side]?.id || 'normal'];

  // Pas aralığı (intelligence + taktik): oyuncu ne kadar uzağı görür
  const detectionRange = 7 + (intel - 50) / 5 + tactic.passDetection;

  // Önünde rakip var mı?
  const opp = side === 'home' ? match.away : match.home;
  const forwardDir = side === 'home' ? 1 : -1;
  const opponentsAhead = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const dx = (p.live.x - ball.x) * forwardDir;
    if (dx < 2) return false; // arkamızda veya yanimızda
    if (dx > detectionRange + 5) return false; // çok uzakta
    const dist = Math.hypot(p.live.x - ball.x, p.live.y - ball.y);
    return dist < detectionRange;
  }).length;
  if (opponentsAhead === 0) return false; // önü açık → sür

  // Takım arkadaşı daha iyi pozisyonda mı?
  const goalX = side === 'home' ? 100 : 0;
  const team = match[side];
  const myDistToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  const teammatesInBetterPos = team.players.filter(p => {
    if (!p.onField || p.id === player.id) return false;
    const pDist = Math.hypot(p.live.x - goalX, p.live.y - 35);
    return pDist < myDistToGoal - 8; // 8 birim daha yakın olmalı
  }).length;
  if (teammatesInBetterPos === 0) return false;

  // Düşük vision = bazen sürüp kaybedebilir (pası "görmez")
  if (vision < 40 && Math.random() < 0.4) return false;

  return true;
}

// === KARAR 3: ORTA ATMAK MI? ===
// Kanattaysa + ceza sahası yakınsa + crossing iyiyse
function shouldCross(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;

  // Kanatta mı? (y < 25 sol, y > 45 sağ)
  if (ball.y > 25 && ball.y < 45) return false;

  const crossing = getEffective(player, 'crossing');
  if (crossing < 55) return false;

  const goalX = side === 'home' ? 100 : 0;
  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  if (distToGoal > 35 || distToGoal < 12) return false;

  return true;
}

// === KARAR 4: TUT / GERİ PAS MI? ===
// Gerideyse, defansif taktikteyse veya baskı altındaysa
function shouldHoldOrRecycle(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const x = side === 'home' ? ball.x : 100 - ball.x; // normalized
  const stamina = player.live?.currentStamina ?? 100;
  const tactic = TACTIC_THRESHOLDS[match.tactics?.[side]?.id || 'normal'];

  // Gerideyse (x < 30) ve defansif taktikteyse
  if (x < 30 && tactic.holdBoost > 1.0) return true;
  // Çok yorgunsa (stamina < 25) → tut
  if (stamina < 25) return true;
  // GK zaten şut çekmez, topu oynar
  if (player.position === 'GK') return true;
  return false;
}

// === PAS TİPİ SEÇİMİ: kısa mı uzun mı? ===
// En uygun takım arkadaşına olan mesafeye göre
export function pickPassType(player, match) {
  const side = match.ballSide;
  const team = match[side];
  const goalX = side === 'home' ? 100 : 0;
  const ball = match.ballPos;

  // En iyi pas hedefini bul (vizyon + mesafe + ileri)
  let bestTarget = null;
  let bestScore = -Infinity;
  for (const p of team.players) {
    if (!p.onField || p.id === player.id) continue;
    const dist = Math.hypot(p.live.x - ball.x, p.live.y - ball.y);
    if (dist < 5 || dist > 50) continue;
    const forwardDelta = side === 'home'
      ? p.live.x - ball.x
      : ball.x - p.live.x;
    // Skor: ileri + yakın + alıcının bitiriciliği
    const score = (forwardDelta * 2) - (dist * 0.5) + (getEffective(p, 'firstTouch') * 0.3);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = { player: p, distance: dist, forward: forwardDelta };
    }
  }

  if (!bestTarget) return 'passShort'; // fallback
  if (bestTarget.distance <= 18) return 'passShort';
  return 'passLong';
}

// === ANA KARAR FONKSİYONU (priority tree) ===
export function decideAction(player, match) {
  // 1) ŞUT — en yüksek öncelik
  if (shouldShoot(player, match)) return 'shoot';

  // 2) ORTA — kanattaysa ve orta atmak mantıklıysa
  if (shouldCross(player, match)) return 'cross';

  // 3) PAS — önü kapalı + arkadaşı iyi pozisyonda
  if (shouldPass(player, match)) return pickPassType(player, match);

  // 4) TUT / GERİ PAS — gerideyse veya yorgunsa veya defansif taktikteyse
  if (shouldHoldOrRecycle(player, match)) {
    const ball = match.ballPos;
    const x = match.ballSide === 'home' ? ball.x : 100 - ball.x;
    // Gerideyse recycle (geri pas), yoksa hold (top sakla)
    if (x < 30) return 'recycle';
    return 'hold';
  }

  // 5) DEFAULT: DRIBLING (top sürmek)
  // Oyuncu "akıllıysa" (yüksek intelligence) bazen agresif ilerler
  return 'dribble';
}

export function pickPassTarget(carrier, match, type = 'short') {
  const side = match.ballSide;
  const team = match[side];
  const onField = team.players.filter(p => p.onField);
  const carriers = onField.filter(p => p.id !== carrier.id);
  if (!carriers.length) return null;

  // Her aday için skor
  const ball = match.ballPos;
  const candidates = carriers.map(target => {
    let score = 0;
    let distance = Math.hypot(target.live.x - ball.x, target.live.y - ball.y);

    // Mesafe uygunluğu
    if (type === 'short') {
      // 5-20 birim mesafe ideal
      if (distance < 5) score -= 0.5;
      else if (distance <= 15) score += 1.0;
      else if (distance <= 25) score += 0.4;
      else score -= 0.3;
    } else if (type === 'long') {
      // 25-45 birim mesafe
      if (distance >= 25 && distance <= 45) score += 1.0;
      else if (distance > 45) score += 0.3;
      else score -= 0.4;
    } else if (type === 'cross') {
      // Kanattan ceza sahası
      if (distance >= 15 && distance <= 30) score += 0.8;
    }

    // Hedef açıda mı? (ileriye doğru)
    const forwardDelta = side === 'home'
      ? target.live.x - ball.x
      : ball.x - target.live.x;
    if (forwardDelta > 0) score += 0.3;
    if (forwardDelta > 10) score += 0.4;
    if (forwardDelta > 20) score += 0.5;

    // Rakip oyuncu yoğunluğu az olan bölge
    const opp = side === 'home' ? match.away : match.home;
    const opponentsNearby = opp.players.filter(p => p.onField && Math.hypot(p.live.x - target.live.x, p.live.y - target.live.y) < 12).length;
    score -= opponentsNearby * 0.15;

    // Yetenek uyumu
    const receive = getEffective(target, 'firstTouch');
    score += receive / 250;

    return { target, distance, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  // Ağırlıklı seçim: en iyi 3 aday
  const top = candidates.slice(0, 3);
  const total = top.reduce((s, c) => s + Math.max(0.01, c.score), 1e-9);
  let r = Math.random() * total;
  for (const c of top) {
    r -= Math.max(0.01, c.score);
    if (r <= 0) return { side, playerId: c.target.id, distance: c.distance };
  }
  return { side, playerId: top[0].target.id, distance: top[0].distance };
}

// === ESKİ API UYUMLULUĞU ===
// Bazı yerlerde decisionWeights + pickAction kullanılıyor, onları koruyalım
export function decisionWeights(player, match) {
  const action = decideAction(player, match);
  // Seçilen aksiyonun ağırlığı 1, diğerleri 0 (backward compat)
  const weights = {
    shoot: 0, passShort: 0, passLong: 0, cross: 0,
    dribble: 0, hold: 0, recycle: 0,
  };
  weights[action] = 1.0;
  return weights;
}

export function pickAction(player, match) {
  return decideAction(player, match);
}
