// match/simulate.js
// Ana simülasyon döngüsü. Her dakika 1-3 aksiyon çözünürlür, olaylar state'e eklenir.

import { deployLineup, updatePositions } from './positions.js';
import { tickStamina } from './calc.js';
import { decisionWeights, pickAction, pickPassTarget } from './decision.js';
import { resolveAction } from './events.js';
import { findPlayer } from './state.js';
import { createNarrator } from './narrator.js';
import { createMotivation } from './motivation.js';
import { createSubstitution } from './substitution.js';

const MAX_ACTIONS_PER_MINUTE = 6;

/**
 * Maçı başlat: oyuncuları diz, top orta sahaya.
 */
export function startMatch(match) {
  deployLineup(match.home, match.formation.home, false);
  deployLineup(match.away, match.formation.away, true);
  match.ballPos = { x: 50, y: 35 };
  match.ballSide = Math.random() < 0.5 ? 'home' : 'away';
  // Başlangıç carrier = en yakın oyuncu
  const side = match.ballSide;
  const team = match[side];
  const closest = team.players
    .filter(p => p.onField)
    .map(p => ({ p, d: Math.hypot(p.live.x - 50, p.live.y - 35) }))
    .sort((a, b) => a.d - b.d)[0];
  if (closest) match.ballCarrier = { side, playerId: closest.p.id };
  // Narrative spiker başlat
  if (!match.narrator) match.narrator = createNarrator(match);
  // Motivation engine başlat
  if (!match.motivation) match.motivation = createMotivation(match);
  // Substitution engine başlat (mode parametresiyle)
  if (!match.substitution) {
    const options = {
      autoSubs: match.mode !== 'manager',
      onInjury: match.onInjury || null,
    };
    match.substitution = createSubstitution(match, options);
  }
  match.events.push({
    minute: 0,
    type: 'kickoff',
    text: `⚽ Maç başladı: ${match.home.name} vs ${match.away.name}`,
  });
  // Açılış narratifi
  match.narrativeLog = match.narrativeLog || [];
  match.narrativeLog.push({
    minute: 0,
    type: 'kickoff',
    text: `🏟️ ${match.home.name} karşısında ${match.away.name}! Tribünler dolu, maç başladı.`,
  });
}

/**
 * Bir dakikayı simüle et.
 *  - 1-3 aksiyon çöz
 *  - Stamina güncelle
 *  - Pozisyonları güncelle
 *  - Olayları topla, state.events'e append et
 */
export function simulateMinute(match) {
  match.minute++;
  const actionsThisMinute = 1 + Math.floor(Math.random() * MAX_ACTIONS_PER_MINUTE);
  match.narrativeLog = match.narrativeLog || [];
  if (!match.narrator) match.narrator = createNarrator(match);

  for (let i = 0; i < actionsThisMinute; i++) {
    if (match.minute > 90) break;
    simulateAction(match);
  }

  // Stamina & pozisyon
  for (const side of ['home', 'away']) {
    for (const p of match[side].players) {
      if (p.onField) tickStamina(p, match.minute);
    }
  }
  updatePositions(match);

  // === MOTIVATION ENGINE ===
  // Her dakika: morale drift, sakatlık kontrolü, momentum güncelle
  if (!match.motivation) match.motivation = createMotivation(match);
  match.motivation.tick();
  // Motivation'dan gelen yeni event'leri narrativeLog'a ekle
  for (const ev of match.motivation.recentEvents) {
    if (ev.minute === match.minute) {
      match.narrativeLog.push({ minute: ev.minute, type: ev.type, text: ev.text });
    }
  }

  // === SUBSTITUTION ENGINE ===
  // Otomatik değişiklikler: sakatlık, yorgunluk, kart riski
  if (!match.substitution) match.substitution = createSubstitution(match);
  match.substitution.tick();
  // Yeni değişiklik eventlerini narrativeLog'a ekle
  for (const side of ['home', 'away']) {
    const hist = match.substitution.getSubHistory(side);
    for (const sub of hist) {
      if (sub.minute === match.minute) {
        const ev = {
          minute: sub.minute,
          type: 'substitution',
          side,
          text: `🔄 Değişiklik: ${sub.out.name} çıktı, ${sub.in.name} girdi (${sub.reason}).`,
        };
        match.narrativeLog.push(ev);
      }
    }
  }

  // === NARRATİVE FLUSH ===
  // Bu dakika boyunca birikmiş sekansı hikaye cümlesine çevir
  const seqText = match.narrator.flushSequence();
  if (seqText) {
    match.narrativeLog.push({
      minute: match.minute,
      type: 'sequence',
      text: seqText,
    });
  }

  // Possession güncelle (top kiminle?)
  match.tickCount++;
  // Bu dakikayı kimin topuyla geçtiğimizi say
  const ballTime = actionsThisMinute;
  if (match.ballSide === 'home') match.stats.possession.home += ballTime;
  else match.stats.possession.away += ballTime;

  // Momentum: top kontrolü yüzdesine göre
  const total = match.stats.possession.home + match.stats.possession.away;
  if (total > 0) match.momentum = match.stats.possession.home / total;
}

/**
 * Tek bir aksiyon (pas / şut / dripling / ...) çözümle.
 */
