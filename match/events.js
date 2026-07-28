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

  // Pas zorluğu: mesafe + rakip baskısı
  const distance = target.distance;
  let difficulty = 50;
  if (type === 'short') {
    difficulty = 40 + distance * 0.5;
  } else {
    difficulty = 55 + distance * 0.8;
  }
  // Rakip oyuncular araya girebilir
  const opp = side === 'home' ? match.away : match.home;
  const interceptors = opp.players.filter(p =>
    p.onField && p.position !== 'GK' &&
    Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) < 18
  );
  difficulty += interceptors.length * 3;

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

  const crossCheck = skillCheck(carrier, 'crossing', 55, { action: 'crossing', inBox: false });
  if (!crossCheck.success) {
    // Orta başarısız → kaleci veya savunma alır
    return outOfPlay(match, 'orta_kisa', 'away', { actor: carrier.id });
  }

  // Hedef: ceza sahası içi bir oyuncu
  const atk = match[side];
  const targets = atk.players.filter(p =>
    p.onField && p.position === 'FV' &&
    (side === 'home' ? inHomeBox(p.live.x, p.live.y) : inAwayBox(p.live.x, p.live.y))
  );
  if (!targets.length) return outOfPlay(match, 'orta_alici_yok', 'away');

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

// === ŞUT ===
function resolveShoot(match, carrier) {
  const side = match.ballSide;
  const inBox = side === 'home' ? inHomeBox(match.ballPos.x, match.ballPos.y) : inAwayBox(match.ballPos.x, match.ballPos.y);
  const distanceToGoal = side === 'home'
    ? Math.hypot(match.ballPos.x - PITCH.homeGoal.x, match.ballPos.y - PITCH.homeGoal.y)
    : Math.hypot(match.ballPos.x - PITCH.awayGoal.x, match.ballPos.y - PITCH.awayGoal.y);

  // Şut zorluğu: mesafe + açı + kaleci
  // InBox'ta düşük (kolay bitiricilik), uzak şutta yüksek ama abartısız
  let difficulty = inBox
    ? 40 + distanceToGoal * 0.3
    : 45 + distanceToGoal * 0.35;

  // Şut kontrolü — hangi yetenek kullanılacak?
  // InBox'ta finishing, dışarıda shooting (uzaktan longShots ekleme şutu zorlaştırır)
  const action = inBox ? 'finishing' : 'shooting';
  const shootCtx = { action: inBox ? 'finishing' : 'shooting', inBox, distance: distanceToGoal };
  const shootCheck = skillCheck(carrier, action, difficulty, shootCtx);

  if (!shootCheck.success) {
    // Şut auta gitti
    return outOfPlay(match, 'sut_isabetsiz', 'away', { actor: carrier.id });
  }

  // İsabetli şut → kaleci kurtarışı
  const opp = side === 'home' ? match.away : match.home;
  const keeper = opp.players.find(p => p.position === 'GK' && p.onField);
  if (!keeper) return fail(match, 'kaleciYok');

  const saveAction = inBox ? 'gkOneOnOne' : 'reflexes';
  const saveCtx = { action: 'save', distance: distanceToGoal };

  // Basit kurtarış formülü: save_skill + bonus < shot_skill + bonus → gol
  // InBox'ta kaleci +8 bonus (yakın mesafe bile riskli), uzak şutta kaleci +3 bonus
  const shotSkill = getEffective(carrier, action, shootCtx);
  const saveSkill = getEffective(keeper, saveAction, saveCtx);
  const inBoxBonus = inBox ? 8 : 3;
  const longShotBonus = !inBox && distanceToGoal > 20 ? 0 : 0;
  // Eşitlik durumunda kaleci kazansın, ama daha geniş varyans (dramatik gol/şans)
  const variance = (Math.random() - 0.5) * 18;
  const isGoal = (shotSkill + longShotBonus + variance) > (saveSkill + inBoxBonus);

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
    // Kimse yakın değil, serbest ilerle
    const dirX = side === 'home' ? 15 : -15;
    const newBall = { x: Math.max(0, Math.min(100, match.ballPos.x + dirX)), y: match.ballPos.y + (Math.random() - 0.5) * 4 };
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
    const newBall = { x: Math.max(0, Math.min(100, match.ballPos.x + dirX)), y: nearest.p.live.y + (Math.random() - 0.5) * 6 };
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

  // Top kaybedildi
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
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: 'out_of_play',
      reason,
      side: match.ballSide,
      actor: extra.actor,
      target: extra.target,
      text: extra.text || `${match.minute}' ${reason}`,
    }],
    newBall: { x: 50, y: 35 },
    newCarrier: null,
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
