import maplibregl from 'maplibre-gl'

// Top-down airplane icon — clean modern silhouette with glow
function makePlaneImage(color, size = 32) {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx  = size / 2
  const cy  = size / 2
  const s   = size / 32

  ctx.clearRect(0, 0, size, size)

  ctx.save()
  ctx.translate(cx, cy)

  function plane(fillColor, strokeColor, lineW) {
    ctx.fillStyle   = fillColor
    ctx.strokeStyle = strokeColor
    ctx.lineWidth   = lineW

    // Fuselage
    ctx.beginPath()
    ctx.moveTo(0, -13 * s)
    ctx.bezierCurveTo( 2*s, -9*s,  2.8*s,  0,  2.2*s,  7*s)
    ctx.bezierCurveTo( 1.5*s, 10*s,  0,   11*s,   0,  11*s)
    ctx.bezierCurveTo(-1.5*s, 10*s, -2.2*s,  7*s, -2.2*s,  7*s)
    ctx.bezierCurveTo(-2.8*s,  0,  -2*s,  -9*s,    0, -13*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Left wing
    ctx.beginPath()
    ctx.moveTo(-2*s,  -1*s)
    ctx.lineTo(-13.5*s,  4*s)
    ctx.lineTo(-12*s,   6.5*s)
    ctx.lineTo(-1.8*s,  3.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Right wing
    ctx.beginPath()
    ctx.moveTo( 2*s,  -1*s)
    ctx.lineTo( 13.5*s,  4*s)
    ctx.lineTo( 12*s,   6.5*s)
    ctx.lineTo( 1.8*s,  3.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Left stabiliser
    ctx.beginPath()
    ctx.moveTo(-1.5*s,  8*s)
    ctx.lineTo(-6.5*s, 11.5*s)
    ctx.lineTo(-5.8*s, 13*s)
    ctx.lineTo(-1.2*s, 10.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Right stabiliser
    ctx.beginPath()
    ctx.moveTo( 1.5*s,  8*s)
    ctx.lineTo( 6.5*s, 11.5*s)
    ctx.lineTo( 5.8*s, 13*s)
    ctx.lineTo( 1.2*s, 10.5*s)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }

  // Soft drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.40)'
  ctx.shadowBlur    = 3 * s
  ctx.shadowOffsetY = 1.5 * s

  // Gradient fill: lighter at nose → full colour at tail
  const grad = ctx.createLinearGradient(-cx * 0.3, -cy * 0.8, cx * 0.3, cy * 0.5)
  grad.addColorStop(0, lighten(color, 0.35))
  grad.addColorStop(1, color)

  plane(grad, 'rgba(255,255,255,0.55)', 0.9 * s)

  ctx.restore()

  return ctx.getImageData(0, 0, size, size)
}

function lighten(hex, amount) {
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
function fmtSpd(v) {
  return v == null ? '–' : `${Math.round(v)} kt`
}

export function createFlightOverlay(map, { sourceParam, layerId, sourceId, imageId, iconColor }) {
  let visible  = false
  let interval = null
  let popup    = null

  function ensureImage() {
    if (!map.hasImage(imageId)) {
      const img = makePlaneImage(iconColor)
      map.addImage(imageId, { width: img.width, height: img.height, data: img.data })
    }
  }
  // styleimagemissing fires when MapLibre first needs the icon — most reliable hook
  map.on('styleimagemissing', (e) => { if (e.id === imageId) ensureImage() })
  map.on('style.load', ensureImage)
  ensureImage()

  map.addSource(sourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  map.addLayer({
    id: layerId,
    type: 'symbol',
    source: sourceId,
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

  // Click popup
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
      ['Source',    p.source      || '–']
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

  async function refresh() {
    const bbox   = map.getBounds()
    const params = new URLSearchParams({
      source: sourceParam,
      minLat: bbox.getSouth(), maxLat: bbox.getNorth(),
      minLon: bbox.getWest(),  maxLon: bbox.getEast()
    })
    try {
      const res  = await fetch(`/api/flights?${params}`)
      if (!res.ok) { console.warn(`Flight overlay (${sourceParam}) HTTP ${res.status}`); return }
      const data = await res.json()
      if (data.error) { console.warn(`Flight overlay (${sourceParam}):`, data.error); return }
      console.debug(`Flight overlay (${sourceParam}): ${data.features?.length ?? 0} features`)
      if (map.getSource(sourceId)) map.getSource(sourceId).setData(data)
    } catch (e) {
      console.warn(`Flight overlay (${sourceParam}) fetch failed:`, e.message)
    }
  }

  // Re-fetch when the user pans or zooms so new viewport gets fresh data
  map.on('moveend', () => { if (visible) refresh() })

  return {
    get visible() { return visible },
    show() {
      visible  = true
      map.setLayoutProperty(layerId, 'visibility', 'visible')
      refresh()
      interval = setInterval(refresh, 15_000)
    },
    hide() {
      visible = false
      map.setLayoutProperty(layerId, 'visibility', 'none')
      clearInterval(interval)
      popup?.remove()
      popup = null
    },
    toggle() { visible ? this.hide() : this.show() }
  }
}
