import { setProjection, enableTerrain, disableTerrain } from '../map.js'
import { initSettings } from './settings.js'

export function initControls(map, drawContext, overlays) {
  let _overlays = overlays
  let _onBaseMapChange = null

  const panel = document.createElement('div')
  panel.id = 'controls'
  panel.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">World Map</span>
        <div class="panel-header-actions">
          <button class="settings-btn" id="minimize-panel" title="Minimize">−</button>
          <button class="settings-btn" id="open-settings" title="API Settings">⚙</button>
        </div>
      </div>

      <div class="panel-body">
      <div class="place-finder">
        <input id="place-input" class="place-input" type="text" placeholder="Find a place…" />
        <button id="place-go" class="place-go-btn">Go</button>
      </div>

      <div class="section-label">Base Map</div>
      <div class="basemap-toggle">
        <button id="btn-standard" class="basemap-btn active">Standard</button>
        <button id="btn-satellite" class="basemap-btn">Satellite</button>
      </div>

      <div class="section-label">Projection</div>
      <div class="projection-toggle">
        <button id="btn-mercator" class="proj-btn active">Mercator</button>
        <button id="btn-globe" class="proj-btn">Globe</button>
      </div>

      <div class="section-label">Map</div>
      <label class="layer-toggle"><input type="checkbox" id="toggle-labels" checked> City labels</label>
      <label class="layer-toggle"><input type="checkbox" id="toggle-terrain"> 3D Terrain</label>

      <div class="section-label">Overlays</div>
      <label class="layer-toggle"><input type="checkbox" data-layer="flights">   Flights (ADS-B)</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="vessels">   Marine vessels</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="earthquakes"> Earthquakes</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="weather">   Weather</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="conflict">  Conflict (ACLED)</label>

      <div class="section-label" id="weather-sub" style="display:none">Weather layer</div>
      <select id="weather-select" style="display:none">
        <option value="precipitation_new">Precipitation</option>
        <option value="clouds_new">Clouds</option>
        <option value="temp_new">Temperature</option>
        <option value="wind_new">Wind speed</option>
        <option value="pressure_new">Pressure</option>
      </select>

      <div class="section-label">Drawing</div>
      <div class="draw-info">Use toolbar (top left) to draw points, lines, and polygons. Shapes sync to all connected clients.</div>
      </div><!-- /.panel-body -->
    </div>
  `
  document.body.appendChild(panel)

  const settings = initSettings()
  document.getElementById('open-settings').onclick = () => settings.open()

  // Minimize / expand panel body
  const minimizeBtn = document.getElementById('minimize-panel')
  const panelBody = panel.querySelector('.panel-body')
  minimizeBtn.addEventListener('click', () => {
    const collapsed = panelBody.classList.toggle('hidden')
    minimizeBtn.textContent = collapsed ? '+' : '−'
  })

  // Base map toggle
  document.getElementById('btn-standard').onclick = () => {
    document.getElementById('btn-standard').classList.add('active')
    document.getElementById('btn-satellite').classList.remove('active')
    _onBaseMapChange?.('standard')
  }
  document.getElementById('btn-satellite').onclick = () => {
    document.getElementById('btn-satellite').classList.add('active')
    document.getElementById('btn-standard').classList.remove('active')
    _onBaseMapChange?.('satellite')
  }

  // Projection toggle
  document.getElementById('btn-mercator').onclick = () => {
    setProjection(map, 'mercator')
    document.getElementById('btn-mercator').classList.add('active')
    document.getElementById('btn-globe').classList.remove('active')
  }
  document.getElementById('btn-globe').onclick = () => {
    setProjection(map, 'globe')
    document.getElementById('btn-globe').classList.add('active')
    document.getElementById('btn-mercator').classList.remove('active')
  }

  // Layer toggles
  function bindLayerToggles() {
    panel.querySelectorAll('input[data-layer]').forEach(input => {
      input.addEventListener('change', () => {
        const layer = input.dataset.layer
        _overlays[layer]?.toggle()
        if (layer === 'weather') {
          document.getElementById('weather-sub').style.display = input.checked ? '' : 'none'
          document.getElementById('weather-select').style.display = input.checked ? '' : 'none'
        }
      })
    })
  }
  bindLayerToggles()

  document.getElementById('weather-select').addEventListener('change', (e) => {
    _overlays.weather?.setLayer(e.target.value)
  })

  // Place finder
  async function goToPlace() {
    const query = document.getElementById('place-input').value.trim()
    if (!query) return
    const btn = document.getElementById('place-go')
    btn.textContent = '…'
    btn.disabled = true
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      if (data.length === 0) {
        btn.textContent = '✕'
        setTimeout(() => { btn.textContent = 'Go'; btn.disabled = false }, 1500)
        return
      }
      const { lon, lat, boundingbox } = data[0]
      if (boundingbox) {
        map.fitBounds([
          [+boundingbox[2], +boundingbox[0]],
          [+boundingbox[3], +boundingbox[1]]
        ], { padding: 40, maxZoom: 14, duration: 1000 })
      } else {
        map.flyTo({ center: [+lon, +lat], zoom: 10, duration: 1000 })
      }
      btn.textContent = '✓'
      setTimeout(() => { btn.textContent = 'Go'; btn.disabled = false }, 1500)
    } catch {
      btn.textContent = 'Go'
      btn.disabled = false
    }
  }

  document.getElementById('place-go').addEventListener('click', goToPlace)
  document.getElementById('place-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToPlace()
  })

  // Label layer detection — covers OpenMapTiles, OpenFreeMap Liberty, and common variants
  function getLabelLayers() {
    return (map.getStyle()?.layers || [])
      .filter(l => {
        if (l.type !== 'symbol') return false
        const sl = l['source-layer'] || ''
        if (sl === 'place' || sl === 'place_label') return true
        const id = (l.id || '').toLowerCase()
        return id.includes('place') || id.includes('city') || id.includes('town') ||
               id.includes('village') || id.includes('suburb') || id.includes('state') ||
               id.includes('country') || id.includes('capital')
      })
      .map(l => l.id)
  }

  // Labels toggle
  let labelsVisible = true
  document.getElementById('toggle-labels').addEventListener('change', (e) => {
    labelsVisible = e.target.checked
    const vis = labelsVisible ? 'visible' : 'none'
    getLabelLayers().forEach(id => map.setLayoutProperty(id, 'visibility', vis))
  })

  // 3D Terrain toggle
  document.getElementById('toggle-terrain').addEventListener('change', (e) => {
    if (e.target.checked) {
      enableTerrain(map)
    } else {
      disableTerrain(map)
    }
  })




  return {
    onBaseMapChange(cb) {
      _onBaseMapChange = (key) => {
        cb(key)
        // Re-apply label state once the new style has loaded
        map.once('style.load', () => {
          if (!labelsVisible) {
            getLabelLayers().forEach(id => map.setLayoutProperty(id, 'visibility', 'none'))
          }
        })
      }
    },
    updateOverlays(newOverlays) { _overlays = newOverlays }
  }
}
