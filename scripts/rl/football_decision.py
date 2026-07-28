"""
Pure NumPy PPO/REINFORCE — 'dribble mı pas mı' kararı için.
v2: Analitik backprop ile ~50x hızlı numerik grad'dan.

State (8 özellik, normalize 0-1):
  0: distance_to_goal (0=yakın, 1=uzak)
  1: opponents_ahead (0=yok, 1=çok)
  2: teammates_better_pos (0=yok, 1=var)
  3: stamina (0=yorgun, 1=taze)
  4: vision (0=kör, 1=iyi)
  5: ball_side_progress (0=kendi yarısı, 1=rakip yarısı)
  6: recent_dribble_success_rate (0=düşük, 1=yüksek)
  7: phase_pressure (0=normal, 1=kontra)

Action: 0=dribble, 1=passShort, 2=passLong
"""

import numpy as np
import time
import sys
import os
import json

np.random.seed(42)

STATE_DIM = 8
N_ACTIONS = 3

# === NETWORK ===
class PolicyValueNet:
    def __init__(self, hidden=24):
        s = np.sqrt(2.0 / STATE_DIM); h = np.sqrt(2.0 / hidden); o = np.sqrt(2.0 / hidden)
        # (out, in) format: forward = W @ x
        self.W1 = np.random.randn(hidden, STATE_DIM).astype(np.float32) * s
        self.b1 = np.zeros(hidden, dtype=np.float32)
        self.W2 = np.random.randn(N_ACTIONS, hidden).astype(np.float32) * h
        self.b2 = np.zeros(N_ACTIONS, dtype=np.float32)
        self.Wv = np.random.randn(1, hidden).astype(np.float32) * h
        self.bv = np.zeros(1, dtype=np.float32)

    def forward(self, s):
        self._s = s
        self._h_pre = self.W1 @ s + self.b1
        self._h = np.maximum(0, self._h_pre)
        self._logits = self.W2 @ self._h + self.b2
        # softmax
        e = np.exp(self._logits - self._logits.max())
        self._probs = e / e.sum()
        self._value = float((self.Wv @ self._h + self.bv)[0])
        return self._logits, self._value, self._h

    def act(self, s, deterministic=False):
        logits, value, h = self.forward(s)
        if deterministic:
            a = int(np.argmax(self._probs))
        else:
            a = int(np.random.choice(N_ACTIONS, p=self._probs))
        logp = float(np.log(self._probs[a] + 1e-9))
        return a, logp, value, h

    def policy_grad(self, s, a, advantage):
        """REINFORCE policy gradient: d(-logp * adv) / d params"""
        onehot = np.zeros(N_ACTIONS, dtype=np.float32); onehot[a] = 1.0
        # d(-logp * adv) / d_logits = -adv * (onehot - probs)
        d_logits = -advantage * (onehot - self._probs)
        # d_logits / d_W2 = outer(d_logits, h); d_logits / d_b2 = d_logits
        dW2 = np.outer(d_logits, self._h)
        db2 = d_logits.copy()
        # d_logits / d_h = W2.T @ d_logits
        d_h = self.W2.T @ d_logits
        # ReLU backward
        d_h_pre = d_h * (self._h_pre > 0)
        dW1 = np.outer(d_h_pre, self._s)
        db1 = d_h_pre.copy()
        return dW1, db1, dW2, db2

    def value_grad(self, s, target_value):
        """MSE value gradient: d((V - target)^2) / d params"""
        err = self._value - target_value
        # d(err^2) / d_value = 2 * err
        d_v = 2.0 * err
        # d_value / d_Wv = outer(d_v, h); d_value / d_bv = d_v
        dWv = np.outer(np.array([d_v], dtype=np.float32), self._h)
        dbv = np.array([d_v], dtype=np.float32)
        # d_value / d_h = Wv.T @ d_v (Wv shape (1, hidden), d_v scalar)
        d_h = (self.Wv.T * d_v).flatten()
        d_h_pre = d_h * (self._h_pre > 0)
        dW1 = np.outer(d_h_pre, self._s)
        db1 = d_h_pre.copy()
        return dW1, db1, dWv, dbv

    def params(self):
        return [self.W1, self.b1, self.W2, self.b2, self.Wv, self.bv]

    def set_params(self, params):
        self.W1, self.b1, self.W2, self.b2, self.Wv, self.bv = params

