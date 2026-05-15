import maplibregl from 'maplibre-gl'

export const BASE_MAPS = {
  standard: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© Esri, Maxar, Earthstar Geographics'
      },
      'satellite-labels': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19
      }
    },
    layers: [
      { id: 'satellite-bg', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22 },
      { id: 'satellite-labels-layer', type: 'raster', source: 'satellite-labels', minzoom: 0, maxzoom: 22, paint: { 'raster-opacity': 0.8 } }
    ]
  }
}

export function initMap(containerId) {
  return new Promise((resolve) => {
    const map = new maplibregl.Map({
      container: containerId,
      style: BASE_MAPS.standard,
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
  map.setProjection({ type: projection })

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

export function setBaseMap(map, baseMapKey, onReady) {
  map.once('style.load', onReady)
  map.setStyle(BASE_MAPS[baseMapKey])
}

const TERRAIN_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15
}

export function enableTerrain(map) {
  if (!map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', TERRAIN_SOURCE)
  }
  map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
}

export function disableTerrain(map) {
  map.setTerrain(null)
}
