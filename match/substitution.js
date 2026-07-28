// match/substitution.js
// Oyuncu değişikliği motoru — yorgun, sakat, kartlı oyuncuları çıkarır.
//
// Kurallar:
//   - Her takım 3 değişiklik hakkı (kural 3)
//   - Otomatik tetikleyiciler:
//     * Sakatlanan oyuncu (motivation engine'den)
//     * Kırmızı kart yiyen oyuncu
//     * Çok yorgun oyuncu (stamina < 12, 60+ dakika)
//     * Aynı oyuncunun tekrarı sakatlanırsa
//   - Manuel değişiklik (UI'dan tetiklenebilir, v2)
//   - Değişiklik mantığı:
//     * Pozisyona uygun yedek seç (yoksa en yakın)
//     * En yüksek yetenek skoruna göre
//     * Yedek oyuncunun stamina > 80 tercih edilir

import { findPlayerByPos } from './state.js';

const MAX_SUBSTITUTIONS = 3;
const STAMINA_AUTO_SUB = 20; // < bu ise otomatik değişiklik (yorgun)
const MIN_MINUTE_FOR_AUTO_SUB = 50; // 50. dakikadan önce zorla değişiklik yapma

export class SubstitutionEngine {
  constructor(match, options = {}) {
    this.match = match;
    this.autoSubs = options.autoSubs !== false; // default true
    this.onInjury = options.onInjury || null; // callback (side, player)
    this.substitutions = {
      home: { used: 0, history: [] },
      away: { used: 0, history: [] },
    };
  }

  // Her dakika kontrol et
  // autoSubs=false → otomatik değişiklik YAPMA (Başkan modu)
  // Sadece sakatlık sonrası zorunlu değişiklik için kullanılabilir
  tick() {
    if (this.match.minute < MIN_MINUTE_FOR_AUTO_SUB) return;

    if (this.autoSubs === false) {
      // Başkan modu: sadece sakatlığa zorla değişiklik (callback tetiklenir)
      for (const side of ['home', 'away']) {
        this._checkInjurySubs(side);
      }
      return;
    }

    for (const side of ['home', 'away']) {
      this._checkAutoSubs(side);
    }
  }

