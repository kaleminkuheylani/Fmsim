// match/transfer.js
// Transfer piyasası — oyuncu arama, teklif, anlaşma.
//
// Her takımın bütçesi var. Transfer için:
//   1) Piyasadan oyuncu listesi üretilir
//   2) Kulüp teklif verir (fiyat + maaş)
//   3) Kulüp kabul/red eder
//   4) Kabul → oyuncu yeni kulübe transfer
//
// Bütçe:
//   - Başlangıç: 50M €
//   - Maaşlar haftalık düşer
//   - Transfer gelir/gider bütçeyi etkiler
//   - Performansa göre gelir (sponsor, ödül)

import { buildTeam } from './teamBuilder.js';
import { generateUniqueName, resetNamePool } from './playerName.js';
import { generateUniqueClubName, resetClubPool } from './clubName.js';

const STARTING_BUDGET = 50_000_000; // 50M €
const WEEKLY_WAGE_BASE = 50_000;     // 50K €

// Oyuncu değerini hesapla (yaş, yetenek, potential)
export function calculatePlayerValue(player) {
  const current = player.attrs || {};
  const currentAbility = Object.values(current).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(current).length);
  const age = player.age ?? 25;
  const potential = player.potential ?? currentAbility;
  const stars = player.stars ?? 1;

  // Yaş katsayısı: 18-25 yüksek, 30+ düşük
  const ageFactor = age < 23 ? 1.5 : age < 28 ? 1.2 : age < 32 ? 0.9 : 0.5;
  // Potential bonusu
  const potentialBonus = (potential - currentAbility) * 50000; // her gelişim puanı 50K
  // Stars bonusu
  const starBonus = (stars - 1) * 1_000_000;

  const baseValue = currentAbility * 100_000; // 1 yetenek puanı = 100K
  return Math.max(100_000, Math.round(baseValue * ageFactor + potentialBonus + starBonus));
}

// Maaş hesapla
export function calculateWage(player) {
  const value = calculatePlayerValue(player);
  // Maaş = değerin %5-15'i (yıllık → haftalık / 52)
  const weeklyWage = (value * 0.08) / 52;
  return Math.max(20_000, Math.round(weeklyWage));
}

// === TRANSFER MARKET ===
// Yeni oyuncular üret (farklı kalite ve fiyatta)

export class TransferMarket {
  constructor(season = 1) {
    this.season = season;
    this.players = [];
  }

