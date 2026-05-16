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

    map.on('load', () => {
      initCustomInteractions(map)
      resolve(map)
    })
  })
}

// Middle-mouse + two-finger controls for pitch (tilt) and bearing (rotate).
// Replaces MapLibre's default right-click drag and two-finger zoom/rotate.
function initCustomInteractions(map) {
  const canvas = map.getCanvas()

  map.dragRotate.disable()       // replaced by middle-mouse
  map.touchZoomRotate.disable()  // replaced by two-finger handler below

  // ── Middle mouse button ──────────────────────────────────────────────────
  // Drag up/down → pitch   |   Drag left/right → bearing
  let midDrag = null

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return
    e.preventDefault()
    midDrag = { x: e.clientX, y: e.clientY, pitch: map.getPitch(), bearing: map.getBearing() }
  })

  window.addEventListener('mousemove', (e) => {
    if (!midDrag) return
    const dx = e.clientX - midDrag.x
    const dy = e.clientY - midDrag.y
    map.setPitch(Math.max(0, Math.min(85, midDrag.pitch - dy * 0.4)))
    map.setBearing(midDrag.bearing + dx * 0.3)
  })

  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) midDrag = null
  })

  // ── Two-finger touch / touchpad ──────────────────────────────────────────
  // Centroid up/down → pitch   |   Centroid left/right → bearing
  // Finger distance change → zoom  (keeps pinch-to-zoom working)
  let twoTouch = null

  function touchMid(touches) {
    const a = touches[0], b = touches[1]
    return {
      x:    (a.clientX + b.clientX) / 2,
      y:    (a.clientY + b.clientY) / 2,
      dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    }
  }

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const m = touchMid(e.touches)
    twoTouch = { ...m, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
  }, { passive: false })

  canvas.addEventListener('touchmove', (e) => {
    if (!twoTouch || e.touches.length !== 2) return
    e.preventDefault()
    const m = touchMid(e.touches)
    map.easeTo({
      pitch:   Math.max(0, Math.min(85, twoTouch.pitch - (m.y - twoTouch.y) * 0.4)),
      bearing: twoTouch.bearing + (m.x - twoTouch.x) * 0.3,
      zoom:    twoTouch.zoom + Math.log2(m.dist / twoTouch.dist),
      duration: 0
    })
  }, { passive: false })

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) twoTouch = null
  }, { passive: false })
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
