import maplibregl from 'maplibre-gl'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
// Alternative free styles: 'bright', 'positron', 'dark-matter' from openfreemap.org

export function initMap(containerId) {
  return new Promise((resolve) => {
    const map = new maplibregl.Map({
      container: containerId,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 2,
      maxZoom: 18,
      projection: 'mercator', // start flat, toggle to 'globe'
      antialias: true         // needed for smooth globe rendering
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => resolve(map))
  })
}

// Call from UI toggle button
export function setProjection(map, projection) {
  // projection: 'mercator' | 'globe'
  map.setProjection(projection)

  // In globe mode, enable atmosphere and sky layer
  if (projection === 'globe') {
    if (!map.getLayer('sky')) {
      map.setFog({
        color: 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.8
      })
    }
  } else {
    map.setFog(null)
  }
}
