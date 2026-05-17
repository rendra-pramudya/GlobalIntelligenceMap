const STORAGE_KEY = 'wm_map_styles'

export const EMPTY_STYLE = {
  // Tile source
  provider: 'openfreemap',
  mapStyle: 'liberty',

  // Appearance (CSS filters)
  brightness:   100,
  contrast:     100,
  saturation:   100,
  gamma:        100,
  tintColor:    '#0044ff',
  tintStrength: 0,
  colorizeOn:   false,
  colorizeHue:  200,

  // Gridlines
  gridlines: {
    enabled:    false,
    color:      '#ffffff',
    opacity:    0.25,
    width:      0.6,
    latSpacing: 30,
    lonSpacing: 30,
    showLabels: false
  },

  // Label overrides (null = style default)
  labels: {
    country: { visible: null, color: null, size: null },
    city:    { visible: null, color: null, size: null },
    sea:     { visible: null, color: null, size: null },
    place:   { visible: null, color: null, size: null }
  },

  // Line overrides (null = style default)
  lines: {
    border:    { visible: null, color: null, width: null },
    disputed:  { visible: null, color: null, width: null },
    coastline: { visible: null, color: null, width: null }
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function initMapStyleStore() {
  let styles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  }

  return {
    get styles() { return styles },

    save(name, data) {
      const idx = styles.findIndex(s => s.name === name)
      const record = { ...EMPTY_STYLE, ...data, name, updatedAt: Date.now() }
      if (idx >= 0) {
        record.id = styles[idx].id
        record.createdAt = styles[idx].createdAt
        styles[idx] = record
      } else {
        record.id = uid()
        record.createdAt = Date.now()
        styles.push(record)
      }
      persist()
      return record
    },

    delete(id) {
      styles = styles.filter(s => s.id !== id)
      persist()
    },

    duplicate(id) {
      const src = styles.find(s => s.id === id)
      if (!src) return null
      const copy = { ...src, id: uid(), name: `${src.name} (copy)`, createdAt: Date.now() }
      styles.push(copy)
      persist()
      return copy
    },

    getById(id) {
      return styles.find(s => s.id === id) ?? null
    }
  }
}
