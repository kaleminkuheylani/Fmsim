// match/state.js
var PITCH = {
  width: 100,
  height: 70,
  homeGoal: { x: 0, y: 35 },
  awayGoal: { x: 100, y: 35 },
  homePenaltyArea: { xMin: 0, xMax: 16, yMin: 17, yMax: 53 },
  awayPenaltyArea: { xMin: 84, xMax: 100, yMin: 17, yMax: 53 },
  homeSixYard: { xMin: 0, xMax: 6, yMin: 28, yMax: 42 },
  awaySixYard: { xMin: 94, xMax: 100, yMin: 28, yMax: 42 },
  center: { x: 50, y: 35 }
};
function inHomeBox(x, y) {
  return x >= PITCH.homePenaltyArea.xMin && x <= PITCH.homePenaltyArea.xMax && y >= PITCH.homePenaltyArea.yMin && y <= PITCH.homePenaltyArea.yMax;
}
function inAwayBox(x, y) {
  return x >= PITCH.awayPenaltyArea.xMin && x <= PITCH.awayPenaltyArea.xMax && y >= PITCH.awayPenaltyArea.yMin && y <= PITCH.awayPenaltyArea.yMax;
}
function inAnyBox(x, y) {
  return inHomeBox(x, y) || inAwayBox(x, y);
}
function zoneOf(x, y) {
  if (x < 16) return "DEFENSIVE_THIRD";
  if (x < 32) return "DEFENSIVE_MID";
  if (x < 50) return "MIDFIELD_LEFT";
  if (x < 68) return "MIDFIELD_RIGHT";
  if (x < 84) return "ATTACKING_MID";
  return "ATTACKING_THIRD";
}
function threatOf(x, y, side) {
  if (side === "home") return x / 100;
  return (100 - x) / 100;
}
function makeMatchState({ home, away, homeFormation = "442", awayFormation = "442", weather = "sunny", pitch = "dry", referee = "fair" } = {}) {
  return {
    // === engine3 ile uyumlu alanlar ===
    home,
    away,
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    events: [],
    // [{ minute, type, side, actor, x, y, text, ... }]
    ballPos: { x: 50, y: 35 },
    ballSide: Math.random() < 0.5 ? "home" : "away",
    ballCarrier: null,
    // { side, playerId }
    matchVars: { weather, pitch, referee, derby: false },
    // === ek alanlar (Match Engine) ===
    config: {
      goalBoost: 1,
      tickMs: 1500,
      // WS push aralığı
      substitutions: { home: 5, away: 5 },
      playerMentionInterval: 3
    },
    pitch: PITCH,
    // istatistikler
    stats: {
      possession: { home: 0, away: 0 },
      // 0-100 yüzde, güncellenecek
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      offsides: { home: 0, away: 0 },
      passesCompleted: { home: 0, away: 0 },
      passesAttempted: { home: 0, away: 0 }
    },
    // momentum (0.5 = denge, >0.5 home lehine)
    momentum: 0.5,
    // son olay bilgisi (narrative engine için)
    lastEvent: null,
    lastEventMinute: -100,
    lastEventType: null,
    // taktik & formasyon
    tactics: { home: { id: "normal", changes: 0 }, away: { id: "normal", changes: 0 } },
    formation: { home: homeFormation, away: awayFormation },
    // dakika başına sayaçlar (poss hesabı için)
    tickCount: 0
  };
}
function findPlayer(match, side, playerId) {
  const team = match[side];
  return team?.players?.find((p) => p.id === playerId || p.name === playerId) || null;
}
function findPlayerByPos(match, side, role) {
  const team = match[side];
  return team?.players?.find((p) => p.position === role && p.onField) || null;
}
function isOnField(match, side, playerId) {
  return !!findPlayer(match, side, playerId);
}

