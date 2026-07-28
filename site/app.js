// /workspace/site/app.js
// Narrative Spiker — Normal + Başkan modu
// Sakatlık onayı, manuel değişiklik, transfer, gelişim, lig

import {
  makeMatchState,
  startMatch,
  simulateMinute,
  createNarrator,
  buildTeam,
  generateMatchClubs,
  generateUniqueName,
  resetNamePool,
  resetClubPool,
} from './js/match-engine.js';

if (window.lucide) lucide.createIcons();

// === STATE ===
let mode = 'normal'; // 'normal' | 'manager'
let match = null;
let timer = null;
let speed = 100;
let searchQuery = '';
let allEvents = [];

let HOME = null;
let AWAY = null;
let league = null;          // Başkan modu için
let userTeam = null;         // Başkan modu kullanıcı takımı
let pendingInjury = null;    // Sakatlık onayı bekliyor
let matchPausedForInjury = false;

// === TEAM BUILDER ===
function buildMatchTeams() {
  resetNamePool();
  resetClubPool();
  const clubs = generateMatchClubs();
  HOME = buildTeam(clubs.home, '442', true);
  AWAY = buildTeam(clubs.away, '442', false);
  for (const team of [HOME, AWAY]) {
    for (const p of team.players) {
      p.age = 18 + Math.floor(Math.random() * 18);
      p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
      p.live = p.live || {};
      p.live.x = p.live.x || 50;
      p.live.y = p.live.y || 35;
      p.live.currentStamina = 100;
      p.live.currentMorale = 60;
      p.live.form = 0;
      p.live.extraEffort = 0;
      p.live.passesAttempted = 0;
      p.live.passesCompleted = 0;
      p.live.shots = 0;
      p.live.shotsOnTarget = 0;
      p.live.goals = 0;
      p.live.saves = 0;
      p.live.conceded = 0;
      p.live.yellowCount = 0;
      p.live.yellowCards = 0;
      p.live.foulsCommitted = 0;
      p.live.onField = p.live.onField || false;
      p.live.rating = 6.5;
      p.live.injuredThisTick = false;
    }
  }
  return { HOME, AWAY };
}

// === DOM ===
const $ = id => document.getElementById(id);
const els = {
  modeSelect: $('mode-select'),
  btnStart: $('btn-start'),
  btnStartLabel: $('btn-start-label'),
  btnPause: $('btn-pause'),
  btnReset: $('btn-reset'),
  speed: $('speed'),
  speedVal: $('speed-val'),
  homeName: $('home-name'),
  awayName: $('away-name'),
  homeScore: $('home-score'),
  awayScore: $('away-score'),
  matchMinute: $('match-minute'),
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
  // Manager
  managerPanel: $('manager-panel'),
  budgetAmount: $('budget-amount'),
  currentWeek: $('current-week'),
  userPoints: $('user-points'),
  userRank: $('user-rank'),
  nextHome: $('next-home'),
  nextAway: $('next-away'),
  lineupList: $('lineup-list'),
  benchList: $('bench-list'),
  btnPlayWeek: $('btn-play-week'),
  transferBudget: $('transfer-budget'),
  transferList: $('transfer-list'),
  filterPosition: $('filter-position'),
  filterAge: $('filter-age'),
  filterStars: $('filter-stars'),
  standingsList: $('standings-list'),
  devList: $('dev-list'),
  // Modal
  injuryModal: $('injury-modal'),
  injuryMessage: $('injury-message'),
  injurySubstitutes: $('injury-substitutes'),
};

