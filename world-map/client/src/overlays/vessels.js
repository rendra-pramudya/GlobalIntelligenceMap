import maplibregl from 'maplibre-gl'

const SOURCE_ID  = 'vessels-source'
const LAYER_FILL = 'vessels-layer'
const LAYER_DIR  = 'vessels-direction'
const IMAGE_ID   = 'vessel-icon'

// AIS category → display colour
const CAT_COLOR = {
  cargo:     '#4488ff',
  tanker:    '#ff8844',
  passenger: '#44dd88',
  fishing:   '#ffcc44',
  tug:       '#44ccff',
  sailing:   '#cc88ff',
  highspeed: '#ff4488',
  other:     '#aaaaaa',
  unknown:   '#888888'
}

const NAV_STATUS = [
  'Under way (engine)', 'At anchor', 'Not under command',
  'Restricted manoeuvrability', 'Constrained by draught',
  'Moored', 'Aground', 'Fishing', 'Under way (sailing)'
]

function makeVesselIcon() {
  const SIZE = 24
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d')
  const cx = SIZE / 2, cy = SIZE / 2

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 2
  ctx.shadowOffsetY = 1

  // Hull: pointed bow (top) to flat stern (bottom) — top-down ship shape
  ctx.beginPath()
  ctx.moveTo(cx, 2)              // bow
  ctx.bezierCurveTo(cx + 5, 8,   cx + 6, 14,  cx + 5, 20)  // starboard side
  ctx.lineTo(cx - 5, 20)        // stern
  ctx.bezierCurveTo(cx - 6, 14, cx - 5, 8,   cx, 2)       // port side
  ctx.closePath()

  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Deck stripe
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Centre-line mark
  ctx.beginPath()
  ctx.moveTo(cx, 5)
  ctx.lineTo(cx, 17)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  return { data: c, width: SIZE, height: SIZE }
}

function categoryMatchExpr(fallback) {
  const pairs = Object.entries(CAT_COLOR).flatMap(([k, v]) => [k, v])
  return ['match', ['get', 'category'], ...pairs, fallback]
}

export function initVessels(map) {
  let visible = false
  let socket  = null
  let popup   = null

  // Register vessel icon
  if (!map.hasImage(IMAGE_ID)) {
    const img = makeVesselIcon()
    map.addImage(IMAGE_ID, img, { sdf: true })
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  // Vessel body — SDF icon tinted per category
  map.addLayer({
    id: LAYER_FILL,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      visibility: 'none',
      'icon-image': IMAGE_ID,
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
      'icon-rotate': [
        'case',
        ['!=', ['get', 'heading'], null],
        ['get', 'heading'],
        ['case', ['!=', ['get', 'cog'], null], ['get', 'cog'], 0]
      ]
    },
    paint: {
      'icon-color': categoryMatchExpr('#aaaaaa'),
      'icon-halo-color': 'rgba(0,0,0,0.5)',
      'icon-halo-width': 1
    }
  })

  // Speed vector — short line in heading direction
  map.addLayer({
    id: LAYER_DIR,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      visibility: 'none',
      'icon-image': IMAGE_ID,
      'icon-size': 0
    },
    paint: {}
  })

  function formatPopup(p) {
    const status = (p.navStatus != null && NAV_STATUS[p.navStatus]) || '–'
    const sog    = p.sog  != null ? `${p.sog.toFixed(1)} kn` : '–'
    const cog    = p.cog  != null ? `${Math.round(p.cog)}°`  : '–'
    const dest   = p.destination || '–'
    const cs     = p.callSign    || '–'
    const cat    = p.category    ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : '–'
    const color  = CAT_COLOR[p.category] || '#aaa'

    return `
      <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:180px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${p.name || `MMSI ${p.mmsi}`}</div>
        <div style="display:inline-block;background:${color};color:#000;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:600;margin-bottom:6px;opacity:0.9">${cat}</div>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="color:#888;padding:1px 8px 1px 0">MMSI</td><td>${p.mmsi}</td></tr>
          <tr><td style="color:#888;padding:1px 8px 1px 0">Call sign</td><td>${cs}</td></tr>
          <tr><td style="color:#888;padding:1px 8px 1px 0">Speed</td><td>${sog}</td></tr>
          <tr><td style="color:#888;padding:1px 8px 1px 0">Course</td><td>${cog}</td></tr>
          <tr><td style="color:#888;padding:1px 8px 1px 0">Status</td><td>${status}</td></tr>
          <tr><td style="color:#888;padding:1px 8px 1px 0">Destination</td><td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dest}</td></tr>
        </table>
      </div>`
  }

  map.on('click', LAYER_FILL, (e) => {
    const p = e.features[0].properties
    popup?.remove()
    popup = new maplibregl.Popup({ maxWidth: '260px' })
      .setLngLat(e.lngLat)
      .setHTML(formatPopup(p))
      .addTo(map)
  })

  map.on('mouseenter', LAYER_FILL, () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', LAYER_FILL, () => { map.getCanvas().style.cursor = '' })

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${proto}//${location.host}/ws`)

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'vessels' && map.getSource(SOURCE_ID)) {
          map.getSource(SOURCE_ID).setData(msg.data)
        }
      } catch { /* ignore */ }
    })

    socket.addEventListener('close', () => {
      if (visible) setTimeout(connectWS, 3000)
    })

    socket.addEventListener('error', () => {
      socket.close()
    })
  }

  function setLayerVisibility(vis) {
    const v = vis ? 'visible' : 'none'
    map.setLayoutProperty(LAYER_FILL, 'visibility', v)
    map.setLayoutProperty(LAYER_DIR,  'visibility', v)
  }

  return {
    get visible() { return visible },

    show() {
      visible = true
      setLayerVisibility(true)
      connectWS()
    },

    hide() {
      visible = false
      setLayerVisibility(false)
      popup?.remove()
      if (socket) { socket.close(); socket = null }
    },

    toggle() { visible ? this.hide() : this.show() }
  }
}