// match/positions.js
var FORMATIONS = {
  // [GK, DF x n, OS x n, FV x n] → [{ x, y }]
  "442": [
    { role: "GK", x: 5, y: 35 },
    { role: "DF", x: 22, y: 12 },
    { role: "DF", x: 20, y: 25 },
    { role: "DF", x: 20, y: 45 },
    { role: "DF", x: 22, y: 58 },
    { role: "OS", x: 42, y: 12 },
    { role: "OS", x: 45, y: 28 },
    { role: "OS", x: 45, y: 42 },
    { role: "OS", x: 42, y: 58 },
    { role: "FV", x: 70, y: 28 },
    { role: "FV", x: 70, y: 42 }
  ],
  "433": [
    { role: "GK", x: 5, y: 35 },
    { role: "DF", x: 22, y: 14 },
    { role: "DF", x: 20, y: 28 },
    { role: "DF", x: 20, y: 42 },
    { role: "DF", x: 22, y: 56 },
    { role: "OS", x: 42, y: 22 },
    { role: "OS", x: 45, y: 35 },
    { role: "OS", x: 42, y: 48 },
    { role: "FV", x: 70, y: 18 },
    { role: "FV", x: 75, y: 35 },
    { role: "FV", x: 70, y: 52 }
  ],
  "352": [
    { role: "GK", x: 5, y: 35 },
    { role: "DF", x: 20, y: 20 },
    { role: "DF", x: 18, y: 35 },
    { role: "DF", x: 20, y: 50 },
    { role: "OS", x: 40, y: 8 },
    { role: "OS", x: 42, y: 22 },
    { role: "OS", x: 45, y: 35 },
    { role: "OS", x: 42, y: 48 },
    { role: "OS", x: 40, y: 62 },
    { role: "FV", x: 70, y: 25 },
    { role: "FV", x: 70, y: 45 }
  ],
  "451": [
    { role: "GK", x: 5, y: 35 },
    { role: "DF", x: 22, y: 12 },
    { role: "DF", x: 20, y: 25 },
    { role: "DF", x: 20, y: 45 },
    { role: "DF", x: 22, y: 58 },
    { role: "OS", x: 40, y: 8 },
    { role: "OS", x: 42, y: 22 },
    { role: "OS", x: 45, y: 32 },
    { role: "OS", x: 45, y: 38 },
    { role: "OS", x: 42, y: 48 },
    { role: "FV", x: 70, y: 35 }
  ]
};
function getFormationPositions(formationId) {
  return FORMATIONS[formationId] || FORMATIONS["442"];
}
function deployLineup(team, formationId, mirror = false) {
  const slots = getFormationPositions(formationId);
  const used = /* @__PURE__ */ new Set();
  const fielded = [];
  for (const slot of slots) {
    const candidate = team.players.filter((p) => p.position === slot.role && !used.has(p.id)).sort((a, b) => (b.attrs?.[primaryAttrForRole(slot.role)] ?? 0) - (a.attrs?.[primaryAttrForRole(slot.role)] ?? 0))[0];
    if (candidate) {
      used.add(candidate.id);
      candidate.onField = true;
      candidate.live.x = mirror ? 100 - slot.x : slot.x;
      candidate.live.y = slot.y;
      fielded.push(candidate);
    } else {
      const bench = team.players.filter((p) => !used.has(p.id) && adjacentRole(slot.role).includes(p.position)).sort((a, b) => b.attrs?.[primaryAttrForRole(slot.role)] - a.attrs?.[primaryAttrForRole(slot.role)])[0];
      if (bench) {
        used.add(bench.id);
        bench.position = slot.role;
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
  return { GK: "reflexes", DF: "tackling", OS: "passing", FV: "finishing" }[role] || "passing";
}
function adjacentRole(role) {
  return { GK: ["GK"], DF: ["DF", "OS"], OS: ["OS", "DF", "FV"], FV: ["FV", "OS"] }[role] || [role];
}
function updatePositions(match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  for (const teamSide of ["home", "away"]) {
    const team = match[teamSide];
    const mirror = teamSide === "away";
    for (const p of team.players) {
      if (!p.onField) continue;
      const base = basePositionOf(p, match.formation[teamSide], mirror);
      if (!base) continue;
      let targetX = base.x;
      let targetY = base.y;
      const attacking = side === teamSide;
      const xDist = mirror ? ball.x - (100 - base.x) : ball.x - base.x;
      if (p.position === "GK") {
        if (attacking) targetX += 2;
        else targetX += Math.max(0, 4 - Math.abs(xDist) / 10);
        if (mirror) targetY = 35 + (ball.y - 35) * 0.2;
        else targetY = 35 + (ball.y - 35) * 0.2;
      } else if (p.position === "DF") {
        if (attacking) targetX += 5;
        else targetX -= 3;
      } else if (p.position === "OS") {
        if (attacking) targetX += 4;
        else targetX -= 2;
      } else if (p.position === "FV") {
        if (attacking) targetX += 8;
        else targetX -= 4;
        if (side === teamSide && match.ballPos.x > 70) targetX = mirror ? 92 : 92;
      }
      const lerp = p.live.currentStamina < 30 ? 0.05 : 0.2;
      p.live.x += (targetX - p.live.x) * lerp;
      p.live.y += (targetY - p.live.y) * lerp;
    }
  }
}
function basePositionOf(player, formationId, mirror) {
  const slots = getFormationPositions(formationId);
  const slot = slots.find((s) => s.role === player.position);
  if (!slot) return null;
  return { x: mirror ? 100 - slot.x : slot.x, y: slot.y };
}

// game/playerSchema.js
var ROLE_WEIGHTS = {
  GK: { reflexes: 1.3, positioning: 1.2, composure: 1.1, passing: 0.9 },
  DF: { tackling: 1.3, marking: 1.2, interception: 1.1, aerial: 1.1, passing: 0.9 },
  OS: { passing: 1.3, vision: 1.2, decisions: 1.1, firstTouch: 1, dribbling: 0.9 },
  FV: { finishing: 1.3, composure: 1.2, shooting: 1.1, pace: 1, firstTouch: 1 }
};
var STAR_TRAITS = {};

// match/calc.js
var STAMINA_DECAY = { GK: 0.2, DF: 0.55, OS: 0.75, FV: 0.65 };
var STAMINA_BOOST = (minute) => {
  if (minute >= 80) return 2;
  if (minute >= 60) return 1.5;
  return 1;
};
function staminaFactor(currentStamina) {
  if (currentStamina >= 90) return 1;
  if (currentStamina >= 70) return 0.95 + (currentStamina - 70) * 25e-4;
  if (currentStamina >= 50) return 0.85 + (currentStamina - 50) * 5e-3;
  if (currentStamina >= 30) return 0.65 + (currentStamina - 30) * 0.01;
  return 0.3 + currentStamina * 0.0117;
}
function moraleFactor(morale) {
  return 1 + (morale - 50) / 250;
}
function formFactor(form) {
  return 1 + form * 0.02;
}
function starFactor(stars) {
  return 1 + stars * 0.02;
}
function roleWeight(position, attr) {
  const w = ROLE_WEIGHTS[position]?.[attr] ?? 1;
  return Math.max(0.5, Math.min(1.5, w));
}
function traitFactor(player, action, ctx) {
  let mul = 1;
  for (const t of player.traits || []) {
    const trait = STAR_TRAITS[t];
    if (trait) mul *= trait.apply(player, { action, ...ctx });
  }
  return mul;
}
function getEffective(player, action, ctx = {}) {
  if (!player) return 0;
  const base = player.attrs?.[action] ?? 50;
  const rw = Math.max(0.7, Math.min(1.3, roleWeight(player.position, action)));
  let value = base * rw;
  const live = player.live || {};
  const stF = staminaFactor(live.currentStamina ?? 100);
  const moF = moraleFactor(live.currentMorale ?? 60);
  const foF = formFactor(live.form ?? 0);
  const starF = starFactor(player.stars ?? 0);
  value *= stF * moF * foF * starF;
  value *= traitFactor(player, action, ctx);
  if (stF < 0.55) {
    value *= 0.85;
  }
  return Math.max(0, Math.min(85, value));
}
function duel(a, b, action, ctx = {}) {
  const aScore = getEffective(a, action, ctx);
  const bScore = getEffective(b, action, ctx);
  const aRand = (Math.random() - 0.5) * 12;
  const bRand = (Math.random() - 0.5) * 12;
  const aTotal = aScore + aRand;
  const bTotal = bScore + bRand;
  const margin = aTotal - bTotal;
  if (Math.abs(margin) < 3) return { winner: "tie", margin, aScore: aTotal, bScore: bTotal };
  return { winner: margin > 0 ? "a" : "b", margin, aScore: aTotal, bScore: bTotal };
}
function skillCheck(player, action, difficulty = 50, ctx = {}) {
  const skill = getEffective(player, action, ctx);
  const roll = skill + (Math.random() - 0.5) * 20;
  return {
    success: roll >= difficulty,
    roll,
    margin: skill - difficulty,
    skill
  };
}
function tickStamina(player, minute = 0) {
  const decay = STAMINA_DECAY[player.position] ?? 0.18;
  const boost = STAMINA_BOOST(minute);
  const extra = player.live?.extraEffort ?? 0;
  player.live.currentStamina = Math.max(0, (player.live.currentStamina ?? 100) - decay * boost - extra);
  player.live.extraEffort = 0;
  player.live.minutesPlayed = (player.live.minutesPlayed ?? 0) + 1;
}

// match/decision.js
function decisionWeights(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const x = side === "home" ? ball.x : 100 - ball.x;
  const inBox = inAnyBox(ball.x, ball.y);
  const threat = threatOf(ball.x, ball.y, side);
  const stamina = player.live?.currentStamina ?? 100;
  const tired = stamina < 40;
  let shoot = 0;
  if (player.position === "FV" || player.position === "OS") {
    if (inBox) {
      shoot = 0.9 + threat * 0.1;
    } else if (x > 78) {
      shoot = 0.5 + threat * 0.2;
    } else if (x > 65 && player.position === "FV") {
      shoot = 0.1;
    }
  }
  const finishing = getEffective(player, "finishing");
  const composure = getEffective(player, "composure");
  const longShots = getEffective(player, "longShots");
  const shooting = getEffective(player, "shooting");
  if (inBox) {
    shoot *= 0.5 + (finishing + composure) / 200;
  } else {
    shoot *= 0.3 + (longShots + shooting) / 250;
  }
  let passShort = 0.4;
  if (inBox) passShort = 0.3;
  if (x < 30) passShort = 0.6;
  const passing = getEffective(player, "passing");
  const vision = getEffective(player, "vision");
  const decisions = getEffective(player, "decisions");
  passShort *= 0.5 + (passing * 0.6 + vision * 0.3 + decisions * 0.1) / 100;
  let passLong = 0.2;
  if (x > 50 && !inBox) passLong = 0.4;
  if (x < 25) passLong = 0.5;
  const firstTouch = getEffective(player, "firstTouch");
  passLong *= 0.4 + (passing * 0.4 + vision * 0.4 + firstTouch * 0.2) / 100;
  let cross = 0;
  if (x > 50 && ball.y < 25) cross = 0.55;
  if (x > 50 && ball.y > 45) cross = 0.55;
  if (inBox) cross = 0.15;
  if (x < 50) cross = 0.1;
  const crossing = getEffective(player, "crossing");
  const fl = getEffective(player, "flair");
  cross *= 0.5 + (crossing * 0.7 + fl * 0.3) / 100;
  let dribble = 0.25;
  if (x > 30 && x < 70) dribble = 0.45;
  if (inBox) dribble = 0.2;
  if (x < 25) dribble = 0.1;
  const dribbling = getEffective(player, "dribbling");
  const agility = getEffective(player, "agility");
  const pace = getEffective(player, "pace");
  dribble *= 0.5 + (dribbling * 0.4 + agility * 0.3 + pace * 0.3) / 100;
  let hold = 0.1;
  if (tired) hold = 0.4;
  if (inBox) hold = 0.05;
  hold *= 0.7 + composure / 200;
  let recycle = 0.1;
  if (x < 30) recycle = 0.35;
  if (tired) {
    dribble *= 0.6;
    cross *= 0.7;
    passLong *= 0.7;
    hold *= 1.3;
  }
  const aggression = getEffective(player, "aggression");
  if (aggression > 70 && x > 60) shoot *= 1.15;
  const leadership = getEffective(player, "leadership");
  if (leadership > 75 && match.minute > 70) passShort *= 1.1;
  const tactics = match.tactics?.[side] || "normal";
  switch (tactics) {
    case "defansif":
      shoot *= 0.5;
      passShort *= 0.8;
      passLong *= 0.5;
      cross *= 0.4;
      hold *= 1.5;
      recycle *= 1.3;
      dribble *= 0.6;
      break;
    case "kontra":
      if (x < 50) {
        hold *= 0.6;
        shoot *= 0.7;
      }
      if (x > 70) {
        shoot *= 1.6;
        passLong *= 1.3;
        cross *= 1.2;
      }
      break;
    case "kanat":
      cross *= 1.8;
      passLong *= 1.2;
      shoot *= 0.85;
      break;
    case "merkez":
      passShort *= 1.4;
      passLong *= 0.6;
      cross *= 0.3;
      dribble *= 1.2;
      break;
    case "ofansif":
      shoot *= 1.6;
      cross *= 1.3;
      passLong *= 1.2;
      dribble *= 1.2;
      hold *= 0.5;
      recycle *= 0.5;
      break;
  }
  return { shoot, passShort, passLong, cross, dribble, hold, recycle };
}
function pickAction(player, match) {
  const w = decisionWeights(player, match);
  const entries = Object.entries(w);
  const total = entries.reduce((s, [_, v]) => s + Math.max(0, v), 1e-9);
  let r = Math.random() * total;
  for (const [action, weight] of entries) {
    r -= Math.max(0, weight);
    if (r <= 0) return action;
  }
  return entries[entries.length - 1][0];
}
function pickPassTarget(carrier, match, type = "short") {
  const side = match.ballSide;
  const team = match[side];
  const onField = team.players.filter((p) => p.onField);
  const carriers = onField.filter((p) => p.id !== carrier.id);
  if (!carriers.length) return null;
  const ball = match.ballPos;
  const candidates = carriers.map((target) => {
    let score = 0;
    let distance = Math.hypot(target.live.x - ball.x, target.live.y - ball.y);
    if (type === "short") {
      if (distance < 5) score -= 0.5;
      else if (distance <= 15) score += 1;
      else if (distance <= 25) score += 0.4;
      else score -= 0.3;
    } else if (type === "long") {
      if (distance >= 25 && distance <= 45) score += 1;
      else if (distance > 45) score += 0.3;
      else score -= 0.4;
    } else if (type === "cross") {
      if (distance >= 15 && distance <= 30) score += 0.8;
    }
    const forwardDelta = side === "home" ? target.live.x - ball.x : ball.x - target.live.x;
    if (forwardDelta > 0) score += 0.3;
    if (forwardDelta > 10) score += 0.4;
    if (forwardDelta > 20) score += 0.5;
    const opp = side === "home" ? match.away : match.home;
    const opponentsNearby = opp.players.filter((p) => p.onField && Math.hypot(p.live.x - target.live.x, p.live.y - target.live.y) < 12).length;
    score -= opponentsNearby * 0.15;
    const receive = getEffective(target, "firstTouch");
    score += receive / 250;
    return { target, distance, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);
  const total = top.reduce((s, c) => s + Math.max(0.01, c.score), 1e-9);
  let r = Math.random() * total;
  for (const c of top) {
    r -= Math.max(0.01, c.score);
    if (r <= 0) return { side, playerId: c.target.id, distance: c.distance };
  }
  return { side, playerId: top[0].target.id, distance: top[0].distance };
}

// match/events.js
function resolveAction(match, carrier, action, target) {
  const side = match.ballSide;
  const ball = { ...match.ballPos };
  switch (action) {
    case "passShort":
      return resolvePass(match, carrier, "short", target);
    case "passLong":
      return resolvePass(match, carrier, "long", target);
    case "cross":
      return resolveCross(match, carrier);
    case "shoot":
      return resolveShoot(match, carrier);
    case "dribble":
      return resolveDribble(match, carrier);
    case "hold":
      return resolveHold(match, carrier);
    case "recycle":
      return resolveRecycle(match, carrier);
    default:
      return { ok: false, events: [], newBall: ball, newCarrier: { side, playerId: carrier.id } };
  }
}
function resolvePass(match, carrier, type, target) {
  const side = match.ballSide;
  if (!target) return fail(match, "pasHedefiYok");
  const targetPlayer = findPlayer2(match, target.side, target.playerId);
  if (!targetPlayer) return fail(match, "pasHedefiYok");
  const distance = target.distance;
  let difficulty = 50;
  if (type === "short") {
    difficulty = 40 + distance * 0.5;
  } else {
    difficulty = 55 + distance * 0.8;
  }
  const opp = side === "home" ? match.away : match.home;
  const interceptors = opp.players.filter(
    (p) => p.onField && p.position !== "GK" && Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) < 18
  );
  difficulty += interceptors.length * 3;
  const passCheck = skillCheck(carrier, type === "long" ? "passing" : "passing", difficulty, {
    action: type === "long" ? "longPass" : "passShort",
    inBox: inAnyBox(match.ballPos.x, match.ballPos.y)
  });
  if (!passCheck.success) {
    const closest = interceptors.sort(
      (a, b) => Math.hypot(a.live.x - match.ballPos.x, a.live.y - match.ballPos.y) - Math.hypot(b.live.x - match.ballPos.x, b.live.y - match.ballPos.y)
    )[0];
    if (closest) {
      const interceptCheck = skillCheck(closest, "interception", 60, { action: "interception" });
      if (interceptCheck.success) {
        return intercept(match, carrier, closest, "pas_kesildi");
      }
    }
    return outOfPlay(match, "pas_oturmadi", "away", { actor: carrier.id });
  }
  const events = [{
    minute: match.minute,
    type: "pass_success",
    side,
    actor: carrier.id,
    target: targetPlayer.id,
    distance,
    x: match.ballPos.x,
    y: match.ballPos.y,
    text: `${match.minute}' ${carrier.name} \u2192 ${targetPlayer.name} (${Math.round(distance)}m)`
  }];
  const dirSign = side === "home" ? 1 : -1;
  const progressBoost = type === "long" ? 5 : 2.5;
  const newBall = {
    x: Math.max(0, Math.min(100, targetPlayer.live.x + dirSign * progressBoost)),
    y: targetPlayer.live.y
  };
  carrier.live.extraEffort = 0.05;
  match.stats.passesAttempted[side]++;
  match.stats.passesCompleted[side]++;
  carrier.live.passesAttempted++;
  carrier.live.passesCompleted++;
  targetPlayer.live.passesAttempted++;
  return {
    ok: true,
    events,
    newBall,
    newCarrier: { side, playerId: targetPlayer.id }
  };
}
function resolveCross(match, carrier) {
  const side = match.ballSide;
  const inBox = side === "home" ? inHomeBox(match.ballPos.x, match.ballPos.y) : inAwayBox(match.ballPos.x, match.ballPos.y);
  if (inBox) {
    return resolveShoot(match, carrier);
  }
  const crossCheck = skillCheck(carrier, "crossing", 55, { action: "crossing", inBox: false });
  if (!crossCheck.success) {
    return outOfPlay(match, "orta_kisa", "away", { actor: carrier.id });
  }
  const atk = match[side];
  const targets = atk.players.filter(
    (p) => p.onField && p.position === "FV" && (side === "home" ? inHomeBox(p.live.x, p.live.y) : inAwayBox(p.live.x, p.live.y))
  );
  if (!targets.length) return outOfPlay(match, "orta_alici_yok", "away");
  const target = targets.sort((a, b) => getEffective(b, "heading") - getEffective(a, "heading"))[0];
  const newBall = { x: target.live.x, y: target.live.y };
  const opp = side === "home" ? match.away : match.home;
  const defenders = opp.players.filter((p) => p.onField && p.position === "DF" && Math.hypot(p.live.x - newBall.x, p.live.y - newBall.y) < 10);
  if (defenders.length) {
    const def = defenders[0];
    const aerialDuel = duel(target, def, "aerial", { action: "aerial", inBox: true });
    if (aerialDuel.winner === "b") {
      return intercept(match, target, def, "kafa_mudahale");
    }
  }
  return {
    ok: true,
    events: [{
      minute: match.minute,
      type: "cross_success",
      side,
      actor: carrier.id,
      target: target.id,
      text: `${match.minute}' ${carrier.name} ortas\u0131n\u0131 ${target.name}'e g\xF6nderdi.`
    }],
    newBall,
    newCarrier: { side, playerId: target.id }
  };
}
function resolveShoot(match, carrier) {
  const side = match.ballSide;
  const inBox = side === "home" ? inHomeBox(match.ballPos.x, match.ballPos.y) : inAwayBox(match.ballPos.x, match.ballPos.y);
  const distanceToGoal = side === "home" ? Math.hypot(match.ballPos.x - PITCH.homeGoal.x, match.ballPos.y - PITCH.homeGoal.y) : Math.hypot(match.ballPos.x - PITCH.awayGoal.x, match.ballPos.y - PITCH.awayGoal.y);
  let difficulty = inBox ? 40 + distanceToGoal * 0.3 : 45 + distanceToGoal * 0.35;
  const action = inBox ? "finishing" : "shooting";
  const shootCtx = { action: inBox ? "finishing" : "shooting", inBox, distance: distanceToGoal };
  const shootCheck = skillCheck(carrier, action, difficulty, shootCtx);
  if (!shootCheck.success) {
    return outOfPlay(match, "sut_isabetsiz", "away", { actor: carrier.id });
  }
  const opp = side === "home" ? match.away : match.home;
  const keeper = opp.players.find((p) => p.position === "GK" && p.onField);
  if (!keeper) return fail(match, "kaleciYok");
  const saveAction = inBox ? "gkOneOnOne" : "reflexes";
  const saveCtx = { action: "save", distance: distanceToGoal };
  const shotSkill = getEffective(carrier, action, shootCtx);
  const saveSkill = getEffective(keeper, saveAction, saveCtx);
  const inBoxBonus = inBox ? 8 : 3;
  const longShotBonus = !inBox && distanceToGoal > 20 ? 0 : 0;
  const variance = (Math.random() - 0.5) * 18;
  const isGoal = shotSkill + longShotBonus + variance > saveSkill + inBoxBonus;
  carrier.live.shots++;
  match.stats.shots[side]++;
  if (isGoal) {
    if (side === "home") match.homeScore++;
    else match.awayScore++;
    carrier.live.goals++;
    match.stats.shotsOnTarget[side]++;
    carrier.live.shotsOnTarget++;
    keeper.live.conceded = (keeper.live.conceded || 0) + 1;
    if (match.motivation) match.motivation.onGoal(side);
    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: "goal",
        side,
        scorer: carrier.id,
        assist: match.ballCarrier && match.ballCarrier.playerId !== carrier.id ? match.ballCarrier.playerId : null,
        x: match.ballPos.x,
        y: match.ballPos.y,
        text: `\u26BD ${match.minute}' GOOL! ${carrier.name} (${match[side].name})!`
      }],
      newBall: { x: 50, y: 35 },
      newCarrier: null
      // gol sonrası orta sahaya
    };
  }
  keeper.live.saves++;
  match.stats.shotsOnTarget[side]++;
  carrier.live.shotsOnTarget++;
  if (inBox) {
    return corner(match, side);
  } else {
    return outOfPlay(match, "kaleciKurtardi", "away", { actor: carrier.id, side });
  }
}
function resolveDribble(match, carrier) {
  const side = match.ballSide;
  const opp = side === "home" ? match.away : match.home;
  const nearest = opp.players.filter((p) => p.onField && p.position !== "GK").map((p) => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) })).sort((a, b) => a.d - b.d)[0];
  if (!nearest || nearest.d > 10) {
    const dirX = side === "home" ? 15 : -15;
    const newBall = { x: Math.max(0, Math.min(100, match.ballPos.x + dirX)), y: match.ballPos.y + (Math.random() - 0.5) * 4 };
    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: "dribble_success",
        side,
        actor: carrier.id,
        text: `${match.minute}' ${carrier.name} bo\u015F alanda s\xFCr\xFCyor.`
      }],
      newBall,
      newCarrier: { side, playerId: carrier.id }
    };
  }
  const d = duel(carrier, nearest.p, "dribbling", { action: "dribble" });
  if (d.winner === "a") {
    const dirX = side === "home" ? 8 : -8;
    const newBall = { x: Math.max(0, Math.min(100, match.ballPos.x + dirX)), y: nearest.p.live.y + (Math.random() - 0.5) * 6 };
    return {
      ok: true,
      events: [{
        minute: match.minute,
        type: "dribble_success",
        side,
        actor: carrier.id,
        text: `${match.minute}' ${carrier.name}, ${nearest.p.name}'i ge\xE7ti!`
      }],
      newBall,
      newCarrier: { side, playerId: carrier.id }
    };
  }
  return turnover(match, carrier, nearest.p, "dripling_kayip");
}
function resolveHold(match, carrier) {
  return {
    ok: true,
    events: [],
    newBall: { ...match.ballPos },
    newCarrier: { side: match.ballSide, playerId: carrier.id }
  };
}
function resolveRecycle(match, carrier) {
  const team = match[match.ballSide];
  const defenders = team.players.filter((p) => p.onField && (p.position === "DF" || p.position === "GK")).map((p) => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) })).sort((a, b) => a.d - b.d);
  if (!defenders.length) return resolveHold(match, carrier);
  return resolvePass(match, carrier, "short", { side: match.ballSide, playerId: defenders[0].p.id, distance: defenders[0].d });
}
function intercept(match, loser, winner, reason) {
  const newSide = match.ballSide === "home" ? "away" : "home";
  match.ballSide = newSide;
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: "turnover",
      side: newSide,
      actor: winner.id,
      text: `${match.minute}' ${winner.name} topu kazand\u0131! (${reason})`
    }],
    newBall: { x: winner.live.x, y: winner.live.y },
    newCarrier: { side: newSide, playerId: winner.id }
  };
}
function turnover(match, loser, winner, reason) {
  const newSide = match.ballSide === "home" ? "away" : "home";
  match.ballSide = newSide;
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: "turnover",
      side: newSide,
      actor: winner.id,
      loser: loser.id,
      text: `${match.minute}' ${loser.name} topu kaybetti, ${winner.name} ald\u0131!`
    }],
    newBall: { x: winner.live.x, y: winner.live.y },
    newCarrier: { side: newSide, playerId: winner.id }
  };
}
function corner(match, attackingSide) {
  const defendingSide = attackingSide === "home" ? "away" : "home";
  match.stats.corners[attackingSide]++;
  const cornerX = attackingSide === "home" ? 95 : 5;
  const cornerY = match.ballPos.y > 35 ? 65 : 5;
  match.ballSide = defendingSide;
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: "corner",
      side: attackingSide,
      text: `${match.minute}' Korner! ${match[attackingSide].name}`
    }],
    newBall: { x: cornerX, y: cornerY },
    newCarrier: null
    // orta için bekleniyor
  };
}
function outOfPlay(match, reason, newSide, extra = {}) {
  return {
    ok: false,
    events: [{
      minute: match.minute,
      type: "out_of_play",
      reason,
      side: match.ballSide,
      actor: extra.actor,
      target: extra.target,
      text: extra.text || `${match.minute}' ${reason}`
    }],
    newBall: { x: 50, y: 35 },
    newCarrier: null
  };
}
function fail(match, reason) {
  return { ok: false, events: [{ minute: match.minute, type: "fail", reason, text: reason }], newBall: { ...match.ballPos }, newCarrier: null };
}
function findPlayer2(match, side, playerId) {
  return match[side]?.players?.find((p) => p.id === playerId) || null;
}

// match/commentlib/build_up.js
var BUILD_UP_TEMPLATES = {
  // === YAVAŞ TEMPO — kaleci uzun top atmak istemiyor ===
  slow: [
    "{team} savunmada sakin, {actor} etraf\u0131na bak\u0131yor, pas verecek adam ar\u0131yor",
    "{actor} topu ald\u0131, acele etmiyor, {direction} oyuna d\xF6nd\xFC",
    "{team} geriden kontroll\xFC oyun kuruyor, {actor} rakip beklemiyor",
    "{actor} aya\u011F\u0131nda top, acele etmeden arkada\u015Flar\u0131n\u0131 s\xFCz\xFCyor",
    "Savunmada top {actor}'da, {team} oyunu so\u011Futuyor"
  ],
  // === NORMAL TEMPO — klasik oyun kurma ===
  normal: [
    "{team} defanstan topu \xE7\u0131kard\u0131, {actor} orta sahaya do\u011Fru oynad\u0131",
    "{actor} topu ald\u0131, etraf\u0131na bakt\u0131, {target}'a oynad\u0131",
    "{team} savunmadan \xE7\u0131k\u0131yor, {actor} \xF6n\xFCndeki adam\u0131 g\xF6rd\xFC",
    "{actor} stoperden pas ald\u0131, sakin sakin ilerletiyor",
    "Defansta {actor} topu ald\u0131, etraf\u0131na bakt\u0131, {target}'a oynad\u0131",
    "{team} geriden oyun kuruyor, {actor} pas\u0131 verdi",
    "{actor} savunmadan topu ta\u015F\u0131yor, orta sahaya aktaracak",
    "Defansta k\u0131sa pasla\u015Fma, {actor} topu sakl\u0131yor"
  ],
  // === HIZLI TEMPO — hızlı çıkış ===
  fast: [
    "{team} h\u0131zl\u0131 \xE7\u0131k\u0131yor! {actor} topu ald\u0131, hemen ileri ta\u015F\u0131yor",
    "{actor} tek pasla oyuna girdi, {team} h\u0131zl\u0131 h\xFCcuma kalk\u0131yor",
    "H\u0131zl\u0131 pas! {actor} \u2192 {target}, orta sahaya ta\u015F\u0131nd\u0131",
    "{team} \xE7abuk \xE7\u0131kmak istiyor, {actor} topu ald\u0131, ileriye ta\u015F\u0131yor"
  ],
  // === KALECİDEN BAŞLANGIÇ ===
  fromGK: [
    "Kaleci {actor} uzun top atmak yerine k\u0131sa oynuyor",
    "{actor} topu ald\u0131, hemen stoper g\xF6rd\xFC, k\u0131sa pas",
    "Kaleci {actor} arkas\u0131na d\xF6nd\xFC, pas verecek adam ar\u0131yor"
  ],
  // === YÜKSEK BASKI ALTINDA ===
  pressed: [
    "{team} bask\u0131 alt\u0131nda, {actor} h\u0131zl\u0131 pas vermek zorunda",
    "{actor} s\u0131k\u0131\u015Ft\u0131r\u0131ld\u0131, topu kurtarmaya \xE7al\u0131\u015F\u0131yor!",
    "Rakip bask\u0131 yap\u0131yor, {actor} topu sakl\u0131yor",
    "{team} zor durumda, {actor} bir \u015Fekilde pas verdi"
  ]
};
var build_up_default = BUILD_UP_TEMPLATES;

