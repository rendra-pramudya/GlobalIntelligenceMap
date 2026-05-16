import { Router } from 'express'
import { getConfig } from '../config.js'

const router = Router()
let cache = null
let lastFetch = 0
const TTL = 15_000 // 15 seconds

router.get('/', async (req, res) => {
  const { minLat = -90, maxLat = 90, minLon = -180, maxLon = 180 } = req.query

  if (cache && Date.now() - lastFetch < TTL) {
    return res.json(filterBbox(cache, +minLon, +minLat, +maxLon, +maxLat))
  }

  const { FR24_API_KEY, OPENSKY_USER, OPENSKY_PASS } = getConfig()

  try {
    let geojson
    if (FR24_API_KEY) {
      geojson = await fetchFR24(FR24_API_KEY, +minLat, +maxLat, +minLon, +maxLon)
    } else {
      geojson = await fetchOpenSky(OPENSKY_USER, OPENSKY_PASS, +minLat, +maxLat, +minLon, +maxLon)
    }
    cache = geojson
    lastFetch = Date.now()
    res.json(filterBbox(cache, +minLon, +minLat, +maxLon, +maxLat))
  } catch (e) {
    console.error('Flights error:', e.message)
    if (cache) return res.json(filterBbox(cache, +minLon, +minLat, +maxLon, +maxLat))
    res.json(generateMockFlights())
  }
})

// ── FlightRadar24 API ────────────────────────────────────────────────────────
async function fetchFR24(apiKey, minLat, maxLat, minLon, maxLon) {
  const bounds = `${minLat},${maxLat},${minLon},${maxLon}`
  const url = `https://fr24api.com/api/live/flight-positions/full?bounds=${bounds}`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept-Version': 'v1'
    }
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

function generateMockFlights() {
  const features = Array.from({ length: 60 }, (_, i) => ({
    type: 'Feature',
    id: `FL${i}`,
    geometry: {
      type: 'Point',
      coordinates: [(Math.random() - 0.5) * 360, (Math.random() - 0.5) * 140]
    },
    properties: {
      callsign: `FL${String(i).padStart(3, '0')}`,
      flight: `FL${String(i).padStart(3, '0')}`,
      type: ['B738', 'A320', 'B77W'][i % 3],
      reg: '',
      origin: '',
      destination: '',
      altitude: 10000 + Math.random() * 5000,
      velocity: 400 + Math.random() * 200,
      heading: Math.random() * 360,
      onGround: false,
      source: 'mock'
    }
  }))
  return { type: 'FeatureCollection', features }
}

export default router
