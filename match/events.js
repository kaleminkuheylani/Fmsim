// match/events.js
// Olay üretimi. Her olay net bir sonuç döner, state'e eklenir.
// Tek giriş noktası: resolveAction(match, player, action, target) → EventResult

import { getEffective, duel, skillCheck } from './calc.js';
import { inHomeBox, inAwayBox, inAnyBox, threatOf, PITCH } from './state.js';

/**
 * Ana aksiyon çözümleyici.
 *   match: state
 *   carrier: top taşıyan oyuncu
 *   action: 'passShort' | 'passLong' | 'cross' | 'shoot' | 'dribble' | 'hold' | 'recycle'
 *   target: pas hedefi (yoksa null)
 *
 * Dönüş: {
 *   ok: bool,
 *   events: [{ type, ... }],
 *   newBall: { x, y },
 *   newCarrier: { side, playerId } | null,
 *   side: 'home' | 'away' (top kiminle kaldı)
 * }
 */
export function resolveAction(match, carrier, action, target) {
  const side = match.ballSide;
  const ball = { ...match.ballPos };

  switch (action) {
    case 'passShort':  return resolvePass(match, carrier, 'short', target);
    case 'passLong':   return resolvePass(match, carrier, 'long', target);
    case 'cross':      return resolveCross(match, carrier);
    case 'shoot':      return resolveShoot(match, carrier);
    case 'dribble':    return resolveDribble(match, carrier);
    case 'hold':       return resolveHold(match, carrier);
    case 'recycle':    return resolveRecycle(match, carrier);
    default: return { ok: false, events: [], newBall: ball, newCarrier: { side, playerId: carrier.id } };
  }
}

// === PAS ===
function resolvePass(match, carrier, type, target) {
  const side = match.ballSide;
  if (!target) return fail(match, 'pasHedefiYok');

  const targetPlayer = findPlayer(match, target.side, target.playerId);
  if (!targetPlayer) return fail(match, 'pasHedefiYok');

  // Pas zorluğu: mesafe + rakip baskısı (daha düşük — gerçekçi futbolda pas isabeti yüksek)
  const distance = target.distance;
  let difficulty = 35;
  if (type === 'short') {
    difficulty = 28 + distance * 0.4;
  } else {
    difficulty = 40 + distance * 0.6;
  }
  // Rakip oyuncular araya girebilir (daha az etki)
  const opp = side === 'home' ? match.away : match.home;
  const interceptors = opp.players.filter(p =>
    p.onField && p.position !== 'GK' &&
    Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) < 14
  );
  difficulty += interceptors.length * 2;

  // Asinalık bonusu: yüksek uyum → pas isabeti artar (difficulty azalır)
  const affinityBonus = getAffinityBonus(carrier, targetPlayer);
  if (affinityBonus > 0) difficulty -= affinityBonus;

  // Pas yetenek kontrolü
  const passCheck = skillCheck(carrier, type === 'long' ? 'passing' : 'passing', difficulty, {
    action: type === 'long' ? 'longPass' : 'passShort',
    inBox: inAnyBox(match.ballPos.x, match.ballPos.y),
  });

  // Araya girme şansı (her interceptor için)
  if (!passCheck.success) {
    // En yakın interceptor topu kesebilir
    const closest = interceptors.sort((a, b) =>
      Math.hypot(a.live.x - match.ballPos.x, a.live.y - match.ballPos.y) -
      Math.hypot(b.live.x - match.ballPos.x, b.live.y - match.ballPos.y)
    )[0];
    if (closest) {
      const interceptCheck = skillCheck(closest, 'interception', 60, { action: 'interception' });
      if (interceptCheck.success) {
        return intercept(match, carrier, closest, 'pas_kesildi');
      }
    }
    // Araya giremezse pas auta gider → top karşı takıma
    return outOfPlay(match, 'pas_oturmadi', 'away', { actor: carrier.id });
  }

  // Başarılı pas
  const events = [{
    minute: match.minute,
    type: 'pass_success',
    side,
    actor: carrier.id,
    target: targetPlayer.id,
    distance,
    x: match.ballPos.x,
    y: match.ballPos.y,
    text: `${match.minute}' ${carrier.name} → ${targetPlayer.name} (${Math.round(distance)}m)`,
  }];

  // === ASİNALIK: pas atan-alıcı arası +0.5 (hafif) ===
  bumpAffinity(carrier, targetPlayer, 0.5);

  // Topu hedefe taşı (ilerleme bonusu)
  const dirSign = side === 'home' ? 1 : -1;
  const progressBoost = type === 'long' ? 5 : 2.5;
  const newBall = {
    x: Math.max(0, Math.min(100, targetPlayer.live.x + dirSign * progressBoost)),
    y: targetPlayer.live.y,
  };
  carrier.live.extraEffort = 0.05; // pas eforu

  // İstatistik
  match.stats.passesAttempted[side]++;
  match.stats.passesCompleted[side]++;
  carrier.live.passesAttempted++;
  carrier.live.passesCompleted++;
  targetPlayer.live.passesAttempted++;

  return {
    ok: true,
    events,
    newBall,
    newCarrier: { side, playerId: targetPlayer.id },
  };
}

