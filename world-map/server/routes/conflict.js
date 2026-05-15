import { Router } from 'express'

const router = Router()
let cache = null
let lastFetch = 0
const TTL = 3_600_000 // 1 hour — conflict data changes slowly

router.get('/', async (req, res) => {
  if (cache && Date.now() - lastFetch < TTL) return res.json(cache)

  try {
    if (!process.env.ACLED_KEY || !process.env.ACLED_EMAIL) {
      // Return mock data if no ACLED credentials
      return res.json(generateMockConflict())
    }

    const url = new URL('https://api.acleddata.com/acled/read')
    url.searchParams.set('key', process.env.ACLED_KEY)
    url.searchParams.set('email', process.env.ACLED_EMAIL)
    url.searchParams.set('limit', '1000')
    url.searchParams.set('fields', 'latitude:longitude:event_type:fatalities:event_date:country')

    const response = await fetch(url.toString())
    const data = await response.json()
    cache = toConflictGeoJSON(data.data || [])
    lastFetch = Date.now()
    res.json(cache)
  } catch (e) {
    console.error('Conflict error:', e.message)
    res.json(generateMockConflict())
  }
})

function toConflictGeoJSON(events) {
  const features = events
    .filter(e => e.latitude && e.longitude)
    .map(e => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+e.longitude, +e.latitude] },
      properties: { type: e.event_type, fatalities: +e.fatalities, date: e.event_date, country: e.country }
    }))
  return { type: 'FeatureCollection', features }
}

function generateMockConflict() {
  const types = ['Battles', 'Explosions', 'Protests', 'Violence against civilians']
  const features = Array.from({ length: 200 }, (_, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [(Math.random() - 0.5) * 200, (Math.random() - 0.5) * 120] },
    properties: { type: types[i % 4], fatalities: Math.floor(Math.random() * 50), date: '2024-01-01', country: 'Unknown' }
  }))
  return { type: 'FeatureCollection', features }
}

export default router
