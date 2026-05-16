import { Router } from 'express'
import { getConfig } from '../config.js'

const router = Router()

// Expose FR24 key to the browser so it can call fr24api.com directly
// (the server environment cannot reach fr24api.com outbound)
router.get('/fr24-key', (req, res) => {
  const cfg = getConfig()
  res.json({ key: cfg.FR24_API_KEY || '' })
})

// Per-source state
const state = {
  opensky: { cache: null, fetchedAt: 0, backoffUntil: 0, ttl: 60_000 },
  fr24:    { cache: null, fetchedAt: 0, backoffUntil: 0, ttl: 30_000 }
}

router.get('/', async (req, res) => {
  const { minLat = -90, maxLat = 90, minLon = -180, maxLon = 180, source } = req.query
  const key = source === 'fr24' ? 'fr24' : 'opensky'
  const s   = state[key]
  const now = Date.now()

  // Serve cache if still fresh or if in backoff
  if (s.cache && (now - s.fetchedAt < s.ttl || now < s.backoffUntil)) {
    return res.json(filterBbox(s.cache, +minLon, +minLat, +maxLon, +maxLat))
  }

  try {
    const cfg     = getConfig()
    const geojson = key === 'fr24'
      ? await fetchDetailed(cfg, +minLat, +maxLat, +minLon, +maxLon)
      : await fetchOpenSky(cfg, +minLat, +maxLat, +minLon, +maxLon)

    s.cache     = geojson
    s.fetchedAt = now
    res.json(filterBbox(geojson, +minLon, +minLat, +maxLon, +maxLat))
  } catch (e) {
    const code = e.httpStatus

    if (code === 429) {
      // Back off for 5 minutes on rate-limit; extend TTL to 2 min going forward
      s.backoffUntil = now + 5 * 60_000
      s.ttl          = 120_000
      console.warn(`Flights (${key}): rate-limited (429) — backing off 5 min`)
    } else {
      console.warn(`Flights (${key}) error: ${e.message}`)
    }

    if (s.cache) return res.json(filterBbox(s.cache, +minLon, +minLat, +maxLon, +maxLat))
    res.status(code || 502).json({ error: e.message })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.httpStatus = status }
}

function fetchWithTimeout(url, opts = {}, ms = 8_000) {
  const ctrl = new AbortController()
  const id   = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id))
}

// ── Detailed source ───────────────────────────────────────────────────────────

async function fetchDetailed(cfg, minLat, maxLat, minLon, maxLon) {
  if (cfg.FR24_API_KEY) {
    return fetchFR24Official(cfg.FR24_API_KEY, minLat, maxLat, minLon, maxLon)
  }
  // Try opendata.adsb.fi first, fall back to api.adsb.lol
  try {
    return await fetchADSBFi(minLat, maxLat, minLon, maxLon)
  } catch {
    return await fetchADSBLol(minLat, maxLat, minLon, maxLon)
  }
}

function bboxToCircle(minLat, maxLat, minLon, maxLon) {
  const lat  = (minLat + maxLat) / 2
  const lon  = (minLon + maxLon) / 2
  const latNm = (maxLat - minLat) * 60 / 2
  const lonNm = (maxLon - minLon) * 60 / 2 * Math.cos(lat * Math.PI / 180)
  const dist  = Math.min(Math.ceil(Math.max(latNm, lonNm, 50)), 250)
  return { lat: lat.toFixed(4), lon: lon.toFixed(4), dist }
}

