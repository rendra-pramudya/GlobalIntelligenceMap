import maplibregl from 'maplibre-gl'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export function initMap(containerId) {
  return new Promise((resolve) => {
    const map = new maplibregl.Map({
      container: containerId,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 2,
      maxZoom: 18,
      antialias: true
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => resolve(map))
  })
}

export function setProjection(map, projection) {
  map.setProjection(projection === 'globe' ? { type: 'globe' } : { type: 'mercator' })

  if (projection === 'globe') {
    map.setSky({
      'sky-type': 'atmosphere',
      'sky-atmosphere-sun-intensity': 15,
      'sky-atmosphere-color': 'rgba(36, 92, 223, 1)',
      'sky-gradient-radius': 90
    })
  } else {
    map.setSky(null)
  }
}