  // Başkan modu: sakatlanan oyuncuyu kenara al, callback tetikle
  // (Kullanıcı modal'da yedek seçecek)
  _checkInjurySubs(side) {
    if (this.substitutions[side].used >= MAX_SUBSTITUTIONS) return;
    const team = this.match[side];
    if (!team?.players) return;

    const injured = team.players.filter(p => p.live?.injured && p.live?.injuredThisTick);
    for (const p of injured) {
      // Oyuncuyu sahadan çıkar ama yedek seçimi kullanıcıya bırak
      p.onField = false;
      p.live.injuredThisTick = false; // tek seferlik
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

    const onField = team.players.filter(p => p.onField);
    for (const p of onField) {
      // Zaten atılmış oyuncu — atla
      if (p.live?.redCard) continue;

      const stamina = p.live?.currentStamina ?? 100;
      const injured = p.live?.injured;
      const yellows = p.live?.yellowCount || 0;

      // 1) Sakatlık → değiştir
      if (injured) {
        this._trySubstitute(side, p, 'Sakatlık', 'Sakatlıktan dolayı çıktı');
        continue;
      }

      // 2) Çok yorgun + sarı → değiştir
      if (stamina < STAMINA_AUTO_SUB && yellows >= 1) {
        this._trySubstitute(side, p, 'Yorgunluk + kart riski', 'Çok yorgun ve sınırda');
        continue;
      }

      // 3) Çok yorgun (60+ dakika, eşik düşük)
      if (this.match.minute >= 60 && stamina < 18) {
        this._trySubstitute(side, p, 'Yorgunluk', 'Ayakları tutmadı, taze kan girdi');
      }

      // 4) Son 15 dakika çok yorgun
      if (this.match.minute >= 75 && stamina < 30) {
        this._trySubstitute(side, p, 'Taktik değişiklik', 'Son dakikada yoruldu, değişiklik');
      }
    }
  }

  // Manuel değişiklik (UI'dan)
  manualSub(side, outId, inId) {
    if (this.substitutions[side].used >= MAX_SUBSTITUTIONS) {
      return { ok: false, reason: 'Değişiklik hakkı kalmadı (3/3)' };
    }
    const outPlayer = this._player(side, outId);
    const inPlayer = this._player(side, inId);
    if (!outPlayer || !inPlayer) return { ok: false, reason: 'Oyuncu bulunamadı' };
    if (!outPlayer.onField) return { ok: false, reason: 'Oyuncu sahada değil' };
    if (inPlayer.onField) return { ok: false, reason: 'Yedek zaten sahada' };
    return this._execute(side, outPlayer, inPlayer, 'Taktik değişiklik', 'Menajer istedi');
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

    const bench = team.players.filter(p => !p.onField && !p.live?.redCard);
    if (!bench.length) return null;

    // 1) Aynı pozisyon
    const samePos = bench.filter(p => p.position === outPlayer.position);
    if (samePos.length) {
      return this._pickBest(samePos);
    }

    // 2) En yakın pozisyon (GK→GK, DF↔OS, OS↔DF/FV, FV↔OS)
    const adjacent = this._adjacentPositions(outPlayer.position);
    const adjPlayers = bench.filter(p => adjacent.includes(p.position));
    if (adjPlayers.length) {
      return this._pickBest(adjPlayers);
    }

    // 3) Herhangi bir yedek
    return this._pickBest(bench);
  }

  _pickBest(players) {
    // En yüksek yetenek skoruna göre sırala
    const scored = players.map(p => {
      const stamina = p.live?.currentStamina ?? 100;
      const attrs = p.attrs || {};
      const total = Object.values(attrs).reduce((s, v) => s + (v || 0), 0);
      const avg = total / Math.max(1, Object.keys(attrs).length);
      // Yüksek stamina + yüksek yetenek tercih edilir
      return { p, score: avg * 0.6 + stamina * 0.4 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.p || null;
  }

  _adjacentPositions(role) {
    return {
      GK: ['GK'],
      DF: ['DF', 'OS'],
      OS: ['OS', 'DF', 'FV'],
      FV: ['FV', 'OS'],
    }[role] || [role];
  }

  _execute(side, outPlayer, inPlayer, reason, narrative) {
    outPlayer.onField = false;
    inPlayer.onField = true;
    inPlayer.live = inPlayer.live || {};
    inPlayer.live.currentStamina = inPlayer.live.currentStamina ?? 100;

    // Değişiklik kaydı
    const sub = {
      minute: this.match.minute,
      side,
      out: { id: outPlayer.id, name: outPlayer.name, position: outPlayer.position },
      in: { id: inPlayer.id, name: inPlayer.name, position: inPlayer.position },
      reason,
      narrative,
    };
    this.substitutions[side].used++;
    this.substitutions[side].history.push(sub);

    // Event
    const ev = {
      minute: this.match.minute,
      type: 'substitution',
      side,
      actor: outPlayer.id,
      target: inPlayer.id,
      text: `${this.match.minute}' 🔄 Değişiklik: ${outPlayer.name} çıktı, ${inPlayer.name} girdi (${reason}).`,
    };
    this.match.events = this.match.events || [];
    this.match.events.push(ev);

    return { ok: true, sub, event: ev };
  }

  _player(side, id) {
    return this.match[side]?.players?.find(p => p.id === id || p.name === id) || null;
  }

  getRemainingSubs(side) {
    return Math.max(0, MAX_SUBSTITUTIONS - this.substitutions[side].used);
  }

  getSubHistory(side) {
    return this.substitutions[side].history;
  }
}

export function createSubstitution(match, options) {
  return new SubstitutionEngine(match, options);
}

export { MAX_SUBSTITUTIONS };
