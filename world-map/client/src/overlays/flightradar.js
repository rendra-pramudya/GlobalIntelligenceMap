import maplibregl from 'maplibre-gl'

// Top-down airplane icon — clean modern silhouette with glow
function makePlaneImage(color, size = 32) {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx  = size / 2
  const cy  = size / 2
  const s   = size / 32   // scale factor

  ctx.clearRect(0, 0, size, size)

  // Drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur    = 3 * s
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1.5 * s

  // ── Body path (nose-up orientation — rotation applied by MapLibre) ─────────
  ctx.save()
  ctx.translate(cx, cy)

  function plane(fillColor, strokeColor, lineW) {
    ctx.fillStyle   = fillColor
    ctx.strokeStyle = strokeColor
    ctx.lineWidth   = lineW

    // Fuselage — long thin teardrop, nose at top
    ctx.beginPath()
    ctx.moveTo(0, -13 * s)                          // nose tip
    ctx.bezierCurveTo( 2*s, -9*s,  2.8*s,  0,  2.2*s,  7*s)  // right side
    ctx.bezierCurveTo( 1.5*s, 10*s,  0,    11*s,   0,   11*s) // tail tip
    ctx.bezierCurveTo(-1.5*s, 10*s, -2.2*s,  7*s, -2.2*s,  7*s)
    ctx.bezierCurveTo(-2.8*s,  0,  -2*s,  -9*s,    0, -13*s)  // left side back to nose
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Main wings — swept back, slightly tapered
    ctx.beginPath()
    ctx.moveTo(-2*s,  -1*s)                  // left wing root leading edge
    ctx.lineTo(-13.5*s,  4*s)                // left wingtip leading
    ctx.lineTo(-12*s,   6.5*s)               // left wingtip trailing
    ctx.lineTo(-1.8*s,  3.5*s)               // left wing root trailing edge
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    ctx.beginPath()
    ctx.moveTo( 2*s,  -1*s)
    ctx.lineTo( 13.5*s,  4*s)
    ctx.lineTo( 12*s,   6.5*s)
    ctx.lineTo( 1.8*s,  3.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Horizontal stabilisers (tail fins)
    ctx.beginPath()
    ctx.moveTo(-1.5*s,  8*s)
    ctx.lineTo(-6.5*s, 11.5*s)
    ctx.lineTo(-5.8*s, 13*s)
    ctx.lineTo(-1.2*s, 10.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    ctx.beginPath()
    ctx.moveTo( 1.5*s,  8*s)
    ctx.lineTo( 6.5*s, 11.5*s)
    ctx.lineTo( 5.8*s, 13*s)
    ctx.lineTo( 1.2*s, 10.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }

  // Draw outline slightly larger for crisp edge
  ctx.shadowColor = 'transparent'
  plane('rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 0)

  ctx.shadowColor   = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur    = 3 * s
  ctx.shadowOffsetY = 1.5 * s

  // Main fill with subtle gradient
  const grad = ctx.createLinearGradient(-cx * 0.3, -cy * 0.8, cx * 0.3, cy * 0.5)
  grad.addColorStop(0, lighten(color, 0.35))
  grad.addColorStop(1, color)

  plane(grad, 'rgba(255,255,255,0.55)', 0.9 * s)

  ctx.restore()

  return ctx.getImageData(0, 0, size, size)
}

// Lighten a CSS colour by mixing with white
function lighten(hex, amount) {
  // Accept hex (#rrggbb) or named colours via a temp canvas
  const tmp = document.createElement('canvas')
  tmp.width = tmp.height = 1
  const t = tmp.getContext('2d')
  t.fillStyle = hex
  t.fillRect(0, 0, 1, 1)
  const [r, g, b] = t.getImageData(0, 0, 1, 1).data
  const mix = v => Math.round(v + (255 - v) * amount)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

function fmtAlt(alt) {
  if (alt == null) return '–'
  return alt > 100 ? `${Math.round(alt / 100) * 100} ft` : `${Math.round(alt)} ft`
}
function fmtSpd(v) { return v == null ? '–' : `${Math.round(v)} kt` }

// Fetch key from server once and cache it
let _keyPromise = null
function getFR24Key() {
  if (!_keyPromise) {
    _keyPromise = fetch('/api/flights/fr24-key')
      .then(r => r.json())
      .then(({ key }) => key || '')
      .catch(() => '')
  }
  return _keyPromise
}

export function initFlightradar(map) {
  const layerId   = 'flightradar-layer'
  const sourceId  = 'flightradar-source'
  const imageId   = 'plane-icon-fr24'
  const iconColor = '#44ccff'

  let visible  = false
  let interval = null
  let popup    = null

  // ── Icon registration ──────────────────────────────────────────────────────
  function ensureImage() {
    if (!map.hasImage(imageId)) {
      const img = makePlaneImage(iconColor)
      map.addImage(imageId, { width: img.width, height: img.height, data: img.data })
    }
  }
  map.on('styleimagemissing', (e) => { if (e.id === imageId) ensureImage() })
  map.on('style.load', ensureImage)
  ensureImage()

  // ── Source + layer ─────────────────────────────────────────────────────────
  map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: layerId, type: 'symbol', source: sourceId,
    layout: {
      visibility: 'none',
      'icon-image': imageId,
      'icon-size': 1,
      'icon-rotate': ['coalesce', ['get', 'heading'], 0],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  })

  // ── Click popup ────────────────────────────────────────────────────────────
  map.on('click', layerId, (e) => {
    const p      = e.features[0].properties
    const coords = e.features[0].geometry.coordinates.slice()
    const route  = (p.origin && p.destination)
      ? `${p.origin} → ${p.destination}`
      : (p.origin || p.destination || '–')

    const rows = [
      ['Callsign',  p.callsign || '–'],
      ['Flight',    p.flight !== p.callsign ? p.flight || '–' : null],
      ['Type',      p.type        || '–'],
      ['Reg',       p.reg         || '–'],
      ['Route',     route],
      ['Altitude',  fmtAlt(p.altitude)],
      ['Speed',     fmtSpd(p.velocity)],
      ['On ground', p.onGround ? 'Yes' : 'No'],
      ['Source',    'FlightRadar24']
    ].filter(([, v]) => v != null)

    popup?.remove()
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat(coords)
      .setHTML(`
        <div class="flight-popup">
          <div class="flight-popup-title">${p.callsign || 'Unknown'}</div>
          <table class="flight-popup-table">
            ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
          </table>
        </div>`)
      .addTo(map)
  })

  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })

  // ── Direct browser → FR24 API call ────────────────────────────────────────
  async function refresh() {
    try {
      const key = await getFR24Key()
      if (!key) { console.warn('FR24: no API key — check Settings'); return }

      const bb  = map.getBounds()
      // FR24 bounds format: north,south,west,east
      const N = Math.min(bb.getNorth(),  90).toFixed(4)
      const S = Math.max(bb.getSouth(), -90).toFixed(4)
      const W = Math.max(bb.getWest(), -180).toFixed(4)
      const E = Math.min(bb.getEast(),  180).toFixed(4)

      const url = `https://fr24api.flightradar24.com/api/live/flight-positions/full?bounds=${N},${S},${W},${E}&limit=1500`
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${key}`, 'Accept-Version': 'v1', 'Accept': 'application/json' }
      })

      if (!res.ok) {
        console.warn(`FR24: HTTP ${res.status}`)
        return
      }

      const { data } = await res.json()
      const features = (data || [])
        .filter(f => f.lat != null && f.lon != null)
        .map(f => ({
          type: 'Feature',
          id:   f.fr24_id || f.hex,
          geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
          properties: {
            callsign:    f.callsign || f.flight || '',
            flight:      f.flight || '',
            type:        f.type || '',
            reg:         f.reg || '',
            origin:      f.orig_iata || f.orig_icao || '',
            destination: f.dest_iata || f.dest_icao || '',
            altitude:    f.alt,
            velocity:    f.gspeed,
            heading:     f.track,
            onGround:    f.alt === 0 && f.gspeed === 0
          }
        }))

      console.debug(`FR24: ${features.length} flights in view`)
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData({ type: 'FeatureCollection', features })
      }
    } catch (e) {
      console.warn('FR24 fetch error:', e.message)
    }
  }

  map.on('moveend', () => { if (visible) refresh() })

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    get visible() { return visible },
    show() {
      visible  = true
      map.setLayoutProperty(layerId, 'visibility', 'visible')
      refresh()
      interval = setInterval(refresh, 15_000)
    },
    hide() {
      visible  = false
      map.setLayoutProperty(layerId, 'visibility', 'none')
      clearInterval(interval)
      popup?.remove()
      popup = null
    },
    toggle() { visible ? this.hide() : this.show() }
  }
}