  refresh() {
    this.players = [];
    resetNamePool();
    // 40 oyuncu üret (yıldız, genç, ucuz vs)
    const sizes = [
      { count: 3, stars: 3, minAge: 24, maxAge: 32 }, // yıldız
      { count: 6, stars: 2, minAge: 22, maxAge: 30 }, // kaliteli
      { count: 12, stars: 1, minAge: 18, maxAge: 23 }, // genç
      { count: 12, stars: 1, minAge: 24, maxAge: 30 }, // ortalama
      { count: 7, stars: 1, minAge: 31, maxAge: 36 }, // yaşlı
    ];
    for (const size of sizes) {
      for (let i = 0; i < size.count; i++) {
        const team = buildTeam('Market', '442', true);
        const p = team.players[0]; // ilk oyuncuyu al
        p.age = size.minAge + Math.floor(Math.random() * (size.maxAge - size.minAge));
        p.stars = size.stars;
        p.potential = 50 + size.stars * 15 + Math.floor(Math.random() * 10);
        // attrs yeniden ayarla
        const baseAttrs = {
          GK: { reflexes: 60, positioning: 60, composure: 60, passing: 50 },
          DF: { tackling: 60, marking: 60, interception: 60, aerial: 60, passing: 55 },
          OS: { passing: 60, vision: 60, decisions: 60, firstTouch: 60, dribbling: 55 },
          FV: { finishing: 60, composure: 60, shooting: 60, pace: 60, firstTouch: 60 },
        }[p.position] || {};
        for (const key in baseAttrs) {
          const variance = (Math.random() - 0.5) * 15;
          p.attrs[key] = Math.max(30, Math.min(95, baseAttrs[key] + variance + (size.stars - 1) * 8));
        }
        p.live = {
          x: 50, y: 35, currentStamina: 100, currentMorale: 60, form: 0,
          extraEffort: 0, yellowCount: 0, redCard: false, injured: false,
          passesAttempted: 0, passesCompleted: 0, shots: 0, shotsOnTarget: 0,
          goals: 0, saves: 0, conceded: 0, yellowCards: 0, foulsCommitted: 0,
          onField: false,
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
    return this.players.filter(p => {
      if (position && p.position !== position) return false;
      if (maxPrice && p.value > maxPrice) return false;
      if (maxAge && p.age > maxAge) return false;
      if (minStars && p.stars < minStars) return false;
      return true;
    });
  }
}

// === TAKIM BÜTÇESİ ===
export class ClubBudget {
  constructor(initialBudget = STARTING_BUDGET) {
    this.budget = initialBudget;
    this.weeklyWages = 0;
    this.transferBudget = initialBudget;
    this.history = []; // [{type, amount, week, reason}]
  }

  // Maaşları güncelle (oyuncu kadrosuna göre)
  updateWages(players) {
    this.weeklyWages = players.reduce((s, p) => s + (p.wage || WEEKLY_WAGE_BASE), 0);
  }

  // Haftalık maaş öde
  payWeeklyWages(week) {
    if (this.weeklyWages > this.budget) {
      // Bütçe yetersiz, kadro küçült veya iflas et
      this.history.push({ type: 'wage_partial', amount: -this.budget, week, reason: 'Yetersiz bütçe' });
      this.budget = 0;
      return { ok: false, reason: 'Yetersiz bütçe' };
    }
    this.budget -= this.weeklyWages;
    this.history.push({ type: 'wage', amount: -this.weeklyWages, week, reason: 'Haftalık maaş' });
    return { ok: true };
  }

  // Transfer gelir
  receiveTransfer(amount, playerName, week) {
    this.budget += amount;
    this.history.push({ type: 'transfer_in', amount, week, reason: `${playerName} satıldı` });
  }

  // Transfer gider
  spendTransfer(amount, playerName, week) {
    if (amount > this.budget) return { ok: false, reason: 'Yetersiz bütçe' };
    this.budget -= amount;
    this.history.push({ type: 'transfer_out', amount: -amount, week, reason: `${playerName} alındı` });
    return { ok: true };
  }

  // Maç geliri (sponsor, bilet, yayın)
  receiveMatchIncome(week, won = false) {
    const base = 200_000;
    const winBonus = won ? 100_000 : 0;
    this.budget += base + winBonus;
    this.history.push({ type: 'match_income', amount: base + winBonus, week, reason: won ? 'Galibiyet primi' : 'Maç geliri' });
  }
}

// === TEKLİF ===
// Kulüp teklif veriyor → karşı kulüp kabul/red ediyor
export function generateOfferResponse(seller, buyer, askingPrice, player) {
  // Oyuncunun değerine göre fiyat belirle
  const playerValue = calculatePlayerValue(player);
  const offerRatio = askingPrice / playerValue;

  // Çok düşük teklif → red
  if (offerRatio < 0.6) return { accept: false, reason: 'Teklif çok düşük' };

  // Oyuncunun yaşı ve potential'ı etkili
  const age = player.age ?? 25;
  const isYoung = age < 24;
  const isOld = age > 30;
  const potential = player.potential ?? playerValue;
  const isHighPotential = potential > player.attrs?.finishing || 80;

  // Genç + yüksek potansiyel → satmak istemez
  if (isYoung && isHighPotential && offerRatio < 1.5) {
    return { accept: false, reason: 'Yıldız adayı, satmak istemiyoruz' };
  }

  // Yaşlı + düşük teklif → satmak ister
  if (isOld && offerRatio > 0.7) {
    return { accept: true, reason: 'Sözleşme bitiyor, satmak istiyoruz' };
  }

  // Stars etkisi
  if (player.stars >= 3 && offerRatio < 1.8) {
    return { accept: false, reason: 'Yıldız oyuncu, çok değerli' };
  }

  // Yeterli teklif
  if (offerRatio > 0.9) {
    return { accept: true, reason: 'Kabul edilebilir teklif' };
  }

  // Belirsiz
  if (Math.random() < 0.5) {
    return { accept: true, reason: 'Kabul' };
  }
  return { accept: false, reason: 'Red' };
}
