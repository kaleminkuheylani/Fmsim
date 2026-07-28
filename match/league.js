// match/league.js
// Lig sistemi — sezon, haftalar, puan durumu, AI rakipler.
//
// Lig yapısı:
//   - 18 takım (1 kullanıcı + 17 AI)
//   - 34 hafta (her takım 2 kez karşılaşır: iç deplasman)
//   - Puan durumu: G=3, B=1, M=0
//   - Hafta sonu: kullanıcının maçı + AI maçları otomatik
//   - Sezon sonu: şampiyon belirlenir, gelişim uygulanır

import { generateUniqueClubName, resetClubPool } from './clubName.js';
import { buildTeam } from './teamBuilder.js';
import { createDevelopment } from './development.js';
import { calculatePlayerValue, ClubBudget } from './transfer.js';

const LEAGUE_SIZE = 18;
const WEEKS_PER_SEASON = 34;
const SEASON_STARTING_BUDGET = 50_000_000;

export class League {
  constructor() {
    this.teams = []; // [{id, name, isUser, players, budget, points, played, won, drawn, lost, gf, ga, history}]
    this.fixtures = []; // [{week, homeId, awayId, played, result}]
    this.currentWeek = 0;
    this.season = 1;
    this.userTeamId = null;
    this.development = createDevelopment();
  }

  // Yeni sezon başlat
  setup(userTeam = null) {
    resetClubPool();
    this.teams = [];

    // Kullanıcı takımı varsa ekle
    if (userTeam) {
      const teamId = 'user';
      userTeam.id = teamId;
      userTeam.budget = new ClubBudget(SEASON_STARTING_BUDGET);
      userTeam.budget.updateWages(userTeam.players);
      userTeam.points = 0; userTeam.played = 0;
      userTeam.won = 0; userTeam.drawn = 0; userTeam.lost = 0;
      userTeam.gf = 0; userTeam.ga = 0;
      userTeam.history = [];
      userTeam.isUser = true;
      this.teams.push(userTeam);
      this.userTeamId = teamId;
    }

    // 17 AI takım
    for (let i = 0; i < LEAGUE_SIZE - (userTeam ? 1 : 0); i++) {
      const clubName = generateUniqueClubName();
      const team = buildTeam(clubName, '442', false);
      team.id = `ai_${i}`;
      team.budget = new ClubBudget(SEASON_STARTING_BUDGET);
      team.budget.updateWages(team.players);
      team.points = 0; team.played = 0;
      team.won = 0; team.drawn = 0; team.lost = 0;
      team.gf = 0; team.ga = 0;
      team.history = [];
      team.isUser = false;
      this.teams.push(team);
    }

    this._generateFixtures();
    return this.teams;
  }

  // Fikstür üret
  _generateFixtures() {
    // Round-robin: her takım herkesle 2 kez (iç-deplasman)
    const teams = this.teams.map(t => t.id);
    const fixtures = [];
    let week = 1;

    // Her hafta her takım 1 maç (1 maç/hafta/takım)
    // 18 takım = 9 maç/hafta, toplam 34 hafta (her takım 34 maç)
    // Round-robin çift devre: 17+17 = 34 maç

    for (let round = 0; round < (LEAGUE_SIZE - 1) * 2; round++) {
      // Her hafta maçları çiftleri
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

    // Her round'da rotasyon (dairesel)
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
        // İkinci devre: iç/deplasman yer değişir
        [home, away] = [away, home];
      }
      matches.push([home, away]);
    }
    return matches;
  }

  // Haftanın fikstürü
  getWeekFixtures(week) {
    return this.fixtures.filter(f => f.week === week);
  }

  // Kullanıcı takımının bu haftaki maçı
  getUserMatch(week) {
    return this.fixtures.find(f => f.week === week &&
      (f.homeId === this.userTeamId || f.awayId === this.userTeamId));
  }

  // Belirli bir haftayı oyna (AI maçları otomatik)
  playWeek(week, onUserMatchStart) {
    if (week < 1 || week > this.fixtures[this.fixtures.length - 1].week) {
      return { ok: false, reason: 'Geçersiz hafta' };
    }

    const weekFixtures = this.getWeekFixtures(week);
    const results = { aiMatches: [], userMatch: null };

    for (const fix of weekFixtures) {
      if (fix.played) continue;

      if (fix.homeId === this.userTeamId || fix.awayId === this.userTeamId) {
        // Kullanıcı maçı → callback
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

      // AI maçı → otomatik simüle
      const homeTeam = this.teams.find(t => t.id === fix.homeId);
      const awayTeam = this.teams.find(t => t.id === fix.awayId);
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
        events: simResult.events,
      });
    }

    // Maaş öde
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
    const homeAdvantage = 1.15; // iç saha avantajı

    // Ev sahibi lambda (beklenen gol)
    const homeLambda = (homeAbility * 0.04 * homeAdvantage) / (awayAbility * 0.04 + 0.5);
    const awayLambda = (awayAbility * 0.04) / (homeAbility * 0.04 * homeAdvantage + 0.5);

    // Poisson distribution'dan skor üret
    const homeScore = this._poissonRandom(homeLambda);
    const awayScore = this._poissonRandom(awayLambda);

    return { home: homeScore, away: awayScore, events: [] };
  }

  _teamAbility(team) {
    const onField = team.players.filter(p => p.onField);
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

    const home = this.teams.find(t => t.id === homeId);
    const away = this.teams.find(t => t.id === awayId);
    if (!home || !away) return;

    home.played++; away.played++;
    home.gf += result.home; home.ga += result.away;
    away.gf += result.away; away.ga += result.home;

    if (result.home > result.away) {
      home.won++; home.points += 3; home.budget.receiveMatchIncome(fix.week, true);
      away.lost++;
    } else if (result.home < result.away) {
      away.won++; away.points += 3; away.budget.receiveMatchIncome(fix.week, true);
      home.lost++;
    } else {
      home.drawn++; home.points += 1; home.budget.receiveMatchIncome(fix.week, false);
      away.drawn++; away.points += 1; away.budget.receiveMatchIncome(fix.week, false);
    }
  }

  // Puan durumu (sıralı)
  getStandings() {
    return [...this.teams]
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.gf - a.ga;
        const gdB = b.gf - b.ga;
        if (gdB !== gdA) return gdB - gdA;
        return b.gf - a.gf;
      })
      .map((t, idx) => ({
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
        budget: t.budget.budget,
      }));
  }

  // Sezon sonu
  endSeason() {
    // Gelişim uygula
    for (const team of this.teams) {
      for (const p of team.players) {
        this.development.applySeasonalDevelopment(p);
      }
    }
    this.season++;
    return { champion: this.getStandings()[0] };
  }
}

export { LEAGUE_SIZE, WEEKS_PER_SEASON, SEASON_STARTING_BUDGET };
