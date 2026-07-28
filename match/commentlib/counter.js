// match/commentlib/counter.js
// Kontra atak yorumları — hızlı geçiş, rakip yakalandı
//
// Bağlam:
//   - Rakip top kaybetti, biz yakaladık
//   - Hızlıca hücuma çıkılıyor
//   - Savunma arkasına top

const COUNTER_TEMPLATES = {
  // === KLASİK KONTRA ===
  classic: [
    'KONTRA! {actor} boş alanda, {team} rakibi yakaladı!',
    '{team} hızlı çıktı! {actor} tek başına ilerliyor',
    'Hızlı hücum! {actor} orta sahayı geçti, gol pozisyonuna giriyor',
    'Kontra atak! {actor} rakip savunmayı yakaladı',
  ],

  // === DERİN KONTRA — kaleci bile dahil ===
  deep: [
    'Derin kontra! {actor} orta sahayı geçti, tek başına ilerliyor',
    '{team} sahasından çıktı! {actor} taşıyor, gol arıyor',
    'Kendi yarı sahasından kontra! {actor} 50 metre top sürdü',
  ],

  // === 3'e 2 — sayısal üstünlük ===
  advantage: [
    '{team} sayısal üstünlükte! {actor} arkadaşlarına bakıyor',
    'Üçe iki! {actor} topu taşıyor, pas verecek yer var',
    'Rakip dengesiz, {actor} organize hücum kuruyor',
  ],

  // === SAVUNMA ARKASI KOŞU ===
  run: [
    'Savunma arkasına koşu! {actor} atıyor, top geliyor',
    '{actor} bomboş alana sızdı, pas uzun geldi',
    'Araya koşu! {actor} topu aldı, kaleciyle karşı karşıya',
  ],

  // === KONTRA BOZULDU — karşı kontra riski ===
  breakdown: [
    'Kontra bozuldu! {actor} topu kaybetti, rakip geçiyor',
    'Hızlı çıkış tutmadı, {actor} son pası veremedi',
  ],

  // === ZAMANLAMA — son anda fark edildi ===
  latePass: [
    'Geç pas! {actor} yetişemedi, kontra şansı kaçtı',
    '{actor} biraz geç kaldı, savunma döndü',
  ],
};

export default COUNTER_TEMPLATES;
