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
    apis: { earthquakes, 'flights (opensky)': flights.opensky, 'flights (fr24)': flights.fr24, weather, conflict, vessels }
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
  // Probe both sources independently and return combined result
  const [opensky, fr24] = await Promise.all([probeOpenSky(cfg), probeFR24Feed(cfg)])
  return { opensky, fr24 }
}

async function probeOpenSky(cfg) {
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
      features: json.states?.length ?? 0
    }
  })
}

async function probeFR24Feed(cfg) {
  // FR24 unofficial feed — no key needed. bounds: north,south,west,east
  const feedResult = await timed(async () => {
    const url = 'https://data-live.flightradar24.com/zones/fcgi/feed.js?bounds=55,45,5,15&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=1&estimated=1&maxage=14400&gliders=1'
    const r = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'application/json',
        'Referer':    'https://www.flightradar24.com/',
        'Origin':     'https://www.flightradar24.com'
      }
    })
    if (!r.ok) throw new Error(`FR24 feed HTTP ${r.status}`)
    const json = await r.json()
    const count = Object.values(json).filter(Array.isArray).length
    return { status: 'ok', source: 'fr24 (public feed)', configured: true, features: count }
  })

  // If user also has an official key, probe that too and note it
  if (cfg.FR24_API_KEY) {
    const officialResult = await timed(async () => {
      const url = 'https://fr24api.com/api/live/flight-positions/full?bounds=45,55,5,15'
      const r = await fetchWithTimeout(url, {
        headers: { 'Authorization': `Bearer ${cfg.FR24_API_KEY}`, 'Accept-Version': 'v1' }
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        throw new Error(`FR24 official API HTTP ${r.status}: ${body.slice(0, 120)}`)
      }
      const json = await r.json()
      return { status: 'ok', source: 'fr24api.com (official)', configured: true, features: countFeatures(json) }
    })
    feedResult.official_api = officialResult
  }

  return feedResult
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