// === MATCH INIT ===
function newMatch() {
  if (mode === 'manager' && userTeam) {
    HOME = userTeam;
    // Rakip olarak random AI takım
    resetNamePool();
    const oppName = generateUniqueName() + ' FC';
    AWAY = buildTeam(oppName, '442', false);
    for (const p of AWAY.players) {
      p.age = 18 + Math.floor(Math.random() * 18);
      p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
      p.live = p.live || {};
      p.live.x = 50; p.live.y = 35;
      p.live.currentStamina = 100; p.live.currentMorale = 60;
      p.live.form = 0; p.live.extraEffort = 0;
      p.live.passesAttempted = 0; p.live.passesCompleted = 0;
      p.live.shots = 0; p.live.shotsOnTarget = 0;
      p.live.goals = 0; p.live.saves = 0; p.live.conceded = 0;
      p.live.yellowCount = 0; p.live.yellowCards = 0;
      p.live.foulsCommitted = 0; p.live.onField = false;
      p.live.rating = 6.5;
      p.live.injuredThisTick = false;
    }
  } else {
    buildMatchTeams();
  }

  match = makeMatchState({
    home: HOME, away: AWAY,
    homeFormation: '442', awayFormation: '442',
  });
  match.mode = mode;

  // Sakatlık callback'i — başkan modunda oyunu duraklat
  startMatch(match);

  allEvents = [];
  els.narrativeStream.innerHTML = '<p class="placeholder">Maç başlıyor...</p>';
  els.eventsList.innerHTML = '';
  els.eventCount.textContent = '0';
  els.searchInfo.textContent = '';
  els.search.value = '';
  searchQuery = '';
  els.searchClear.style.display = 'none';
  renderScore();
  if (mode === 'manager' && userTeam) {
    renderSquad();
  }
  lucide.createIcons();
}

// === RENDER ===
function renderScore() {
  els.homeName.textContent = match.home.name;
  els.awayName.textContent = match.away.name;
  els.homeScore.textContent = match.homeScore;
  els.awayScore.textContent = match.awayScore;
  els.matchMinute.textContent = `${match.minute}'`;

  const homeOnField = match.home.players.filter(p => p.onField).length;
  const awayOnField = match.away.players.filter(p => p.onField).length;
  const homeYellows = match.home.players.filter(p => (p.live?.yellowCount || 0) > 0).length;
  const awayYellows = match.away.players.filter(p => (p.live?.yellowCount || 0) > 0).length;
  const homeReds = match.home.players.filter(p => p.live?.redCard).length;
  const awayReds = match.away.players.filter(p => p.live?.redCard).length;

  els.homePlayers.textContent = homeOnField;
  els.awayPlayers.textContent = awayOnField;
  els.homeYellows.textContent = homeYellows;
  els.awayYellows.textContent = awayYellows;
  els.homeReds.textContent = homeReds;
  els.awayReds.textContent = awayReds;

  if (match.substitution) {
    els.homeSubs.textContent = match.substitution.getRemainingSubs('home');
    els.awaySubs.textContent = match.substitution.getRemainingSubs('away');
  }
}

// === SEARCH ===
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

function eventMatchesPlayer(ev, query) {
  if (!query) return true;
  const text = (ev.text || '').toLowerCase();
  if (text.includes(query)) return true;
  for (const team of [HOME, AWAY]) {
    if (!team?.players) continue;
    for (const p of team.players) {
      if (p.name?.toLowerCase().includes(query)) {
        if (ev.actor === p.id || ev.target === p.id || ev.scorer === p.id || ev.loser === p.id) {
          return true;
        }
      }
    }
  }
  return false;
}

function renderEvents() {
  const total = allEvents.length;
  const filtered = searchQuery
    ? allEvents.filter(ev => eventMatchesPlayer(ev, searchQuery))
    : allEvents;
  els.eventsList.innerHTML = '';
  for (let i = filtered.length - 1; i >= 0; i--) {
    appendEventToList(filtered[i], false);
  }
  els.eventCount.textContent = searchQuery
    ? `${filtered.length} / ${total}`
    : `${total}`;
  els.searchInfo.textContent = searchQuery
    ? `Arama: "${searchQuery}"`
    : '';
}

