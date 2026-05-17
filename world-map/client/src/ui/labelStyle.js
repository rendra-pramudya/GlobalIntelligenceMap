// Layer pattern matching for OpenMapTiles / OpenFreeMap vector tile schemas.
// Matches by layer id and source-layer name (more reliable than id alone).

const LABEL_CATS = {
  country: {
    idPat:  /country|nation|admin.?0|state.?label/i,
    srcPat: /place/i,
    minRank: null
  },
  city: {
    idPat:  /city|town|capital|place.?(city|town|metro)/i,
    srcPat: /place/i
  },
  sea: {
    idPat:  /water.?(name|label)|sea|ocean|bay|gulf|lake.?name/i,
    srcPat: /water_?name|waterway/i
  },
  place: {
    idPat:  /place|village|hamlet|suburb|locality|neighbourhood/i,
    srcPat: /place/i
  }
}

const LINE_CATS = {
  border: {
    idPat: /boundary|border|admin/i,
    srcPat: /boundary|admin/i
  },
  disputed: {
    idPat: /disputed|claim|dash/i,
    srcPat: /boundary|admin/i
  },
  coastline: {
    idPat: /coast|shoreline|land.?water|water.?land/i,
    srcPat: /natural|land/i
  }
}

function matchLayer(l, cats) {
  const id = l.id.toLowerCase()
  const src = (l['source-layer'] || '').toLowerCase()
  for (const [cat, { idPat, srcPat }] of Object.entries(cats)) {
    if (idPat.test(id) || (src && srcPat && srcPat.test(src) && idPat.test(id))) {
      return cat
    }
  }
  return null
}

export function initLabelStyle(map) {
  // Stored overrides — null means "leave style default"
  const overrides = {
    labels: {
      country: { visible: null, color: null, size: null },
      city:    { visible: null, color: null, size: null },
      sea:     { visible: null, color: null, size: null },
      place:   { visible: null, color: null, size: null }
    },
    lines: {
      border:    { visible: null, color: null, width: null },
      disputed:  { visible: null, color: null, width: null },
      coastline: { visible: null, color: null, width: null }
    }
  }

  let _cats = null

  function getCats() {
    if (_cats) return _cats
    const layers = map.getStyle()?.layers || []
    _cats = { labels: {}, lines: {} }

    for (const l of layers) {
      if (l.type === 'symbol') {
        const cat = matchLayer(l, LABEL_CATS)
        if (cat) (_cats.labels[cat] = _cats.labels[cat] || []).push(l.id)
      }
      if (l.type === 'line') {
        const cat = matchLayer(l, LINE_CATS)
        if (cat) (_cats.lines[cat] = _cats.lines[cat] || []).push(l.id)
      }
    }
    return _cats
  }

  function applyOverrides() {
    const cats = getCats()

    for (const [cat, o] of Object.entries(overrides.labels)) {
      for (const id of (cats.labels[cat] || [])) {
        if (!map.getLayer(id)) continue
        if (o.visible != null) map.setLayoutProperty(id, 'visibility', o.visible ? 'visible' : 'none')
        if (o.color   != null) map.setPaintProperty(id,  'text-color', o.color)
        if (o.size    != null) map.setLayoutProperty(id, 'text-size',  o.size)
      }
    }

    for (const [cat, o] of Object.entries(overrides.lines)) {
      for (const id of (cats.lines[cat] || [])) {
        if (!map.getLayer(id)) continue
        if (o.visible != null) map.setLayoutProperty(id, 'visibility', o.visible ? 'visible' : 'none')
        if (o.color   != null) map.setPaintProperty(id,  'line-color', o.color)
        if (o.width   != null) map.setPaintProperty(id,  'line-width', o.width)
        if (cat === 'disputed') {
          map.setPaintProperty(id, 'line-dasharray', [4, 3])
        }
      }
    }
  }

  // Invalidate cache + reapply after every style change
  map.on('style.load', () => {
    _cats = null
    applyOverrides()
  })

  function isVectorStyle() {
    const srcs = map.getStyle()?.sources ?? {}
    return Object.values(srcs).some(s => s.type === 'vector')
  }

  return {
    isVectorStyle,

    setLabel(cat, opts) {
      Object.assign(overrides.labels[cat], opts)
      applyOverrides()
    },

    setLine(cat, opts) {
      Object.assign(overrides.lines[cat], opts)
      applyOverrides()
    },

    getState() {
      return {
        labels: JSON.parse(JSON.stringify(overrides.labels)),
        lines:  JSON.parse(JSON.stringify(overrides.lines))
      }
    },

    loadState(state) {
      if (state?.labels) {
        for (const [k, v] of Object.entries(state.labels))
          Object.assign(overrides.labels[k] ?? {}, v)
      }
      if (state?.lines) {
        for (const [k, v] of Object.entries(state.lines))
          Object.assign(overrides.lines[k] ?? {}, v)
      }
      applyOverrides()
    },

    reset() {
      for (const cat of Object.keys(overrides.labels))
        overrides.labels[cat] = { visible: null, color: null, size: null }
      for (const cat of Object.keys(overrides.lines))
        overrides.lines[cat] = { visible: null, color: null, width: null }
      applyOverrides()
    }
  }
}
