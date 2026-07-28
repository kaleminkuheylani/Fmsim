// match/ppo_policy.js
// PPO policy loader + forward pass — RL trained model
// İki model desteklenir:
//   - ppo_model.json: 3 action (synthetic env PPO)
//   - ppo_model_real.json: 5 action (real Fmsim verisi supervised)
//   Real model öncelikli yüklenir (gerçek futbola daha yakın).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_MODEL_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'ppo_model_real.json');
const SYNTH_MODEL_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'ppo_model.json');

let policy = null;
let loaded = false;
let modelType = null; // 'real' | 'synth' | null

const ACTION_LABELS_REAL = ['shoot', 'cross', 'passShort', 'passLong', 'dribble'];
const ACTION_LABELS_SYNTH = ['dribble', 'passShort', 'passLong'];

export function loadPPOPolicy() {
  if (loaded) return policy;
  // Önce real model dene
  for (const [path_, type, labels] of [
    [REAL_MODEL_PATH, 'real', ACTION_LABELS_REAL],
    [SYNTH_MODEL_PATH, 'synth', ACTION_LABELS_SYNTH],
  ]) {
    try {
      if (!fs.existsSync(path_)) continue;
      const raw = fs.readFileSync(path_, 'utf-8');
      const m = JSON.parse(raw);
      policy = {
        W1: m.W1, b1: m.b1,
        W2: m.W2, b2: m.b2,
        Wv: m.Wv, bv: m.bv,
        meta: m.meta,
        labels,
      };
      modelType = type;
      loaded = true;
      console.log(`[PPO] Real model yüklendi: ${path_} (action: ${labels.join(', ')})`);
      return policy;
    } catch (e) {
      console.warn(`[PPO] ${path_} yüklenemedi:`, e.message);
    }
  }
  console.warn('[PPO] Hiçbir model yüklenemedi, rule-based fallback.');
  return null;
}

function relu(x) { return Math.max(0, x); }

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

function matmul(W, x) {
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

export function ppoForward(state) {
  if (!loaded) loadPPOPolicy();
  if (!policy) return null;

  const h_pre = addBias(matmul(policy.W1, state), policy.b1);
  const h = h_pre.map(relu);
  const logits = addBias(matmul(policy.W2, h), policy.b2);
  const probs = softmax(logits);
  let value = (policy.bv[0] && policy.bv[0][0]) || 0;
  for (let i = 0; i < h.length; i++) value += (policy.Wv[0] && policy.Wv[0][i] || 0) * h[i];

  let action = 0;
  let best = probs[0];
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > best) { best = probs[i]; action = i; }
  }
  return { probs, action, logp: Math.log(probs[action] + 1e-9), value };
}

export function extractState(player, match) {
  const ball = match.ballPos;
  const side = match.ballSide;
  const team = match[side];
  const opp = side === 'home' ? match.away : match.home;
  const goalX = side === 'home' ? 100 : 0;

  const distToGoal = Math.hypot(ball.x - goalX, ball.y - 35);
  const distance = Math.max(0, Math.min(1, (distToGoal - 5) / 75));

  const forwardDir = side === 'home' ? 1 : -1;
  const opponentsAhead = opp.players.filter(p => {
    if (!p.onField || p.position === 'GK') return false;
    const dx = (p.live.x - ball.x) * forwardDir;
    if (dx < 4) return false;
    const dist = Math.hypot(p.live.x - ball.x, p.live.y - ball.y);
    return dist > 8 && dist < 19;
  }).length;

  const teammatesBetter = team.players.filter(p => {
    if (!p.onField || p.id === player.id) return false;
    const pDist = Math.hypot(p.live.x - goalX, p.live.y - 35);
    return pDist < distToGoal - 5;
  }).length;

  const stamina = (player.live?.currentStamina ?? 100) / 100;
  const vision = Math.max(0, Math.min(1, (player.attrs?.vision ?? 60) / 100));
  const ballProgress = Math.max(0, Math.min(1, (ball.x - 25) / 50));
  const dribbleRate = Math.max(0, Math.min(1, (player.attrs?.dribbling ?? 60) / 100));
  const phase = match.phase?.[side] || 'attacking';
  const phasePressure = phase === 'counter' ? 1.0 : 0.0;

  return [distance, Math.min(1, opponentsAhead / 3), Math.min(1, teammatesBetter / 3),
          stamina, vision, ballProgress, dribbleRate, phasePressure];
}

export function ppoDecide(player, match) {
  const p = loadPPOPolicy();
  if (!p) return null;
  try {
    const state = extractState(player, match);
    const out = ppoForward(state);
    if (!out) return null;
    return policy.labels[out.action];
  } catch (e) {
    return null;
  }
}

export function getModelType() { return modelType; }

loadPPOPolicy();

