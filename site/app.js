// /workspace/site/app.js
// Narrative Spiker — Başkan Modu · Çoklu sayfa düzeni
// Routing: #/ (anasayfa), #/squad, #/transfers, #/standings, #/development
// Özel sayfa: #/match (maç sırasında otomatik açılır)

import {
  makeMatchState,
  startMatch as startMatchOrig,
  simulateMinute,
  buildTeam,
  generateUniqueName,
  generateUniqueClubName,
  resetNamePool,
  resetClubPool,
} from './js/match-engine.js';

import { ATTRS, ROLE_WEIGHTS } from './game/playerSchema.js';

if (window.lucide) lucide.createIcons();

// === STATE ===
let game = null;
let match = null;
let timer = null;
let searchQuery = '';
let allEvents = [];
let selectedInMatch = null;
let lastRoute = '/';
let lastReport = null;
let currentPlayerId = null;

// Maç 3 dakika sabit süre
const MATCH_DURATION_SEC = 180; // saniye
const TICK_INTERVAL_MS = 100;   // her tick 100ms = 0.1s maç zamanı
let matchStartTime = 0;
let matchSecondsElapsed = 0;

const STORAGE_KEY = 'narrative_spiker_save';

// === HELPERS ===
const $ = id => document.getElementById(id);

function formatMoney(amount) {
  if (amount == null) return '0 €';
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M €`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K €`;
  return `${amount} €`;
}

// Pozisyon sırası (GK → DF → OS → FV), içinde isim A→Z
const POSITION_ORDER = { GK: 1, DF: 2, OS: 3, FV: 4 };
function sortByPositionThenName(a, b) {
  const pa = POSITION_ORDER[a.position] || 99;
  const pb = POSITION_ORDER[b.position] || 99;
  if (pa !== pb) return pa - pb;
  return (a.name || '').localeCompare(b.name || '', 'tr');
}

function getUserTeam() {
  return game?.league?.teams?.find(t => t.id === 'user') || null;
}

function getUserMatchThisWeek() {
  if (!game) return null;
  const wk = game.league.currentWeek + 1;
  return game.league.fixtures.find(f => f.week === wk &&
    (f.homeId === 'user' || f.awayId === 'user'));
}

function getOpponentId() {
  const fix = getUserMatchThisWeek();
  if (!fix) return null;
  return fix.homeId === 'user' ? fix.awayId : fix.homeId;
}

function getOpponentTeam() {
  const oppId = getOpponentId();
  if (!oppId) return null;
  return game.league.teams.find(t => t.id === oppId);
}

// === TOPBAR ===
const els = {
  tWeek: $('t-week'),
  tPoints: $('t-points'),
  tRank: $('t-rank'),
  tBudget: $('t-budget'),
  tSeason: $('t-season'),
  btnReset: $('btn-reset'),
  teamCard: $('team-card'),
  // page home
  btnPlayWeek: $('btn-play-week'),
  btnPlayLabel: $('btn-play-label'),
  btnResumeMatch: $('btn-resume-match'),
  nextHome: $('next-home'),
  nextAway: $('next-away'),
  nextHomePos: $('next-home-pos'),
  nextAwayPos: $('next-away-pos'),
  wfWeek: $('wf-week'),
  wfList: $('wf-list'),
  recentResults: $('recent-results'),
  // opponent info
  oppTeamName: $('opp-team-name'),
  oppTeamMeta: $('opp-team-meta'),
  oppLineup: $('opp-lineup'),
  oppInfo: $('opp-info'),
  // match page
  homeName: $('home-name'),
  awayName: $('away-name'),
  homeScore: $('home-score'),
  awayScore: $('away-score'),
  matchMinute: $('match-minute'),
  clockLabel: $('clock-label'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),
  btnSkipMatch: $('btn-skip-match'),
  narrativeStream: $('narrative-stream'),
  eventsList: $('events-list'),
  eventCount: $('event-count'),
  search: $('search'),
  searchClear: $('search-clear'),
  searchInfo: $('search-info'),
  homePlayers: $('home-players'),
  homeYellows: $('home-yellows'),
  homeReds: $('home-reds'),
  awayPlayers: $('away-players'),
  awayYellows: $('away-yellows'),
  awayReds: $('away-reds'),
  homeSubs: $('home-subs'),
  awaySubs: $('away-subs'),
  // report
  repHome: $('rep-home'),
  repAway: $('rep-away'),
  repHomeScore: $('rep-home-score'),
  repAwayScore: $('rep-away-score'),
  repResultText: $('rep-result-text'),
  repMeta: $('rep-meta'),
  statsGrid: $('stats-grid'),
  playTimeline: $('play-timeline'),
  btnBackHome: $('btn-back-home'),
  btnNextWeek: $('btn-next-week'),
  btnSubInMatch: $('btn-sub-in-match'),
  // sub modal
  subModal: $('sub-modal'),
  subMessage: $('sub-message'),
  subOutList: $('sub-out-list'),
  subInList: $('sub-in-list'),
  btnSubCancel: $('btn-sub-cancel'),
  // injury notice
  injuryNoticeModal: $('injury-notice-modal'),
  injuryNoticeMessage: $('injury-notice-message'),
  btnInjuryOk: $('btn-injury-ok'),
  // tactics
  tacticsModal: $('tactics-modal'),
  tacticsGrid: $('tactics-grid'),
  formationGrid: $('formation-grid'),
  btnStartMatchConfirm: $('btn-start-match-confirm'),
  btnEditSquad: $('btn-edit-squad'),
  // match tactic info
  tiForm: $('ti-form'),
  tiTactic: $('ti-tactic'),
  tiAiTactic: $('ti-ai-tactic'),
  // squad
  lineupList: $('lineup-list'),
  benchList: $('bench-list'),
  squadLineupCount: $('squad-lineup-count'),
  squadBenchCount: $('squad-bench-count'),
  // transfers
  transferBudget: $('transfer-budget'),
  transferList: $('transfer-list'),
  filterPosition: $('filter-position'),
  filterAge: $('filter-age'),
  filterStars: $('filter-stars'),
  // standings
  standingsList: $('standings-list'),
  stdSeason: $('std-season'),
  // dev
  devList: $('dev-list'),
  // lineup
  lineupFormation: $('lineup-formation'),
  lineupPitch: $('lineup-pitch'),
  lineupBench: $('lineup-bench-list'),
  lineupBenchCount: $('bench-count'),
  lineupSavedInfo: $('lineup-saved-info'),
  btnLineupSave: $('btn-lineup-save'),
  btnLineupReset: $('btn-lineup-reset'),
  btnTacticsBoard: $('btn-tactics-board'),
  // player page
  playerPageName: $('player-page-name'),
  phName: $('ph-name'),
  phPos: $('ph-pos'),
  phMeta: $('ph-meta'),
  phRating: $('ph-rating'),
  phGoals: $('ph-goals'),
  phAssists: $('ph-assists'),
  phMatches: $('ph-matches'),
  phMoney: $('ph-money'),
  phAttrs: $('ph-attrs'),
  phRatingAvg: $('ph-rating-avg'),
  phAffinity: $('ph-affinity'),
  phTrainArea: $('ph-train-area'),
  phTrainBtn: $('ph-train-btn'),
  phLastPerf: $('ph-last-perf'),
  btnPlayerBack: $('btn-player-back'),
  // offers
  offersCard: $('offers-card'),
  offersList: $('offers-list'),
  offersCount: $('offers-count'),
};

// === ROUTING ===
function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  return hash;
}

function navigate(route) {
  window.location.hash = route;
}

function applyRoute() {
  const route = getRoute();
  lastRoute = route;

  // Active nav state
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  // Page visibility
  document.querySelectorAll('.page').forEach(p => {
    const visible = p.dataset.page === route;
    p.style.display = visible ? 'block' : 'none';
  });

  // Re-render based on route
  renderTopbar();
  if (route === '/') renderHome();
  else if (route === '/squad') renderSquad();
  else if (route === '/transfers') renderTransferPage();
  else if (route === '/standings') renderStandingsPage();
  else if (route === '/development') renderDevelopmentPage();
  else if (route === '/lineup') renderLineupPage();
  else if (route === '/match') renderMatchPage();
  else if (route === '/report') renderReport();
  else if (route === '/player') renderPlayerPage();
  if (window.lucide) lucide.createIcons();
}

window.addEventListener('hashchange', applyRoute);

// === GAME INIT ===
function newGame() {
  resetNamePool();
  resetClubPool();

  const { League } = window.__NS;
  game = { league: new League() };
  const userClub = generateUniqueClubName();
  const userTeam = buildTeam(userClub, '442', true);
  for (const p of userTeam.players) {
    p.age = 18 + Math.floor(Math.random() * 18);
    p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
    p.value = 1_000_000 + p.stars * 2_000_000 + Math.floor(Math.random() * 1_000_000);
    p.wage = 50_000 + p.stars * 50_000;
    // Yıldız başına başlangıç kişisel parası
    p.personalMoney = 100_000 + p.stars * 50_000;
    p.goals = 0; p.assists = 0; p.matchesPlayed = 0; p.totalRating = 0;
  }
  game.league.setup(userTeam);
  game.league.userTeamId = 'user';
  deployLineupToTeam(userTeam);
  game.transferMarket = generateMarket();
  saveGame();
  applyRoute();
}

function deployLineupToTeam(team) {
  for (const p of team.players) p.onField = false;
  const positionOrder = ['GK', 'DF', 'OS', 'FV'];
  const slots = { GK: 1, DF: 4, OS: 4, FV: 2 };
  for (const pos of positionOrder) {
    const candidates = team.players
      .filter(p => p.position === pos)
      .sort((a, b) => (b.attrs?.[primaryAttrFor(pos)] || 0) - (a.attrs?.[primaryAttrFor(pos)] || 0));
    candidates.forEach((p, i) => { if (i < slots[pos]) p.onField = true; });
  }
}

function primaryAttrFor(pos) {
  return { GK: 'reflexes', DF: 'tackling', OS: 'passing', FV: 'finishing' }[pos] || 'passing';
}

function loadGame() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

