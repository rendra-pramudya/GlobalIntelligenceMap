import MaplibreDraw from 'maplibre-gl-draw'

const COLOR_MAP = {
  BLUE: '#4488ff',
  GREEN: '#44cc44',
  RED: '#ff4444',
  YELLOW: '#ffcc00',
}
const DEFAULT_COLOR = '#ff6b35'

function getColor(colorName) {
  return COLOR_MAP[colorName] || DEFAULT_COLOR
}

// ── Arrowhead icon (filled triangle pointing north) ───────────────────────────
function makeArrowImage(hex, size = 32) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2, s = size / 32
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = hex
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.moveTo(cx,          2  * s)   // tip (north)
  ctx.lineTo(cx + 9 * s, 22 * s)   // right base
  ctx.lineTo(cx - 9 * s, 22 * s)   // left base
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

function registerArrowImages(map) {
  Object.entries({ ...COLOR_MAP, DEFAULT: DEFAULT_COLOR }).forEach(([name, hex]) => {
    const id = `wm_arrow_${name}`
    if (!map.hasImage(id)) {
      const img = makeArrowImage(hex)
      map.addImage(id, { width: img.width, height: img.height, data: img.data })
    }
  })
}

// Stable bearing from the end of a freehand path
function getEndBearing(coords, map) {
  const tip = coords[coords.length - 1]
  const tipPx = map.project(tip)
  for (let i = coords.length - 2; i >= 0; i--) {
    const ptPx = map.project(coords[i])
    if (Math.hypot(tipPx.x - ptPx.x, tipPx.y - ptPx.y) >= 20) {
      return bearingDeg(coords[i], tip)
    }
  }
  return bearingDeg(coords[0], tip)
}

