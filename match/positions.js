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

  for (const teamSide of ['home', 'away']) {
    const team = match[teamSide];
    const mirror = teamSide === 'away';
    for (const p of team.players) {
      if (!p.onField) continue;

      // Temel formasyon pozisyonu
      const base = basePositionOf(p, match.formation[teamSide], mirror);
      if (!base) continue;

      let targetX = base.x;
      let targetY = base.y;

      // Top yanımızda → hücum yönüne kay
      // Top karşıda → savunmada kal
      const attacking = side === teamSide;
      const xDist = mirror ? ball.x - (100 - base.x) : ball.x - base.x;

      if (p.position === 'GK') {
        // Kaleci: top ceza sahasına yaklaşırsa öne çıkar
        if (attacking) targetX += 2;
        else targetX += Math.max(0, 4 - Math.abs(xDist) / 10);
        // Top kanattan gelirse kaleci y kayar
        if (mirror) targetY = 35 + (ball.y - 35) * 0.2;
        else targetY = 35 + (ball.y - 35) * 0.2;
      } else if (p.position === 'DF') {
        if (attacking) targetX += 5;
        else targetX -= 3;
      } else if (p.position === 'OS') {
        if (attacking) targetX += 4;
        else targetX -= 2;
      } else if (p.position === 'FV') {
        if (attacking) targetX += 8;
        else targetX -= 4;
        // Top ceza sahasına yakınsa FV kutuda durur
        if (side === teamSide && match.ballPos.x > 70) targetX = mirror ? 92 : 92;
      }

      // Yumuşak hareket
      const lerp = p.live.currentStamina < 30 ? 0.05 : 0.20;
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
