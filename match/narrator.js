// match/narrator.js
// Narrative Spiker — olayları hikayeleştirir, sekansları birleştirir, hafıza tutar.
//
// TEMEL PRENSİPLER:
//   1. Sekans tespiti: aynı tarafın art arda pas/taşıma olayları TEK cümlede anlatılır.
//   2. Tempo: tehdit yüksekse kısa kesik cümleler, tehdit düşükse akıcı bağlaçlı.
//   3. Bölge ayrımı: defans çıkışı, orta saha, hücum org, tehlike bölgesi.
//   4. Hafıza: son N sekans tutulur, "az önce kazandıkları top" gibi referanslar için.
//   5. Yorumlar: commentlib modülünden çekilir — modüler, genişletilebilir.

import { PITCH, zoneOf, inHomeBox, inAwayBox } from './state.js';
import { pick, pickOne, getComment, fillTemplate, all as allComments } from './commentlib/index.js';

// === BÖLGE TESPİTİ ===
// Saldıran taraf perspektifinden bölge — "ilerde mi geride mi?"
function attackingZone(x, side) {
  const norm = side === 'home' ? x : 100 - x;
  if (norm < 35) return 'DEFANS_CIKIS';
  if (norm < 65) return 'ORTA_SAHA';
  if (norm < 84) return 'HUCUM_ORG';
  return 'TEHLIKE';
}

// === YÖN HESABI ===
function directionText(y) {
  if (y < 23) return 'sol kanattan';
  if (y > 47) return 'sağ kanattan';
  return 'ortadan';
}

// === OYUNCU ADI ÇÖZÜCÜ ===
function getPlayerName(match, side, id) {
  if (!id) return null;
  const team = match[side];
  if (!team) return null;
  const p = team.players?.find(x => x.id === id || x.name === id);
  if (!p) return null;
  return p.name;
}

// === TEMPLATE FILL ===
// {key} → value. Bilinmeyen key'ler {key} olarak kalır (debug için).
function fill(tpl, vars) {
  if (!tpl) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return (v === undefined || v === null) ? `{${key}}` : v;
  });
}

// === SEKANS MOTORU ===
class SequenceTracker {
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
    // Gürültü eventleri — sekans açma
    if (ev.type === 'out_of_play' || ev.type === 'fail' || ev.type === 'kickoff') {
      this._closeCurrent(match);
      return;
    }

    const ball = match.ballPos;
    const side = match.ballSide;
    const minute = ev.minute ?? match.minute;
    const seqType = this._detectSequenceType(ev, match);
    const zone = attackingZone(ball.x, side);

    // KRİTİK olay → sekansı kapat, yeni sekans aç
    if (this._isCritical(ev)) {
      this._closeCurrent(match);
      this._openNew(seqType, side, minute, ev, match);
      return;
    }

    // Top kazanç/kayıp
    if (ev.type === 'turnover' || ev.type === 'tackle_won') {
      this._closeCurrent(match);
      this._openNew('transition', ev.side, minute, ev, match);
      return;
    }

