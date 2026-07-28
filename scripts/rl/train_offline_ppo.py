"""
Offline RL: Fmsim'in gerçek aksiyon loglarından PPO ile yeniden eğit.
JSONL training_data.jsonl'i oku, PPO clipped surrogate + value loss.

Veri: scripts/rl/training_data.jsonl
  Her satır: {state: [8], action: int, reward: float, success: float, ...}

Action mapping:
  0: shoot, 1: cross, 2: passShort, 3: passLong, 4: dribble

Reward shaping (zaten veride var):
  goal +10, shot -1/+1, cross +2, pass +1.5/+2.5, dribble +1, turnover -3
"""

import numpy as np
import json
import os
import time
import sys
import math

np.random.seed(42)

STATE_DIM = 8
N_ACTIONS = 5

# === LOAD DATA ===
data_path = os.path.join(os.path.dirname(__file__), 'training_data.jsonl')
print(f"=== Offline PPO (Replay Buffer) ===")
print(f"Veri: {data_path}")

states = []
actions = []
rewards = []
successes = []
positions = []
with open(data_path) as f:
    for line in f:
        d = json.loads(line)
        states.append(d['state'])
        actions.append(d['action'])
        rewards.append(d['reward'])
        successes.append(d.get('success', 0))
        positions.append(d.get('player_pos', 'OS'))

states = np.array(states, dtype=np.float32)
actions = np.array(actions, dtype=np.int32)
rewards = np.array(rewards, dtype=np.float32)
successes = np.array(successes, dtype=np.float32)
N = len(states)
print(f"Toplam transition: {N}")
print(f"Action dağılımı: ", end='')
unique, counts = np.unique(actions, return_counts=True)
for u, c in zip(unique, counts):
    print(f"{u}={c} ({c/N:.1%}) ", end='')
print()
print(f"Ortalama reward: {rewards.mean():+.3f} | std: {rewards.std():.3f}")
print(f"Reward dağılımı: min {rewards.min():.1f}, max {rewards.max():.1f}")

# Reward shaping — mevcut reward'ları güçlendir
# Class imbalance'a karşı: azınlık sınıfların (cross, passLong, shoot) reward'unu artır
# Yoksa PPO ağırlıklı sınıfa (dribble) yönelir
class_weight = np.ones(N_ACTIONS, dtype=np.float32)
class_weight[0] = 3.0   # shoot — az ama değerli
class_weight[1] = 2.0   # cross
class_weight[2] = 1.2   # passShort
class_weight[3] = 1.5   # passLong
class_weight[4] = 1.0   # dribble (default)

# Sample weight: w_i = class_weight[action_i]
sample_weights = class_weight[actions]
# Avantaj: ortalama reward'dan çıkar
mean_r = (rewards * sample_weights).sum() / sample_weights.sum()
advantages = (rewards - mean_r).astype(np.float32)
# Normalize
adv_std = advantages.std() + 1e-6
advantages = advantages / adv_std
print(f"Class weight: shoot=3.0, cross=2.0, passLong=1.5, passShort=1.2, dribble=1.0")
print(f"Avantaj: ortalama {advantages.mean():+.3f}, std {advantages.std():.3f}\n")


# === NETWORK ===
def init_net(in_dim, hidden, out_dim):
    W1 = np.random.randn(hidden, in_dim).astype(np.float32) * np.sqrt(2.0 / in_dim)
    b1 = np.zeros(hidden, dtype=np.float32)
    W2 = np.random.randn(out_dim, hidden).astype(np.float32) * np.sqrt(2.0 / hidden)
    b2 = np.zeros(out_dim, dtype=np.float32)
    return W1, b1, W2, b2

