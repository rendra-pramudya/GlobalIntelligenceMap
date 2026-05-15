const LAYER_ID = 'weather-layer'

export function initWeather(map) {
  let visible = false
  let currentLayer = 'precipitation_new' // clouds_new | temp_new | wind_new | pressure_new

  map.on('load', () => {
    map.addSource('weather-source', {
      type: 'raster',
      tiles: [`/api/weather/tile/${currentLayer}/{z}/{x}/{y}`],
      tileSize: 256,
      attribution: 'OpenWeatherMap'
    })

    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: 'weather-source',
      paint: { 'raster-opacity': 0.65 },
      layout: { visibility: 'none' }
    })
  })

  return {
    get visible() { return visible },
    show() { visible = true; map.setLayoutProperty(LAYER_ID, 'visibility', 'visible') },
    hide() { visible = false; map.setLayoutProperty(LAYER_ID, 'visibility', 'none') },
    toggle() { visible ? this.hide() : this.show() },
    setLayer(layerName) {
      currentLayer = layerName
      const source = map.getSource('weather-source')
      if (source) {
        source.setTiles([`/api/weather/tile/${layerName}/{z}/{x}/{y}`])
      }
    }
  }
}
