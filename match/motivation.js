// match/motivation.js
// Motivation Engine — kart, sakatlık, moral, momentum, oyuncu durumu.
//
// Bu modül, simülasyonun duygusal/fiziksel katmanı. Maç boyunca:
//
// 1. KART MANTIĞI (yellow card accumulation)
//    - İlk sarı → uyarı (1 dakika cooldown)
//    - İkinci sarı → kırmızı kart (oyuncu atılır)
//    - Direkt kırmızı kart (çok sert faul)
//    - Oyuncu atılınca takım 10 kişi kalır → kontrol zorlaşır
//
// 2. SAKATLIK (injury)
//    - Sert faul sonrası %3 sakatlık ihtimali
//    - Stamina < 15 ise %5 sakatlık (kas çekmesi)
//    - Sakatlık süresi: 2-6 hafta (oyuncu o maç oynayamaz)
//    - Sakatlık tipleri: hafif, orta, ağır
//
// 3. MOTİVASYON / MORAL
//    - Gol atan takım: +8 morale
//    - Gol yiyen takım: -5 morale
//    - Geride olan son 15dk: -2 morale/dk (panik)
//    - Önde olan son 15dk: +1 morale/dk (rahatlık)
//    - 10 kişi kalan: -3 morale/dk (kötüleşen durum)
//
// 4. STAMINA & YORGUNLUK
//    - Pozisyona göre decay (zaten var, calc.js'de)
//    - Yorgun oyuncu (stamina < 30): -5 morale, hata riski +%20
//    - 60+ dakika oynayan: artan yorgunluk
//
// 5. FORM (son maçlardan)
//    - Şu an sadece placeholder — dış kod update eder
//
// 6. MOMENTUM
//    - Top kontrolü + son olaylar + moral
//    - 0.5 nötr, >0.5 ev sahibi lehine
//    - Her dakika yeniden hesaplanır

import { PITCH, inHomeBox, inAwayBox, inAnyBox } from './state.js';

// === KART YÖNETİCİSİ ===
//
// Her oyuncu için: yellowCount, redCard, banRisk
// banRisk: bir sonraki sarıda cezalı olma riski (sarı birikimi)

const STAMINA_DECAY = { GK: 0.05, DF: 0.10, OS: 0.15, FV: 0.13 };

