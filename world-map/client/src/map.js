import maplibregl from 'maplibre-gl'

// ── Helper: build a simple raster-only MapLibre style ─────────────────────
function rasterStyle(tileUrl, attribution = '', tileSize = 256) {
  const tiles = Array.isArray(tileUrl) ? tileUrl : [tileUrl]
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles, tileSize, attribution } },
    layers:  [{ id: 'base-layer', type: 'raster', source: 'base' }]
  }
}

const ESRI  = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ESRI_ATTR  = '© Esri, HERE, Garmin, OpenStreetMap contributors'
const CARTO_ATTR = '© OpenStreetMap contributors © CARTO'
const USGS_ATTR  = 'USGS The National Map'

// Satellite imagery: ArcGIS World Imagery + reference label overlay
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256, maxzoom: 19,
      attribution: '© Esri, Maxar, Earthstar Geographics'
    },
    'satellite-labels': {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256, maxzoom: 19
    }
  },
  layers: [
    { id: 'satellite-bg',           type: 'raster', source: 'satellite' },
    { id: 'satellite-labels-layer', type: 'raster', source: 'satellite-labels',
      paint: { 'raster-opacity': 0.8 } }
  ]
}

export const PROVIDERS = {
  openfreemap: {
    label: 'OpenFreeMap',
    styles: {
      liberty:  { label: 'Liberty',  url: 'https://tiles.openfreemap.org/styles/liberty' },
      bright:   { label: 'Bright',   url: 'https://tiles.openfreemap.org/styles/bright' },
      positron: { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' }
    }
  },
  arcgis: {
    label: 'ArcGIS',
    styles: {
      streets: { label: 'Streets', url: rasterStyle(`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, ESRI_ATTR) },
      topo:    { label: 'Topo',    url: rasterStyle(`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, ESRI_ATTR) },
      gray:    { label: 'Gray',    url: rasterStyle(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, ESRI_ATTR) },
      dark:    { label: 'Dark',    url: rasterStyle(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, ESRI_ATTR) },
      natgeo:  { label: 'NatGeo', url: rasterStyle(`${ESRI}/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}`, ESRI_ATTR) }
    }
  },
  carto: {
    label: 'CartoDB',
    styles: {
      dark:    { label: 'Dark Matter', url: rasterStyle('https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', CARTO_ATTR) },
      light:   { label: 'Positron',   url: rasterStyle('https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', CARTO_ATTR) },
      voyager: { label: 'Voyager',    url: rasterStyle('https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', CARTO_ATTR) }
    }
  },
  usgs: {
    label: 'USGS',
    styles: {
      topo:    { label: 'Topo',         url: rasterStyle('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', USGS_ATTR) },
      imagery: { label: 'Imagery',      url: rasterStyle('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', USGS_ATTR) },
      hybrid:  { label: 'Hybrid',       url: rasterStyle('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', USGS_ATTR) },
      relief:  { label: 'Shaded Relief',url: rasterStyle('https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}', USGS_ATTR) }
    }
  },
  satellite: {
    label: '🛰 Satellite',
    styles: {
      imagery: { label: 'World Imagery', url: SATELLITE_STYLE }
    }
  }
}

// Keep SATELLITE_STYLE export for any code that still references it
export { SATELLITE_STYLE }

// Resolve a { provider, style } pair to a MapLibre style object or URL
export function resolveStyle(provider, style) {
  return PROVIDERS[provider]?.styles[style]?.url
      ?? PROVIDERS.openfreemap.styles.liberty.url
}


export function initMap(containerId, initialProvider = 'openfreemap', initialStyle = 'liberty') {
  return new Promise((resolve) => {
    const map = new maplibregl.Map({
      container: containerId,
      style: resolveStyle(initialProvider, initialStyle),
      center: [0, 20],
      zoom: 2,
      maxZoom: 18,
      antialias: true,
      preserveDrawingBuffer: true
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

export function setBaseMap(map, provider, style, onReady) {
  map.once('style.load', onReady)
  map.setStyle(resolveStyle(provider, style))
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
