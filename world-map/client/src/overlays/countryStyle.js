const GEO_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
const STORAGE_KEY = 'wm_country_styles'
const SRC = 'wm-country-src'
const FILL_ID = 'wm-country-fill'
const LINE_ID = 'wm-country-line'

export function initCountryStyle(map) {
  let styles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  let selectedISO = null
  let geoData = null
  let enabled = false
  let _onchange = null
  let _onselect = null

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  }

  function buildFillColor() {
    const merged = { ...styles }
    // Selected country always shown with highlight color
    if (selectedISO) merged[selectedISO] = { ...merged[selectedISO], color: '#6699ff', opacity: merged[selectedISO]?.opacity ?? 0.25 }
    const entries = Object.entries(merged)
    if (!entries.length) return 'transparent'
    return ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso, s]) => [iso, s.color]), 'transparent']
  }

  function buildFillOpacity() {
    const merged = { ...styles }
    if (selectedISO) {
      merged[selectedISO] = { color: merged[selectedISO]?.color ?? '#6699ff', opacity: 0.25 }
    }
    const entries = Object.entries(merged)
    if (!entries.length) return 0
    return ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso, s]) => [iso, s.opacity ?? 0.4]), 0]
  }

  function buildLineColor() {
    if (!selectedISO) return '#ffffff'
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], '#4488ff', '#ffffff']
  }

  function buildLineWidth() {
    if (!selectedISO) return 0.5
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], 2.5, 0.5]
  }

  function buildLineOpacity() {
    const entries = Object.entries(styles)
    const base = entries.length
      ? ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso]) => [iso, 0.85]), 0]
      : 0
    if (!selectedISO) return base
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], 1, base]
  }

  function updatePaint() {
    if (!map.getLayer(FILL_ID)) return
    map.setPaintProperty(FILL_ID, 'fill-color', buildFillColor())
    map.setPaintProperty(FILL_ID, 'fill-opacity', buildFillOpacity())
    map.setPaintProperty(LINE_ID, 'line-color', buildLineColor())
    map.setPaintProperty(LINE_ID, 'line-width', buildLineWidth())
    map.setPaintProperty(LINE_ID, 'line-opacity', buildLineOpacity())
  }

  function firstSymbolLayer() {
    for (const l of (map.getStyle()?.layers || [])) {
      if (l.type === 'symbol') return l.id
    }
    return undefined
  }

  function handleClick(e) {
    if (!enabled) return
    const iso = e.features?.[0]?.properties?.ISO_A3
    if (!iso || iso === '-99') return
    selectedISO = (selectedISO === iso) ? null : iso
    updatePaint()
    _onselect?.(selectedISO)
    _onchange?.()
  }

  const handleMouseEnter = () => { if (enabled) map.getCanvas().style.cursor = 'crosshair' }
  const handleMouseLeave = () => { if (enabled) map.getCanvas().style.cursor = '' }

  function addLayers() {
    if (map.getSource(SRC)) return

    map.addSource(SRC, { type: 'geojson', data: geoData, generateId: true })

    const before = firstSymbolLayer()
    map.addLayer({ id: FILL_ID, type: 'fill', source: SRC,
      paint: { 'fill-color': buildFillColor(), 'fill-opacity': buildFillOpacity() }
    }, before)

    map.addLayer({ id: LINE_ID, type: 'line', source: SRC,
      paint: { 'line-color': buildLineColor(), 'line-width': buildLineWidth(), 'line-opacity': buildLineOpacity() }
    }, before)

    map.on('click', FILL_ID, handleClick)
    map.on('mouseenter', FILL_ID, handleMouseEnter)
    map.on('mouseleave', FILL_ID, handleMouseLeave)
  }

  function removeLayers() {
    map.off('click', FILL_ID, handleClick)
    map.off('mouseenter', FILL_ID, handleMouseEnter)
    map.off('mouseleave', FILL_ID, handleMouseLeave)
    if (map.getLayer(FILL_ID)) map.removeLayer(FILL_ID)
    if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID)
    if (map.getSource(SRC)) map.removeSource(SRC)
  }

  // Re-add layers when style reloads (base map switch wipes everything)
  map.on('style.load', () => {
    if (enabled && geoData) addLayers()
  })

  let loadPromise = null
  function ensureData() {
    if (geoData) return Promise.resolve()
    if (loadPromise) return loadPromise
    loadPromise = fetch(GEO_URL)
      .then(r => r.json())
      .then(data => { geoData = data })
      .catch(e => { console.error('Country GeoJSON load failed:', e); loadPromise = null })
    return loadPromise
  }

  return {
    get selectedISO() { return selectedISO },
    get styles() { return styles },
    get enabled() { return enabled },
    set onchange(fn) { _onchange = fn },
    set onselect(fn) { _onselect = fn },

    async enable() {
      enabled = true
      await ensureData()
      if (geoData) addLayers()
    },

    disable() {
      enabled = false
      selectedISO = null
      map.getCanvas().style.cursor = ''
      removeLayers()
      _onchange?.()
    },

    deselect() {
      selectedISO = null
      updatePaint()
      _onselect?.(null)
      _onchange?.()
    },

    setStyle(iso, color, opacity) {
      styles[iso] = { color, opacity }
      persist()
      updatePaint()
      _onchange?.()
    },

    removeStyle(iso) {
      delete styles[iso]
      if (selectedISO === iso) { selectedISO = null; _onselect?.(null) }
      persist()
      updatePaint()
      _onchange?.()
    },

    clearAll() {
      styles = {}
      selectedISO = null
      persist()
      updatePaint()
      _onselect?.(null)
      _onchange?.()
    },

    getCountryName(iso) {
      if (!geoData || !iso) return iso || ''
      const feat = geoData.features.find(f => f.properties.ISO_A3 === iso)
      return feat?.properties.ADMIN || feat?.properties.NAME || iso
    }
  }
}
