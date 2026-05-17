import maplibregl from 'maplibre-gl'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'

// ── Helpers ────────────────────────────────────────────────────────────────

function parseColor(hex, fallback = '#4488ff') {
  if (!hex || typeof hex !== 'string') return fallback
  // KML uses aabbggrr (abgr), togeojson normalises to #rrggbb or rgba()
  return hex.startsWith('#') || hex.startsWith('rgb') ? hex : fallback
}

function featureLabel(props) {
  return props.name || props.Name || props.id || props.ID || ''
}

function buildPopupHTML(props) {
  const name = featureLabel(props)
  const desc = props.description || props.Description || ''
  const rows = Object.entries(props)
    .filter(([k]) => !['styleUrl','stroke','stroke-width','stroke-opacity',
                        'fill','fill-opacity','name','Name','description',
                        'Description','icon','visibility'].includes(k))
    .slice(0, 12)
    .map(([k, v]) => `<tr><td>${k}</td><td>${String(v).slice(0,120)}</td></tr>`)
    .join('')
  return `<div class="kml-popup">
    ${name ? `<div class="kml-popup-title">${name}</div>` : ''}
    ${desc ? `<div class="kml-popup-desc">${desc}</div>` : ''}
    ${rows ? `<table class="kml-popup-table">${rows}</table>` : ''}
  </div>`
}

// ── Main factory ───────────────────────────────────────────────────────────

export function initKMLLayer(map) {
  // Each imported file gets an entry: { id, name, geojson, visible }
  const files = []
  let nextId   = 1
  let popup    = null

  // ── Source / layer registration ───────────────────────────────────────────

  function sourceId(id)       { return `kml-source-${id}` }
  function layerPoints(id)    { return `kml-points-${id}` }
  function layerLines(id)     { return `kml-lines-${id}` }
  function layerPolygons(id)  { return `kml-polygons-${id}` }
  function layerOutlines(id)  { return `kml-outlines-${id}` }
  function layerLabels(id)    { return `kml-labels-${id}` }

  function addLayers(file) {
    const sid = sourceId(file.id)
    if (map.getSource(sid)) return

    map.addSource(sid, { type: 'geojson', data: file.geojson })

    // Polygons (fill)
    map.addLayer({
      id: layerPolygons(file.id), type: 'fill', source: sid,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color':   ['coalesce', ['get', 'fill'],         '#4488ff'],
        'fill-opacity': ['coalesce', ['get', 'fill-opacity'], 0.35]
      }
    })
    // Polygon outlines
    map.addLayer({
      id: layerOutlines(file.id), type: 'line', source: sid,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'line-color':   ['coalesce', ['get', 'stroke'],         '#2266cc'],
        'line-width':   ['coalesce', ['get', 'stroke-width'],   2],
        'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 0.9]
      }
    })
    // Lines
    map.addLayer({
      id: layerLines(file.id), type: 'line', source: sid,
      filter: ['==', '$type', 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color':   ['coalesce', ['get', 'stroke'],         '#ff6622'],
        'line-width':   ['coalesce', ['get', 'stroke-width'],   2.5],
        'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 0.9]
      }
    })
    // Points (circle)
    map.addLayer({
      id: layerPoints(file.id), type: 'circle', source: sid,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color':        ['coalesce', ['get', 'marker-color'], '#ff3355'],
        'circle-radius':       6,
        'circle-stroke-color': 'rgba(255,255,255,0.85)',
        'circle-stroke-width': 1.5
      }
    })
    // Labels (name field)
    map.addLayer({
      id: layerLabels(file.id), type: 'symbol', source: sid,
      filter: ['has', 'name'],
      layout: {
        'text-field':  ['get', 'name'],
        'text-size':   11,
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
        'text-font':   ['Open Sans Regular', 'Arial Unicode MS Regular']
      },
      paint: {
        'text-color':        '#ffffff',
        'text-halo-color':   'rgba(0,0,0,0.7)',
        'text-halo-width':   1.5
      }
    })

    // Click popup on any feature type
    const clickLayers = [layerPoints(file.id), layerLines(file.id), layerPolygons(file.id)]
    clickLayers.forEach(lyr => {
      map.on('click', lyr, (e) => {
        const props = e.features[0].properties
        const coords = e.lngLat
        popup?.remove()
        popup = new maplibregl.Popup({ maxWidth: '300px' })
          .setLngLat(coords)
          .setHTML(buildPopupHTML(props))
          .addTo(map)
      })
      map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = '' })
    })
  }

  function setVisibility(file, visible) {
    file.visible = visible
    const vis = visible ? 'visible' : 'none'
    ;[layerPolygons, layerOutlines, layerLines, layerPoints, layerLabels]
      .forEach(fn => {
        const lyr = fn(file.id)
        if (map.getLayer(lyr)) map.setLayoutProperty(lyr, 'visibility', vis)
      })
  }

  function removeLayers(file) {
    ;[layerPolygons, layerOutlines, layerLines, layerPoints, layerLabels]
      .forEach(fn => { try { map.removeLayer(fn(file.id)) } catch {} })
    try { map.removeSource(sourceId(file.id)) } catch {}
  }

  // ── KML parsing ────────────────────────────────────────────────────────────

  function parseKML(text) {
    const parser = new DOMParser()
    const doc    = parser.parseFromString(text, 'text/xml')
    const err    = doc.querySelector('parsererror')
    if (err) throw new Error('Invalid KML/XML: ' + err.textContent.slice(0, 80))
    return kmlToGeoJSON(doc)
  }

  // ── File import ────────────────────────────────────────────────────────────

  function importFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = (e) => {
        try {
          const geojson = parseKML(e.target.result)
          if (!geojson.features?.length) {
            reject(new Error('No features found in KML'))
            return
          }
          const entry = { id: nextId++, name: file.name.replace(/\.kmz?$/i, ''), geojson, visible: true }
          files.push(entry)
          addLayers(entry)
          resolve(entry)
        } catch (err) { reject(err) }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    get files() { return files },

    openFilePicker() {
      const input = Object.assign(document.createElement('input'), {
        type: 'file', accept: '.kml,.xml', multiple: true
      })
      input.addEventListener('change', async () => {
        for (const file of input.files) {
          try { await importFile(file) }
          catch (e) { console.warn('KML import failed:', e.message) }
        }
        this.onchange?.()
      })
      input.click()
    },

    // drop handler — call this from dragover/drop listeners
    handleDrop(dt) {
      const promises = [...dt.files]
        .filter(f => /\.kml$/i.test(f.name))
        .map(f => importFile(f).catch(e => console.warn('KML drop failed:', e.message)))
      Promise.all(promises).then(() => this.onchange?.())
    },

    setVisible(id, visible) {
      const f = files.find(f => f.id === id)
      if (f) setVisibility(f, visible)
    },

    remove(id) {
      const idx = files.findIndex(f => f.id === id)
      if (idx === -1) return
      removeLayers(files[idx])
      files.splice(idx, 1)
      this.onchange?.()
    },

    fitToFile(id) {
      const f = files.find(f => f.id === id)
      if (!f?.geojson.features.length) return
      // Compute bbox manually
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
      function scanCoords(c) {
        if (typeof c[0] === 'number') {
          minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0])
          minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1])
        } else { c.forEach(scanCoords) }
      }
      f.geojson.features.forEach(ft => ft.geometry && scanCoords(ft.geometry.coordinates))
      if (isFinite(minLon)) map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, duration: 1000 })
    },

    onchange: null  // set by UI
  }
}
