"""
Real Fmsim verisiyle supervised learning (imitation learning).
JSONL training_data.jsonl'i oku, 8-özellik state → 5 action classifier.
Cross-entropy loss, analitik backprop, saf NumPy.

Action mapping:
  0: shoot
  1: cross
  2: passShort
  3: passLong
  4: dribble

Output: yeni ppo_model.json (Node.js tarafı yükler)
"""

import numpy as np
import json
import os
import time
import sys

np.random.seed(42)

# === LOAD DATA ===
data_path = os.path.join(os.path.dirname(__file__), 'training_data.jsonl')
print(f"=== Real Fmsim Verisi ile Eğitim ===")
print(f"Veri: {data_path}\n")

states = []
actions = []
rewards = []
with open(data_path) as f:
    for line in f:
        d = json.loads(line)
        states.append(d['state'])
        actions.append(d['action'])
        rewards.append(d['reward'])

states = np.array(states, dtype=np.float32)
actions = np.array(actions, dtype=np.int32)
rewards = np.array(rewards, dtype=np.float32)
print(f"Toplam transition: {len(states)}")
print(f"Action dağılımı: ", end='')
unique, counts = np.unique(actions, return_counts=True)
for u, c in zip(unique, counts):
    print(f"{u}={c} ({c/len(actions):.1%}) ", end='')
print()
print(f"Ortalama reward: {rewards.mean():+.3f}\n")

# Action 5 sınıf: shoot, cross, passShort, passLong, dribble
N_ACTIONS = 5

# === NEURAL NETWORK (classifier) ===
def init_net(in_dim, hidden, out_dim):
    W1 = np.random.randn(hidden, in_dim).astype(np.float32) * np.sqrt(2.0 / in_dim)
    b1 = np.zeros(hidden, dtype=np.float32)
    W2 = np.random.randn(out_dim, hidden).astype(np.float32) * np.sqrt(2.0 / hidden)
    b2 = np.zeros(out_dim, dtype=np.float32)
    return W1, b1, W2, b2

class Classifier:
    def __init__(self, hidden=32, n_actions=5):
        self.W1, self.b1, self.W2, self.b2 = init_net(8, hidden, n_actions)
        self.n_actions = n_actions

    def forward(self, s):
        if s.ndim == 1:
            s = s.reshape(1, -1)
        h_pre = s @ self.W1.T + self.b1
        h = np.maximum(0, h_pre)
        logits = h @ self.W2.T + self.b2
        e = np.exp(logits - logits.max(axis=1, keepdims=True))
        probs = e / e.sum(axis=1, keepdims=True)
        return h_pre, h, logits, probs

class Adam:
    def __init__(self, params, lr=3e-3, b1=0.9, b2=0.999, eps=1e-8):
        self.lr = lr; self.b1 = b1; self.b2 = b2; self.eps = eps
        self.m = [np.zeros_like(p) for p in params]
        self.v = [np.zeros_like(p) for p in params]
        self.t = 0

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


# === TRAIN ===
def train_supervised(states, actions, rewards, n_actions=5, hidden=32, epochs=30, batch_size=64, lr=3e-3):
    """Supervised learning: state → action (imitation) + reward-weighted loss.

    Class weight: azınlık sınıfları (cross, passLong, shoot) daha çok öğren.
    """
    N = len(states)
    model = Classifier(hidden=hidden, n_actions=n_actions)
    adam = Adam([model.W1, model.b1, model.W2, model.b2], lr=lr)

    # Class weight: 1 / frequency ile sık olmayan sınıfları daha çok öğren
    class_counts = np.bincount(actions, minlength=n_actions)
    class_weight = (N / (n_actions * class_counts + 1)).astype(np.float32)
    # Çok agresif olmasın
    class_weight = np.minimum(class_weight, 5.0)
    print(f"Class weight: " + " ".join(f"a{i}={class_weight[i]:.2f}" for i in range(n_actions)))

    # Reward-based sample weight: yüksek reward'lu transition'lar daha önemli
    reward_weight = 1.0 + np.tanh(rewards / 2.0)  # -3/+10 → 0-1+1 = 0-2

    print(f"Classifier: 8 → {hidden} → {n_actions}")
    print(f"Eğitim: {epochs} epoch, batch {batch_size}, lr {lr}\n")

    for epoch in range(epochs):
        perm = np.random.permutation(N)
        total_loss = 0.0
        n_batches = 0
        n_correct = 0
        n_total = 0
        action_pred = np.zeros(n_actions, dtype=np.int32)

        for start in range(0, N, batch_size):
            idx = perm[start:start + batch_size]
            s_batch = states[idx]
            a_batch = actions[idx]
            cw = class_weight[a_batch]
            rw = reward_weight[idx]

            # One-hot (class weight uygulanmış)
            onehot = np.zeros((len(idx), n_actions), dtype=np.float32)
            onehot[np.arange(len(idx)), a_batch] = 1.0
            # Sample weight: cw * rw (normalize edilecek)
            sample_w = (cw * rw).reshape(-1, 1)
            sample_w = sample_w / (sample_w.sum() + 1e-6) * len(idx)  # normalize

            # Forward
            h_pre, h, logits, probs = model.forward(s_batch)

            # Weighted cross-entropy
            ce = -np.log(probs[np.arange(len(idx)), a_batch] + 1e-9)
            loss = (ce * sample_w.flatten()).sum() / len(idx)
            total_loss += loss
            n_batches += 1

            # Accuracy (ağırlıksız, doğru ölçüm)
            preds = probs.argmax(axis=1)
            n_correct += (preds == a_batch).sum()
            n_total += len(idx)
            action_pred += np.bincount(preds, minlength=n_actions)

            # Backward (sample weight uygulanmış)
            d_logits = (probs - onehot) * sample_w / len(idx)
            dW2 = d_logits.T @ h
            db2 = d_logits.sum(axis=0)
            d_h = d_logits @ model.W2
            d_h_pre = d_h * (h_pre > 0)
            dW1 = d_h_pre.T @ s_batch
            db1 = d_h_pre.sum(axis=0)

            new_params = adam.step(
                [model.W1, model.b1, model.W2, model.b2],
                [dW1, db1, dW2, db2]
            )
            model.W1, model.b1, model.W2, model.b2 = new_params

        avg_loss = total_loss / n_batches
        acc = n_correct / n_total
        pct = action_pred / max(1, action_pred.sum())
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  epoch {epoch+1:3d}/{epochs} | loss {avg_loss:.4f} | acc {acc:.1%} | "
                  f"pred: shoot {pct[0]:.1%} cross {pct[1]:.1%} pS {pct[2]:.1%} pL {pct[3]:.1%} dribble {pct[4]:.1%}", flush=True)

    return model

