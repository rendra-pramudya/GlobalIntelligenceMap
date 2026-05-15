import { Router } from 'express'

const router = Router()

// Proxies WMS tile requests to add API key server-side
// Supports OpenWeatherMap tile layers
router.get('/tile/:layer/:z/:x/:y', async (req, res) => {
  const { layer, z, x, y } = req.params
  const apiKey = process.env.OWM_API_KEY

  if (!apiKey) {
    return res.status(503).json({ error: 'OWM_API_KEY not configured' })
  }

  try {
    const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${apiKey}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`OWM ${response.status}`)

    const buffer = await response.arrayBuffer()
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=300')
    res.send(Buffer.from(buffer))
  } catch (e) {
    console.error('Weather tile error:', e.message)
    res.status(502).json({ error: e.message })
  }
})

export default router