// === ORTA ===
function resolveCross(match, carrier) {
  const side = match.ballSide;
  const inBox = side === 'home' ? inHomeBox(match.ballPos.x, match.ballPos.y) : inAwayBox(match.ballPos.x, match.ballPos.y);
  if (inBox) {
    // Ceza sahası içinden orta olmaz, şut çevir
    return resolveShoot(match, carrier);
  }

  const crossCheck = skillCheck(carrier, 'crossing', 40, { action: 'crossing', inBox: false });
  if (!crossCheck.success) {
    // Orta başarısız → kaleci veya savunma alır
    return outOfPlay(match, 'orta_kisa', 'away', { actor: carrier.id });
  }

  // Hedef: ceza sahası içindeki FV veya OS (herhangi biri)
  const atk = match[side];
  const targets = atk.players.filter(p =>
    p.onField && (p.position === 'FV' || p.position === 'OS') &&
    (side === 'home' ? inHomeBox(p.live.x, p.live.y) : inAwayBox(p.live.x, p.live.y))
  );
  if (!targets.length) {
    // Hedef yoksa: bazen orta at, bazen pas tercih et (mekanik olmasın)
    if (Math.random() < 0.5) {
      const fallback = atk.players
        .filter(p => p.onField && (p.position === 'FV' || p.position === 'OS'))
        .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (fallback) {
        return {
          ok: true,
          events: [{
            minute: match.minute,
            type: 'cross_success',
            side,
            actor: carrier.id,
            target: fallback.p.id,
            text: `${match.minute}' ${carrier.name} ortasını ${fallback.p.name}'e gönderdi.`,
          }],
          newBall: { x: fallback.p.live.x, y: fallback.p.live.y },
          newCarrier: { side, playerId: fallback.p.id },
        };
      }
    }
    return outOfPlay(match, 'orta_alici_yok', 'away');
  }

  const target = targets.sort((a, b) => getEffective(b, 'heading') - getEffective(a, 'heading'))[0];
  const newBall = { x: target.live.x, y: target.live.y };

  // Defans oyuncusuyla mücadele
  const opp = side === 'home' ? match.away : match.home;
  const defenders = opp.players.filter(p => p.onField && p.position === 'DF' &&
    Math.hypot(p.live.x - newBall.x, p.live.y - newBall.y) < 10);
  if (defenders.length) {
    const def = defenders[0];
    const aerialDuel = duel(target, def, 'aerial', { action: 'aerial', inBox: true });
    if (aerialDuel.winner === 'b') {
      return intercept(match, target, def, 'kafa_mudahale');
    }
  }

  return {
    ok: true,
    events: [{
      minute: match.minute,
      type: 'cross_success',
      side,
      actor: carrier.id,
      target: target.id,
      text: `${match.minute}' ${carrier.name} ortasını ${target.name}'e gönderdi.`,
    }],
    newBall,
    newCarrier: { side, playerId: target.id },
  };
}

