const SRC   = 'wm-grid-src'
const LINES = 'wm-grid-lines'
const LBLS  = 'wm-grid-labels'

const DEFAULTS = {
  enabled:    false,
  color:      '#ffffff',
  opacity:    0.25,
  width:      0.6,
  latSpacing: 30,
  lonSpacing: 30,
  showLabels: false
}

function buildGrid(latSpacing, lonSpacing) {
  const features = []

  // Parallels
  for (let lat = -90; lat <= 90; lat += latSpacing) {
    const y = Math.max(-85, Math.min(85, lat))
    const isEquator = lat === 0
    features.push({
      type: 'Feature',
      properties: {
        kind: 'parallel',
        v: lat,
        label: isEquator ? 'Equator' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`,
        major: isEquator
      },
      geometry: { type: 'LineString', coordinates: [[-180, y], [180, y]] }
    })
  }

  // Meridians
  for (let lon = -180; lon <= 180; lon += lonSpacing) {
    const isPrime = lon === 0
    features.push({
      type: 'Feature',
      properties: {
        kind: 'meridian',
        v: lon,
        label: isPrime ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`,
        major: isPrime
      },
      geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 85]] }
    })
  }

  return { type: 'FeatureCollection', features }
}

function firstSymbolLayer(map) {
  for (const l of (map.getStyle()?.layers || []))
    if (l.type === 'symbol') return l.id
}

export function initGridlines(map) {
  let cfg = { ...DEFAULTS }

  function addLayers() {
    if (map.getSource(SRC)) return
    map.addSource(SRC, { type: 'geojson', data: buildGrid(cfg.latSpacing, cfg.lonSpacing) })

    const before = firstSymbolLayer(map)

    map.addLayer({
      id: LINES,
      type: 'line',
      source: SRC,
      layout: {
        visibility: cfg.enabled ? 'visible' : 'none',
        'line-cap': 'butt'
      },
      paint: {
        'line-color': cfg.color,
        'line-opacity': [
          'case', ['get', 'major'],
          Math.min(1, cfg.opacity * 1.6),
          cfg.opacity
        ],
        'line-width': [
          'case', ['get', 'major'],
          cfg.width * 1.4,
          cfg.width
        ],
        'line-dasharray': [6, 5]
      }
    }, before)

    map.addLayer({
      id: LBLS,
      type: 'symbol',
      source: SRC,
      layout: {
        visibility: (cfg.enabled && cfg.showLabels) ? 'visible' : 'none',
        'text-field': ['get', 'label'],
        'text-size': 9,
        'symbol-placement': 'line',
        'text-max-angle': 90,
        'symbol-spacing': 400,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
      },
      paint: {
        'text-color': cfg.color,
        'text-opacity': cfg.opacity + 0.15,
        'text-halo-color': 'rgba(0,0,0,0.6)',
        'text-halo-width': 1.5
      }
    })
  }

  function removeLayers() {
    if (map.getLayer(LBLS))  map.removeLayer(LBLS)
    if (map.getLayer(LINES)) map.removeLayer(LINES)
    if (map.getSource(SRC))  map.removeSource(SRC)
  }

  function paint() {
    if (!map.getLayer(LINES)) return
    const vis  = cfg.enabled ? 'visible' : 'none'
    const lvis = (cfg.enabled && cfg.showLabels) ? 'visible' : 'none'

    map.setLayoutProperty(LINES, 'visibility', vis)
    map.setLayoutProperty(LBLS,  'visibility', lvis)
    map.setPaintProperty(LINES, 'line-color', cfg.color)
    map.setPaintProperty(LINES, 'line-opacity', [
      'case', ['get', 'major'], Math.min(1, cfg.opacity * 1.6), cfg.opacity
    ])
    map.setPaintProperty(LINES, 'line-width', [
      'case', ['get', 'major'], cfg.width * 1.4, cfg.width
    ])
    map.setPaintProperty(LBLS, 'text-color', cfg.color)
    map.setPaintProperty(LBLS, 'text-opacity', cfg.opacity + 0.15)
  }

  map.on('style.load', () => { removeLayers(); addLayers() })
  if (map.isStyleLoaded()) addLayers()

  return {
    get config() { return { ...cfg } },

    setConfig(updates) {
      const spacingChanged =
        (updates.latSpacing != null && updates.latSpacing !== cfg.latSpacing) ||
        (updates.lonSpacing != null && updates.lonSpacing !== cfg.lonSpacing)

      Object.assign(cfg, updates)

      if (spacingChanged) {
        removeLayers()
        addLayers()
      } else {
        if (map.getSource(SRC)) map.getSource(SRC).setData(buildGrid(cfg.latSpacing, cfg.lonSpacing))
        paint()
      }
    },

    getState() { return { ...cfg } },
    reset()    { this.setConfig({ ...DEFAULTS }) }
  }
}
