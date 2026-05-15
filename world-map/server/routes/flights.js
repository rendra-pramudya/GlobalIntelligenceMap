import { Router } from 'express'

const router = Router()
let cache = null
let lastFetch = 0
const TTL = 15_000 // 15 seconds

router.get('/', async (req, res) => {
  const { minLat = -90, maxLat = 90, minLon = -180, maxLon = 180 } = req.query

  if (cache && Date.now() - lastFetch < TTL) {
    return res.json(filterBbox(cache, +minLon, +minLat, +maxLon, +maxLat))
  }

  try {
    // OpenSky Network — free, no auth required for basic access
    const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`
    const response = await fetch(url, {
      headers: process.env.OPENSKY_USER
        ? { Authorization: 'Basic ' + btoa(`${process.env.OPENSKY_USER}:${process.env.OPENSKY_PASS}`) }
        : {}
    })

    if (!response.ok) throw new Error(`OpenSky ${response.status}`)

    const data = await response.json()
    cache = toFlightGeoJSON(data.states || [])
    lastFetch = Date.now()
    res.json(filterBbox(cache, +minLon, +minLat, +maxLon, +maxLat))
  } catch (e) {
    console.error('Flights error:', e.message)
    // Return mock data so client doesn't break
    res.json(generateMockFlights())
  }
})

function toFlightGeoJSON(states) {
  const features = states
    .filter(s => s[5] != null && s[6] != null)
    .map(s => ({
      type: 'Feature',
      id: s[0],
      geometry: { type: 'Point', coordinates: [s[5], s[6]] },
      properties: {
        callsign: (s[1] || '').trim(),
        origin: s[2],
        altitude: s[7],
        velocity: s[9],
        heading: s[10],
        onGround: s[8]
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
    properties: { callsign: `FL${String(i).padStart(3,'0')}`, altitude: 10000 + Math.random() * 5000, heading: Math.random() * 360 }
  }))
  return { type: 'FeatureCollection', features }
}

export default router
