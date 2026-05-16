import { setProjection, enableTerrain, disableTerrain } from '../map.js'
import { initSettings } from './settings.js'

// localStorage helpers
function load(key, fallback) {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v
}
function save(key, value) { localStorage.setItem(key, value) }

export function initControls(map, drawContext, overlays) {
  let _overlays = overlays
  let _onBaseMapChange = null

  // ── Restore persisted settings ─────────────────────────────────────────────
  let labelsVisible  = load('wm_labels',     'true')  !== 'false'
  let terrainEnabled = load('wm_terrain',    'false') === 'true'
  const savedBasemap     = load('wm_basemap',    'standard')
  const savedProjection  = load('wm_projection', 'mercator')

  // ── Panel HTML ─────────────────────────────────────────────────────────────
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
        <button id="btn-standard" class="basemap-btn">Standard</button>
        <button id="btn-satellite" class="basemap-btn">Satellite</button>
      </div>

      <div class="section-label">Projection</div>
      <div class="projection-toggle">
        <button id="btn-mercator" class="proj-btn">Mercator</button>
        <button id="btn-globe" class="proj-btn">Globe</button>
      </div>

      <div class="section-label">Map</div>
      <label class="layer-toggle"><input type="checkbox" id="toggle-labels"> City labels</label>
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
      <div class="draw-info">Use toolbar (top left) to draw. Middle-mouse or two-finger drag to tilt / rotate.</div>

      <div class="section-label">Saved Places <span id="saved-count" class="saved-count"></span></div>
      <div class="place-finder">
        <input id="save-loc-name" class="place-input" type="text" placeholder="Name this view…" />
        <button id="save-loc-btn" class="place-go-btn" title="Save current view">+</button>
      </div>
      <div id="saved-locations-list"></div>
      </div><!-- /.panel-body -->
    </div>
  `
  document.body.appendChild(panel)

  // ── Restore initial UI states from localStorage ────────────────────────────
  document.getElementById(savedBasemap === 'satellite' ? 'btn-satellite' : 'btn-standard')
    .classList.add('active')
  document.getElementById(savedProjection === 'globe' ? 'btn-globe' : 'btn-mercator')
    .classList.add('active')
  document.getElementById('toggle-labels').checked  = labelsVisible
  document.getElementById('toggle-terrain').checked = terrainEnabled

  // ── Settings modal ─────────────────────────────────────────────────────────
  const settings = initSettings()
  document.getElementById('open-settings').onclick = () => settings.open()

  // ── Minimize ───────────────────────────────────────────────────────────────
  const minimizeBtn = document.getElementById('minimize-panel')
  const panelBody   = panel.querySelector('.panel-body')
  minimizeBtn.addEventListener('click', () => {
    const collapsed = panelBody.classList.toggle('hidden')
    minimizeBtn.textContent = collapsed ? '+' : '−'
  })

  // ── Label helpers ──────────────────────────────────────────────────────────
  function getLabelLayers() {
    return (map.getStyle()?.layers || [])
      .filter(l => l.type === 'symbol' && l.layout?.['text-field'])
      .map(l => l.id)
  }

  function applyLabelVisibility(visible) {
    const vis = visible ? 'visible' : 'none'
    getLabelLayers().forEach(id => map.setLayoutProperty(id, 'visibility', vis))
    if (map.getLayer('satellite-labels-layer'))
      map.setLayoutProperty('satellite-labels-layer', 'visibility', vis)
  }

  // ── Persistent style.load handler ─────────────────────────────────────────
  // Fires on every style reload (base-map switch, projection change, etc.)
  // and re-applies all settings that get wiped by setStyle.
  map.on('style.load', () => {
    applyLabelVisibility(labelsVisible)
    if (terrainEnabled) enableTerrain(map)
  })

  // Apply immediately for the current (already-loaded) style
  applyLabelVisibility(labelsVisible)
  if (terrainEnabled) enableTerrain(map)

  // ── Base map toggle ────────────────────────────────────────────────────────
  document.getElementById('btn-standard').onclick = () => {
    document.getElementById('btn-standard').classList.add('active')
    document.getElementById('btn-satellite').classList.remove('active')
    save('wm_basemap', 'standard')
    _onBaseMapChange?.('standard')
  }
  document.getElementById('btn-satellite').onclick = () => {
    document.getElementById('btn-satellite').classList.add('active')
    document.getElementById('btn-standard').classList.remove('active')
    save('wm_basemap', 'satellite')
    _onBaseMapChange?.('satellite')
  }

  // ── Projection toggle ──────────────────────────────────────────────────────
  document.getElementById('btn-mercator').onclick = () => {
    setProjection(map, 'mercator')
    document.getElementById('btn-mercator').classList.add('active')
    document.getElementById('btn-globe').classList.remove('active')
    save('wm_projection', 'mercator')
  }
  document.getElementById('btn-globe').onclick = () => {
    setProjection(map, 'globe')
    document.getElementById('btn-globe').classList.add('active')
    document.getElementById('btn-mercator').classList.remove('active')
    save('wm_projection', 'globe')
  }

  // ── Layer toggles ──────────────────────────────────────────────────────────
  panel.querySelectorAll('input[data-layer]').forEach(input => {
    input.addEventListener('change', () => {
      const layer = input.dataset.layer
      _overlays[layer]?.toggle()
      if (layer === 'weather') {
        document.getElementById('weather-sub').style.display   = input.checked ? '' : 'none'
        document.getElementById('weather-select').style.display = input.checked ? '' : 'none'
      }
    })
  })

  document.getElementById('weather-select').addEventListener('change', (e) => {
    _overlays.weather?.setLayer(e.target.value)
  })

  // ── Place finder ───────────────────────────────────────────────────────────
  async function goToPlace() {
    const query = document.getElementById('place-input').value.trim()
    if (!query) return
    const btn = document.getElementById('place-go')
    btn.textContent = '…'
    btn.disabled = true
    try {
      const res  = await fetch(
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

  // ── Labels toggle ──────────────────────────────────────────────────────────
  document.getElementById('toggle-labels').addEventListener('change', (e) => {
    labelsVisible = e.target.checked
    save('wm_labels', labelsVisible)
    applyLabelVisibility(labelsVisible)
  })

  // ── Terrain toggle ─────────────────────────────────────────────────────────
  document.getElementById('toggle-terrain').addEventListener('change', (e) => {
    terrainEnabled = e.target.checked
    save('wm_terrain', terrainEnabled)
    terrainEnabled ? enableTerrain(map) : disableTerrain(map)
  })

  // ── Saved Places ───────────────────────────────────────────────────────────
  const MAX_SAVED = 10
  let savedPlaces = JSON.parse(localStorage.getItem('wm_saved_places') || '[]')

  function savePlaces() {
    localStorage.setItem('wm_saved_places', JSON.stringify(savedPlaces))
  }

  function renderSavedPlaces() {
    const list  = document.getElementById('saved-locations-list')
    const count = document.getElementById('saved-count')
    count.textContent = savedPlaces.length ? `${savedPlaces.length}/10` : ''
    list.innerHTML = ''

    savedPlaces.forEach((loc, i) => {
      const item = document.createElement('div')
      item.className = 'saved-loc-item'

      const nameEl = document.createElement('span')
      nameEl.className = 'saved-loc-name'
      nameEl.textContent = loc.name
      nameEl.title = loc.name

      const goBtn = document.createElement('button')
      goBtn.className = 'saved-loc-go'
      goBtn.textContent = 'Go'
      goBtn.addEventListener('click', () => {
        map.flyTo({ center: loc.center, zoom: loc.zoom,
                    pitch: loc.pitch, bearing: loc.bearing, duration: 1500 })
        // Restore the drawing/symbol state that was captured at save time
        if (loc.drawState) drawContext.restoreState(loc.drawState)
      })

      const delBtn = document.createElement('button')
      delBtn.className = 'saved-loc-del'
      delBtn.textContent = '×'
      delBtn.title = 'Remove'
      delBtn.addEventListener('click', () => {
        savedPlaces.splice(i, 1)
        savePlaces()
        renderSavedPlaces()
      })

      item.append(nameEl, goBtn, delBtn)
      list.appendChild(item)
    })

    if (savedPlaces.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'saved-loc-empty'
      empty.textContent = 'No saved places yet.'
      list.appendChild(empty)
    }
  }

  document.getElementById('save-loc-btn').addEventListener('click', () => {
    if (savedPlaces.length >= MAX_SAVED) return
    const input = document.getElementById('save-loc-name')
    const name  = input.value.trim() || `Place ${savedPlaces.length + 1}`
    const c     = map.getCenter()
    savedPlaces.push({
      name,
      center:    [c.lng, c.lat],
      zoom:      map.getZoom(),
      pitch:     map.getPitch(),
      bearing:   map.getBearing(),
      drawState: drawContext.getState()   // snapshot drawings + icons
    })
    savePlaces()
    input.value = ''
    renderSavedPlaces()
  })

  document.getElementById('save-loc-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('save-loc-btn').click()
  })

  renderSavedPlaces()

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    savedBasemap,
    savedProjection,
    onBaseMapChange(cb) { _onBaseMapChange = cb },
    updateOverlays(newOverlays) { _overlays = newOverlays }
  }
}
