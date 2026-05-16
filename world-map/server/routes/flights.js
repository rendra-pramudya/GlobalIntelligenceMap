import { Router } from 'express'
import { getConfig } from '../config.js'

const router = Router()
const TTL = 15_000

// Separate caches per source so toggling one doesn't invalidate the other
const caches = { opensky: null, fr24: null }
const lastFetch = { opensky: 0, fr24: 0 }

router.get('/', async (req, res) => {
  const { minLat = -90, maxLat = 90, minLon = -180, maxLon = 180, source } = req.query
  const cfg = getConfig()

  // Determine which source to use
  const useFR24 = source === 'fr24' || (!source && cfg.FR24_API_KEY)
  const key = useFR24 ? 'fr24' : 'opensky'

  if (caches[key] && Date.now() - lastFetch[key] < TTL) {
    return res.json(filterBbox(caches[key], +minLon, +minLat, +maxLon, +maxLat))
  }

  try {
    let geojson
    if (useFR24) {
      if (!cfg.FR24_API_KEY) return res.status(503).json({ error: 'FR24_API_KEY not configured' })
      geojson = await fetchFR24(cfg.FR24_API_KEY, +minLat, +maxLat, +minLon, +maxLon)
    } else {
      geojson = await fetchOpenSky(cfg.OPENSKY_USER, cfg.OPENSKY_PASS, +minLat, +maxLat, +minLon, +maxLon)
    }
    caches[key] = geojson
    lastFetch[key] = Date.now()
    res.json(filterBbox(caches[key], +minLon, +minLat, +maxLon, +maxLat))
  } catch (e) {
    console.error(`Flights (${key}) error:`, e.message)
    if (caches[key]) return res.json(filterBbox(caches[key], +minLon, +minLat, +maxLon, +maxLat))
    res.status(502).json({ error: e.message })
  }
})

// ── FlightRadar24 API ────────────────────────────────────────────────────────
async function fetchFR24(apiKey, minLat, maxLat, minLon, maxLon) {
  const bounds = `${minLat},${maxLat},${minLon},${maxLon}`
  const url = `https://fr24api.com/api/live/flight-positions/full?bounds=${bounds}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept-Version': 'v1' }
  })
  if (!response.ok) throw new Error(`FR24 ${response.status}: ${await response.text()}`)
  const { data } = await response.json()
  return fr24ToGeoJSON(data || [])
}

function fr24ToGeoJSON(flights) {
  const features = flights
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
  return { type: 'FeatureCollection', features }
}

// ── OpenSky Network ──────────────────────────────────────────────────────────
async function fetchOpenSky(user, pass, minLat, maxLat, minLon, maxLon) {
  const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`
  const response = await fetch(url, {
    headers: user ? { Authorization: 'Basic ' + btoa(`${user}:${pass}`) } : {}
  })
  if (!response.ok) throw new Error(`OpenSky ${response.status}`)
  const data = await response.json()
  return openSkyToGeoJSON(data.states || [])
}

function openSkyToGeoJSON(states) {
  const features = states
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
  return { type: 'FeatureCollection', features }
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