    // Pas akışı → mevcut sekansı büyüt veya yenisini aç
    if (!this.current) {
      this._openNew(seqType, side, minute, ev, match);
    } else {
      if (this.current.side === side && (minute - this.current.lastMinute) <= 2) {
        this._extendCurrent(ev, side, minute, zone, match);
      } else {
        this._closeCurrent(match);
        this._openNew(seqType, side, minute, ev, match);
      }
    }
  }

  _detectSequenceType(ev, match) {
    if (this.current?.type === 'transition' && this.current.eventCount <= 1) {
      return 'counter';
    }
    const ball = match.ballPos;
    const side = match.ballSide;
    const zone = attackingZone(ball.x, side);
    if (zone === 'DEFANS_CIKIS') return 'build_up';
    if (zone === 'ORTA_SAHA') return 'midfield';
    if (zone === 'HUCUM_ORG') return 'attack';
    return 'danger';
  }

  _isCritical(ev) {
    return ['goal', 'yellow_card', 'red_card', 'corner'].includes(ev.type)
      || (ev.type === 'pass_success' && ev.distance > 35);
  }

  _openNew(type, side, minute, ev, match) {
    this.current = {
      type, side,
      startMinute: minute,
      lastMinute: minute,
      eventCount: 1,
      startZone: attackingZone(match.ballPos.x, side),
      startBallPos: { ...match.ballPos },
      events: [ev],
      actors: new Set(),
      progressive: 0,
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

    if (ev.x !== undefined) {
      const forward = side === 'home'
        ? (ev.x - seq.startBallPos.x)
        : (seq.startBallPos.x - ev.x);
      if (forward > seq.progressive) seq.progressive = forward;
    }

    // Bölge ilerlediyse tip güncelle
    if (zone === 'TEHLIKE' && seq.type !== 'danger') seq.type = 'danger';
    else if (zone === 'HUCUM_ORG' && seq.type === 'build_up') seq.type = 'attack';
    else if (zone === 'ORTA_SAHA' && seq.type === 'build_up') seq.type = 'midfield';
  }

  _closeCurrent() {
    if (this.current) {
      this.history.push({ ...this.current });
      if (this.history.length > this.maxHistory) this.history.shift();
      this.current = null;
    }
  }
}