// match/commentlib/midfield.js
var MIDFIELD_TEMPLATES = {
  // === TEMPO KONTROLÜ — top saklama ===
  tempo: [
    "{team} orta sahada top \xE7eviriyor, tempo kontrol\xFC {actor}'da",
    "{actor} ortay\u0131 y\xF6nlendiriyor, {team} oyunu so\u011Futuyor",
    "Orta saha {actor}'\u0131n kontrol\xFCnde, etraf\u0131na bak\u0131yor",
    "{team} pasla\u015Farak oyunu kuruyor, {actor} topu da\u011F\u0131t\u0131yor"
  ],
  // === KISA PASLAŞMA ===
  shortPasses: [
    "{team} orta sahada k\u0131sa pasla\u015Fma, {actor} topu sakl\u0131yor",
    "K\u0131sa pas zinciri, {actor} \u2192 {target}, top yer de\u011Fi\u015Ftiriyor",
    "{actor} topu ald\u0131, bir dokunu\u015Fla {target}'a oynad\u0131",
    "Orta sahada h\u0131zl\u0131 pasla\u015Fma, top ayaklar aras\u0131nda",
    "{team} orta sahay\u0131 doldurdu, pasla top ta\u015F\u0131n\u0131yor",
    "{actor} ortada tek dokunu\u015Fla topu \xE7evirdi, g\xF6zleri a\xE7\u0131k"
  ],
  // === İLERİYE TAŞIMA — pas zinciriyle ===
  progressing: [
    "{team} orta sahay\u0131 ge\xE7meye \xE7al\u0131\u015F\u0131yor, {passes} pas sonras\u0131 ileriye ta\u015F\u0131nd\u0131",
    "{actor} ortay\u0131 g\xF6rd\xFC, pasla\u015Farak ileriye ta\u015F\u0131n\u0131yor",
    "{team} pas zinciriyle h\xFCcuma \xE7\u0131k\u0131yor, {actor} \xF6nde bekliyor",
    "Orta sahada {passes} pas sonras\u0131 {team} h\xFCcum b\xF6lgesine yakla\u015Ft\u0131"
  ],
  // === GEÇİŞ OYUNU — uzun pas düşüncesi ===
  transition: [
    "{actor} orta sahada topu ald\u0131, ileriye bak\u0131yor",
    "Orta saha bo\u015Flu\u011Fu aran\u0131yor, {actor} pas verecek yer ar\u0131yor",
    "{team} orta sahada topu tutuyor, do\u011Fru pas an\u0131n\u0131 bekliyor",
    "{actor} topu ta\u015F\u0131yor, \xE7evresinde arkada\u015Flar\u0131 hareketleniyor"
  ],
  // === KAYIP'TAN DÖNÜŞ — geri kazanım sonrası ===
  recover: [
    "{actor} orta sahada topu geri kazand\u0131! {team} tekrar organize oluyor",
    "Orta sahada top {actor}'da, {team} yeniden kuruyor",
    "{actor} araya girdi, {team} yeni atak ba\u015Flat\u0131yor",
    "Top {actor}'da, {team} orta sahada kontrol\xFC yeniden ald\u0131"
  ]
};
var midfield_default = MIDFIELD_TEMPLATES;

// match/commentlib/attack.js
var ATTACK_TEMPLATES = {
  // === GENEL ORGANİZASYON ===
  build: [
    "{team} h\xFCcumu kurdu, {actor} ceza sahas\u0131na do\u011Fru ilerliyor",
    "H\xFCcum organize, {actor} topu ald\u0131, ceza sahas\u0131 \xF6n\xFCnde bekleniyor",
    "{team} son \xE7izgiye yakla\u015Ft\u0131, {actor} pas verecek yer ar\u0131yor",
    "{actor} h\xFCcumda g\xF6rev ald\u0131, ceza sahas\u0131 \xF6n\xFCnde pas ar\u0131yor"
  ],
  // === KANATTAN GELİŞ ===
  left: [
    "Sol kanattan {actor} i\xE7eri kat ediyor, {team} organize h\xFCcumda",
    "Sol tarafta hareketlilik var, {actor} ortal\u0131yor",
    "{actor} sol kanattan s\xFCr\xFCyor, ceza sahas\u0131 \xF6n\xFCnde top",
    "Sol kanat aktif! {actor} ceza sahas\u0131na do\u011Fru ta\u015F\u0131yor"
  ],
  right: [
    "Sa\u011F kanattan {actor} i\xE7eri kat ediyor, {team} organize h\xFCcumda",
    "Sa\u011F tarafta {actor} bindirme yapt\u0131, ortal\u0131yor",
    "{actor} sa\u011Fdan ceza sahas\u0131na yakla\u015F\u0131yor",
    "Sa\u011F kanattan dalga dalga! {actor} topu ta\u015F\u0131yor"
  ],
  // === ORTADA GELİŞ ===
  center: [
    "Ortadan {actor} ceza sahas\u0131na do\u011Fru y\xFCr\xFCyor, {team} h\xFCcumda",
    "Orta alanda {actor} topu ald\u0131, ceza sahas\u0131na yakla\u015F\u0131yor",
    "{actor} forvet hatt\u0131na pas verdi, gol pozisyonu aran\u0131yor",
    "Merkezden {actor} arkada\u015Flar\u0131n\u0131 ar\u0131yor, {team} organize"
  ],
  // === SON PAS ÖNCESİ ===
  finalBall: [
    "{team} son pas\u0131 yapacak, {actor} arka dire\u011Fe hareketlendi",
    "Son pas an\u0131! {actor} ceza sahas\u0131 i\xE7inde bekliyor",
    "{actor} topu ald\u0131, arkada\u015Flar\u0131 ko\u015Fu yolunda",
    "Kritik an \u2014 {actor} ceza sahas\u0131nda, pas an\u0131n\u0131 bekliyor",
    "Tehlike b\xF6lgesinde! {actor} topu ald\u0131, son pas i\xE7in arkas\u0131na bak\u0131yor"
  ],
  // === HIZLI HÜCUM — hızlı tempo ===
  quick: [
    "{team} h\u0131zl\u0131 h\xFCcumda, {actor} ceza sahas\u0131na ko\u015Fuyor",
    "H\u0131zl\u0131 ak\u0131n! {actor} rakibi ge\xE7ti, gol pozisyonuna giriyor",
    "Tempo y\xFCksek! {team} h\xFCcumda, {actor} topu ta\u015F\u0131yor"
  ],
  // === KARARSIZLIK — pas verilecek yer yok ===
  indecisive: [
    "{actor} topu ald\u0131 ama ne yapaca\u011F\u0131na karar veremiyor",
    "H\xFCcumda karars\u0131zl\u0131k, {actor} pas verecek adam bulam\u0131yor",
    "{team} h\xFCcumda da\u011F\u0131ld\u0131, {actor} topu kurtarmaya \xE7al\u0131\u015F\u0131yor"
  ]
};
var attack_default = ATTACK_TEMPLATES;

// match/commentlib/danger.js
var DANGER_TEMPLATES = {
  // === KRİTİK ANLAR — yüksek gerilim ===
  critical: [
    "KR\u0130T\u0130K AN! {actor} ceza sahas\u0131nda, {team} gol ar\u0131yor!",
    "TEHL\u0130KE! {actor} topu ald\u0131, \u015Fut pozisyonunda!",
    "Ceza sahas\u0131 i\xE7inde kaos! {actor} topu ald\u0131, arkada\u015Flar\u0131 bekliyor",
    "B\xDCY\xDCK AN! {actor} ceza sahas\u0131 \xF6n\xFCnde, son pas\u0131 ar\u0131yor"
  ],
  // === SON PAS ===
  finalPass: [
    "{team} son pas\u0131 yapacak, {actor} arka dire\u011Fe hareketlendi",
    "Pas an\u0131! {actor} ceza sahas\u0131 i\xE7inde, gol pozisyonu",
    "{team} arka dire\u011Fe top g\xF6nderdi, {actor} orada",
    "Son pas! {actor} topu ald\u0131, bir dokunu\u015F yetecek"
  ],
  // === TEHLİKE BÖLGESİ GENEL ===
  zone: [
    "Tehlike b\xF6lgesi! {actor} ceza sahas\u0131na yakla\u015F\u0131yor",
    "{team} son \xE7izgide, {actor} pas ar\u0131yor",
    "Defans\u0131n kalbi! {actor} ceza sahas\u0131 \xF6n\xFCnde",
    "Son metreler! {actor} topu ald\u0131, gol pozisyonu yak\u0131n"
  ],
  // === ŞUT HAZIRLIĞI ===
  shotPrep: [
    "\u015Eut geliyor! {actor} haz\u0131rlan\u0131yor...",
    "Tehlike! Ceza sahas\u0131 \xF6n\xFCnde {actor}, \u015Fut verebilir",
    "{actor} vuru\u015F a\xE7\u0131s\u0131 ar\u0131yor, savunma arkas\u0131na ge\xE7meye \xE7al\u0131\u015F\u0131yor",
    "Vuru\u015F an\u0131! {actor} topu sa\u011F aya\u011F\u0131na ald\u0131"
  ],
  // === CEZA SAHASI İÇİ ===
  inBox: [
    "Ceza sahas\u0131 i\xE7inde {actor}, {team} gol kokuyor",
    "{actor} ceza sahas\u0131nda bombo\u015F, top geliyor!",
    "Alt\u0131pas! {actor} kaleciyle kar\u015F\u0131 kar\u015F\u0131ya pozisyonda",
    "Ceza sahas\u0131 kalabal\u0131k, {actor} arkada bo\u015F"
  ],
  // === GERGİN AN — bekleyiş ===
  tension: [
    "Herkes bekliyor... {actor} ne yapacak?",
    "Trib\xFCnler sus pus, {actor} topu ald\u0131",
    "Bir anl\u0131k sessizlik, {actor} karar\u0131n\u0131 veriyor",
    "Saha kenar\u0131ndan g\xF6zler {actor}'da, herkes bekliyor"
  ]
};
var danger_default = DANGER_TEMPLATES;

// match/commentlib/counter.js
var COUNTER_TEMPLATES = {
  // === KLASİK KONTRA ===
  classic: [
    "KONTRA! {actor} bo\u015F alanda, {team} rakibi yakalad\u0131!",
    "{team} h\u0131zl\u0131 \xE7\u0131kt\u0131! {actor} tek ba\u015F\u0131na ilerliyor",
    "H\u0131zl\u0131 h\xFCcum! {actor} orta sahay\u0131 ge\xE7ti, gol pozisyonuna giriyor",
    "Kontra atak! {actor} rakip savunmay\u0131 yakalad\u0131"
  ],
  // === DERİN KONTRA — kaleci bile dahil ===
  deep: [
    "Derin kontra! {actor} orta sahay\u0131 ge\xE7ti, tek ba\u015F\u0131na ilerliyor",
    "{team} sahas\u0131ndan \xE7\u0131kt\u0131! {actor} ta\u015F\u0131yor, gol ar\u0131yor",
    "Kendi yar\u0131 sahas\u0131ndan kontra! {actor} 50 metre top s\xFCrd\xFC"
  ],
  // === 3'e 2 — sayısal üstünlük ===
  advantage: [
    "{team} say\u0131sal \xFCst\xFCnl\xFCkte! {actor} arkada\u015Flar\u0131na bak\u0131yor",
    "\xDC\xE7e iki! {actor} topu ta\u015F\u0131yor, pas verecek yer var",
    "Rakip dengesiz, {actor} organize h\xFCcum kuruyor"
  ],
  // === SAVUNMA ARKASI KOŞU ===
  run: [
    "Savunma arkas\u0131na ko\u015Fu! {actor} at\u0131yor, top geliyor",
    "{actor} bombo\u015F alana s\u0131zd\u0131, pas uzun geldi",
    "Araya ko\u015Fu! {actor} topu ald\u0131, kaleciyle kar\u015F\u0131 kar\u015F\u0131ya"
  ],
  // === KONTRA BOZULDU — karşı kontra riski ===
  breakdown: [
    "Kontra bozuldu! {actor} topu kaybetti, rakip ge\xE7iyor",
    "H\u0131zl\u0131 \xE7\u0131k\u0131\u015F tutmad\u0131, {actor} son pas\u0131 veremedi"
  ],
  // === ZAMANLAMA — son anda fark edildi ===
  latePass: [
    "Ge\xE7 pas! {actor} yeti\u015Femedi, kontra \u015Fans\u0131 ka\xE7t\u0131",
    "{actor} biraz ge\xE7 kald\u0131, savunma d\xF6nd\xFC"
  ]
};
var counter_default = COUNTER_TEMPLATES;

// match/commentlib/transition.js
var TRANSITION_TEMPLATES = {
  // === TEMEL KAYIP ===
  lost: [
    "Top de\u011Fi\u015Fti! {winner} topu kazand\u0131, {team} kontra \xE7\u0131kmak istiyor",
    "Top kayb\u0131! {winner} araya girdi, {team} yeni bir atak kuracak",
    "Top {winner}'a ge\xE7ti, {team} y\xF6n de\u011Fi\u015Ftirdi",
    "Sahipsiz top {winner}'da, {team} h\xFCcuma kalk\u0131yor"
  ],
  // === ARAYA GİRME (interception) — beklemeden yapıldı ===
  intercept: [
    "ARAYA G\u0130R\u0130\u015E! {winner} topu kesti, {team} h\u0131zl\u0131 \xE7\u0131kacak",
    "{winner} pas\u0131 kesti! Muhte\u015Fem okuma, {team} kontra atakta",
    "Araya top! {winner} refleksle topu ald\u0131",
    "\u0130NTERSEPS\u0130YON! {winner} beyniyle oynad\u0131, top art\u0131k onun"
  ],
  // === MÜDAHALE (tackle) — fiziksel kazanım ===
  tackle: [
    "M\xDCDAHALE! {winner} topu kazand\u0131, sert ama temiz",
    "{winner} rakibini durdurdu! Top art\u0131k bizde",
    "Sert m\xFCdahale, {winner} topu s\xF6kt\xFC ald\u0131",
    "{winner} ayak koydu, topu kapt\u0131!"
  ],
  // === DRIBLING KAYBI (turnover sonrası) ===
  dribbleLoss: [
    "{winner} topu kapt\u0131! {loser} top kaybetti",
    "Dripling ba\u015Far\u0131s\u0131z! {winner} topu s\xF6kt\xFC",
    "{loser} top kaybetti, {winner} ald\u0131 ve ta\u015F\u0131yor"
  ],
  // === PAS KESİLDİ ===
  passIntercept: [
    "{winner} pas\u0131 kesti! Aradaki adam oldu",
    "Araya top! {winner} beklemedi\u011Fi yerde \xE7\u0131kt\u0131",
    "Pas araya gitti, {winner} topu ald\u0131"
  ],
  // === SAHİPSİZ TOP (loose ball) — kimin aldığı net değil ===
  loose: [
    "Sahipsiz top! {team} ve rakip aras\u0131nda, {winner} ald\u0131",
    "Top havada kald\u0131, {winner} kafayla indirdi",
    "\u0130ki tak\u0131m birden u\xE7tu, {winner} \xF6nce davrand\u0131"
  ]
};
var transition_default = TRANSITION_TEMPLATES;

// match/commentlib/critical.js
var CRITICAL_TEMPLATES = {
  // === GOL ===
  goal: {
    early: [
      "GOOOLLL! Erken gol! {scorer} topu a\u011Flarla bulu\u015Fturdu, {result}",
      "GOOOLLL! Ma\xE7\u0131n ba\u015F\u0131nda {scorer} sahneye \xE7\u0131kt\u0131, {result}"
    ],
    normal: [
      "GOOOLLL! {scorer} topu a\u011Flarla bulu\u015Fturdu, {result}",
      "GOOOOL! {scorer} fileleri sarst\u0131, {result}",
      "GOOOL! {scorer} att\u0131, {result}!"
    ],
    drought: [
      "GOOOOOL! {scorer} uzun bir aradan sonra gol\xFC buldu, {result}",
      "Nihayet GOL! {scorer} suskunlu\u011Funu bozdu, {result}"
    ],
    equalizer: [
      "GOOOL! {scorer} e\u015Fitledi! Skor art\u0131k {score}",
      "E\u015E\u0130TLEME! {scorer} son anda gol\xFC att\u0131, {result}"
    ],
    winner: [
      "GOOOOOL! {scorer} galibiyet gol\xFCn\xFC att\u0131! {result}",
      "M\xFCthi\u015F gol! {scorer} tak\u0131m\u0131n\u0131 \xF6ne ge\xE7irdi, {result}"
    ]
  },
  // === KART — sarı ===
  yellow: [
    "SARI KART! {actor} faul\xFCyle hakemi ikna edemedi",
    "\u{1F7E8} {actor} sar\u0131 kart g\xF6rd\xFC! Bir sonraki faulde \xE7ift sar\u0131",
    "Sar\u0131 kart \xE7\u0131kt\u0131, {actor} s\u0131n\u0131rda",
    "Hakem {actor}'a kart\u0131n\u0131 g\xF6sterdi!"
  ],
  // === KART — kırmızı ===
  red: [
    "KIRMIZI KART! {actor} oyun d\u0131\u015F\u0131, {team} sahada 10 ki\u015Fi!",
    "\u{1F7E5} {actor} ikinci sar\u0131dan at\u0131ld\u0131! B\xFCy\xFCk kay\u0131p",
    "K\u0131rm\u0131z\u0131! {actor} oyundan at\u0131ld\u0131, {team} zor durumda"
  ],
  // === KORNER ===
  corner: [
    "KORNER! {team} ceza sahas\u0131na g\xF6nderiyor, savunma temizlemeye \xE7al\u0131\u015Facak",
    "Korner vuru\u015Fu, {team} topu ceza sahas\u0131na ta\u015F\u0131yor",
    "K\xF6\u015Fe vuru\u015Fu! {team} i\xE7in gol f\u0131rsat\u0131"
  ],
  // === ŞUT VE KURTARIŞ ===
  shotSaved: [
    "\u015EUT ve KURTARI\u015E! {actor} vurdu, kaleci {keeper} \xE7\u0131kard\u0131!",
    "B\xDCY\xDCK KURTARI\u015E! Kaleci {keeper} {actor}'\u0131n \u015Futunu \xE7eldi!",
    "{actor} \u015Futunu \xE7ekti, kaleci {keeper} muhte\u015Fem \xE7\u0131kard\u0131!",
    "Kaleci {keeper} devle\u015Fti! {actor}'\u0131n \u015Futunu kornere \xE7eldi"
  ],
  // === ŞUT KAÇTI ===
  shotMiss: [
    "\u015EUT! {actor} denedi ama {direction} auta gitti!",
    "\u015Eut auta! {actor} skoru ka\xE7\u0131rd\u0131",
    "{actor} vurdu, top {direction} gitti",
    "\u0130sabetsiz \u015Fut! {actor} pozisyonu harc\u0131yor"
  ],
  // === ORTA (cross) ===
  cross: [
    "ORTA! {actor} ceza sahas\u0131na g\xF6nderdi, {target} kafayla vuracak",
    "Orta geldi! {actor} arka dire\u011Fe top g\xF6nderdi"
  ]
};
var critical_default = CRITICAL_TEMPLATES;

