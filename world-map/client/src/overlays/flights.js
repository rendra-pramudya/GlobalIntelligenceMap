const LAYER_ID = 'flights-layer'
const SOURCE_ID = 'flights-source'

export function initFlights(map) {
  let visible = false
  let interval = null

  map.on('load', () => {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })

    // Aircraft icon using built-in circle + text fallback
    // For a proper airplane icon: add an image with map.loadImage() first
    map.addLayer({
      id: LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'icon-image': 'airport',       // built-in maplibre icon
        'icon-size': 0.8,
        'icon-rotation-alignment': 'map',
        'icon-rotate': ['get', 'heading'],
        'icon-allow-overlap': true,
        'text-field': ['get', 'callsign'],
        'text-size': 10,
        'text-offset': [0, 1.2],
        'text-optional': true,
        'visibility': 'none'
      },
      paint: { 'text-color': '#f0c040', 'text-halo-color': '#000', 'text-halo-width': 1 },
      filter: ['!=', ['get', 'onGround'], true]
    })
  })

  async function refresh() {
    const bbox = map.getBounds()
    const params = new URLSearchParams({
      minLat: bbox.getSouth(),
      maxLat: bbox.getNorth(),
      minLon: bbox.getWest(),
      maxLon: bbox.getEast()
    })
    try {
      const res = await fetch(`/api/flights?${params}`)
      const data = await res.json()
      if (map.getSource(SOURCE_ID)) {
        map.getSource(SOURCE_ID).setData(data)
      }
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
    },
    toggle() { visible ? this.hide() : this.show() }
  }
}
