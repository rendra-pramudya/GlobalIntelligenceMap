import maplibregl from 'maplibre-gl'

const SOURCE_ID = 'conflict-source'

export function initConflict(map) {
  let visible = false

  map.on('load', async () => {
    const res = await fetch('/api/conflict')
    const data = await res.json()

    map.addSource(SOURCE_ID, { type: 'geojson', data })

    map.addLayer({
      id: 'conflict-heat',
      type: 'heatmap',
      source: SOURCE_ID,
      maxzoom: 7,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 0.1, 100, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.3, 'rgba(255,150,0,0.5)',
          0.7, 'rgba(255,50,0,0.7)',
          1,   'rgba(200,0,0,0.9)'
        ],
        'heatmap-radius': 20,
        'heatmap-opacity': 0.75
      },
      layout: { visibility: 'none' }
    })

    map.addLayer({
      id: 'conflict-points',
      type: 'circle',
      source: SOURCE_ID,
      minzoom: 5,
      paint: {
        'circle-radius': 5,
        'circle-color': [
          'match', ['get', 'type'],
          'Battles', '#e63946',
          'Explosions/Remote violence', '#ff6b35',
          'Violence against civilians', '#ff006e',
          '#aaa'
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff'
      },
      layout: { visibility: 'none' }
    })
  })

  function setVisibility(v) {
    const vis = v ? 'visible' : 'none'
    ;['conflict-heat', 'conflict-points'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    })
  }

  return {
    get visible() { return visible },
    show() { visible = true; setVisibility(true) },
    hide() { visible = false; setVisibility(false) },
    toggle() { visible ? this.hide() : this.show() }
  }
}