function saveGame() {
  try {
    const data = {
      league: {
        currentWeek: game.league.currentWeek,
        season: game.league.season,
        teams: game.league.teams,
        fixtures: game.league.fixtures,
        userTeamId: 'user',
      },
      transferMarket: game.transferMarket,
      trainingPoints: game.trainingPoints,
      lastTrainingWeek: game.lastTrainingWeek,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { console.error('Save error', e); }
}

function generateMarket() {
  resetNamePool();
  const market = { players: [] };
  // Her seviyeye + her pozisyona hitap
  const positions = ['GK', 'DF', 'OS', 'FV'];
  const sizes = [
    { count: 3, stars: 1, minAge: 17, maxAge: 30, valueMul: 0.5 },
    { count: 2, stars: 2, minAge: 19, maxAge: 28, valueMul: 1.0 },
    { count: 1, stars: 3, minAge: 22, maxAge: 30, valueMul: 2.5 },
    { count: 1, stars: 4, minAge: 24, maxAge: 32, valueMul: 6.0 },
    { count: 1, stars: 5, minAge: 26, maxAge: 32, valueMul: 15.0 },
  ];
  for (const pos of positions) {
    for (const size of sizes) {
      for (let i = 0; i < size.count; i++) {
        const team = buildTeam('Market', '442', true);
        // İlgili pozisyondan bir oyuncu bul
        const p = team.players.find(pl => pl.position === pos) || team.players[0];
        p.position = pos; // emin ol
        p.age = size.minAge + Math.floor(Math.random() * (size.maxAge - size.minAge));
        p.stars = size.stars;
        p.potential = 70 + size.stars * 12 + Math.floor(Math.random() * 8);
        if (p.attrs) {
          for (const k in p.attrs) {
            p.attrs[k] = Math.max(20, Math.min(p.potential, p.attrs[k] + (size.stars - 1) * 8));
          }
        }
        const baseValue = 800_000 + size.stars * 1_500_000 + Math.floor(Math.random() * 1_500_000);
        p.value = Math.round(baseValue * size.valueMul);
        p.wage = 30_000 + size.stars * 40_000;
        p.live = p.live || { x: 50, y: 35, currentStamina: 100, rating: 6.5 };
        p.live.rating = 5.5 + size.stars * 0.6 + Math.random() * 0.4;
        p.starLabel = '★'.repeat(size.stars);
        market.players.push(p);
      }
    }
  }
  return market;
}

// === RENDER: TOPBAR ===
function renderTopbar() {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;
  els.tBudget.textContent = formatMoney(user.budget?.budget || 50_000_000);
  els.tWeek.textContent = game.league.currentWeek || 1;
  els.tSeason.textContent = game.league.season || 1;
  const standings = game.league.getStandings();
  const userStanding = standings.find(s => s.isUser);
  if (userStanding) {
    els.tPoints.textContent = userStanding.points;
    els.tRank.textContent = userStanding.pos;
  }
  els.teamCard.innerHTML = `
    <div class="nt-name">${user.name}</div>
    <div class="nt-meta">Lig: ${(standings[0]?.name) || '—'} önde</div>
  `;
}

// === RENDER: ANASAYFA ===
function renderHome() {
  if (!game) return;
  const wk = game.league.currentWeek + 1;
  els.wfWeek.textContent = wk;

  // Maç varsa "Maça Dön" butonu göster
  if (els.btnResumeMatch) {
    if (match && match.minute < 90) {
      els.btnResumeMatch.style.display = 'inline-flex';
    } else {
      els.btnResumeMatch.style.display = 'none';
    }
  }

  // Teklifler
  renderOffers();

  // Sonraki rakip
  renderOpponentInfo();

  const userMatch = getUserMatchThisWeek();
  if (userMatch) {
    const home = game.league.teams.find(t => t.id === userMatch.homeId);
    const away = game.league.teams.find(t => t.id === userMatch.awayId);
    els.nextHome.textContent = home?.name || '—';
    els.nextAway.textContent = away?.name || '—';
    els.nextHomePos.textContent = userMatch.homeId === 'user' ? 'Ev sahibi' : 'Deplasman';
    els.nextAwayPos.textContent = userMatch.awayId === 'user' ? 'Ev sahibi' : 'Deplasman';
  } else {
    els.nextHome.textContent = 'Sezon bitti!';
    els.nextAway.textContent = '';
  }

  // Fikstür listesi
  els.wfList.innerHTML = '';
  const fixtures = game.league.fixtures.filter(f => f.week === wk);
  for (const f of fixtures) {
    const home = game.league.teams.find(t => t.id === f.homeId);
    const away = game.league.teams.find(t => t.id === f.awayId);
    if (!home || !away) continue;
    const item = document.createElement('div');
    item.className = 'fixture-item';
    if (f.homeId === 'user' || f.awayId === 'user') item.classList.add('user');
    if (f.played) item.classList.add('played');
    const scoreText = f.result ? `${f.result.homeScore} - ${f.result.awayScore}` : '— : —';
    const scoreClass = f.result?.homeScore > f.result?.awayScore ? 'win' : f.result?.homeScore < f.result?.awayScore ? 'lose' : '';
    const time = f.homeId === 'user' || f.awayId === 'user' ? '20:30' : ['13:00', '16:00', '19:00'][Math.floor(Math.random() * 3)];
    item.innerHTML = `
      <div class="fi-time">${time}</div>
      <div class="fi-teams">
        <div class="fi-team ${f.homeId === 'user' ? 'user-team' : ''}">${home.name}</div>
        <div class="fi-score ${scoreClass}">${scoreText}</div>
        <div class="fi-team ${f.awayId === 'user' ? 'user-team' : ''}" style="text-align: left">${away.name}</div>
      </div>
      <div></div>
    `;
    els.wfList.appendChild(item);
  }

  // Recent results (son 5 hafta)
  els.recentResults.innerHTML = '';
  const playedFixtures = game.league.fixtures
    .filter(f => f.played && (f.homeId === 'user' || f.awayId === 'user'))
    .sort((a, b) => b.week - a.week)
    .slice(0, 5);
  if (playedFixtures.length === 0) {
    els.recentResults.innerHTML = '<div class="empty">Henüz maç oynamadın. "Haftayı Oyna" ile başla.</div>';
  } else {
    for (const f of playedFixtures) {
      const home = game.league.teams.find(t => t.id === f.homeId);
      const away = game.league.teams.find(t => t.id === f.awayId);
      const item = document.createElement('div');
      item.className = 'recent-item';
      const userHome = f.homeId === 'user';
      const userScore = userHome ? f.result.homeScore : f.result.awayScore;
      const oppScore = userHome ? f.result.awayScore : f.result.homeScore;
      const result = userScore > oppScore ? 'G' : userScore < oppScore ? 'M' : 'B';
      const resultColor = result === 'G' ? 'var(--good)' : result === 'M' ? 'var(--bad)' : 'var(--text-dim)';
      item.innerHTML = `
        <div class="ri-week">Hafta ${f.week}</div>
        <div class="ri-match">
          <strong style="color: ${resultColor}">${result}</strong>
          ${userHome ? away.name : home.name} · ${userScore}-${oppScore}
        </div>
        <div class="ri-score">${userScore}-${oppScore}</div>
      `;
      els.recentResults.appendChild(item);
    }
  }
}

// === CPU TRANSFER TEKLİFLERİ ===
function renderOffers() {
  if (!els.offersList) return;
  if (!game.offers) game.offers = [];
  if (game.offers.length === 0) {
    els.offersCard.style.display = 'none';
    return;
  }
  els.offersCard.style.display = 'block';
  els.offersCount.textContent = game.offers.length;
  els.offersList.innerHTML = '';
  for (const offer of game.offers) {
    const player = getUserTeam()?.players.find(p => p.id === offer.playerId);
    if (!player) continue;
    const item = document.createElement('div');
    item.className = 'offer-item';
    const ageCategory = player.age < 23 ? '🟢' : player.age < 28 ? '🔵' : '🟡';
    item.innerHTML = `
      <div class="oi-info">
        <div class="oi-player">${player.name} <span class="muted">${player.position} ${ageCategory} · ⭐${player.stars || 1}</span></div>
        <div class="oi-meta">İsteyen: <strong>${offer.fromClub}</strong> · ${player.matchesPlayed || 0} maç · ${player.goals || 0} gol · ${player.assists || 0} asist</div>
      </div>
      <div class="oi-amount">${formatMoney(offer.amount)}</div>
      <div class="oi-actions">
        <button class="btn btn-accept" data-oid="${offer.id}">Kabul</button>
        <button class="btn btn-reject" data-oid="${offer.id}">Red</button>
      </div>
    `;
    item.querySelector('.btn-accept').addEventListener('click', () => acceptOffer(offer.id));
    item.querySelector('.btn-reject').addEventListener('click', () => rejectOffer(offer.id));
    els.offersList.appendChild(item);
  }
  if (window.lucide) lucide.createIcons();
}

function acceptOffer(offerId) {
  if (!game) return;
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer) return;
  const user = getUserTeam();
  const player = user?.players.find(p => p.id === offer.playerId);
  if (!user || !player) return;
  // Bütçeye ekle
  user.budget.budget += offer.amount;
  if (user.budget.receiveTransferIncome) {
    user.budget.receiveTransferIncome(offer.amount, player.name, game.league.currentWeek);
  }
  // Oyuncuyu çıkar
  user.players = user.players.filter(p => p.id !== player.id);
  // Teklifi kaldır
  game.offers = game.offers.filter(o => o.id !== offerId);
  saveGame();
  applyRoute();
}

function rejectOffer(offerId) {
  if (!game) return;
  game.offers = game.offers.filter(o => o.id !== offerId);
  saveGame();
  applyRoute();
}

// Her hafta başı 1-3 teklif üret
function generateOffers(week) {
  if (!game) return;
  if (!game.offers) game.offers = [];
  // Zaten teklif varsa yeni üretme
  if (game.offers.length > 0) return;
  const user = getUserTeam();
  if (!user) return;

  const candidates = user.players.filter(p => {
    if (p.live?.injured || p.live?.suspended) return false;
    if (p.matchesPlayed < 1) return false; // en az 1 maç oynamış
    const rating = computePlayerRating(p);
    if (rating < 7.0) return false; // orta ve üstü
    return true;
  });

  // Her aday için teklife göre olasılık
  const selected = [];
  for (const p of candidates) {
    const rating = computePlayerRating(p);
    let chance = 0;
    if (rating >= 8.5) chance = 0.50;
    else if (rating >= 8.0) chance = 0.25;
    else if (rating >= 7.0) chance = 0.10;
    if (Math.random() < chance) selected.push(p);
  }

  if (selected.length === 0) return;

  // 1-3 arası teklif
  const numOffers = Math.min(3, Math.max(1, Math.floor(Math.random() * 3) + 1));
  const shuffled = selected.sort(() => Math.random() - 0.5).slice(0, numOffers);

  for (const player of shuffled) {
    // Kulüp ismi — kurgusal, pool'dan
    const fromClub = getRandomOpponentClubName();
    // Fiyat: value × (1.0-1.5)
    const multiplier = 1.0 + Math.random() * 0.5;
    const amount = Math.round((player.value || 1_000_000) * multiplier);

    game.offers.push({
      id: 'offer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      playerId: player.id,
      fromClub,
      amount,
      week,
    });
  }
}

function getRandomOpponentClubName() {
  // Lig'den bir AI kulüp adı
  if (!game?.league?.teams) return 'Bilinmeyen FK';
  const aiTeams = game.league.teams.filter(t => t.id !== 'user');
  return aiTeams[Math.floor(Math.random() * aiTeams.length)]?.name || 'Bilinmeyen FK';
}

// === RENDER: SONRAKI RAKİP KADROSU ===
function renderOpponentInfo() {
  if (!els.oppLineup) return;
  const opp = getOpponentTeam();
  if (!opp) {
    els.oppTeamName.textContent = '—';
    els.oppTeamMeta.textContent = '—';
    els.oppLineup.innerHTML = '<div class="empty">Sezon arası — rakip yok</div>';
    if (els.oppInfo) els.oppInfo.innerHTML = '';
    return;
  }

  els.oppTeamName.textContent = opp.shortName || opp.name;
  const style = opp.style || 'agresif';
  const power = opp.power || 3;
  const styleLabels = { agresif: '🔥', kontra: '⚡', normal: '⚖️', kanat: '↔️', merkez: '🎯', defansif: '🛡️' };
  const powerStars = '★'.repeat(power) + '☆'.repeat(5 - power);
  els.oppTeamMeta.textContent = `${styleLabels[style] || ''} ${style.toUpperCase()} · ${powerStars}`;

  // İlk 11
  const lineup = opp.players.filter(p => p.onField);
  els.oppLineup.innerHTML = '';
  // Pozisyona göre sırala
  const posOrder = { GK: 1, DF: 2, OS: 3, FV: 4 };
  lineup.sort((a, b) => (posOrder[a.position] || 5) - (posOrder[b.position] || 5));
  for (const p of lineup.slice(0, 11)) {
    const item = document.createElement('div');
    let cls = 'opp-player';
    let status = '';
    if (p.live?.injured) { cls += ' injured'; status = '🏥'; }
    else if (p.live?.suspended) { cls += ' suspended'; status = '🟥'; }
    item.className = cls;
    item.innerHTML = `
      <span class="op-pos">${p.position}</span>
      <span class="op-name">${p.name}</span>
      <span class="op-status">${status}</span>
    `;
    els.oppLineup.appendChild(item);
  }

  // İstatistik: sakat, cezalı, ortalama rating
  const injured = lineup.filter(p => p.live?.injured).length;
  const suspended = lineup.filter(p => p.live?.suspended).length;
  const avgRating = lineup.length ? (lineup.reduce((s, p) => s + (p.live?.rating || 6.5), 0) / lineup.length) : 6.5;
  const topScorer = [...lineup].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
  if (els.oppInfo) {
    els.oppInfo.innerHTML = `
      <div class="op-info-grid">
        <div class="op-info-item">
          <div class="op-label">Ort Rating</div>
          <div class="op-val">${avgRating.toFixed(1)}</div>
        </div>
        <div class="op-info-item">
          <div class="op-label">Sakat</div>
          <div class="op-val ${injured > 0 ? 'warn' : ''}">${injured}</div>
        </div>
        <div class="op-info-item">
          <div class="op-label">Cezalı</div>
          <div class="op-val ${suspended > 0 ? 'danger' : ''}">${suspended}</div>
        </div>
      </div>
    `;
  }
}

// === RENDER: SQUAD ===
function renderSquad() {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;
  let lineup = user.players.filter(p => p.onField);
  let bench = user.players.filter(p => !p.onField);
  // Pozisyona göre sırala (GK→DF→OS→FV), içinde alfabetik
  lineup = lineup.sort(sortByPositionThenName);
  bench = bench.sort(sortByPositionThenName);
  els.squadLineupCount.textContent = lineup.length;
  els.squadBenchCount.textContent = bench.length;
  els.lineupList.innerHTML = '';
  for (const p of lineup) els.lineupList.appendChild(playerItem(p, false));
  els.benchList.innerHTML = '';
  for (const p of bench) els.benchList.appendChild(playerItem(p, true));
}

function playerItem(p, isBench) {
  const item = document.createElement('div');
  item.className = 'player-item player-item-clickable' + (isBench ? ' bench' : '');
  if (p.live?.injured) item.classList.add('injured');
  if (p.live?.redCard) item.classList.add('red-card');
  const attrs = p.attrs || {};
  const avg = Object.values(attrs).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(attrs).length);
  item.innerHTML = `
    <div class="p-pos">${p.position}</div>
    <div class="p-name">${p.name}${p.live?.injured ? ' 🏥' : ''}${p.live?.suspended || p.live?.redCard ? ' 🟥' : ''}</div>
    <div class="p-age">${p.age}y</div>
    <div class="p-rating">${(p.live?.rating || 6.5).toFixed(1)}</div>
    <div class="p-meta">${avg.toFixed(0)} yetenek</div>
    <button class="p-swap" data-pid="${p.id}"><i data-lucide="refresh-cw"></i> Değiştir</button>
  `;
  // İsim veya satıra tıklama → oyuncu detay sayfası
  item.addEventListener('click', (e) => {
    if (e.target.closest('.p-swap')) return;
    openPlayerPage(p.id);
  });
  item.querySelector('.p-swap').addEventListener('click', (e) => {
    e.stopPropagation();
    openSubModal(p, isBench);
  });
  return item;
}

