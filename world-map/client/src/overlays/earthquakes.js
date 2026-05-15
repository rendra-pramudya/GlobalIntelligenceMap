import maplibregl from 'maplibre-gl'

const SOURCE_ID = 'earthquakes-source'

export function initEarthquakes(map) {
  let visible = false

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })

  map.addLayer({
    id: 'earthquakes-heat',
    type: 'heatmap',
    source: SOURCE_ID,
    maxzoom: 6,
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 8, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 3],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)',
        0.2, 'rgb(103,169,207)',
        0.4, 'rgb(209,229,240)',
        0.6, 'rgb(253,219,199)',
        0.8, 'rgb(239,138,98)',
        1, 'rgb(178,24,43)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 6, 20],
      'heatmap-opacity': 0.8
    }
  })

  map.addLayer({
    id: 'earthquakes-circles',
    type: 'circle',
    source: SOURCE_ID,
    minzoom: 4,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 8, 30],
      'circle-color': [
        'interpolate', ['linear'], ['get', 'mag'],
        1, '#ffffb2', 3, '#fecc5c', 5, '#fd8d3c', 7, '#e31a1c'
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.75
    }
  })

  map.on('click', 'earthquakes-circles', (e) => {
    const props = e.features[0].properties
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<b>M${props.mag} ${props.place}</b><br>${new Date(props.time).toUTCString()}`)
      .addTo(map)
  })

  // Fetch data immediately
  fetch('/api/earthquakes?period=week')
    .then(r => r.json())
    .then(data => { if (map.getSource(SOURCE_ID)) map.getSource(SOURCE_ID).setData(data) })
    .catch(e => console.warn('Earthquakes fetch failed:', e.message))

  function setVisibility(v) {
    const vis = v ? 'visible' : 'none'
    ;['earthquakes-heat', 'earthquakes-circles'].forEach(id => {
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
