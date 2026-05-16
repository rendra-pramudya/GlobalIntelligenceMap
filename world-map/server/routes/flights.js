import { Router } from 'express'
import { getConfig } from '../config.js'

const router = Router()
const TTL = 15_000

const caches    = { opensky: null, fr24: null }
const lastFetch = { opensky: 0,    fr24: 0    }

router.get('/', async (req, res) => {
  const { minLat = -90, maxLat = 90, minLon = -180, maxLon = 180, source } = req.query
  const key = source === 'fr24' ? 'fr24' : 'opensky'

  if (caches[key] && Date.now() - lastFetch[key] < TTL) {
    return res.json(filterBbox(caches[key], +minLon, +minLat, +maxLon, +maxLat))
  }

  try {
    const cfg = getConfig()
    const geojson = key === 'fr24'
      ? await fetchFR24(cfg, +minLat, +maxLat, +minLon, +maxLon)
      : await fetchOpenSky(cfg, +minLat, +maxLat, +minLon, +maxLon)

    caches[key]    = geojson
    lastFetch[key] = Date.now()
    res.json(filterBbox(geojson, +minLon, +minLat, +maxLon, +maxLat))
  } catch (e) {
    console.error(`Flights (${key}) error:`, e.message)
    if (caches[key]) return res.json(filterBbox(caches[key], +minLon, +minLat, +maxLon, +maxLat))
    res.status(502).json({ error: e.message })
  }
})

// ── FlightRadar24 ─────────────────────────────────────────────────────────────
// Uses the unofficial public data feed (same one the FR24 website uses).
// No API key required. Bounds order: north,south,west,east.
async function fetchFR24(cfg, minLat, maxLat, minLon, maxLon) {
  // If the user supplied a paid fr24api.com key, prefer the official endpoint.
  if (cfg.FR24_API_KEY) {
    return fetchFR24Official(cfg.FR24_API_KEY, minLat, maxLat, minLon, maxLon)
  }
  return fetchFR24Feed(minLat, maxLat, minLon, maxLon)
}

async function fetchFR24Feed(minLat, maxLat, minLon, maxLon) {
  // FR24 feed uses north,south,west,east (maxLat,minLat,minLon,maxLon)
  const bounds = `${maxLat},${minLat},${minLon},${maxLon}`
  const params = `bounds=${bounds}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=1&estimated=1&maxage=14400&gliders=1&stats=1`
  const url    = `https://data-live.flightradar24.com/zones/fcgi/feed.js?${params}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept':     'application/json, text/javascript, */*',
      'Referer':    'https://www.flightradar24.com/',
      'Origin':     'https://www.flightradar24.com'
    }
  })
  if (!response.ok) throw new Error(`FR24 feed HTTP ${response.status}`)
  const data = await response.json()
  return fr24FeedToGeoJSON(data)
}

// Response: { full_count, version, stats, "<id>": [icao,lat,lon,hdg,alt,spd,sqwk,radar,type,reg,time,orig,dest,flight,onGnd,vspd,callsign,...] }
function fr24FeedToGeoJSON(data) {
  const features = []
  for (const [id, vals] of Object.entries(data)) {
    if (!Array.isArray(vals)) continue          // skip full_count, version, stats
    if (vals[1] == null || vals[2] == null) continue
    features.push({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [vals[2], vals[1]] },
      properties: {
        callsign:    String(vals[16] || vals[13] || '').trim(),
        flight:      String(vals[13] || '').trim(),
        type:        vals[8]  || '',
        reg:         vals[9]  || '',
        origin:      vals[11] || '',
        destination: vals[12] || '',
        altitude:    vals[4],
        velocity:    vals[5],
        heading:     vals[3],
        onGround:    vals[14] === 1,
        source:      'fr24'
      }
    })
  }
  return { type: 'FeatureCollection', features }
}

async function fetchFR24Official(apiKey, minLat, maxLat, minLon, maxLon) {
  const bounds   = `${minLat},${maxLat},${minLon},${maxLon}`
  const url      = `https://fr24api.com/api/live/flight-positions/full?bounds=${bounds}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept-Version': 'v1' }
  })
  if (!response.ok) throw new Error(`FR24 API HTTP ${response.status}: ${await response.text()}`)
  const { data } = await response.json()
  return fr24OfficialToGeoJSON(data || [])
}

function fr24OfficialToGeoJSON(flights) {
  return {
    type: 'FeatureCollection',
    features: flights
      .filter(f => f.lat != null && f.lon != null)
      .map(f => ({
        type: 'Feature',
        id: f.fr24_id || f.hex,
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: {
          callsign:    f.callsign || f.flight || '',
          flight:      f.flight  || '',
          type:        f.type    || '',
          reg:         f.reg     || '',
          origin:      f.orig_iata || f.orig_icao || '',
          destination: f.dest_iata || f.dest_icao || '',
          altitude:    f.alt,
          velocity:    f.gspeed,
          heading:     f.track,
          onGround:    f.alt === 0 && f.gspeed === 0,
          source:      'fr24'
        }
      }))
  }
}

// ── OpenSky Network ───────────────────────────────────────────────────────────
async function fetchOpenSky(cfg, minLat, maxLat, minLon, maxLon) {
  const url      = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`
  const response = await fetch(url, {
    headers: cfg.OPENSKY_USER
      ? { Authorization: 'Basic ' + btoa(`${cfg.OPENSKY_USER}:${cfg.OPENSKY_PASS}`) }
      : {}
  })
  if (!response.ok) throw new Error(`OpenSky HTTP ${response.status}`)
  const data = await response.json()
  return openSkyToGeoJSON(data.states || [])
}

function openSkyToGeoJSON(states) {
  return {
    type: 'FeatureCollection',
    features: states
      .filter(s => s[5] != null && s[6] != null)
      .map(s => ({
        type: 'Feature',
        id: s[0],
        geometry: { type: 'Point', coordinates: [s[5], s[6]] },
        properties: {
          callsign:    (s[1] || '').trim(),
          flight:      (s[1] || '').trim(),
          type:        '',
          reg:         '',
          origin:      s[2] || '',
          destination: '',
          altitude:    s[7],
          velocity:    s[9],
          heading:     s[10],
          onGround:    s[8],
          source:      'opensky'
        }
      }))
  }
}

function filterBbox(geojson, minLon, minLat, maxLon, maxLat) {
  return {
    ...geojson,
    features: geojson.features.filter(f => {
      const [lon, lat] = f.geometry.coordinates
      return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
    })
  }
}

export default router