// === xG (Expected Goals) HESABI ===
// Gerçek maç verilerine dayalı: mesafe + açı + şut tipi
// Kaynak: StatsBomb, Opta, Understat (2020-2024 lig ortalamaları)
function calcXG(distance, angle, shotType) {
  // Mesafe bazlı temel xG (gerçek veriye yakın)
  let xG;
  if (distance < 6)        xG = 0.50;  // altıpas — net pozisyon
  else if (distance < 11)  xG = 0.30;  // ceza sahası içi
  else if (distance < 16.5)xG = 0.15;  // ceza sahası kenarı
  else if (distance < 22)  xG = 0.07;  // ceza sahası dışı yakın
  else if (distance < 30)  xG = 0.03;  // orta saha
  else                     xG = 0.01;  // uzak (neredeyse imkansız)

  // Açı ayarı (dar açı = kötü şut pozisyonu)
  if (angle < 30 || angle > 150) xG *= 0.3;   // çok dar
  else if (angle < 45 || angle > 135) xG *= 0.6; // dar

  // Şut tipi
  if (shotType === 'header') xG *= 0.70;
  if (shotType === 'volley') xG *= 1.15;
  if (shotType === 'long')   xG *= 0.80;

  return xG;
}

// === ŞUT ===
function resolveShoot(match, carrier) {
  const side = match.ballSide;
  const inBox = side === 'home' ? inHomeBox(match.ballPos.x, match.ballPos.y) : inAwayBox(match.ballPos.x, match.ballPos.y);
  const goalX = side === 'home' ? PITCH.homeGoal.x : PITCH.awayGoal.x;
  const goalY = side === 'home' ? PITCH.homeGoal.y : PITCH.awayGoal.y;
  const distanceToGoal = Math.hypot(match.ballPos.x - goalX, match.ballPos.y - goalY);

  // Şut açısı (0-180°): top-kale hattının kale düzlemine göre açısı
  // 90° = kale tam karşı, 0°/180° = paralel kale
  const angle = Math.abs(Math.atan2(goalY - match.ballPos.y, goalX - match.ballPos.x) * 180 / Math.PI);

  // Şut tipi
  const shotType = inBox ? 'normal' : (distanceToGoal > 22 ? 'long' : 'normal');

  // === xG HESABI ===
  let xG = calcXG(distanceToGoal, angle, shotType);

  // Bitirici kalitesi xG'yi artırır/azaltır (0.3x - 1.5x)
  const finishing = carrier.attrs?.finishing || 50;
  const composure = carrier.attrs?.composure || 50;
  const shotPower = finishing * 0.6 + composure * 0.4;
  const qualityMult = 0.3 + (shotPower / 100) * 1.2;
  const effectiveXG = Math.min(0.95, xG * qualityMult);

  // === İSABET KONTROLÜ ===
  // Etkili xG 0.20+ ise kale yönünde (%80 isabet), düşükse auta meyilli
  const onTargetChance = 0.40 + effectiveXG * 0.50; // 0.50 - 0.97
  if (Math.random() > onTargetChance) {
    carrier.live.shots++;
    match.stats.shots[side]++;
    return outOfPlay(match, 'sut_isabetsiz', 'away', { actor: carrier.id, xG: effectiveXG });
  }

  // === İSABETLİ ŞUT — KALECİ KARŞISINDA ===
  const opp = side === 'home' ? match.away : match.home;
  const keeper = opp.players.find(p => p.position === 'GK' && p.onField);
  if (!keeper) return fail(match, 'kaleciYok');

  // Kaleci kurtarış kalitesi
  const reflexes = keeper.attrs?.reflexes || 50;
  const positioning = keeper.attrs?.positioning || 50;
  const saveQuality = reflexes * 0.6 + positioning * 0.4;
  // 50 yetenek = 1.0x, 100 yetenek = 0.5x
  const saveMult = 1.5 - (saveQuality / 100) * 1.0;
  const saveAdjustedXG = Math.max(0.01, effectiveXG * saveMult);

  // SONUÇ: GOL MÜ, KURTARIŞ MI?
  const isGoal = Math.random() < saveAdjustedXG;

  carrier.live.shots++;
  match.stats.shots[side]++;

  if (isGoal) {
    // GOL!
    if (side === 'home') match.homeScore++;
    else match.awayScore++;
    carrier.live.goals++;
    match.stats.shotsOnTarget[side]++;
    carrier.live.shotsOnTarget++;
    keeper.live.conceded = (keeper.live.conceded || 0) + 1;
    // Motivation engine'i bilgilendir
    if (match.motivation) match.motivation.onGoal(side);

    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: 'goal',
        side,
        scorer: carrier.id,
        assist: match.ballCarrier && match.ballCarrier.playerId !== carrier.id ? match.ballCarrier.playerId : null,
        x: match.ballPos.x,
        y: match.ballPos.y,
        xG: saveAdjustedXG,
        text: `⚽ ${match.minute}' GOOL! ${carrier.name} (${match[side].name})!`,
      }],
      newBall: { x: 50, y: 35 },
      newCarrier: null, // gol sonrası orta sahaya
    };
  }

  // Kaleci kurtardı
  keeper.live.saves++;
  match.stats.shotsOnTarget[side]++;
  carrier.live.shotsOnTarget++;

  // Korner mi, gol mü? distanceToGoal'a göre
  if (inBox) {
    return corner(match, side);
  } else {
    return outOfPlay(match, 'kaleciKurtardi', 'away', { actor: carrier.id, side });
  }
}

