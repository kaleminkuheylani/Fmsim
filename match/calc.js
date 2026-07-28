// match/calc.js
// Oyuncu yeteneklerini maç bağlamında hesapla.
// Tek kaynak: getEffective(player, action, ctx)
// Tüm hesaplamalar burada, başka yerde formül YOK.

import { ATTRS, ROLE_WEIGHTS, STAR_TRAITS } from '../game/playerSchema.js';

// Stamina decay (her dakika)
//  - GK: 0.20 / dakika
//  - DF: 0.55
//  - OS: 0.75
//  - FV: 0.65
//  - 60+ dakikada ekstra yorgunluk (1.5x)
//  - 80+ dakikada daha fazla (2.0x)
const STAMINA_DECAY = { GK: 0.20, DF: 0.55, OS: 0.75, FV: 0.65 };
const STAMINA_BOOST = (minute) => {
  if (minute >= 80) return 2.0;
  if (minute >= 60) return 1.5;
  return 1.0;
};

// Stamina etkisi (0-1 arası katsayı)
function staminaFactor(currentStamina) {
  // 100 → 1.0
  //  70 → 0.97
  //  50 → 0.90
  //  30 → 0.75
  //   0 → 0.40
  if (currentStamina >= 90) return 1.0;
  if (currentStamina >= 70) return 0.95 + (currentStamina - 70) * 0.0025;
  if (currentStamina >= 50) return 0.85 + (currentStamina - 50) * 0.005;
  if (currentStamina >= 30) return 0.65 + (currentStamina - 30) * 0.01;
  return 0.30 + currentStamina * 0.0117;
}

// Morale etkisi
function moraleFactor(morale) {
  // 50 = nötr (1.0)
  // 80 = +%12
  // 30 = -%12
  return 1.0 + (morale - 50) / 250;
}

// Form etkisi (son maçlardan, -5..+5)
function formFactor(form) {
  return 1.0 + form * 0.02;
}

// Yıldız (star) genel etkisi: stars 0-3 → 0..0.06 bonus
function starFactor(stars) {
  return 1.0 + stars * 0.02;
}

// Pozisyon ağırlığı: rol için yetenek ne kadar önemli (0.5-1.5 clamp)
function roleWeight(position, attr) {
  const w = ROLE_WEIGHTS[position]?.[attr] ?? 1.0;
  return Math.max(0.5, Math.min(1.5, w));
}

// Trait (özel yetenek) etkisi
function traitFactor(player, action, ctx) {
  let mul = 1.0;
  for (const t of player.traits || []) {
    const trait = STAR_TRAITS[t];
    if (trait) mul *= trait.apply(player, { action, ...ctx });
  }
  return mul;
}

/**
 * Oyuncunun belirli bir eylem için etkili yetenek değeri.
 *   player: oyuncu objesi (playerSchema'dan)
 *   action: 'passing' | 'shooting' | 'tackling' | 'dribbling' | 'save' | 'marking' |
 *           'interception' | 'crossing' | 'finishing' | 'composure' | 'duel' | 'sprint' |
 *           'aerial' | 'pressing' | 'positioning' | 'decision' | 'vision' | 'leadership' | ...
 *   ctx: { inBox, distance, bigGame, ... }
 *
 * Dönüş: 0-100 arası normalize edilmiş skor (skill check için)
 */
export function getEffective(player, action, ctx = {}) {
  if (!player) return 0;
  const base = player.attrs?.[action] ?? 50;

  // 1) Pozisyon ağırlığı (0.7-1.3 arası dar tut)
  const rw = Math.max(0.7, Math.min(1.3, roleWeight(player.position, action)));
  let value = base * rw;

  // 2) Canlı faktörler
  const live = player.live || {};
  const stF = staminaFactor(live.currentStamina ?? 100);
  const moF = moraleFactor(live.currentMorale ?? 60);
  const foF = formFactor(live.form ?? 0);
  const starF = starFactor(player.stars ?? 0);
  value *= stF * moF * foF * starF;

  // 3) Star trait bonusu
  value *= traitFactor(player, action, ctx);

  // 4) Yorgunluk eşiği: stamina < 25 → agresif hata
  if (stF < 0.55) {
    value *= 0.85; // yorgunluktan kayıp
  }

  // 0-100 arası normalize (sıkı tut, max 85 — dünya classı bile 90'ı geçmez)
  return Math.max(0, Math.min(85, value));
}

/**
 * İki oyuncu arasında ikili mücadele.
 *   a, b: oyuncu objeleri
 *   action: 'tackle' | 'aerial' | 'duel' | 'press' | 'sprint' | ...
 *   ctx: ekstra bağlam
 *
 * Dönüş: { winner: 'a' | 'b' | 'tie', margin: -100..+100, aScore, bScore }
 *   margin > 0 → a kazandı, < 0 → b kazandı
 */
export function duel(a, b, action, ctx = {}) {
  const aScore = getEffective(a, action, ctx);
  const bScore = getEffective(b, action, ctx);

  // Rastgele varyans
  const aRand = (Math.random() - 0.5) * 12;
  const bRand = (Math.random() - 0.5) * 12;

  const aTotal = aScore + aRand;
  const bTotal = bScore + bRand;

  const margin = aTotal - bTotal;
  if (Math.abs(margin) < 3) return { winner: 'tie', margin, aScore: aTotal, bScore: bTotal };
  return { winner: margin > 0 ? 'a' : 'b', margin, aScore: aTotal, bScore: bTotal };
}

/**
 * Yetenek karşılaştırması (tek oyuncu, sabit eşik).
 *   player: oyuncu
 *   action: hangi yetenek
 *   difficulty: 0-100 (zorluk)
 *   ctx: bağlam
 *
 * Dönüş: { success: bool, roll: 0-100, margin: skill - difficulty }
 */
export function skillCheck(player, action, difficulty = 50, ctx = {}) {
  const skill = getEffective(player, action, ctx);
  const roll = skill + (Math.random() - 0.5) * 20; // ±10 varyans
  return {
    success: roll >= difficulty,
    roll,
    margin: skill - difficulty,
    skill,
  };
}

/**
 * Stamina decay tick (her dakika çağrılır).
 */
export function tickStamina(player, minute = 0) {
  const decay = STAMINA_DECAY[player.position] ?? 0.18;
  // 60+ dakikada artan yorgunluk
  const boost = STAMINA_BOOST(minute);
  // Eforlu eylem sonrası ekstra yıpranma (top taşıma, sprint, pres)
  const extra = player.live?.extraEffort ?? 0;
  player.live.currentStamina = Math.max(0, (player.live.currentStamina ?? 100) - decay * boost - extra);
  player.live.extraEffort = 0;
  player.live.minutesPlayed = (player.live.minutesPlayed ?? 0) + 1;
}

// Form maç sonu güncelleme (dışarıdan çağrılır)
export function tickForm(player) {
  // Maç performansı form'a yansır (dış kod çağırır)
}