function appendEventToList(ev, prepend = true) {
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
    <span class="e-min">${ev.minute}'</span>
    <span class="e-type ${typeClass}">${typeLabel(type, ev.reason)}</span>
    <span class="e-text">${(ev.text || '').replace(/^\d+'\s*/, '')}</span>
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

// === NARRATIVE ===
function appendNarratives(narratives) {
  if (!narratives?.length) return;
  const placeholder = els.narrativeStream.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  for (const n of narratives) {
    const div = document.createElement('div');
    const type = n.type || 'sequence';
    div.className = `narrative-item ${type}`;
    div.innerHTML = `<span class="n-minute">${n.minute}'</span> ${n.text.replace(/^\d+'\s*/, '')}`;
    els.narrativeStream.appendChild(div);
  }
  els.narrativeStream.scrollTop = els.narrativeStream.scrollHeight;
}

// === SIMULATION ===
function tick() {
  if (!match || match.minute >= 90) {
    stopTimer();
    els.btnStart.disabled = false;
    els.btnStartLabel.textContent = 'Bitti';
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Sakatlık modalı açıksa maçı duraklat
  if (matchPausedForInjury) {
    return;
  }

  const beforeN = match.narrativeLog.length;
  const beforeE = match.events.length;
  simulateMinute(match);
  const newNarratives = match.narrativeLog.slice(beforeN);
  const newEvents = match.events.slice(beforeE);

  // Sakatlık kontrolü (Başkan modu + autoSubs=false)
  for (const ev of newEvents) {
    if (ev.type === 'injury') {
      if (mode === 'manager') {
        // Oyuncuyu çıkar, modal aç
        const player = match[ev.side]?.players?.find(p => p.id === ev.actor);
        if (player) {
          player.onField = false;
          showInjuryModal(ev.side, player);
        }
      }
    }
  }

  renderScore();
  if (mode === 'manager' && userTeam) {
    renderSquad();
  }
  for (const ev of newEvents) {
    allEvents.push(ev);
    if (!searchQuery) appendEventToList(ev, true);
  }
  els.eventCount.textContent = searchQuery
    ? `${allEvents.filter(e => eventMatchesPlayer(e, searchQuery)).length} / ${allEvents.length}`
    : `${allEvents.length}`;
  if (searchQuery) renderEvents();
  appendNarratives(newNarratives);
}

function startTimer() {
  if (timer) return;
  timer = setInterval(tick, speed);
  els.btnPause.disabled = false;
  els.btnStart.disabled = true;
  els.btnStartLabel.textContent = 'Devam';
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  els.btnPause.disabled = true;
}

// === SAKATLIK MODAL ===
function showInjuryModal(side, player) {
  matchPausedForInjury = true;
  stopTimer();
  pendingInjury = { side, player };
  els.injuryMessage.textContent = `🏥 ${player.name} sakatlandı! Oyunu terk etmek zorunda. Yedek oyunculardan birini seç.`;
  // Yedekleri göster
  const team = match[side];
  const bench = team.players.filter(p => !p.onField && !p.live?.redCard);
  els.injurySubstitutes.innerHTML = '';
  if (bench.length === 0) {
    els.injurySubstitutes.innerHTML = '<p style="color: var(--text-dim); font-size: 12px;">Yedek oyuncu yok, 10 kişi devam.</p>';
  } else {
    // Aynı pozisyondan önce
    bench.sort((a, b) => {
      const aPos = a.position === player.position ? 0 : 1;
      const bPos = b.position === player.position ? 0 : 1;
      return aPos - bPos;
    });
    for (const sub of bench.slice(0, 8)) {
      const item = document.createElement('div');
      item.className = 'injury-sub-item';
      item.innerHTML = `
        <span class="p-pos">${sub.position}</span>
        <span class="p-name">${sub.name}</span>
        <span class="p-age">${sub.age}y</span>
        <span class="p-rating">${(sub.live?.rating || 6.5).toFixed(1)}</span>
      `;
      item.addEventListener('click', () => doInjurySubstitution(side, player, sub));
      els.injurySubstitutes.appendChild(item);
    }
  }
  els.injuryModal.style.display = 'flex';
  lucide.createIcons();
}

function doInjurySubstitution(side, outPlayer, inPlayer) {
  // Manuel değişiklik
  const sub = match.substitution.manualSub(side, outPlayer.id, inPlayer.id);
  if (sub.ok) {
    match.events.push(sub.event);
    match.narrativeLog.push({ minute: match.minute, type: 'substitution', text: `🔄 Değişiklik: ${outPlayer.name} çıktı, ${inPlayer.name} girdi (Sakatlık).` });
    appendNarrativeOnly(sub.event.minute, sub.event.text);
    allEvents.push(sub.event);
    if (!searchQuery) appendEventToList(sub.event, true);
  }
  closeInjuryModal();
  renderScore();
  startTimer();
}

function appendNarrativeOnly(minute, text) {
  const placeholder = els.narrativeStream.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  const div = document.createElement('div');
  div.className = 'narrative-item substitution';
  div.innerHTML = `<span class="n-minute">${minute}'</span> ${text.replace(/^\d+'\s*/, '')}`;
  els.narrativeStream.appendChild(div);
  els.narrativeStream.scrollTop = els.narrativeStream.scrollHeight;
}

function closeInjuryModal() {
  els.injuryModal.style.display = 'none';
  matchPausedForInjury = false;
  pendingInjury = null;
}

// === EVENTS ===
els.btnStart.addEventListener('click', () => {
  if (!match || match.minute >= 90) newMatch();
  startTimer();
});
els.btnPause.addEventListener('click', () => {
  if (timer) stopTimer();
  else if (match && match.minute < 90) startTimer();
});
els.btnReset.addEventListener('click', () => {
  stopTimer();
  closeInjuryModal();
  if (mode === 'manager' && userTeam) {
    newMatch();
  } else {
    newMatch();
  }
  els.btnStart.disabled = false;
  els.btnStartLabel.textContent = 'Başlat';
});
els.speed.addEventListener('input', (e) => {
  speed = parseInt(e.target.value);
  els.speedVal.textContent = `${speed}ms`;
  if (timer) { clearInterval(timer); timer = setInterval(tick, speed); }
});
els.modeSelect.addEventListener('change', (e) => {
  mode = e.target.value;
  stopTimer();
  closeInjuryModal();
  if (mode === 'manager') {
    if (!userTeam) initManager();
    els.managerPanel.style.display = 'flex';
    newMatch();
  } else {
    els.managerPanel.style.display = 'none';
    newMatch();
  }
  lucide.createIcons();
});

// === MANAGER MODE ===
async function initManager() {
  // League modülü zaten match-engine.js'te export edildi
  const { League } = await import('./js/match-engine.js');
  league = new League();
  // Kullanıcı takımı
  resetNamePool(); resetClubPool();
  const clubs = generateMatchClubs();
  userTeam = buildTeam(clubs.home, '442', true);
  // Yaş/potential ata
  for (const p of userTeam.players) {
    p.age = 18 + Math.floor(Math.random() * 18);
    p.potential = 50 + p.stars * 15 + Math.floor(Math.random() * 10);
    p.value = 1_000_000 + p.stars * 2_000_000 + Math.floor(Math.random() * 1_000_000);
    p.wage = 50_000 + p.stars * 50_000;
  }
  league.setup(userTeam);
  renderSquad();
  renderStandings();
  renderDevelopment();
  setupTabs();
  setupTransfer();
  setupPlayWeek();
  loadNextMatch();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.style.display = c.dataset.tabContent === tab ? 'block' : 'none';
        c.classList.toggle('active', c.dataset.tabContent === tab);
      });
    });
  });
}

