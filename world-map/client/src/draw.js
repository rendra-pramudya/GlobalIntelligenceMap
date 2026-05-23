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
      'icon-size': 0.5,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
      'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
      'icon-rotation-alignment': 'map'
    }
  })

  // Register arrow images now and after every style reload
  registerArrowImages(map)
  map.on('style.load', () => registerArrowImages(map))

  // Lazy-load symbol images (non-arrow)
  map.on('styleimagemissing', (e) => {
    const name = e.id
    if (name.startsWith('wm_arrow_')) { registerArrowImages(map); return }
    const img = new Image()
    img.onload = () => { if (!map.hasImage(name)) map.addImage(name, img) }
    img.src = `/icons/${name}_OFF.png`
  })

  // In-memory symbol store
  const localSymbols = new Map() // id -> GeoJSON feature

  function updateSymbolSource() {
    const src = map.getSource('draw-symbols-source')
    if (src) src.setData({ type: 'FeatureCollection', features: Array.from(localSymbols.values()) })
  }

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
    if (!freehandMode) return
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    _activePtrId     = e.pointerId
    _strokeLineType  = activeLineType
    _strokeLineColor = activeLineColor
    freehandDrawing  = true
    const ll = lngLatFromPtr(e)
    freehandCoords   = [[ll.lng, ll.lat]]
    map.dragPan.disable()
  }, { passive: false })

  mapEl.addEventListener('pointermove', (e) => {
    if (!freehandDrawing || e.pointerId !== _activePtrId) return
    e.preventDefault()
    e.stopPropagation()
    const ll = lngLatFromPtr(e)
    freehandCoords.push([ll.lng, ll.lat])
    updateFreehandPreview()
  }, { passive: false })

  function onPointerEnd(e) {
    if (!freehandDrawing) return
    if (e.pointerId !== _activePtrId) return
    freehandCommit()
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
  map.on('click', (e) => {
    if (!activeSymbol) return
    // Block click-to-place while in any drawing mode (freehand or built-in)
    const m = draw.getMode()
    if (m !== 'simple_select' && m !== 'direct_select') return

    const id = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
      properties: { id, symbolName: activeSymbol }
    }
    localSymbols.set(id, feature)
    updateSymbolSource()
    socket.send(JSON.stringify({ type: 'symbol_create', feature }))
  })

  // ── Public API ────────────────────────────────────────────────────────────
  function setTool(mode) {
    // Cancel any in-progress freehand stroke
    if (freehandDrawing) {
      freehandDrawing  = false
      _activePtrId     = null
      _strokeLineType  = null
      _strokeLineColor = null
      map.dragPan.enable()
      clearFreehandPreview()
      freehandCoords = []
    }

    if (mode === 'freehand_line' || mode === 'freehand_polygon') {
      freehandMode = mode === 'freehand_line' ? 'line' : 'polygon'
      draw.changeMode('freehand_guard')
      mapEl.style.cursor      = 'crosshair'
      mapEl.style.touchAction = 'none'     // prevent OS scroll/zoom stealing the gesture
    } else {
      freehandMode = null
      draw.changeMode(mode)
      mapEl.style.cursor      = ''
      mapEl.style.touchAction = ''
    }
  }

  function setActiveSymbol(name) {
    activeSymbol = name
    // Don't change draw mode — allows PEN + symbol for unit-path drawing
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

  return { draw, setTool, setActiveSymbol, setActiveLine, undo, deleteSelected, getState, restoreState }
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
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'user_lineType', 'DASHED']],
      paint:  { 'line-color': color, 'line-width': 2 } },

    { id: 'gl-draw-line-dashed', type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'user_lineType', 'DASHED']],
      paint:  { 'line-color': color, 'line-width': 2, 'line-dasharray': [4, 3] } },

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