function simulateAction(match) {
  const side = match.ballSide;
  const carrier = findCarrier(match);
  if (!carrier) {
    // Top boşta → en yakın oyuncuya at
    passToClosest(match);
    return;
  }

  // Karar ver
  const action = pickAction(carrier, match);

  // Hedef bul (pas ise)
  let target = null;
  if (action === 'passShort' || action === 'passLong') {
    target = pickPassTarget(carrier, match, action === 'passLong' ? 'long' : 'short');
  }

  // Aksiyonu çöz
  const result = resolveAction(match, carrier, action, target);

  // State'i güncelle
  if (result.newBall) match.ballPos = result.newBall;
  if (result.newCarrier) {
    match.ballCarrier = result.newCarrier;
  } else {
    match.ballCarrier = null;
  }
  if (result.events) {
    match.events.push(...result.events);
    const last = result.events[result.events.length - 1];
    if (last) {
      match.lastEvent = last;
      match.lastEventMinute = match.minute;
      match.lastEventType = last.type;
    }

    // === ANLIK NARRATİF (kritik olaylar) ===
    if (!match.narrator) match.narrator = createNarrator(match);
    match.narrativeLog = match.narrativeLog || [];
    // Tracker'ı güncelle
    match.narrator.tracker.push(result.events, match);
    // Anlık vurgu (gol, kart, korner, kritik şut)
    const instant = match.narrator.narrate(result.events);
    if (instant) {
      match.narrativeLog.push({
        minute: match.minute,
        type: 'instant',
        text: instant,
      });
    }
  }

  // Faul/kart olasılığı (her temasta %1)
  maybeFoul(match, carrier);
}

function findCarrier(match) {
  if (!match.ballCarrier) return null;
  return findPlayer(match, match.ballCarrier.side, match.ballCarrier.playerId);
}

function passToClosest(match) {
  const side = match.ballSide;
  const team = match[side];
  const closest = team.players
    .filter(p => p.onField)
    .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
    .sort((a, b) => a.d - b.d)[0];
  if (closest) {
    match.ballPos = { x: closest.p.live.x, y: closest.p.live.y };
    match.ballCarrier = { side, playerId: closest.p.id };
  }
}

/**
 * Faul ve kart olayı: ikili mücadelede %2-5 ihtimal.
 */
function maybeFoul(match, carrier) {
  if (Math.random() > 0.08) return;
  const side = match.ballSide;
  const opp = side === 'home' ? match.away : match.home;
  const defenders = opp.players
    .filter(p => p.onField && p.position !== 'GK')
    .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
    .filter(x => x.d < 35)
    .sort((a, b) => a.d - b.d);

  if (!defenders.length) return;
  const def = defenders[0].p;

  const foulAction = 'tackling';
  const foulCheck = skillCheck(def, foulAction, 65, { action: 'tackle' });
  if (foulCheck.success) {
    // Başarılı müdahale, top kazanıldı
    match.ballSide = side === 'home' ? 'away' : 'home';
    match.ballCarrier = { side: match.ballSide, playerId: def.id };
    match.ballPos = { x: def.live.x, y: def.live.y };
    const ev = {
      minute: match.minute,
      type: 'tackle_won',
      side: match.ballSide,
      actor: def.id,
      text: `${match.minute}' ${def.name} müdahale etti, topu kazandı!`,
    };
    match.events.push(ev);
    if (match.narrator) {
      match.narrator.tracker.push([ev], match);
      const t = match.narrator.narrate([ev]);
      if (t) {
        match.narrativeLog = match.narrativeLog || [];
        match.narrativeLog.push({ minute: match.minute, type: 'instant', text: t });
      }
    }
    return;
  }

  // Faul
  def.live.foulsCommitted++;
  match.stats.fouls[match.ballSide === 'home' ? 'away' : 'home']++;
  const foulEv = {
    minute: match.minute,
    type: 'foul',
    side: match.ballSide,
    actor: def.id,
    text: `${match.minute}' ${def.name} faul yaptı!`,
  };
  match.events.push(foulEv);

  // Kart (%25 sarı) — motivation engine üzerinden
  if (def.live.yellowCards >= 1 || Math.random() < 0.20) {
    const cardSide = match.ballSide === 'home' ? 'away' : 'home';
    // Motivation engine'e bildir (kırmızı kontrolü, morale etkisi burada)
    const cardResult = match.motivation
      ? match.motivation.giveCard(cardSide, def.id, 'yellow')
      : null;

    if (cardResult) {
      const cardEvent = cardResult.event;
      match.events.push(cardEvent);

      // Eğer ikinci sarıdan kırmızı olduysa motivation bunu 'red_card' event'i olarak döndü
      if (cardResult.kind === 'red_second_yellow') {
        def.live.yellowCards = 2;
        def.live.redCard = true;
        def.onField = false;
        match.stats.redCards[cardSide]++;
      } else {
        // Sadece ilk sarı
        def.live.yellowCards = (def.live.yellowCards || 0) + 1;
        match.stats.yellowCards[cardSide]++;
      }

      if (match.narrator) {
        match.narrator.tracker.push([cardEvent], match);
        const t = match.narrator.narrate([cardEvent]);
        if (t) {
          match.narrativeLog = match.narrativeLog || [];
          match.narrativeLog.push({ minute: match.minute, type: 'instant', text: t });
        }
      }

      // Direkt kırmızı kart (nadir): %1 ihtimal
      if (cardResult.kind === 'yellow' && Math.random() < 0.01) {
        const redResult = match.motivation.giveCard(cardSide, def.id, 'red');
        if (redResult) {
          match.events.push(redResult.event);
          def.live.redCard = true;
          def.onField = false;
          match.stats.redCards[cardSide]++;
          if (match.narrator) {
            match.narrator.tracker.push([redResult.event], match);
            const t = match.narrator.narrate([redResult.event]);
            if (t) {
              match.narrativeLog = match.narrativeLog || [];
              match.narrativeLog.push({ minute: match.minute, type: 'instant', text: t });
            }
          }
        }
      }
    }
  }
}

// skillCheck burada import (events.js'den de kullanılıyor ama burada da lazım)
import { skillCheck } from './calc.js';
