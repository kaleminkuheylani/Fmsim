# Narrative Spiker — Başkan Modu

> Tarayıcıda çalışan, Türk spiker anlatımlı futbol yönetim simülasyonu.

---

## Tek cümle özet

Bir maç izleyicisi değil, bir başkan gibi hisset: kadroyu kur, transfer yap,
oyuncuları geliştir, ligde yarış — ve her dakika Türk spiker eşliğinde.

---

## Problem

Futbol yönetim oyunları ya çok ağır (PC, Steam, saatlerce öğrenme eğrisi),
ya çok yüzeysel (tarayıcıda basit kart oyunları), ya da spiker anlatımı
yok — sadece soğuk skorboard. Türk futbolseverleri için:

- **Anadolu tribün kültürüne yakın** bir anlatım dili yok.
- **Kısa oturumlarda** (10–20 dk) ilerleyen, tarayıcıda açılan bir simülasyon yok.
- **Telefonda, internetsiz, hızlı** çalışan bir başkan modu yok.

## Çözüm

Narrative Spiker, **client-side** (tarayıcıda, sunucu bağımlılığı olmadan)
çalışan bir futbol simülasyonu. Maçlar **dakika dakika** işler, her kritik
an bir **Türk spiker cümlesi** ile anlatılır. Oyuncu iki mod arasında seçim yapar:

| Mod | Deneyim |
|---|---|
| **Normal** | Otomatik kadro, hızlı izleme, izleyici rolü |
| **Başkan** | Manuel değişiklik, transfer, oyuncu gelişimi, lig yönetimi |

---

## Hedef kitle

- **18–35 yaş Türk futbolseverleri** — özellikle *Football Manager* ve
  *Pes / FIFA Manager* nostaljisi olanlar.
- Mobil ağırlıklı oyuncular: kahve molasında, metroda, bir maç başlatıp
  15 dakika sonra kapatacak kullanıcılar.
- Spiker anlatımını seven *“stadyumda değilim ama oradaymışım gibi”* hissini
  arayan kitle.

---

## Neden farklı

1. **Spiker anlatımı birinci sınıf vatandaş.**
   `match/commentlib/` altında 9 kategoride (atak, kontra, orta saha, tehlike,
   kritik, motivasyon, geçiş oyunu, orta saha, kurgu) önceden yazılmış
   cümle havuzu. Olay tipine göre seçim, tekrar etmeyen dağılım.
2. **İki mod, tek engine.** Aynı simülasyon motoru, hem seyir hem yönetim için.
3. **Saf istemci.** Sunucu sadece statik dosya sunar (`serve-handler`).
   Oyun state'i tarayıcıda — kurulum, hesap, internet zorunluluğu yok.
4. **Modüler motor.** `match/` altında 16 ayrı modül:
   `simulate`, `state`, `events`, `decision`, `narrator`, `substitution`,
   `motivation`, `development`, `teamBuilder`, `teamDatabase`, `transfer`,
   `league`, `playerName`, `clubName`, `positions`, `calc`. Her biri tek
   sorumluluk, bağımsız test edilebilir.

---

## Temel özellikler

- **Maç simülasyonu**: dakika dakika, olay temelli (gol, şut, korner, faul, sakatlık).
- **Spiker anlatımı**: olay tipine göre havuzdan seçilen cümleler, değişken
  oyuncu/takım adı yerleştirmesi.
- **Transfer pazarı**: bütçe, kontrat, pozisyon bazlı alım-satım.
- **Lig sistemi**: puan durumu, fikstür, haftalık oynatma.
- **Oyuncu gelişimi**: form, yaş, moral, performansa göre büyüme grafiği.
- **Motivasyon motoru**: soyunma odası, moral, saha içi karar tetikleyici.
- **Manuel değişiklik**: sakatlık anında oyuncu kararı, taktik kaydırma.

---

## Teknik mimari

```
Fmsim/
├── server.js          # Statik dosya sunucu (node http + serve-handler)
├── site/              # Frontend (index.html, app.js, styles.css)
├── match/             # Maç motoru (16 modül + commentlib/)
└── game/              # Oyuncu şema tanımı
```

- **Stack**: Node 20, ESM modüller, esbuild ile bundle.
- **Frontend**: vanilla JS, framework bağımlılığı yok.
- **State**: tarayıcı içi (in-memory + opsiyonel persistence).
- **Dağıtım**: Railway (Procfile + railway.json hazır), root dizin `server`.

---

## Roadmap

### Yakın (v0.x)
- Spiker cümle havuzunu 5x genişletme (kadın spiker, eski usul, modern).
- Lig sayısı: Süper Lig + 2 alt lig.
- Mobil UI düzenlemesi.

### Orta (v1.x)
- Çoklu sezon + şampiyonlar ligi.
- Oyuncu kariyer modu (tek oyuncuyu yönet).
- Anlık kayıt / cloud sync (opsiyonel).

### Uzun (v2.x)
- Topluluk anlatımı: kullanıcı kendi spiker üslubunu ekler.
- Çok oyunculu başkan modu (arka arkaya karşılaşma).

---

## Nasıl çalıştırılır

```bash
npm install
npm start
# http://localhost:3000
```

---

## Statü

Aktif geliştirme. Mevcut haliyle oynanabilir demo, tek-kişilik test için yeterli.
Bir sonraki kilometre taşı: Süper Lig kadro verisi + mobil-öncelikli UI geçişi.

---

## İletişim

Repo: github.com/kaleminkuheylani/Fmsim
Issue ve PR'lar açıktır.
