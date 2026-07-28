// match/clubName.js
// Kurgusal kulüp isimleri — KVKK uyumlu, gerçek kulüp adı DEĞİL.
//
// Türk futbol kültüründen ilham alan ama TAMAMEN UYDURMA isimler.
// Her isim benzersiz kombinasyonlardan oluşur.

const PREFIXES = [
  'Anadolu', 'Boğaz', 'Çınar', 'Demir', 'Ege', 'Fırtına', 'Galata', 'Haliç',
  'İstanbul', 'Karadeniz', 'Lale', 'Marmara', 'Nilüfer', 'Ovacık', 'Pamuk',
  'Rüzgar', 'Sancak', 'Trakya', 'Uludağ', 'Vadi', 'Yıldırım', 'Zirve',
  'Akıncı', 'Barış', 'Cemre', 'Doruk', 'Erbil',
];

const SUFFIXES = [
  'spor', 'FK', 'SK', 'Gücü', '1957', 'Birlik', 'Yıldız', 'Demirspor',
  'Gençlik', 'Olimpiyat', 'Kulübü', 'Futbol', '1934', 'Kongre', 'Ligi',
  'Bahçe', 'Arena', 'Park', 'Stadyumu', 'Efsanesi', 'Tribünü',
];

const COLORS = [
  'Sarı-Lacivert', 'Kırmızı-Beyaz', 'Yeşil-Beyaz', 'Mavi-Beyaz',
  'Siyah-Beyaz', 'Bordo-Mavi', 'Turuncu-Lacivert', 'Kırmızı-Siyah',
  'Lacivert-Sarı', 'Beyaz-Yeşil',
];

// Kurgusal isimler — gerçek kulüplerle eşleşmemesi için dikkatli seçildi
const KURGU_ISIMLER = [
  'Galata Boğaz FK',
  'Anadolu Kartalı SK',
  'Fırtına Spor',
  'Çınar Demirspor',
  'Boğaz Kaplanları',
  'Yıldırım Efsanesi',
  'Lale Bahçesi FK',
  'Marmara Fırtınası',
  'Akıncılar 1923',
  'Barış Yelken SK',
  'Doruk Spor 1957',
  'Erbil Yıldızı',
  'Nilüfer Çiçeği FK',
  'Ovacık Gücü',
  'Pamuk Gençlik',
  'Sancak Birlik',
  'Trakya Rüzgarı',
  'Uludağ Demirspor',
  'Vadi Kaplanları',
  'Zirve Olimpiyat',
  'Karadeniz Fırtınası',
  'Haliç Ligi',
  'Galata Arena',
  'İstanbul Park FK',
  'Ege Bahçesi',
  'Cemre Spor',
];

// === ÜRETİCİ ===

const usedClubs = new Set();

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateClubName() {
  // %60 hazır kurgusal isim, %40 prefix+suffix kombinasyonu
  if (Math.random() < 0.6) {
    return pickRandom(KURGU_ISIMLER);
  }
  const prefix = pickRandom(PREFIXES);
  const suffix = pickRandom(SUFFIXES);
  return `${prefix} ${suffix}`;
}

export function generateUniqueClubName() {
  let name;
  let attempts = 0;
  do {
    name = generateClubName();
    attempts++;
    if (attempts > 50) {
      name = `${name} ${Math.floor(Math.random() * 99)}`;
      break;
    }
  } while (usedClubs.has(name));
  usedClubs.add(name);
  return name;
}

export function resetClubPool() {
  usedClubs.clear();
}

// İki takım üret — derbi/format için
export function generateMatchClubs() {
  let home, away;
  let attempts = 0;
  do {
    home = generateUniqueClubName();
    away = generateUniqueClubName();
    attempts++;
    if (attempts > 30) break;
  } while (home === away);
  return { home, away };
}
