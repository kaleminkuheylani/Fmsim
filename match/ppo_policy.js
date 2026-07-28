// match/ppo_policy.js
// PPO policy loader + forward pass — RL trained model
// Model: scripts/rl/ppo_model.json (Python tarafından üretildi)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'ppo_model.json');

let policy = null; // {W1, b1, W2, b2, Wv, bv}
let loaded = false;

export function loadPPOPolicy() {
  if (loaded) return policy;
  try {
    const raw = fs.readFileSync(MODEL_PATH, 'utf-8');
    const m = JSON.parse(raw);
    policy = {
      W1: m.W1, b1: m.b1,
      W2: m.W2, b2: m.b2,
      Wv: m.Wv, bv: m.bv,
      meta: m.meta,
    };
    loaded = true;
    return policy;
  } catch (e) {
    console.warn('[PPO] Model yüklenemedi, rule-based fallback:', e.message);
    return null;
  }
}

function relu(x) { return Math.max(0, x); }

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

function matmul(W, x) {
  // W: [out][in], x: [in] → [out]
  const out = new Array(W.length).fill(0);
  for (let i = 0; i < W.length; i++) {
    let s = 0;
    const row = W[i];
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    out[i] = s;
  }
  return out;
}

function addBias(h, b) {
  return h.map((v, i) => v + b[i]);
}

/**
 * Forward pass: 8-özellikli state → 3 action olasılığı
 * @param {number[]} state - 8 özellik, 0-1 normalize
 * @returns {object} {probs, action, logp, value} — action 0=dribble, 1=passShort, 2=passLong
 */
export function ppoForward(state) {
  if (!loaded) loadPPOPolicy();
  if (!policy) return null;

  // Hidden
  const h_pre = addBias(matmul(policy.W1, state), policy.b1);
  const h = h_pre.map(relu);
  // Logits
  const logits = addBias(matmul(policy.W2, h), policy.b2);
  // Probs
  const probs = softmax(logits);
  // Value
  let value = policy.bv[0];
  for (let i = 0; i < h.length; i++) value += policy.Wv[0][i] * h[i];
  // Action (argmax)
  let action = 0;
  let best = probs[0];
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > best) { best = probs[i]; action = i; }
  }
  const logp = Math.log(probs[action] + 1e-9);
  return { probs, action, logp, value };
}

/**
 * State çıkarma — Python tarafıyla aynı 8 özellik:
 * 0: distance_to_goal (0=yakın, 1=uzak)
 * 1: opponents_ahead (0=yok, 1=çok)
 * 2: teammates_better_pos (0=yok, 1=var)
 * 3: stamina (0=yorgun, 1=taze)
 * 4: vision (0=kör, 1=iyi)
 * 5: ball_progress (0=kendi yarısı, 1=rakip yarısı)
 * 6: dribble_rate (0=düşük, 1=yüksek)
 * 7: phase_pressure (0=normal, 1=kontra)
 */
export function extractState(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const team = match[side];
  const opp = side === 'home' ? match.away : match.home;

  // 0: distance_to_goal (normalize 0-1, 0=yakın 5m, 1=uzak 80m)
  const goalX = side === 'home' ? 100 : 0;
  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  const distance = Math.max(0, Math.min(1, (distToGoal - 5) / 75));

  // 1: opponents_ahead (8-19m mesafede 0-3+ rakip)
  const forwardDir = side === 'home' ? 1 : -1;
  const opponentsAhead = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const dx = (p.live.x - ball.x) * forwardDir;
    if (dx < 4) return false;
    const dist = Math.hypot(p.live.x - ball.x, p.live.y - ball.y);
    return dist > 8 && dist < 19;
  }).length;
  const oppNorm = Math.max(0, Math.min(1, opponentsAhead / 3));

  // 2: teammates_better_pos (kaleye 5m+ daha yakın arkadaş sayısı / 3)
  const myDistToGoal = distToGoal;
  const teammatesBetter = team.players.filter(p => {
    if (!p.onField || p.id === player.id) return false;
    const pDist = Math.hypot(p.live.x - goalX, p.live.y - 35);
    return pDist < myDistToGoal - 5;
  }).length;
  const tmNorm = Math.max(0, Math.min(1, teammatesBetter / 3));

  // 3: stamina (0-100 → 0-1)
  const stamina = (player.live?.currentStamina ?? 100) / 100;

  // 4: vision (player.vision attribute 0-100 → 0-1, fallback 60)
  const vision = Math.max(0, Math.min(1, (player.attrs?.vision ?? 60) / 100));

  // 5: ball_progress (kendi yarısı 0 → rakip yarısı 1, normalize 0-50)
  const ballProgress = Math.max(0, Math.min(1, (ball.x - 25) / 50));

  // 6: dribble_rate (player.dribbling 0-100 → 0-1)
  const dribbleRate = Math.max(0, Math.min(1, (player.attrs?.dribbling ?? 60) / 100));

  // 7: phase_pressure (counter fazında 1, diğer 0)
  const phase = match.phase?.[side] || 'attacking';
  const phasePressure = phase === 'counter' ? 1.0 : 0.0;

  return [distance, oppNorm, tmNorm, stamina, vision, ballProgress, dribbleRate, phasePressure];
}

/**
 * decideAction için PPO wrapper.
 * 'dribble' | 'passShort' | 'passLong' string döner.
 * PPO model yoksa veya hata olursa null döner (caller rule-based kullanır).
 */
export function ppoDecide(player, match) {
  const p = loadPPOPolicy();
  if (!p) return null;
  try {
    const state = extractState(player, match);
    const out = ppoForward(state);
    if (!out) return null;
    return ['dribble', 'passShort', 'passLong'][out.action];
  } catch (e) {
    return null;
  }
}

// İlk yükleme denemesi (async-safe)
loadPPOPolicy();
