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
    modes: { ...MaplibreDraw.modes, freehand_guard: FreehandGuardMode },
    styles: drawStyles()
  })

  map.addControl(draw, 'top-left')

  // State
  let activeSymbol   = null
  let activeLineType = 'STROKE'
  let activeLineColor = null
  const pathSymbols = new Map() // lineId -> symId for unit-path endpoint icons

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
      'icon-anchor': 'center'
    }
  })

  // Lazy-load symbol images
  map.on('styleimagemissing', (e) => {
    const name = e.id
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
    const width = activeLineType === 'FILL' ? 6
                : (activeLineType === 'RING' || activeLineType === 'CIRCLE_FILL') ? 4
                : 2
    const fillOpacity = activeLineType === 'RING'        ? 0
                      : activeLineType === 'CIRCLE_FILL' ? 0.5
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
    map.dragPan.enable()
    clearFreehandPreview()

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

    // Add to draw store
    const [id] = draw.add({ type: 'Feature', geometry, properties: {} })
    draw.setFeatureProperty(id, 'lineType', activeLineType)
    draw.setFeatureProperty(id, 'lineColor', activeLineColor || 'DEFAULT')
    if (activeSymbol && geometry.type === 'LineString') {
      draw.setFeatureProperty(id, 'unitSymbol', activeSymbol)
    }

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
  }

  // Mouse events
  map.on('mousedown', (e) => {
    if (!freehandMode) return
    freehandDrawing = true
    freehandCoords  = [[e.lngLat.lng, e.lngLat.lat]]
    map.dragPan.disable()
  })

  map.on('mousemove', (e) => {
    if (!freehandDrawing) return
    // Skip point if < 4px from last — keeps coord count reasonable
    const last = freehandCoords[freehandCoords.length - 1]
    const lp = map.project(last)
    const np = map.project([e.lngLat.lng, e.lngLat.lat])
    if ((np.x - lp.x) ** 2 + (np.y - lp.y) ** 2 < 16) return
    freehandCoords.push([e.lngLat.lng, e.lngLat.lat])
    updateFreehandPreview()
  })

  map.on('mouseup', () => { if (freehandDrawing) freehandCommit() })

  // Touch events
  map.on('touchstart', (e) => {
    if (!freehandMode || e.originalEvent.touches.length !== 1) return
    e.originalEvent.preventDefault()
    freehandDrawing = true
    freehandCoords  = [[e.lngLat.lng, e.lngLat.lat]]
    map.dragPan.disable()
  })

  map.on('touchmove', (e) => {
    if (!freehandDrawing || e.originalEvent.touches.length !== 1) return
    e.originalEvent.preventDefault()
    freehandCoords.push([e.lngLat.lng, e.lngLat.lat])
    updateFreehandPreview()
  })

  map.on('touchend', () => { if (freehandDrawing) freehandCommit() })

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
      freehandDrawing = false
      map.dragPan.enable()
      clearFreehandPreview()
      freehandCoords = []
    }

    if (mode === 'freehand_line' || mode === 'freehand_polygon') {
      freehandMode = mode === 'freehand_line' ? 'line' : 'polygon'
      draw.changeMode('freehand_guard')
    } else {
      freehandMode = null
      draw.changeMode(mode)
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
  return [
    'match', ['get', 'user_lineColor'],
    'BLUE',   '#4488ff',
    'GREEN',  '#44cc44',
    'RED',    '#ff4444',
    'YELLOW', '#ffcc00',
    '#ff6b35'
  ]
}

function lineWidthExpression() {
  return ['match', ['get', 'user_lineType'], 'FILL', 6, 2]
}

function polygonStrokeExpression() {
  return ['match', ['get', 'user_lineType'], 'RING', 4, 'CIRCLE_FILL', 4, 2]
}

function polygonFillOpacityExpression(defaultOpacity) {
  return ['match', ['get', 'user_lineType'], 'RING', 0, 'CIRCLE_FILL', 0.5, defaultOpacity]
}

function drawStyles() {
  const color = colorExpression()

  return [
    { id: 'gl-draw-polygon-fill',   type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint:  { 'fill-color': color, 'fill-opacity': polygonFillOpacityExpression(0.2) } },

    { id: 'gl-draw-polygon-stroke', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint:  { 'line-color': color, 'line-width': polygonStrokeExpression() } },

    { id: 'gl-draw-line-solid',     type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static'], ['!in', 'user_lineType', 'DASHED']],
      paint:  { 'line-color': color, 'line-width': lineWidthExpression() } },

    { id: 'gl-draw-line-dashed',    type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static'], ['==', 'user_lineType', 'DASHED']],
      paint:  { 'line-color': color, 'line-width': 2, 'line-dasharray': [4, 3] } },

    { id: 'gl-draw-vertex',         type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'],    ['==', '$type', 'Point']],
      paint:  { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': color } },

    { id: 'gl-draw-midpoint',       type: 'circle',
      filter: ['all', ['==', 'meta', 'midpoint'],  ['==', '$type', 'Point']],
      paint:  { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-width': 1, 'circle-stroke-color': '#888' } },

    { id: 'gl-draw-line-active',    type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
      paint:  { 'line-color': color, 'line-width': lineWidthExpression(), 'line-opacity': 0.9 } },

    { id: 'gl-draw-polygon-fill-active', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
      paint:  { 'fill-color': color, 'fill-opacity': polygonFillOpacityExpression(0.3) } },

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