function openPlayerPage(pid) {
  currentPlayerId = pid;
  navigate('/player');
}

// === RENDER: STANDINGS ===
function renderStandingsPage() {
  if (!game) return;
  els.stdSeason.textContent = game.league.season;
  const standings = game.league.getStandings();
  els.standingsList.innerHTML = '';
  // Header
  const header = document.createElement('div');
  header.className = 'standings-header';
  header.innerHTML = `
    <div>#</div>
    <div>Takım</div>
    <div>O</div>
    <div>Av</div>
    <div>P</div>
    <div>Son</div>
  `;
  els.standingsList.appendChild(header);
  for (const s of standings) {
    const row = document.createElement('div');
    row.className = 'standings-row' + (s.isUser ? ' user' : '');
    const posClass = s.pos === 1 ? 's-pos-1' : s.pos <= 3 ? 's-pos-2' : s.pos >= 16 ? 's-pos-rel' : '';
    row.innerHTML = `
      <div class="s-pos ${posClass}">${s.pos}</div>
      <div class="s-name">${s.name}</div>
      <div>${s.played}</div>
      <div style="color: ${s.gd >= 0 ? 'var(--good)' : 'var(--bad)'}">${s.gd >= 0 ? '+' : ''}${s.gd}</div>
      <div class="s-points">${s.points}</div>
      <div style="color: var(--text-dim); font-size: 11px;">${(s.form || '———').slice(-5)}</div>
    `;
    els.standingsList.appendChild(row);
  }
}

// === FORMASYON ŞABLONLARI (taktik tahtası için) ===
// Her slot: { role: GK/DF/OS/FV, x: yatay %, y: dikey % }
// x: 0 = kale arkası (kendi kalesi), 100 = rakip kale
const TACTIC_FORMATIONS = {
  '442': [
    { role: 'GK', x: 50, y: 92 },
    { role: 'DF', x: 15, y: 75 },
    { role: 'DF', x: 38, y: 78 },
    { role: 'DF', x: 62, y: 78 },
    { role: 'DF', x: 85, y: 75 },
    { role: 'OS', x: 15, y: 50 },
    { role: 'OS', x: 38, y: 52 },
    { role: 'OS', x: 62, y: 52 },
    { role: 'OS', x: 85, y: 50 },
    { role: 'FV', x: 35, y: 22 },
    { role: 'FV', x: 65, y: 22 },
  ],
  '433': [
    { role: 'GK', x: 50, y: 92 },
    { role: 'DF', x: 15, y: 75 },
    { role: 'DF', x: 38, y: 78 },
    { role: 'DF', x: 62, y: 78 },
    { role: 'DF', x: 85, y: 75 },
    { role: 'OS', x: 25, y: 50 },
    { role: 'OS', x: 50, y: 52 },
    { role: 'OS', x: 75, y: 50 },
    { role: 'FV', x: 25, y: 20 },
    { role: 'FV', x: 50, y: 18 },
    { role: 'FV', x: 75, y: 20 },
  ],
  '352': [
    { role: 'GK', x: 50, y: 92 },
    { role: 'DF', x: 20, y: 78 },
    { role: 'DF', x: 50, y: 82 },
    { role: 'DF', x: 80, y: 78 },
    { role: 'OS', x: 12, y: 55 },
    { role: 'OS', x: 32, y: 58 },
    { role: 'OS', x: 50, y: 55 },
    { role: 'OS', x: 68, y: 58 },
    { role: 'OS', x: 88, y: 55 },
    { role: 'FV', x: 35, y: 22 },
    { role: 'FV', x: 65, y: 22 },
  ],
  '451': [
    { role: 'GK', x: 50, y: 92 },
    { role: 'DF', x: 15, y: 75 },
    { role: 'DF', x: 38, y: 78 },
    { role: 'DF', x: 62, y: 78 },
    { role: 'DF', x: 85, y: 75 },
    { role: 'OS', x: 10, y: 55 },
    { role: 'OS', x: 30, y: 53 },
    { role: 'OS', x: 50, y: 50 },
    { role: 'OS', x: 70, y: 53 },
    { role: 'OS', x: 90, y: 55 },
    { role: 'FV', x: 50, y: 22 },
  ],
};

// === RENDER: TAKTİK TAHTAYI ===
let lineupState = {
  formation: '442',
  slots: Array(11).fill(null), // slot i -> playerId
  bench: [], // playerId[] (yedek)
};

function renderLineupPage() {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;

  // Başlangıç: mevcut sahadaki 11'i al
  const onField = user.players.filter(p => p.onField);
  if (lineupState.slots.every(s => s === null) && onField.length === 11) {
    // İlk render — mevcut dizilişten başla
    lineupState.formation = user.formation || '442';
    const slots = TACTIC_FORMATIONS[lineupState.formation];
    for (let i = 0; i < 11; i++) {
      lineupState.slots[i] = onField[i]?.id || null;
    }
    const onFieldIds = new Set(onField.map(p => p.id));
    lineupState.bench = user.players.filter(p => !onFieldIds.has(p.id)).map(p => p.id);
  }

  // Formasyon dropdown sync
  if (els.lineupFormation) {
    els.lineupFormation.value = lineupState.formation;
  }

  // Saha
  drawPitch();

  // Yedekler
  drawBench();

  // Saved info
  if (els.lineupSavedInfo) {
    const filled = lineupState.slots.filter(s => s !== null).length;
    els.lineupSavedInfo.textContent = `${filled}/11 dolduruldu`;
  }

  // Formasyon değişim
  els.lineupFormation?.addEventListener('change', (e) => {
    lineupState.formation = e.target.value;
    lineupState.slots = Array(11).fill(null);
    drawPitch();
  }, { once: true });

  // Kaydet
  els.btnLineupSave?.addEventListener('click', saveLineup, { once: true });

  // Sıfırla
  els.btnLineupReset?.addEventListener('click', () => {
    const onFieldNow = user.players.filter(p => p.onField);
    lineupState.formation = user.formation || '442';
    lineupState.slots = Array(11).fill(null);
    for (let i = 0; i < 11; i++) {
      lineupState.slots[i] = onFieldNow[i]?.id || null;
    }
    const ids = new Set(onFieldNow.map(p => p.id));
    lineupState.bench = user.players.filter(p => !ids.has(p.id)).map(p => p.id);
    if (els.lineupFormation) els.lineupFormation.value = lineupState.formation;
    drawPitch();
    drawBench();
  }, { once: true });

  // Taktik modalındaki "Taktik Tahtası" butonu → sayfaya yönlendir
  els.btnTacticsBoard?.addEventListener('click', () => {
    els.tacticsModal.style.display = 'none';
    navigate('/lineup');
  }, { once: true });

  if (window.lucide) lucide.createIcons();
}

function drawPitch() {
  if (!els.lineupPitch) return;
  els.lineupPitch.innerHTML = '';
  const slots = TACTIC_FORMATIONS[lineupState.formation] || TACTIC_FORMATIONS['442'];
  const user = getUserTeam();
  if (!user) return;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const playerId = lineupState.slots[i];
    const player = playerId ? user.players.find(p => p.id === playerId) : null;

    const slotEl = document.createElement('div');
    slotEl.className = `lp-slot ${slot.role}`;
    slotEl.style.left = `${slot.x}%`;
    slotEl.style.top = `${slot.y}%`;
    slotEl.dataset.slotIndex = i;
    slotEl.dataset.role = slot.role;

    if (player) {
      const chip = document.createElement('div');
      chip.className = `lp-player-chip ${player.position}`;
      chip.draggable = true;
      chip.dataset.playerId = player.id;
      chip.dataset.fromSlot = i;
      const firstName = (player.name || '').split(' ').slice(0, 2).join(' ');
      chip.innerHTML = `
        <div class="lpp-pos">${player.position}</div>
        <div class="lpp-name">${firstName}</div>
      `;
      chip.addEventListener('dragstart', onChipDragStart);
      chip.addEventListener('dragend', onChipDragEnd);
      slotEl.appendChild(chip);
    } else {
      const empty = document.createElement('div');
      empty.className = 'lp-empty';
      empty.textContent = '+';
      slotEl.appendChild(empty);
    }

    // Drop target
    slotEl.addEventListener('dragover', e => {
      e.preventDefault();
      slotEl.classList.add('dragover');
    });
    slotEl.addEventListener('dragleave', () => slotEl.classList.remove('dragover'));
    slotEl.addEventListener('drop', e => {
      e.preventDefault();
      slotEl.classList.remove('dragover');
      onDropOnSlot(i, slot.role);
    });

    els.lineupPitch.appendChild(slotEl);
  }
}

function drawBench() {
  if (!els.lineupBench) return;
  els.lineupBench.innerHTML = '';
  const user = getUserTeam();
  if (!user) return;
  const fieldedIds = new Set(lineupState.slots.filter(s => s !== null));
  const benchPlayers = user.players.filter(p => !fieldedIds.has(p.id));

  if (els.lineupBenchCount) {
    els.lineupBenchCount.textContent = `${benchPlayers.length} yedek`;
  }

  // Pozisyona göre sırala
  const posOrder = { GK: 1, DF: 2, OS: 3, FV: 4 };
  benchPlayers.sort((a, b) => (posOrder[a.position] || 5) - (posOrder[b.position] || 5));

  for (const p of benchPlayers) {
    const item = document.createElement('div');
    item.className = `bench-item ${p.position}`;
    item.draggable = true;
    item.dataset.playerId = p.id;
    const rating = computePlayerRating(p).toFixed(1);
    item.innerHTML = `
      <span class="bi-pos">${p.position}</span>
      <span class="bi-name">${p.name}</span>
      <span class="bi-rating">${rating}</span>
    `;
    item.addEventListener('dragstart', onChipDragStart);
    item.addEventListener('dragend', onChipDragEnd);
    els.lineupBench.appendChild(item);
  }
}

let dragData = null;
function onChipDragStart(e) {
  const playerId = e.currentTarget.dataset.playerId;
  const fromSlot = e.currentTarget.dataset.fromSlot;
  const fromBench = !fromSlot;
  dragData = { playerId, fromSlot: fromSlot ? parseInt(fromSlot) : null, fromBench };
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', playerId);
}

function onChipDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.lp-slot').forEach(s => s.classList.remove('dragover'));
  dragData = null;
}

function onDropOnSlot(slotIndex, role) {
  if (!dragData) return;
  const user = getUserTeam();
  if (!user) return;
  const player = user.players.find(p => p.id === dragData.playerId);
  if (!player) return;

  // Pozisyon uyumu kontrolü (GK sadece GK slotuna, vs.)
  if (player.position !== role && player.position !== 'OS') {
    // OS her yere gidebilir, diğerleri sadece kendi slotuna
    if (role !== 'OS') {
      alert(`Bu oyuncu ${player.position} pozisyonunda, ${role} slotuna atanamaz.`);
      return;
    }
  }

  // Mevcut slot'taki oyuncu (varsa) yedek olur
  const currentAtSlot = lineupState.slots[slotIndex];
  if (dragData.fromSlot !== null) {
    // Saha içi değişim
    lineupState.slots[dragData.fromSlot] = currentAtSlot;
  } else {
    // Yedekten geldi — slot'taki yedek olur
    if (currentAtSlot) {
      lineupState.bench.push(currentAtSlot);
    }
  }
  // Yeni atama
  if (dragData.fromBench) {
    lineupState.bench = lineupState.bench.filter(id => id !== dragData.playerId);
  }
  lineupState.slots[slotIndex] = dragData.playerId;

  drawPitch();
  drawBench();
  if (els.lineupSavedInfo) {
    const filled = lineupState.slots.filter(s => s !== null).length;
    els.lineupSavedInfo.textContent = `${filled}/11 dolduruldu`;
  }
}

function saveLineup() {
  const user = getUserTeam();
  if (!user) return;
  const filled = lineupState.slots.filter(s => s !== null).length;
  if (filled < 11) {
    alert(`⚠️ Tüm 11 slot doldurulmalı! (${filled}/11)`);
    return;
  }
  // Oyuncuların onField ve position bilgilerini güncelle
  const slotToRole = (i) => TACTIC_FORMATIONS[lineupState.formation]?.[i]?.role;
  for (let i = 0; i < 11; i++) {
    const pid = lineupState.slots[i];
    if (!pid) continue;
    const player = user.players.find(p => p.id === pid);
    if (!player) continue;
    const slot = TACTIC_FORMATIONS[lineupState.formation]?.[i];
    if (slot) {
      // Oyuncu sahada, rolü slot rolü
      player.onField = true;
      // GK→GK, DF→DF, OS→OS, FV→FV. Sadece OS her yere gidebilir.
      if (player.position === 'OS' || slot.role === 'OS') {
        player.position = slot.role;
      }
    }
  }
  // Yedekler
  const fieldedIds = new Set(lineupState.slots.filter(s => s !== null));
  for (const p of user.players) {
    if (!fieldedIds.has(p.id)) {
      p.onField = false;
    }
  }
  user.formation = lineupState.formation;
  saveGame();
  alert('✅ Taktik kaydedildi! Maça bu dizilişle çıkılacak.');
  if (els.lineupSavedInfo) {
    els.lineupSavedInfo.textContent = '✅ Kaydedildi';
  }
}

