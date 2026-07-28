// match/commentlib/index.js
// Comment registry — tek kaynak, tüm yorum kütüphanesi.
//
// Kullanım:
//   import { pick, getComment, all } from './commentlib/index.js';
//   const tpl = pick('attack.finalBall');
//   const text = fillTemplate(tpl, { team: 'Galatasaray', actor: 'Icardi' });
//
// Veya alt kategoriden:
//   const tpl = pick('attack.left');
//
// Pick stratejisi:
//   - Aynı anahtar altındaki tüm template'lerden rastgele seç
//   - Recency: son kullanılan template'i tekrar seçmemeye çalış (opsiyonel)

import BUILD_UP from './build_up.js';
import MIDFIELD from './midfield.js';
import ATTACK from './attack.js';
import DANGER from './danger.js';
import COUNTER from './counter.js';
import TRANSITION from './transition.js';
import CRITICAL from './critical.js';
import MOTIVATION from './motivation.js';

// === KAYIT ===
const REGISTRY = {
  build_up: BUILD_UP,
  midfield: MIDFIELD,
  attack: ATTACK,
  danger: DANGER,
  counter: COUNTER,
  transition: TRANSITION,
  critical: CRITICAL,
  motivation: MOTIVATION,
};

// Flat dot-notation key resolver.
//   'attack' → ATTACK objesi (tüm alt anahtarları düzleştir)
//   'attack.left' → ATTACK.left array
//   'critical.goal.normal' → CRITICAL.goal.normal array
function resolve(key) {
  if (!key) return null;
  const parts = key.split('.');
  let current = REGISTRY[parts[0]];
  if (!current) return null;
  for (let i = 1; i < parts.length; i++) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = current[parts[i]];
    } else {
      return null;
    }
  }
  return current;
}

// === PICK ===
// Anahtar veya array kabul eder, rastgele template döner.
// recency: aynı kategorideki son seçimi hatırlar ve tekrar seçmez.
const lastPicks = new Map();
const MAX_RECENT = 3;

export function pick(key) {
  const arr = resolve(key);
  if (!arr) return null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];

  // Recency: son birkaç seçimi çıkar
  const recent = lastPicks.get(key) || [];
  let candidates = arr;
  if (recent.length > 0 && arr.length > recent.length) {
    candidates = arr.filter(t => !recent.includes(t));
    if (candidates.length === 0) candidates = arr;
  }

  const choice = candidates[Math.floor(Math.random() * candidates.length)];

  // Recency listesini güncelle
  const newRecent = [choice, ...recent].slice(0, MAX_RECENT);
  lastPicks.set(key, newRecent);

  return choice;
}

// === PICK ONE OF MANY ===
// Birden fazla key'den rastgele birini seçer, sonra template döner.
// Örn: pickOne(['attack', 'attack.left', 'attack.right']) → kanat/orta karışık
export function pickOne(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const valid = keys.filter(k => {
    const arr = resolve(k);
    return Array.isArray(arr) && arr.length > 0;
  });
  if (valid.length === 0) return null;
  const key = valid[Math.floor(Math.random() * valid.length)];
  return { key, template: pick(key) };
}

// === FILL TEMPLATE ===
// {key} pattern'ini doldurur.
export function fillTemplate(tpl, vars = {}) {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return (v === undefined || v === null) ? `{${key}}` : v;
  });
}

// === GET COMMENT ===
// Yüksek seviye API: key + vars → string.
// Template seç + doldur, tek seferde.
export function getComment(key, vars = {}) {
  const tpl = pick(key);
  if (!tpl) return null;
  return fillTemplate(tpl, vars);
}

// === KEYS / ALL ===
export function keys() {
  return Object.keys(REGISTRY);
}

export function all() {
  return REGISTRY;
}

// === STATS ===
export function stats() {
  const out = {};
  function count(obj, prefix = '') {
    for (const k in obj) {
      const v = obj[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        out[key] = v.length;
      } else if (typeof v === 'object' && v !== null) {
        count(v, key);
      }
    }
  }
  for (const cat in REGISTRY) count(REGISTRY[cat], cat);
  return out;
}

export { BUILD_UP, MIDFIELD, ATTACK, DANGER, COUNTER, TRANSITION, CRITICAL, MOTIVATION };
