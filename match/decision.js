// match/decision.js
// Top taşıyan oyuncunun karar mekanizması.
// Yeteneklere + bağlama + tehlike seviyesine göre aksiyon seçer.

import { getEffective } from './calc.js';
import { inAnyBox, threatOf } from './state.js';

const ACTIONS = ['shoot', 'passShort', 'passLong', 'cross', 'dribble', 'hold', 'recycle'];

/**
 * Karar ağırlıklarını hesapla — oyuncunun aksiyon seçim skoru.
 *   player: oyuncu
 *   match: state
 *
 * Dönüş: { shoot: 0.7, passShort: 0.5, passLong: 0.2, ... }
 */
export function decisionWeights(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const x = side === 'home' ? ball.x : 100 - ball.x; // saldıran taraf için normalize
  const inBox = inAnyBox(ball.x, ball.y);

  // Tehdit seviyesi (0-1)
  const threat = threatOf(ball.x, ball.y, side);

  // Stamina / yorgunluk
  const stamina = player.live?.currentStamina ?? 100;
  const tired = stamina < 40;

  // 1) ŞUT — sadece hücum oyuncuları için, sadece tehlikeli bölgede
  let shoot = 0;
  if (player.position === 'FV' || player.position === 'OS') {
    if (inBox) {
      shoot = 0.9 + threat * 0.1;
    } else if (x > 78) {
      shoot = 0.5 + threat * 0.2;
    } else if (x > 65 && player.position === 'FV') {
      // Sadece FV'ler uzaktan şut deneyebilir
      shoot = 0.10;
    }
  }
  // Bitiricilik yetenekleri bu aksiyonu kuvvetlendirir
  const finishing = getEffective(player, 'finishing');
  const composure = getEffective(player, 'composure');
  const longShots = getEffective(player, 'longShots');
  const shooting = getEffective(player, 'shooting');
  if (inBox) {
    shoot *= 0.5 + (finishing + composure) / 200; // 50-150% arası
  } else {
    shoot *= 0.3 + (longShots + shooting) / 250;
  }

  // 2) KISA PAS
  let passShort = 0.30; // biraz azaltıldı — eskiden 0.4, dribling lehine
  if (inBox) passShort = 0.10; // kutuda az tercih, şut kazansın
  if (x < 30) passShort = 0.55; // geride güvenli oyun
  const passing = getEffective(player, 'passing');
  const vision = getEffective(player, 'vision');
  const decisions = getEffective(player, 'decisions');
  passShort *= 0.5 + (passing * 0.6 + vision * 0.3 + decisions * 0.1) / 100;

  // 3) UZUN PAS
  let passLong = 0.15;
  if (x > 50 && !inBox) passLong = 0.30; // orta sahadan ileri
  if (x < 25) passLong = 0.40; // geriden başlat
  const firstTouch = getEffective(player, 'firstTouch');
  passLong *= 0.4 + (passing * 0.4 + vision * 0.4 + firstTouch * 0.2) / 100;

  // 4) ORTA
  let cross = 0;
  if (x > 50 && ball.y < 25) cross = 0.45; // sol kanat
  if (x > 50 && ball.y > 45) cross = 0.45; // sağ kanat
  if (inBox) cross = 0.10;
  if (x < 50) cross = 0.08;
  const crossing = getEffective(player, 'crossing');
  const fl = getEffective(player, 'flair');
  cross *= 0.5 + (crossing * 0.7 + fl * 0.3) / 100;

  // 5) DRIPLING — önemli ölçüde artırıldı
  let dribble = 0.50; // base 0.25'ten 0.50'ye
  if (x > 25 && x < 75 && !inBox) dribble = 0.85; // orta sahada çok aktif
  if (inBox) dribble = 0.45; // kutuda da deneyebilir
  if (x < 20) dribble = 0.20; // geride riskli
  // Pozisyon bazlı bonus
  if (player.position === 'FV' && x > 40) dribble += 0.30; // forvetler bireysel başlatır
  if (player.position === 'OS' && x > 30 && x < 70) dribble += 0.20; // orta saha yaratıcı
  const dribbling = getEffective(player, 'dribbling');
  const agility = getEffective(player, 'agility');
  const pace = getEffective(player, 'pace');
  const fl2 = getEffective(player, 'flair');
  dribble *= 0.5 + (dribbling * 0.4 + agility * 0.25 + pace * 0.2 + fl2 * 0.15) / 100;

  // 6) TOP TUT (hold)
  let hold = 0.1;
  if (tired) hold = 0.4; // yorgunken top saklama
  if (inBox) hold = 0.05;
  hold *= 0.7 + composure / 200;

  // 7) GERİ DÖNÜŞ (recycle)
  let recycle = 0.1;
  if (x < 30) recycle = 0.35; // geride güvenli geri pas

  // Stamina etkisi — yorgun oyuncu daha az hareket
  if (tired) {
    dribble *= 0.6;
    cross *= 0.7;
    passLong *= 0.7;
    hold *= 1.3;
  }

  // Saldıran taraf öne gittikçe şut artar (son bölüm)
  // Bu, mantıken: dakika 80+ geride olan taraf daha çok şut çeker
  // (bunu caller ekleyebilir)

  // Agresiflik
  const aggression = getEffective(player, 'aggression');
  if (aggression > 70 && x > 60) shoot *= 1.15;

  // Liderlik
  const leadership = getEffective(player, 'leadership');
  if (leadership > 75 && match.minute > 70) passShort *= 1.1; // oyunu soğutma eğilimi

  // === TAKTİK ÇARPANI ===
  const tactics = match.tactics?.[side] || 'normal';
  switch (tactics) {
    case 'defansif':
      shoot *= 0.5; passShort *= 0.8; passLong *= 0.5; cross *= 0.4;
      hold *= 1.5; recycle *= 1.3; dribble *= 0.6;
      break;
    case 'kontra':
      // Top bizdeyken defansif, hızlı çıkışlar
      if (x < 50) { hold *= 0.6; shoot *= 0.7; }
      if (x > 70) { shoot *= 1.6; passLong *= 1.3; cross *= 1.2; }
      break;
    case 'kanat':
      cross *= 1.8; passLong *= 1.2; shoot *= 0.85;
      break;
    case 'merkez':
      passShort *= 1.4; passLong *= 0.6; cross *= 0.3; dribble *= 1.2;
      break;
    case 'ofansif':
      shoot *= 1.6; cross *= 1.3; passLong *= 1.2; dribble *= 1.2;
      hold *= 0.5; recycle *= 0.5;
      break;
  }

  return { shoot, passShort, passLong, cross, dribble, hold, recycle };
}

/**
 * Ağırlıklı seçim → aksiyon.
 */
export function pickAction(player, match) {
  const w = decisionWeights(player, match);
  // pickAction burada
  const entries = Object.entries(w);
  const total = entries.reduce((s, [_, v]) => s + Math.max(0, v), 1e-9);
  let r = Math.random() * total;
  for (const [action, weight] of entries) {
    r -= Math.max(0, weight);
    if (r <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

/**
 * Pas hedefi seç (kısa/uzun/orta).
 *   carrier: pas atan
 *   match: state
 *   type: 'short' | 'long' | 'cross'
 *
 * Dönüş: { side, playerId, x, y, distance, success }
 */
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
