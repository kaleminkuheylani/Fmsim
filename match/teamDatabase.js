// match/teamDatabase.js
// Statik takım veri tabanı — 18 lig takımı, her biri kendine özgü güç, stil, formasyon
// Ligdeki sıralama, derbi, ezeli rekabetler, genç/yaşlı, savunmacı/saldırgan gibi
// özellikler önceden tanımlı, böylece her sezon aynı takımlar farklı maçlarda
// farklı zorluklar sunar.

export const TEAM_DATABASE = [
  // === ŞAMPİYON ADAYI — güçlü, derin kadro ===
  {
    id: 'ai_0', name: 'Galata Boğaz FK', shortName: 'Galata',
    power: 5, // 1-5
    style: 'agresif',
    formation: '433',
    avgAge: 26,
    stars: [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1],
    description: 'Son şampiyon, hücumda güçlü, yıldız oyuncularla dolu',
  },
  {
    id: 'ai_1', name: 'Anadolu Kartalı SK', shortName: 'Kartal',
    power: 5,
    style: 'agresif',
    formation: '433',
    avgAge: 27,
    stars: [3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1],
    description: 'Süper Lig devi, yıldız golcüyle tanınıyor',
  },
  // === GÜÇLÜ — ilk 6 hedefi ===
  {
    id: 'ai_2', name: 'Erbil Yıldızı', shortName: 'Erbil',
    power: 4,
    style: 'agresif',
    formation: '442',
    avgAge: 25,
    stars: [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
    description: 'Yükselen yıldız, genç ve dinamik kadro',
  },
  {
    id: 'ai_3', name: 'Mavi Vatan Spor', shortName: 'Vatan',
    power: 4,
    style: 'kontra',
    formation: '451',
    avgAge: 28,
    stars: [3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1],
    description: 'Tecrübeli, kontra atak ustası, deplasmanda tehlikeli',
  },
  {
    id: 'ai_4', name: 'Fırtına Stadyumu', shortName: 'Fırtına',
    power: 4,
    style: 'kanat',
    formation: '442',
    avgAge: 26,
    stars: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1],
    description: 'Kanat hücumlarıyla ünlü, klasik 4-4-2',
  },
  {
    id: 'ai_5', name: 'Sancak Birlik', shortName: 'Sancak',
    power: 3,
    style: 'merkez',
    formation: '352',
    avgAge: 27,
    stars: [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    description: '3-5-2 ile merkezden organize, sabırlı oyun',
  },

  // === ORTA — orta sıra takımları ===
  {
    id: 'ai_6', name: 'Trakya Rüzgarı', shortName: 'Trakya',
    power: 3,
    style: 'agresif',
    formation: '442',
    avgAge: 24,
    stars: [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Genç, açık futbol, gol atar gol yer',
  },
  {
    id: 'ai_7', name: 'Çınar Demirspor', shortName: 'Çınar',
    power: 3,
    style: 'kontra',
    formation: '451',
    avgAge: 26,
    stars: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Dengeli orta saha, deplasmanda zorlu',
  },
  {
    id: 'ai_8', name: 'Galata 1934', shortName: 'Galata34',
    power: 3,
    style: 'kanat',
    formation: '442',
    avgAge: 27,
    stars: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Tarihçi kulüp, iki kanat hücumu',
  },
  {
    id: 'ai_9', name: 'Vadi Kaplanları', shortName: 'Vadi',
    power: 2,
    style: 'agresif',
    formation: '433',
    avgAge: 23,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Çok genç, potansiyelli, sürpriz sonuçlar',
  },
  {
    id: 'ai_10', name: 'Ovacık Gücü', shortName: 'Ovacık',
    power: 2,
    style: 'merkez',
    formation: '352',
    avgAge: 29,
    stars: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Tecrübeli 3-5-2, evinde zorlu deplasmanda düşer',
  },
  {
    id: 'ai_11', name: 'Pamuk Arena', shortName: 'Pamuk',
    power: 2,
    style: 'defansif',
    formation: '451',
    avgAge: 28,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Defansif, az gol yer, az gol atar',
  },

  // === ALT — küme düşme adayı ===
  {
    id: 'ai_12', name: 'Barış Yelken SK', shortName: 'Yelken',
    power: 2,
    style: 'agresif',
    formation: '442',
    avgAge: 30,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Yaşlı kadro, son şans',
  },
  {
    id: 'ai_13', name: 'Lale Bahçesi FK', shortName: 'Lale',
    power: 1,
    style: 'defansif',
    formation: '451',
    avgAge: 31,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Çok yaşlı, alt sıra demirbaşı',
  },
  {
    id: 'ai_14', name: 'Marmara Fırtınası', shortName: 'Fırtına2',
    power: 2,
    style: 'kontra',
    formation: '451',
    avgAge: 26,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Orta sıra, değişken performans',
  },
  {
    id: 'ai_15', name: 'İstanbul Park FK', shortName: 'Park',
    power: 1,
    style: 'defansif',
    formation: '442',
    avgAge: 32,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'Çok yaşlı defans, küme düşme tehlikesi',
  },
  {
    id: 'ai_16', name: 'Pamuk Gençlik', shortName: 'PamukG',
    power: 1,
    style: 'agresif',
    formation: '442',
    avgAge: 21,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: 'En genç takım, çıraklar sahada',
  },
  {
    id: 'ai_17', name: 'Erbil 1934', shortName: 'Erbil34',
    power: 1,
    style: 'merkez',
    formation: '352',
    avgAge: 29,
    stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    description: '3-5-2, orta sıra mücadelesi',
  },
];

// Stil etiketleri
export const STYLE_LABELS = {
  agresif: '🔥 Agresif',
  kontra: '⚡ Kontra Atak',
  normal: '⚖️ Dengeli',
  kanat: '↔️ Kanat Hücumu',
  merkez: '🎯 Merkezden Oyna',
  defansif: '🛡️ Defansif',
};

// Formasyon isimleri
export const FORMATION_LABELS = {
  '442': '4-4-2',
  '433': '4-3-3',
  '352': '3-5-2',
  '451': '4-5-1',
};