# === MAIN ===
t0 = time.time()
model = train_supervised(states, actions, rewards, n_actions=N_ACTIONS, hidden=32, epochs=40, batch_size=64, lr=3e-3)
elapsed = time.time() - t0
print(f"\nEğitim süresi: {elapsed:.1f}s")

# === Test: doğruluk ===
print("\n--- Test (son 1000 transition) ---")
test_idx = np.random.choice(len(states), 1000, replace=False)
test_states = states[test_idx]
test_actions = actions[test_idx]
_, _, _, test_probs = model.forward(test_states)
test_preds = test_probs.argmax(axis=1)
test_acc = (test_preds == test_actions).mean()
print(f"Test accuracy: {test_acc:.1%}")
print(f"\nConfusion (true → pred):")
from collections import Counter
cm = [[0]*N_ACTIONS for _ in range(N_ACTIONS)]
for t, p in zip(test_actions, test_preds):
    cm[t][p] += 1
labels = ['shoot', 'cross', 'passShort', 'passLong', 'dribble']
print(f"{'':10s} " + " ".join(f"{l:>9s}" for l in labels))
for i, l in enumerate(labels):
    row = " ".join(f"{cm[i][j]:>9d}" for j in range(N_ACTIONS))
    print(f"{l:10s} {row}")

# === Save Model (Node.js uyumlu) ===
out_path = os.path.join(os.path.dirname(__file__), 'ppo_model_real.json')
# Node.js format: W1: [hidden, in_dim] matmul W1 @ s
# Python'da: W1 = init_net(8, 32) → W1 shape (32, 8) → forward = s @ W1.T + b1
# Yani model.W1 Python'da (32, 8) → Node.js için transpose: (8, 32) değil
# Çünkü Node.js forward = W1 @ s, W1 shape (hidden, in_dim)
# Python W1 = (hidden, in_dim), forward = s @ W1.T + b1
# Node.js: W1 @ s = (hidden,) → W1 shape (hidden, in_dim) = (32, 8)
# Python W1'i transpose etmemize gerek yok, shape aynı

# Wait: init_net Python'da (hidden, in_dim) döndürüyor
# forward: s @ W1.T + b1 → s (8,) @ W1.T (8, 32) = (32,)
# Node.js'de: W1 @ s → (32,) @ (8,) olmalı, yani W1 (32, 8)
# Bu uyumlu! Python model.W1 shape (32, 8) → Node.js W1 aynı shape

# Yeni modeli 5 action ile kaydet
model_export = {
    'W1': model.W1.tolist(),
    'b1': model.b1.tolist(),
    'W2': model.W2.tolist(),
    'b2': model.b2.tolist(),
    'Wv': np.zeros((1, model.W1.shape[0]), dtype=np.float32).tolist(),  # dummy value head
    'bv': [[0.0]],
    'meta': {
        'state_dim': 8,
        'n_actions': 5,
        'hidden': model.W1.shape[0],
        'state_features': [
            'distance_to_goal', 'opponents_ahead', 'teammates_better_pos',
            'stamina', 'vision', 'ball_progress', 'dribble_rate', 'phase_pressure',
        ],
        'action_labels': ['shoot', 'cross', 'passShort', 'passLong', 'dribble'],
        'trained_on': 'real_fmsim_data',
        'samples': len(states),
    }
}
with open(out_path, 'w') as f:
    json.dump(model_export, f)
print(f"\nModel kaydedildi: {out_path}")
print(f"Action dağılımı (test): {dict(Counter(test_preds.tolist()))}")
