import { Router } from 'express'
import { getConfig } from '../config.js'

const router = Router()
const TIMEOUT = 8_000  // 8 s per probe

// Cache to avoid hammering external APIs on repeated debug clicks
let lastResult = null
let lastRun    = 0
const CACHE_TTL = 20_000

router.get('/', async (req, res) => {
  const force = req.query.force === '1'
  if (!force && lastResult && Date.now() - lastRun < CACHE_TTL) {
    return res.json({ ...lastResult, cached: true })
  }

  const cfg = getConfig()

  const [earthquakes, flights, weather, conflict, vessels] = await Promise.all([
    probeEarthquakes(),
    probeFlights(cfg),
    probeWeather(cfg),
    probeConflict(cfg),
    probeVessels(cfg)
  ])

  lastResult = {
    timestamp: new Date().toISOString(),
    cached: false,
    config: {
      FR24_API_KEY:  !!cfg.FR24_API_KEY,
      OPENSKY_USER:  !!cfg.OPENSKY_USER,
      AIS_API_KEY:   !!cfg.AIS_API_KEY,
      AIS_API_URL:   !!cfg.AIS_API_URL,
      OWM_API_KEY:   !!cfg.OWM_API_KEY,
      ACLED_KEY:     !!cfg.ACLED_KEY,
      ACLED_EMAIL:   !!cfg.ACLED_EMAIL
    },
    apis: { earthquakes, flights, weather, conflict, vessels }
  }
  lastRun = Date.now()
  res.json(lastResult)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function timed(fn) {
  const t0 = Date.now()
  try {
    const result = await fn()
    return { ...result, time_ms: Date.now() - t0, error: null }
  } catch (e) {
    return { status: 'error', time_ms: Date.now() - t0, error: e.message, features: null }
  }
}

function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), TIMEOUT)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id))
}

function countFeatures(json) {
  if (Array.isArray(json)) return json.length
  if (json?.features) return json.features.length
  if (json?.data)     return Array.isArray(json.data) ? json.data.length : null
  if (json?.states)   return json.states.length
  return null
}

// ── Per-API probes ────────────────────────────────────────────────────────────

async function probeEarthquakes() {
  return timed(async () => {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
    const r = await fetchWithTimeout(url)
    if (!r.ok) throw new Error(`USGS HTTP ${r.status}`)
    const json = await r.json()
    return { status: 'ok', source: 'usgs', configured: true, features: countFeatures(json) }
  })
}

async function probeFlights(cfg) {
  if (cfg.FR24_API_KEY) {
    return timed(async () => {
      // Small bounding box over central Europe to keep response light
      const url = 'https://fr24api.com/api/live/flight-positions/full?bounds=45,55,5,15'
      const r = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${cfg.FR24_API_KEY}`, 'Accept-Version': 'v1' }
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        throw new Error(`FR24 HTTP ${r.status}: ${body.slice(0, 120)}`)
      }
      const json = await r.json()
      return { status: 'ok', source: 'flightradar24', configured: true, features: countFeatures(json) }
    })
  }

  // OpenSky — same small bbox
  return timed(async () => {
    const url = 'https://opensky-network.org/api/states/all?lamin=45&lomin=5&lamax=55&lomax=15'
    const headers = cfg.OPENSKY_USER
      ? { Authorization: 'Basic ' + Buffer.from(`${cfg.OPENSKY_USER}:${cfg.OPENSKY_PASS}`).toString('base64') }
      : {}
    const r = await fetchWithTimeout(url, { headers })
    if (!r.ok) throw new Error(`OpenSky HTTP ${r.status}`)
    const json = await r.json()
    return {
      status: 'ok',
      source: cfg.OPENSKY_USER ? 'opensky (authenticated)' : 'opensky (anonymous)',
      configured: !!cfg.OPENSKY_USER,
      features: countFeatures(json)
    }
  })
}

async function probeWeather(cfg) {
  if (!cfg.OWM_API_KEY) {
    return { status: 'unconfigured', source: 'openweathermap', configured: false,
             time_ms: 0, features: null, error: 'OWM_API_KEY not set' }
  }
  return timed(async () => {
    // Fetch a single tile to verify the key
    const url = `https://tile.openweathermap.org/map/precipitation_new/1/1/0.png?appid=${cfg.OWM_API_KEY}`
    const r = await fetchWithTimeout(url)
    if (!r.ok) throw new Error(`OWM HTTP ${r.status} — key may be invalid or not yet activated`)
    return { status: 'ok', source: 'openweathermap', configured: true, features: null }
  })
}

async function probeConflict(cfg) {
  if (!cfg.ACLED_KEY || !cfg.ACLED_EMAIL) {
    return { status: 'unconfigured', source: 'acled', configured: false,
             time_ms: 0, features: null, error: 'ACLED_KEY / ACLED_EMAIL not set — showing mock data' }
  }
  return timed(async () => {
    const url = new URL('https://api.acleddata.com/acled/read')
    url.searchParams.set('key',    cfg.ACLED_KEY)
    url.searchParams.set('email',  cfg.ACLED_EMAIL)
    url.searchParams.set('limit',  '5')   // minimal pull
    url.searchParams.set('fields', 'event_id_cnty')
    const r = await fetchWithTimeout(url.toString())
    const json = await r.json()
    if (json.status === 0 || json.error) throw new Error(json.error || 'ACLED API error')
    return { status: 'ok', source: 'acled', configured: true, features: json.count ?? countFeatures(json) }
  })
}

async function probeVessels(cfg) {
  if (!cfg.AIS_API_KEY) {
    return { status: 'unconfigured', source: 'aisstream', configured: false,
             time_ms: 0, features: null, error: 'AIS_API_KEY not set — showing mock vessel data' }
  }
  // AIS is WebSocket-only — just verify the key is set and return configured status
  return { status: 'configured', source: 'aisstream', configured: true,
           time_ms: 0, features: null, error: null,
           note: 'AIS uses WebSocket; key is configured. Check server logs for connection errors.' }
}

export default router