// match/commentlib/motivation.js
var MOTIVATION_TEMPLATES = {
  // === GOL SONRASI TAKIM TEPKİSİ ===
  goalReaction: {
    // Gol atan takım — coşku
    scoring: [
      "{team} gol att\u0131! Oyuncular birbirine sar\u0131ld\u0131, moral tavan",
      "GOL! {team} rahatlad\u0131, trib\xFCnler \xE7\u0131lg\u0131na d\xF6nd\xFC",
      "{team} a\u011Flar\u0131 sarst\u0131, oyuncular kutlamada",
      "GOOL! {team} gol\xFC buldu, moral yerine geldi",
      "Gol geldi! {team} oyuncular\u0131 sevin\xE7ten deliye d\xF6nd\xFC"
    ],
    // Gol yiyen takım — yıkım
    conceding: [
      "{team} gol yedi! Oyuncular birbirine bakt\u0131, moraller bozuk",
      "Gol... {team} y\u0131k\u0131ld\u0131, oyuncular ba\u015Flar\u0131n\u0131 e\u011Fdi",
      "{team} gol\xFC yedi, savunma hatas\u0131 moral bozdu",
      "Yedi\u011Fimiz gol {team}'i sarst\u0131, oyuncular yorgun",
      "{team} gol\xFC kalesinde g\xF6rd\xFC, moral dibe vurdu"
    ]
  },
  // === GERİDE KALAN TAKIM — PANİK ===
  behind: [
    "{team} geride, dakikalar azal\u0131yor, panik ba\u015Flad\u0131",
    "{team} gol ar\u0131yor ama bulam\u0131yor, sinirler gergin",
    "Geride kalan {team}, oyuncular birbirine ba\u011F\u0131r\u0131yor",
    "{team} 80+ dakikada geride, \xE7areler t\xFCkeniyor",
    "Son dakikalar, {team} ne yapaca\u011F\u0131n\u0131 bilemiyor"
  ],
  // === ÖNDE OLAN TAKIM — RAHATLAMA ===
  ahead: [
    "{team} \xF6nde, oyuncular rahat, top \xE7eviriyorlar",
    "{team} kontrol\xFC elinde, dakikalar eriyor",
    "Lider {team}, skoru koruyor, oyunu so\u011Futuyor",
    "{team} fark\u0131 korumaya \xE7al\u0131\u015F\u0131yor, savunma sa\u011Flam"
  ],
  // === BERABERLİK ===
  draw: [
    "Skor berabere, iki tak\u0131m da kazanmak istiyor",
    "Beraberlik devam ediyor, kazanan\u0131 son dakikalar belirleyecek",
    "E\u015Fitlik bozulmad\u0131, heyecan dorukta"
  ],
  // === KIRMIZI KART SONRASI ===
  redAftermath: {
    // Kart yiyen takım — dezavantaj
    losing: [
      "{team} 10 ki\u015Fi kald\u0131! Oyuncular birbirine bakt\u0131, i\u015Fimiz zor",
      "10 ki\u015Fiyle devam! {team} oyuncular\u0131 moralsiz",
      "At\u0131lma! {team} zor durumda, sahada eksik",
      "{team} sahada 10 ki\u015Fi, oyuncular yorgunluk ve stres alt\u0131nda"
    ],
    // Kart yiyen oyuncunun tepkisi
    player: [
      "{actor} sahay\u0131 terk etti, y\xFCz\xFC as\u0131k",
      "{actor} oyun d\u0131\u015F\u0131, soyunma odas\u0131na y\xFCr\xFCd\xFC",
      "K\u0131rm\u0131z\u0131! {actor} hakeme itiraz ediyor ama karar de\u011Fi\u015Fmiyor"
    ]
  },
  // === SAKATLIK ===
  injury: {
    // Hafif sakatlık — oyuncu kalkar
    light: [
      "{actor} bir an yerde kald\u0131, ama kalkt\u0131, devam ediyor",
      "{actor} hafif sakatl\u0131k ge\xE7irdi, sa\u011Fl\u0131k ekibi m\xFCdahale etti",
      "M\xFCcadele sonucu {actor} yere d\xFC\u015Ft\xFC ama aya\u011Fa kalkt\u0131"
    ],
    // Orta — şüpheli
    medium: [
      "{actor} yerde kald\u0131, sa\u011Fl\u0131k ekibi sahaya girdi",
      "Dizinden sakatlanan {actor} oyuna devam edemiyor",
      "{actor} kas\u0131n\u0131 tuttu, oyun durdu, tedavi s\xFCr\xFCyor"
    ],
    // Ağır — oyuncu çıkar
    heavy: [
      "{actor} a\u011F\u0131r sakatl\u0131k! Sedye ile sahadan \xE7\u0131kar\u0131ld\u0131",
      "Sakatl\u0131k ciddi! {actor} oyunu tamamlayamad\u0131",
      "{actor} ac\u0131 i\xE7inde yerde kald\u0131, de\u011Fi\u015Fiklik yap\u0131l\u0131yor"
    ],
    // Genel
    generic: [
      "{actor} sakatl\u0131k ge\xE7irdi, oyun durdu",
      "Sa\u011Fl\u0131k ekibi sahada, {actor} tedavi alt\u0131nda",
      "{actor} oyuna devam edemiyor, de\u011Fi\u015Fiklik zorunlu"
    ]
  },
  // === SARI KART SONRASI ===
  yellowCaution: [
    "{actor} dikkatli olmal\u0131, bir sar\u0131 kart daha k\u0131rm\u0131z\u0131 demek",
    "{actor} s\u0131n\u0131rda, bir sonraki faulde \xE7ift sar\u0131 riski",
    "Hakem {actor}'a uyar\u0131da bulundu, dikkat etmeli"
  ],
  // === MORAL YÜKSEK ===
  moraleHigh: [
    "{team} moral tavan! Oyuncular\u0131n g\xF6zleri parl\u0131yor",
    "{team} oyunu domine ediyor, \xF6zg\xFCven patlad\u0131",
    "Moral yerinde! {team} pasla\u015Fmadan keyif al\u0131yor"
  ],
  // === MORAL DÜŞÜK ===
  moraleLow: [
    "{team} moralsiz, paslar isabetsiz, hatalar art\u0131yor",
    "{team} oyuncular\u0131 ba\u015Flar\u0131n\u0131 e\u011Fdi, durum k\xF6t\xFC",
    "Moral dibe vurdu! {team} oyunu b\u0131rakmak \xFCzere"
  ],
  // === YORGUN OYUNCU ===
  tired: [
    "{actor} yorgun, ayaklar\u0131 a\u011F\u0131rla\u015Ft\u0131",
    "{actor} son dakikalar\u0131 zor \xE7\u0131kar\u0131yor, kramp girmek \xFCzere",
    "Yorgunluk! {actor} ko\u015Fam\u0131yor, savunma arkas\u0131na ge\xE7emiyor"
  ],
  // === 10 KİŞİYLE OYNAMA ===
  downToTen: [
    "{team} sahada 10 ki\u015Fi, her pozisyonda adam eksik",
    "10 ki\u015Fiyle savunma! {team} geri \xE7ekildi",
    "{team} oyunu tutmaya \xE7al\u0131\u015F\u0131yor ama adam eksik"
  ],
  // === OYUNCU DEĞİŞİKLİĞİ ===
  substitution: {
    // Çıkan oyuncu
    goingOut: [
      "{out} kenara geldi, yerini {in}'e b\u0131rak\u0131yor",
      "{out} formas\u0131n\u0131 {in}'e veriyor, oyun d\u0131\u015F\u0131",
      "De\u011Fi\u015Fiklik! {out} yoruldu, {in} sahaya giriyor"
    ],
    // Giren oyuncu
    comingIn: [
      "{in} sahaya ad\u0131m att\u0131, taze g\xFC\xE7 geldi",
      "{in} oyuna girdi, {team} yeni bir silah kazand\u0131",
      "Yedek kul\xFCbesinden {in} geldi, performans g\xF6stermek istiyor"
    ],
    // Sakatlık değişikliği
    injury: [
      "Sakatl\u0131ktan dolay\u0131 {out} \xE7\u0131kmak zorunda, {in} sahaya giriyor",
      "{out} sakatl\u0131\u011F\u0131 nedeniyle oyunu tamamlayamad\u0131, {in} g\xF6rev ba\u015F\u0131nda"
    ],
    // Taktik değişiklik
    tactical: [
      "Taktik de\u011Fi\u015Fiklik! Menajer {out} \xE7\u0131kard\u0131, {in} ile farkl\u0131 bir sistem deniyor",
      "{team} oyunu de\u011Fi\u015Ftirmek istiyor, {out} yerine {in}"
    ]
  }
};
var motivation_default = MOTIVATION_TEMPLATES;

// match/commentlib/index.js
var REGISTRY = {
  build_up: build_up_default,
  midfield: midfield_default,
  attack: attack_default,
  danger: danger_default,
  counter: counter_default,
  transition: transition_default,
  critical: critical_default,
  motivation: motivation_default
};
function resolve(key) {
  if (!key) return null;
  const parts = key.split(".");
  let current = REGISTRY[parts[0]];
  if (!current) return null;
  for (let i = 1; i < parts.length; i++) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = current[parts[i]];
    } else {
      return null;
    }
  }
  return current;
}
var lastPicks = /* @__PURE__ */ new Map();
var MAX_RECENT = 3;
function pick(key) {
  const arr = resolve(key);
  if (!arr) return null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  const recent = lastPicks.get(key) || [];
  let candidates = arr;
  if (recent.length > 0 && arr.length > recent.length) {
    candidates = arr.filter((t) => !recent.includes(t));
    if (candidates.length === 0) candidates = arr;
  }
  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  const newRecent = [choice, ...recent].slice(0, MAX_RECENT);
  lastPicks.set(key, newRecent);
  return choice;
}
function pickOne(keys2) {
  if (!Array.isArray(keys2) || keys2.length === 0) return null;
  const valid = keys2.filter((k) => {
    const arr = resolve(k);
    return Array.isArray(arr) && arr.length > 0;
  });
  if (valid.length === 0) return null;
  const key = valid[Math.floor(Math.random() * valid.length)];
  return { key, template: pick(key) };
}
function fillTemplate(tpl, vars = {}) {
  if (!tpl) return "";
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === void 0 || v === null ? `{${key}}` : v;
  });
}
function getComment(key, vars = {}) {
  const tpl = pick(key);
  if (!tpl) return null;
  return fillTemplate(tpl, vars);
}
function keys() {
  return Object.keys(REGISTRY);
}
function all() {
  return REGISTRY;
}
function stats() {
  const out = {};
  function count(obj, prefix = "") {
    for (const k in obj) {
      const v = obj[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        out[key] = v.length;
      } else if (typeof v === "object" && v !== null) {
        count(v, key);
      }
    }
  }
  for (const cat in REGISTRY) count(REGISTRY[cat], cat);
  return out;
}

