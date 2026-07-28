// match/commentlib/midfield.js
// Orta saha kontrolü yorumları — paslaşma, tempo ayarı, top çevirme
//
// Bağlam:
//   - Top orta sahada (x ∈ [35, 65])
//   - Tempo genelde yavaş, kontrol önemli
//   - Oyuncular arası pas zincirleri

const MIDFIELD_TEMPLATES = {
  // === TEMPO KONTROLÜ — top saklama ===
  tempo: [
    '{team} orta sahada top çeviriyor, tempo kontrolü {actor}\'da',
    '{actor} ortayı yönlendiriyor, {team} oyunu soğutuyor',
    'Orta saha {actor}\'ın kontrolünde, etrafına bakıyor',
    '{team} paslaşarak oyunu kuruyor, {actor} topu dağıtıyor',
  ],

  // === KISA PASLAŞMA ===
  shortPasses: [
    '{team} orta sahada kısa paslaşma, {actor} topu saklıyor',
    'Kısa pas zinciri, {actor} → {target}, top yer değiştiriyor',
    '{actor} topu aldı, bir dokunuşla {target}\'a oynadı',
    'Orta sahada hızlı paslaşma, top ayaklar arasında',
    '{team} orta sahayı doldurdu, pasla top taşınıyor',
    '{actor} ortada tek dokunuşla topu çevirdi, gözleri açık',
  ],

  // === İLERİYE TAŞIMA — pas zinciriyle ===
  progressing: [
    '{team} orta sahayı geçmeye çalışıyor, {passes} pas sonrası ileriye taşındı',
    '{actor} ortayı gördü, paslaşarak ileriye taşınıyor',
    '{team} pas zinciriyle hücuma çıkıyor, {actor} önde bekliyor',
    'Orta sahada {passes} pas sonrası {team} hücum bölgesine yaklaştı',
  ],

  // === GEÇİŞ OYUNU — uzun pas düşüncesi ===
  transition: [
    '{actor} orta sahada topu aldı, ileriye bakıyor',
    'Orta saha boşluğu aranıyor, {actor} pas verecek yer arıyor',
    '{team} orta sahada topu tutuyor, doğru pas anını bekliyor',
    '{actor} topu taşıyor, çevresinde arkadaşları hareketleniyor',
  ],

  // === KAYIP'TAN DÖNÜŞ — geri kazanım sonrası ===
  recover: [
    '{actor} orta sahada topu geri kazandı! {team} tekrar organize oluyor',
    'Orta sahada top {actor}\'da, {team} yeniden kuruyor',
    '{actor} araya girdi, {team} yeni atak başlatıyor',
    'Top {actor}\'da, {team} orta sahada kontrolü yeniden aldı',
  ],
};

export default MIDFIELD_TEMPLATES;
