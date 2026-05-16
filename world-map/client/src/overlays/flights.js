import maplibregl from 'maplibre-gl'

const LAYER_ID   = 'flights-layer'
const SOURCE_ID  = 'flights-source'
const IMAGE_ID   = 'plane-icon'

// Generate a simple upward-pointing plane silhouette as a canvas image.
// MapLibre will rotate it via icon-rotate based on the flight heading.
function makePlaneImage(size = 22) {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const h = size / 2

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle   = '#f0c040'
  ctx.strokeStyle = '#333'
  ctx.lineWidth   = 0.7

  // Fuselage
  ctx.beginPath()
  ctx.ellipse(h, h, 2.5, h - 1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Wings
  ctx.beginPath()
  ctx.moveTo(h,     h - 1)
  ctx.lineTo(1,     h + 4)
  ctx.lineTo(h,     h + 1)
  ctx.lineTo(size - 1, h + 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Tail fins
  ctx.beginPath()
  ctx.moveTo(h,     size - 2)
  ctx.lineTo(3,     size - 5)
  ctx.lineTo(h,     size - 4)
  ctx.lineTo(size - 3, size - 5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  return ctx.getImageData(0, 0, size, size)
}

function fmtAlt(alt) {
  if (alt == null) return '–'
  return alt > 100 ? `${Math.round(alt / 100) * 100} ft` : `${Math.round(alt)} ft`
}

function fmtSpd(v) {
  if (v == null) return '–'
  return `${Math.round(v)} kt`
}

export function initFlights(map) {
  let visible = false
  let interval = null
  let popup = null

  // Register plane icon once the map style is ready
  function ensurePlaneImage() {
    if (!map.hasImage(IMAGE_ID)) map.addImage(IMAGE_ID, makePlaneImage())
  }
  map.on('style.load', ensurePlaneImage)
  ensurePlaneImage()

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      visibility: 'none',
      'icon-image': IMAGE_ID,
      'icon-size': 1,
      'icon-rotate': ['coalesce', ['get', 'heading'], 0],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  })

  // ── Click popup ────────────────────────────────────────────────────────────
  map.on('click', LAYER_ID, (e) => {
    const p = e.features[0].properties
    const coords = e.features[0].geometry.coordinates.slice()

    const route = (p.origin && p.destination)
      ? `${p.origin} → ${p.destination}`
      : (p.origin || p.destination || '–')

    const rows = [
      ['Callsign',    p.callsign    || '–'],
      ['Flight',      p.flight !== p.callsign ? p.flight || '–' : null],
      ['Type',        p.type        || '–'],
      ['Reg',         p.reg         || '–'],
      ['Route',       route],
      ['Altitude',    fmtAlt(p.altitude)],
      ['Speed',       fmtSpd(p.velocity)],
      ['On ground',   p.onGround ? 'Yes' : 'No'],
      ['Source',      p.source      || '–']
    ].filter(([, v]) => v != null)

    const html = `
      <div class="flight-popup">
        <div class="flight-popup-title">${p.callsign || 'Unknown'}</div>
        <table class="flight-popup-table">
          ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
        </table>
      </div>`

    popup?.remove()
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map)
  })

  map.on('mouseenter', LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', LAYER_ID, () => { map.getCanvas().style.cursor = '' })

  // ── Data fetch ─────────────────────────────────────────────────────────────
  async function refresh() {
    const bbox = map.getBounds()
    const params = new URLSearchParams({
      minLat: bbox.getSouth(),
      maxLat: bbox.getNorth(),
      minLon: bbox.getWest(),
      maxLon: bbox.getEast()
    })
    try {
      const res  = await fetch(`/api/flights?${params}`)
      const data = await res.json()
      if (map.getSource(SOURCE_ID)) map.getSource(SOURCE_ID).setData(data)
    } catch (e) {
      console.warn('Flights fetch failed:', e.message)
    }
  }

  return {
    get visible() { return visible },
    show() {
      visible = true
      map.setLayoutProperty(LAYER_ID, 'visibility', 'visible')
      refresh()
      interval = setInterval(refresh, 15_000)
    },
    hide() {
      visible = false
      map.setLayoutProperty(LAYER_ID, 'visibility', 'none')
      clearInterval(interval)
      popup?.remove()
      popup = null
    },
    toggle() { visible ? this.hide() : this.show() }
  }
}
