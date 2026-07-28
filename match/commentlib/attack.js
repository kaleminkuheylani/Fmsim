// match/commentlib/attack.js
// Hücum organizasyonu yorumları — kanat akınları, organize atak, son pas
//
// Bağlam:
//   - Top hücum bölgesinde (x ∈ [65, 84])
//   - Takım organize hücumda
//   - Son pas/şut öncesi an

const ATTACK_TEMPLATES = {
  // === GENEL ORGANİZASYON ===
  build: [
    '{team} hücumu kurdu, {actor} ceza sahasına doğru ilerliyor',
    'Hücum organize, {actor} topu aldı, ceza sahası önünde bekleniyor',
    '{team} son çizgiye yaklaştı, {actor} pas verecek yer arıyor',
    '{actor} hücumda görev aldı, ceza sahası önünde pas arıyor',
  ],

  // === KANATTAN GELİŞ ===
  left: [
    'Sol kanattan {actor} içeri kat ediyor, {team} organize hücumda',
    'Sol tarafta hareketlilik var, {actor} ortalıyor',
    '{actor} sol kanattan sürüyor, ceza sahası önünde top',
    'Sol kanat aktif! {actor} ceza sahasına doğru taşıyor',
  ],
  right: [
    'Sağ kanattan {actor} içeri kat ediyor, {team} organize hücumda',
    'Sağ tarafta {actor} bindirme yaptı, ortalıyor',
    '{actor} sağdan ceza sahasına yaklaşıyor',
    'Sağ kanattan dalga dalga! {actor} topu taşıyor',
  ],

  // === ORTADA GELİŞ ===
  center: [
    'Ortadan {actor} ceza sahasına doğru yürüyor, {team} hücumda',
    'Orta alanda {actor} topu aldı, ceza sahasına yaklaşıyor',
    '{actor} forvet hattına pas verdi, gol pozisyonu aranıyor',
    'Merkezden {actor} arkadaşlarını arıyor, {team} organize',
  ],

  // === SON PAS ÖNCESİ ===
  finalBall: [
    '{team} son pası yapacak, {actor} arka direğe hareketlendi',
    'Son pas anı! {actor} ceza sahası içinde bekliyor',
    '{actor} topu aldı, arkadaşları koşu yolunda',
    'Kritik an — {actor} ceza sahasında, pas anını bekliyor',
    'Tehlike bölgesinde! {actor} topu aldı, son pas için arkasına bakıyor',
  ],

  // === HIZLI HÜCUM — hızlı tempo ===
  quick: [
    '{team} hızlı hücumda, {actor} ceza sahasına koşuyor',
    'Hızlı akın! {actor} rakibi geçti, gol pozisyonuna giriyor',
    'Tempo yüksek! {team} hücumda, {actor} topu taşıyor',
  ],

  // === KARARSIZLIK — pas verilecek yer yok ===
  indecisive: [
    '{actor} topu aldı ama ne yapacağına karar veremiyor',
    'Hücumda kararsızlık, {actor} pas verecek adam bulamıyor',
    '{team} hücumda dağıldı, {actor} topu kurtarmaya çalışıyor',
  ],
};

export default ATTACK_TEMPLATES;