class PolicyValueNet:
    def __init__(self, hidden=32, n_actions=N_ACTIONS):
        self.W1, self.b1, self.W2, self.b2 = init_net(STATE_DIM, hidden, n_actions)
        self.Wv = np.random.randn(1, hidden).astype(np.float32) * np.sqrt(2.0 / hidden)
        self.bv = np.zeros(1, dtype=np.float32)
        self.n_actions = n_actions

    def forward(self, s):
        # s: (B, 8) veya (8,)
        single = (s.ndim == 1)
        if single:
            s = s.reshape(1, -1)
        h_pre = s @ self.W1.T + self.b1
        h = np.maximum(0, h_pre)
        logits = h @ self.W2.T + self.b2
        e = np.exp(logits - logits.max(axis=1, keepdims=True))
        probs = e / e.sum(axis=1, keepdims=True)
        values = (h @ self.Wv.T + self.bv).flatten()
        if single:
            return h_pre[0], h[0], logits[0], probs[0], values[0]
        return h_pre, h, logits, probs, values

    def logp(self, s, a):
        _, _, _, probs, value = self.forward(s)
        if probs.ndim == 1:
            return float(np.log(probs[a] + 1e-9)), value
        return np.log(probs[np.arange(len(a)), a] + 1e-9), values

    def params(self):
        return [self.W1, self.b1, self.W2, self.b2, self.Wv, self.bv]


class Adam:
    def __init__(self, params, lr=3e-3):
        self.lr = lr
        self.m = [np.zeros_like(p) for p in params]
        self.v = [np.zeros_like(p) for p in params]
        self.t = 0
        self.b1, self.b2, self.eps = 0.9, 0.999, 1e-8

    def step(self, params, grads):
        self.t += 1
        new = []
        for p, g, m, v in zip(params, grads, self.m, self.v):
            m[:] = self.b1 * m + (1 - self.b1) * g
            v[:] = self.b2 * v + (1 - self.b2) * (g * g)
            m_hat = m / (1 - self.b1 ** self.t)
            v_hat = v / (1 - self.b2 ** self.t)
            new.append(p - self.lr * m_hat / (np.sqrt(v_hat) + self.eps))
        return new


def policy_grad(probs, actions, advantages):
    """REINFORCE policy gradient: d(-logp * adv) / d params"""
    onehot = np.zeros((len(actions), N_ACTIONS), dtype=np.float32)
    onehot[np.arange(len(actions)), actions] = 1.0
    d_logits = -(advantages.reshape(-1, 1) * (onehot - probs)) / len(actions)
    return d_logits, onehot


