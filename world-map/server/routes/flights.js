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
    const cfg     = getConfig()
    const geojson = key === 'fr24'
      ? await fetchDetailed(cfg, +minLat, +maxLat, +minLon, +maxLon)
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

// ── Detailed source (FR24 official → adsb.lol fallback) ───────────────────────
async function fetchDetailed(cfg, minLat, maxLat, minLon, maxLon) {
  if (cfg.FR24_API_KEY) {
    return fetchFR24Official(cfg.FR24_API_KEY, minLat, maxLat, minLon, maxLon)
  }
  return fetchADSBLol(minLat, maxLat, minLon, maxLon)
}

// ADS-B Exchange via adsb.lol — free, no key, works server-side, global coverage.
// Uses a centre-point + radius query converted from the viewport bbox.
async function fetchADSBLol(minLat, maxLat, minLon, maxLon) {
  const lat    = ((minLat + maxLat) / 2).toFixed(4)
  const lon    = ((minLon + maxLon) / 2).toFixed(4)
  // Rough nm radius: 1° lat ≈ 60 nm; adjust for longitude compression
  const latNm  = (maxLat - minLat) * 60 / 2
  const lonNm  = (maxLon - minLon) * 60 / 2 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const dist   = Math.min(Math.ceil(Math.max(latNm, lonNm, 50)), 250)

  const url      = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}/`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`adsb.lol HTTP ${response.status}`)
  const { ac } = await response.json()
  console.log(`adsb.lol: ${(ac || []).length} aircraft at lat=${lat} lon=${lon} dist=${dist}nm`)
  return adsbLolToGeoJSON(ac || [])
}

function adsbLolToGeoJSON(ac) {
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
          source:      'adsb.lol'
        }
      }))
  }
}

// ── FR24 official API (fr24api.com) ──────────────────────────────────────────
async function fetchFR24Official(apiKey, minLat, maxLat, minLon, maxLon) {
  const bounds   = `${minLat},${maxLat},${minLon},${maxLon}`
  const url      = `https://fr24api.com/api/live/flight-positions/full?bounds=${bounds}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept-Version': 'v1' }
  })
  if (!response.ok) throw new Error(`FR24 official API HTTP ${response.status}: ${await response.text()}`)
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
        id:   f.fr24_id || f.hex,
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
