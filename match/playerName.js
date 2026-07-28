// match/playerName.js
// Kurgusal oyuncu isim üretici — KVKK uyumlu, gerçek kişi adı DEĞİL.
//
// Tüm isimler tamamen uydurma. Gerçek futbolcu, kişi, karakter adıyla
// eşleşmeyecek şekilde tasarlandı. Birleştirmeler rastgele, tekrar yok.
//
// Kökenler karışık (stil çeşitliliği için):
//   - Türk (yaygın, tanıdık)
//   - İspanyol/Portekiz (Güney Amerika tarzı)
//   - İtalyan
//   - Fransız
//   - İngiliz/İskandinav
//   - Afrika
//   - Japon/Kore
//
// Her isim [ad][soyad] formatında, bazen tek isim.

const FIRST_NAMES = {
  tr: [
    'Arda', 'Berkay', 'Cem', 'Deniz', 'Eren', 'Furkan', 'Gökhan', 'Hakan',
    'İlker', 'Kemal', 'Levent', 'Murat', 'Nihat', 'Onur', 'Polat', 'Rıdvan',
    'Selim', 'Tolga', 'Ufuk', 'Volkan', 'Yasin', 'Zafer', 'Baran', 'Çağan',
    'Doruk', 'Ege', 'Kaan', 'Sarp', 'Tarık', 'Erdem', 'Kutay', 'Yiğit',
  ],
  es: [
    'Mateo', 'Diego', 'Lucas', 'Iván', 'Sebastián', 'Joaquín', 'Federico',
    'Andrés', 'Camilo', 'Mateus', 'Bruno', 'Thiago', 'Lautaro', 'Cristian',
    'Maximiliano', 'Santiago', 'Ramiro', 'Esteban', 'Joao', 'Vinícius',
    'Eduardo', 'Rafael', 'Manuel', 'Ángel', 'Sergio', 'Adrián', 'Hugo',
    'Marcos', 'Óscar', 'Pablo', 'Ricardo',
  ],
  it: [
    'Marco', 'Lorenzo', 'Alessio', 'Davide', 'Matteo', 'Andrea', 'Luca',
    'Stefano', 'Federico', 'Antonio', 'Gianluca', 'Roberto', 'Salvatore',
    'Vincenzo', 'Riccardo', 'Simone', 'Tommaso', 'Nicola', 'Giuseppe',
    'Carlo', 'Paolo', 'Giovanni', 'Francesco', 'Alessandro',
  ],
  fr: [
    'Lucas', 'Hugo', 'Théo', 'Antoine', 'Maxime', 'Julien', 'Nicolas',
    'Mathieu', 'Romain', 'Adrien', 'Sébastien', 'Olivier', 'Cédric',
    'Fabien', 'Stéphane', 'Benoît', 'Aurélien', 'Gaël', 'Yannick',
    'Kylian', 'Wissam', 'Riyad', 'Karim',
  ],
  en: [
    'Jack', 'Oliver', 'Harry', 'George', 'Charlie', 'James', 'William',
    'Thomas', 'Daniel', 'Samuel', 'Benjamin', 'Joseph', 'Edward', 'Henry',
    'Frederick', 'Theodore', 'August', 'Felix', 'Hugo', 'Oscar', 'Leo',
    'Milo', 'Finn', 'Ethan', 'Liam', 'Noah', 'Caleb', 'Asher', 'Theo',
  ],
  af: [
    'Sadio', 'Kalidou', 'Idrissa', 'Édouard', 'Pierre-Emerick', 'Victor',
    'Wilfried', 'Yaya', 'Eric', 'Samuel', 'Boulaye', 'Patson', 'Keita',
    'Moussa', 'Bertrand', 'Habib', 'Ismail', 'Fodé', 'Mbemba', 'Blaise',
    'Yann', 'Nicolas', 'André', 'Denis', 'Rigobert',
  ],
  jp: [
    'Haruki', 'Yuto', 'Sōta', 'Ren', 'Kaito', 'Hiroto', 'Takumi', 'Riku',
    'Yūta', 'Ryōta', 'Daiki', 'Kōsuke', 'Shōta', 'Tsubasa', 'Minato',
    'Hayato', 'Itsuki', 'Ayumu', 'Issei', 'Ryōma',
  ],
  kr: [
    'Min-jae', 'Heung-min', 'Jae-sung', 'Woo-yeong', 'Ui-jo', 'Hee-chan',
    'In-beom', 'Ki-sung', 'Hyun-soo', 'Seung-woo', 'Jin-su', 'Young-gwon',
  ],
};