def compute_loss_and_grads(policy, s, a, advantages, returns, old_logp=None, clip_eps=0.2):
    """PPO clipped surrogate + value loss + entropy. Analitik grad."""
    h_pre, h, logits, probs, values = policy.forward(s)
    logp = np.log(probs[np.arange(len(a)), a] + 1e-9)

    # PPO ratio
    if old_logp is None:
        old_logp = logp  # 1-step off-policy approximation
    ratio = np.exp(logp - old_logp)
    surr1 = ratio * advantages
    surr2 = np.clip(ratio, 1 - clip_eps, 1 + clip_eps) * advantages
    policy_loss = -np.minimum(surr1, surr2).mean()
    value_loss = ((values - returns) ** 2).mean()
    entropy = -(probs * np.log(probs + 1e-9)).sum(axis=1).mean()
    loss = policy_loss + 0.5 * value_loss - 0.01 * entropy

    # === Gradyanlar (analitik) ===
    # 1) Policy loss grad
    # d(policy_loss) / d_logits_i = ?
    # min(s1, s2) için: s1 < s2 ise d/d_logits = ratio * adv, else clip_ratio * adv
    # Yaklaşım: clipped durumda grad = 0 (PPO standart)
    clip_mask = ((ratio >= 1 - clip_eps) & (ratio <= 1 + clip_eps)) | (advantages >= 0)
    # Aslında: PPO grad sign(adv) * (ratio > 1+eps ? 0 : 1) — basitleştirelim
    # Yaklaşım: d/dlogp = -adv (clipped durumda 0)
    pg_grad_sign = np.where(
        (advantages > 0) & (ratio > 1 + clip_eps), 0.0,
        np.where(
            (advantages < 0) & (ratio < 1 - clip_eps), 0.0,
            -advantages
        )
    )
    # d/d_logits_a = -pg_grad_sign * (1 - probs_a)
    # d/d_logits_i (i != a) = pg_grad_sign * probs_i
    onehot = np.zeros((len(a), N_ACTIONS), dtype=np.float32)
    onehot[np.arange(len(a)), a] = 1.0
    # PPO: grad logp wrt logits = onehot - probs (softmax gradient)
    # d_loss/d_logits = -pg_grad_sign[:, None] * (onehot - probs)
    d_logits_pg = -pg_grad_sign.reshape(-1, 1) * (onehot - probs) / len(a)

    # 2) Value loss grad
    d_v = (2 * (values - returns) / len(a))  # (B,)
    # d(loss)/d(Wv) = d_v * h → (B, 1) @ (B, hidden).T → (1, hidden)
    dWv_v = (d_v.reshape(-1, 1) * np.ones((1, h.shape[1])) * 0 + 0)  # placeholder
    dWv_v = np.einsum('b,bi->i', d_v, h).reshape(1, -1)  # (1, hidden)
    dbv_v = np.array([d_v.mean()], dtype=np.float32)

    # 3) Entropy grad (encourage exploration)
    # dH/d_logits_i = -probs_i * (log(probs_i) + 1) + probs_i * sum_j(probs_j * log(probs_j))
    # Aslında: dH/d_logits = -probs * log(probs) - probs + probs * sum(probs*log(probs)) = ...
    # Yaklaşım: -probs * log(probs) grad (basit)
    d_logits_e = -probs * np.log(probs + 1e-9) / len(a)

    # Combine logits gradients
    d_logits = d_logits_pg + 0.5 * 0 + 0.01 * d_logits_e

    # d_logits → dW2, db2, d_h, d_h_pre, dW1, db1
    dW2 = d_logits.T @ h
    db2 = d_logits.sum(axis=0)
    d_h = d_logits @ policy.W2
    d_h_pre = d_h * (h_pre > 0)
    dW1 = d_h_pre.T @ s
    db1 = d_h_pre.sum(axis=0)

    # Value grad (only for Wv, bv)
    dWv_grad = np.einsum('b,bi->i', d_v, h).reshape(1, -1)  # (1, hidden)
    dbv_grad = np.array([d_v.mean()], dtype=np.float32)
    # value -> h: d_value/d_h = Wv (1, hidden)
    d_h_v = np.outer(d_v, policy.Wv.flatten())  # (B, hidden)
    d_h_pre_v = d_h_v * (h_pre > 0)
    dW1_v = d_h_pre_v.T @ s
    db1_v = d_h_pre_v.sum(axis=0)
    # Add value grad to policy grad (share W1, b1)
    dW1 = dW1 + 0.5 * dW1_v
    db1 = db1 + 0.5 * db1_v

    return loss, [dW1, db1, dW2, db2, dWv_grad, dbv_grad], policy_loss, value_loss, entropy, probs