function bearingDeg(from, to) {
  const toRad = d => d * Math.PI / 180
  const dLng  = toRad(to[0] - from[0])
  const y = Math.sin(dLng) * Math.cos(toRad(to[1]))
  const x = Math.cos(toRad(from[1])) * Math.sin(toRad(to[1]))
           - Math.sin(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// No-op draw mode used while freehand is active — prevents MapLibre Draw
// from reacting to mouse events during a freehand stroke.
const FreehandGuardMode = {
  onSetup()                          { return {} },
  onClick()                          {},
  onMouseDown()                      {},
  onMouseMove()                      {},
  onMouseUp()                        {},
  onDblClick()                       {},
  onTouchStart()                     {},
  onTouchMove()                      {},
  onTouchEnd()                       {},
  onTap()                            {},
  onKeyUp()                          {},
  onKeyDown()                        {},
  onStop()                           {},
  onTrash()                          {},
  toDisplayFeatures(_, geojson, display) { display(geojson) }
}

export function initDraw(map) {
  const draw = new MaplibreDraw({
    displayControlsDefault: false,
    userProperties: true,   // exposes feature.properties as user_* in style filters
    modes: { ...MaplibreDraw.modes, freehand_guard: FreehandGuardMode },
    styles: drawStyles()
  })

  map.addControl(draw, 'top-left')

  // State
  let activeSymbol    = null
  let activeLineType  = 'STROKE'
  let activeLineColor = null
  const pathSymbols   = new Map() // lineId -> symId for unit-path endpoint icons

  // Stroke-locked values — captured at pointerdown so mid-gesture tool changes
  // don't corrupt the in-progress stroke (pattern from the reference HTML project)
  let _strokeLineType  = null
  let _strokeLineColor = null
  let _activePtrId     = null

  const mapEl = map.getContainer()

  // ── Icon settings (persisted) ────────────────────────────────────────────
  let iconSize         = parseFloat(localStorage.getItem('wm_icon_size')      ?? '0.5')
  let momentumEnabled  = (localStorage.getItem('wm_momentum_enabled')  ?? 'true') === 'true'
  let momentumStrength = parseInt(  localStorage.getItem('wm_momentum_strength') ?? '60', 10)
  // friction derived from strength (0→0.85, 100→0.97)
  let momentumFriction = 0.85 + (momentumStrength / 100) * 0.12

  // ── Symbol-move (MOVE tool) state ────────────────────────────────────────
  let symbolMoveMode = false   // true when MOVE tool is active
  let symDragging    = false   // actively dragging a symbol
  let symDragId      = null    // id of the symbol being dragged
  let symDragPrev    = null    // last [lng, lat] for bearing computation
  let symDragHistory = []      // [{lng, lat, t}] rolling window for velocity

  // ── Symbol momentum state ────────────────────────────────────────────────
  let symMomentumId    = null  // symbol currently coasting
  let symMomentumVLng  = 0     // lng velocity (deg/ms)
  let symMomentumVLat  = 0     // lat velocity (deg/ms)
  let symMomentumTs    = null  // last RAF timestamp
  let symMomentumRaf   = null

  // ── Symbol-path gesture state ─────────────────────────────────────────────
  // When a symbol is armed and the user drags instead of clicking, we draw a
  // vehicle path and animate the icon along it (ported from reference project).
  let symPathTracking  = false   // tracking a potential sym-path gesture
  let symPathThreshMet = false   // have we crossed the movement threshold?
  let symPathCoords    = []      // coords collected during gesture
  let _suppressNextClick = false // set after a committed path to block map click

  function momentumTick(ts) {
    if (!symMomentumId) return
    const dt    = symMomentumTs != null ? ts - symMomentumTs : 16
    symMomentumTs = ts
    const decay = Math.pow(momentumFriction, dt / 16)
    symMomentumVLng *= decay
    symMomentumVLat *= decay
    const speed = Math.sqrt(symMomentumVLng ** 2 + symMomentumVLat ** 2)
    if (speed < 1e-9) {
      const feat = localSymbols.get(symMomentumId)
      if (feat) socket.send(JSON.stringify({ type: 'symbol_create', feature: feat }))
      symMomentumId = null; symMomentumRaf = null; symMomentumTs = null
      return
    }
    const feat = localSymbols.get(symMomentumId)
    if (!feat) { symMomentumId = null; symMomentumRaf = null; return }
    const [lng, lat] = feat.geometry.coordinates
    const newLng = lng + symMomentumVLng * dt
    const newLat = lat + symMomentumVLat * dt
    localSymbols.set(symMomentumId, {
      ...feat,
      geometry:   { type: 'Point', coordinates: [newLng, newLat] },
      properties: { ...feat.properties }
    })
    updateSymbolSource()
    symMomentumRaf = requestAnimationFrame(momentumTick)
  }

  // ── SELECT4 state ─────────────────────────────────────────────────────────
  let select4Mode          = false
  const select4Selected    = new Set()  // symIds currently selected
  let select4MarqueeActive = false      // rubber-band drag in progress
  let select4MarqueeStart  = null       // [lng, lat] at pointerdown
  let select4MarqueeStartPx = null      // {x, y} pixels at pointerdown (threshold check)

  // ── Animation state ───────────────────────────────────────────────────────
  const animJobs = new Map()  // symId → { coords, startTime, duration, done }
  let   animRafId = null

  // ── Symbol layer ──────────────────────────────────────────────────────────
  map.addSource('draw-symbols-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  map.addLayer({
    id: 'draw-symbols-layer',
    type: 'symbol',
    source: 'draw-symbols-source',
    layout: {
      'icon-image': ['get', 'symbolName'],
      'icon-size': iconSize,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
      'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
      'icon-rotation-alignment': 'map'
    }
  })

  // Register arrow images now and after every style reload
  registerArrowImages(map)
  map.on('style.load', () => registerArrowImages(map))

  // Lazy-load symbol images (non-arrow).
  // Candidates: _MAP_sheet.png (spritesheet) → _MAP.png → _MAP.gif → _OFF.png
  // ── Spritesheet animation ─────────────────────────────────────────────────
  // Eagerly registered at init (not inside styleimagemissing) so map.addImage
  // is never called during MapLibre's render cycle, which causes internal errors.
  const SHEET_CONFIG = {
    HELICOPTER: { cols: 6, rows: 5, frames: 30, fps: 33, fw: 64, fh: 64 },
  }

  Object.entries(SHEET_CONFIG).forEach(([name, cfg]) => {
    const img = new Image()
    img.onload = () => {
      if (map.hasImage(name)) return
      const canvas = document.createElement('canvas')
      canvas.width = cfg.fw; canvas.height = cfg.fh
      const ctx    = canvas.getContext('2d')
      // Seed data with frame 0 so the icon is visible immediately
      ctx.drawImage(img, 0, 0, cfg.fw, cfg.fh, 0, 0, cfg.fw, cfg.fh)
      const data = new Uint8Array(cfg.fw * cfg.fh * 4)
      data.set(ctx.getImageData(0, 0, cfg.fw, cfg.fh).data)
      let frame = 0, elapsed = 0, lastTs = null
      map.addImage(name, {
        width: cfg.fw, height: cfg.fh, data,
        render() {
          const now = performance.now()
          const dt  = lastTs != null ? now - lastTs : 0
          lastTs    = now
          elapsed  += dt
          const mspf = 1000 / cfg.fps
          if (elapsed >= mspf) {
            frame    = (frame + Math.floor(elapsed / mspf)) % cfg.frames
            elapsed %= mspf
            ctx.clearRect(0, 0, cfg.fw, cfg.fh)
            ctx.drawImage(img,
              (frame % cfg.cols) * cfg.fw, Math.floor(frame / cfg.cols) * cfg.fh,
              cfg.fw, cfg.fh, 0, 0, cfg.fw, cfg.fh)
            this.data.set(ctx.getImageData(0, 0, cfg.fw, cfg.fh).data)
          }
          return true
        }
      })
    }
    img.src = `/icons/${name}_MAP_sheet.png`
  })

  // ── Static image loader (non-animated) ───────────────────────────────────
  // Skip names handled by SHEET_CONFIG — their eager loader above covers them.
  function loadSymbolImage(name) {
    if (SHEET_CONFIG[name]) return
    const candidates = [
      `/icons/${name}_MAP.png`,
      `/icons/${name}_MAP.gif`,
      `/icons/${name}_OFF.png`,
    ]
    function tryNext(i) {
      if (i >= candidates.length) return
      const img = new Image()
      img.onload = () => { if (!map.hasImage(name)) map.addImage(name, img) }
      img.onerror = () => tryNext(i + 1)
      img.src = candidates[i]
    }
    tryNext(0)
  }

  map.on('styleimagemissing', (e) => {
    const name = e.id
    if (name.startsWith('wm_arrow_')) { registerArrowImages(map); return }
    loadSymbolImage(name)
  })

  // In-memory symbol store
  const localSymbols = new Map() // id -> GeoJSON feature

  function updateSymbolSource() {
    const src = map.getSource('draw-symbols-source')
    if (src) src.setData({ type: 'FeatureCollection', features: Array.from(localSymbols.values()) })
  }

  // ── SELECT4 selection rings ───────────────────────────────────────────────
  map.addSource('select4-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })
  map.addLayer({
    id: 'select4-rings',
    type: 'circle',
    source: 'select4-source',
    paint: {
      'circle-radius': 22,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#00ffff'
    }
  })

  // ── SELECT4 marquee rectangle ─────────────────────────────────────────────
  map.addSource('select4-marquee', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })
  map.addLayer({
    id: 'select4-marquee-fill',
    type: 'fill',
    source: 'select4-marquee',
    paint: { 'fill-color': '#00aaff', 'fill-opacity': 0.1 }
  })
  map.addLayer({
    id: 'select4-marquee-stroke',
    type: 'line',
    source: 'select4-marquee',
    paint: { 'line-color': '#00aaff', 'line-width': 2, 'line-dasharray': [4, 3] }
  })

  // ── Freehand preview layer ────────────────────────────────────────────────
  map.addSource('freehand-src', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })
  map.addLayer({
    id: 'freehand-preview',
    type: 'line',
    source: 'freehand-src',
    paint: { 'line-color': DEFAULT_COLOR, 'line-width': 2, 'line-opacity': 0.85 }
  })
  map.addLayer({
    id: 'freehand-preview-fill',
    type: 'fill',
    source: 'freehand-src',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': DEFAULT_COLOR, 'fill-opacity': 0.15 }
  })

  // ── Freehand state ────────────────────────────────────────────────────────
  let freehandMode    = null  // null | 'line' | 'polygon'
  let freehandCoords  = []
  let freehandDrawing = false

  function setFreehandPreviewStyle() {
    const color = getColor(activeLineColor)
    const width       = activeLineType === 'STROKE' || activeLineType === 'FILL' ? 4 : 2
    const fillOpacity = activeLineType === 'STROKE' ? 0
                      : activeLineType === 'FILL'   ? 0.5
                      : 0.15
    if (map.getLayer('freehand-preview')) {
      map.setPaintProperty('freehand-preview', 'line-color', color)
      map.setPaintProperty('freehand-preview', 'line-width', width)
      map.setPaintProperty('freehand-preview-fill', 'fill-color', color)
      map.setPaintProperty('freehand-preview-fill', 'fill-opacity', fillOpacity)
    }
  }

  function clearFreehandPreview() {
    map.getSource('freehand-src')?.setData({ type: 'FeatureCollection', features: [] })
  }

  function updateFreehandPreview() {
    const coords = freehandMode === 'polygon' && freehandCoords.length >= 3
      ? [...freehandCoords, freehandCoords[0]]
      : freehandCoords
    if (coords.length < 2) return

    const geojson = freehandMode === 'polygon' && coords.length >= 4
      ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
      : { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }

    map.getSource('freehand-src')?.setData({ type: 'FeatureCollection', features: [geojson] })
  }

  function freehandCommit() {
    freehandDrawing = false
    _activePtrId    = null
    map.dragPan.enable()
    clearFreehandPreview()

    // Use values locked at stroke start (not the current active values, which may
    // have changed mid-gesture — same approach as the reference HTML project)
    const lineType  = _strokeLineType  ?? activeLineType
    const lineColor = _strokeLineColor ?? activeLineColor
    _strokeLineType  = null
    _strokeLineColor = null

    const minPts = freehandMode === 'polygon' ? 3 : 2
    if (freehandCoords.length < minPts) { freehandCoords = []; return }

    const raw = [...freehandCoords]
    freehandCoords = []

    let geometry
    if (freehandMode === 'polygon') {
      geometry = { type: 'Polygon', coordinates: [[...raw, raw[0]]] }
    } else {
      geometry = { type: 'LineString', coordinates: raw }
    }

    // Properties must go into draw.add() so style filters see them on the first frame
    const props = { lineType, lineColor: lineColor || 'DEFAULT' }
    if (activeSymbol && geometry.type === 'LineString') props.unitSymbol = activeSymbol

    const [id] = draw.add({ type: 'Feature', geometry, properties: props })
    const saved = draw.get(id)
    socket.send(JSON.stringify({ type: 'drawing_create', feature: saved }))

    // Unit-path endpoint symbol
    if (activeSymbol && geometry.type === 'LineString') {
      const endCoord = raw[raw.length - 1]
      const symId = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const symFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: endCoord },
        properties: { id: symId, symbolName: activeSymbol, pathId: id }
      }
      pathSymbols.set(id, symId)
      localSymbols.set(symId, symFeature)
      updateSymbolSource()
      socket.send(JSON.stringify({ type: 'symbol_create', feature: symFeature }))
    }

    // Arrow tip symbol
    if (lineType === 'ARROW' && geometry.type === 'LineString') {
      const endCoord = raw[raw.length - 1]
      const bearing  = getEndBearing(raw, map)
      const colorKey = (lineColor in COLOR_MAP) ? lineColor : 'DEFAULT'
      const symId = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const symFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: endCoord },
        properties: { id: symId, symbolName: `wm_arrow_${colorKey}`, bearing, pathId: id }
      }
      pathSymbols.set(id, symId)
      localSymbols.set(symId, symFeature)
      updateSymbolSource()
      socket.send(JSON.stringify({ type: 'symbol_create', feature: symFeature }))
    }
  }

  // ── Vehicle-path animation ────────────────────────────────────────────────

  function interpolateAlongPath(coords, t) {
    if (coords.length < 2) return { lng: coords[0][0], lat: coords[0][1], bearing: 0 }
    let total = 0
    const segs = []
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i][0] - coords[i-1][0]
      const dy = coords[i][1] - coords[i-1][1]
      total += Math.sqrt(dx*dx + dy*dy)
      segs.push(total)
    }
    if (total === 0) return { lng: coords[0][0], lat: coords[0][1], bearing: 0 }
    const target = t * total
    for (let i = 0; i < segs.length; i++) {
      const prev = i > 0 ? segs[i-1] : 0
      if (target <= segs[i]) {
        const segLen = segs[i] - prev
        const f = segLen > 0 ? (target - prev) / segLen : 0
        const a = coords[i], b = coords[i+1]
        return {
          lng:     a[0] + (b[0] - a[0]) * f,
          lat:     a[1] + (b[1] - a[1]) * f,
          bearing: bearingDeg(a, b)
        }
      }
    }
    const last = coords[coords.length - 1]
    return { lng: last[0], lat: last[1], bearing: bearingDeg(coords[coords.length-2], last) }
  }

  function animTick(ts) {
    let anyActive = false
    animJobs.forEach((job, symId) => {
      if (job.done) return
      const t   = Math.min((ts - job.startTime) / job.duration, 1)
      const pos = interpolateAlongPath(job.coords, t)
      const feat = localSymbols.get(symId)
      if (feat) {
        localSymbols.set(symId, {
          ...feat,
          geometry:   { type: 'Point', coordinates: [pos.lng, pos.lat] },
          properties: { ...feat.properties, bearing: pos.bearing }
        })
      }
      if (t < 1) { anyActive = true } else { job.done = true; animJobs.delete(symId) }
    })
    updateSymbolSource()
    animRafId = anyActive ? requestAnimationFrame(animTick) : null
  }

  function startSymbolAnimation(symId, coords, duration = 6000) {
    animJobs.set(symId, { coords, startTime: performance.now(), duration, done: false })
    if (!animRafId) animRafId = requestAnimationFrame(animTick)
  }

  function placeSymbolAt(symbolName, coord) {
    const id = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties: { id, symbolName }
    }
    localSymbols.set(id, feature)
    updateSymbolSource()
    socket.send(JSON.stringify({ type: 'symbol_create', feature }))
  }

  function commitSymbolPath(coords, symbolName) {
    // Draw a faint dashed path line
    const [pathId] = draw.add({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { lineType: 'PATH', lineColor: 'DEFAULT', unitSymbol: symbolName }
    })
    socket.send(JSON.stringify({ type: 'drawing_create', feature: draw.get(pathId) }))

    // Place symbol at path start with initial bearing
    const symId       = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const initBearing = coords.length >= 2 ? bearingDeg(coords[0], coords[1]) : 0
    const symFeature  = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords[0] },
      properties: { id: symId, symbolName, bearing: initBearing, pathId }
    }
    pathSymbols.set(pathId, symId)
    localSymbols.set(symId, symFeature)
    updateSymbolSource()
    socket.send(JSON.stringify({ type: 'symbol_create', feature: symFeature }))

    startSymbolAnimation(symId, coords)
  }

  // ── SELECT4 helpers ───────────────────────────────────────────────────────
  function updateSelect4Rings() {
    const src = map.getSource('select4-source')
    if (!src) return
    const features = []
    select4Selected.forEach(id => {
      const s = localSymbols.get(id)
      if (s) features.push({ type: 'Feature', geometry: { ...s.geometry }, properties: { id } })
    })
    src.setData({ type: 'FeatureCollection', features })
  }

  function updateMarqueeRect(startLngLat, curLngLat) {
    const [x0, y0] = [Math.min(startLngLat[0], curLngLat[0]), Math.min(startLngLat[1], curLngLat[1])]
    const [x1, y1] = [Math.max(startLngLat[0], curLngLat[0]), Math.max(startLngLat[1], curLngLat[1])]
    map.getSource('select4-marquee')?.setData({ type: 'FeatureCollection', features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]] },
      properties: {}
    }]})
  }

  function clearMarqueeRect() {
    map.getSource('select4-marquee')?.setData({ type: 'FeatureCollection', features: [] })
  }

  function selectSymbolsInBounds(swLng, swLat, neLng, neLat) {
    select4Selected.clear()
    localSymbols.forEach((feat, id) => {
      const [lng, lat] = feat.geometry.coordinates
      if (lng >= swLng && lng <= neLng && lat >= swLat && lat <= neLat) select4Selected.add(id)
    })
    updateSelect4Rings()
  }

  // Geodesic destination point (ported from reference project)
  function geoDestination(fromLng, fromLat, distanceM, bearingDeg) {
    const R   = 6371000
    const br  = bearingDeg * Math.PI / 180
    const lat1 = fromLat * Math.PI / 180
    const lng1 = fromLng * Math.PI / 180
    const dr   = distanceM / R
    const sinLat2 = Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br)
    const lat2    = Math.asin(sinLat2)
    const y = Math.sin(br) * Math.sin(dr) * Math.cos(lat1)
    const x = Math.cos(dr) - Math.sin(lat1) * sinLat2
    const lng2 = lng1 + Math.atan2(y, x)
    return [(lng2 * 180 / Math.PI + 540) % 360 - 180, lat2 * 180 / Math.PI]
  }

  function moveSelectedToDestination(destLng, destLat) {
    const ids = [...select4Selected]
    const n   = ids.length
    // Spread units into concentric hexagonal rings (6 per ring, 150 m spacing)
    const targets = []
    if (n === 1) {
      targets.push([destLng, destLat])
    } else {
      let remaining = n, ring = 1
      while (remaining > 0) {
        const onRing = Math.min(remaining, 6 * ring)
        for (let j = 0; j < onRing; j++)
          targets.push(geoDestination(destLng, destLat, 150 * ring, (360 / onRing) * j))
        remaining -= onRing
        ring++
      }
    }
    ids.forEach((symId, i) => {
      const feat = localSymbols.get(symId)
      if (!feat) return
      startSymbolAnimation(symId, [feat.geometry.coordinates, targets[Math.min(i, targets.length - 1)]], 3000)
    })
    select4Selected.clear()
    updateSelect4Rings()
  }

  // ── Freehand events — Pointer Events API ─────────────────────────────────
  // Unified mouse / touch / pen handling (ported from reference HTML project).
  // Using raw DOM Pointer Events lets us: (a) track a single pointer ID so
  // secondary fingers don't corrupt the stroke; (b) set touchAction:'none' to
  // prevent OS-level scroll/zoom from stealing the gesture; (c) lock the line
  // type/color at stroke-start so mid-gesture tool changes are harmless.

  function lngLatFromPtr(e) {
    const r = mapEl.getBoundingClientRect()
    return map.unproject([e.clientX - r.left, e.clientY - r.top])
  }

  mapEl.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const ll = lngLatFromPtr(e)

    // ── Case 1: active freehand line/polygon tool ──────────────────────────
    if (freehandMode) {
      e.preventDefault()
      e.stopPropagation()
      _activePtrId     = e.pointerId
      _strokeLineType  = activeLineType
      _strokeLineColor = activeLineColor
      freehandDrawing  = true
      freehandCoords   = [[ll.lng, ll.lat]]
      map.dragPan.disable()
      return
    }

    // ── Case 2: MOVE tool — hit-test symbols, drag if found ───────────────
    if (symbolMoveMode) {
      const r  = mapEl.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const hits = map.queryRenderedFeatures([[px-14, py-14], [px+14, py+14]], { layers: ['draw-symbols-layer'] })
      const hit  = hits.find(f => localSymbols.has(f.properties.id))
      if (hit) {
        e.preventDefault()
        e.stopPropagation()
        // Cancel any in-flight momentum before starting a new drag
        symMomentumId = null
        if (symMomentumRaf) { cancelAnimationFrame(symMomentumRaf); symMomentumRaf = null }
        symDragHistory = []
        _activePtrId = e.pointerId
        symDragging  = true
        symDragId    = hit.properties.id
        symDragPrev  = [ll.lng, ll.lat]
        map.dragPan.disable()
        mapEl.style.cursor = 'grabbing'
      }
      // No hit → fall through so MapLibre can pan the map normally
      return
    }

    // ── Case 3: symbol armed → track for potential vehicle-path gesture ────
    if (activeSymbol) {
      e.preventDefault()
      _activePtrId     = e.pointerId
      symPathTracking  = true
      symPathThreshMet = false
      symPathCoords    = [[ll.lng, ll.lat]]
      map.dragPan.disable()
      return
    }

    // ── Case 4: SELECT4 — click/drag for marquee or tap-to-move ─────────
    if (select4Mode) {
      const r  = mapEl.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const hits = map.queryRenderedFeatures([[px-14, py-14], [px+14, py+14]], { layers: ['draw-symbols-layer'] })
      const hit  = hits.find(f => localSymbols.has(f.properties.id))
      if (hit) {
        // Click on a symbol → toggle selection, no pointer capture needed
        const id = hit.properties.id
        if (select4Selected.has(id)) select4Selected.delete(id)
        else select4Selected.add(id)
        updateSelect4Rings()
        e.preventDefault()
        e.stopPropagation()
      } else {
        // Click on empty area → capture to determine: marquee drag or tap-to-move
        e.preventDefault()
        e.stopPropagation()
        _activePtrId          = e.pointerId
        select4MarqueeStart   = [ll.lng, ll.lat]
        select4MarqueeStartPx = { x: px, y: py }
        select4MarqueeActive  = false
        map.dragPan.disable()
      }
      return
    }
  }, { passive: false })

  mapEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== _activePtrId) return

    const ll = lngLatFromPtr(e)

    // ── Case 1: freehand drawing ───────────────────────────────────────────
    if (freehandDrawing) {
      e.preventDefault()
      e.stopPropagation()
      freehandCoords.push([ll.lng, ll.lat])
      updateFreehandPreview()
      return
    }

    // ── Case 2: symbol drag ────────────────────────────────────────────────
    if (symDragging) {
      e.preventDefault()
      e.stopPropagation()
      const feat = localSymbols.get(symDragId)
      if (feat) {
        const prevPx = map.project(symDragPrev)
        const curPx  = map.project([ll.lng, ll.lat])
        let bearing  = feat.properties.bearing ?? 0
        if (Math.hypot(prevPx.x - curPx.x, prevPx.y - curPx.y) > 4) {
          const raw  = bearingDeg(symDragPrev, [ll.lng, ll.lat])
          const diff = ((raw - bearing) + 540) % 360 - 180
          bearing     = (bearing + diff * 0.25 + 360) % 360
          symDragPrev = [ll.lng, ll.lat]
        }
        localSymbols.set(symDragId, {
          ...feat,
          geometry:   { type: 'Point', coordinates: [ll.lng, ll.lat] },
          properties: { ...feat.properties, bearing }
        })
        updateSymbolSource()
        // Track velocity history (keep last 6 samples)
        symDragHistory.push({ lng: ll.lng, lat: ll.lat, t: performance.now() })
        if (symDragHistory.length > 6) symDragHistory.shift()
      }
      return
    }

    // ── Case 3: symbol path tracking ──────────────────────────────────────
    if (symPathTracking) {
      e.preventDefault()
      symPathCoords.push([ll.lng, ll.lat])
      if (!symPathThreshMet) {
        const fp = map.project(symPathCoords[0])
        const cp = map.project([ll.lng, ll.lat])
        if (Math.hypot(fp.x - cp.x, fp.y - cp.y) > 12) symPathThreshMet = true
      }
      if (symPathThreshMet && symPathCoords.length >= 2) {
        map.getSource('freehand-src')?.setData({ type: 'FeatureCollection', features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: symPathCoords },
          properties: {}
        }]})
      }
      return
    }

    // ── Case 4: SELECT4 marquee tracking ──────────────────────────────────
    if (select4MarqueeStart) {
      e.preventDefault()
      e.stopPropagation()
      const r  = mapEl.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const dx = Math.abs(px - select4MarqueeStartPx.x)
      const dy = Math.abs(py - select4MarqueeStartPx.y)
      if (!select4MarqueeActive && Math.max(dx, dy) >= 12) select4MarqueeActive = true
      if (select4MarqueeActive) updateMarqueeRect(select4MarqueeStart, [ll.lng, ll.lat])
    }
  }, { passive: false })

  // Hover cursor: MOVE mode = grab, SELECT4 mode = pointer over symbols
  mapEl.addEventListener('mousemove', (e) => {
    if (symDragging || select4MarqueeActive) return
    if (!symbolMoveMode && !select4Mode) return
    const r  = mapEl.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    const hits = map.queryRenderedFeatures([[px-14, py-14], [px+14, py+14]], { layers: ['draw-symbols-layer'] })
    const over = hits.some(f => localSymbols.has(f.properties.id))
    if (symbolMoveMode) {
      mapEl.style.cursor = over ? 'grab' : 'default'
    } else {
      mapEl.style.cursor = over ? 'pointer' : (select4Selected.size > 0 ? 'crosshair' : 'default')
    }
  })

  function onPointerEnd(e) {
    if (e.pointerId !== _activePtrId) return

    // ── Case 1: freehand drawing commit ───────────────────────────────────
    if (freehandDrawing) {
      freehandCommit()
      return
    }

    // ── Case 2: symbol drag end — launch momentum ─────────────────────────
    if (symDragging) {
      symDragging  = false
      _activePtrId = null
      map.dragPan.enable()
      mapEl.style.cursor = 'default'

      const releasedId = symDragId
      symDragId   = null
      symDragPrev = null

      // Cancel any previous momentum on a different symbol
      symMomentumId = null
      if (symMomentumRaf) { cancelAnimationFrame(symMomentumRaf); symMomentumRaf = null }

      // Compute velocity from history window
      const h = symDragHistory
      symDragHistory = []
      if (h.length >= 2) {
        const h0 = h[0], h1 = h[h.length - 1]
        const dt = h1.t - h0.t
        if (dt > 0 && dt < 250) {  // only if gesture was recent
          const vLng = (h1.lng - h0.lng) / dt
          const vLat = (h1.lat - h0.lat) / dt
          if (momentumEnabled && Math.sqrt(vLng ** 2 + vLat ** 2) > 1e-7) {
            symMomentumId   = releasedId
            symMomentumVLng = vLng
            symMomentumVLat = vLat
            symMomentumTs   = null
            symMomentumRaf  = requestAnimationFrame(momentumTick)
            return  // socket send happens when momentum stops
          }
        }
      }
      // No momentum — send final position immediately
      const feat = localSymbols.get(releasedId)
      if (feat) socket.send(JSON.stringify({ type: 'symbol_create', feature: feat }))
      return
    }

    // ── Case 3: symbol path commit or click ───────────────────────────────
    if (symPathTracking) {
      symPathTracking = false
      _activePtrId    = null
      map.dragPan.enable()
      clearFreehandPreview()

      if (symPathThreshMet && symPathCoords.length >= 2 && activeSymbol) {
        _suppressNextClick = true
        commitSymbolPath([...symPathCoords], activeSymbol)
      } else if (activeSymbol && symPathCoords.length > 0) {
        _suppressNextClick = true
        placeSymbolAt(activeSymbol, symPathCoords[0])
      }
      symPathCoords    = []
      symPathThreshMet = false
      return
    }

    // ── Case 4: SELECT4 — complete marquee or issue move command ─────────
    if (select4MarqueeStart) {
      const wasMarquee = select4MarqueeActive
      const savedStart = select4MarqueeStart  // capture before clearing
      select4MarqueeActive  = false
      select4MarqueeStart   = null
      select4MarqueeStartPx = null
      _activePtrId          = null
      map.dragPan.enable()
      clearMarqueeRect()

      if (e.type === 'pointercancel') return

      if (wasMarquee) {
        // Drag ended — select all symbols inside the rectangle
        const ll2 = lngLatFromPtr(e)
        const swLng = Math.min(savedStart[0], ll2.lng)
        const swLat = Math.min(savedStart[1], ll2.lat)
        const neLng = Math.max(savedStart[0], ll2.lng)
        const neLat = Math.max(savedStart[1], ll2.lat)
        selectSymbolsInBounds(swLng, swLat, neLng, neLat)
      } else if (select4Selected.size > 0) {
        // Tap on empty area — move selected symbols to this point
        const ll2 = lngLatFromPtr(e)
        moveSelectedToDestination(ll2.lng, ll2.lat)
      }
    }
  }
  mapEl.addEventListener('pointerup',     onPointerEnd, { passive: false })
  mapEl.addEventListener('pointercancel', onPointerEnd, { passive: false })

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const socket = new WebSocket(`ws://${location.host}/ws`)

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'drawings_snapshot') msg.data.forEach(f => draw.add(f))
    if (msg.type === 'drawing_create' || msg.type === 'drawing_update') draw.add(msg.feature)
    if (msg.type === 'drawing_delete') draw.delete(msg.id)

    if (msg.type === 'symbols_snapshot') {
      msg.data.forEach(f => localSymbols.set(f.properties.id, f))
      updateSymbolSource()
    }
    if (msg.type === 'symbol_create') {
      localSymbols.set(msg.feature.properties.id, msg.feature)
      updateSymbolSource()
    }
    if (msg.type === 'symbol_delete') {
      localSymbols.delete(msg.id)
      updateSymbolSource()
    }
  })

  // ── Draw events (for MapLibre Draw built-in modes if ever used) ───────────
  map.on('draw.update', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_update', feature }))

      if (feature.geometry.type === 'LineString') {
        const symId = pathSymbols.get(feature.id)
        if (symId) {
          const coords = feature.geometry.coordinates
          const endCoord = coords[coords.length - 1]
          const existing = localSymbols.get(symId)
          if (existing) {
            const updated = { ...existing, geometry: { type: 'Point', coordinates: endCoord } }
            localSymbols.set(symId, updated)
            updateSymbolSource()
            socket.send(JSON.stringify({ type: 'symbol_create', feature: updated }))
          }
        }
      }
    })
  })

  map.on('draw.delete', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_delete', id: feature.id }))
      const symId = pathSymbols.get(feature.id)
      if (symId) {
        pathSymbols.delete(feature.id)
        localSymbols.delete(symId)
        updateSymbolSource()
        socket.send(JSON.stringify({ type: 'symbol_delete', id: symId }))
      }
    })
  })

  map.on('draw.modechange', ({ mode }) => {
    const isDrawing = mode !== 'simple_select' && mode !== 'direct_select'
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : ''
  })

  // ── Symbol placement on map click ─────────────────────────────────────────
  // Pointer events handle tap/drag directly; this catches any MapLibre-routed
  // clicks that slipped through (e.g. keyboard-accessible interactions).
  map.on('click', (e) => {
    if (!activeSymbol) return
    if (_suppressNextClick) { _suppressNextClick = false; return }
    const m = draw.getMode()
    if (m !== 'simple_select' && m !== 'direct_select') return
    placeSymbolAt(activeSymbol, [e.lngLat.lng, e.lngLat.lat])
  })

  // ── Public API ────────────────────────────────────────────────────────────
  function setTool(mode) {
    // Cancel any in-progress operations
    if (freehandDrawing) {
      freehandDrawing  = false
      _activePtrId     = null
      _strokeLineType  = null
      _strokeLineColor = null
      map.dragPan.enable()
      clearFreehandPreview()
      freehandCoords = []
    }
    if (symDragging) {
      symDragging  = false
      symDragId    = null
      symDragPrev  = null
      _activePtrId = null
      map.dragPan.enable()
    }
    // Always reset SELECT4 state; re-enabled below if needed
    if (select4MarqueeStart) { map.dragPan.enable() }
    select4Mode           = false
    select4MarqueeActive  = false
    select4MarqueeStart   = null
    select4MarqueeStartPx = null
    select4Selected.clear()
    clearMarqueeRect()
    updateSelect4Rings()

    if (mode === 'freehand_line' || mode === 'freehand_polygon') {
      freehandMode   = mode === 'freehand_line' ? 'line' : 'polygon'
      symbolMoveMode = false
      draw.changeMode('freehand_guard')
      mapEl.style.cursor      = 'crosshair'
      mapEl.style.touchAction = 'none'
    } else if (mode === 'symbol_move') {
      freehandMode   = null
      symbolMoveMode = true
      draw.changeMode('simple_select')
      mapEl.style.cursor      = 'default'
      mapEl.style.touchAction = 'none'
    } else if (mode === 'symbol_select4') {
      freehandMode   = null
      symbolMoveMode = false
      select4Mode    = true
      draw.changeMode('simple_select')
      mapEl.style.cursor      = 'default'
      mapEl.style.touchAction = 'none'
    } else {
      freehandMode   = null
      symbolMoveMode = false
      draw.changeMode(mode)
      mapEl.style.cursor      = ''
      mapEl.style.touchAction = ''
    }
  }

  function setActiveSymbol(name) {
    activeSymbol = name
    if (!freehandMode && !symbolMoveMode) {
      mapEl.style.cursor      = name ? 'crosshair' : ''
      mapEl.style.touchAction = name ? 'none'       : ''
    }
  }

  function setActiveLine(type, color) {
    activeLineType  = type
    activeLineColor = color
    setFreehandPreviewStyle()
  }

  function undo() {
    const features = draw.getAll().features
    if (features.length > 0) {
      const last = features[features.length - 1]
      draw.delete(last.id)
      socket.send(JSON.stringify({ type: 'drawing_delete', id: last.id }))

      const symId = pathSymbols.get(last.id)
      if (symId) {
        pathSymbols.delete(last.id)
        localSymbols.delete(symId)
        updateSymbolSource()
        socket.send(JSON.stringify({ type: 'symbol_delete', id: symId }))
      }
    }
  }

  function deleteSelected() {
    const selected = draw.getSelectedIds()

    if (selected.length > 0) {
      // Delete only the selected features + their linked endpoint symbols
      draw.delete(selected)
      selected.forEach(id => {
        socket.send(JSON.stringify({ type: 'drawing_delete', id }))
        const symId = pathSymbols.get(id)
        if (symId) {
          pathSymbols.delete(id)
          localSymbols.delete(symId)
          socket.send(JSON.stringify({ type: 'symbol_delete', id: symId }))
        }
      })
      updateSymbolSource()
    } else {
      // Nothing selected → clear ALL drawings and symbols
      const allIds = draw.getAll().features.map(f => f.id)
      draw.deleteAll()
      allIds.forEach(id => {
        socket.send(JSON.stringify({ type: 'drawing_delete', id }))
      })
      // Clear every symbol (standalone + path-linked)
      localSymbols.forEach((_, id) => socket.send(JSON.stringify({ type: 'symbol_delete', id })))
      localSymbols.clear()
      pathSymbols.clear()
      updateSymbolSource()
    }
  }

  // ── State snapshot / restore (for saved places) ──────────────────────────
  function getState() {
    return {
      features: draw.getAll().features,
      symbols:  Array.from(localSymbols.values())
    }
  }

  function restoreState(state) {
    if (!state) return

    // ── Clear current drawings ──
    const prevIds = draw.getAll().features.map(f => f.id)
    draw.deleteAll()
    prevIds.forEach(id => socket.send(JSON.stringify({ type: 'drawing_delete', id })))

    // ── Clear current symbols ──
    localSymbols.forEach((_, id) => socket.send(JSON.stringify({ type: 'symbol_delete', id })))
    localSymbols.clear()
    pathSymbols.clear()
    updateSymbolSource()

    // ── Restore drawings ──
    ;(state.features || []).forEach(f => {
      draw.add(f)
      socket.send(JSON.stringify({ type: 'drawing_create', feature: f }))
    })

    // ── Restore symbols ──
    ;(state.symbols || []).forEach(f => {
      localSymbols.set(f.properties.id, f)
      if (f.properties.pathId) pathSymbols.set(f.properties.pathId, f.properties.id)
      socket.send(JSON.stringify({ type: 'symbol_create', feature: f }))
    })
    updateSymbolSource()
  }

  function setIconSize(size) {
    iconSize = size
    localStorage.setItem('wm_icon_size', size)
    if (map.getLayer('draw-symbols-layer'))
      map.setLayoutProperty('draw-symbols-layer', 'icon-size', size)
  }

  function setMomentumEnabled(enabled) {
    momentumEnabled = enabled
    localStorage.setItem('wm_momentum_enabled', enabled)
    if (!enabled && symMomentumId) {
      cancelAnimationFrame(symMomentumRaf)
      symMomentumId = null; symMomentumRaf = null
    }
  }

  function setMomentumStrength(strength) {
    momentumStrength = strength
    momentumFriction = 0.85 + (strength / 100) * 0.12
    localStorage.setItem('wm_momentum_strength', strength)
  }

  return { draw, setTool, setActiveSymbol, setActiveLine, undo, deleteSelected, getState, restoreState, setIconSize, setMomentumEnabled, setMomentumStrength }
}

