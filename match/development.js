// match/development.js
// Oyuncu gelişim motoru — yaş, performans, antrenman.
//
// Her oyuncunun:
//   - age: yaş (16-38)
//   - potential: max olgunlaşma puanı
//   - currentAbility: anlık yetenek
//   - growthRate: yıllık gelişim hızı
//   - declineStart: yaşlanma başlangıç yaşı
//   - form: son maçlardaki performans
//
// Her sezon sonu (veya hafta sonu) gelişim uygulanır.
// Genç oyuncular (18-23) hızlı gelişir.
// 28+ yaş yavaş yavaş düşer.
// 33+ hızlı düşer.

const DECLINE_START = 28;
const PEAK_AGE_MIN = 24;
const PEAK_AGE_MAX = 30;

export class DevelopmentEngine {
  constructor() {
    this.weekNumber = 0;
  }

  // Yaşa göre gelişim katsayısı
  _growthFactor(age) {
    if (age < 18) return 0.0; // çok genç
    if (age <= 23) return 0.8; // hızlı gelişim
    if (age <= PEAK_AGE_MAX) return 0.2; // yavaş
    if (age <= DECLINE_START) return 0.0; // plato
    if (age <= 32) return -0.3; // yavaş düşüş
    if (age <= 35) return -0.7; // orta düşüş
    return -1.2; // hızlı düşüş
  }

  // Potansiyel hesapla (oyuncunun başlangıç potential'ı)
  calculatePotential(attrs, stars) {
    const base = Object.values(attrs).reduce((s, v) => s + v, 0) / Object.keys(attrs).length;
    // Stars 1: max +5, 2: max +15, 3: max +25
    const starBonus = (stars - 1) * 10;
    return Math.round(base + starBonus + Math.random() * 10);
  }

  // Oyuncuya yaş ata
  assignAge(player) {
    // Yıldız oyuncu (stars >=2) biraz daha yaşlı (24-32)
    // Genç oyuncu (stars 1) çeşitli (17-30)
    if (player.stars >= 2) {
      player.age = 24 + Math.floor(Math.random() * 8);
    } else {
      // %30 şans genç oyuncu
      if (Math.random() < 0.3) {
        player.age = 17 + Math.floor(Math.random() * 5); // 17-21
      } else {
        player.age = 22 + Math.floor(Math.random() * 9); // 22-30
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
    const weekDelta = baseGrowth * 0.05; // haftalık (yıllık / 50 hafta)

    // Performans bonusu: avg rating > 7 → bonus
    let performanceBonus = 0;
    if (options.lastRating && options.lastRating > 7.0) {
      performanceBonus = (options.lastRating - 7.0) * 0.1;
    } else if (options.lastRating && options.lastRating < 5.5) {
      performanceBonus = -0.05; // kötü performans hafif düşüş
    }

    // Antrenman
    let trainingBonus = 0;
    if (options.training) {
      trainingBonus = options.training * 0.05;
    }

    const totalDelta = weekDelta + performanceBonus + trainingBonus;

    // Her attribute'a uygula (currentAbility)
    if (!player.attrs) return;
    for (const key in player.attrs) {
      const current = player.attrs[key];
      const newValue = current + totalDelta;
      // Potential üstü çıkamaz, 30 altına inemez
      player.attrs[key] = Math.max(30, Math.min(player.potential ?? 95, newValue));
    }

    // Yaş artır
    player.age = age;
    return totalDelta;
  }

  // Sezon sonu (yıllık) büyük güncelleme
  applySeasonalDevelopment(player) {
    const age = player.age ?? 25;
    const baseGrowth = this._growthFactor(age);
    const yearDelta = baseGrowth * 0.5; // yıllık

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
    let score = 6.5; // başlangıç ortalama
    let goals = 0, assists = 0, shots = 0, passes = 0, passSuccess = 0;
    let tackles = 0, intercepts = 0, saves = 0, yellows = 0, reds = 0;

    const playerId = player.id;
    for (const ev of matchEvents) {
      if (ev.actor === playerId || ev.scorer === playerId) {
        if (ev.type === 'goal') { goals++; score += 2.0; }
        else if (ev.type === 'shot' || ev.reason === 'sut_isabetsiz' || ev.reason === 'kaleciKurtardi') { shots++; score += 0.1; }
        else if (ev.type === 'pass_success') { passes++; passSuccess++; score += 0.05; }
        else if (ev.type === 'tackle_won') { tackles++; score += 0.2; }
        else if (ev.type === 'yellow_card') { yellows++; score -= 0.3; }
        else if (ev.type === 'red_card') { reds++; score -= 2.0; }
      }
      if (ev.target === playerId) {
        if (ev.type === 'goal' && ev.scorer !== playerId) { assists++; score += 1.0; }
      }
    }

    return Math.max(3.0, Math.min(10.0, score));
  }

  // Oyuncunun potansiyeline göre ne kadar gelişebilir
  potentialProgress(player) {
    if (!player.attrs || !player.potential) return 0;
    const current = Object.values(player.attrs).reduce((s, v) => s + v, 0) / Object.keys(player.attrs).length;
    return Math.max(0, player.potential - current);
  }
}

export function createDevelopment() {
  return new DevelopmentEngine();
}
