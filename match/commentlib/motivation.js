// match/commentlib/motivation.js
// Motivasyon/reaksiyon yorumları — moral, momentum, oyuncu durumu

const MOTIVATION_TEMPLATES = {
  // === GOL SONRASI TAKIM TEPKİSİ ===
  goalReaction: {
    // Gol atan takım — coşku
    scoring: [
      '{team} gol attı! Oyuncular birbirine sarıldı, moral tavan',
      'GOL! {team} rahatladı, tribünler çılgına döndü',
      '{team} ağları sarstı, oyuncular kutlamada',
      'GOOL! {team} golü buldu, moral yerine geldi',
      'Gol geldi! {team} oyuncuları sevinçten deliye döndü',
    ],
    // Gol yiyen takım — yıkım
    conceding: [
      '{team} gol yedi! Oyuncular birbirine baktı, moraller bozuk',
      'Gol... {team} yıkıldı, oyuncular başlarını eğdi',
      '{team} golü yedi, savunma hatası moral bozdu',
      'Yediğimiz gol {team}\'i sarstı, oyuncular yorgun',
      '{team} golü kalesinde gördü, moral dibe vurdu',
    ],
  },

  // === GERİDE KALAN TAKIM — PANİK ===
  behind: [
    '{team} geride, dakikalar azalıyor, panik başladı',
    '{team} gol arıyor ama bulamıyor, sinirler gergin',
    'Geride kalan {team}, oyuncular birbirine bağırıyor',
    '{team} 80+ dakikada geride, çareler tükeniyor',
    'Son dakikalar, {team} ne yapacağını bilemiyor',
  ],

  // === ÖNDE OLAN TAKIM — RAHATLAMA ===
  ahead: [
    '{team} önde, oyuncular rahat, top çeviriyorlar',
    '{team} kontrolü elinde, dakikalar eriyor',
    'Lider {team}, skoru koruyor, oyunu soğutuyor',
    '{team} farkı korumaya çalışıyor, savunma sağlam',
  ],

  // === BERABERLİK ===
  draw: [
    'Skor berabere, iki takım da kazanmak istiyor',
    'Beraberlik devam ediyor, kazananı son dakikalar belirleyecek',
    'Eşitlik bozulmadı, heyecan dorukta',
  ],

  // === KIRMIZI KART SONRASI ===
  redAftermath: {
    // Kart yiyen takım — dezavantaj
    losing: [
      '{team} 10 kişi kaldı! Oyuncular birbirine baktı, işimiz zor',
      '10 kişiyle devam! {team} oyuncuları moralsiz',
      'Atılma! {team} zor durumda, sahada eksik',
      '{team} sahada 10 kişi, oyuncular yorgunluk ve stres altında',
    ],
    // Kart yiyen oyuncunun tepkisi
    player: [
      '{actor} sahayı terk etti, yüzü asık',
      '{actor} oyun dışı, soyunma odasına yürüdü',
      'Kırmızı! {actor} hakeme itiraz ediyor ama karar değişmiyor',
    ],
  },

  // === SAKATLIK ===
  injury: {
    // Hafif sakatlık — oyuncu kalkar
    light: [
      '{actor} bir an yerde kaldı, ama kalktı, devam ediyor',
      '{actor} hafif sakatlık geçirdi, sağlık ekibi müdahale etti',
      'Mücadele sonucu {actor} yere düştü ama ayağa kalktı',
    ],
    // Orta — şüpheli
    medium: [
      '{actor} yerde kaldı, sağlık ekibi sahaya girdi',
      'Dizinden sakatlanan {actor} oyuna devam edemiyor',
      '{actor} kasını tuttu, oyun durdu, tedavi sürüyor',
    ],
    // Ağır — oyuncu çıkar
    heavy: [
      '{actor} ağır sakatlık! Sedye ile sahadan çıkarıldı',
      'Sakatlık ciddi! {actor} oyunu tamamlayamadı',
      '{actor} acı içinde yerde kaldı, değişiklik yapılıyor',
    ],
    // Genel
    generic: [
      '{actor} sakatlık geçirdi, oyun durdu',
      'Sağlık ekibi sahada, {actor} tedavi altında',
      '{actor} oyuna devam edemiyor, değişiklik zorunlu',
    ],
  },

  // === SARI KART SONRASI ===
  yellowCaution: [
    '{actor} dikkatli olmalı, bir sarı kart daha kırmızı demek',
    '{actor} sınırda, bir sonraki faulde çift sarı riski',
    'Hakem {actor}\'a uyarıda bulundu, dikkat etmeli',
  ],

  // === MORAL YÜKSEK ===
  moraleHigh: [
    '{team} moral tavan! Oyuncuların gözleri parlıyor',
    '{team} oyunu domine ediyor, özgüven patladı',
    'Moral yerinde! {team} paslaşmadan keyif alıyor',
  ],

  // === MORAL DÜŞÜK ===
  moraleLow: [
    '{team} moralsiz, paslar isabetsiz, hatalar artıyor',
    '{team} oyuncuları başlarını eğdi, durum kötü',
    'Moral dibe vurdu! {team} oyunu bırakmak üzere',
  ],

  // === YORGUN OYUNCU ===
  tired: [
    '{actor} yorgun, ayakları ağırlaştı',
    '{actor} son dakikaları zor çıkarıyor, kramp girmek üzere',
    'Yorgunluk! {actor} koşamıyor, savunma arkasına geçemiyor',
  ],

  // === 10 KİŞİYLE OYNAMA ===
  downToTen: [
    '{team} sahada 10 kişi, her pozisyonda adam eksik',
    '10 kişiyle savunma! {team} geri çekildi',
    '{team} oyunu tutmaya çalışıyor ama adam eksik',
  ],

  // === OYUNCU DEĞİŞİKLİĞİ ===
  substitution: {
    // Çıkan oyuncu
    goingOut: [
      '{out} kenara geldi, yerini {in}\'e bırakıyor',
      '{out} formasını {in}\'e veriyor, oyun dışı',
      'Değişiklik! {out} yoruldu, {in} sahaya giriyor',
    ],
    // Giren oyuncu
    comingIn: [
      '{in} sahaya adım attı, taze güç geldi',
      '{in} oyuna girdi, {team} yeni bir silah kazandı',
      'Yedek kulübesinden {in} geldi, performans göstermek istiyor',
    ],
    // Sakatlık değişikliği
    injury: [
      'Sakatlıktan dolayı {out} çıkmak zorunda, {in} sahaya giriyor',
      '{out} sakatlığı nedeniyle oyunu tamamlayamadı, {in} görev başında',
    ],
    // Taktik değişiklik
    tactical: [
      'Taktik değişiklik! Menajer {out} çıkardı, {in} ile farklı bir sistem deniyor',
      '{team} oyunu değiştirmek istiyor, {out} yerine {in}',
    ],
  },
};

export default MOTIVATION_TEMPLATES;