// match/narrator.js
function attackingZone(x, side) {
  const norm = side === "home" ? x : 100 - x;
  if (norm < 35) return "DEFANS_CIKIS";
  if (norm < 65) return "ORTA_SAHA";
  if (norm < 84) return "HUCUM_ORG";
  return "TEHLIKE";
}
function directionText(y) {
  if (y < 23) return "sol kanattan";
  if (y > 47) return "sa\u011F kanattan";
  return "ortadan";
}
function getPlayerName(match, side, id) {
  if (!id) return null;
  const team = match[side];
  if (!team) return null;
  const p = team.players?.find((x) => x.id === id || x.name === id);
  if (!p) return null;
  return p.name;
}
function fill(tpl, vars) {
  if (!tpl) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === void 0 || v === null ? `{${key}}` : v;
  });
}
var SequenceTracker = class {
  constructor() {
    this.current = null;
    this.history = [];
    this.maxHistory = 8;
  }
  push(events, match) {
    if (!events) return;
    for (const ev of events) this._pushOne(ev, match);
  }
  _pushOne(ev, match) {
    if (ev.type === "out_of_play" || ev.type === "fail" || ev.type === "kickoff") {
      this._closeCurrent(match);
      return;
    }
    const ball = match.ballPos;
    const side = match.ballSide;
    const minute = ev.minute ?? match.minute;
    const seqType = this._detectSequenceType(ev, match);
    const zone = attackingZone(ball.x, side);
    if (this._isCritical(ev)) {
      this._closeCurrent(match);
      this._openNew(seqType, side, minute, ev, match);
      return;
    }
    if (ev.type === "turnover" || ev.type === "tackle_won") {
      this._closeCurrent(match);
      this._openNew("transition", ev.side, minute, ev, match);
      return;
    }
    if (!this.current) {
      this._openNew(seqType, side, minute, ev, match);
    } else {
      if (this.current.side === side && minute - this.current.lastMinute <= 2) {
        this._extendCurrent(ev, side, minute, zone, match);
      } else {
        this._closeCurrent(match);
        this._openNew(seqType, side, minute, ev, match);
      }
    }
  }
  _detectSequenceType(ev, match) {
    if (this.current?.type === "transition" && this.current.eventCount <= 1) {
      return "counter";
    }
    const ball = match.ballPos;
    const side = match.ballSide;
    const zone = attackingZone(ball.x, side);
    if (zone === "DEFANS_CIKIS") return "build_up";
    if (zone === "ORTA_SAHA") return "midfield";
    if (zone === "HUCUM_ORG") return "attack";
    return "danger";
  }
  _isCritical(ev) {
    return ["goal", "yellow_card", "red_card", "corner"].includes(ev.type) || ev.type === "pass_success" && ev.distance > 35;
  }
  _openNew(type, side, minute, ev, match) {
    this.current = {
      type,
      side,
      startMinute: minute,
      lastMinute: minute,
      eventCount: 1,
      startZone: attackingZone(match.ballPos.x, side),
      startBallPos: { ...match.ballPos },
      events: [ev],
      actors: /* @__PURE__ */ new Set(),
      progressive: 0
    };
    if (ev.actor) this.current.actors.add(ev.actor);
    if (ev.target) this.current.actors.add(ev.target);
  }
  _extendCurrent(ev, side, minute, zone, match) {
    const seq = this.current;
    seq.lastMinute = minute;
    seq.eventCount++;
    seq.events.push(ev);
    if (ev.actor) seq.actors.add(ev.actor);
    if (ev.target) seq.actors.add(ev.target);
    if (ev.x !== void 0) {
      const forward = side === "home" ? ev.x - seq.startBallPos.x : seq.startBallPos.x - ev.x;
      if (forward > seq.progressive) seq.progressive = forward;
    }
    if (zone === "TEHLIKE" && seq.type !== "danger") seq.type = "danger";
    else if (zone === "HUCUM_ORG" && seq.type === "build_up") seq.type = "attack";
    else if (zone === "ORTA_SAHA" && seq.type === "build_up") seq.type = "midfield";
  }
  _closeCurrent() {
    if (this.current) {
      this.history.push({ ...this.current });
      if (this.history.length > this.maxHistory) this.history.shift();
      this.current = null;
    }
  }
};
var Narrator = class {
  constructor(match) {
    this.match = match;
    this.tracker = new SequenceTracker();
    this.lastNarrativeMinute = -1;
    this.lastTransitionMinute = -100;
    this.lastGoalMinute = -100;
  }
  // Yeni simülasyon event(ler)i geldi → narrative cümlesi üret
  narrate(events) {
    if (!events || events.length === 0) return null;
    const out = [];
    for (const ev of events) {
      const text = this._narrateEvent(ev);
      if (text) out.push(text);
    }
    if (out.length === 0) return null;
    return out.length === 1 ? out[0] : out.join(" ");
  }
  _recentTransitionCooldown() {
    return this.match.minute - this.lastTransitionMinute < 2;
  }
  _markTransition() {
    this.lastTransitionMinute = this.match.minute;
  }
  _narrateEvent(ev) {
    if (ev.type === "goal") return this._narrateGoal(ev);
    if (ev.type === "yellow_card" || ev.type === "red_card") return this._narrateCard(ev);
    if (ev.type === "corner") return this._narrateCorner(ev);
    if (ev.type === "injury") return this._narrateInjury(ev);
    if (ev.type === "substitution") return this._narrateSubstitution(ev);
    if (ev.type === "out_of_play" && (ev.reason === "sut_isabetsiz" || ev.reason === "kaleciKurtardi")) {
      return this._narrateShot(ev);
    }
    if (ev.type === "pass_success") {
      const seq = this.tracker.current;
      if (seq && seq.type === "danger" && seq.eventCount >= 3) {
        const actor = this._nameOf(ev.side, ev.actor);
        const target = this._nameOf(ev.side, ev.target);
        if (actor && target) {
          return `${ev.minute}' ${actor} son pas\u0131 verdi \u2014 ${target} ald\u0131!`;
        }
      }
      return null;
    }
    if (ev.type === "turnover" || ev.type === "tackle_won") {
      return this._narrateTransition(ev);
    }
    return null;
  }
  _narrateSubstitution(ev) {
    const team = this._teamName(ev.side);
    const out = this._nameOf(ev.side, ev.actor);
    const inP = this._nameOf(ev.side, ev.target);
    if (!out || !inP) return null;
    let key = "motivation.substitution.goingOut";
    if (ev.reason === "Sakatl\u0131k") key = "motivation.substitution.injury";
    else if (ev.reason === "Taktik de\u011Fi\u015Fiklik") key = "motivation.substitution.tactical";
    else if (ev.out) key = "motivation.substitution.goingOut";
    const tpl = pick(key);
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { out, in: inP, team });
  }
  _narrateInjury(ev) {
    const actor = this._nameOf(ev.side, ev.actor);
    if (!actor) return null;
    const severity = ev.severity || "medium";
    const key = `motivation.injury.${severity}`;
    const tpl = pick(key);
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { actor, team: this._teamName(ev.side) });
  }
  // === GOL ===
  _narrateGoal(ev) {
    const team = this._teamName(ev.side);
    const scorer = this._nameOf(ev.side, ev.scorer);
    if (!scorer) return null;
    const assist = ev.assist ? this._nameOf(ev.side, ev.assist) : null;
    const minute = ev.minute;
    const home = this.match.homeScore;
    const away = this.match.awayScore;
    const sideScore = ev.side === "home" ? home : away;
    const oppScore = ev.side === "home" ? away : home;
    const diff = sideScore - oppScore;
    let result;
    if (diff === 1) {
      result = oppScore === 0 ? `${team} ma\xE7ta \xF6ne ge\xE7ti!` : `${team} \xF6ne ge\xE7ti!`;
    } else if (diff === 0) {
      result = `${team} e\u015Fitledi!`;
    } else if (diff > 1) {
      result = `${team} fark\u0131 ${diff}'e \xE7\u0131kard\u0131!`;
    } else {
      result = `${team} fark\u0131 kapatt\u0131!`;
    }
    let key = "critical.goal.normal";
    if (minute < 15) key = "critical.goal.early";
    if (minute - this.lastGoalMinute > 25) key = "critical.goal.drought";
    if (diff === 0 && oppScore > 0) key = "critical.goal.equalizer";
    if (diff === 1 && minute > 80) key = "critical.goal.winner";
    const tpl = pick(key);
    if (!tpl) return null;
    this.lastGoalMinute = minute;
    let text = fill(tpl, { scorer, team, result, score: `${home}-${away}` });
    if (assist) text += ` Asist: ${assist}.`;
    return `${minute}' ${text}`;
  }
  _narrateCard(ev) {
    const team = this._teamName(ev.side);
    const actor = this._nameOf(ev.side, ev.actor);
    if (!actor) return null;
    const key = ev.type === "red_card" ? "critical.red" : "critical.yellow";
    const tpl = pick(key);
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { actor, team });
  }
  _narrateCorner(ev) {
    const team = this._teamName(ev.side);
    const tpl = pick("critical.corner");
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { team });
  }
  _narrateShot(ev) {
    const minute = ev.minute ?? this.match.minute;
    const side = ev.side ?? this.match.ballSide;
    const id = ev.actor || ev.scorer;
    if (!id) return null;
    const actor = this._nameOf(side, id);
    if (!actor) return null;
    if (ev.reason === "sut_isabetsiz") {
      const direction = this.match.ballPos.y < 35 ? "yandan" : "\xFCstten";
      const tpl = pick("critical.shotMiss");
      if (!tpl) return null;
      return `${minute}' ` + fill(tpl, { actor, direction });
    }
    if (ev.reason === "kaleciKurtardi") {
      const keeperSide = side === "home" ? "away" : "home";
      const keeper = this.match[keeperSide]?.players?.find((p) => p.position === "GK");
      const tpl = pick("critical.shotSaved");
      if (!tpl) return null;
      return `${minute}' ` + fill(tpl, { actor, keeper: keeper?.name || "kaleci" });
    }
    return null;
  }
  _narrateTransition(ev) {
    if (this._recentTransitionCooldown()) return null;
    const team = this._teamName(ev.side);
    const rawId = ev.actor || ev.target;
    if (!rawId) return null;
    const winner = this._nameOf(ev.side, rawId);
    if (!winner) return null;
    let key = "transition.lost";
    if (ev.reason === "pas_kesildi" || ev.text?.includes("kesti")) key = "transition.intercept";
    else if (ev.type === "tackle_won" || ev.reason === "m\xFCdahale") key = "transition.tackle";
    else if (ev.reason === "dripling_kayip") key = "transition.dribbleLoss";
    const tpl = pick(key);
    if (!tpl) return null;
    this._markTransition();
    return `${ev.minute}' ` + fill(tpl, { team, winner, loser: ev.loser ? this._nameOf(ev.side === "home" ? "away" : "home", ev.loser) : "oyuncu" });
  }
  // === SEKANS OLGUNLAŞMA ===
  flushSequence() {
    const seq = this.tracker.current;
    if (!seq || seq.eventCount < 2) {
      this.tracker._closeCurrent();
      return null;
    }
    if (seq.type === "transition") {
      this.tracker._closeCurrent();
      return null;
    }
    const text = this._generateSequenceText(seq);
    this.tracker._closeCurrent();
    return text;
  }
  _generateSequenceText(seq) {
    const team = this._teamName(seq.side);
    const firstActor = this._firstActorName(seq);
    const lastActor = this._lastActorName(seq);
    const direction = directionText(this.match.ballPos.y);
    const minute = seq.startMinute;
    const passes = seq.eventCount;
    if (seq.type === "counter") {
      if (!firstActor) return null;
      const { template } = pickOne(["counter.classic", "counter.deep", "counter.advantage", "counter.run"]);
      if (!template) return null;
      return `${minute}' ` + fill(template, { team, actor: firstActor, direction });
    }
    if (seq.type === "build_up") {
      const { template } = pickOne(["build_up.normal", "build_up.slow", "build_up.fast"]);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        direction
      });
    }
    if (seq.type === "midfield") {
      const { template } = pickOne(["midfield.tempo", "midfield.shortPasses", "midfield.progressing"]);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        passes
      });
    }
    if (seq.type === "attack") {
      let key;
      if (this.match.ballPos.y < 23) key = "attack.left";
      else if (this.match.ballPos.y > 47) key = "attack.right";
      else key = "attack.center";
      const { template } = pickOne([key, "attack.build", "attack.finalBall"]);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        direction
      });
    }
    if (seq.type === "danger") {
      const { template } = pickOne(["danger.critical", "danger.finalPass", "danger.zone", "danger.shotPrep", "danger.inBox"]);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor
      });
    }
    return null;
  }
  // === YARDIMCILAR ===
  _firstActorName(seq) {
    const first = seq.events[0];
    if (!first) return null;
    if (first.actor) return this._nameOf(seq.side, first.actor);
    return null;
  }
  _lastActorName(seq) {
    const last = seq.events[seq.events.length - 1];
    if (!last) return null;
    const id = last.target || last.actor;
    if (id) return this._nameOf(seq.side, id);
    return null;
  }
  _nameOf(side, id) {
    return getPlayerName(this.match, side, id);
  }
  _teamName(side) {
    return this.match[side]?.name || (side === "home" ? "Ev sahibi" : "Deplasman");
  }
  recentSequences(n = 3) {
    return this.tracker.history.slice(-n);
  }
};
function createNarrator(match) {
  return new Narrator(match);
}

// match/motivation.js
var MotivationEngine = class {
  constructor(match) {
    this.match = match;
    this.recentEvents = [];
    this.maxRecent = 12;
    this.minute = 0;
  }
  // === HER DAKİKA ÇAĞRILIR (simulateMinute içinde) ===
  tick() {
    this.minute = this.match.minute;
    this._applyMoraleDrift();
    this._checkInjuries();
    this._updateMomentum();
  }
  // === KART VERİLDİĞİNDE ===
  // type: 'yellow' | 'red' | 'second_yellow'
  // Dönüş: { event, narrative }
  giveCard(side, playerId, type = "yellow") {
    const player = this._player(side, playerId);
    if (!player) return null;
    player.live = player.live || {};
    player.live.yellowCount = player.live.yellowCount || 0;
    player.live.redCard = player.live.redCard || false;
    const event = {
      minute: this.minute,
      type: "yellow_card",
      side,
      actor: playerId,
      text: ""
    };
    if (type === "red") {
      player.live.redCard = true;
      player.onField = false;
      this.match.stats.redCards[side]++;
      event.type = "red_card";
      event.text = `${this.minute}' \u{1F7E5} ${player.name} direkt k\u0131rm\u0131z\u0131 kart! Oyun d\u0131\u015F\u0131.`;
      this._pushRecent(event);
      this._broadcastMorale(side, -5, "10 ki\u015Fi kald\u0131k!");
      return { event, kind: "red_direct" };
    }
    if (type === "second_yellow") {
      player.live.yellowCount = (player.live.yellowCount || 0) + 1;
      player.live.redCard = true;
      player.onField = false;
      this.match.stats.redCards[side]++;
      event.type = "red_card";
      event.text = `${this.minute}' \u{1F7E5} ${player.name} ikinci sar\u0131dan at\u0131ld\u0131!`;
      this._pushRecent(event);
      this._broadcastMorale(side, -8, "\u0130kinci sar\u0131! 10 ki\u015Fi kald\u0131k");
      return { event, kind: "red_second_yellow" };
    }
    player.live.yellowCount = (player.live.yellowCount || 0) + 1;
    this.match.stats.yellowCards[side]++;
    event.text = `${this.minute}' \u{1F7E8} ${player.name} sar\u0131 kart g\xF6rd\xFC.`;
    if (player.live.yellowCount >= 2) {
      return this.giveCard(side, playerId, "second_yellow");
    }
    this._pushRecent(event);
    return { event, kind: "yellow" };
  }
  // === SAKATLIK KONTROLÜ ===
  // Şu an saha üzerindeki tüm oyuncular için stamina bazlı + faul sonrası kontrol.
  _checkInjuries() {
    for (const side of ["home", "away"]) {
      const team = this.match[side];
      if (!team?.players) continue;
      for (const p of team.players) {
        if (!p.onField) continue;
        p.live = p.live || {};
        const stamina = p.live.currentStamina ?? 100;
        if (stamina < 15 && Math.random() < 0.01) {
          this._injurePlayer(side, p, "yorgunluk", "light");
          continue;
        }
        if (stamina < 30 && Math.random() < 2e-3) {
          this._injurePlayer(side, p, "kas gerilmesi", "light");
        }
        if (stamina < 8 && Math.random() < 0.02) {
          this._injurePlayer(side, p, "kas y\u0131rt\u0131\u011F\u0131", "medium");
        }
      }
    }
  }
  // Dışarıdan çağrı: belirli bir oyuncuyu sakatlık olarak işaretle
  // (sert faul sonrası vs.)
  triggerInjury(side, playerId, reason = "m\xFCcadele sakatl\u0131\u011F\u0131", severity = "light") {
    const p = this._player(side, playerId);
    if (!p || !p.onField) return null;
    return this._injurePlayer(side, p, reason, severity);
  }
  // === HARİCİ SAKATLIK TETİKLEME (sert faul sonrası) ===
  // Dönüş: { event, injury } veya null
  tryInjuryFromFoul(side, playerId, severity = "light") {
    const player = this._player(side, playerId);
    if (!player || !player.onField) return null;
    if (Math.random() < 0.04) {
      return this._injurePlayer(side, player, "sert faul", severity);
    }
    return null;
  }
  _injurePlayer(side, player, reason, severity = "light") {
    const durationMap = { light: 1, medium: 3, heavy: 6 };
    const weeks = durationMap[severity] || 1;
    player.live.injured = true;
    player.live.injuryWeeks = weeks;
    player.live.injuryReason = reason;
    player.live.injuredThisTick = true;
    player.onField = false;
    const event = {
      minute: this.minute,
      type: "injury",
      side,
      actor: player.id,
      severity,
      text: `${this.minute}' \u{1F3E5} ${player.name} sakatland\u0131 (${reason}). Oyun d\u0131\u015F\u0131, ~${weeks} hafta.`
    };
    this._pushRecent(event);
    this._broadcastMorale(side, -3, `${player.name} sakatland\u0131`);
    let subEvent = null;
    if (this.match.substitution) {
      if (this.match.substitution.autoSubs) {
        const subResult = this.match.substitution._trySubstitute(
          side,
          player,
          "Sakatl\u0131k",
          "Sakatl\u0131ktan dolay\u0131 \xE7\u0131kt\u0131"
        );
        if (subResult?.event) {
          subEvent = subResult.event;
          this._pushRecent(subEvent);
        }
      } else {
        if (this.match.substitution.onInjury) {
          this.match.substitution.onInjury(side, player);
        }
      }
    }
    return { event, injury: { severity, weeks, reason }, substitution: subEvent };
  }
  // === MORAL DRİFT ===
  // Her dakika skora göre morale değişimi
  _applyMoraleDrift() {
    const home = this.match.homeScore;
    const away = this.match.awayScore;
    const minute = this.minute;
    if (minute > 75) {
      const homeBehind = home < away;
      const awayBehind = away < home;
      if (homeBehind) this._teamMoraleDrift("home", -2);
      if (awayBehind) this._teamMoraleDrift("away", -2);
      if (home > away) this._teamMoraleDrift("home", 1);
      if (away > home) this._teamMoraleDrift("away", 1);
    }
    const homeOnField = this.match.home.players.filter((p) => p.onField).length;
    const awayOnField = this.match.away.players.filter((p) => p.onField).length;
    if (homeOnField < 11) this._teamMoraleDrift("home", -3);
    if (awayOnField < 11) this._teamMoraleDrift("away", -3);
    for (const side of ["home", "away"]) {
      for (const p of this.match[side].players) {
        if (p.live) {
          p.live.currentMorale = Math.max(10, Math.min(100, p.live.currentMorale ?? 60));
        }
      }
    }
  }
  _teamMoraleDrift(side, amount) {
    for (const p of this.match[side].players) {
      if (p.live && p.onField) {
        p.live.currentMorale = (p.live.currentMorale ?? 60) + amount;
      }
    }
  }
  // === GOL → MORAL DEĞİŞİMİ ===
  // events.js'den çağrılır
  onGoal(side) {
    this._teamMoraleDrift(side, 8);
    const opp = side === "home" ? "away" : "home";
    this._teamMoraleDrift(opp, -5);
  }
  // === SERT FAUL → TAKIM MORALE (takım arkadaşlarını) ===
  _broadcastMorale(side, amount, _reason) {
    this._teamMoraleDrift(side, amount);
  }
  // === MOMENTUM HESABI ===
  // Top kontrolü + moral farkı + son olaylar
  _updateMomentum() {
    const home = this.match.stats.possession.home;
    const away = this.match.stats.possession.away;
    const total = home + away || 1;
    const possessionFactor = home / total;
    const homeMorale = this._avgMorale("home");
    const awayMorale = this._avgMorale("away");
    const moraleFactor2 = (homeMorale - awayMorale + 100) / 200;
    const recentCritical = this.recentEvents.filter(
      (e) => e.minute >= this.minute - 5 && ["goal", "yellow_card", "red_card"].includes(e.type)
    );
    let eventFactor = 0.5;
    for (const e of recentCritical) {
      if (e.type === "goal") eventFactor += e.side === "home" ? 0.1 : -0.1;
      if (e.type === "red_card") eventFactor += e.side === "home" ? -0.1 : 0.1;
    }
    eventFactor = Math.max(0, Math.min(1, eventFactor));
    this.match.momentum = possessionFactor * 0.5 + moraleFactor2 * 0.3 + eventFactor * 0.2;
  }
  _avgMorale(side) {
    const team = this.match[side];
    if (!team?.players) return 60;
    const onField = team.players.filter((p) => p.onField);
    if (!onField.length) return 60;
    const sum = onField.reduce((s, p) => s + (p.live?.currentMorale ?? 60), 0);
    return sum / onField.length;
  }
  // === OYUNCU DURUMU ===
  // UI için: { id, name, stamina, morale, yellow, injured, status }
  getPlayerStatus(side, playerId) {
    const p = this._player(side, playerId);
    if (!p) return null;
    const live = p.live || {};
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      stamina: Math.round(live.currentStamina ?? 100),
      morale: Math.round(live.currentMorale ?? 60),
      yellowCount: live.yellowCount || 0,
      redCard: live.redCard || false,
      injured: live.injured || false,
      injuryReason: live.injuryReason || null,
      onField: p.onField,
      goals: live.goals || 0,
      shots: live.shots || 0
    };
  }
  getTeamStatus(side) {
    const team = this.match[side];
    if (!team?.players) return null;
    return {
      name: team.name,
      onField: team.players.filter((p) => p.onField).length,
      avgMorale: Math.round(this._avgMorale(side)),
      avgStamina: Math.round(team.players.filter((p) => p.onField).reduce((s, p) => s + (p.live?.currentStamina ?? 100), 0) / Math.max(1, team.players.filter((p) => p.onField).length)),
      injuries: team.players.filter((p) => p.live?.injured).map((p) => p.name),
      yellows: team.players.filter((p) => (p.live?.yellowCount || 0) > 0).map((p) => ({
        name: p.name,
        count: p.live.yellowCount
      })),
      reds: team.players.filter((p) => p.live?.redCard).map((p) => p.name)
    };
  }
  // === YARDIMCILAR ===
  _player(side, id) {
    return this.match[side]?.players?.find((p) => p.id === id || p.name === id) || null;
  }
  _pushRecent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecent) this.recentEvents.shift();
  }
};
function createMotivation(match) {
  return new MotivationEngine(match);
}

