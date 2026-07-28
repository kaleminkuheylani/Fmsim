// match/positions.js
// Oyuncuların sahadaki pozisyonlarını yönet.
// Formasyona göre başlangıç, topa göre dinamik kayma.

import { PITCH } from './state.js';

const FORMATIONS = {
  // [GK, DF x n, OS x n, FV x n] → [{ x, y }]
  '442': [
    { role: 'GK', x: 5, y: 35 },
    { role: 'DF', x: 22, y: 12 },
    { role: 'DF', x: 20, y: 25 },
    { role: 'DF', x: 20, y: 45 },
    { role: 'DF', x: 22, y: 58 },
    { role: 'OS', x: 42, y: 12 },
    { role: 'OS', x: 45, y: 28 },
    { role: 'OS', x: 45, y: 42 },
    { role: 'OS', x: 42, y: 58 },
    { role: 'FV', x: 70, y: 28 },
    { role: 'FV', x: 70, y: 42 },
  ],
  '433': [
    { role: 'GK', x: 5, y: 35 },
    { role: 'DF', x: 22, y: 14 },
    { role: 'DF', x: 20, y: 28 },
    { role: 'DF', x: 20, y: 42 },
    { role: 'DF', x: 22, y: 56 },
    { role: 'OS', x: 42, y: 22 },
    { role: 'OS', x: 45, y: 35 },
    { role: 'OS', x: 42, y: 48 },
    { role: 'FV', x: 70, y: 18 },
    { role: 'FV', x: 75, y: 35 },
    { role: 'FV', x: 70, y: 52 },
  ],
  '352': [
    { role: 'GK', x: 5, y: 35 },
    { role: 'DF', x: 20, y: 20 },
    { role: 'DF', x: 18, y: 35 },
    { role: 'DF', x: 20, y: 50 },
    { role: 'OS', x: 40, y: 8 },
    { role: 'OS', x: 42, y: 22 },
    { role: 'OS', x: 45, y: 35 },
    { role: 'OS', x: 42, y: 48 },
    { role: 'OS', x: 40, y: 62 },
    { role: 'FV', x: 70, y: 25 },
    { role: 'FV', x: 70, y: 45 },
  ],
  '451': [
    { role: 'GK', x: 5, y: 35 },
    { role: 'DF', x: 22, y: 12 },
    { role: 'DF', x: 20, y: 25 },
    { role: 'DF', x: 20, y: 45 },
    { role: 'DF', x: 22, y: 58 },
    { role: 'OS', x: 40, y: 8 },
    { role: 'OS', x: 42, y: 22 },
    { role: 'OS', x: 45, y: 32 },
    { role: 'OS', x: 45, y: 38 },
    { role: 'OS', x: 42, y: 48 },
    { role: 'FV', x: 70, y: 35 },
  ],
};

export function getFormationPositions(formationId) {
  return FORMATIONS[formationId] || FORMATIONS['442'];
}

/**
 * İlk 11'i sahaya diz.
 *   team: { players: [...] }
 *   formationId: '442' vs.
 *
 * Her oyuncuya live.x, live.y atanır.
 */
export function deployLineup(team, formationId, mirror = false) {
  const slots = getFormationPositions(formationId);
  // Sıralama: role'a göre sıralanmış oyuncuları slotlara yerleştir
  const used = new Set();
  const fielded = [];

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    const candidate = team.players
      .filter(p => p.position === slot.role && !used.has(p.id))
      .sort((a, b) => (b.attrs?.[primaryAttrForRole(slot.role)] ?? 0) - (a.attrs?.[primaryAttrForRole(slot.role)] ?? 0))[0];

    const placePlayer = (p) => {
      used.add(p.id);
      p.onField = true;
      p.live.x = mirror ? 100 - slot.x : slot.x;
      p.live.y = slot.y;
      // KRİTİK: her oyuncuya kendi slot'unu atıyoruz.
      // basePositionOf bunu okuyunca her oyuncu kendi formasyon noktasına döner.
      p.formationSlotIdx = slotIdx;
      p.formationPos = { x: p.live.x, y: p.live.y };
      fielded.push(p);
    };

    if (candidate) {
      placePlayer(candidate);
    } else {
      // yedek oyuncuyu zorla çek (aşağı yukarı aynı rolden)
      const bench = team.players
        .filter(p => !used.has(p.id) && adjacentRole(slot.role).includes(p.position))
        .sort((a, b) => b.attrs?.[primaryAttrForRole(slot.role)] - a.attrs?.[primaryAttrForRole(slot.role)])[0];
      if (bench) {
        bench.position = slot.role; // geçici rol değişimi
        bench.originalPosition = bench.originalPosition || bench.position;
        placePlayer(bench);
      }
    }
  }
  return fielded;
}

