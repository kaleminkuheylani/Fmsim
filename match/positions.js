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

  for (const slot of slots) {
    const candidate = team.players
      .filter(p => p.position === slot.role && !used.has(p.id))
      .sort((a, b) => (b.attrs?.[primaryAttrForRole(slot.role)] ?? 0) - (a.attrs?.[primaryAttrForRole(slot.role)] ?? 0))[0];

    if (candidate) {
      used.add(candidate.id);
      candidate.onField = true;
      candidate.live.x = mirror ? 100 - slot.x : slot.x;
      candidate.live.y = slot.y;
      fielded.push(candidate);
    } else {
      // yedek oyuncuyu zorla çek (aşağı yukarı aynı rolden)
      const bench = team.players
        .filter(p => !used.has(p.id) && adjacentRole(slot.role).includes(p.position))
        .sort((a, b) => b.attrs?.[primaryAttrForRole(slot.role)] - a.attrs?.[primaryAttrForRole(slot.role)])[0];
      if (bench) {
        used.add(bench.id);
        bench.position = slot.role; // geçici rol değişimi
        bench.originalPosition = bench.originalPosition || bench.position;
        bench.onField = true;
        bench.live.x = mirror ? 100 - slot.x : slot.x;
        bench.live.y = slot.y;
        fielded.push(bench);
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
    const mirror = teamSide === 'away';
    const isMyBall = side === teamSide;
    for (const p of team.players) {
      if (!p.onField) continue;

      // Temel formasyon pozisyonu
      const base = basePositionOf(p, match.formation[teamSide], mirror);
      if (!base) continue;

      let targetX = base.x;
      let targetY = base.y;

      // === TOPA GÖRE KONUM ALMA ===
      // Taşıyıcıya uzaklık
      const px = mirror ? 100 - p.live.x : p.live.x;
      const py = p.live.y;
      const ballX = ball.x;
      const ballY = ball.y;
      const distToBall = Math.hypot(px - ballX, py - ballY);

      if (p.position === 'GK') {
        // Kaleci: top ceza sahasına yaklaşırsa öne çıkar
        targetX = isMyBall ? base.x + 2 : base.x - Math.max(0, 4 - distToBall / 10);
        // Top kanattan gelirse kaleci y kayar (daha agresif)
        targetY = 35 + (ballY - 35) * 0.5;
      } else if (p.position === 'DF') {
        if (isMyBall) {
          // Hücumdayız: hafif öne çık (bindirme)
          targetX = base.x + 5;
          // Top kanattaysa kanada kay
          if (distToBall < 25) targetY = base.y + (ballY - base.y) * 0.3;
        } else {
          // Savunuyoruz: top yakınsa araya girmeye çalış
          if (distToBall < 20) {
            // Topun biraz önüne geç
            targetX = Math.max(base.x - 3, ballX - 5);
            targetY = base.y + (ballY - base.y) * 0.5;
          } else {
            targetX = base.x - 3;
            targetY = base.y + (ballY - base.y) * 0.15;
          }
        }
      } else if (p.position === 'OS') {
        if (isMyBall) {
          // Hücum: pas opsiyonu oluştur, öne çık
          targetX = base.x + 4;
          // Top yakınsa topa desteğe gel
          if (distToBall < 20) {
            targetX = base.x + 6;
            targetY = base.y + (ballY - base.y) * 0.4;
          }
        } else {
          // Savunma: top yakınsa pres, değilse pozisyon al
          if (distToBall < 18) {
            targetX = Math.max(base.x - 2, ballX - 3);
            targetY = base.y + (ballY - base.y) * 0.6;
          } else {
            targetX = base.x - 2;
            targetY = base.y + (ballY - base.y) * 0.2;
          }
        }
      } else if (p.position === 'FV') {
        if (isMyBall) {
          // Forvet: hücum et, top yakınsa koş, değilse bekle
          if (distToBall < 25) {
            targetX = Math.min(95, ballX + 5);
            targetY = base.y + (ballY - base.y) * 0.5;
          } else {
            targetX = base.x + 8;
            targetY = base.y + (ballY - base.y) * 0.3;
          }
        } else {
          // Savunma: top yakınsa pres
          if (distToBall < 22) {
            targetX = Math.max(base.x - 4, ballX - 2);
            targetY = base.y + (ballY - base.y) * 0.5;
          } else {
            targetX = base.x - 4;
            targetY = base.y + (ballY - base.y) * 0.15;
          }
        }
      }

      // Yumuşak hareket (yorgunken yavaş)
      const lerp = p.live.currentStamina < 30 ? 0.08 : 0.30;
      p.live.x += (targetX - p.live.x) * lerp;
      p.live.y += (targetY - p.live.y) * lerp;
    }
  }
}

function basePositionOf(player, formationId, mirror) {
  const slots = getFormationPositions(formationId);
  // Oyuncunun pozisyonuna uygun slot
  const slot = slots.find(s => s.role === player.position);
  if (!slot) return null;
  return { x: mirror ? 100 - slot.x : slot.x, y: slot.y };
}
