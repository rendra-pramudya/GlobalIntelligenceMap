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

export function initDraw(map) {
  const draw = new MaplibreDraw({
    displayControlsDefault: false,
    styles: drawStyles()
  })

  map.addControl(draw, 'top-left')

  // State
  let activeSymbol = null
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
    img.onload = () => {
      if (!map.hasImage(name)) {
        map.addImage(name, img)
      }
    }
    img.src = `/icons/${name}_OFF.png`
  })

  // In-memory symbol store
  const localSymbols = new Map() // id -> GeoJSON feature

  function updateSymbolSource() {
    const src = map.getSource('draw-symbols-source')
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: Array.from(localSymbols.values())
      })
    }
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const socket = new WebSocket(`ws://${location.host}/ws`)

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'drawings_snapshot') {
      msg.data.forEach(f => draw.add(f))
    }
    if (msg.type === 'drawing_create' || msg.type === 'drawing_update') {
      draw.add(msg.feature)
    }
    if (msg.type === 'drawing_delete') {
      draw.delete(msg.id)
    }

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

  // ── Draw events ───────────────────────────────────────────────────────────
  map.on('draw.create', ({ features }) => {
    features.forEach(feature => {
      const id = feature.id
      if (feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon') {
        draw.setFeatureProperty(id, 'lineType', activeLineType)
        draw.setFeatureProperty(id, 'lineColor', activeLineColor || 'DEFAULT')
        if (activeSymbol && feature.geometry.type === 'LineString') {
          draw.setFeatureProperty(id, 'unitSymbol', activeSymbol)
        }
        feature = draw.get(id)
      }
      socket.send(JSON.stringify({ type: 'drawing_create', feature }))

      // Unit-path mode: place symbol at line endpoint
      if (activeSymbol && feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates
        const endCoord = coords[coords.length - 1]
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
    })
  })

  map.on('draw.update', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_update', feature }))

      // Move endpoint symbol when line vertices change
      if (feature.geometry.type === 'LineString') {
        const symId = pathSymbols.get(feature.id)
        if (symId) {
          const coords = feature.geometry.coordinates
          const endCoord = coords[coords.length - 1]
          const existing = localSymbols.get(symId)
          if (existing) {
            const updated = {
              ...existing,
              geometry: { type: 'Point', coordinates: endCoord }
            }
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
    // In drawing modes the click is consumed by the draw tool; only place on select
    if (draw.getMode() !== 'simple_select') return

    const id = `sym-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [e.lngLat.lng, e.lngLat.lat]
      },
      properties: {
        id,
        symbolName: activeSymbol
      }
    }

    localSymbols.set(id, feature)
    updateSymbolSource()
    socket.send(JSON.stringify({ type: 'symbol_create', feature }))
  })

  // ── Public API ────────────────────────────────────────────────────────────
  function setTool(mode) {
    draw.changeMode(mode)
  }

  function setActiveSymbol(name) {
    activeSymbol = name
    // Don't change draw mode — allows PEN + symbol for unit-path drawing
  }

  function setActiveLine(type, color) {
    activeLineType = type
    activeLineColor = color
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
      draw.delete(selected)
      selected.forEach(id => {
        socket.send(JSON.stringify({ type: 'drawing_delete', id }))
      })
    }
  }

  return {
    draw,
    setTool,
    setActiveSymbol,
    setActiveLine,
    undo,
    deleteSelected,
  }
}

function colorExpression() {
  return [
    'match',
    ['get', 'user_lineColor'],
    'BLUE', '#4488ff',
    'GREEN', '#44cc44',
    'RED', '#ff4444',
    'YELLOW', '#ffcc00',
    '#ff6b35'
  ]
}

function lineWidthExpression() {
  return [
    'match',
    ['get', 'user_lineType'],
    'FILL', 6,
    2
  ]
}

function lineDashExpression() {
  // MapLibre paint expressions for line-dasharray are limited;
  // we use a static default and handle DASHED via a separate layer
  return [1, 0]
}

function drawStyles() {
  const color = colorExpression()

  return [
    // Polygon fill
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: {
        'fill-color': color,
        'fill-opacity': 0.2
      }
    },
    // Polygon stroke
    {
      id: 'gl-draw-polygon-stroke',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: {
        'line-color': color,
        'line-width': 2
      }
    },
    // Line — solid / fill types
    {
      id: 'gl-draw-line-solid',
      type: 'line',
      filter: ['all',
        ['==', '$type', 'LineString'],
        ['!=', 'mode', 'static'],
        ['!in', 'user_lineType', 'DASHED']
      ],
      paint: {
        'line-color': color,
        'line-width': lineWidthExpression()
      }
    },
    // Line — dashed type
    {
      id: 'gl-draw-line-dashed',
      type: 'line',
      filter: ['all',
        ['==', '$type', 'LineString'],
        ['!=', 'mode', 'static'],
        ['==', 'user_lineType', 'DASHED']
      ],
      paint: {
        'line-color': color,
        'line-width': 2,
        'line-dasharray': [4, 3]
      }
    },
    // Vertex points (handles)
    {
      id: 'gl-draw-vertex',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 5,
        'circle-color': '#fff',
        'circle-stroke-width': 2,
        'circle-stroke-color': color
      }
    },
    // Midpoint handles
    {
      id: 'gl-draw-midpoint',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 3,
        'circle-color': '#fff',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#888'
      }
    },
    // Selected line highlight
    {
      id: 'gl-draw-line-active',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
      paint: {
        'line-color': color,
        'line-width': lineWidthExpression(),
        'line-opacity': 0.9
      }
    },
    // Selected polygon highlight
    {
      id: 'gl-draw-polygon-fill-active',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
      paint: {
        'fill-color': color,
        'fill-opacity': 0.3
      }
    },
    // Static (non-editable) features
    {
      id: 'gl-draw-polygon-fill-static',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
      paint: { 'fill-color': '#888', 'fill-opacity': 0.1 }
    },
    {
      id: 'gl-draw-polygon-stroke-static',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
      paint: { 'line-color': '#888', 'line-width': 2 }
    },
    {
      id: 'gl-draw-line-static',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'mode', 'static']],
      paint: { 'line-color': '#888', 'line-width': 2 }
    },
    {
      id: 'gl-draw-point-static',
      type: 'circle',
      filter: ['all', ['==', '$type', 'Point'], ['==', 'mode', 'static']],
      paint: { 'circle-radius': 5, 'circle-color': '#888' }
    }
  ]
}