function primaryAttrForRole(role) {
  return { GK: 'reflexes', DF: 'tackling', OS: 'passing', FV: 'finishing' }[role] || 'passing';
}

function adjacentRole(role) {
  return { GK: ['GK'], DF: ['DF', 'OS'], OS: ['OS', 'DF', 'FV'], FV: ['FV', 'OS'] }[role] || [role];
}

/**
 * Her dakika çağrılır: oyuncular topa göre kayar.
 * - Savunma oyuncuları: top kendi yarılarındayken arkaya çekilir
 * - Orta saha: topa göre 5-10 birim kayar
 * - Hücum: topa doğru çıkar
 */
export function updatePositions(match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const carrier = match.ballCarrier;

  for (const teamSide of ['home', 'away']) {
    const team = match[teamSide];
    const isMyBall = side === teamSide;
    // === TOP KENDI YARISINDA MI? (formasyon geçişi) ===
    // home soldan sağa hücum eder, x<50 = kendi yarısı
    // away sağdan sola hücum eder, x>50 = kendi yarısı
    const ownHalfMax = teamSide === 'home' ? 50 : 50;
    const ballInOwnHalf = teamSide === 'home' ? ball.x < ownHalfMax : ball.x > ownHalfMax;
    // Top kendi yarısındaysa takım geri çekilir (savunma dizilimi)
    const teamCompactness = isMyBall ? 0 : (ballInOwnHalf ? 0.6 : 0.3);

    for (const p of team.players) {
      if (!p.onField) continue;

      // Temel formasyon pozisyonu (oyuncunun kendi slot'u)
      const base = basePositionOf(p);
      if (!base) continue;

      let targetX = base.x;
      let targetY = base.y;

      // Taşıyıcıya uzaklık (live.x zaten mirror uygulanmış)
      const px = p.live.x;
      const py = p.live.y;
      const ballX = ball.x;
      const ballY = ball.y;
      const distToBall = Math.hypot(px - ballX, py - ballY);

      // === TAKIM YÖNÜ ===
      // home soldan sağa, away sağdan sola hücum eder
      const teamForward = teamSide === 'home' ? 1 : -1;

      // === FORMASYON GEÇİŞİ: top kendi yarısındaysa takım kompakt geri çekilir ===
      if (!isMyBall && ballInOwnHalf && p.position !== 'GK') {
        // Savunma yardımı: tüm hat geri, kompakt
        const compactShift = p.position === 'DF' ? -3
                           : p.position === 'OS' ? -5
                           : p.position === 'FV' ? -8
                           : 0;
        targetX = base.x + teamForward * compactShift * (1 - teamCompactness);
      }

      if (p.position === 'GK') {
        // Kaleci: top ceza sahasına yaklaşırsa öne çıkar (kendi kalesine doğru yön)
        const ownGoalX = teamSide === 'home' ? 0 : 100;
        const distToOwnGoal = Math.abs(px - ownGoalX);
        if (isMyBall) {
          targetX = base.x;
        } else if (distToOwnGoal < 25) {
          targetX = base.x + teamForward * 2;
        } else {
          targetX = base.x;
        }
        targetY = base.y + (ballY - 35) * 0.5;
      } else if (p.position === 'DF') {
        // === ZONE DEFENSE ===
        // Her DF kendi sorumluluk bölgesinde kalır. Topa tam olarak kovalamaz,
        // "kale ile top arasında" cover pozisyonu alır. Y-shift sınırlı.
        const ownGoalX = teamSide === 'home' ? 0 : 100;
        // Sorumluluk bölgesi: DF'nin base.y'sinden max 6m sapma
        const yShiftMax = 6;
        // Topun kendi kalesine uzaklığı (tehdit seviyesi)
        const ballDistToOwnGoal = Math.abs(ballX - ownGoalX);
        const threat = Math.max(0, 1 - ballDistToOwnGoal / 50);

        if (isMyBall) {
          // Hücumdayız: savunma hattını koru, sadece hafif öne çık
          targetX = base.x + teamForward * 3;
          // Y: topun tarafına hafif kay (max 6m), DF bölgesini koruyarak
          const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.20));
          targetY = base.y + yShift;
        } else {
          // Savunuyoruz — threat seviyesine göre
          if (distToBall < 8) {
            // Çok yakın: topa pres (sadece 1 DF çıkar, diğerleri pozisyonda kalır)
            targetX = ballX + teamForward * -1;
            targetY = ballY;
          } else if (distToBall < 18) {
            // Orta: cover pozisyon — kale ile top arasında
            const coverX = (ownGoalX + ballX) / 2;
            targetX = Math.max(coverX - 2, base.x + teamForward * -2);
            // Y: topun tarafına ama max 6m (zone korunarak)
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.4));
            targetY = base.y + yShift;
          } else {
            // Uzak: formasyon pozisyonunda kal, zone'u koru
            // Tehdit yüksekse biraz geri çekil
            targetX = base.x + teamForward * (-2 * (0.5 + threat * 0.5));
            // Y: çok az kay (sadece tehlike varsa), max 4m
            const yShift = Math.max(-4, Math.min(4, (ballY - base.y) * 0.10 * (0.5 + threat)));
            targetY = base.y + yShift;
          }
        }
      } else if (p.position === 'OS') {
        // OS: hem orta saha hem savunma yardımı. Y-shift sınırlı (8m)
        const yShiftMax = 8;
        if (isMyBall) {
          if (distToBall < 10) {
            targetX = ballX + teamForward * 2;
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.3));
            targetY = base.y + yShift;
          } else if (distToBall < 25) {
            targetX = base.x + teamForward * 5;
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.3));
            targetY = base.y + yShift;
          } else {
            targetX = base.x + teamForward * 4;
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.2));
            targetY = base.y + yShift;
          }
        } else {
          if (distToBall < 8) {
            targetX = ballX + teamForward * -1;
            targetY = ballY;
          } else if (distToBall < 18) {
            targetX = Math.max(base.x + teamForward * -2, ballX + teamForward * -2);
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.5));
            targetY = base.y + yShift;
          } else {
            targetX = base.x + teamForward * -2;
            const yShift = Math.max(-yShiftMax, Math.min(yShiftMax, (ballY - base.y) * 0.2));
            targetY = base.y + yShift;
          }
        }
      } else if (p.position === 'FV') {
        if (isMyBall) {
          if (distToBall < 12) {
            // Çok yakın: gol pozisyonu, kaleye yönel
            targetX = Math.min(95, Math.max(5, ballX + teamForward * 6));
            targetY = base.y + (ballY - base.y) * 0.5;
          } else if (distToBall < 25) {
            // Orta: topa koş
            targetX = base.x + teamForward * 8;
            targetY = base.y + (ballY - base.y) * 0.5;
          } else {
            // Uzak: öne koş, gol için pozisyon al
            targetX = base.x + teamForward * 10;
            targetY = base.y;
          }
        } else {
          if (distToBall < 10) {
            targetX = ballX + teamForward * -1;
            targetY = ballY;
          } else if (distToBall < 22) {
            targetX = Math.max(base.x + teamForward * -4, ballX + teamForward * -2);
            targetY = base.y + (ballY - base.y) * 0.5;
          } else {
            // Uzak: geri dönme, formasyonun en önünde kal (savunma yardımına değil,
            // kontra atak için hazır ol)
            targetX = base.x + teamForward * -3;
            targetY = base.y;
          }
        }
      }

      // === FAZ-AWARE HEDEF OFFSET (organize hücum için) ===
      const phase = match.phase?.[teamSide] || (isMyBall ? 'attacking' : 'defending');
      if (phase === 'counter' && isMyBall) {
        // Kontra hücum: hücum oyuncuları 8-12m daha ileri, savunma geride kalır
        if (p.position === 'FV' || p.position === 'OS') {
          targetX += teamForward * 8;
        }
      } else if (phase === 'building' && isMyBall) {
        // Build-up: kaleci/DF organize çıkış, 3-4m öne, hücum yüksek
        if (p.position === 'DF') targetX += teamForward * 3;
        if (p.position === 'GK') targetX += teamForward * 2;
        if (p.position === 'FV') targetX += teamForward * 4; // forvet yüksekte bekler
      }

      // === HAREKET (sprint hızları yükseltildi) ===
  let speedBase = p.position === 'GK' ? 0.8
                : p.position === 'DF' ? 1.4
                : p.position === 'OS' ? 1.7
                : 2.1; // FV en hızlı

  // Faz'a göre hız ayarı
  if (phase === 'counter' && (p.position === 'FV' || p.position === 'OS')) {
    speedBase *= 1.6; // kontra hücumda tam sprint
  } else if (phase === 'building' && p.position === 'GK') {
    speedBase *= 0.7;
  }
  // Top bizdeyse ve oyuncu hücum oyuncusuysa → top almaya sprint
  if (isMyBall && (p.position === 'FV' || p.position === 'OS') && distToBall > 15) {
    speedBase *= 1.3;
  }
  // Top rakipteyse ve oyuncu orta saha/savunma → pres sprint
  if (!isMyBall && distToBall < 20 && (p.position === 'OS' || p.position === 'DF')) {
    speedBase *= 1.4;
  }
  // Top kendi yarısında ve oyuncu uzak → geri dönme acil
  if (ballInOwnHalf && !isMyBall && (p.position === 'FV' || p.position === 'OS')) {
    const ownGoalX = teamSide === 'home' ? 0 : 100;
    const distToOwnGoal = Math.abs(px - ownGoalX);
    if (distToOwnGoal > 30) speedBase *= 1.5; // geri dön sprint
  }

  const urgency = distToBall < 8 ? 2.8
                : distToBall < 15 ? 2.2
                : distToBall < 25 ? 1.6
                : distToBall < 40 ? 1.1
                : 0.8;
  const staminaFactor = (p.live.currentStamina || 100) < 30 ? 0.5 : 1.0;
  const speed = speedBase * urgency * staminaFactor;

      // Sahadan taşmayı engelle (x: 0-100, y: 0-70)
      targetX = Math.max(2, Math.min(98, targetX));
      targetY = Math.max(2, Math.min(68, targetY));

      const dx = targetX - p.live.x;
      const dy = targetY - p.live.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.3) {
        const step = Math.min(speed, dist);
        p.live.x += (dx / dist) * step;
        p.live.y += (dy / dist) * step;
      } else {
        p.live.x = targetX;
        p.live.y = targetY;
      }
    }
  }
}

function basePositionOf(player) {
  // Öncelik: oyuncunun kendi atanmış slot'u
  if (player.formationPos) return { x: player.formationPos.x, y: player.formationPos.y };
  // Fallback: pozisyona göre ilk slot (eski davranış, deployLineup sonrası gereksiz)
  const slots = getFormationPositions('442');
  const slot = slots.find(s => s.role === player.position);
  if (!slot) return null;
  return { x: slot.x, y: slot.y };
}

/**
 * Set-piece / out-of-play sonrası tüm oyuncuları kendi formasyon pozisyonlarına
 * snap'le. Set-piece'ler (taç, kale vuruşu, korner) oyunun "duruş" anıdır —
 * oyuncular yeni pozisyon alır.
 */
export function resetToFormation(match) {
  for (const side of ['home', 'away']) {
    for (const p of match[side].players) {
      if (p.onField && p.formationPos) {
        p.live.x = p.formationPos.x;
        p.live.y = p.formationPos.y;
      }
    }
  }
}
