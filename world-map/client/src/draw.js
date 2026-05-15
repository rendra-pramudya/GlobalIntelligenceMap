import MaplibreDraw from 'maplibre-gl-draw'

export function initDraw(map) {
  const draw = new MaplibreDraw({
    displayControlsDefault: false,
    controls: {
      point: true,
      line_string: true,
      polygon: true,
      trash: true
    },
    styles: drawStyles()
  })

  map.addControl(draw, 'top-left')

  // Connect to server WebSocket for draw sync
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
  })

  // Broadcast draw events to other clients
  map.on('draw.create', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_create', feature }))
    })
  })

  map.on('draw.update', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_update', feature }))
    })
  })

  map.on('draw.delete', ({ features }) => {
    features.forEach(feature => {
      socket.send(JSON.stringify({ type: 'drawing_delete', id: feature.id }))
    })
  })

  // Disable Deck.gl picking when draw mode is active so draw events win
  map.on('draw.modechange', ({ mode }) => {
    const isDrawing = mode !== 'simple_select' && mode !== 'direct_select'
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : ''
  })

  return { draw, socket }
}

function drawStyles() {
  return [
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': '#ff6b35', 'fill-opacity': 0.25 }
    },
    {
      id: 'gl-draw-polygon-stroke',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'line-color': '#ff6b35', 'line-width': 2 }
    },
    {
      id: 'gl-draw-line',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      paint: { 'line-color': '#ff6b35', 'line-width': 2, 'line-dasharray': [4, 2] }
    },
    {
      id: 'gl-draw-point',
      type: 'circle',
      filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
      paint: { 'circle-radius': 6, 'circle-color': '#ff6b35', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
    },
    {
      id: 'gl-draw-vertex',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#ff6b35' }
    }
  ]
}