// === DRIPLING ===
function resolveDribble(match, carrier) {
  const side = match.ballSide;
  const opp = side === 'home' ? match.away : match.home;

  // En yakın rakip
  const nearest = opp.players
    .filter(p => p.onField && p.position !== 'GK')
    .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
    .sort((a, b) => a.d - b.d)[0];

  if (!nearest || nearest.d > 10) {
    // Kimse yakın değil — serbest ilerle
    // inwardY sadece sınıra yakınsa (y < 10 veya y > 60) — kaskad önleme
    // orta sahada top kanatta kalsın (cross olabilsin)
    let inwardY = 0;
    if (match.ballPos.y < 10) inwardY = 6;
    else if (match.ballPos.y > 60) inwardY = -6;
    const dirX = side === 'home' ? 15 : -15;
    const newBall = {
      x: Math.max(0, Math.min(100, match.ballPos.x + dirX)),
      y: Math.max(8, Math.min(62, match.ballPos.y + inwardY + (Math.random() - 0.5) * 2)),
    };
    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: 'dribble_success',
        side,
        actor: carrier.id,
        text: `${match.minute}' ${carrier.name} boş alanda sürüyor.`,
      }],
      newBall,
      newCarrier: { side, playerId: carrier.id },
    };
  }

  const d = duel(carrier, nearest.p, 'dribbling', { action: 'dribble' });
  if (d.winner === 'a') {
    const dirX = side === 'home' ? 8 : -8;
    // Geçilen oyuncudan uzak, içeri doğru
    const passY = nearest.p.live.y + (side === 'home' ? -4 : 4);
    const newBall = {
      x: Math.max(0, Math.min(100, match.ballPos.x + dirX)),
      y: Math.max(10, Math.min(60, passY + (Math.random() - 0.5) * 4)),
    };
    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: 'dribble_success',
        side,
        actor: carrier.id,
        text: `${match.minute}' ${carrier.name}, ${nearest.p.name}'i geçti!`,
      }],
      newBall,
      newCarrier: { side, playerId: carrier.id },
    };
  }

  // Top kaybedildi — dağılım:
  //  - %20 takım geri kazanır (top carrier'ın arkadaşına düşer)
  //  - %5 taça çıkar (outOfPlay)
  //  - %75 turnover (rakibe geçer)
  const r = Math.random();
  if (r < 0.20) {
    // Takım geri kazanır — en yakın arkadaşa pas
    const team = match[side];
    const tm = team.players
      .filter(p => p.onField && p.id !== carrier.id)
      .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (tm) {
      const newBall = { x: tm.p.live.x, y: tm.p.live.y };
      return {
        ok: true,
        events: [{
          minute: match.minute,
          type: 'dribble_recovered',
          side,
          actor: carrier.id,
          target: tm.p.id,
          text: `${match.minute}' ${carrier.name} top kaybetti ama ${tm.p.name} kurtardı.`,
        }],
        newBall,
        newCarrier: { side, playerId: tm.p.id },
      };
    }
  }
  if (r < 0.25) {
    // Taç
    match.ballPos.y = match.ballPos.y < 35 ? 3 : 67;
    return outOfPlay(match, 'dripling_kayip', 'away', { actor: carrier.id, target: nearest.p.id });
  }
  return turnover(match, carrier, nearest.p, 'dripling_kayip');
}