// === RENDER: DEVELOPMENT (Antrenman) ===
function renderDevelopmentPage() {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;

  els.devList.innerHTML = '';

  // === TAKIM ANTRENMANI KARTI ===
  const teamAlreadyDone = game.lastTeamTrainWeek === game.league.currentWeek;
  const teamCard = document.createElement('div');
  teamCard.className = 'card training-team-card';
  teamCard.innerHTML = `
    <div class="card-header">
      <i data-lucide="users"></i>
      <h3>Takım Antrenmanı</h3>
    </div>
    <div class="team-train-body">
      <div class="team-train-stats">
        <div class="muted">Tesislerde yapılır · <strong>ÜCRETSİZ</strong></div>
        <div class="muted">Avantaj: Tüm sahadaki oyunculara <strong class="ok">+1.5 yetenek</strong></div>
        <div class="muted">Dezavantaj: <strong class="bad">%10 sakatlık riski</strong> (1-2 hafta)</div>
        <div class="muted">Limit: <strong>haftada 1 kez</strong></div>
      </div>
      <button class="btn primary" id="btn-team-train" ${teamAlreadyDone ? 'disabled' : ''}>
        <i data-lucide="zap"></i> ${teamAlreadyDone ? 'Bu Hafta Yapıldı' : 'Takım Antrenmanı Yap'}
      </button>
    </div>
  `;
  els.devList.appendChild(teamCard);

  // Kişisel antrenman açıklaması
  const info = document.createElement('div');
  info.className = 'training-info';
  info.innerHTML = `
    <div class="ti-block">
      <strong>Kişisel Antrenman</strong> — listede her oyuncu için <em>Profil</em> tıkla, ardından <em>Antrenman</em> ile tek oyuncuya +2 yetenek.
      <br>Avantaj: hızlı, tek oyuncu. <strong>50K € kişisel bütçeden</strong>. Dezavantaj: yorgunluk (-15 stamina).
    </div>
  `;
  els.devList.appendChild(info);

  // Pozisyon → antrenman alanları
  const trainingAreas = {
    GK: ['reflexes', 'positioning', 'composure', 'passing', 'leadership'],
    DF: ['tackling', 'marking', 'interception', 'aerial', 'positioning'],
    OS: ['passing', 'vision', 'decisions', 'dribbling', 'firstTouch'],
    FV: ['finishing', 'shooting', 'composure', 'pace', 'firstTouch'],
  };
  const areaLabels = {
    passing: 'Pas', shooting: 'Şut', tackling: 'Müdahale', dribbling: 'Dribling',
    finishing: 'Bitiricilik', crossing: 'Orta', composure: 'Sükunet', vision: 'Vizyon',
    decisions: 'Karar', firstTouch: 'İlk Dokunuş', reflexes: 'Refleks', agility: 'Çeviklik',
    pace: 'Hız', longShots: 'Uzun Şut', interception: 'Kesiş', aerial: 'Hava Topu',
    marking: 'Markaj', positioning: 'Pozisyon', leadership: 'Liderlik',
    aggression: 'Agresiflik', flair: 'Yaratıcılık',
  };

  const players = [...user.players].sort(sortByPositionThenName);

  for (const p of players) {
    const rating = computePlayerRating(p);
    const potential = p.potential || 80;
    const pct = Math.min(100, (rating / potential) * 100);
    const ageCategory = p.age < 23 ? '🟢' : p.age < 28 ? '🔵' : p.age < 32 ? '🟡' : '🔴';
    const areas = trainingAreas[p.position] || ['passing'];
    const best = areas.map(a => ({ a, v: p.attrs?.[a] || 0 })).sort((x, y) => y.v - x.v)[0].a;
    const personalMoney = p.personalMoney || 0;
    const injured = p.live?.injured ? '<div class="dev-bad">🏥 SAKAT</div>' : '';

    const item = document.createElement('div');
    item.className = 'dev-item';
    item.innerHTML = `
      <div class="p-pos">${p.position}</div>
      <div class="dev-name-col">
        <div class="p-name">${p.name} ${ageCategory}</div>
        <div class="d-bar" style="margin-top: 4px;"><div class="d-bar-fill" style="width: ${pct}%"></div></div>
      </div>
      <div class="dev-rating">
        <div class="dr-num">${rating.toFixed(1)}</div>
        <div class="dr-max">/ ${potential}</div>
      </div>
      <div class="dev-train">
        <div class="dev-money">💰 ${formatMoney(personalMoney)}</div>
        <button class="btn primary dev-profile" data-pid="${p.id}">
          <i data-lucide="user"></i> Profil
        </button>
        ${injured}
      </div>
    `;
    els.devList.appendChild(item);
  }

  // Event listener'lar
  els.devList.querySelectorAll('.dev-profile').forEach(btn => {
    btn.addEventListener('click', () => openPlayerPage(btn.dataset.pid));
  });
  document.getElementById('btn-team-train')?.addEventListener('click', () => {
    const result = applyTeamTraining();
    if (result.ok) {
      let msg = `✅ Takım antrenmanı tamamlandı!\n\nTüm sahadaki oyuncular +${TEAM_TRAIN_BONUS} yetenek kazandı.`;
      if (result.injured) {
        msg += `\n\n⚠️ ${result.injured.name} sakatlandı (${injured.live?.injuryWeeks} hafta).`;
      }
      alert(msg);
      renderDevelopmentPage();
    } else {
      alert('❌ ' + result.msg);
    }
  });
  if (window.lucide) lucide.createIcons();
}

// Pozisyona özgü rating (ROLE_WEIGHTS kullanarak)
function computePlayerRating(p) {
  const attrs = p.attrs || {};
  const weights = ROLE_WEIGHTS[p.position] || {};
  let weighted = 0, totalWeight = 0;
  for (const attr of Object.keys(attrs)) {
    const w = weights[attr] || 1.0;
    weighted += attrs[attr] * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : 50;
}

function trainPlayer(pid) {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;
  const player = user.players.find(p => p.id === pid);
  if (!player) return;
  if (game.trainingPoints <= 0) { alert('Antrenman puanın kalmadı!'); return; }

  const select = els.devList.querySelector(`.train-area[data-pid="${pid}"]`);
  if (!select) return;
  const attr = select.value;
  if (!player.attrs) player.attrs = {};
  const current = player.attrs[attr] || 50;
  // Potansiyel sınırı YOK — sadece paraya bak
  const cost = 50_000; // her antrenman 50K €

  if (!player.personalMoney) player.personalMoney = 0;
  if (player.personalMoney < cost) {
    alert(`${player.name} kişisel bütçesi yetersiz! (${formatMoney(player.personalMoney)} / ${formatMoney(cost)})\n\nMaçlarda iyi oynayarak para kazanabilir.`);
    return;
  }

  player.personalMoney -= cost;
  player.attrs[attr] = Math.min(99, current + 2); // 99 sert sınır
  game.trainingPoints--;
  saveGame();
  renderDevelopmentPage();
}

function showPlayerDetail(pid) {
  if (!game) return;
  const user = getUserTeam();
  const player = user?.players.find(p => p.id === pid);
  if (!player) return;

  const areaLabels = {
    passing: 'Pas', shooting: 'Şut', tackling: 'Müdahale', dribbling: 'Dribling',
    finishing: 'Bitiricilik', crossing: 'Orta', composure: 'Sükunet', vision: 'Vizyon',
    decisions: 'Karar', firstTouch: 'İlk Dokunuş', reflexes: 'Refleks', agility: 'Çeviklik',
    pace: 'Hız', longShots: 'Uzun Şut', interception: 'Kesiş', aerial: 'Hava Topu',
    marking: 'Markaj', positioning: 'Pozisyon', leadership: 'Liderlik',
    aggression: 'Agresiflik', flair: 'Yaratıcılık',
  };
  const weights = ROLE_WEIGHTS[player.position] || {};
  const rating = computePlayerRating(player);
  const potential = player.potential || 80;

  // Tüm attribute'leri göster (ağırlıklı, sıralı)
  const attrs = Object.entries(player.attrs || {})
    .map(([k, v]) => ({ k, v, w: weights[k] || 1.0, label: areaLabels[k] || k }))
    .sort((a, b) => (b.v * b.w) - (a.v * a.w));

  const detail = document.createElement('div');
  detail.className = 'modal';
  detail.id = 'player-detail-modal';
  detail.style.display = 'flex';
  detail.innerHTML = `
    <div class="modal-box wide">
      <div class="modal-icon"><i data-lucide="user"></i></div>
      <h3>${player.name}</h3>
      <div class="pd-sub">${player.position} · ${player.age}y · ⭐ ${player.stars || 1}</div>
      <div class="pd-rating">
        <div class="pd-rating-num">${rating.toFixed(1)}</div>
        <div class="pd-rating-max">/ ${potential}</div>
        <div class="pd-rating-label">Pozisyona Özgü Rating</div>
      </div>
      <div class="pd-attrs">
        ${attrs.map(a => `
          <div class="pd-attr">
            <div class="pda-label">${a.label}${a.w > 1.2 ? ' ★' : a.w < 0.9 ? ' ·' : ''}</div>
            <div class="pda-bar"><div class="pda-fill" style="width: ${(a.v / potential) * 100}%; background: ${a.w > 1.2 ? 'var(--accent)' : a.w < 0.9 ? 'var(--text-faint)' : 'var(--info)'}"></div></div>
            <div class="pda-val">${a.v}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn primary pd-close">Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(detail);
  detail.querySelector('.pd-close').addEventListener('click', () => detail.remove());
  detail.addEventListener('click', (e) => { if (e.target === detail) detail.remove(); });
  if (window.lucide) lucide.createIcons();
}

// === RENDER: TRANSFERS ===
function renderTransferPage() {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;
  els.transferBudget.textContent = formatMoney(user.budget?.budget || 50_000_000);
  const pos = els.filterPosition.value;
  const maxAge = parseInt(els.filterAge.value) || 99;
  const minStars = parseInt(els.filterStars.value) || 0;
  const filtered = game.transferMarket.players.filter(p =>
    (!pos || p.position === pos) && p.age <= maxAge && p.stars >= minStars
  ).sort(sortByPositionThenName);
  els.transferList.innerHTML = '';
  for (const p of filtered.slice(0, 40)) {
    const item = document.createElement('div');
    item.className = 'transfer-item';
    item.innerHTML = `
      <div class="t-pos">${p.position}</div>
      <div class="p-name" style="font-weight: 500">${p.name}</div>
      <div class="t-age">${p.age}y</div>
      <div style="color: var(--accent); font-size: 11px;">${'★'.repeat(p.stars || 1)}</div>
      <div class="t-value">${formatMoney(p.value)}</div>
      <button class="btn primary t-buy" data-pid="${p.id}">Al</button>
    `;
    item.querySelector('.t-buy').addEventListener('click', () => buyPlayer(p));
    els.transferList.appendChild(item);
  }
}

// === RENDER: MATCH ===
function renderMatchPage() {
  if (!match) return;
  renderScore();
  renderTacticInfo();
  renderSquadInMatch();
}

function renderTacticInfo() {
  if (!els.tiForm) return;
  const labels = {
    'defansif': '🛡️ Defansif', 'kontra': '⚡ Kontra Atak', 'normal': '⚖️ Dengeli',
    'kanat': '↔️ Kanat Hücumu', 'merkez': '🎯 Merkezden Oyna', 'ofansif': '🔥 Ofansif'
  };
  if (match.userFormation) els.tiForm.textContent = match.userFormation;
  if (match.userTactic) els.tiTactic.textContent = labels[match.userTactic] || match.userTactic;
  if (match.aiTactic) els.tiAiTactic.textContent = labels[match.aiTactic] || match.aiTactic;
}

function renderScore() {
  if (!match) return;
  if (els.homeName) els.homeName.textContent = match.home.name;
  if (els.awayName) els.awayName.textContent = match.away.name;
  if (els.homeScore) els.homeScore.textContent = match.homeScore;
  if (els.awayScore) els.awayScore.textContent = match.awayScore;
  if (els.matchMinute) els.matchMinute.textContent = `${match.minute}'`;
  const homeYellows = match.home.players.filter(p => (p.live?.yellowCount || 0) > 0).length;
  const awayYellows = match.away.players.filter(p => (p.live?.yellowCount || 0) > 0).length;
  const homeReds = match.home.players.filter(p => p.live?.redCard).length;
  const awayReds = match.away.players.filter(p => p.live?.redCard).length;
  if (els.homePlayers) els.homePlayers.textContent = match.home.players.filter(p => p.onField).length;
  if (els.awayPlayers) els.awayPlayers.textContent = match.away.players.filter(p => p.onField).length;
  if (els.homeYellows) els.homeYellows.textContent = homeYellows;
  if (els.awayYellows) els.awayYellows.textContent = awayYellows;
  if (els.homeReds) els.homeReds.textContent = homeReds;
  if (els.awayReds) els.awayReds.textContent = awayReds;
  if (match.substitution) {
    if (els.homeSubs) els.homeSubs.textContent = match.substitution.getRemainingSubs('home');
    if (els.awaySubs) els.awaySubs.textContent = match.substitution.getRemainingSubs('away');
  }
}

function renderSquadInMatch() {
  // Şu an kullanılmıyor, ama ileride kullanılabilir
}

function eventMatchesPlayer(ev, query) {
  if (!query) return true;
  const text = (ev.text || '').toLowerCase();
  if (text.includes(query)) return true;
  for (const team of [match?.home, match?.away]) {
    if (!team?.players) continue;
    for (const p of team.players) {
      if (p.name?.toLowerCase().includes(query)) {
        if (ev.actor === p.id || ev.target === p.id || ev.scorer === p.id) return true;
      }
    }
  }
  return false;
}

function renderEvents() {
  const total = allEvents.length;
  const filtered = searchQuery ? allEvents.filter(eventMatchesPlayer) : allEvents;
  els.eventsList.innerHTML = '';
  for (let i = filtered.length - 1; i >= 0; i--) {
    appendEventToList(filtered[i], false);
  }
  els.eventCount.textContent = searchQuery ? `${filtered.length} / ${total}` : `${total}`;
  els.searchInfo.textContent = searchQuery ? `Arama: "${searchQuery}"` : '';
}

function appendEventToList(ev, prepend) {
  const div = document.createElement('div');
  div.className = 'event-item';
  const type = ev.type;
  let typeClass = 'pass';
  if (type === 'goal') typeClass = 'goal';
  else if (type === 'shoot' || ev.reason === 'sut_isabetsiz' || ev.reason === 'kaleciKurtardi') typeClass = 'shot';
  else if (type === 'turnover' || type === 'tackle_won') typeClass = 'turnover';
  else if (type === 'yellow_card' || type === 'red_card') typeClass = 'card';
  else if (type === 'corner') typeClass = 'corner';
  else if (type === 'substitution') typeClass = 'sub';
  else if (type === 'injury') typeClass = 'card';
  div.innerHTML = `
    <div class="e-min">${ev.minute}'</div>
    <div class="e-type ${typeClass}">${typeLabel(type, ev.reason)}</div>
    <div class="e-text">${(ev.text || '').replace(/^\d+'\s*/, '')}</div>
  `;
  if (prepend) {
    els.eventsList.prepend(div);
    while (els.eventsList.children.length > 200) els.eventsList.lastChild.remove();
  } else {
    els.eventsList.appendChild(div);
  }
}

function typeLabel(type, reason) {
  if (type === 'goal') return 'GOL';
  if (type === 'yellow_card') return 'SARI';
  if (type === 'red_card') return 'KIRM';
  if (type === 'corner') return 'KORNER';
  if (type === 'turnover') return 'KAYIP';
  if (type === 'tackle_won') return 'MÜD';
  if (type === 'pass_success') return 'PAS';
  if (type === 'cross_success') return 'ORTA';
  if (type === 'dribble_success') return 'DRİP';
  if (type === 'foul') return 'FAUL';
  if (type === 'substitution') return 'DEĞ';
  if (type === 'injury') return '🏥';
  if (type === 'out_of_play') {
    if (reason === 'sut_isabetsiz') return 'ŞUT';
    if (reason === 'kaleciKurtardi') return 'ŞUT·K';
    if (reason === 'pas_oturmadi') return 'PAS·A';
    return 'AUT';
  }
  if (type === 'kickoff') return 'BAŞLA';
  return (type || '').toUpperCase().slice(0, 5);
}

function appendNarratives(narratives) {
  if (!narratives?.length) return;
  const placeholder = els.narrativeStream.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  for (const n of narratives) {
    const div = document.createElement('div');
    const type = n.type || 'sequence';
    div.className = `narrative-item ${type}`;
    div.innerHTML = `<div class="n-minute">${n.minute}'</div> ${n.text.replace(/^\d+'\s*/, '')}`;
    els.narrativeStream.appendChild(div);
  }
  els.narrativeStream.scrollTop = els.narrativeStream.scrollHeight;
}

function appendNarrativeText(minute, text) {
  const placeholder = els.narrativeStream.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  const div = document.createElement('div');
  div.className = 'narrative-item sequence';
  div.style.whiteSpace = 'pre-line';
  div.innerHTML = `<div class="n-minute">${minute}'</div> ${text}`;
  els.narrativeStream.appendChild(div);
  els.narrativeStream.scrollTop = els.narrativeStream.scrollHeight;
}

// === HAFTA OYNA ===
function playWeek(skip = false) {
  if (!game) return;
  const next = game.league.currentWeek + 1;
  if (next > 34) { endSeason(); return; }
  stopTimer();

  // Tüm takımlar: sakatlık iyileşmesi + ceza sıfırlama + yeni sakatlık üret
  applyWeeklyStatusChanges(next);

  // CPU teklifleri üret
  generateOffers(next);

  // AI maçları önce oyna
  const weekFixtures = game.league.fixtures.filter(f => f.week === next);
  const aiResults = [];
  for (const fix of weekFixtures) {
    if (fix.homeId === 'user' || fix.awayId === 'user') continue;
    if (fix.played) continue;
    const home = game.league.teams.find(t => t.id === fix.homeId);
    const away = game.league.teams.find(t => t.id === fix.awayId);
    const result = simulateAIMatch(home, away);
    fix.played = true;
    fix.result = result;
    updateStandings(fix);
    aiResults.push({ home: home.name, away: away.name, homeScore: result.homeScore, awayScore: result.awayScore });
  }

  // Maaş öde
  for (const team of game.league.teams) {
    team.budget.payWeeklyWages(next);
  }

  game.league.currentWeek = next;
  saveGame();

  // Kullanıcı maçını başlat
  startUserMatch(skip);
}

function simulateAIMatch(home, away) {
  const homeAbility = teamAbility(home);
  const awayAbility = teamAbility(away);
  const homeAdv = 1.15;
  const homeLambda = (homeAbility * 0.04 * homeAdv) / (awayAbility * 0.04 + 0.5);
  const awayLambda = (awayAbility * 0.04) / (homeAbility * 0.04 * homeAdv + 0.5);
  return { homeScore: poissonRandom(homeLambda), awayScore: poissonRandom(awayLambda) };
}

function teamAbility(team) {
  const onField = team.players.filter(p => p.onField);
  if (!onField.length) return 60;
  const sum = onField.reduce((s, p) => {
    const attrs = p.attrs || {};
    const avg = Object.values(attrs).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(attrs).length);
    return s + avg;
  }, 0);
  return sum / onField.length;
}

