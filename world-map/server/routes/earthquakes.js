import { Router } from 'express'

const router = Router()
let cache = null
let lastFetch = 0
const TTL = 60_000

router.get('/', async (req, res) => {
  const period = req.query.period || 'day'  // day | week | month

  if (cache && Date.now() - lastFetch < TTL) return res.json(cache)

  try {
    // USGS GeoJSON feed — completely free, no auth
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${period}.geojson`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`USGS ${response.status}`)
    cache = await response.json()
    lastFetch = Date.now()
    res.json(cache)
  } catch (e) {
    console.error('Earthquakes error:', e.message)
    res.status(502).json({ error: e.message })
  }
})

export default router
