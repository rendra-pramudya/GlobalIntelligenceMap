import maplibregl from 'maplibre-gl'

// Inline plane icon (same shape as flightLayer.js but cyan)
function makePlaneImage(color, size = 22) {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const h = size / 2

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle   = color
  ctx.strokeStyle = '#222'
  ctx.lineWidth   = 0.7

  ctx.beginPath()
  ctx.ellipse(h, h, 2.5, h - 1, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(h,        h - 1)
  ctx.lineTo(1,        h + 4)
  ctx.lineTo(h,        h + 1)
  ctx.lineTo(size - 1, h + 4)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(h,        size - 2)
  ctx.lineTo(3,        size - 5)
  ctx.lineTo(h,        size - 4)
  ctx.lineTo(size - 3, size - 5)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  return ctx.getImageData(0, 0, size, size)
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