function renderSquad() {
  if (!userTeam) return;
  // İlk 11
  els.lineupList.innerHTML = '';
  const lineup = userTeam.players.filter(p => p.onField);
  for (const p of lineup) {
    const item = document.createElement('div');
    item.className = 'player-item';
    if (p.live?.injured) item.classList.add('injured');
    item.innerHTML = `
      <span class="p-pos">${p.position}</span>
      <span class="p-name">${p.name}</span>
      <span class="p-age">${p.age}y</span>
      <span class="p-rating">${(p.live?.rating || 6.5).toFixed(1)}</span>
    `;
    els.lineupList.appendChild(item);
  }
  // Yedek
  els.benchList.innerHTML = '';
  const bench = userTeam.players.filter(p => !p.onField);
  for (const p of bench) {
    const item = document.createElement('div');
    item.className = 'player-item bench';
    item.innerHTML = `
      <span class="p-pos">${p.position}</span>
      <span class="p-name">${p.name}</span>
      <span class="p-age">${p.age}y</span>
      <span class="p-rating">${(p.live?.rating || 6.5).toFixed(1)}</span>
    `;
    els.benchList.appendChild(item);
  }
  // Bütçe + hafta
  els.budgetAmount.textContent = formatMoney(userTeam.budget?.budget || 50_000_000);
  els.transferBudget.textContent = formatMoney(userTeam.budget?.budget || 50_000_000);
  els.currentWeek.textContent = league?.currentWeek || 1;
  // Puan
  const standings = league?.getStandings() || [];
  const userStanding = standings.find(s => s.isUser);
  if (userStanding) {
    els.userPoints.textContent = userStanding.points;
    els.userRank.textContent = userStanding.pos;
  }
}

