// match/decision.js
// Oyuncunun karar mekanizması — PRIORITY TREE (rastgele ağırlık değil)
//
// Oyuncu "düşünür" (context-aware):
//   1. Kale yakın ve açıksa + yetenek yeterliyse → ŞUT
//   2. Kanattaysa + ceza sahasına yakınsa + crossing iyiyse → ORTA
//   3. PAS mi DRIBBLE mi? → PPO policy (RL eğitilmiş) veya rule-based fallback
//   4. Gerideyse + defansif taktikteyse → TUT
//   5. DEFAULT: DRIBLING (sür)
//
// "Zeka" = decisions + vision. Yüksek zeka:
//   - Daha uzaktan şut çeker
//   - Daha uzak rakibi görür (pas kararı)
//   - Daha iyi pas hedefi seçer
//
// RL Entegrasyonu: PPO policy (scripts/rl/ppo_model.json) "pas mı dribble mı"
// kararını veriyor. PPO yüklü değilse rule-based shouldPass'e fallback.

import { getEffective } from './calc.js';
import { inAnyBox, inHomeBox, inAwayBox } from './state.js';
import { ppoDecide, ppoForward, extractState } from './ppo_policy.js';
import { getPressure, isInMotion, getOpenness } from './positions.js';

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

  // Şut aralığı (intelligence + taktik + pozisyon) — gerçekçi 18-30m
  const tactic = TACTIC_THRESHOLDS[match.tactics?.[side]?.id || 'normal'];
  let shootRange = 18 + (intel - 50) / 5 + tactic.shootRange; // 8-28 arası
  if (player.position === 'FV') shootRange += 8; // FV 16-36m

  const goalX = side === 'home' ? 100 : 0;
  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  if (distToGoal > shootRange) return false;

  // Uzak şutlar için yeterli şut gücü (xG: uzak şut zaten düşük gol şansı,
  // ama denemek mantıklı — gerçek maçlarda her 90dk 20-25 şut atılır)
  if (distToGoal > 18) {
    const shootPower = finishing * 0.6 + composure * 0.4;
    if (shootPower < 40) return false; // 40+ yeterli (önce 55 çok yüksekti)
  }

  // Kutuda: neredeyse her zaman şut (oyuncu bitirmeli)
  if (inBox) {
    if (composure < 35 && Math.random() < 0.3) return false;
    return true;
  }

  // Kutunun dışında: sadece çok yakın rakip varsa blokla (3m)
  const opp = side === 'home' ? match.away : match.home;
  const opponentsBlocking = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const d = distPointToSegment(p.live.x, p.live.y, ball.x, ball.y, goalX, 35);
    return d < 3;
  }).length;
  if (opponentsBlocking > 0) return false;

  // Uzak şut: yetenekli oyuncu (xG: orta seviye yeterli, kalite xG'yi artırır)
  if (distToGoal > 18) {
    const shootPower = finishing * 0.6 + composure * 0.4;
    if (shootPower < 40) return false; // 40+ yeterli
  }

  return true;
}

