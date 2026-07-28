// match/commentlib/danger.js
// Tehlike bölgesi yorumları — son pas/şut öncesi, kritik anlar
//
// Bağlam:
//   - Top ceza sahası yakınında veya içinde (x >= 84)
//   - Yüksek tempo, kısa cümleler
//   - Spiker ses tonu yükselir

const DANGER_TEMPLATES = {
  // === KRİTİK ANLAR — yüksek gerilim ===
  critical: [
    'KRİTİK AN! {actor} ceza sahasında, {team} gol arıyor!',
    'TEHLİKE! {actor} topu aldı, şut pozisyonunda!',
    'Ceza sahası içinde kaos! {actor} topu aldı, arkadaşları bekliyor',
    'BÜYÜK AN! {actor} ceza sahası önünde, son pası arıyor',
  ],

  // === SON PAS ===
  finalPass: [
    '{team} son pası yapacak, {actor} arka direğe hareketlendi',
    'Pas anı! {actor} ceza sahası içinde, gol pozisyonu',
    '{team} arka direğe top gönderdi, {actor} orada',
    'Son pas! {actor} topu aldı, bir dokunuş yetecek',
  ],

  // === TEHLİKE BÖLGESİ GENEL ===
  zone: [
    'Tehlike bölgesi! {actor} ceza sahasına yaklaşıyor',
    '{team} son çizgide, {actor} pas arıyor',
    'Defansın kalbi! {actor} ceza sahası önünde',
    'Son metreler! {actor} topu aldı, gol pozisyonu yakın',
  ],

  // === ŞUT HAZIRLIĞI ===
  shotPrep: [
    'Şut geliyor! {actor} hazırlanıyor...',
    'Tehlike! Ceza sahası önünde {actor}, şut verebilir',
    '{actor} vuruş açısı arıyor, savunma arkasına geçmeye çalışıyor',
    'Vuruş anı! {actor} topu sağ ayağına aldı',
  ],

  // === CEZA SAHASI İÇİ ===
  inBox: [
    'Ceza sahası içinde {actor}, {team} gol kokuyor',
    '{actor} ceza sahasında bomboş, top geliyor!',
    'Altıpas! {actor} kaleciyle karşı karşıya pozisyonda',
    'Ceza sahası kalabalık, {actor} arkada boş',
  ],

  // === GERGİN AN — bekleyiş ===
  tension: [
    'Herkes bekliyor... {actor} ne yapacak?',
    'Tribünler sus pus, {actor} topu aldı',
    'Bir anlık sessizlik, {actor} kararını veriyor',
    'Saha kenarından gözler {actor}\'da, herkes bekliyor',
  ],
};

export default DANGER_TEMPLATES;
