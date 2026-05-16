import maplibregl from 'maplibre-gl'

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

  // Fuselage
  ctx.beginPath()
  ctx.ellipse(h, h, 2.5, h - 1, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // Wings
  ctx.beginPath()
  ctx.moveTo(h,        h - 1)
  ctx.lineTo(1,        h + 4)
  ctx.lineTo(h,        h + 1)
  ctx.lineTo(size - 1, h + 4)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  // Tail fins
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
