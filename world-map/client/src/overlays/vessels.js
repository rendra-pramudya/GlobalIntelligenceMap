import maplibregl from 'maplibre-gl'

const SOURCE_ID = 'vessels-source'
const LAYER_ID = 'vessels-layer'

export function initVessels(map) {
  let visible = false
  let socket = null

  map.on('load', () => {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })

    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 5,
        'circle-color': [
          'match', ['get', 'type'],
          'cargo',     '#4488ff',
          'tanker',    '#ff8844',
          'passenger', '#44ff88',
          '#aaaaaa'
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.85
      },
      layout: { visibility: 'none' }
    })

    // Popup on click
    map.on('click', LAYER_ID, (e) => {
      const props = e.features[0].properties
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<b>${props.name || 'Unknown vessel'}</b><br>Type: ${props.type}<br>Speed: ${props.speed} kn`)
        .addTo(map)
    })
    map.on('mouseenter', LAYER_ID, () => map.getCanvas().style.cursor = 'pointer')
    map.on('mouseleave', LAYER_ID, () => map.getCanvas().style.cursor = '')
  })

  function connectWS() {
    socket = new WebSocket(`ws://${location.host}`)
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'vessels' && map.getSource(SOURCE_ID)) {
        map.getSource(SOURCE_ID).setData(msg.data)
      }
    })
    socket.addEventListener('close', () => {
      if (visible) setTimeout(connectWS, 3000) // auto-reconnect
    })
  }

  return {
    get visible() { return visible },
    show() {
      visible = true
      map.setLayoutProperty(LAYER_ID, 'visibility', 'visible')
      connectWS()
    },
    hide() {
      visible = false
      map.setLayoutProperty(LAYER_ID, 'visibility', 'none')
      if (socket) socket.close()
    },
    toggle() { visible ? this.hide() : this.show() }
  }
}