// === KARAR 2: PAS ATMALI MI? ===
// "Zeka" temelli karar: oyuncu durumu değerlendirir, sürüş veya pas seçer.
// - Önünde 2+ rakip → sıkışmış, pas düşün
// - Tek rakip + iyi pozisyon → geçmeyi dene (dribble)
// - Takım arkadaşı 8m+ daha iyi pozisyonda → pas değer
// - Vision yüksekse uzak arkadaşı görür
function shouldPass(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const intel = intelligence(player);
  const vision = getEffective(player, 'vision');
  const tactic = TACTIC_THRESHOLDS[match.tactics?.[side]?.id || 'normal'];

  // Pas aralığı: yüksek zeka = uzağı görür (10-20m)
  const detectionRange = 10 + (intel - 50) / 5 + tactic.passDetection;

  // Önünde rakip var mı? (en az 5m ahead)
  const opp = side === 'home' ? match.away : match.home;
  const forwardDir = side === 'home' ? 1 : -1;
  const opponentsAhead = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const dx = (p.live.x - ball.x) * forwardDir;
    if (dx < 5) return false;
    if (dx > detectionRange + 8) return false;
    const dist = Math.hypot(p.live.x - ball.x, p.live.y - ball.y);
    return dist < detectionRange + 3;
  }).length;

  // Önünde rakip yoksa serbest alanda → sür
  if (opponentsAhead === 0) return false;

  // Tek rakip varsa çoğunlukla sür (birebir geçmeyi dene)
  // Yüksek zeka + yüksek vision = arkadaşı görür ve pas atar
  if (opponentsAhead === 1) {
    if (intel < 65 || vision < 60) return false;
    // Yüksek zeka bile bazen geçmeyi dener (mekanik olmasın)
    if (Math.random() < 0.45) return false;
  }

  // Takım arkadaşı 8m+ daha iyi pozisyonda mı?
  const goalX = side === 'home' ? 100 : 0;
  const team = match[side];
  const myDistToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  const teammatesInBetterPos = team.players.filter(p => {
    if (!p.onField || p.id === player.id) return false;
    const pDist = Math.hypot(p.live.x - goalX, p.live.y - 35);
    return pDist < myDistToGoal - 8;
  }).length;
  if (teammatesInBetterPos === 0) return false;

  // Düşük vision = bazen sürüp "kaybedebilir"
  if (vision < 50 && Math.random() < 0.4) return false;

  return true;
}

// === KARAR 3: ORTA ATMAK MI? ===
// Kanattaysa + ceza sahası yakınsa + crossing iyiyse
function shouldCross(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;

  // Pozisyon kısıtı: kanat oyuncusu (formationPos y < 25 veya y > 45) veya OS
  const fpY = player.formationPos?.y ?? 35;
  const isWinger = fpY < 25 || fpY > 45;
  if (!isWinger && player.position !== 'FV') return false;

  // Kanatta mı? (y < 30 sol, y > 40 sağ)
  if (ball.y >= 30 && ball.y <= 40) return false;

  const crossing = getEffective(player, 'crossing');
  if (crossing < 55) return false;

  const goalX = side === 'home' ? 100 : 0;
  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  // 12-30m arası — gerçekçi kanat-orta mesafesi
  if (distToGoal > 30 || distToGoal < 12) return false;

  return true;
}

// === KARAR 4: TUT MU? (sadece çok yorgunluk veya çok geride) ===
function shouldHoldOrRecycle(player, match) {
  const stamina = player.live?.currentStamina ?? 100;
  // Çok yorgunsa (stamina < 20) → top sakla, kayıp riskini azalt
  if (stamina < 20) return true;
  return false;
}

