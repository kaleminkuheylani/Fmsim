// match/commentlib/critical.js
// Kritik an yorumları — gol, kart, korner, şut, kurtarış
//
// Bağlam:
//   - Maçı değiştiren anlar
//   - Her zaman tek başına vurgulanır
//   - Spiker sesi yükselir

const CRITICAL_TEMPLATES = {
  // === GOL ===
  goal: {
    early: [
      'GOOOLLL! Erken gol! {scorer} topu ağlarla buluşturdu, {result}',
      'GOOOLLL! Maçın başında {scorer} sahneye çıktı, {result}',
    ],
    normal: [
      'GOOOLLL! {scorer} topu ağlarla buluşturdu, {result}',
      'GOOOOL! {scorer} fileleri sarstı, {result}',
      'GOOOL! {scorer} attı, {result}!',
    ],
    drought: [
      'GOOOOOL! {scorer} uzun bir aradan sonra golü buldu, {result}',
      'Nihayet GOL! {scorer} suskunluğunu bozdu, {result}',
    ],
    equalizer: [
      'GOOOL! {scorer} eşitledi! Skor artık {score}',
      'EŞİTLEME! {scorer} son anda golü attı, {result}',
    ],
    winner: [
      'GOOOOOL! {scorer} galibiyet golünü attı! {result}',
      'Müthiş gol! {scorer} takımını öne geçirdi, {result}',
    ],
  },

  // === KART — sarı ===
  yellow: [
    'SARI KART! {actor} faulüyle hakemi ikna edemedi',
    '🟨 {actor} sarı kart gördü! Bir sonraki faulde çift sarı',
    'Sarı kart çıktı, {actor} sınırda',
    'Hakem {actor}\'a kartını gösterdi!',
  ],

  // === KART — kırmızı ===
  red: [
    'KIRMIZI KART! {actor} oyun dışı, {team} sahada 10 kişi!',
    '🟥 {actor} ikinci sarıdan atıldı! Büyük kayıp',
    'Kırmızı! {actor} oyundan atıldı, {team} zor durumda',
  ],

  // === KORNER ===
  corner: [
    'KORNER! {team} ceza sahasına gönderiyor, savunma temizlemeye çalışacak',
    'Korner vuruşu, {team} topu ceza sahasına taşıyor',
    'Köşe vuruşu! {team} için gol fırsatı',
  ],

  // === ŞUT VE KURTARIŞ ===
  shotSaved: [
    'ŞUT ve KURTARIŞ! {actor} vurdu, kaleci {keeper} çıkardı!',
    'BÜYÜK KURTARIŞ! Kaleci {keeper} {actor}\'ın şutunu çeldi!',
    '{actor} şutunu çekti, kaleci {keeper} muhteşem çıkardı!',
    'Kaleci {keeper} devleşti! {actor}\'ın şutunu kornere çeldi',
  ],

  // === ŞUT KAÇTI ===
  shotMiss: [
    'ŞUT! {actor} denedi ama {direction} auta gitti!',
    'Şut auta! {actor} skoru kaçırdı',
    '{actor} vurdu, top {direction} gitti',
    'İsabetsiz şut! {actor} pozisyonu harcıyor',
  ],

  // === ORTA (cross) ===
  cross: [
    'ORTA! {actor} ceza sahasına gönderdi, {target} kafayla vuracak',
    'Orta geldi! {actor} arka direğe top gönderdi',
  ],
};

export default CRITICAL_TEMPLATES;
