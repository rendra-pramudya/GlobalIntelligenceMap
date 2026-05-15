const LAYER_ID = 'flights-layer'
const SOURCE_ID = 'flights-source'

export function initFlights(map) {
  let visible = false
  let interval = null

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 4,
      'circle-color': '#f0c040',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000',
      'circle-opacity': 0.9
    }
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