function poissonRandom(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function updateStandings(fix) {
  const home = game.league.teams.find(t => t.id === fix.homeId);
  const away = game.league.teams.find(t => t.id === fix.awayId);
  if (!home || !away || !fix.result) return;
  home.played++; away.played++;
  home.gf += fix.result.homeScore; home.ga += fix.result.awayScore;
  away.gf += fix.result.awayScore; away.ga += fix.result.homeScore;
  if (fix.result.homeScore > fix.result.awayScore) {
    home.won++; home.points += 3; home.budget.receiveMatchIncome(fix.week, true);
    away.lost++;
  } else if (fix.result.homeScore < fix.result.awayScore) {
    away.won++; away.points += 3; away.budget.receiveMatchIncome(fix.week, true);
    home.lost++;
  } else {
    home.drawn++; home.points += 1; home.budget.receiveMatchIncome(fix.week, false);
    away.drawn++; away.points += 1; away.budget.receiveMatchIncome(fix.week, false);
  }
}

// === KULLANICI MAÇI ===
let pendingTactics = { home: 'normal', away: 'normal' };
let pendingFormation = '442';

function showTacticsModal() {
  pendingTactics = { home: 'normal', away: 'normal' };
  pendingFormation = '442';
  // Mevcut kayıtlı formasyonu yükle
  const user = getUserTeam();
  if (user?.formation) {
    pendingFormation = user.formation;
  }
  // Taktik state'i reset
  els.tacticsModal.querySelectorAll('.tactic-option').forEach(b => {
    b.classList.toggle('selected', b.dataset.tactic === 'normal');
  });
  els.tacticsModal.querySelectorAll('.formation-option').forEach(b => {
    b.classList.toggle('selected', b.dataset.formation === pendingFormation);
  });
  // 11 kişilik lineup önizleme
  renderLineupMini(pendingFormation);
  els.tacticsModal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

// === TAKTİK MODALINDA 11 KİŞİLİK LINEUP ÖNİZLEME ===
function renderLineupMini(formation) {
  const container = document.getElementById('lineup-mini-pitch');
  if (!container) return;
  const meta = document.getElementById('lineup-mini-meta');
  container.innerHTML = '';
  const user = getUserTeam();
  if (!user) return;
  const slots = TACTIC_FORMATIONS[formation] || TACTIC_FORMATIONS['442'];
  const onField = user.players.filter(p => p.onField);
  // onField'i slot pozisyonuna göre sırala: GK, DF, OS, FV
  const posOrder = { GK: 1, DF: 2, OS: 3, FV: 4 };
  const sorted = [...onField].sort((a, b) => (posOrder[a.position] || 5) - (posOrder[b.position] || 5));
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const player = sorted[i];
    const slotEl = document.createElement('div');
    slotEl.className = 'lmp-slot';
    slotEl.style.left = `${slot.x}%`;
    slotEl.style.top = `${slot.y}%`;
    if (player) {
      const chip = document.createElement('div');
      chip.className = `lmp-chip ${player.position}`;
      const firstName = (player.name || '').split(' ').slice(0, 2).join(' ');
      chip.innerHTML = `
        <div class="lm-name">${firstName}</div>
      `;
      chip.title = `${player.name} (${player.position})`;
      slotEl.appendChild(chip);
    }
    container.appendChild(slotEl);
  }
  if (meta) {
    const filled = sorted.length;
    meta.textContent = `${filled}/11 — ${formation}`;
  }
}

function startUserMatch(skip = false) {
  if (!game) return;
  const fix = getUserMatchThisWeek();
  if (!fix) return;
  const user = getUserTeam();
  const opp = getOpponentTeam();
  if (!user || !opp) return;

  // Eğer skip modu AÇIKSA direkt başla (modal atla)
  if (skip) {
    // Skip için default taktik
    pendingTactics = { home: 'normal', away: 'normal' };
    pendingFormation = '442';
    launchMatch(user, opp, fix, true);
  } else {
    showTacticsModal();
  }
}

function launchMatch(user, opp, fix, skip) {
  resetOnFieldForMatch(opp);
  const homeTeam = fix.homeId === 'user' ? user : opp;
  const awayTeam = fix.homeId === 'user' ? opp : user;
  selectedInMatch = fix.homeId === 'user' ? 'home' : 'away';

  // Taktik: kullanıcı tarafına seçili, AI rakibe random
  const userTactic = fix.homeId === 'user' ? pendingTactics.home : pendingTactics.away;
  const aiTactics = ['defansif', 'kontra', 'normal', 'kanat', 'merkez', 'ofansif'];
  const aiTactic = aiTactics[Math.floor(Math.random() * aiTactics.length)];

  match = makeMatchState({
    home: homeTeam, away: awayTeam,
    homeFormation: pendingFormation, awayFormation: '442',
  });
  match.mode = 'manager';
  match.tactics = {
    [fix.homeId === 'user' ? 'home' : 'away']: userTactic,
    [fix.homeId === 'user' ? 'away' : 'home']: aiTactic,
  };
  match.aiTactic = aiTactic;
  match.userTactic = userTactic;
  match.userFormation = pendingFormation;
  startMatchOrig(match);

  allEvents = [];
  els.narrativeStream.innerHTML = '';
  els.eventsList.innerHTML = '';
  els.eventCount.textContent = '0';
  matchStartTime = Date.now();
  matchSecondsElapsed = 0;

  // Taktik bilgisini narrative'e ekle
  const tacticLabel = {
    'defansif': '🛡️ Defansif', 'kontra': '⚡ Kontra Atak', 'normal': '⚖️ Dengeli',
    'kanat': '↔️ Kanat Hücumu', 'merkez': '🎯 Merkezden Oyna', 'ofansif': '🔥 Ofansif'
  };
  appendNarrativeText(0, `📋 Taktik: ${tacticLabel[userTactic] || userTactic} | Formasyon: ${pendingFormation} | Rakip: ${tacticLabel[aiTactic] || aiTactic}`);

  if (skip) {
    runFullMatch();
  } else {
    navigate('/match');
    renderScore();
    startTimer();
  }
}

function resetOnFieldForMatch(team) {
  for (const p of team.players) {
    p.live = p.live || {};
    p.live.currentStamina = 100;
    p.live.yellowCount = 0;
    // Sakatlıksa sahaya çıkamaz
    p.live.onField = p.onField; // koru
  }
  // Sakat ve cezalı oyuncuları yedek yap
  for (const p of team.players) {
    if (p.live.injured || p.live.suspended) {
      p.onField = false;
    }
  }
  // İlk 11 sahada olacak şekilde ayarla
  const available = team.players.filter(p => !p.live.injured && !p.live.suspended);
  const lineup = available.slice(0, 11);
  const used = new Set();
  for (const p of lineup) { p.onField = true; used.add(p.id); }
  for (const p of team.players) { if (!used.has(p.id)) p.onField = false; }
}

// Her tick 100ms = 0.1s maç zamanı, 90 maç dakikası = 180s = 1800 tick
// Her tick 1 maç dakikası yapsın, ama 100ms aralık = 9s = 90 maç dakikası, ama biz 3 dakika istiyoruz
// 90 dakika / 180s = 0.5 maç dakikası/saniye
function tick() {
  if (!match || match.minute >= 90) {
    stopTimer();
    if (match) endUserMatch();
    return;
  }
  // Her tick 0.5 maç dakikası (sabit hız)
  matchSecondsElapsed = (Date.now() - matchStartTime) / 1000;
  const realMinute = Math.min(90, (matchSecondsElapsed / MATCH_DURATION_SEC) * 90);

  // Kaç tick'lik dakika geçti?
  const oldMinute = match.minute;
  while (match.minute < Math.floor(realMinute)) {
    const beforeN = match.narrativeLog.length;
    const beforeE = match.events.length;
    simulateMinute(match);
    const newNarratives = match.narrativeLog.slice(beforeN);
    const newEvents = match.events.slice(beforeE);
    for (const ev of newEvents) {
      allEvents.push(ev);
      if (!searchQuery) appendEventToList(ev, true);
      // Sakatlık süresi ata
      if (ev.type === 'injury' && ev.actor) {
        const side = ev.side;
        const player = match[side]?.players?.find(p => p.id === ev.actor);
        if (player) {
          player.live = player.live || {};
          const severity = ev.severity || (1 + Math.floor(Math.random() * 3)); // 1-3
          player.live.injured = true;
          player.live.injuryWeeks = severity + 1; // 2-4 hafta
          player.live.injuryReturn = game.league.currentWeek + player.live.injuryWeeks;
          player.live.redCard = false; // sakatlıksa kırmızı kart değil
        }
      }
      // Kırmızı kart: sonraki maç yasak
      if (ev.type === 'red_card' && ev.actor) {
        const side = ev.side;
        const player = match[side]?.players?.find(p => p.id === ev.actor);
        if (player) {
          player.live = player.live || {};
          player.live.redCard = true;
          player.live.suspended = true; // bir sonraki maç oynayamaz
        }
      }
    }
    els.eventCount.textContent = searchQuery
      ? `${allEvents.filter(eventMatchesPlayer).length} / ${allEvents.length}`
      : `${allEvents.length}`;
    if (searchQuery) renderEvents();
    appendNarratives(newNarratives);
  }

  // Progress bar
  const pct = Math.min(100, (realMinute / 90) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `${Math.floor(pct)}%`;

  // Devre arası: 45. dakikada bir kere +3 değişiklik hakkı
  if (match.minute >= 45 && match.substitution && !match._halftimeGranted) {
    match.substitution.grantExtraSubs('home', 3);
    match.substitution.grantExtraSubs('away', 3);
    match._halftimeGranted = true;
    const htMsg = '⏸ Devre arası! Her takıma +3 değişiklik hakkı tanındı (toplam 6).';
    appendNarrativeText(45, htMsg);
  }

  renderScore();

  if (match.minute >= 90) {
    stopTimer();
    endUserMatch();
  }
}

// Her hafta başı: sakatlık iyileşmesi + ceza sıfırlama
function applyWeeklyStatusChanges(currentWeek) {
  if (!game?.league?.teams) return;
  const recoveries = [];
  for (const team of game.league.teams) {
    for (const p of team.players) {
      if (!p.live) continue;
      // Sakatlık iyileşmesi
      if (p.live.injured && p.live.injuryReturn && currentWeek >= p.live.injuryReturn) {
        p.live.injured = false;
        p.live.injuryWeeks = 0;
        p.live.injuryReturn = 0;
        if (team.id === 'user') recoveries.push(`✅ ${p.name} sakatlıktan döndü!`);
      }
      // Cezalı oyuncu sıfırlama
      if (p.live.suspended) {
        p.live.suspended = false;
        p.live.redCard = false;
      }
    }
  }
  // Tüm takımlar: rastgele sakatlık üretimi (hafif)
  for (const team of game.league.teams) {
    // Haftada 1-2 sakatlık, tüm takımda
    const numInjuries = Math.random() < 0.4 ? (1 + Math.floor(Math.random() * 2)) : 0;
    for (let i = 0; i < numInjuries; i++) {
      const available = team.players.filter(p => p.onField && !p.live?.injured);
      if (!available.length) break;
      const player = available[Math.floor(Math.random() * available.length)];
      player.live = player.live || {};
      const weeks = 1 + Math.floor(Math.random() * 3); // 1-3 hafta
      player.live.injured = true;
      player.live.injuryWeeks = weeks;
      player.live.injuryReturn = currentWeek + weeks;
      player.live.yellowCount = 0;
    }
    // Sarı kart birikimi: haftada %5 ihtimalle bir oyuncu 1 sarı alır (5 birikim → ceza)
    if (Math.random() < 0.05) {
      const available = team.players.filter(p => p.onField && !p.live?.injured && !p.live?.suspended);
      if (available.length) {
        const player = available[Math.floor(Math.random() * available.length)];
        player.live = player.live || {};
        player.live.yellowCount = (player.live.yellowCount || 0) + 1;
        if (player.live.yellowCount >= 5) {
          player.live.suspended = true;
          player.live.yellowCount = 0;
        }
      }
    }
  }
  if (recoveries.length && lastReport) {
    lastReport.recoveries = (lastReport.recoveries || []).concat(recoveries);
  }
}

// Geriye uyumluluk
function recoverPlayers(currentWeek) {
  applyWeeklyStatusChanges(currentWeek);
}

// === DOĞAL GELİŞİM (haftalık, yavaş, bedava) ===
// === ANTRENMAN SİSTEMİ (TEK) ===
// İki tip:
// 1) Takım antrenmanı — haftada 1 yapılabilir, tüm oyunculara +X yetenek, sakatlık riski, maliyet
// 2) Kişisel antrenman — oyuncu detay sayfasından tek tıkla, +2 yetenek, parayla
// İkisinin de avantaj/dezavantajı var.

// === TAKIM ANTRENMANI ===
// Her hafta menajer "Takım antrenmanı" yapabilir. Tüm sahadaki oyunculara
// +1.5 yetenek, ama %10 ihtimalle 1 oyuncu sakatlanır (1-2 hafta).
// Parasız — gerçek kulüpler antrenmanı kendi tesislerinde yapar.
const TEAM_TRAIN_BONUS = 1.5;
const TEAM_TRAIN_INJURY_CHANCE = 0.10;

function applyTeamTraining() {
  if (!game) return { ok: false, msg: 'Oyun başlamamış' };
  const user = getUserTeam();
  if (!user) return { ok: false, msg: 'Takım yok' };
  if (game.lastTeamTrainWeek === game.league.currentWeek) {
    return { ok: false, msg: 'Bu hafta zaten takım antrenmanı yaptın' };
  }
  // Tüm sahadaki oyunculara bonus
  const lineup = user.players.filter(p => p.onField);
  for (const p of lineup) {
    if (!p.attrs) continue;
    for (const key in p.attrs) {
      p.attrs[key] = Math.min(99, p.attrs[key] + TEAM_TRAIN_BONUS);
    }
  }
  // Sakatlık riski: %10 ihtimalle 1 oyuncu sakatlanır
  let injured = null;
  if (Math.random() < TEAM_TRAIN_INJURY_CHANCE && lineup.length > 0) {
    injured = lineup[Math.floor(Math.random() * lineup.length)];
    injured.live = injured.live || {};
    const weeks = 1 + Math.floor(Math.random() * 2);
    injured.live.injured = true;
    injured.live.injuryWeeks = weeks;
    injured.live.injuryReturn = game.league.currentWeek + weeks;
    injured.live.yellowCount = 0;
  }
  game.lastTeamTrainWeek = game.league.currentWeek;
  saveGame();
  return { ok: true, msg: 'Takım antrenmanı tamamlandı', injured };
}

// === KİŞİSEL ANTRENMAN ===
// Oyuncu detay sayfasında. +2 yetenek seçilen alanda, maliyet 50K €.
// Avantaj: hızlı, tek oyuncu. Dezavantaj: pahalı, yorgunluk.
const PERSONAL_TRAIN_COST = 50_000;
const PERSONAL_TRAIN_BONUS = 2;

function applyPersonalTraining(pid, attr) {
  if (!game) return { ok: false, msg: 'Oyun yok' };
  const user = getUserTeam();
  const player = user?.players.find(p => p.id === pid);
  if (!player) return { ok: false, msg: 'Oyuncu yok' };
  if (!user.budget) return { ok: false, msg: 'Bütçe yok' };
  if (user.budget.budget < PERSONAL_TRAIN_COST) {
    return { ok: false, msg: `Yetersiz bütçe!` };
  }
  if (player.personalMoney === undefined) player.personalMoney = 100_000;
  if (player.personalMoney < PERSONAL_TRAIN_COST) {
    return { ok: false, msg: `Yetersiz kişisel bütçe! (${formatMoney(player.personalMoney)} / ${formatMoney(PERSONAL_TRAIN_COST)})` };
  }
  if (player.live?.injured) {
    return { ok: false, msg: 'Oyuncu sakat, antrenman yapamaz' };
  }
  if (!player.attrs) player.attrs = {};
  const current = player.attrs[attr] || 50;
  if (current >= 99) {
    return { ok: false, msg: 'Oyuncu zaten 99! (sınır)' };
  }
  user.budget.budget -= PERSONAL_TRAIN_COST;
  player.personalMoney -= PERSONAL_TRAIN_COST;
  player.attrs[attr] = Math.min(99, current + PERSONAL_TRAIN_BONUS);
  // Yorgunluk: canlı stamina düşür
  if (player.live) {
    player.live.currentStamina = Math.max(0, (player.live.currentStamina || 100) - 15);
  }
  saveGame();
  return { ok: true, msg: `${attr} +${PERSONAL_TRAIN_BONUS}!` };
}

// Skip: tüm maçı 5 saniyede bitir
function runFullMatch() {
  if (!match) return;
  const targetMinute = 90;
  const stepMs = 30; // her step 30ms
  const minutesPerStep = 1;
  let cur = match.minute;

  function step() {
    if (cur >= targetMinute || !match) {
      finishMatch();
      return;
    }
    const beforeN = match.narrativeLog.length;
    const beforeE = match.events.length;
    simulateMinute(match);
    cur = match.minute;
    const newNarratives = match.narrativeLog.slice(beforeN);
    const newEvents = match.events.slice(beforeE);
    for (const ev of newEvents) {
      allEvents.push(ev);
    }
    appendNarratives(newNarratives);
    setTimeout(step, stepMs);
  }
  step();
}

function finishMatch() {
  if (!match) return;
  const pct = 100;
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `100%`;
  endUserMatch();
}

function startTimer() {
  if (timer) return;
  matchStartTime = Date.now();
  timer = setInterval(tick, TICK_INTERVAL_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function endUserMatch() {
  stopTimer();
  const fix = getUserMatchThisWeek();
  if (fix && match) {
    fix.played = true;
    fix.result = { homeScore: match.homeScore, awayScore: match.awayScore };
    updateStandings(fix);
    game.league.currentWeek += 1;

    // Oyuncu performans ödülleri
    distributePlayerEarnings(match);

    // Sarı kart birikimi: 5 sarı = 1 maç ceza
    applyAccumulatedYellows(match);

    saveGame();
  }
  // Report sayfası
  lastReport = { match, fix };
  setTimeout(() => navigate('/report'), 500);
}

// 5 sarı kart biriken oyuncu bir sonraki maç cezalı
function applyAccumulatedYellows(m) {
  const userSide = selectedInMatch;
  const team = m[userSide];
  if (!team?.players) return;
  for (const p of team.players) {
    if (!p.live) continue;
    const yellows = p.live.yellowCount || 0;
    if (yellows >= 5) {
      p.live.suspended = true;
      p.live.yellowCount = 0; // sıfırla, 5 birikim cezayı tetikledi
    }
  }
}

// Maç sonu: oyunculara para dağıt
function distributePlayerEarnings(m) {
  const userSide = selectedInMatch; // 'home' veya 'away'
  const team = m[userSide];
  if (!team?.players) return;
  const events = m.events || [];
  const isDraw = m.homeScore === m.awayScore;
  const userWon = (userSide === 'home' && m.homeScore > m.awayScore) ||
                  (userSide === 'away' && m.awayScore > m.homeScore);

  for (const p of team.players) {
    if (!p.live) continue;
    p.matchesPlayed = (p.matchesPlayed || 0) + 1;
    p.totalRating = (p.totalRating || 0) + (p.live.rating || 6.5);

    let earned = 0;
    let perfNote = [];

    // Katılım primi
    earned += 5_000;
    perfNote.push('katılım 5K');

    // Galibiyet/beraberlik primi
    if (userWon) { earned += 15_000; perfNote.push('galibiyet 15K'); }
    else if (isDraw) { earned += 5_000; perfNote.push('beraberlik 5K'); }

    // Gol başı
    for (const ev of events) {
      if (ev.type === 'goal' && ev.scorer === p.id) {
        earned += 30_000;
        p.goals = (p.goals || 0) + 1;
        perfNote.push('gol 30K');
      }
      // Asist (basit yaklaşım: goal event'inde target ile scorer farklıysa)
      if (ev.type === 'goal' && ev.target === p.id && ev.scorer !== p.id) {
        earned += 15_000;
        p.assists = (p.assists || 0) + 1;
        perfNote.push('asist 15K');
      }
    }

    // Rating bonusu
    const rating = p.live.rating || 6.5;
    if (rating >= 8.5) { earned += 25_000; perfNote.push('yıldız 25K'); }
    else if (rating >= 7.5) { earned += 10_000; perfNote.push('iyi 10K'); }
    else if (rating < 6.0) { earned -= 5_000; perfNote.push('kötü -5K'); }

    p.personalMoney = (p.personalMoney || 0) + earned;
    p.lastEarned = earned;
    p.lastPerfNote = perfNote.join(', ');
  }
}

// === MAÇ RAPORU ===
function renderReport() {
  if (!lastReport) { navigate('/'); return; }
  const { match: m, fix } = lastReport;
  const userIsHome = fix.homeId === 'user';
  const userScore = userIsHome ? m.homeScore : m.awayScore;
  const oppScore = userIsHome ? m.awayScore : m.homeScore;

  els.repHome.textContent = m.home.name;
  els.repAway.textContent = m.away.name;
  els.repHomeScore.textContent = m.homeScore;
  els.repAwayScore.textContent = m.awayScore;
  els.repMeta.textContent = `Hafta ${fix.week} · Sezon ${game.league.season}`;

  let resultClass = 'draw', resultText = 'Beraberlik';
  if (userScore > oppScore) { resultClass = ''; resultText = 'Galibiyet'; }
  else if (userScore < oppScore) { resultClass = 'lost'; resultText = 'Mağlubiyet'; }
  els.repResultText.className = `fs-result ${resultClass}`;
  els.repResultText.textContent = resultText;

  // İstatistikler
  const stats = m.stats || {};
  const total = (s) => (s?.home || 0) + (s?.away || 0);
  const pct = (s) => total(s) > 0 ? Math.round((s.home / total(s)) * 100) : 50;

  const statItems = [
    { label: 'Top Hakimiyeti', key: 'possession', fmt: '%' },
    { label: 'Şut', key: 'shots' },
    { label: 'İsabetli Şut', key: 'shotsOnTarget' },
    { label: 'Korner', key: 'corners' },
    { label: 'Pas', key: 'passesCompleted' },
    { label: 'Faul', key: 'fouls' },
    { label: 'Ofsayt', key: 'offsides' },
    { label: 'Sarı Kart', key: 'yellowCards' },
    { label: 'Kırmızı Kart', key: 'redCards' },
  ];

  els.statsGrid.innerHTML = '';
  for (const item of statItems) {
    const s = stats[item.key] || { home: 0, away: 0 };
    let homeVal, awayVal, homePct, awayPct;
    if (item.fmt === '%') {
      homeVal = pct(s) + '%';
      awayVal = (100 - pct(s)) + '%';
      homePct = pct(s);
      awayPct = 100 - pct(s);
    } else {
      homeVal = s.home;
      awayVal = s.away;
      const tot = (s.home || 0) + (s.away || 0);
      homePct = tot > 0 ? (s.home / tot) * 100 : 50;
      awayPct = tot > 0 ? (s.away / tot) * 100 : 50;
    }
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-val left">${homeVal}</div>
      <div class="stat-label">${item.label}</div>
      <div class="stat-val right">${awayVal}</div>
      <div class="stat-bar" style="grid-column: 1/-1; margin-top: -8px;">
        <div class="stat-bar-fill home" style="width: ${homePct}%"></div>
      </div>
    `;
    els.statsGrid.appendChild(row);
  }

  // Play-by-play timeline
  els.playTimeline.innerHTML = '';
  const playEvents = (m.events || []).filter(e => ['goal', 'yellow_card', 'red_card', 'injury', 'substitution', 'kickoff', 'shoot'].includes(e.type) || e.reason === 'sut_isabetsiz' || e.reason === 'kaleciKurtardi');
  for (const ev of playEvents) {
    const item = document.createElement('div');
    const t = ev.type;
    let cls = 'kp', icon = '•';
    if (t === 'goal') { cls = 'goal'; icon = '⚽'; }
    else if (t === 'yellow_card') { cls = 'yellow'; icon = '🟨'; }
    else if (t === 'red_card') { cls = 'red'; icon = '🟥'; }
    else if (t === 'injury') { cls = 'injury'; icon = '🏥'; }
    else if (t === 'substitution') { cls = 'sub'; icon = '🔄'; }
    else if (t === 'shoot' || ev.reason === 'sut_isabetsiz' || ev.reason === 'kaleciKurtardi') { cls = 'kp'; icon = '🥅'; }
    else if (t === 'kickoff') { cls = 'kp'; icon = '▶'; }
    item.className = `tl-item ${cls}`;
    const text = (ev.text || '').replace(/^\d+'\s*/, '');
    item.innerHTML = `
      <div class="tl-min">${ev.minute}'</div>
      <div class="tl-icon">${icon}</div>
      <div class="tl-text">${text}</div>
    `;
    els.playTimeline.appendChild(item);
  }
  if (playEvents.length === 0) {
    els.playTimeline.innerHTML = '<div class="empty">Önemli olay yok.</div>';
  }

  // Sakatlık/ceza özeti (kullanıcı takımı)
  const userSide = fix.homeId === 'user' ? 'home' : 'away';
  const userTeamObj = m[userSide];
  const injuries = (userTeamObj?.players || []).filter(p => p.live?.injured);
  const suspended = (userTeamObj?.players || []).filter(p => p.live?.suspended || p.live?.redCard);
  const recoveries = lastReport?.recoveries || [];
  if (injuries.length || suspended.length || recoveries.length) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'injury-summary';
    statusDiv.style.cssText = 'background: var(--bg-2); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-top: 12px; font-size: 12px;';
    let html = '<h4 style="margin: 0 0 8px 0; color: var(--warn);"><i data-lucide="alert-triangle"></i> Kadro Durumu</h4>';
    if (recoveries.length) {
      html += '<div style="margin-bottom: 6px;">' + recoveries.map(r => `<div style="color: var(--good);">${r}</div>`).join('') + '</div>';
    }
    if (injuries.length) {
      html += '<div style="margin-bottom: 6px;"><strong>🏥 Sakat:</strong> ';
      html += injuries.map(p => `${p.name} (${p.live.injuryWeeks || '?'} hafta)`).join(', ');
      html += '</div>';
    }
    if (suspended.length) {
      html += '<div style="color: var(--bad);"><strong>🟥 Cezalı:</strong> ';
      html += suspended.map(p => `${p.name}`).join(', ');
      html += '</div>';
    }
    statusDiv.innerHTML = html;
    els.playTimeline.parentElement.appendChild(statusDiv);
  }

  if (game.league.currentWeek >= 34) {
    els.btnNextWeek.style.display = 'none';
  } else {
    els.btnNextWeek.style.display = 'inline-flex';
  }
}

// === DEĞİŞİKLİK ===
let pendingSub = { outPlayer: null, inPlayer: null };

function openSubModal(preSelected, isBench) {
  if (!game) return;
  const user = getUserTeam();
  if (!user) return;

  const lineup = user.players.filter(p => p.onField && !p.live?.redCard);
  const bench = user.players.filter(p => !p.onField && !p.live?.redCard);

  pendingSub = { outPlayer: preSelected || null, inPlayer: null };

  const remaining = match?.substitution?.getRemainingSubs?.('home') ?? 3;
  const max = match?.substitution?.substitutions?.home?.limit || 3;

  if (!match) {
    // Maç dışında, basit takas (hiçbir kısıtlama yok)
    renderSubModal(lineup, bench, null, null);
  } else {
    renderSubModal(lineup, bench, remaining, max);
  }

  els.subModal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function renderSubModal(lineup, bench, remaining, max) {
  // Sahadaki oyuncular
  els.subOutList.innerHTML = '';
  for (const p of lineup) {
    const item = document.createElement('div');
    item.className = 'sub-player' + (pendingSub.outPlayer?.id === p.id ? ' selected' : '');
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="sp-name"><span class="sp-pos">${p.position}</span>${p.name}</div>
      <div class="sp-meta">${p.age}y · ${(p.live?.rating || 6.5).toFixed(1)} ⭐</div>
    `;
    item.addEventListener('click', () => {
      pendingSub.outPlayer = p;
      renderSubModal(lineup, bench, remaining, max);
    });
    els.subOutList.appendChild(item);
  }

  // Yedek oyuncular
  els.subInList.innerHTML = '';
  for (const p of bench) {
    const item = document.createElement('div');
    item.className = 'sub-player' + (pendingSub.inPlayer?.id === p.id ? ' selected' : '');
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="sp-name"><span class="sp-pos">${p.position}</span>${p.name}</div>
      <div class="sp-meta">${p.age}y · ${(p.live?.rating || 6.5).toFixed(1)} ⭐</div>
    `;
    item.addEventListener('click', () => {
      pendingSub.inPlayer = p;
      renderSubModal(lineup, bench, remaining, max);
    });
    els.subInList.appendChild(item);
  }

  if (lineup.length === 0) els.subOutList.innerHTML = '<p class="muted" style="grid-column: 1/-1; font-size: 12px;">Sahada oyuncu yok.</p>';
  if (bench.length === 0) els.subInList.innerHTML = '<p class="muted" style="grid-column: 1/-1; font-size: 12px;">Yedek oyuncu yok.</p>';

  // Mesaj ve onay
  const oldName = pendingSub.outPlayer?.name || '—';
  const newName = pendingSub.inPlayer?.name || '—';
  els.subMessage.textContent = pendingSub.outPlayer
    ? `${oldName} çıkıyor, ${newName} giriyor.`
    : 'Sahadan çıkacak oyuncuyu seç.';

  // Footer (kalan haklar + onay)
  let footer = els.subModal.querySelector('.sub-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'sub-footer';
    els.subModal.querySelector('.modal-box').insertBefore(footer, els.subModal.querySelector('.modal-actions'));
  }
  const remainingText = remaining !== null
    ? `Kalan değişiklik: <strong>${remaining}</strong>${max > 3 ? ' / ' + max + ' (devre arası +3)' : ' / ' + max}`
    : 'Maç dışı — sınırsız';
  footer.innerHTML = `
    <div class="sub-remaining">${remainingText}</div>
    <button class="sub-confirm" id="btn-sub-confirm" ${(pendingSub.outPlayer && pendingSub.inPlayer) ? '' : 'disabled'}>
      ${pendingSub.outPlayer?.name || '—'} ⟷ ${pendingSub.inPlayer?.name || '—'} · Değiştir
    </button>
  `;
  footer.querySelector('#btn-sub-confirm').addEventListener('click', confirmSubstitution);
}

function confirmSubstitution() {
  if (!pendingSub.outPlayer || !pendingSub.inPlayer) return;
  const user = getUserTeam();
  if (!user) return;
  if (user.id !== (match?.home?.id === user.id ? 'home' : 'away') && match) {
    // sadece kendi maçında değişiklik
  }

  if (match?.substitution) {
    const side = 'home'; // biz her zaman home'uz (kullanıcı tarafı)
    const result = match.substitution.manualSub(side, pendingSub.outPlayer.id, pendingSub.inPlayer.id);
    if (!result.ok) {
      alert(result.reason);
      return;
    }
    match.events.push(result.event);
    match.narrativeLog.push({
      minute: match.minute,
      type: 'substitution',
      text: `Değişiklik: ${pendingSub.outPlayer.name} çıktı, ${pendingSub.inPlayer.name} girdi.`
    });
    appendNarratives([{ minute: match.minute, type: 'substitution', text: `Değişiklik: ${pendingSub.outPlayer.name} çıktı, ${pendingSub.inPlayer.name} girdi.` }]);
    allEvents.push(result.event);
    if (!searchQuery) appendEventToList(result.event, true);
  } else {
    // Maç dışı, basit takas
    pendingSub.outPlayer.onField = false;
    pendingSub.inPlayer.onField = true;
  }

  closeSubModal();
  renderScore();
  renderSquad();
  renderSquadInMatch();
  if (window.lucide) lucide.createIcons();
}

function closeSubModal() {
  els.subModal.style.display = 'none';
  pendingSub = { outPlayer: null, inPlayer: null };
}

els.btnSubCancel?.addEventListener('click', closeSubModal);
els.btnSubInMatch?.addEventListener('click', () => {
  if (!match) { navigate('/squad'); return; }
  openSubModal(null, false);
});

// Sakatlık bildirimi
function showInjuryNotice(player) {
  if (!els.injuryNoticeModal) return;
  els.injuryNoticeMessage.textContent = `${player.name} sakatlandı! Oyunu terk etmek zorunda. Otomatik değişiklik yapılmadı.`;
  els.injuryNoticeModal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

els.btnInjuryOk?.addEventListener('click', () => {
  els.injuryNoticeModal.style.display = 'none';
});

// Taktik seçimi
els.tacticsGrid?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tactic-option');
  if (!btn) return;
  els.tacticsGrid.querySelectorAll('.tactic-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  pendingTactics.home = btn.dataset.tactic;
  pendingTactics.away = btn.dataset.tactic;
});
els.formationGrid?.addEventListener('click', (e) => {
  const btn = e.target.closest('.formation-option');
  if (!btn) return;
  els.formationGrid.querySelectorAll('.formation-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  pendingFormation = btn.dataset.formation;
  // Mini sahayı güncelle
  renderLineupMini(pendingFormation);
});
els.btnStartMatchConfirm?.addEventListener('click', () => {
  els.tacticsModal.style.display = 'none';
  // Maçı başlat
  const user = getUserTeam();
  const opp = getOpponentTeam();
  const fix = getUserMatchThisWeek();
  if (user && opp && fix) launchMatch(user, opp, fix, false);
});

// Maç öncesi "Kadro Değiştir" — taktik modalını kapat, değişiklik modalını aç
els.btnEditSquad?.addEventListener('click', () => {
  els.tacticsModal.style.display = 'none';
  openSubModal(null, false);
});

// === OYUNCU DETAY SAYFASI ===
function renderPlayerPage() {
  if (!game || !currentPlayerId) {
    navigate('/squad');
    return;
  }
  const user = getUserTeam();
  if (!user) return;
  const p = user.players.find(x => x.id === currentPlayerId);
  if (!p) {
    navigate('/squad');
    return;
  }

  els.playerPageName.textContent = p.name;
  els.phName.textContent = p.name;
  els.phPos.textContent = p.position;
  const ageCat = p.age < 23 ? '🟢 Yükselişte' : p.age < 28 ? '🔵 Zirve' : p.age < 32 ? '🟡 Düşüşte' : '🔴 Son yıllar';
  els.phMeta.textContent = `${p.age}y · ${p.position} · ⭐ ${p.stars || 1} · ${ageCat}`;

  const rating = computePlayerRating(p);
  els.phRating.textContent = rating.toFixed(1);
  els.phGoals.textContent = p.goals || 0;
  els.phAssists.textContent = p.assists || 0;
  els.phMatches.textContent = p.matchesPlayed || 0;
  els.phMoney.textContent = formatMoney(p.personalMoney || 0);

  // Sakatlık/ceza uyarısı
  if (p.live?.injured) {
    const remaining = (p.live.injuryReturn || 0) - (game.league.currentWeek || 0);
    if (remaining > 0) {
      const warn = document.createElement('div');
      warn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid var(--bad); border-radius: 6px; padding: 8px 12px; margin-top: 8px; color: var(--bad); font-size: 12px;';
      warn.innerHTML = `🏥 Sakat — ${remaining} hafta sonra dönecek`;
      els.phMoney.parentElement.appendChild(warn);
    }
  } else if (p.live?.suspended) {
    const warn = document.createElement('div');
    warn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid var(--bad); border-radius: 6px; padding: 8px 12px; margin-top: 8px; color: var(--bad); font-size: 12px;';
    warn.innerHTML = '🟥 Cezalı — sonraki maç oynayamaz';
    els.phMoney.parentElement.appendChild(warn);
  }

  // Yetenekler
  const weights = ROLE_WEIGHTS[p.position] || {};
  const areaLabels = {
    passing: 'Pas', shooting: 'Şut', tackling: 'Müdahale', dribbling: 'Dribling',
    finishing: 'Bitiricilik', crossing: 'Orta', composure: 'Sükunet', vision: 'Vizyon',
    decisions: 'Karar', firstTouch: 'İlk Dokunuş', reflexes: 'Refleks', agility: 'Çeviklik',
    pace: 'Hız', longShots: 'Uzun Şut', interception: 'Kesiş', aerial: 'Hava Topu',
    marking: 'Markaj', positioning: 'Pozisyon', leadership: 'Liderlik',
    aggression: 'Agresiflik', flair: 'Yaratıcılık',
  };
  els.phAttrs.innerHTML = '';
  const attrs = Object.entries(p.attrs || {})
    .map(([k, v]) => ({ k, v, w: weights[k] || 1.0, label: areaLabels[k] || k }))
    .sort((a, b) => (b.v * b.w) - (a.v * a.w));
  for (const a of attrs) {
    const row = document.createElement('div');
    row.className = 'pd-attr';
    row.innerHTML = `
      <div class="pda-label">${a.label}${a.w > 1.2 ? ' ★' : a.w < 0.9 ? ' ·' : ''}</div>
      <div class="pda-bar"><div class="pda-fill" style="width: ${a.v}%; background: ${a.w > 1.2 ? 'var(--accent)' : a.w < 0.9 ? 'var(--text-faint)' : 'var(--info)'}"></div></div>
      <div class="pda-val">${a.v}</div>
    `;
    els.phAttrs.appendChild(row);
  }
  els.phRatingAvg.textContent = `Pozisyona özgü: ${rating.toFixed(1)}`;

  // Asinalık: en yakın 3 arkadaş
  if (els.phAffinity) {
    els.phAffinity.innerHTML = '';
    const aff = p.affinity || {};
    const teammates = Object.entries(aff)
      .map(([tid, v]) => {
        const mate = user.players.find(x => x.id === tid);
        return mate ? { name: mate.name, pos: mate.position, value: v } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    if (teammates.length === 0) {
      els.phAffinity.innerHTML = '<div class="muted" style="font-size:11px">Henüz yakın arkadaş yok — maç oyna</div>';
    } else {
      for (const t of teammates) {
        const item = document.createElement('div');
        item.className = 'aff-item';
        const tier = t.value > 70 ? 'high' : t.value > 30 ? 'mid' : 'low';
        item.innerHTML = `
          <span class="aff-pos">${t.pos}</span>
          <span class="aff-name">${t.name}</span>
          <span class="aff-bar"><span class="aff-fill ${tier}" style="width:${t.value}%"></span></span>
          <span class="aff-val">${t.value.toFixed(0)}</span>
        `;
        els.phAffinity.appendChild(item);
      }
    }
  }

  // Antrenman dropdown
  const trainingAreas = {
    GK: ['reflexes', 'positioning', 'composure', 'passing', 'leadership'],
    DF: ['tackling', 'marking', 'interception', 'aerial', 'positioning'],
    OS: ['passing', 'vision', 'decisions', 'dribbling', 'firstTouch'],
    FV: ['finishing', 'shooting', 'composure', 'pace', 'firstTouch'],
  };
  const areas = trainingAreas[p.position] || ['passing'];
  els.phTrainArea.innerHTML = areas.map(a => `<option value="${a}">${areaLabels[a] || a}</option>`).join('');

  // Son maç performansı
  if (p.lastEarned !== undefined) {
    const sign = p.lastEarned >= 0 ? '+' : '';
    const color = p.lastEarned >= 0 ? 'var(--good)' : 'var(--bad)';
    els.phLastPerf.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 24px; font-weight: 800; color: ${color};">${sign}${formatMoney(p.lastEarned)}</div>
        <div class="muted" style="font-size: 12px;">${p.lastPerfNote || ''}</div>
      </div>
    `;
  } else {
    els.phLastPerf.textContent = 'Henüz maç oynamadı.';
  }

  if (window.lucide) lucide.createIcons();
}

els.btnPlayerBack?.addEventListener('click', () => navigate('/squad'));
els.phTrainBtn?.addEventListener('click', () => {
  if (!currentPlayerId) return;
  const user = getUserTeam();
  const p = user?.players.find(x => x.id === currentPlayerId);
  if (!p) return;
  const area = els.phTrainArea.value;
  if (!p.attrs) p.attrs = {};
  const current = p.attrs[area] || 50;
  const cost = 50_000;
  if (!p.personalMoney) p.personalMoney = 0;
  if (p.personalMoney < cost) {
    alert(`Yetersiz kişisel bütçe! (${formatMoney(p.personalMoney)} / ${formatMoney(cost)})`);
    return;
  }
  p.personalMoney -= cost;
  p.attrs[area] = Math.min(99, current + 2);
  saveGame();
  renderPlayerPage();
});

// === TRANSFER ===
function buyPlayer(p) {
  const user = getUserTeam();
  if (!user || !user.budget) return;
  if (user.budget.budget < p.value) {
    alert('Yetersiz bütçe!');
    return;
  }
  if (!confirm(`${p.name} için ${formatMoney(p.value)} ödeyeceksin. Kabul?`)) return;
  user.budget.spendTransfer(p.value, p.name, game.league.currentWeek);
  p.id = `user_${p.id}_${Date.now()}`;
  p.onField = false;
  user.players.push(p);
  const idx = game.transferMarket.players.findIndex(x => x === p);
  if (idx >= 0) game.transferMarket.players.splice(idx, 1);
  saveGame();
  applyRoute();
  if (window.lucide) lucide.createIcons();
}

// === SEZON SONU ===
function endSeason() {
  if (!game) return;
  for (const team of game.league.teams) {
    for (const p of team.players) {
      const age = p.age || 25;
      let delta = 0;
      if (age < 23) delta = 0.5;
      else if (age < 28) delta = 0.1;
      else if (age < 32) delta = -0.3;
      else delta = -0.7;
      const attrs = p.attrs || {};
      for (const key in attrs) {
        attrs[key] = Math.max(20, Math.min(p.potential || 90, attrs[key] + delta));
      }
      p.age = age + 1;
    }
  }
  game.league.season += 1;
  game.league.currentWeek = 0;
  const { League } = window.__NS;
  const oldUserTeam = getUserTeam();
  game.league = new League();
  game.league.userTeamId = 'user';
  const newUserTeam = buildTeam(oldUserTeam.name, '442', true);
  newUserTeam.players = oldUserTeam.players.map(p => ({ ...p, onField: false, live: { ...p.live, currentStamina: 100, yellowCount: 0, redCard: false, injured: false, rating: 6.5 } }));
  newUserTeam.budget = oldUserTeam.budget;
  game.league.setup(newUserTeam);
  saveGame();
  applyRoute();
  alert(`🎉 Sezon ${game.league.season - 1} tamamlandı!\nYeni sezon başladı. Tüm oyuncular yaşlandı, yetenekler güncellendi.`);
}

// === EVENTS ===
els.btnPlayWeek.addEventListener('click', () => playWeek(false));
els.btnResumeMatch?.addEventListener('click', () => navigate('/match'));
els.btnReset.addEventListener('click', () => {
  if (confirm('Yeni sezon başlatılsın mı? Tüm ilerleme sıfırlanacak.')) {
    localStorage.removeItem(STORAGE_KEY);
    newGame();
  }
});
els.btnSkipMatch.addEventListener('click', () => {
  if (match) {
    stopTimer();
    runFullMatch();
  }
});
els.btnBackHome.addEventListener('click', () => navigate('/'));
els.btnNextWeek.addEventListener('click', () => playWeek(false));

els.search.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  els.searchClear.style.display = searchQuery ? 'flex' : 'none';
  renderEvents();
});
els.searchClear.addEventListener('click', () => {
  els.search.value = ''; searchQuery = '';
  els.searchClear.style.display = 'none';
  renderEvents();
  els.search.focus();
});

els.filterPosition.addEventListener('change', renderTransferPage);
els.filterAge.addEventListener('change', renderTransferPage);
els.filterStars.addEventListener('change', renderTransferPage);

// === INIT ===
import('./js/match-engine.js').then(mod => {
  window.__NS = { League: mod.League };
  const saved = loadGame();
  if (saved) {
    const league = new mod.League();
    league.currentWeek = saved.league.currentWeek;
    league.season = saved.league.season;
    league.userTeamId = 'user';
    league.teams = saved.league.teams.map(t => {
      t.budget = { budget: t.budget.budget, history: t.budget.history || [], weeklyWages: 0, payWeeklyWages() { return { ok: true }; }, receiveMatchIncome(w, won) { this.budget += won ? 300000 : 200000; } };
      return t;
    });
    league.fixtures = saved.league.fixtures;
    game = { league, transferMarket: saved.transferMarket };
    game.trainingPoints = saved.trainingPoints ?? 5;
    game.lastTrainingWeek = saved.lastTrainingWeek ?? -1;
    game.offers = saved.offers || [];
  } else {
    resetNamePool();
    resetClubPool();
    const league = new mod.League();
    const userClub = generateUniqueClubName();
    const userTeam = buildTeam(userClub, '442', true);
    for (const p of userTeam.players) {
      p.age = 18 + Math.floor(Math.random() * 18);
      p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
      p.value = 1_000_000 + p.stars * 2_000_000 + Math.floor(Math.random() * 1_000_000);
      p.wage = 50_000 + p.stars * 50_000;
    }
    league.setup(userTeam);
    league.userTeamId = 'user';
    deployLineupToTeam(userTeam);
    game = { league, transferMarket: generateMarket(), trainingPoints: 5, lastTrainingWeek: -1, offers: [] };
    // Yeni oyun: tüm oyunculara başlangıç kişisel parası + istatistik
    for (const p of userTeam.players) {
      p.personalMoney = 100_000 + p.stars * 50_000;
      p.goals = 0; p.assists = 0; p.matchesPlayed = 0; p.totalRating = 0;
    }
    saveGame();
  }
  els.searchClear.style.display = 'none';
  applyRoute();
});