// === TOP TUT / GERİ PAS ===
function resolveHold(match, carrier) {
  return {
    ok: true,
    events: [],
    newBall: { ...match.ballPos },
    newCarrier: { side: match.ballSide, playerId: carrier.id },
  };
}

function resolveRecycle(match, carrier) {
  // Geri pas
  const team = match[match.ballSide];
  const defenders = team.players.filter(p => p.onField && (p.position === 'DF' || p.position === 'GK'))
    .map(p => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) }))
    .sort((a, b) => a.d - b.d);
  if (!defenders.length) return resolveHold(match, carrier);
  return resolvePass(match, carrier, 'short', { side: match.ballSide, playerId: defenders[0].p.id, distance: defenders[0].d });
}

// === ORTAK YARDIMCILAR ===
function intercept(match, loser, winner, reason) {
  const newSide = match.ballSide === 'home' ? 'away' : 'home';
  match.ballSide = newSide;
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: 'turnover',
      side: newSide,
      actor: winner.id,
      text: `${match.minute}' ${winner.name} topu kazandı! (${reason})`,
    }],
    newBall: { x: winner.live.x, y: winner.live.y },
    newCarrier: { side: newSide, playerId: winner.id },
  };
}

function turnover(match, loser, winner, reason) {
  const newSide = match.ballSide === 'home' ? 'away' : 'home';
  match.ballSide = newSide;
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: 'turnover',
      side: newSide,
      actor: winner.id,
      loser: loser.id,
      text: `${match.minute}' ${loser.name} topu kaybetti, ${winner.name} aldı!`,
    }],
    newBall: { x: winner.live.x, y: winner.live.y },
    newCarrier: { side: newSide, playerId: winner.id },
  };
}

function corner(match, attackingSide) {
  const defendingSide = attackingSide === 'home' ? 'away' : 'home';
  match.stats.corners[attackingSide]++;
  const cornerX = attackingSide === 'home' ? 95 : 5;
  const cornerY = match.ballPos.y > 35 ? 65 : 5;
  match.ballSide = defendingSide; // top kaleciye
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: 'corner',
      side: attackingSide,
      text: `${match.minute}' Korner! ${match[attackingSide].name}`,
    }],
    newBall: { x: cornerX, y: cornerY },
    newCarrier: null, // orta için bekleniyor
  };
}