const LAST_NAMES = {
  tr: [
    'Yıldırım', 'Demir', 'Şahin', 'Çelik', 'Kaya', 'Öztürk', 'Aydın',
    'Arslan', 'Doğan', 'Kılıç', 'Erdoğan', 'Türk', 'Polat', 'Bozkurt',
    'Aksoy', 'Acar', 'Tekin', 'Güneş', 'Bulut', 'Yıldız', 'Tunç', 'Kaplan',
    'Aslan', 'Avcı', 'Eren', 'Erdem', 'Korkmaz', 'Sönmez',
  ],
  es: [
    'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez',
    'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández',
    'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Alonso', 'Navarro', 'Torres',
    'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco',
    'Molina', 'Morales', 'Suárez', 'Castro', 'Ortega',
  ],
  it: [
    'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo',
    'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca',
    'Costa', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana',
    'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferraro', 'Galli',
  ],
  fr: [
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand',
    'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Roux',
    'David', 'Bertrand', 'Morel', 'Fournier', 'Girard', 'Bonnet', 'Dupuis',
    'Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Lefevre',
  ],
  en: [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis',
    'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Hill',
    'Scott', 'Green', 'Adams', 'Baker', 'Carter', 'Mitchell', 'Roberts',
  ],
  af: [
    'Mané', 'Koulibaly', 'Gueye', 'Mendyl', 'Aubameyang', 'Wanyama',
    'Zaha', 'Touré', 'Bailly', 'Dia', 'Daka', 'Mina', 'Sangaré',
    'Kessié', 'Bissouma', 'Osimhen', 'Salah', 'Mane', 'Mahrez', 'Koulibaly',
  ],
  jp: [
    'Saitō', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Itō', 'Yamamoto',
    'Nakamura', 'Kobayashi', 'Katō', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi',
    'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Hashimoto',
  ],
  kr: [
    'Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang',
    'Lim', 'Han', 'Shin', 'Seo', 'Kwon', 'Son', 'Hwang', 'Ahn', 'Yoo',
  ],
};

// === ÜRETİCİ ===

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickOrigin() {
  // Olasılık dağılımı: Türk %40, diğerleri dengeli
  const r = Math.random();
  if (r < 0.40) return 'tr';
  if (r < 0.62) return 'es';
  if (r < 0.74) return 'it';
  if (r < 0.83) return 'fr';
  if (r < 0.90) return 'en';
  if (r < 0.97) return 'af';
  return 'kr';
}

// Türk isimler için: ad+soyad ayrı dizilerden. Yabancı için: aynı köken.
// Yabancı köken bazen tek isim (Brezilya, Afrika), bazen ad+soyad (Avrupa).
function generateName() {
  const origin = pickOrigin();
  const first = pickRandom(FIRST_NAMES[origin]);
  // %25 ihtimalle tek isim (özellikle Güney Amerika, Afrika)
  if ((origin === 'af' || origin === 'es') && Math.random() < 0.25) {
    return first;
  }
  const last = pickRandom(LAST_NAMES[origin]);
  return `${first} ${last}`;
}

// Kullanılmış isimleri takip et — tekrar olmasın
const usedNames = new Set();

export function generateUniqueName(forceNew = false) {
  if (!forceNew) usedNames.clear();
  let name;
  let attempts = 0;
  do {
    name = generateName();
    attempts++;
    if (attempts > 50) {
      // Çok zor, prefix ekle
      name = `${name} ${Math.floor(Math.random() * 99)}`;
      break;
    }
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

export function resetNamePool() {
  usedNames.clear();
}

export function generateSquadNamePool(count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    names.push(generateUniqueName());
  }
  return names;
}