function colorExpression() {
  return ['match', ['get', 'user_lineColor'],
    'BLUE',   '#4488ff', 'GREEN',  '#44cc44',
    'RED',    '#ff4444', 'YELLOW', '#ffcc00',
    '#ff6b35']
}

function drawStyles() {
  const color = colorExpression()

  return [
    // ── Polygon fills (explicit per-type to avoid match-expression issues) ──
    { id: 'gl-draw-poly-fill-stroke-only', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'user_lineType', 'STROKE']],
      paint:  { 'fill-color': color, 'fill-opacity': 0 } },

    { id: 'gl-draw-poly-fill-solid', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'user_lineType', 'FILL']],
      paint:  { 'fill-color': color, 'fill-opacity': 0.5 } },

    { id: 'gl-draw-poly-fill-default', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!in', 'user_lineType', 'STROKE', 'FILL']],
      paint:  { 'fill-color': color, 'fill-opacity': 0.2 } },

    // ── Polygon strokes ──────────────────────────────────────────────────────
    { id: 'gl-draw-poly-stroke-4px', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['in', 'user_lineType', 'STROKE', 'FILL']],
      paint:  { 'line-color': color, 'line-width': 4 } },

    { id: 'gl-draw-poly-stroke-2px', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!in', 'user_lineType', 'STROKE', 'FILL']],
      paint:  { 'line-color': color, 'line-width': 2 } },

    // ── Lines ────────────────────────────────────────────────────────────────
    { id: 'gl-draw-line-solid',  type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!in', 'user_lineType', 'DASHED', 'PATH']],
      paint:  { 'line-color': color, 'line-width': 2 } },

    { id: 'gl-draw-line-dashed', type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'user_lineType', 'DASHED']],
      paint:  { 'line-color': color, 'line-width': 2, 'line-dasharray': [4, 3] } },

    // Vehicle path trail — thin dashed, low opacity
    { id: 'gl-draw-line-path', type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'user_lineType', 'PATH']],
      paint:  { 'line-color': color, 'line-width': 1, 'line-dasharray': [3, 4], 'line-opacity': 0.4 } },

    // ── Vertices & midpoints ─────────────────────────────────────────────────
    { id: 'gl-draw-vertex',   type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'],   ['==', '$type', 'Point']],
      paint:  { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': color } },

    { id: 'gl-draw-midpoint', type: 'circle',
      filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
      paint:  { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-width': 1, 'circle-stroke-color': '#888' } },

    // ── Static (read-only) ───────────────────────────────────────────────────
    { id: 'gl-draw-polygon-fill-static',   type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'],    ['==', 'mode', 'static']],
      paint:  { 'fill-color': '#888', 'fill-opacity': 0.1 } },

    { id: 'gl-draw-polygon-stroke-static', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'],    ['==', 'mode', 'static']],
      paint:  { 'line-color': '#888', 'line-width': 2 } },

    { id: 'gl-draw-line-static',    type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'mode', 'static']],
      paint:  { 'line-color': '#888', 'line-width': 2 } },

    { id: 'gl-draw-point-static',   type: 'circle',
      filter: ['all', ['==', '$type', 'Point'],      ['==', 'mode', 'static']],
      paint:  { 'circle-radius': 5, 'circle-color': '#888' } }
  ]
}
