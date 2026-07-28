// match/commentlib/transition.js
// Top değişimi yorumları — turnover, tackle, interception
//
// Bağlam:
//   - Top el değiştirdi (turnover, tackle_won)
//   - Yeni takım organize olmaya başlıyor
//   - Tempo genelde yüksek (hızlı karşı atak fırsatı)

const TRANSITION_TEMPLATES = {
  // === TEMEL KAYIP ===
  lost: [
    'Top değişti! {winner} topu kazandı, {team} kontra çıkmak istiyor',
    'Top kaybı! {winner} araya girdi, {team} yeni bir atak kuracak',
    'Top {winner}\'a geçti, {team} yön değiştirdi',
    'Sahipsiz top {winner}\'da, {team} hücuma kalkıyor',
  ],

  // === ARAYA GİRME (interception) — beklemeden yapıldı ===
  intercept: [
    'ARAYA GİRİŞ! {winner} topu kesti, {team} hızlı çıkacak',
    '{winner} pası kesti! Muhteşem okuma, {team} kontra atakta',
    'Araya top! {winner} refleksle topu aldı',
    'İNTERSEPSİYON! {winner} beyniyle oynadı, top artık onun',
  ],

  // === MÜDAHALE (tackle) — fiziksel kazanım ===
  tackle: [
    'MÜDAHALE! {winner} topu kazandı, sert ama temiz',
    '{winner} rakibini durdurdu! Top artık bizde',
    'Sert müdahale, {winner} topu söktü aldı',
    '{winner} ayak koydu, topu kaptı!',
  ],

  // === DRIBLING KAYBI (turnover sonrası) ===
  dribbleLoss: [
    '{winner} topu kaptı! {loser} top kaybetti',
    'Dripling başarısız! {winner} topu söktü',
    '{loser} top kaybetti, {winner} aldı ve taşıyor',
  ],

  // === PAS KESİLDİ ===
  passIntercept: [
    '{winner} pası kesti! Aradaki adam oldu',
    'Araya top! {winner} beklemediği yerde çıktı',
    'Pas araya gitti, {winner} topu aldı',
  ],

  // === SAHİPSİZ TOP (loose ball) — kimin aldığı net değil ===
  loose: [
    'Sahipsiz top! {team} ve rakip arasında, {winner} aldı',
    'Top havada kaldı, {winner} kafayla indirdi',
    'İki takım birden uçtu, {winner} önce davrandı',
  ],
};

export default TRANSITION_TEMPLATES;