// === GK ÖZEL KARARI ===
// Kaleci asla dribble etmez. Sadece:
// - Baskı altındaysa → uzun pas (kale vuruşu gibi uzağa at)
// - Yakın arkadaş varsa → kısa pas (oyunu kur)
// - Sakin ve uzak → top tut, beklet
function decideForGoalkeeper(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const team = match[side];
  const opp = side === 'home' ? match.away : match.home;

  // Baskı altında mı? (rakip 8m yakın mı)
  const underPressure = opp.players.some(p =>
    p.onField && p.position !== 'GK' &&
    Math.hypot(p.live.x - ball.x, p.live.y - ball.y) < 8
  );

  if (underPressure) {
    // Acele: uzağa at (havadan top)
    const longTarget = team.players
      .filter(p => p.onField && p.id !== player.id && (p.position === 'FV' || p.position === 'OS'))
      .map(p => ({ p, d: Math.hypot(p.live.x - ball.x, p.live.y - ball.y) }))
      .sort((a, b) => b.d - a.d)[0]; // en uzak FW/OS → havadan top
    if (longTarget) return 'passLong';
    return 'passLong'; // fallback
  }

  // Baskı yok: kısa pas veya top tut
  const nearbyTeammate = team.players.some(p =>
    p.onField && p.id !== player.id &&
    Math.hypot(p.live.x - ball.x, p.live.y - ball.y) < 18
  );
  if (nearbyTeammate) return 'passShort';

  return 'hold'; // sakin, top sakla
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
  // GK: özel karar sistemi — asla dribble etmez
  if (player.position === 'GK') {
    return decideForGoalkeeper(player, match);
  }

  // 1) ŞUT — kale yakınsa (PPO'dan önce)
  if (shouldShoot(player, match)) return 'shoot';

  // === ENTEGRASYON: sıkışıklık + hareket durumu ===
  // positions.js'den bilgi al: oyuncu sıkışmış mı, hareket halinde mi, boş alan var mı?
  const pressure = getPressure(player, match, 5);   // 5m içinde rakip sayısı
  const openness = getOpenness(player, match, 8);   // 0-1 boş alan skoru
  const inMotion = isInMotion(player, match);        // hareket halinde mi?

  // 2) PPO RL policy — gerçek Fmsim verisinden öğrendi (5 action)
  const ppoAction = ppoDecide(player, match);
  if (ppoAction) {
    // === ENTEGRASYON: PPO + pressure ===
    // Sıkışmışken PPO 'dribble' dese bile → pas tercih et (organized)
    if (ppoAction === 'dribble' && pressure >= 2 && openness < 0.3) {
      // Çok sıkışmış, PPO'yu override et
      if (shouldPass(player, match)) return pickPassType(player, match);
    }
    // Hareket halindeyken PPO 'passShort' → motion pass (daha güvenli)
    if (ppoAction === 'passShort' && inMotion && pressure < 1) {
      // Hareket halinde ve boş alan → dribble'a dönüştür
      return 'dribble';
    }
    if (ppoAction === 'shoot') return 'shoot';
    if (ppoAction === 'cross' && shouldCross(player, match)) return 'cross';
    if (ppoAction === 'passShort') return 'passShort';
    if (ppoAction === 'passLong') return 'passLong';
    if (ppoAction === 'dribble') return 'dribble';
  }

  // 3) Rule-based fallback (PPO yoksa veya guard başarısız)
  // === ENTEGRASYON: pressure + motion ===
  // Sıkışmış + pas mümkün → pas
  if (pressure >= 2 && openness < 0.3 && shouldPass(player, match)) {
    return pickPassType(player, match);
  }
  // Hareket halinde + boş alan + pas arkadaşsız → dribble
  if (inMotion && openness > 0.5 && !shouldPass(player, match)) {
    return 'dribble';
  }

  if (shouldCross(player, match)) return 'cross';
  if (shouldPass(player, match)) return pickPassType(player, match);
  if (shouldHoldOrRecycle(player, match)) {
    return 'hold';
  }

  // 5) DEFAULT: DRIBLING (top sürmek) — oyuncular her zaman sürüşü tercih eder
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
  const opp = side === 'home' ? match.away : match.home;
  const carriersIntel = intelligence(carrier);

  const candidates = carriers.map(target => {
    let score = 0.5; // base: her oyuncu aday olabilir
    let distance = Math.hypot(target.live.x - ball.x, target.live.y - ball.y);

    // Mesafe uygunluğu (daha esnek)
    if (type === 'short') {
      if (distance < 3) score -= 0.5; // çok yakın = ayakta
      else if (distance <= 18) score += 1.0; // ideal
      else if (distance <= 30) score += 0.5; // uzak ama olur
      else score -= 0.2; // çok uzak
    } else if (type === 'long') {
      if (distance >= 20 && distance <= 45) score += 1.2; // ideal uzun
      else if (distance >= 15) score += 0.5;
      else score -= 0.3;
    } else if (type === 'cross') {
      if (distance >= 12 && distance <= 30) score += 0.8;
    }

    // İleriye doğru mu? (kale yönünde)
    const forwardDelta = side === 'home'
      ? target.live.x - ball.x
      : ball.x - target.live.x;
    if (forwardDelta > 0) score += 0.3;
    if (forwardDelta > 8) score += 0.4;
    if (forwardDelta > 18) score += 0.5;

    // Hedefin çevresinde rakip yoğunluğu
    const opponentsNearby = opp.players.filter(p =>
      p.onField && p.position !== 'GK' &&
      Math.hypot(p.live.x - target.live.x, p.live.y - target.live.y) < 10
    ).length;
    score -= opponentsNearby * 0.20;

    // "Boş alan" skoru: hedefin etrafında boşluk varsa pas değerli
    const targetOpenness = Math.max(0, 1 - opponentsNearby * 0.25);
    score += targetOpenness * 0.4;

    // Hedefin bitiriciliği (gol pozisyonuna yakınsa önemli)
    const goalX = side === 'home' ? 100 : 0;
    const distToGoal = Math.hypot(target.live.x - goalX, target.live.y - 35);
    if (distToGoal < 25) score += 0.5; // tehlikeli bölgede
    if (distToGoal < 15) score += 0.7; // ceza sahasında

    // Yetenek uyumu
    const receive = getEffective(target, 'firstTouch');
    score += receive / 300;

    // Pozisyon uyumu: hücum oyuncularına hücum pası
    if (target.position === 'FV' && distToGoal < 30) score += 0.4;
    if (target.position === 'OS' && distToGoal < 40) score += 0.3;

    return { target, distance, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  // Ağırlıklı seçim: en iyi 4 aday (daha çeşitli = daha az mekanik)
  const topN = carriersIntel > 65 ? 4 : 3;
  const top = candidates.slice(0, topN);
  const total = top.reduce((s, c) => s + Math.max(0.05, c.score), 1e-9);
  let r = Math.random() * total;
  for (const c of top) {
    r -= Math.max(0.05, c.score);
    if (r <= 0) {
      // === PAS STİLİ HESAPLA (yeni) ===
      const passStyle = pickPassStyle(carrier, match, c.target, type);
      return { side, playerId: c.target.id, distance: c.distance, passStyle };
    }
  }
  const lastStyle = pickPassStyle(carrier, match, top[0].target, type);
  return { side, playerId: top[0].target.id, distance: top[0].target.distance, passStyle: lastStyle };
}

// === PAS STİLİ SEÇİMİ ===
// Yön + mesafe + duruma göre stil belirle
function pickPassStyle(carrier, match, target, type) {
  const side = match.ballSide;
  const ball = match.ballPos;
  const goalX = side === 'home' ? 100 : 0;
  const forwardSign = side === 'home' ? 1 : -1;
  const dx = target.live.x - ball.x;
  const dist = Math.hypot(target.live.x - ball.x, target.live.y - ball.y);
  const directionType = (dx * forwardSign) > 5 ? 'forward'
                       : (dx * forwardSign) < -5 ? 'backward'
                       : 'lateral';

  // inBox + backward → cutback (ceza sahası içi geri pas)
  const inBox = inAnyBox(ball.x, ball.y);
  if (inBox && directionType === 'backward' && dist < 12) return 'cutback';

  // Short pas
  if (type === 'short') {
    // İleri + tehlikeli bölge → through_ball (nadir ama değerli)
    const distToGoal = Math.hypot(target.live.x - goalX, target.live.y - 35);
    if (directionType === 'forward' && distToGoal < 25 && Math.random() < 0.15) {
      return 'through_ball';
    }
    // Yumuşak hava (rastgele %15)
    if (Math.random() < 0.15) return 'short_lofted';
    return 'short_ground';
  }

  // Long pas
  if (type === 'long') {
    // İleri + uzak → swing (havadan)
    if (directionType === 'forward' && Math.random() < 0.4) return 'long_lofted';
    return 'long_ground';
  }

  return type === 'short' ? 'short_ground' : 'long_ground';
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