export class MotivationEngine {
  constructor(match) {
    this.match = match;
    this.recentEvents = [];      // son N olay (narrative için)
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
  giveCard(side, playerId, type = 'yellow') {
    const player = this._player(side, playerId);
    if (!player) return null;

    player.live = player.live || {};
    player.live.yellowCount = player.live.yellowCount || 0;
    player.live.redCard = player.live.redCard || false;

    const event = {
      minute: this.minute,
      type: 'yellow_card',
      side,
      actor: playerId,
      text: '',
    };

    if (type === 'red') {
      // Direkt kırmızı
      player.live.redCard = true;
      player.onField = false;
      this.match.stats.redCards[side]++;
      event.type = 'red_card';
      event.text = `${this.minute}' 🟥 ${player.name} direkt kırmızı kart! Oyun dışı.`;
      this._pushRecent(event);
      this._broadcastMorale(side, -5, '10 kişi kaldık!');
      return { event, kind: 'red_direct' };
    }

    if (type === 'second_yellow') {
      // İkinci sarı → kırmızı
      player.live.yellowCount = (player.live.yellowCount || 0) + 1;
      player.live.redCard = true;
      player.onField = false;
      this.match.stats.redCards[side]++;
      event.type = 'red_card';
      event.text = `${this.minute}' 🟥 ${player.name} ikinci sarıdan atıldı!`;
      this._pushRecent(event);
      this._broadcastMorale(side, -8, 'İkinci sarı! 10 kişi kaldık');
      return { event, kind: 'red_second_yellow' };
    }

    // İlk sarı
    player.live.yellowCount = (player.live.yellowCount || 0) + 1;
    this.match.stats.yellowCards[side]++;
    event.text = `${this.minute}' 🟨 ${player.name} sarı kart gördü.`;

    // Eğer zaten 1 sarısı varsa bu zaten second_yellow olarak gelmeli
    // (Bu koruma: yanlışlıkla 2. sarı yellow olarak gelirse red'e çevir)
    if (player.live.yellowCount >= 2) {
      return this.giveCard(side, playerId, 'second_yellow');
    }

    this._pushRecent(event);
    return { event, kind: 'yellow' };
  }

  // === SAKATLIK KONTROLÜ ===
  // Şu an saha üzerindeki tüm oyuncular için stamina bazlı + faul sonrası kontrol.
  _checkInjuries() {
    for (const side of ['home', 'away']) {
      const team = this.match[side];
      if (!team?.players) continue;

      for (const p of team.players) {
        if (!p.onField) continue;
        p.live = p.live || {};
        const stamina = p.live.currentStamina ?? 100;

        // Yorgunluk sakatlığı: stamina < 15 → %1/dk
        if (stamina < 15 && Math.random() < 0.01) {
          this._injurePlayer(side, p, 'yorgunluk', 'light');
          continue;
        }

        // Orta yorgunluk: stamina < 30 → %0.2/dk (kas çekmesi)
        if (stamina < 30 && Math.random() < 0.002) {
          this._injurePlayer(side, p, 'kas gerilmesi', 'light');
        }

        // Stamina < 8 → ciddi sakatlık %2/dk
        if (stamina < 8 && Math.random() < 0.02) {
          this._injurePlayer(side, p, 'kas yırtığı', 'medium');
        }
      }
    }
  }

  // Dışarıdan çağrı: belirli bir oyuncuyu sakatlık olarak işaretle
  // (sert faul sonrası vs.)
  triggerInjury(side, playerId, reason = 'mücadele sakatlığı', severity = 'light') {
    const p = this._player(side, playerId);
    if (!p || !p.onField) return null;
    return this._injurePlayer(side, p, reason, severity);
  }

  // === HARİCİ SAKATLIK TETİKLEME (sert faul sonrası) ===
  // Dönüş: { event, injury } veya null
  tryInjuryFromFoul(side, playerId, severity = 'light') {
    const player = this._player(side, playerId);
    if (!player || !player.onField) return null;
    // Sert faul → %4 sakatlık ihtimali (yarı yarıya azaltıldı)
    if (Math.random() < 0.04) {
      return this._injurePlayer(side, player, 'sert faul', severity);
    }
    return null;
  }

  _injurePlayer(side, player, reason, severity = 'light') {
    const durationMap = { light: 1, medium: 3, heavy: 6 };
    const weeks = durationMap[severity] || 1;

    player.live.injured = true;
    player.live.injuryWeeks = weeks;
    player.live.injuryReason = reason;
    player.live.injuredThisTick = true; // substitution engine için
    player.onField = false;

    const event = {
      minute: this.minute,
      type: 'injury',
      side,
      actor: player.id,
      severity,
      text: `${this.minute}' 🏥 ${player.name} sakatlandı (${reason}). Oyun dışı, ~${weeks} hafta.`,
    };
    this._pushRecent(event);
    this._broadcastMorale(side, -3, `${player.name} sakatlandı`);

    // Substitution engine: sakatlanan oyuncu için otomatik değişiklik tetikle
    // (autoSubs=true ise direkt değiştir, false ise callback ile kullanıcıya bırak)
    let subEvent = null;
    if (this.match.substitution) {
      if (this.match.substitution.autoSubs) {
        const subResult = this.match.substitution._trySubstitute(
          side, player, 'Sakatlık', 'Sakatlıktan dolayı çıktı'
        );
        if (subResult?.event) {
          subEvent = subResult.event;
          this._pushRecent(subEvent);
        }
      } else {
        // Başkan modu: substitution engine onu zaten çıkardı, kullanıcı seçecek
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

    // Son 15dk + geride olan → panik
    if (minute > 75) {
      const homeBehind = home < away;
      const awayBehind = away < home;
      if (homeBehind) this._teamMoraleDrift('home', -2);
      if (awayBehind) this._teamMoraleDrift('away', -2);

      // Önde olan → rahat
      if (home > away) this._teamMoraleDrift('home', +1);
      if (away > home) this._teamMoraleDrift('away', +1);
    }

    // 10 kişi kalan takım
    const homeOnField = this.match.home.players.filter(p => p.onField).length;
    const awayOnField = this.match.away.players.filter(p => p.onField).length;
    if (homeOnField < 11) this._teamMoraleDrift('home', -3);
    if (awayOnField < 11) this._teamMoraleDrift('away', -3);

    // Morale sınırları
    for (const side of ['home', 'away']) {
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
    this._teamMoraleDrift(side, +8);
    const opp = side === 'home' ? 'away' : 'home';
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
    const possessionFactor = home / total; // 0-1

    // Moral farkı
    const homeMorale = this._avgMorale('home');
    const awayMorale = this._avgMorale('away');
    const moraleFactor = (homeMorale - awayMorale + 100) / 200; // 0-1

    // Son olaylar: son 5 dakikadaki kritik olaylar
    const recentCritical = this.recentEvents.filter(e =>
      e.minute >= this.minute - 5 && ['goal', 'yellow_card', 'red_card'].includes(e.type)
    );
    let eventFactor = 0.5;
    for (const e of recentCritical) {
      if (e.type === 'goal') eventFactor += e.side === 'home' ? 0.1 : -0.1;
      if (e.type === 'red_card') eventFactor += e.side === 'home' ? -0.1 : 0.1; // kırmızı yiyen aleyhine
    }
    eventFactor = Math.max(0, Math.min(1, eventFactor));

    // Ağırlıklı ortalama
    this.match.momentum = possessionFactor * 0.5 + moraleFactor * 0.3 + eventFactor * 0.2;
  }

  _avgMorale(side) {
    const team = this.match[side];
    if (!team?.players) return 60;
    const onField = team.players.filter(p => p.onField);
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
      shots: live.shots || 0,
    };
  }

  getTeamStatus(side) {
    const team = this.match[side];
    if (!team?.players) return null;
    return {
      name: team.name,
      onField: team.players.filter(p => p.onField).length,
      avgMorale: Math.round(this._avgMorale(side)),
      avgStamina: Math.round(team.players.filter(p => p.onField)
        .reduce((s, p) => s + (p.live?.currentStamina ?? 100), 0) / Math.max(1, team.players.filter(p => p.onField).length)),
      injuries: team.players.filter(p => p.live?.injured).map(p => p.name),
      yellows: team.players.filter(p => (p.live?.yellowCount || 0) > 0).map(p => ({
        name: p.name, count: p.live.yellowCount,
      })),
      reds: team.players.filter(p => p.live?.redCard).map(p => p.name),
    };
  }

  // === YARDIMCILAR ===
  _player(side, id) {
    return this.match[side]?.players?.find(p => p.id === id || p.name === id) || null;
  }

  _pushRecent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecent) this.recentEvents.shift();
  }
}

export function createMotivation(match) {
  return new MotivationEngine(match);
}