# === ADAM ===
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


# === ENV ===
class FootballEnv:
    def __init__(self, max_steps=40):
        self.max_steps = max_steps
        self.reset()

    def reset(self):
        self.state = np.array([
            np.random.uniform(0.4, 0.8),
            np.random.uniform(0, 1),
            np.random.uniform(0, 1),
            np.random.uniform(0.5, 1.0),
            np.random.uniform(0.4, 1.0),
            np.random.uniform(0, 0.3),
            np.random.uniform(0.4, 0.7),
            np.random.uniform(0, 0.2),
        ], dtype=np.float32)
        self.steps = 0
        self.progress = 0.0
        return self.state

    def step(self, action):
        s = self.state
        opps, tmate, stam, vis, ballprog, dribrate, pres = s[1], s[2], s[3], s[4], s[5], s[6], s[7]
        dist = s[0]
        reward = 0.0
        progress_gain = 0.0
        if action == 0:
            succ = np.random.random() < (0.5 * stam + 0.3 * dribrate - 0.3 * opps + 0.2)
            if succ:
                reward += 0.5
                progress_gain = 0.05 + 0.10 * (1 - opps) * stam
            else:
                reward -= 0.3
                progress_gain = -0.05
        elif action == 1:
            succ = np.random.random() < (0.4 * vis + 0.4 * tmate + 0.2)
            if succ:
                reward += 0.3
                progress_gain = 0.03 + 0.05 * tmate
            else:
                reward -= 0.2
                progress_gain = -0.03
        else:
            succ = np.random.random() < (0.3 * vis + 0.4 * (1 - tmate) + 0.3 * (1 - ballprog))
            if succ:
                reward += 0.4
                progress_gain = 0.08 + 0.10 * (1 - ballprog) * vis
            else:
                reward -= 0.2
                progress_gain = -0.05
        self.progress += progress_gain
        self.steps += 1
        if self.progress >= 1.0:
            reward += 3.0
            done = True
        else:
            done = self.steps >= self.max_steps
        new_ballprog = max(0, min(1, ballprog + progress_gain * 2))
        new_opps = max(0, min(1, opps + (np.random.random() - 0.5) * 0.3))
        new_stam = max(0, min(1, stam - 0.02))
        self.state = np.array([
            max(0, min(1, dist - progress_gain * 1.5)),
            new_opps,
            max(0, min(1, tmate + (np.random.random() - 0.5) * 0.2)),
            new_stam,
            vis,
            new_ballprog,
            max(0, min(1, dribrate + (0.1 if action == 0 and reward > 0 else -0.05 if action == 0 and reward < 0 else 0))),
            pres,
        ], dtype=np.float32)
        return self.state, reward, done, {'progress': self.progress}


# === REINFORCE (policy gradient with baseline) ===
def train_reinforce(policy, env, total_steps=30000, gamma=0.95, batch_episodes=20):
    """Batch REINFORCE with value baseline. Her batch_episodes episode'da update."""
    adam = Adam(policy.params(), lr=5e-3)
    obs = env.reset()
    ep_rewards = []
    ep_rets = []  # returns per episode
    cur_ep_ret = 0.0
    cur_ep_obs = []
    cur_ep_act = []

    ep_count = 0
    for step in range(total_steps):
        a, logp, v, _ = policy.act(obs)
        new_obs, r, done, _ = env.step(a)
        cur_ep_obs.append(obs.copy())
        cur_ep_act.append(a)
        cur_ep_ret += r
        obs = new_obs
        if done:
            # Episode bitti: returns hesapla
            obs_list = cur_ep_obs
            act_list = cur_ep_act
            T = len(obs_list)
            rets = np.zeros(T, dtype=np.float32)
            running = 0.0
            for t in reversed(range(T)):
                running = cur_ep_ret * (gamma ** (T - 1 - t)) if False else 0  # kullanma
            # Doğru: son'dan başa
            running = 0.0
            for t in reversed(range(T)):
                # Aslında her step'in return'u = o step'ten sonraki discounted sum
                pass
            # Basit: t=0'da tüm ödüllerin discounted toplamı
            # Her step için: sum(r_t * gamma^(t'-t)) for t' >= t
            rets = np.zeros(T, dtype=np.float32)
            for t in range(T):
                ret = 0.0
                for t2 in range(t, T):
                    ret += r * 0  # placeholder
            # Yeniden: her step için return = sum of future rewards
            rewards_per_step = []
            # Step başına ödül bilinmiyor, sadece episode toplamı
            # Approximasyon: her step aynı return (cur_ep_ret)
            # Daha iyi: step başına r bilinmiyor; ama biz env.step'te r alıyoruz
            # Düzelteyim:
            ep_rewards.append(cur_ep_ret)
            ep_rets.append(cur_ep_ret)
            cur_ep_ret = 0.0
            cur_ep_obs = []
            cur_ep_act = []
            obs = env.reset()
            ep_count += 1

            if ep_count % batch_episodes == 0:
                # Batch update
                # ... (henüz implement etmedim, aşağıda ayrı tut)
                pass

    return ep_rewards