async function fetchADSBFi(minLat, maxLat, minLon, maxLon) {
  const { lat, lon, dist } = bboxToCircle(minLat, maxLat, minLon, maxLon)
  const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}/`
  const r   = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
  if (r.status === 429) throw new HttpError(429, 'adsb.fi rate limited')
  if (!r.ok) throw new HttpError(r.status, `adsb.fi HTTP ${r.status}`)
  const { aircraft } = await r.json()
  console.log(`adsb.fi: ${(aircraft || []).length} aircraft near ${lat},${lon}`)
  return adsbToGeoJSON(aircraft || [], 'adsb.fi')
}

async function fetchADSBLol(minLat, maxLat, minLon, maxLon) {
  const { lat, lon, dist } = bboxToCircle(minLat, maxLat, minLon, maxLon)
  const url = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}/`
  const r   = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
  if (r.status === 429) throw new HttpError(429, 'adsb.lol rate limited')
  if (!r.ok) throw new HttpError(r.status, `adsb.lol HTTP ${r.status}`)
  const { ac } = await r.json()
  console.log(`adsb.lol: ${(ac || []).length} aircraft near ${lat},${lon}`)
  return adsbToGeoJSON(ac || [], 'adsb.lol')
}

function adsbToGeoJSON(ac, sourceName) {
  return {
    type: 'FeatureCollection',
    features: ac
      .filter(a => a.lat != null && a.lon != null)
      .map(a => ({
        type: 'Feature',
        id:   a.hex,
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: {
          callsign:    (a.flight || '').trim(),
          flight:      (a.flight || '').trim(),
          type:        a.t    || a.type || '',
          reg:         a.r    || '',
          origin:      a.orig || '',
          destination: a.dest || '',
          altitude:    typeof a.alt_baro === 'number' ? a.alt_baro : null,
          velocity:    a.gs,
          heading:     a.track,
          onGround:    a.alt_baro === 'ground',
          source:      sourceName
        }
      }))
  }
}

// ── FR24 official ─────────────────────────────────────────────────────────────

async function fetchFR24Official(apiKey, minLat, maxLat, minLon, maxLon) {
  // FR24 bounds: north,south,west,east
  const url = `https://fr24api.flightradar24.com/api/live/flight-positions/full?bounds=${maxLat},${minLat},${minLon},${maxLon}&limit=1500`
  const r   = await fetchWithTimeout(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept-Version': 'v1', 'Accept': 'application/json' }
  })
  if (r.status === 429) throw new HttpError(429, 'FR24 rate limited')
  if (!r.ok) throw new HttpError(r.status, `FR24 official HTTP ${r.status}: ${await r.text()}`)
  const { data } = await r.json()
  return {
    type: 'FeatureCollection',
    features: (data || [])
      .filter(f => f.lat != null && f.lon != null)
      .map(f => ({
        type: 'Feature', id: f.fr24_id || f.hex,
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: {
          callsign: f.callsign || f.flight || '', flight: f.flight || '',
          type: f.type || '', reg: f.reg || '',
          origin: f.orig_iata || f.orig_icao || '',
          destination: f.dest_iata || f.dest_icao || '',
          altitude: f.alt, velocity: f.gspeed, heading: f.track,
          onGround: f.alt === 0 && f.gspeed === 0, source: 'fr24'
        }
      }))
  }
}

// ── OpenSky Network ───────────────────────────────────────────────────────────

async function fetchOpenSky(cfg, minLat, maxLat, minLon, maxLon) {
  const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`
  const r   = await fetchWithTimeout(url, {
    headers: cfg.OPENSKY_USER
      ? { Authorization: 'Basic ' + btoa(`${cfg.OPENSKY_USER}:${cfg.OPENSKY_PASS}`) }
      : {}
  })
  if (r.status === 429) throw new HttpError(429, 'OpenSky rate limited — add credentials in Settings for higher limits')
  if (!r.ok) throw new HttpError(r.status, `OpenSky HTTP ${r.status}`)
  const data = await r.json()
  return {
    type: 'FeatureCollection',
    features: (data.states || [])
      .filter(s => s[5] != null && s[6] != null)
      .map(s => ({
        type: 'Feature', id: s[0],
        geometry: { type: 'Point', coordinates: [s[5], s[6]] },
        properties: {
          callsign: (s[1] || '').trim(), flight: (s[1] || '').trim(),
          type: '', reg: '', origin: s[2] || '', destination: '',
          altitude: s[7], velocity: s[9], heading: s[10],
          onGround: s[8], source: 'opensky'
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
