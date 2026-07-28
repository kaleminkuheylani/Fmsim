// match/commentlib/build_up.js
// Defanstan top çıkışı yorumları — geriden oyun kurma
//
// Bağlam:
//   - Top kendi yarı sahasında (saldıran taraf için x < 35)
//   - Genelde kaleci veya stoperden başlar
//   - 2-4 pas sonrası orta sahaya taşınır
//
// Varyasyonlar (farklı oyun tarzları için):
//   - tempo: 'slow' | 'normal' | 'fast'  → yavaş/sakin/çabuk
//   - zone: 'GK' | 'DF' | 'mixed'        → kaleci/stoper/karma başlangıç
//   - pressure: 'low' | 'high'           → baskı var mı

const BUILD_UP_TEMPLATES = {
  // === YAVAŞ TEMPO — kaleci uzun top atmak istemiyor ===
  slow: [
    '{team} savunmada sakin, {actor} etrafına bakıyor, pas verecek adam arıyor',
    '{actor} topu aldı, acele etmiyor, {direction} oyuna döndü',
    '{team} geriden kontrollü oyun kuruyor, {actor} rakip beklemiyor',
    '{actor} ayağında top, acele etmeden arkadaşlarını süzüyor',
    'Savunmada top {actor}\'da, {team} oyunu soğutuyor',
  ],

  // === NORMAL TEMPO — klasik oyun kurma ===
  normal: [
    '{team} defanstan topu çıkardı, {actor} orta sahaya doğru oynadı',
    '{actor} topu aldı, etrafına baktı, {target}\'a oynadı',
    '{team} savunmadan çıkıyor, {actor} önündeki adamı gördü',
    '{actor} stoperden pas aldı, sakin sakin ilerletiyor',
    'Defansta {actor} topu aldı, etrafına baktı, {target}\'a oynadı',
    '{team} geriden oyun kuruyor, {actor} pası verdi',
    '{actor} savunmadan topu taşıyor, orta sahaya aktaracak',
    'Defansta kısa paslaşma, {actor} topu saklıyor',
  ],

  // === HIZLI TEMPO — hızlı çıkış ===
  fast: [
    '{team} hızlı çıkıyor! {actor} topu aldı, hemen ileri taşıyor',
    '{actor} tek pasla oyuna girdi, {team} hızlı hücuma kalkıyor',
    'Hızlı pas! {actor} → {target}, orta sahaya taşındı',
    '{team} çabuk çıkmak istiyor, {actor} topu aldı, ileriye taşıyor',
  ],

  // === KALECİDEN BAŞLANGIÇ ===
  fromGK: [
    'Kaleci {actor} uzun top atmak yerine kısa oynuyor',
    '{actor} topu aldı, hemen stoper gördü, kısa pas',
    'Kaleci {actor} arkasına döndü, pas verecek adam arıyor',
  ],

  // === YÜKSEK BASKI ALTINDA ===
  pressed: [
    '{team} baskı altında, {actor} hızlı pas vermek zorunda',
    '{actor} sıkıştırıldı, topu kurtarmaya çalışıyor!',
    'Rakip baskı yapıyor, {actor} topu saklıyor',
    '{team} zor durumda, {actor} bir şekilde pas verdi',
  ],
};

export default BUILD_UP_TEMPLATES;