// match/substitution.js
var MAX_SUBSTITUTIONS = 3;
var STAMINA_AUTO_SUB = 20;
var MIN_MINUTE_FOR_AUTO_SUB = 50;
var SubstitutionEngine = class {
  constructor(match, options = {}) {
    this.match = match;
    this.autoSubs = options.autoSubs !== false;
    this.onInjury = options.onInjury || null;
    this.substitutions = {
      home: { used: 0, history: [] },
      away: { used: 0, history: [] }
    };
  }
  // Her dakika kontrol et
  // autoSubs=false → otomatik değişiklik YAPMA (Başkan modu)
  // Sadece sakatlık sonrası zorunlu değişiklik için kullanılabilir
  tick() {
    if (this.match.minute < MIN_MINUTE_FOR_AUTO_SUB) return;
    if (this.autoSubs === false) {
      for (const side of ["home", "away"]) {
        this._checkInjurySubs(side);
      }
      return;
    }
    for (const side of ["home", "away"]) {
      this._checkAutoSubs(side);
    }
  }
  // Başkan modu: sakatlanan oyuncuyu kenara al, callback tetikle
  // (Kullanıcı modal'da yedek seçecek)
  _checkInjurySubs(side) {
    if (this.substitutions[side].used >= MAX_SUBSTITUTIONS) return;
    const team = this.match[side];
    if (!team?.players) return;
    const injured = team.players.filter((p) => p.live?.injured && p.live?.injuredThisTick);
    for (const p of injured) {
      p.onField = false;
      p.live.injuredThisTick = false;
      if (this.onInjury) {
        this.onInjury(side, p);
      }
    }
  }
  // Otomatik değişiklik kontrolü
  _checkAutoSubs(side) {
    if (this.substitutions[side].used >= MAX_SUBSTITUTIONS) return;
    const team = this.match[side];
    if (!team?.players) return;
    const onField = team.players.filter((p) => p.onField);
    for (const p of onField) {
      if (p.live?.redCard) continue;
      const stamina = p.live?.currentStamina ?? 100;
      const injured = p.live?.injured;
      const yellows = p.live?.yellowCount || 0;
      if (injured) {
        this._trySubstitute(side, p, "Sakatl\u0131k", "Sakatl\u0131ktan dolay\u0131 \xE7\u0131kt\u0131");
        continue;
      }
      if (stamina < STAMINA_AUTO_SUB && yellows >= 1) {
        this._trySubstitute(side, p, "Yorgunluk + kart riski", "\xC7ok yorgun ve s\u0131n\u0131rda");
        continue;
      }
      if (this.match.minute >= 60 && stamina < 18) {
        this._trySubstitute(side, p, "Yorgunluk", "Ayaklar\u0131 tutmad\u0131, taze kan girdi");
      }
      if (this.match.minute >= 75 && stamina < 30) {
        this._trySubstitute(side, p, "Taktik de\u011Fi\u015Fiklik", "Son dakikada yoruldu, de\u011Fi\u015Fiklik");
      }
    }
  }
  // Manuel değişiklik (UI'dan)
  manualSub(side, outId, inId) {
    if (this.substitutions[side].used >= MAX_SUBSTITUTIONS) {
      return { ok: false, reason: "De\u011Fi\u015Fiklik hakk\u0131 kalmad\u0131 (3/3)" };
    }
    const outPlayer = this._player(side, outId);
    const inPlayer = this._player(side, inId);
    if (!outPlayer || !inPlayer) return { ok: false, reason: "Oyuncu bulunamad\u0131" };
    if (!outPlayer.onField) return { ok: false, reason: "Oyuncu sahada de\u011Fil" };
    if (inPlayer.onField) return { ok: false, reason: "Yedek zaten sahada" };
    return this._execute(side, outPlayer, inPlayer, "Taktik de\u011Fi\u015Fiklik", "Menajer istedi");
  }
  _trySubstitute(side, outPlayer, reason, narrative) {
    const inPlayer = this._findBestSubstitute(side, outPlayer);
    if (!inPlayer) return null;
    return this._execute(side, outPlayer, inPlayer, reason, narrative);
  }
  // Aynı pozisyondan yedek bul
  _findBestSubstitute(side, outPlayer) {
    const team = this.match[side];
    if (!team?.players) return null;
    const bench = team.players.filter((p) => !p.onField && !p.live?.redCard);
    if (!bench.length) return null;
    const samePos = bench.filter((p) => p.position === outPlayer.position);
    if (samePos.length) {
      return this._pickBest(samePos);
    }
    const adjacent = this._adjacentPositions(outPlayer.position);
    const adjPlayers = bench.filter((p) => adjacent.includes(p.position));
    if (adjPlayers.length) {
      return this._pickBest(adjPlayers);
    }
    return this._pickBest(bench);
  }
  _pickBest(players) {
    const scored = players.map((p) => {
      const stamina = p.live?.currentStamina ?? 100;
      const attrs = p.attrs || {};
      const total = Object.values(attrs).reduce((s, v) => s + (v || 0), 0);
      const avg = total / Math.max(1, Object.keys(attrs).length);
      return { p, score: avg * 0.6 + stamina * 0.4 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.p || null;
  }
  _adjacentPositions(role) {
    return {
      GK: ["GK"],
      DF: ["DF", "OS"],
      OS: ["OS", "DF", "FV"],
      FV: ["FV", "OS"]
    }[role] || [role];
  }
  _execute(side, outPlayer, inPlayer, reason, narrative) {
    outPlayer.onField = false;
    inPlayer.onField = true;
    inPlayer.live = inPlayer.live || {};
    inPlayer.live.currentStamina = inPlayer.live.currentStamina ?? 100;
    const sub = {
      minute: this.match.minute,
      side,
      out: { id: outPlayer.id, name: outPlayer.name, position: outPlayer.position },
      in: { id: inPlayer.id, name: inPlayer.name, position: inPlayer.position },
      reason,
      narrative
    };
    this.substitutions[side].used++;
    this.substitutions[side].history.push(sub);
    const ev = {
      minute: this.match.minute,
      type: "substitution",
      side,
      actor: outPlayer.id,
      target: inPlayer.id,
      text: `${this.match.minute}' \u{1F504} De\u011Fi\u015Fiklik: ${outPlayer.name} \xE7\u0131kt\u0131, ${inPlayer.name} girdi (${reason}).`
    };
    this.match.events = this.match.events || [];
    this.match.events.push(ev);
    return { ok: true, sub, event: ev };
  }
  _player(side, id) {
    return this.match[side]?.players?.find((p) => p.id === id || p.name === id) || null;
  }
  getRemainingSubs(side) {
    return Math.max(0, MAX_SUBSTITUTIONS - this.substitutions[side].used);
  }
  getSubHistory(side) {
    return this.substitutions[side].history;
  }
};
function createSubstitution(match, options) {
  return new SubstitutionEngine(match, options);
}

// match/simulate.js
var MAX_ACTIONS_PER_MINUTE = 3;
function startMatch(match) {
  deployLineup(match.home, match.formation.home, false);
  deployLineup(match.away, match.formation.away, true);
  match.ballPos = { x: 50, y: 35 };
  match.ballSide = Math.random() < 0.5 ? "home" : "away";
  if (!match.tactics) match.tactics = { home: "normal", away: "normal" };
  const side = match.ballSide;
  const team = match[side];
  const closest = team.players.filter((p) => p.onField).map((p) => ({ p, d: Math.hypot(p.live.x - 50, p.live.y - 35) })).sort((a, b) => a.d - b.d)[0];
  if (closest) match.ballCarrier = { side, playerId: closest.p.id };
  if (!match.narrator) match.narrator = createNarrator(match);
  if (!match.motivation) match.motivation = createMotivation(match);
  if (!match.substitution) {
    const options = {
      autoSubs: match.mode !== "manager",
      onInjury: match.onInjury || null
    };
    match.substitution = createSubstitution(match, options);
  }
  match.events.push({
    minute: 0,
    type: "kickoff",
    text: `\u26BD Ma\xE7 ba\u015Flad\u0131: ${match.home.name} vs ${match.away.name}`
  });
  match.narrativeLog = match.narrativeLog || [];
  match.narrativeLog.push({
    minute: 0,
    type: "kickoff",
    text: `\u{1F3DF}\uFE0F ${match.home.name} kar\u015F\u0131s\u0131nda ${match.away.name}! Trib\xFCnler dolu, ma\xE7 ba\u015Flad\u0131.`
  });
}
function simulateMinute(match) {
  match.minute++;
  const actionsThisMinute = 1 + Math.floor(Math.random() * MAX_ACTIONS_PER_MINUTE);
  match.narrativeLog = match.narrativeLog || [];
  if (!match.narrator) match.narrator = createNarrator(match);
  for (let i = 0; i < actionsThisMinute; i++) {
    if (match.minute > 90) break;
    simulateAction(match);
  }
  for (const side of ["home", "away"]) {
    for (const p of match[side].players) {
      if (p.onField) tickStamina(p, match.minute);
    }
  }
  updatePositions(match);
  if (!match.motivation) match.motivation = createMotivation(match);
  match.motivation.tick();
  for (const ev of match.motivation.recentEvents) {
    if (ev.minute === match.minute) {
      match.narrativeLog.push({ minute: ev.minute, type: ev.type, text: ev.text });
    }
  }
  if (!match.substitution) match.substitution = createSubstitution(match);
  match.substitution.tick();
  for (const side of ["home", "away"]) {
    const hist = match.substitution.getSubHistory(side);
    for (const sub of hist) {
      if (sub.minute === match.minute) {
        const ev = {
          minute: sub.minute,
          type: "substitution",
          side,
          text: `\u{1F504} De\u011Fi\u015Fiklik: ${sub.out.name} \xE7\u0131kt\u0131, ${sub.in.name} girdi (${sub.reason}).`
        };
        match.narrativeLog.push(ev);
      }
    }
  }
  const seqText = match.narrator.flushSequence();
  if (seqText) {
    match.narrativeLog.push({
      minute: match.minute,
      type: "sequence",
      text: seqText
    });
  }
  match.tickCount++;
  const ballTime = actionsThisMinute;
  if (match.ballSide === "home") match.stats.possession.home += ballTime;
  else match.stats.possession.away += ballTime;
  const total = match.stats.possession.home + match.stats.possession.away;
  if (total > 0) match.momentum = match.stats.possession.home / total;
}
function simulateAction(match) {
  const side = match.ballSide;
  const carrier = findCarrier(match);
  if (!carrier) {
    passToClosest(match);
    return;
  }
  const action = pickAction(carrier, match);
  let target = null;
  if (action === "passShort" || action === "passLong") {
    target = pickPassTarget(carrier, match, action === "passLong" ? "long" : "short");
  }
  const result = resolveAction(match, carrier, action, target);
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
    if (!match.narrator) match.narrator = createNarrator(match);
    match.narrativeLog = match.narrativeLog || [];
    match.narrator.tracker.push(result.events, match);
    const instant = match.narrator.narrate(result.events);
    if (instant) {
      match.narrativeLog.push({
        minute: match.minute,
        type: "instant",
        text: instant
      });
    }
  }
  maybeFoul(match, carrier);
}
function findCarrier(match) {
  if (!match.ballCarrier) return null;
  return findPlayer(match, match.ballCarrier.side, match.ballCarrier.playerId);
}
function passToClosest(match) {
  const side = match.ballSide;
  const team = match[side];
  const closest = team.players.filter((p) => p.onField).map((p) => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) })).sort((a, b) => a.d - b.d)[0];
  if (closest) {
    match.ballPos = { x: closest.p.live.x, y: closest.p.live.y };
    match.ballCarrier = { side, playerId: closest.p.id };
  }
}
function maybeFoul(match, carrier) {
  if (Math.random() > 0.08) return;
  const side = match.ballSide;
  const opp = side === "home" ? match.away : match.home;
  const defenders = opp.players.filter((p) => p.onField && p.position !== "GK").map((p) => ({ p, d: Math.hypot(p.live.x - match.ballPos.x, p.live.y - match.ballPos.y) })).filter((x) => x.d < 35).sort((a, b) => a.d - b.d);
  if (!defenders.length) return;
  const def = defenders[0].p;
  const foulAction = "tackling";
  const foulCheck = skillCheck(def, foulAction, 65, { action: "tackle" });
  if (foulCheck.success) {
    match.ballSide = side === "home" ? "away" : "home";
    match.ballCarrier = { side: match.ballSide, playerId: def.id };
    match.ballPos = { x: def.live.x, y: def.live.y };
    const ev = {
      minute: match.minute,
      type: "tackle_won",
      side: match.ballSide,
      actor: def.id,
      text: `${match.minute}' ${def.name} m\xFCdahale etti, topu kazand\u0131!`
    };
    match.events.push(ev);
    if (match.narrator) {
      match.narrator.tracker.push([ev], match);
      const t = match.narrator.narrate([ev]);
      if (t) {
        match.narrativeLog = match.narrativeLog || [];
        match.narrativeLog.push({ minute: match.minute, type: "instant", text: t });
      }
    }
    return;
  }
  def.live.foulsCommitted++;
  match.stats.fouls[match.ballSide === "home" ? "away" : "home"]++;
  const foulEv = {
    minute: match.minute,
    type: "foul",
    side: match.ballSide,
    actor: def.id,
    text: `${match.minute}' ${def.name} faul yapt\u0131!`
  };
  match.events.push(foulEv);
  if (def.live.yellowCards >= 1 || Math.random() < 0.1) {
    const cardSide = match.ballSide === "home" ? "away" : "home";
    const cardResult = match.motivation ? match.motivation.giveCard(cardSide, def.id, "yellow") : null;
    if (cardResult) {
      const cardEvent = cardResult.event;
      match.events.push(cardEvent);
      if (cardResult.kind === "red_second_yellow") {
        def.live.yellowCards = 2;
        def.live.redCard = true;
        def.onField = false;
        match.stats.redCards[cardSide]++;
      } else {
        def.live.yellowCards = (def.live.yellowCards || 0) + 1;
        match.stats.yellowCards[cardSide]++;
      }
      if (match.narrator) {
        match.narrator.tracker.push([cardEvent], match);
        const t = match.narrator.narrate([cardEvent]);
        if (t) {
          match.narrativeLog = match.narrativeLog || [];
          match.narrativeLog.push({ minute: match.minute, type: "instant", text: t });
        }
      }
      if (cardResult.kind === "yellow" && Math.random() < 5e-3) {
        const redResult = match.motivation.giveCard(cardSide, def.id, "red");
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
              match.narrativeLog.push({ minute: match.minute, type: "instant", text: t });
            }
          }
        }
      }
    }
  }
}