# === PPO REPLAY TRAIN ===
def train_ppo_replay(states, actions, rewards, n_epochs=20, batch_size=256, k_epochs=4, lr=3e-3, hidden=32):
    """Offline PPO: replay buffer'dan batch sample, policy update."""
    N = len(states)
    policy = PolicyValueNet(hidden=hidden)

    # Returns: advantage'ı returns olarak da kullan (basitleştirilmiş, PPO value head eğitir)
    # Daha doğru: advantage'ı value'dan hesapla
    # Burada: value head 0 olarak başlıyor, advantage = reward - 0
    # Her update'te value güncellenir, advantage da güncellenir
    returns = rewards.copy()

    # Adam optimizer
    adam = Adam(policy.params(), lr=lr)

    print(f"PPO Replay: 8 → {hidden} → {N_ACTIONS} (param: {sum(p.size for p in policy.params())})")
    print(f"Eğitim: {n_epochs} epoch, batch {batch_size}, lr {lr}\n")

    history = []
    for epoch in range(n_epochs):
        perm = np.random.permutation(N)
        epoch_loss = 0.0
        epoch_pl = 0.0
        epoch_vl = 0.0
        epoch_ent = 0.0
        n_batches = 0
        action_dist = np.zeros(N_ACTIONS, dtype=np.int32)
        # Her epoch'ta value'yu güncelle
        _, _, _, _, all_values = policy.forward(states)
        all_adv = rewards - all_values
        # Normalize advantage
        adv_mean = all_adv.mean()
        adv_std = all_adv.std() + 1e-6
        all_adv = (all_adv - adv_mean) / adv_std

        for start in range(0, N, batch_size):
            idx = perm[start:start + batch_size]
            s_b = states[idx]
            a_b = actions[idx]
            adv_b = all_adv[idx]
            ret_b = returns[idx]

            # Sample weight: class_weight ile oversample
            sample_w = class_weight[a_b]
            adv_b = adv_b * sample_w

            for k in range(k_epochs):
                # Compute loss + grads
                loss, grads, pl, vl, ent, probs = compute_loss_and_grads(
                    policy, s_b, a_b, adv_b, ret_b, clip_eps=0.2
                )
                # Adam step
                # grads: [dW1, db1, dW2, db2, dWv_v, dbv_v]
                new_params = adam.step(policy.params(), grads)
                policy.W1, policy.b1, policy.W2, policy.b2, policy.Wv, policy.bv = new_params
                # Track
                epoch_loss += loss
                epoch_pl += pl
                epoch_vl += vl
                epoch_ent += ent
                n_batches += 1
                # Track action distribution
                action_dist += np.bincount(probs.argmax(axis=1), minlength=N_ACTIONS)

        avg_loss = epoch_loss / max(1, n_batches)
        avg_pl = epoch_pl / max(1, n_batches)
        avg_vl = epoch_vl / max(1, n_batches)
        avg_ent = epoch_ent / max(1, n_batches)
        history.append(avg_loss)
        if (epoch + 1) % 5 == 0 or epoch == 0:
            # Yüzdelere çevir
            total = action_dist.sum()
            if total > 0:
                pct = action_dist / total
            else:
                pct = np.zeros(N_ACTIONS)
            print(f"  epoch {epoch+1:3d}/{n_epochs} | loss {avg_loss:.4f} | pl {avg_pl:.4f} vl {avg_vl:.4f} ent {avg_ent:.3f} | "
                  f"action: shoot {pct[0]:.1%} cross {pct[1]:.1%} pS {pct[2]:.1%} pL {pct[3]:.1%} dribble {pct[4]:.1%}", flush=True)

    return policy, history


# === MAIN ===
t0 = time.time()
policy, history = train_ppo_replay(states, actions, rewards, n_epochs=30, batch_size=512, k_epochs=4, lr=3e-3, hidden=32)
elapsed = time.time() - t0
print(f"\nEğitim süresi: {elapsed:.1f}s")

# === Save Model ===
out_path = os.path.join(os.path.dirname(__file__), 'ppo_model_real.json')
model_export = {
    'W1': policy.W1.tolist(),
    'b1': policy.b1.tolist(),
    'W2': policy.W2.tolist(),
    'b2': policy.b2.tolist(),
    'Wv': policy.Wv.tolist(),
    'bv': policy.bv.tolist(),
    'meta': {
        'state_dim': STATE_DIM,
        'n_actions': N_ACTIONS,
        'hidden': policy.W1.shape[0],
        'state_features': [
            'distance_to_goal', 'opponents_ahead', 'teammates_better_pos',
            'stamina', 'vision', 'ball_progress', 'dribble_rate', 'phase_pressure',
        ],
        'action_labels': ['shoot', 'cross', 'passShort', 'passLong', 'dribble'],
        'trained_on': 'real_fmsim_data_offline_ppo',
        'samples': N,
        'final_loss': float(history[-1]),
    }
}
with open(out_path, 'w') as f:
    json.dump(model_export, f)
print(f"\nModel kaydedildi: {out_path}")