function formatMoney(amount) {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M €`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K €`;
  return `${amount} €`;
}

function renderStandings() {
  if (!league) return;
  const standings = league.getStandings();
  els.standingsList.innerHTML = '';
  for (const s of standings) {
    const row = document.createElement('div');
    row.className = 'standing-row' + (s.isUser ? ' user' : '');
    row.innerHTML = `
      <span class="s-pos">${s.pos}</span>
      <span class="s-name">${s.name}</span>
      <span class="s-gd">${s.gd >= 0 ? '+' : ''}${s.gd}</span>
      <span class="s-points">${s.points}</span>
    `;
    els.standingsList.appendChild(row);
  }
}

function renderDevelopment() {
  if (!userTeam) return;
  const players = [...userTeam.players].sort((a, b) => (a.live?.rating || 0) - (b.live?.rating || 0));
  els.devList.innerHTML = '';
  for (const p of players) {
    const item = document.createElement('div');
    item.className = 'player-item';
    const currentAbility = Object.values(p.attrs || {}).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(p.attrs).length);
    const potential = p.potential || 80;
    const progress = Math.max(0, Math.min(100, ((currentAbility - 40) / (potential - 40)) * 100));
    item.innerHTML = `
      <span class="p-pos">${p.position}</span>
      <span class="p-name">${p.name}</span>
      <span class="p-age">${p.age}y</span>
      <span class="p-rating" style="color: var(--text); font-size: 10px;">${currentAbility.toFixed(0)}/${potential}</span>
    `;
    els.devList.appendChild(item);
  }
}

function loadNextMatch() {
  if (!league) return;
  const next = league.getUserMatch(league.currentWeek + 1);
  if (next) {
    const home = league.teams.find(t => t.id === next.homeId);
    const away = league.teams.find(t => t.id === next.awayId);
    els.nextHome.textContent = home?.name || '—';
    els.nextAway.textContent = away?.name || '—';
  }
}