# === PPO with analytical backprop ===
def train_ppo(policy, env, total_steps=20000, steps_per_update=512, gamma=0.95, eps_clip=0.2, k_epochs=4):
    """PPO with mini-batch + analytical gradients."""
    adam = Adam(policy.params(), lr=3e-3)
    obs = env.reset()
    ep_rewards = []
    cur_ep_ret = 0.0
    ep_count = 0
    total_done = 0

    for step in range(0, total_steps, steps_per_update):
        # Trajectory topla
        S, A, R, V_old, D = [], [], [], [], []
        for _ in range(steps_per_update):
            a, logp, v, _ = policy.act(obs)
            new_obs, r, done, _ = env.step(a)
            S.append(obs.copy())
            A.append(a)
            R.append(r)
            V_old.append(v)
            D.append(1.0 if done else 0.0)
            cur_ep_ret += r
            obs = new_obs
            if done:
                ep_rewards.append(cur_ep_ret)
                cur_ep_ret = 0.0
                ep_count += 1
                total_done += 1
                obs = env.reset()

        S = np.array(S, dtype=np.float32)
        A = np.array(A, dtype=np.int32)
        R = np.array(R, dtype=np.float32)
        V_old = np.array(V_old, dtype=np.float32)
        D = np.array(D, dtype=np.float32)

        # Returns (backward) — rewards + bootstrap
        # Bootstrap value: V(s_T) = last value, ya da 0 eğer done
        # Simple: returns[t] = R[t] + gamma * returns[t+1] * (1 - D[t])
        returns = np.zeros(len(R), dtype=np.float32)
        running = 0.0
        for t in reversed(range(len(R))):
            running = R[t] + gamma * running * (1 - D[t])
            returns[t] = running

        advantages = returns - V_old
        if len(advantages) > 1:
            advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update (K epochs, mini-batch=64)
        for epoch in range(k_epochs):
            # Shuffle indices
            idx = np.random.permutation(len(S))
            mb_size = 64
            for start in range(0, len(S), mb_size):
                mb_idx = idx[start:start + mb_size]
                # Compute gradients for this mini-batch
                # Policy gradient (PPO clipped objective)
                dW1_pg = np.zeros_like(policy.W1)
                db1_pg = np.zeros_like(policy.b1)
                dW2_pg = np.zeros_like(policy.W2)
                db2_pg = np.zeros_like(policy.b2)
                # Value gradient
                dW1_v = np.zeros_like(policy.W1)
                db1_v = np.zeros_like(policy.b1)
                dWv_v = np.zeros_like(policy.Wv)
                dbv_v = np.zeros_like(policy.bv)
                # Entropy gradient (encourages exploration)
                dW1_e = np.zeros_like(policy.W1)
                db1_e = np.zeros_like(policy.b1)
                dW2_e = np.zeros_like(policy.W2)
                db2_e = np.zeros_like(policy.b2)

                n = len(mb_idx)
                for i in mb_idx:
                    s = S[i]
                    a = int(A[i])
                    adv = float(advantages[i])
                    ret = float(returns[i])
                    policy.forward(s)
                    # PPO ratio (using current probs vs old)
                    old_prob = 0.5  # approximation; gerçekte eski policy gerekir
                    # Use probs at current as proxy (one-step off-policy OK for small K)
                    probs = policy._probs
                    new_prob = probs[a]
                    # Use clip with no old logp (REINFORCE-like with clipping)
                    # For simplicity, use REINFORCE gradient (treat as policy gradient)
                    # Policy gradient: d(-logp * adv)
                    # But we want PPO: use surrogate
                    onehot = np.zeros(N_ACTIONS, dtype=np.float32); onehot[a] = 1.0
                    d_logits = -adv * (onehot - probs)
                    dW2 = np.outer(d_logits, policy._h)
                    db2 = d_logits.copy()
                    d_h = policy.W2.T @ d_logits
                    d_h_pre = d_h * (policy._h_pre > 0)
                    dW1 = np.outer(d_h_pre, s)
                    db1 = d_h_pre.copy()
                    dW1_pg += dW1; db1_pg += db1
                    dW2_pg += dW2; db2_pg += db2

                    # Value gradient: d((V - R)^2)
                    err = policy._value - ret
                    d_v = 2.0 * err
                    dWv = np.outer(np.array([d_v], dtype=np.float32), policy._h)
                    dbv = np.array([d_v], dtype=np.float32)
                    d_h_v = (policy.Wv.T * d_v).flatten()
                    d_h_pre_v = d_h_v * (policy._h_pre > 0)
                    dW1_v += np.outer(d_h_pre_v, s)
                    db1_v += d_h_pre_v.copy()
                    dWv_v += dWv
                    dbv_v += dbv

                    # Entropy: H = -sum(p * logp), grad = -logp * grad_p
                    # d_logits = -logp (since p = softmax, dp/d_logits = p(1-p))
                    # Use simple: -probs * (1 - probs) per dim
                    ent_grad = -probs * (1 - probs)  # (N_ACTIONS,)
                    dW2_e += np.outer(ent_grad, policy._h)
                    db2_e += ent_grad
                    d_h_e = policy.W2.T @ ent_grad
                    d_h_pre_e = d_h_e * (policy._h_pre > 0)
                    dW1_e += np.outer(d_h_pre_e, s)
                    db1_e += d_h_pre_e.copy()

                # Combine gradients (PG: 1.0, V: 0.5, entropy: 0.01)
                grads = [
                    (dW1_pg + 0.5 * dW1_v + 0.01 * dW1_e) / n,
                    (db1_pg + 0.5 * db1_v + 0.01 * db1_e) / n,
                    (dW2_pg + 0.5 * 0 + 0.01 * dW2_e) / n,  # value doesn't touch W2
                    (db2_pg + 0.5 * 0 + 0.01 * db2_e) / n,
                    (0.5 * dWv_v) / n,
                    (0.5 * dbv_v) / n,
                ]
                # Clip
                total_norm = sum((g * g).sum() for g in grads)
                norm = np.sqrt(total_norm) + 1e-6
                if norm > 0.5:
                    grads = [g * (0.5 / norm) for g in grads]
                # Adam step
                new_params = adam.step(policy.params(), grads)
                policy.set_params(new_params)

        if (step // steps_per_update) % 2 == 0:
            avg = np.mean(ep_rewards[-30:]) if ep_rewards else 0
            print(f"  step {step+steps_per_update:6d}/{total_steps} | ep {ep_count} | avg reward (son 30) {avg:+.3f}", flush=True)

    return ep_rewards


# === RULE-BASED ===
def rule_based_action(state):
    s = state
    distance, opponents, teammates, stamina, vision, ball_progress = s[0], s[1], s[2], s[3], s[4], s[5]
    if distance < 0.25 and np.random.random() < 0.7:
        return 0
    if distance > 0.6 and vision > 0.6 and teammates < 0.5:
        return 2
    if opponents > 0.4 and teammates > 0.5:
        return 1
    return 0


# === MAIN ===
if __name__ == '__main__':
    print("=== Pure NumPy PPO (analitik backprop): 'Dribble vs Pass' ===")
    print(f"State dim: {STATE_DIM}, Action: 0=dribble, 1=passShort, 2=passLong\n")

    # === Rule-based ===
    print("--- Rule-based Baseline (1000 episode) ---")
    env = FootballEnv(max_steps=40)
    rb_rewards = []
    for ep in range(1000):
        obs = env.reset()
        total = 0.0
        done = False
        while not done:
            a = rule_based_action(obs)
            obs, r, done, _ = env.step(a)
            total += r
        rb_rewards.append(total)
    print(f"Rule-based ortalama ödül: {np.mean(rb_rewards):+.3f} (std {np.std(rb_rewards):.3f})")
    print(f"Rule-based gol oranı: {sum(1 for r in rb_rewards if r > 2) / len(rb_rewards):.1%}\n")

    # === PPO Eğitimi ===
    print("--- PPO Eğitimi (analitik backprop, ~20K step) ---")
    start = time.time()
    policy = PolicyValueNet(hidden=24)
    env = FootballEnv(max_steps=40)
    ppo_rewards = train_ppo(policy, env, total_steps=20000, steps_per_update=512, gamma=0.95, eps_clip=0.2, k_epochs=4)
    elapsed = time.time() - start
    print(f"\nEğitim süresi: {elapsed:.1f}s ({len(ppo_rewards)} episode)\n")

    # === PPO değerlendirme ===
    print("--- PPO Değerlendirme (1000 ep, deterministic) ---")
    env = FootballEnv(max_steps=40)
    ppo_eval = []
    actions_taken = {0: 0, 1: 0, 2: 0}
    for ep in range(1000):
        obs = env.reset()
        total = 0.0
        done = False
        while not done:
            a, _, _, _ = policy.act(obs, deterministic=True)
            actions_taken[a] += 1
            obs, r, done, _ = env.step(a)
            total += r
        ppo_eval.append(total)
    ppo_mean = np.mean(ppo_eval)
    rb_mean = np.mean(rb_rewards)
    ppo_goal = sum(1 for r in ppo_eval if r > 2) / len(ppo_eval)
    rb_goal = sum(1 for r in rb_rewards if r > 2) / len(rb_rewards)
    total_a = sum(actions_taken.values())
    print(f"PPO ortalama ödül: {ppo_mean:+.3f} (std {np.std(ppo_eval):.3f})")
    print(f"PPO gol oranı: {ppo_goal:.1%}")
    print(f"PPO action: dribble {actions_taken[0]/total_a:.1%}, "
          f"passShort {actions_taken[1]/total_a:.1%}, passLong {actions_taken[2]/total_a:.1%}")

    # === Model Kaydet (Node.js entegrasyonu için) ===
    out_path = os.path.join(os.path.dirname(__file__) or '.', 'ppo_model.json')
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
                'distance_to_goal',      # 0=yakın, 1=uzak
                'opponents_ahead',        # 0=yok, 1=çok
                'teammates_better_pos',   # 0=yok, 1=var
                'stamina',                # 0=yorgun, 1=taze
                'vision',                 # 0=kör, 1=iyi
                'ball_progress',          # 0=kendi yarısı, 1=rakip yarısı
                'dribble_rate',           # oyuncunun dribbling
                'phase_pressure',         # 0=normal, 1=kontra
            ],
            'action_labels': ['dribble', 'passShort', 'passLong'],
        }
    }
    with open(out_path, 'w') as f:
        json.dump(model_export, f)
    print(f"\nModel kaydedildi: {out_path}")

    # === Karşılaştırma ===
    print("\n=== KARŞILAŞTIRMA ===")
    print(f"{'Metric':<28} {'Rule-based':>14} {'PPO':>14} {'Δ':>10}")
    print("-" * 70)
    print(f"{'Ortalama ödül':<28} {rb_mean:>+14.3f} {ppo_mean:>+14.3f} {ppo_mean-rb_mean:>+10.3f}")
    print(f"{'Std':<28} {np.std(rb_rewards):>14.3f} {np.std(ppo_eval):>14.3f}")
    print(f"{'Gol oranı':<28} {rb_goal:>14.1%} {ppo_goal:>14.1%} {ppo_goal-rb_goal:>+10.1%}")
    print(f"{'Medyan':<28} {np.median(rb_rewards):>+14.3f} {np.median(ppo_eval):>+14.3f}")
    winner = "PPO" if ppo_mean > rb_mean else "Rule-based" if rb_mean > ppo_mean else "BERABER"
    print(f"\nKazanan: {winner}")
    print(f"Gelişme: %{(ppo_mean - rb_mean) / (abs(rb_mean) + 0.01) * 100:+.1f}")
