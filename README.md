# Narrative Spiker — Başkan Modu

Maç simülasyonu + Türk spiker anlatımı + Başkan (Manager) modu.

## Modlar

- **Normal**: Otomatik değişiklik, hızlı izle
- **Başkan**: Manuel değişiklik, transfer, gelişim, lig

## Kurulum

```bash
npm install
npm start
```

Server `http://localhost:3000` adresinde çalışır.

## Railway Deploy

1. Railway.app → New Project → Deploy from GitHub
2. Repo olarak bu klasörü seç
3. **Root Directory**: `server` (eğer monorepo ise)
4. **Start Command**: `npm start` (auto-detect)
5. PORT environment variable Railway tarafından set edilir

## API Endpoints

- `GET  /api/health` — sağlık kontrolü
- `GET  /api/state` — tüm oyun durumu
- `POST /api/reset` — yeni oyun
- `POST /api/match/start` — yeni maç
- `POST /api/match/tick` — 1 dakika ilerlet
- `POST /api/match/pause` / `resume`
- `POST /api/match/injury-sub` — sakatlık için yedek
- `GET  /api/transfer/market` — piyasa
- `POST /api/transfer/buy` — oyuncu al
- `GET  /api/league/standings` — puan durumu
- `POST /api/league/play-week` — haftayı oyna

## Dosya Yapısı

```
server/
├── index.js              # Express sunucu
├── gameState.js          # State yönetimi
├── matchEngine.js        # Maç wrapper
├── transferEngine.js     # Transfer
├── leagueEngine.js       # Lig
├── teamFactory.js        # Takım üretimi
├── package.json
├── Procfile
├── railway.json
└── .state/               # Otomatik persistence
```

Frontend `../site/` içinde, build edilmiş halde.