function setupTransfer() {
  if (!userTeam) return;
  const market = userTeam.transferMarket || (userTeam.transferMarket = { players: [] });
  // Piyasa henüz yoksa üret
  if (!market.players.length) {
    // Basit piyasa
    const sizes = [
      { count: 2, stars: 3, minAge: 24, maxAge: 32 },
      { count: 4, stars: 2, minAge: 22, maxAge: 30 },
      { count: 6, stars: 1, minAge: 18, maxAge: 23 },
    ];
    market.players = [];
    resetNamePool();
    for (const size of sizes) {
      for (let i = 0; i < size.count; i++) {
        const team = buildTeam('Market', '442', true);
        const p = team.players[0];
        p.age = size.minAge + Math.floor(Math.random() * (size.maxAge - size.minAge));
        p.stars = size.stars;
        p.potential = 50 + size.stars * 15 + Math.floor(Math.random() * 10);
        p.value = 1_000_000 + p.stars * 2_000_000 + Math.floor(Math.random() * 3_000_000);
        p.wage = 50_000 + p.stars * 50_000;
        p.live = p.live || { x: 50, y: 35, currentStamina: 100, rating: 6.5 };
        p.live.rating = 6.0 + size.stars + Math.random() * 0.5;
        market.players.push(p);
      }
    }
  }
  renderTransferList();

  // Filtreler
  const updateList = () => renderTransferList();
  els.filterPosition.addEventListener('change', updateList);
  els.filterAge.addEventListener('change', updateList);
  els.filterStars.addEventListener('change', updateList);
}

function renderTransferList() {
  if (!userTeam?.transferMarket) return;
  const market = userTeam.transferMarket;
  const pos = els.filterPosition.value;
  const maxAge = parseInt(els.filterAge.value) || 99;
  const minStars = parseInt(els.filterStars.value) || 0;

  const filtered = market.players.filter(p =>
    (!pos || p.position === pos) &&
    p.age <= maxAge &&
    p.stars >= minStars
  );

  els.transferList.innerHTML = '';
  for (const p of filtered.slice(0, 30)) {
    const item = document.createElement('div');
    item.className = 'transfer-item';
    item.innerHTML = `
      <span class="t-pos">${p.position}</span>
      <span class="t-name">${p.name}</span>
      <span class="t-age">${p.age}y</span>
      <span class="t-value">${formatMoney(p.value)}</span>
      <button class="btn t-buy" data-pid="${p.id}">Al</button>
    `;
    item.querySelector('.t-buy').addEventListener('click', () => buyPlayer(p));
    els.transferList.appendChild(item);
  }
  lucide.createIcons();
}

function buyPlayer(p) {
  if (!userTeam || !userTeam.budget) return;
  if (userTeam.budget.budget < p.value) {
    alert('Yetersiz bütçe!');
    return;
  }
  if (confirm(`${p.name} için ${formatMoney(p.value)} ödeyeceksin. Kabul?`)) {
    userTeam.budget.spendTransfer(p.value, p.name, league?.currentWeek || 1);
    p.id = `user_${p.id}`;
    p.onField = false;
    userTeam.players.push(p);
    const idx = userTeam.transferMarket.players.findIndex(x => x.id === p.id || x === p);
    if (idx >= 0) userTeam.transferMarket.players.splice(idx, 1);
    renderSquad();
    renderTransferList();
    lucide.createIcons();
  }
}

function setupPlayWeek() {
  els.btnPlayWeek.addEventListener('click', () => {
    if (!league) return;
    const next = league.currentWeek + 1;
    if (next > 34) {
      alert('Sezon bitti! Yeni sezon başlatılıyor...');
      league.endSeason();
      league.currentWeek = 0;
      return;
    }
    const result = league.playWeek(next, (fix) => {
      // Kullanıcı maçı başladı, simülasyonu başlat
      newMatch();
      startTimer();
      return { score: { home: 0, away: 0 } }; // gerçek skor maç bitince güncellenecek
    });
    if (result) {
      renderSquad();
      renderStandings();
      loadNextMatch();
      // AI maç sonuçlarını göster
      if (result.aiMatches?.length) {
        console.log('AI matches:', result.aiMatches);
      }
    }
  });
}

// === INIT ===
els.speedVal.textContent = `${speed}ms`;
els.searchClear.style.display = 'none';
newMatch();