// === ANA NARRATOR ===
export class Narrator {
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
    return out.length === 1 ? out[0] : out.join(' ');
  }

  _recentTransitionCooldown() {
    return (this.match.minute - this.lastTransitionMinute) < 2;
  }
  _markTransition() {
    this.lastTransitionMinute = this.match.minute;
  }

  _narrateEvent(ev) {
    if (ev.type === 'goal') return this._narrateGoal(ev);
    if (ev.type === 'yellow_card' || ev.type === 'red_card') return this._narrateCard(ev);
    if (ev.type === 'corner') return this._narrateCorner(ev);
    if (ev.type === 'injury') return this._narrateInjury(ev);
    if (ev.type === 'substitution') return this._narrateSubstitution(ev);

    if (ev.type === 'out_of_play' && (ev.reason === 'sut_isabetsiz' || ev.reason === 'kaleciKurtardi')) {
      return this._narrateShot(ev);
    }

    if (ev.type === 'pass_success') {
      const seq = this.tracker.current;
      if (seq && seq.type === 'danger' && seq.eventCount >= 3) {
        const actor = this._nameOf(ev.side, ev.actor);
        const target = this._nameOf(ev.side, ev.target);
        if (actor && target) {
          return `${ev.minute}' ${actor} son pası verdi — ${target} aldı!`;
        }
      }
      return null;
    }

    if (ev.type === 'turnover' || ev.type === 'tackle_won') {
      return this._narrateTransition(ev);
    }

    return null;
  }

  _narrateSubstitution(ev) {
    const team = this._teamName(ev.side);
    const out = this._nameOf(ev.side, ev.actor);
    const inP = this._nameOf(ev.side, ev.target);
    if (!out || !inP) return null;

    // Hangi kategori? reason'a göre
    let key = 'motivation.substitution.goingOut';
    if (ev.reason === 'Sakatlık') key = 'motivation.substitution.injury';
    else if (ev.reason === 'Taktik değişiklik') key = 'motivation.substitution.tactical';
    else if (ev.out) key = 'motivation.substitution.goingOut';

    const tpl = pick(key);
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { out, in: inP, team });
  }

  _narrateInjury(ev) {
    const actor = this._nameOf(ev.side, ev.actor);
    if (!actor) return null;
    const severity = ev.severity || 'medium';
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
    const sideScore = ev.side === 'home' ? home : away;
    const oppScore = ev.side === 'home' ? away : home;
    const diff = sideScore - oppScore;
    let result;
    if (diff === 1) {
      result = oppScore === 0 ? `${team} maçta öne geçti!` : `${team} öne geçti!`;
    } else if (diff === 0) {
      result = `${team} eşitledi!`;
    } else if (diff > 1) {
      result = `${team} farkı ${diff}'e çıkardı!`;
    } else {
      result = `${team} farkı kapattı!`;
    }

    // Hangi gol template'ini seç?
    let key = 'critical.goal.normal';
    if (minute < 15) key = 'critical.goal.early';
    if ((minute - this.lastGoalMinute) > 25) key = 'critical.goal.drought';
    if (diff === 0 && oppScore > 0) key = 'critical.goal.equalizer';
    if (diff === 1 && minute > 80) key = 'critical.goal.winner';

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
    const key = ev.type === 'red_card' ? 'critical.red' : 'critical.yellow';
    const tpl = pick(key);
    if (!tpl) return null;
    return `${ev.minute}' ` + fill(tpl, { actor, team });
  }

  _narrateCorner(ev) {
    const team = this._teamName(ev.side);
    const tpl = pick('critical.corner');
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

    if (ev.reason === 'sut_isabetsiz') {
      const direction = this.match.ballPos.y < 35 ? 'yandan' : 'üstten';
      const tpl = pick('critical.shotMiss');
      if (!tpl) return null;
      return `${minute}' ` + fill(tpl, { actor, direction });
    }
    if (ev.reason === 'kaleciKurtardi') {
      const keeperSide = side === 'home' ? 'away' : 'home';
      const keeper = this.match[keeperSide]?.players?.find(p => p.position === 'GK');
      const tpl = pick('critical.shotSaved');
      if (!tpl) return null;
      return `${minute}' ` + fill(tpl, { actor, keeper: keeper?.name || 'kaleci' });
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

    // Hangi transition kategorisi?
    let key = 'transition.lost';
    if (ev.reason === 'pas_kesildi' || ev.text?.includes('kesti')) key = 'transition.intercept';
    else if (ev.type === 'tackle_won' || ev.reason === 'müdahale') key = 'transition.tackle';
    else if (ev.reason === 'dripling_kayip') key = 'transition.dribbleLoss';

    const tpl = pick(key);
    if (!tpl) return null;
    this._markTransition();
    return `${ev.minute}' ` + fill(tpl, { team, winner, loser: ev.loser ? this._nameOf(ev.side === 'home' ? 'away' : 'home', ev.loser) : 'oyuncu' });
  }

  // === SEKANS OLGUNLAŞMA ===
  flushSequence() {
    const seq = this.tracker.current;
    if (!seq || seq.eventCount < 2) {
      this.tracker._closeCurrent();
      return null;
    }
    if (seq.type === 'transition') {
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

    // Counter ise özel
    if (seq.type === 'counter') {
      if (!firstActor) return null;
      const { template } = pickOne(['counter.classic', 'counter.deep', 'counter.advantage', 'counter.run']);
      if (!template) return null;
      return `${minute}' ` + fill(template, { team, actor: firstActor, direction });
    }

    // Build-up
    if (seq.type === 'build_up') {
      const { template } = pickOne(['build_up.normal', 'build_up.slow', 'build_up.fast']);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        direction,
      });
    }

    // Midfield
    if (seq.type === 'midfield') {
      const { template } = pickOne(['midfield.tempo', 'midfield.shortPasses', 'midfield.progressing']);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        passes,
      });
    }

    // Attack
    if (seq.type === 'attack') {
      // Kanat mı orta mı?
      let key;
      if (this.match.ballPos.y < 23) key = 'attack.left';
      else if (this.match.ballPos.y > 47) key = 'attack.right';
      else key = 'attack.center';
      const { template } = pickOne([key, 'attack.build', 'attack.finalBall']);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
        direction,
      });
    }

    // Danger
    if (seq.type === 'danger') {
      const { template } = pickOne(['danger.critical', 'danger.finalPass', 'danger.zone', 'danger.shotPrep', 'danger.inBox']);
      if (!template) return null;
      return `${minute}' ` + fill(template, {
        team,
        actor: firstActor,
        target: lastActor,
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
    return this.match[side]?.name || (side === 'home' ? 'Ev sahibi' : 'Deplasman');
  }

  recentSequences(n = 3) {
    return this.tracker.history.slice(-n);
  }
}

export function createNarrator(match) {
  return new Narrator(match);
}

// Yorum kütüphanesini dışarıya da aç (debug/inspection için)
export { pick, pickOne, getComment, fillTemplate, allComments };