// match/playerName.js
var FIRST_NAMES = {
  tr: [
    "Arda",
    "Berkay",
    "Cem",
    "Deniz",
    "Eren",
    "Furkan",
    "G\xF6khan",
    "Hakan",
    "\u0130lker",
    "Kemal",
    "Levent",
    "Murat",
    "Nihat",
    "Onur",
    "Polat",
    "R\u0131dvan",
    "Selim",
    "Tolga",
    "Ufuk",
    "Volkan",
    "Yasin",
    "Zafer",
    "Baran",
    "\xC7a\u011Fan",
    "Doruk",
    "Ege",
    "Kaan",
    "Sarp",
    "Tar\u0131k",
    "Erdem",
    "Kutay",
    "Yi\u011Fit"
  ],
  es: [
    "Mateo",
    "Diego",
    "Lucas",
    "Iv\xE1n",
    "Sebasti\xE1n",
    "Joaqu\xEDn",
    "Federico",
    "Andr\xE9s",
    "Camilo",
    "Mateus",
    "Bruno",
    "Thiago",
    "Lautaro",
    "Cristian",
    "Maximiliano",
    "Santiago",
    "Ramiro",
    "Esteban",
    "Joao",
    "Vin\xEDcius",
    "Eduardo",
    "Rafael",
    "Manuel",
    "\xC1ngel",
    "Sergio",
    "Adri\xE1n",
    "Hugo",
    "Marcos",
    "\xD3scar",
    "Pablo",
    "Ricardo"
  ],
  it: [
    "Marco",
    "Lorenzo",
    "Alessio",
    "Davide",
    "Matteo",
    "Andrea",
    "Luca",
    "Stefano",
    "Federico",
    "Antonio",
    "Gianluca",
    "Roberto",
    "Salvatore",
    "Vincenzo",
    "Riccardo",
    "Simone",
    "Tommaso",
    "Nicola",
    "Giuseppe",
    "Carlo",
    "Paolo",
    "Giovanni",
    "Francesco",
    "Alessandro"
  ],
  fr: [
    "Lucas",
    "Hugo",
    "Th\xE9o",
    "Antoine",
    "Maxime",
    "Julien",
    "Nicolas",
    "Mathieu",
    "Romain",
    "Adrien",
    "S\xE9bastien",
    "Olivier",
    "C\xE9dric",
    "Fabien",
    "St\xE9phane",
    "Beno\xEEt",
    "Aur\xE9lien",
    "Ga\xEBl",
    "Yannick",
    "Kylian",
    "Wissam",
    "Riyad",
    "Karim"
  ],
  en: [
    "Jack",
    "Oliver",
    "Harry",
    "George",
    "Charlie",
    "James",
    "William",
    "Thomas",
    "Daniel",
    "Samuel",
    "Benjamin",
    "Joseph",
    "Edward",
    "Henry",
    "Frederick",
    "Theodore",
    "August",
    "Felix",
    "Hugo",
    "Oscar",
    "Leo",
    "Milo",
    "Finn",
    "Ethan",
    "Liam",
    "Noah",
    "Caleb",
    "Asher",
    "Theo"
  ],
  af: [
    "Sadio",
    "Kalidou",
    "Idrissa",
    "\xC9douard",
    "Pierre-Emerick",
    "Victor",
    "Wilfried",
    "Yaya",
    "Eric",
    "Samuel",
    "Boulaye",
    "Patson",
    "Keita",
    "Moussa",
    "Bertrand",
    "Habib",
    "Ismail",
    "Fod\xE9",
    "Mbemba",
    "Blaise",
    "Yann",
    "Nicolas",
    "Andr\xE9",
    "Denis",
    "Rigobert"
  ],
  jp: [
    "Haruki",
    "Yuto",
    "S\u014Dta",
    "Ren",
    "Kaito",
    "Hiroto",
    "Takumi",
    "Riku",
    "Y\u016Bta",
    "Ry\u014Dta",
    "Daiki",
    "K\u014Dsuke",
    "Sh\u014Dta",
    "Tsubasa",
    "Minato",
    "Hayato",
    "Itsuki",
    "Ayumu",
    "Issei",
    "Ry\u014Dma"
  ],
  kr: [
    "Min-jae",
    "Heung-min",
    "Jae-sung",
    "Woo-yeong",
    "Ui-jo",
    "Hee-chan",
    "In-beom",
    "Ki-sung",
    "Hyun-soo",
    "Seung-woo",
    "Jin-su",
    "Young-gwon"
  ]
};
var LAST_NAMES = {
  tr: [
    "Y\u0131ld\u0131r\u0131m",
    "Demir",
    "\u015Eahin",
    "\xC7elik",
    "Kaya",
    "\xD6zt\xFCrk",
    "Ayd\u0131n",
    "Arslan",
    "Do\u011Fan",
    "K\u0131l\u0131\xE7",
    "Erdo\u011Fan",
    "T\xFCrk",
    "Polat",
    "Bozkurt",
    "Aksoy",
    "Acar",
    "Tekin",
    "G\xFCne\u015F",
    "Bulut",
    "Y\u0131ld\u0131z",
    "Tun\xE7",
    "Kaplan",
    "Aslan",
    "Avc\u0131",
    "Eren",
    "Erdem",
    "Korkmaz",
    "S\xF6nmez"
  ],
  es: [
    "Garc\xEDa",
    "Rodr\xEDguez",
    "Gonz\xE1lez",
    "Fern\xE1ndez",
    "L\xF3pez",
    "Mart\xEDnez",
    "S\xE1nchez",
    "P\xE9rez",
    "G\xF3mez",
    "Mart\xEDn",
    "Jim\xE9nez",
    "Ruiz",
    "Hern\xE1ndez",
    "D\xEDaz",
    "Moreno",
    "\xC1lvarez",
    "Romero",
    "Alonso",
    "Navarro",
    "Torres",
    "Dom\xEDnguez",
    "V\xE1zquez",
    "Ramos",
    "Gil",
    "Ram\xEDrez",
    "Serrano",
    "Blanco",
    "Molina",
    "Morales",
    "Su\xE1rez",
    "Castro",
    "Ortega"
  ],
  it: [
    "Rossi",
    "Russo",
    "Ferrari",
    "Esposito",
    "Bianchi",
    "Romano",
    "Colombo",
    "Ricci",
    "Marino",
    "Greco",
    "Bruno",
    "Gallo",
    "Conti",
    "De Luca",
    "Costa",
    "Mancini",
    "Rizzo",
    "Lombardi",
    "Moretti",
    "Barbieri",
    "Fontana",
    "Santoro",
    "Mariani",
    "Rinaldi",
    "Caruso",
    "Ferraro",
    "Galli"
  ],
  fr: [
    "Martin",
    "Bernard",
    "Dubois",
    "Thomas",
    "Robert",
    "Petit",
    "Durand",
    "Leroy",
    "Moreau",
    "Simon",
    "Laurent",
    "Lefebvre",
    "Michel",
    "Roux",
    "David",
    "Bertrand",
    "Morel",
    "Fournier",
    "Girard",
    "Bonnet",
    "Dupuis",
    "Lambert",
    "Fontaine",
    "Rousseau",
    "Vincent",
    "Muller",
    "Lefevre"
  ],
  en: [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Miller",
    "Davis",
    "Wilson",
    "Anderson",
    "Taylor",
    "Thomas",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Walker",
    "Hall",
    "Allen",
    "Young",
    "King",
    "Wright",
    "Hill",
    "Scott",
    "Green",
    "Adams",
    "Baker",
    "Carter",
    "Mitchell",
    "Roberts"
  ],
  af: [
    "Man\xE9",
    "Koulibaly",
    "Gueye",
    "Mendyl",
    "Aubameyang",
    "Wanyama",
    "Zaha",
    "Tour\xE9",
    "Bailly",
    "Dia",
    "Daka",
    "Mina",
    "Sangar\xE9",
    "Kessi\xE9",
    "Bissouma",
    "Osimhen",
    "Salah",
    "Mane",
    "Mahrez",
    "Koulibaly"
  ],
  jp: [
    "Sait\u014D",
    "Suzuki",
    "Takahashi",
    "Tanaka",
    "Watanabe",
    "It\u014D",
    "Yamamoto",
    "Nakamura",
    "Kobayashi",
    "Kat\u014D",
    "Yoshida",
    "Yamada",
    "Sasaki",
    "Yamaguchi",
    "Matsumoto",
    "Inoue",
    "Kimura",
    "Hayashi",
    "Shimizu",
    "Hashimoto"
  ],
  kr: [
    "Kim",
    "Lee",
    "Park",
    "Choi",
    "Jung",
    "Kang",
    "Cho",
    "Yoon",
    "Jang",
    "Lim",
    "Han",
    "Shin",
    "Seo",
    "Kwon",
    "Son",
    "Hwang",
    "Ahn",
    "Yoo"
  ]
};
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickOrigin() {
  const r = Math.random();
  if (r < 0.4) return "tr";
  if (r < 0.62) return "es";
  if (r < 0.74) return "it";
  if (r < 0.83) return "fr";
  if (r < 0.9) return "en";
  if (r < 0.97) return "af";
  return "kr";
}
function generateName() {
  const origin = pickOrigin();
  const first = pickRandom(FIRST_NAMES[origin]);
  if ((origin === "af" || origin === "es") && Math.random() < 0.25) {
    return first;
  }
  const last = pickRandom(LAST_NAMES[origin]);
  return `${first} ${last}`;
}
var usedNames = /* @__PURE__ */ new Set();
function generateUniqueName(forceNew = false) {
  if (!forceNew) usedNames.clear();
  let name;
  let attempts = 0;
  do {
    name = generateName();
    attempts++;
    if (attempts > 50) {
      name = `${name} ${Math.floor(Math.random() * 99)}`;
      break;
    }
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}
function resetNamePool() {
  usedNames.clear();
}

// match/teamBuilder.js
var POSITIONS_BY_FORMATION = {
  "442": [
    "GK",
    "DF",
    "DF",
    "DF",
    "DF",
    "OS",
    "OS",
    "OS",
    "OS",
    "FV",
    "FV"
  ],
  "433": [
    "GK",
    "DF",
    "DF",
    "DF",
    "DF",
    "OS",
    "OS",
    "OS",
    "FV",
    "FV",
    "FV"
  ],
  "352": [
    "GK",
    "DF",
    "DF",
    "DF",
    "OS",
    "OS",
    "OS",
    "OS",
    "OS",
    "FV",
    "FV"
  ],
  "451": [
    "GK",
    "DF",
    "DF",
    "DF",
    "DF",
    "OS",
    "OS",
    "OS",
    "OS",
    "OS",
    "FV"
  ]
};
var POSITION_ATTRS = {
  GK: { reflexes: 80, positioning: 70, composure: 70, passing: 50 },
  DF: { tackling: 75, marking: 70, interception: 70, aerial: 70, passing: 60 },
  OS: { passing: 75, vision: 70, decisions: 70, firstTouch: 70, dribbling: 65 },
  FV: { finishing: 78, composure: 70, shooting: 70, pace: 70, firstTouch: 70 }
};
function makeStarBonus() {
  return Math.random() < 0.3 ? 10 : 0;
}
function makeAttrs(position, isStar) {
  const base = { ...POSITION_ATTRS[position] };
  const starBonus = isStar ? makeStarBonus() : 0;
  const variance = () => Math.floor(Math.random() * 8) - 4;
  for (const key in base) {
    base[key] = Math.max(20, Math.min(95, base[key] + variance() + starBonus));
  }
  return base;
}
function buildTeam(name, formation = "442", isHome = true) {
  const lineup = POSITIONS_BY_FORMATION[formation] || POSITIONS_BY_FORMATION["442"];
  const players = [];
  const usedIds = /* @__PURE__ */ new Set();
  for (let i = 0; i < lineup.length; i++) {
    const position = lineup[i];
    const isStar = i < 2;
    const stars = isStar && Math.random() < 0.5 ? 2 : Math.random() < 0.15 ? 3 : 1;
    const pname = generateUniqueName();
    const id = `${isHome ? "h" : "a"}_${position.toLowerCase()}_${i}`;
    usedIds.add(id);
    players.push({
      id,
      name: pname,
      position,
      stars,
      attrs: makeAttrs(position, stars >= 2),
      traits: [],
      live: {
        x: 0,
        y: 0,
        currentStamina: 100,
        currentMorale: 60,
        form: 0,
        extraEffort: 0,
        yellowCount: 0,
        redCard: false,
        injured: false,
        injuryWeeks: 0,
        injuryReason: null,
        passesAttempted: 0,
        passesCompleted: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        saves: 0,
        conceded: 0,
        yellowCards: 0,
        redCardYellow: false,
        foulsCommitted: 0,
        onField: false,
        subOut: false
      }
    });
  }
  const benchSlots = [
    "GK",
    "DF",
    "DF",
    "DF",
    "OS",
    "OS",
    "OS",
    "OS",
    "FV",
    "FV",
    "FV"
  ];
  for (let i = 0; i < benchSlots.length; i++) {
    const position = benchSlots[i];
    const isBenchStar = Math.random() < 0.25;
    const stars = isBenchStar ? 2 : 1;
    const pname = generateUniqueName();
    let id = `${isHome ? "h" : "a"}_b${position.toLowerCase()}_${i}`;
    while (usedIds.has(id)) {
      id = `${id}_${Math.floor(Math.random() * 100)}`;
    }
    usedIds.add(id);
    players.push({
      id,
      name: pname,
      position,
      stars,
      attrs: makeAttrs(position, isBenchStar),
      traits: [],
      live: {
        x: 0,
        y: 0,
        currentStamina: 100,
        // yedekler taze
        currentMorale: 60,
        form: 0,
        extraEffort: 0,
        yellowCount: 0,
        redCard: false,
        injured: false,
        passesAttempted: 0,
        passesCompleted: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        saves: 0,
        conceded: 0,
        yellowCards: 0,
        foulsCommitted: 0,
        onField: false,
        subOut: false
      }
    });
  }
  return { name, players, formation };
}

// match/clubName.js
var PREFIXES = [
  "Anadolu",
  "Bo\u011Faz",
  "\xC7\u0131nar",
  "Demir",
  "Ege",
  "F\u0131rt\u0131na",
  "Galata",
  "Hali\xE7",
  "\u0130stanbul",
  "Karadeniz",
  "Lale",
  "Marmara",
  "Nil\xFCfer",
  "Ovac\u0131k",
  "Pamuk",
  "R\xFCzgar",
  "Sancak",
  "Trakya",
  "Uluda\u011F",
  "Vadi",
  "Y\u0131ld\u0131r\u0131m",
  "Zirve",
  "Ak\u0131nc\u0131",
  "Bar\u0131\u015F",
  "Cemre",
  "Doruk",
  "Erbil"
];
var SUFFIXES = [
  "spor",
  "FK",
  "SK",
  "G\xFCc\xFC",
  "1957",
  "Birlik",
  "Y\u0131ld\u0131z",
  "Demirspor",
  "Gen\xE7lik",
  "Olimpiyat",
  "Kul\xFCb\xFC",
  "Futbol",
  "1934",
  "Kongre",
  "Ligi",
  "Bah\xE7e",
  "Arena",
  "Park",
  "Stadyumu",
  "Efsanesi",
  "Trib\xFCn\xFC"
];
var KURGU_ISIMLER = [
  "Galata Bo\u011Faz FK",
  "Anadolu Kartal\u0131 SK",
  "F\u0131rt\u0131na Spor",
  "\xC7\u0131nar Demirspor",
  "Bo\u011Faz Kaplanlar\u0131",
  "Y\u0131ld\u0131r\u0131m Efsanesi",
  "Lale Bah\xE7esi FK",
  "Marmara F\u0131rt\u0131nas\u0131",
  "Ak\u0131nc\u0131lar 1923",
  "Bar\u0131\u015F Yelken SK",
  "Doruk Spor 1957",
  "Erbil Y\u0131ld\u0131z\u0131",
  "Nil\xFCfer \xC7i\xE7e\u011Fi FK",
  "Ovac\u0131k G\xFCc\xFC",
  "Pamuk Gen\xE7lik",
  "Sancak Birlik",
  "Trakya R\xFCzgar\u0131",
  "Uluda\u011F Demirspor",
  "Vadi Kaplanlar\u0131",
  "Zirve Olimpiyat",
  "Karadeniz F\u0131rt\u0131nas\u0131",
  "Hali\xE7 Ligi",
  "Galata Arena",
  "\u0130stanbul Park FK",
  "Ege Bah\xE7esi",
  "Cemre Spor"
];
var usedClubs = /* @__PURE__ */ new Set();
function pickRandom2(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function generateClubName() {
  if (Math.random() < 0.6) {
    return pickRandom2(KURGU_ISIMLER);
  }
  const prefix = pickRandom2(PREFIXES);
  const suffix = pickRandom2(SUFFIXES);
  return `${prefix} ${suffix}`;
}
function generateUniqueClubName() {
  let name;
  let attempts = 0;
  do {
    name = generateClubName();
    attempts++;
    if (attempts > 50) {
      name = `${name} ${Math.floor(Math.random() * 99)}`;
      break;
    }
  } while (usedClubs.has(name));
  usedClubs.add(name);
  return name;
}
function resetClubPool() {
  usedClubs.clear();
}
function generateMatchClubs() {
  let home, away;
  let attempts = 0;
  do {
    home = generateUniqueClubName();
    away = generateUniqueClubName();
    attempts++;
    if (attempts > 30) break;
  } while (home === away);
  return { home, away };
}

// match/development.js
var DECLINE_START = 28;
var PEAK_AGE_MAX = 30;
var DevelopmentEngine = class {
  constructor() {
    this.weekNumber = 0;
  }
  // Yaşa göre gelişim katsayısı
  _growthFactor(age) {
    if (age < 18) return 0;
    if (age <= 23) return 0.8;
    if (age <= PEAK_AGE_MAX) return 0.2;
    if (age <= DECLINE_START) return 0;
    if (age <= 32) return -0.3;
    if (age <= 35) return -0.7;
    return -1.2;
  }
  // Potansiyel hesapla (oyuncunun başlangıç potential'ı)
  calculatePotential(attrs, stars) {
    const base = Object.values(attrs).reduce((s, v) => s + v, 0) / Object.keys(attrs).length;
    const starBonus = (stars - 1) * 10;
    return Math.round(base + starBonus + Math.random() * 10);
  }
  // Oyuncuya yaş ata
  assignAge(player) {
    if (player.stars >= 2) {
      player.age = 24 + Math.floor(Math.random() * 8);
    } else {
      if (Math.random() < 0.3) {
        player.age = 17 + Math.floor(Math.random() * 5);
      } else {
        player.age = 22 + Math.floor(Math.random() * 9);
      }
    }
    return player.age;
  }
  // Potential ata
  assignPotential(player) {
    player.potential = this.calculatePotential(player.attrs, player.stars);
    return player.potential;
  }
  // Haftalık gelişim uygula
  //  - Her oyuncu için yaşına göre delta
  //  - Performansa göre bonus (yüksek rating = +)
  //  - Antrenman etkisi (varsa)
  applyWeeklyDevelopment(player, options = {}) {
    const age = player.age ?? this.assignAge(player);
    const baseGrowth = this._growthFactor(age);
    const weekDelta = baseGrowth * 0.05;
    let performanceBonus = 0;
    if (options.lastRating && options.lastRating > 7) {
      performanceBonus = (options.lastRating - 7) * 0.1;
    } else if (options.lastRating && options.lastRating < 5.5) {
      performanceBonus = -0.05;
    }
    let trainingBonus = 0;
    if (options.training) {
      trainingBonus = options.training * 0.05;
    }
    const totalDelta = weekDelta + performanceBonus + trainingBonus;
    if (!player.attrs) return;
    for (const key in player.attrs) {
      const current = player.attrs[key];
      const newValue = current + totalDelta;
      player.attrs[key] = Math.max(30, Math.min(player.potential ?? 95, newValue));
    }
    player.age = age;
    return totalDelta;
  }
  // Sezon sonu (yıllık) büyük güncelleme
  applySeasonalDevelopment(player) {
    const age = player.age ?? 25;
    const baseGrowth = this._growthFactor(age);
    const yearDelta = baseGrowth * 0.5;
    if (!player.attrs) return;
    for (const key in player.attrs) {
      const current = player.attrs[key];
      const newValue = current + yearDelta;
      player.attrs[key] = Math.max(20, Math.min(player.potential ?? 95, newValue));
    }
    player.age = age + 1;
    return yearDelta;
  }
  // Oyuncunun mevcut rating puanı (0-10)
  // Maç performansından hesaplanır (events.js'den)
  calculateRating(player, matchEvents) {
    let score = 6.5;
    let goals = 0, assists = 0, shots = 0, passes = 0, passSuccess = 0;
    let tackles = 0, intercepts = 0, saves = 0, yellows = 0, reds = 0;
    const playerId = player.id;
    for (const ev of matchEvents) {
      if (ev.actor === playerId || ev.scorer === playerId) {
        if (ev.type === "goal") {
          goals++;
          score += 2;
        } else if (ev.type === "shot" || ev.reason === "sut_isabetsiz" || ev.reason === "kaleciKurtardi") {
          shots++;
          score += 0.1;
        } else if (ev.type === "pass_success") {
          passes++;
          passSuccess++;
          score += 0.05;
        } else if (ev.type === "tackle_won") {
          tackles++;
          score += 0.2;
        } else if (ev.type === "yellow_card") {
          yellows++;
          score -= 0.3;
        } else if (ev.type === "red_card") {
          reds++;
          score -= 2;
        }
      }
      if (ev.target === playerId) {
        if (ev.type === "goal" && ev.scorer !== playerId) {
          assists++;
          score += 1;
        }
      }
    }
    return Math.max(3, Math.min(10, score));
  }
  // Oyuncunun potansiyeline göre ne kadar gelişebilir
  potentialProgress(player) {
    if (!player.attrs || !player.potential) return 0;
    const current = Object.values(player.attrs).reduce((s, v) => s + v, 0) / Object.keys(player.attrs).length;
    return Math.max(0, player.potential - current);
  }
};
function createDevelopment() {
  return new DevelopmentEngine();
}

// match/transfer.js
var STARTING_BUDGET = 5e7;
var WEEKLY_WAGE_BASE = 5e4;
function calculatePlayerValue(player) {
  const current = player.attrs || {};
  const currentAbility = Object.values(current).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(current).length);
  const age = player.age ?? 25;
  const potential = player.potential ?? currentAbility;
  const stars = player.stars ?? 1;
  const ageFactor = age < 23 ? 1.5 : age < 28 ? 1.2 : age < 32 ? 0.9 : 0.5;
  const potentialBonus = (potential - currentAbility) * 5e4;
  const starBonus = (stars - 1) * 1e6;
  const baseValue = currentAbility * 1e5;
  return Math.max(1e5, Math.round(baseValue * ageFactor + potentialBonus + starBonus));
}
function calculateWage(player) {
  const value = calculatePlayerValue(player);
  const weeklyWage = value * 0.08 / 52;
  return Math.max(2e4, Math.round(weeklyWage));
}
var TransferMarket = class {
  constructor(season = 1) {
    this.season = season;
    this.players = [];
  }
  refresh() {
    this.players = [];
    resetNamePool();
    const sizes = [
      { count: 3, stars: 3, minAge: 24, maxAge: 32 },
      // yıldız
      { count: 6, stars: 2, minAge: 22, maxAge: 30 },
      // kaliteli
      { count: 12, stars: 1, minAge: 18, maxAge: 23 },
      // genç
      { count: 12, stars: 1, minAge: 24, maxAge: 30 },
      // ortalama
      { count: 7, stars: 1, minAge: 31, maxAge: 36 }
      // yaşlı
    ];
    for (const size of sizes) {
      for (let i = 0; i < size.count; i++) {
        const team = buildTeam("Market", "442", true);
        const p = team.players[0];
        p.age = size.minAge + Math.floor(Math.random() * (size.maxAge - size.minAge));
        p.stars = size.stars;
        p.potential = 50 + size.stars * 15 + Math.floor(Math.random() * 10);
        const baseAttrs = {
          GK: { reflexes: 60, positioning: 60, composure: 60, passing: 50 },
          DF: { tackling: 60, marking: 60, interception: 60, aerial: 60, passing: 55 },
          OS: { passing: 60, vision: 60, decisions: 60, firstTouch: 60, dribbling: 55 },
          FV: { finishing: 60, composure: 60, shooting: 60, pace: 60, firstTouch: 60 }
        }[p.position] || {};
        for (const key in baseAttrs) {
          const variance = (Math.random() - 0.5) * 15;
          p.attrs[key] = Math.max(30, Math.min(95, baseAttrs[key] + variance + (size.stars - 1) * 8));
        }
        p.live = {
          x: 50,
          y: 35,
          currentStamina: 100,
          currentMorale: 60,
          form: 0,
          extraEffort: 0,
          yellowCount: 0,
          redCard: false,
          injured: false,
          passesAttempted: 0,
          passesCompleted: 0,
          shots: 0,
          shotsOnTarget: 0,
          goals: 0,
          saves: 0,
          conceded: 0,
          yellowCards: 0,
          foulsCommitted: 0,
          onField: false
        };
        p.value = calculatePlayerValue(p);
        p.wage = calculateWage(p);
        this.players.push(p);
      }
    }
    return this.players;
  }
  // Filtreleme
  filter({ position, maxPrice, maxAge, minStars, position2 } = {}) {
    return this.players.filter((p) => {
      if (position && p.position !== position) return false;
      if (maxPrice && p.value > maxPrice) return false;
      if (maxAge && p.age > maxAge) return false;
      if (minStars && p.stars < minStars) return false;
      return true;
    });
  }
};
var ClubBudget = class {
  constructor(initialBudget = STARTING_BUDGET) {
    this.budget = initialBudget;
    this.weeklyWages = 0;
    this.transferBudget = initialBudget;
    this.history = [];
  }
  // Maaşları güncelle (oyuncu kadrosuna göre)
  updateWages(players) {
    this.weeklyWages = players.reduce((s, p) => s + (p.wage || WEEKLY_WAGE_BASE), 0);
  }
  // Haftalık maaş öde
  payWeeklyWages(week) {
    if (this.weeklyWages > this.budget) {
      this.history.push({ type: "wage_partial", amount: -this.budget, week, reason: "Yetersiz b\xFCt\xE7e" });
      this.budget = 0;
      return { ok: false, reason: "Yetersiz b\xFCt\xE7e" };
    }
    this.budget -= this.weeklyWages;
    this.history.push({ type: "wage", amount: -this.weeklyWages, week, reason: "Haftal\u0131k maa\u015F" });
    return { ok: true };
  }
  // Transfer gelir
  receiveTransfer(amount, playerName, week) {
    this.budget += amount;
    this.history.push({ type: "transfer_in", amount, week, reason: `${playerName} sat\u0131ld\u0131` });
  }
  // Transfer gider
  spendTransfer(amount, playerName, week) {
    if (amount > this.budget) return { ok: false, reason: "Yetersiz b\xFCt\xE7e" };
    this.budget -= amount;
    this.history.push({ type: "transfer_out", amount: -amount, week, reason: `${playerName} al\u0131nd\u0131` });
    return { ok: true };
  }
  // Maç geliri (sponsor, bilet, yayın)
  receiveMatchIncome(week, won = false) {
    const base = 2e5;
    const winBonus = won ? 1e5 : 0;
    this.budget += base + winBonus;
    this.history.push({ type: "match_income", amount: base + winBonus, week, reason: won ? "Galibiyet primi" : "Ma\xE7 geliri" });
  }
};
function generateOfferResponse(seller, buyer, askingPrice, player) {
  const playerValue = calculatePlayerValue(player);
  const offerRatio = askingPrice / playerValue;
  if (offerRatio < 0.6) return { accept: false, reason: "Teklif \xE7ok d\xFC\u015F\xFCk" };
  const age = player.age ?? 25;
  const isYoung = age < 24;
  const isOld = age > 30;
  const potential = player.potential ?? playerValue;
  const isHighPotential = potential > player.attrs?.finishing || 80;
  if (isYoung && isHighPotential && offerRatio < 1.5) {
    return { accept: false, reason: "Y\u0131ld\u0131z aday\u0131, satmak istemiyoruz" };
  }
  if (isOld && offerRatio > 0.7) {
    return { accept: true, reason: "S\xF6zle\u015Fme bitiyor, satmak istiyoruz" };
  }
  if (player.stars >= 3 && offerRatio < 1.8) {
    return { accept: false, reason: "Y\u0131ld\u0131z oyuncu, \xE7ok de\u011Ferli" };
  }
  if (offerRatio > 0.9) {
    return { accept: true, reason: "Kabul edilebilir teklif" };
  }
  if (Math.random() < 0.5) {
    return { accept: true, reason: "Kabul" };
  }
  return { accept: false, reason: "Red" };
}

// match/league.js
var LEAGUE_SIZE = 18;
var WEEKS_PER_SEASON = 34;
var SEASON_STARTING_BUDGET = 5e7;
var League = class {
  constructor() {
    this.teams = [];
    this.fixtures = [];
    this.currentWeek = 0;
    this.season = 1;
    this.userTeamId = null;
    this.development = createDevelopment();
  }
  // Yeni sezon başlat
  setup(userTeam = null) {
    resetClubPool();
    this.teams = [];
    if (userTeam) {
      const teamId = "user";
      userTeam.id = teamId;
      userTeam.budget = new ClubBudget(SEASON_STARTING_BUDGET);
      userTeam.budget.updateWages(userTeam.players);
      userTeam.points = 0;
      userTeam.played = 0;
      userTeam.won = 0;
      userTeam.drawn = 0;
      userTeam.lost = 0;
      userTeam.gf = 0;
      userTeam.ga = 0;
      userTeam.history = [];
      userTeam.isUser = true;
      this.teams.push(userTeam);
      this.userTeamId = teamId;
    }
    for (let i = 0; i < LEAGUE_SIZE - (userTeam ? 1 : 0); i++) {
      const clubName = generateUniqueClubName();
      const team = buildTeam(clubName, "442", false);
      team.id = `ai_${i}`;
      team.budget = new ClubBudget(SEASON_STARTING_BUDGET);
      team.budget.updateWages(team.players);
      team.points = 0;
      team.played = 0;
      team.won = 0;
      team.drawn = 0;
      team.lost = 0;
      team.gf = 0;
      team.ga = 0;
      team.history = [];
      team.isUser = false;
      this.teams.push(team);
    }
    this._generateFixtures();
    return this.teams;
  }
  // Fikstür üret
  _generateFixtures() {
    const teams = this.teams.map((t) => t.id);
    const fixtures = [];
    let week = 1;
    for (let round = 0; round < (LEAGUE_SIZE - 1) * 2; round++) {
      const matches = this._roundMatches(teams, round);
      for (const [homeId, awayId] of matches) {
        fixtures.push({ week, homeId, awayId, played: false, result: null });
      }
      week++;
    }
    this.fixtures = fixtures;
  }
  // Round-robin maç çiftleri
  _roundMatches(teams, round) {
    const n = teams.length;
    const matches = [];
    const fixed = teams[0];
    const rotating = teams.slice(1);
    for (let i = 0; i < n / 2; i++) {
      let home, away;
      if (i === 0) {
        home = round % 2 === 0 ? fixed : rotating[0];
        away = round % 2 === 0 ? rotating[0] : fixed;
      } else {
        home = rotating[(round + i) % (n - 1)];
        away = rotating[(round - i + n - 1) % (n - 1)];
      }
      if (round >= n - 1) {
        [home, away] = [away, home];
      }
      matches.push([home, away]);
    }
    return matches;
  }
  // Haftanın fikstürü
  getWeekFixtures(week) {
    return this.fixtures.filter((f) => f.week === week);
  }
  // Kullanıcı takımının bu haftaki maçı
  getUserMatch(week) {
    return this.fixtures.find((f) => f.week === week && (f.homeId === this.userTeamId || f.awayId === this.userTeamId));
  }
  // Belirli bir haftayı oyna (AI maçları otomatik)
  playWeek(week, onUserMatchStart) {
    if (week < 1 || week > this.fixtures[this.fixtures.length - 1].week) {
      return { ok: false, reason: "Ge\xE7ersiz hafta" };
    }
    const weekFixtures = this.getWeekFixtures(week);
    const results = { aiMatches: [], userMatch: null };
    for (const fix of weekFixtures) {
      if (fix.played) continue;
      if (fix.homeId === this.userTeamId || fix.awayId === this.userTeamId) {
        results.userMatch = fix;
        if (onUserMatchStart) {
          const result = onUserMatchStart(fix);
          if (result && result.score) {
            fix.played = true;
            fix.result = result.score;
            this._updateStandings(fix);
          }
        }
        continue;
      }
      const homeTeam = this.teams.find((t) => t.id === fix.homeId);
      const awayTeam = this.teams.find((t) => t.id === fix.awayId);
      if (!homeTeam || !awayTeam) continue;
      const simResult = this._simulateAIMatch(homeTeam, awayTeam);
      fix.played = true;
      fix.result = { home: simResult.home, away: simResult.away };
      this._updateStandings(fix);
      results.aiMatches.push({
        home: homeTeam.name,
        away: awayTeam.name,
        homeScore: simResult.home,
        awayScore: simResult.away,
        events: simResult.events
      });
    }
    for (const team of this.teams) {
      team.budget.payWeeklyWages(week);
    }
    this.currentWeek = week;
    return { ok: true, ...results };
  }
  // AI maçı simüle (hızlı tahmin)
  // Gerçek simülasyon yerine yeteneklere dayalı olasılıksal sonuç
  _simulateAIMatch(home, away) {
    const homeAbility = this._teamAbility(home);
    const awayAbility = this._teamAbility(away);
    const homeAdvantage = 1.15;
    const homeLambda = homeAbility * 0.04 * homeAdvantage / (awayAbility * 0.04 + 0.5);
    const awayLambda = awayAbility * 0.04 / (homeAbility * 0.04 * homeAdvantage + 0.5);
    const homeScore = this._poissonRandom(homeLambda);
    const awayScore = this._poissonRandom(awayLambda);
    return { home: homeScore, away: awayScore, events: [] };
  }
  _teamAbility(team) {
    const onField = team.players.filter((p) => p.onField);
    if (!onField.length) return 60;
    const sum = onField.reduce((s, p) => {
      const attrs = p.attrs || {};
      const avg = Object.values(attrs).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(attrs).length);
      return s + avg;
    }, 0);
    return sum / onField.length;
  }
  // Basit Poisson random
  _poissonRandom(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  }
  // Puan durumu güncelle
  _updateStandings(fix) {
    const { homeId, awayId, result } = fix;
    if (!result) return;
    const home = this.teams.find((t) => t.id === homeId);
    const away = this.teams.find((t) => t.id === awayId);
    if (!home || !away) return;
    home.played++;
    away.played++;
    home.gf += result.home;
    home.ga += result.away;
    away.gf += result.away;
    away.ga += result.home;
    if (result.home > result.away) {
      home.won++;
      home.points += 3;
      home.budget.receiveMatchIncome(fix.week, true);
      away.lost++;
    } else if (result.home < result.away) {
      away.won++;
      away.points += 3;
      away.budget.receiveMatchIncome(fix.week, true);
      home.lost++;
    } else {
      home.drawn++;
      home.points += 1;
      home.budget.receiveMatchIncome(fix.week, false);
      away.drawn++;
      away.points += 1;
      away.budget.receiveMatchIncome(fix.week, false);
    }
  }
  // Puan durumu (sıralı)
  getStandings() {
    return [...this.teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.gf - a.ga;
      const gdB = b.gf - b.ga;
      if (gdB !== gdA) return gdB - gdA;
      return b.gf - a.gf;
    }).map((t, idx) => ({
      pos: idx + 1,
      id: t.id,
      name: t.name,
      isUser: t.isUser,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      gf: t.gf,
      ga: t.ga,
      gd: t.gf - t.ga,
      points: t.points,
      budget: t.budget.budget
    }));
  }
  // Sezon sonu
  endSeason() {
    for (const team of this.teams) {
      for (const p of team.players) {
        this.development.applySeasonalDevelopment(p);
      }
    }
    this.season++;
    return { champion: this.getStandings()[0] };
  }
};
export {
  ClubBudget,
  DevelopmentEngine,
  LEAGUE_SIZE,
  League,
  MAX_SUBSTITUTIONS,
  MotivationEngine,
  Narrator,
  PITCH,
  SEASON_STARTING_BUDGET,
  TransferMarket,
  WEEKS_PER_SEASON,
  all as allComments,
  buildTeam,
  calculatePlayerValue,
  calculateWage,
  stats as commentStats,
  createDevelopment,
  createMotivation,
  createNarrator,
  createSubstitution,
  fillTemplate,
  findPlayer,
  findPlayerByPos,
  generateMatchClubs,
  generateOfferResponse,
  generateUniqueClubName,
  generateUniqueName,
  getComment,
  inAnyBox,
  inAwayBox,
  inHomeBox,
  isOnField,
  keys,
  makeMatchState,
  pick,
  pickOne,
  resetClubPool,
  resetNamePool,
  simulateMinute,
  startMatch,
  threatOf,
  zoneOf
};
