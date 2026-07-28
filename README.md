# Narrative Spiker — Başkan Modu

Maç simülasyonu + Türk spiker anlatımı + Başkan (Manager) modu.

Tarayıcıda çalışan, sunucu tarafı yükü olmayan, modüler bir futbol
yönetim simülasyonu. Maçlar dakika dakika ilerler, kritik anlar
Türk spiker cümleleriyle anlatılır.

---

## Modlar

- **Normal Mod** — Otomatik değişiklik, hızlı izleme. Seyirci rolü.
- **Başkan Modu** — Manuel değişiklik, transfer, oyuncu gelişimi, lig yönetimi.

## Kurulum

```bash
npm install
npm start
```

Server `http://localhost:3000` adresinde çalışır. Başka bir port için
`PORT` ortam değişkeni ayarla:

```bash
PORT=8080 npm start
```

## Build

Frontend bundle'ı esbuild ile:

```bash
npm run build
```

Bu komut `site/js/entry.js` dosyasını alıp `site/js/match-engine.js`
olarak ESM formatında paketler.

## Railway Deploy

1. Railway.app → New Project → Deploy from GitHub
2. Repo olarak bu klasörü seç
3. **Root Directory**: boş bırak (root repo, monorepo değil)
4. **Start Command**: `npm start` (auto-detect edilir)
5. `PORT` ortam değişkeni Railway tarafından otomatik set edilir

`railway.json` Nixpacks builder kullanır ve `node server.js` komutunu çalıştırır.

## Mimari

Proje tamamen client-side çalışır. Server sadece statik dosya sunar;
oyun durumu, simülasyon, transfer, lig — hepsi tarayıcıda işler.

```
Fmsim/
├── server.js                # Statik dosya sunucu (native http)
├── package.json             # ESM, node 20
├── railway.json             # Railway deploy config
├── Procfile                 # Heroku-compatible fallback
├── site/                    # Frontend
│   ├── index.html           # Tek sayfa (hash route'lü)
│   ├── app.js               # Uygulama mantığı + router
│   ├── styles.css
│   └── js/
│       ├── entry.js         # esbuild giriş noktası
│       └── match-engine.js  # build çıktısı (commit'lenmiş)
├── match/                   # Maç motoru — 16 modül
│   ├── simulate.js          # Ana simülasyon akışı
│   ├── state.js             # Oyun durumu modeli
│   ├── events.js            # Maç içi olaylar
│   ├── decision.js          # AI karar mekaniği
│   ├── narrator.js          # Spiker cümlesi seçici
│   ├── substitution.js      # Değişiklik mantığı
│   ├── motivation.js        # Moral/motivasyon motoru
│   ├── development.js       # Oyuncu gelişimi
│   ├── teamBuilder.js       # Kadro kurgusu
│   ├── teamDatabase.js      # Takım verisi
│   ├── transfer.js          # Transfer piyasası
│   ├── league.js            # Lig fikstürü + puan durumu
│   ├── positions.js         # Pozisyon tanımları
│   ├── calc.js              # Hesaplama yardımcıları
│   ├── playerName.js        # İsim üretimi
│   ├── clubName.js          # Kulüp isim üretimi
│   └── commentlib/          # Spiker cümle havuzu
│       ├── index.js         # Registry, pick, fillTemplate
│       ├── build_up.js
│       ├── midfield.js
│       ├── attack.js
│       ├── danger.js
│       ├── counter.js
│       ├── transition.js
│       ├── critical.js
│       └── motivation.js
└── game/
    └── playerSchema.js      # Oyuncu özellik şeması
```

### Modüler motor

Her `match/*.js` tek bir sorumluluk taşır:

- **`simulate.js`** — ana akış (dakika → olay → güncelle → anlat)
- **`narrator.js`** + **`commentlib/`** — olay tipine göre cümle seç,
  değişkenleri (`{actor}`, `{team}`) doldur
- **`state.js`** — takım, oyuncu, maç state modeli
- **`decision.js`** — AI taktik kararları

Bu ayrım sayesinde spiker cümleleri, simülasyon ve state birbirinden
bağımsız test edilebilir.

### Spiker anlatımı

`match/commentlib/` altında 9 kategoride (kurgu, orta saha, atak, tehlike,
kontra, geçiş, kritik, motivasyon) önceden yazılmış cümle havuzu var.
`pick()` aynı anahtardaki son birkaç seçimi hatırlar ve tekrar etmez —
uzun maçlarda cümleler monotonlaşmaz.

## Sayfalar (hash route)

| Route | İçerik |
|---|---|
| `#/` | Lig merkezi, haftalık fikstür, transfer teklifleri |
| `#/match` | Canlı maç yayını, spiker anlatımı, olay akışı |
| `#/report` | Maç sonu raporu, istatistikler, play-by-play |
| `#/squad` | İlk 11 + yedek kadro |
| `#/transfers` | Transfer piyasası (filtre: pozisyon, yaş, yıldız) |
| `#/standings` | Puan durumu |
| `#/lineup` | Taktik tahtası (formasyon + sürükle-bırak) |
| `#/development` | Oyuncu gelişimi (ücretsiz + kişisel antrenman) |
| `#/player` | Oyuncu detay (yetenekler, yakın arkadaşlar, antrenman) |

## Test Ekranı

`http://localhost:3000/test.html` — motorun görsel test paneli.

İki takımı kurar, istediğin kadar dakika oynatır veya otomatik moda alırsın.
Skor, istatistik, saha üzerinde top pozisyonu, olay akışı ve spiker anlatımı
canlı izlenir.

### API Rotaları (test)

| Method | Path | Açıklama |
|---|---|---|
| GET/POST | `/api/test/start` | Yeni maç başlat. Query: `homeName`, `awayName`, `hForm`, `aForm` |
| GET | `/api/test/tick?count=N` | N dakika ilerlet (varsayılan 1) |
| GET | `/api/test/run?untilMinute=M` | Belirli dakikaya kadar oyna (max 90) |
| GET | `/api/test/state` | Mevcut state snapshot'ı |
| GET | `/api/test/events` | Tüm olaylar + narratif listesi |

### Hızlı test (curl)

```bash
# Maç başlat
curl 'http://localhost:3000/api/test/start?homeName=Galata&awayName=Kartal'

# 10 dakika oyna
curl 'http://localhost:3000/api/test/tick?count=10'

# Maçı sonuna kadar oyna
curl 'http://localhost:3000/api/test/run?untilMinute=90'

# Mevcut durum
curl 'http://localhost:3000/api/test/state'
```

## Lisans

MIT — detay için `LICENSE` dosyasına bakın (yoksa ekleyin).

## Katkı

Issue ve PR açın. Spiker cümle havuzuna katkı özellikle değerli —
yeni kategori veya yeni üsluplar (kadın spiker, eski usul, modern)
için `match/commentlib/` altına modül ekleyip `index.js`'de registry'ye
kaydetmek yeterli.