function outOfPlay(match, reason, newSide, extra = {}) {
  const ballY = match.ballPos.y;
  const ballX = match.ballPos.x;

  // Eğer top saha içindeyse, önce yan çizgiye kaydır ki set-piece tetiklensin.
  // Gerçek futbolda her out bir taç/korner/kale vuruşudur — top saha içinde
  // "out" olmaz, otomatik olarak orta sahaya dönmez.
  if (ballY > 8 && ballY < 62 && ballX > 3 && ballX < 97) {
    // Topu yan çizgiye doğru kaydır
    match.ballPos.y = ballY < 35 ? 4 : 66;
  }

  // Top nereye gitti?
  // - Yan çizgi (y < 8 veya y > 62): TAÇ (rakip takım atar)
  // - Kale çizgisi (x < 3 veya x > 97): KALE VURUŞU (kaleci alır)
  // - Geri kalan: genel out (orta saha, kaleci tutuşu vs.)
  const isTouchline = match.ballPos.y < 8 || match.ballPos.y > 62;
  const isGoalLine = match.ballPos.x < 3 || match.ballPos.x > 97;

  let eventType, eventText, newBall, newCarrier;

  // SIRA ÖNEMLİ: önce kale çizgisi (köşe + kale vuruşu), sonra taç, sonra genel.
  // (Eski sırada isTouchline önce geliyordu → kale direği yakınından çıkan top
  //  throw_in oluyordu, corner'a hiç ulaşılmıyordu.)
  if (isGoalLine) {
    // === KORNER mi KALE VURUŞU mu? ===
    // ballY orta (20-50) → kale vuruşu
    const isCornerZone = ballY < 20 || ballY > 50;
    if (isCornerZone) {
      // === KORNER ===
      // newSide = korneri kullanacak takım (hücum eden — topu çıkaran oyuncunun rakibi)
      // Top yan çizgiye yakın + kale çizgisi yakınında
      const cornerY = ballY < 35 ? 4 : 66;
      const cornerX = ballX < 50 ? 2 : 98;
      const team = match[newSide];
      const nearest = team.players
        .filter(p => p.onField)
        .map(p => ({ p, d: Math.hypot(p.live.x - cornerX, p.live.y - cornerY) }))
        .sort((a, b) => a.d - b.d)[0];
      newBall = { x: cornerX, y: cornerY };
      newCarrier = nearest ? { side: newSide, playerId: nearest.p.id } : null;
      eventType = 'corner';
      eventText = `${match.minute}' Korner — ${match[newSide].name}`;
    } else {
      // === KALE VURUŞU ===
      // newSide = kale vuruşunu kullanacak takım (savunan)
      const gkX = newSide === 'home' ? 8 : 92;
      const gk = match[newSide].players.find(p => p.onField && p.position === 'GK');
      newBall = { x: gkX, y: 35 };
      newCarrier = gk ? { side: newSide, playerId: gk.id } : null;
      eventType = 'goal_kick';
      eventText = `${match.minute}' Kale vuruşu — ${match[newSide].name}`;
    }
  } else {
    // === GENEL OUT (kaleci tutuşu, orta alan) ===
    newBall = { x: 50, y: 35 };
    newCarrier = null;
    eventType = 'out_of_play';
    eventText = extra.text || `${match.minute}' ${reason}`;
  }

  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: eventType,
      reason,
      side: match.ballSide,
      actor: extra.actor,
      target: extra.target,
      x: match.ballPos.x,
      y: match.ballPos.y,
      text: eventText,
    }],
    newBall,
    newCarrier,
  };
}

function fail(match, reason) {
  return { ok: false, events: [{ minute: match.minute, type: 'fail', reason, text: reason }], newBall: { ...match.ballPos }, newCarrier: null };
}

function findPlayer(match, side, playerId) {
  return match[side]?.players?.find(p => p.id === playerId) || null;
}

// === ASİNALIK (HAFİF) ===
// İki oyuncu arasındaki uyum. Sadece pas başarılı olunca artar.
// Sadece ilk 11 sayılır (sahadaki oyuncular). Storage-friendly.
function bumpAffinity(a, b, amount) {
  if (!a || !b || a.id === b.id) return;
  a.affinity = a.affinity || {};
  b.affinity = b.affinity || {};
  // 5 altı gürültü, saklama
  const av = Math.min(100, (a.affinity[b.id] || 0) + amount);
  const bv = Math.min(100, (b.affinity[a.id] || 0) + amount);
  if (av > 5) a.affinity[b.id] = av; else delete a.affinity[b.id];
  if (bv > 5) b.affinity[a.id] = bv; else delete b.affinity[a.id];
}

// Pas isabeti bonusu (decision.js'den çağrılacak)
export function getAffinityBonus(passer, receiver) {
  if (!passer || !receiver || !passer.affinity) return 0;
  const v = passer.affinity[receiver.id] || 0;
  // 0 → 0, 50 → +5, 100 → +10
  return Math.floor(v * 0.1);
}
