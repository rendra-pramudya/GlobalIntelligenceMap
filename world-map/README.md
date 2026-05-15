# World Map

Interactive world map with real-time data overlays, drawing tools, and Mercator/Globe projection switching.

## Quick start

### 1. Server
```bash
cd server
npm install
cp .env.example .env   # fill in API keys as needed
npm run dev
```

### 2. Client
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

## Features
- Base map: OpenFreeMap vector tiles (no API key, no blank tiles)
- Flights: OpenSky Network ADS-B (free, optional auth for higher rate limits)
- Vessels: WebSocket stream via Node.js broker (mock data if no AIS key)
- Earthquakes: USGS GeoJSON feed (completely free, no auth)
- Weather: OpenWeatherMap WMS tiles (free tier key required)
- Conflict: ACLED events (free API key required, register at acleddata.com)
- Drawing: Point / line / polygon tools, synced across all connected clients via WebSocket
- Projection: Toggle between Mercator (flat) and Globe with atmosphere

## API keys needed (all free tiers available)
| Service | Required | Register at |
|---|---|---|
| OpenWeatherMap | Yes for weather layer | openweathermap.org |
| ACLED | Yes for conflict layer | acleddata.com |
| OpenSky | No (rate limited without) | opensky-network.org |
| AIS stream | No (mock data fallback) | aisstream.io |

## Architecture
- `server/` — Express + WebSocket broker. Proxies all external APIs (adds auth headers, CORS bypass, caching, bbox filtering).
- `client/` — MapLibre GL JS v4 + @maplibre/maplibre-gl-draw. Each overlay is an independent module with show/hide/toggle API.
- Drawings sync in real-time across clients via the WebSocket broker.

## Extending
- Add a new overlay: create `client/src/overlays/yourdata.js` following the same `{ show, hide, toggle }` interface, add a server route in `server/routes/`, register in `overlays/index.js`, and add a checkbox in `controls.js`.
- Persist drawings: replace the `Map()` in `server/routes/drawings.js` with a SQLite call using `better-sqlite3`.
- Add Deck.gl layers: install `@deck.gl/mapbox` and use `MapboxOverlay` in `map.js` for GPU-accelerated animated layers (TripsLayer for flight trails, HexagonLayer for density).
