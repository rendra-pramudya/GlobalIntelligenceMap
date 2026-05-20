import { setProjection, enableTerrain, disableTerrain, setBaseMap, PROVIDERS } from '../map.js'
import { initSettings } from './settings.js'
import { initKMLLayer } from '../overlays/kmlLayer.js'
import { initCountryStyle } from '../overlays/countryStyle.js'
import { initGridlines } from '../overlays/gridlines.js'
import { initLabelStyle } from './labelStyle.js'
import { initMapStyleStore, EMPTY_STYLE } from './mapStyleStore.js'
import { exportGeotiff } from './exportGeotiff.js'

// localStorage helpers
function load(key, fallback) {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v
}
function save(key, value) { localStorage.setItem(key, value) }

export function initControls(map, drawContext, overlays, debug) {
  let _overlays = overlays
  let _onBaseMapChange = null

  // ── Restore persisted settings ─────────────────────────────────────────────
  let labelsVisible  = load('wm_labels',     'true')  !== 'false'
  let terrainEnabled = load('wm_terrain',    'false') === 'true'
  const savedProjection  = load('wm_projection', 'mercator')
  let activeProvider = load('wm_provider', 'openfreemap')
  let activeStyle    = load('wm_style',    'liberty')

  // Migrate old satellite flag to provider entry
  if (load('wm_satellite', 'false') === 'true') {
    activeProvider = 'satellite'
    activeStyle    = 'imagery'
    save('wm_provider',  'satellite')
    save('wm_style',     'imagery')
    save('wm_satellite', 'false')
  }

  // ── Sidebar HTML ───────────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.id = 'sidebar'
  panel.innerHTML = `
    <div id="sb-top">
      <div id="sb-logo">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9" stroke="#2d7dd2" stroke-width="1.5"/>
          <ellipse cx="10" cy="10" rx="4.5" ry="9" stroke="#2d7dd2" stroke-width="1"/>
          <line x1="1" y1="10" x2="19" y2="10" stroke="#2d7dd2" stroke-width="1"/>
          <line x1="2.5" y1="6" x2="17.5" y2="6" stroke="#2d7dd2" stroke-width="0.75" stroke-dasharray="1 1"/>
          <line x1="2.5" y1="14" x2="17.5" y2="14" stroke="#2d7dd2" stroke-width="0.75" stroke-dasharray="1 1"/>
        </svg>
        <span>Global Intelligence</span>
      </div>
      <div id="sb-search">
        <input id="place-input" type="text" placeholder="Search places…" />
        <button id="place-go">→</button>
      </div>
    </div>

    <div id="sb-body">

      <!-- MAP STYLES section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="mapstyles">
          <span class="sb-section-icon">🎨</span>
          <span class="sb-section-title">Map Style</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-mapstyles">
          <div class="section-label">Active style</div>
          <div class="ms-active-row">
            <select id="ms-style-select" class="provider-select ms-select"></select>
            <button id="ms-new-btn"  class="ms-icon-btn" title="New style">＋</button>
            <button id="ms-dup-btn"  class="ms-icon-btn" title="Duplicate">⎘</button>
            <button id="ms-del-btn"  class="ms-icon-btn ms-del" title="Delete">✕</button>
          </div>
          <div class="sb-save-row" style="margin-top:4px">
            <input id="ms-name-input" class="sb-save-input" type="text" placeholder="Style name…" />
            <button id="ms-save-btn" class="sb-save-btn" title="Save current settings as this style">Save</button>
          </div>
          <div id="ms-info" class="ms-info"></div>
        </div>
      </div>

      <!-- BASEMAP section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="basemap">
          <span class="sb-section-icon">🗺</span>
          <span class="sb-section-title">Base Map</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-basemap">
          <div class="section-label">Tile Provider</div>
          <select id="provider-select" class="provider-select"></select>
          <div class="section-label">Map Style</div>
          <div id="style-btn-row" class="style-btn-row"></div>
          <div class="section-label">Projection</div>
          <div class="projection-toggle">
            <button id="btn-mercator" class="proj-btn">Mercator</button>
            <button id="btn-globe" class="proj-btn">Globe</button>
          </div>
          <div class="section-label">Options</div>
          <label class="layer-toggle"><input type="checkbox" id="toggle-labels"> City labels</label>
          <label class="layer-toggle"><input type="checkbox" id="toggle-terrain"> 3D Terrain</label>
        </div>
      </div>

      <!-- OVERLAYS section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="overlays">
          <span class="sb-section-icon">◉</span>
          <span class="sb-section-title">Overlays</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-overlays">
          <label class="layer-toggle"><input type="checkbox" data-layer="flights"> Flights (ADS-B / OpenSky)<span class="src-badge" id="src-badge-flights"></span></label>
          <label class="layer-toggle"><input type="checkbox" data-layer="flightradar"> Flights (FR24 / ADS-B Ex)<span class="src-badge" id="src-badge-flightradar"></span></label>
          <label class="layer-toggle"><input type="checkbox" data-layer="vessels"> Marine vessels</label>
          <label class="layer-toggle"><input type="checkbox" data-layer="earthquakes"> Earthquakes</label>
          <label class="layer-toggle"><input type="checkbox" data-layer="weather"> Weather</label>
          <label class="layer-toggle"><input type="checkbox" data-layer="conflict"> Conflict (ACLED)</label>
          <div class="section-label" id="weather-sub" style="display:none">Weather layer</div>
          <select id="weather-select" style="display:none">
            <option value="precipitation_new">Precipitation</option>
            <option value="clouds_new">Clouds</option>
            <option value="temp_new">Temperature</option>
            <option value="wind_new">Wind speed</option>
            <option value="pressure_new">Pressure</option>
          </select>
        </div>
      </div>

      <!-- APPEARANCE section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="appearance">
          <span class="sb-section-icon">◑</span>
          <span class="sb-section-title">Appearance</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-appearance">
          <div class="section-label">Filter
            <button class="appearance-reset-btn" id="appearance-reset" title="Reset to defaults">↺</button>
          </div>
          <div class="appearance-controls">
            <div class="ap-row">
              <span class="ap-label">Brightness</span>
              <input type="range" class="ap-slider" id="ap-brightness" min="0" max="200" step="1" value="100">
              <span class="ap-val" id="ap-brightness-val">100</span>
            </div>
            <div class="ap-row">
              <span class="ap-label">Contrast</span>
              <input type="range" class="ap-slider" id="ap-contrast" min="0" max="200" step="1" value="100">
              <span class="ap-val" id="ap-contrast-val">100</span>
            </div>
            <div class="ap-row">
              <span class="ap-label">Saturation</span>
              <input type="range" class="ap-slider" id="ap-saturation" min="0" max="200" step="1" value="100">
              <span class="ap-val" id="ap-saturation-val">100</span>
            </div>
            <div class="ap-row">
              <span class="ap-label">Gamma</span>
              <input type="range" class="ap-slider" id="ap-gamma" min="20" max="300" step="1" value="100">
              <span class="ap-val" id="ap-gamma-val">1.0</span>
            </div>
            <div class="ap-row ap-tint-row">
              <span class="ap-label">Tint</span>
              <input type="color" class="ap-color" id="ap-tint-color" value="#0044ff">
              <input type="range" class="ap-slider" id="ap-tint-strength" min="0" max="60" step="1" value="0">
              <span class="ap-val" id="ap-tint-val">0</span>
            </div>
            <div class="ap-row ap-blend-row">
              <span class="ap-label">Blend mode</span>
              <select class="ap-blend-select" id="ap-tint-blend">
                <option value="multiply">Multiply</option>
                <option value="overlay">Overlay</option>
                <option value="screen">Screen</option>
                <option value="soft-light">Soft light</option>
              </select>
            </div>
            <div class="ap-row ap-colorize-row">
              <span class="ap-label">Colorize</span>
              <label class="ap-switch" title="Enable colorize">
                <input type="checkbox" id="ap-colorize-on">
                <span class="ap-switch-thumb"></span>
              </label>
              <input type="range" class="ap-slider ap-hue-slider" id="ap-colorize-hue" min="0" max="359" step="1" value="200">
              <span class="ap-val" id="ap-colorize-val">–</span>
            </div>
          </div>
          <div class="section-label" style="margin-top:6px">
            Presets
          </div>
          <div class="sb-save-row">
            <input id="ap-preset-name" class="sb-save-input" type="text" placeholder="Preset name…" />
            <button id="ap-preset-save-btn" class="sb-save-btn" title="Save current appearance as preset">+</button>
          </div>
          <div id="ap-preset-list"></div>
        </div>
      </div>

      <!-- GRIDLINES section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="gridlines">
          <span class="sb-section-icon">⊞</span>
          <span class="sb-section-title">Gridlines</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-gridlines">
          <label class="layer-toggle"><input type="checkbox" id="gl-enabled"> Show gridlines</label>
          <div id="gl-controls">
            <div class="ap-row ap-tint-row" style="margin-top:4px">
              <span class="ap-label">Color</span>
              <input type="color" class="ap-color" id="gl-color" value="#ffffff">
              <input type="range" class="ap-slider" id="gl-opacity" min="0" max="100" step="1" value="25">
              <span class="ap-val" id="gl-opacity-val">25%</span>
            </div>
            <div class="ap-row" style="margin-top:2px">
              <span class="ap-label">Width</span>
              <input type="range" class="ap-slider" id="gl-width" min="1" max="30" step="1" value="6">
              <span class="ap-val" id="gl-width-val">0.6</span>
            </div>
            <div class="section-label" style="margin-top:6px">Spacing</div>
            <div class="ms-two-col">
              <label class="ms-pair-label">Lat
                <select id="gl-lat-spacing" class="ms-mini-select">
                  <option value="5">5°</option>
                  <option value="10">10°</option>
                  <option value="15">15°</option>
                  <option value="30" selected>30°</option>
                  <option value="45">45°</option>
                </select>
              </label>
              <label class="ms-pair-label">Lon
                <select id="gl-lon-spacing" class="ms-mini-select">
                  <option value="5">5°</option>
                  <option value="10">10°</option>
                  <option value="15">15°</option>
                  <option value="30" selected>30°</option>
                  <option value="45">45°</option>
                  <option value="60">60°</option>
                  <option value="90">90°</option>
                </select>
              </label>
            </div>
            <label class="layer-toggle" style="margin-top:4px"><input type="checkbox" id="gl-labels"> Degree labels</label>
          </div>
        </div>
      </div>

      <!-- LABELS & LINES section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="labellines">
          <span class="sb-section-icon">Aa</span>
          <span class="sb-section-title">Labels &amp; Lines</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-labellines">
          <div id="ll-raster-notice" class="ms-info" style="display:none">
            Labels &amp; Lines styling requires a vector tile provider (OpenFreeMap).
          </div>
          <div id="ll-controls">
            <div class="section-label">Labels</div>
            <div class="ll-row" data-label="country">
              <span class="ll-name">Country</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#ffffff" title="Color">
              <input type="number" class="ll-size" value="" min="6" max="32" placeholder="–" title="Size (px)">
            </div>
            <div class="ll-row" data-label="city">
              <span class="ll-name">City</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#dddddd" title="Color">
              <input type="number" class="ll-size" value="" min="6" max="32" placeholder="–" title="Size (px)">
            </div>
            <div class="ll-row" data-label="sea">
              <span class="ll-name">Sea / Water</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#88aabb" title="Color">
              <input type="number" class="ll-size" value="" min="6" max="32" placeholder="–" title="Size (px)">
            </div>
            <div class="ll-row" data-label="place">
              <span class="ll-name">Place</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#cccccc" title="Color">
              <input type="number" class="ll-size" value="" min="6" max="32" placeholder="–" title="Size (px)">
            </div>
            <div class="section-label" style="margin-top:6px">Lines</div>
            <div class="ll-row" data-line="border">
              <span class="ll-name">Borders</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#ffffff" title="Color">
              <input type="number" class="ll-width" value="" min="0.1" max="10" step="0.1" placeholder="–" title="Width (px)">
            </div>
            <div class="ll-row" data-line="disputed">
              <span class="ll-name">Disputed ╌</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#ff6666" title="Color">
              <input type="number" class="ll-width" value="" min="0.1" max="10" step="0.1" placeholder="–" title="Width (px)">
            </div>
            <div class="ll-row" data-line="coastline">
              <span class="ll-name">Coastlines</span>
              <input type="checkbox" class="ll-vis" checked title="Visible">
              <input type="color" class="ap-color ll-color" value="#aabbcc" title="Color">
              <input type="number" class="ll-width" value="" min="0.1" max="10" step="0.1" placeholder="–" title="Width (px)">
            </div>
            <button id="ll-reset-btn" class="appearance-reset-btn" style="margin-top:6px;width:100%;text-align:center">↺ Reset to style defaults</button>
          </div>
        </div>
      </div>

      <!-- COUNTRY STYLE section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="country">
          <span class="sb-section-icon">🌐</span>
          <span class="sb-section-title">Country Style</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-country">
          <label class="layer-toggle"><input type="checkbox" id="toggle-country-style"> Enable country selection</label>
          <div id="country-selection-panel" style="display:none">
            <div class="country-selected-name" id="country-selected-name">Click a country on the map</div>
            <div class="ap-row ap-tint-row" id="country-style-row" style="display:none">
              <span class="ap-label">Fill</span>
              <input type="color" class="ap-color" id="country-fill-color" value="#ff4444">
              <input type="range" class="ap-slider" id="country-fill-opacity" min="0" max="100" step="1" value="40">
              <span class="ap-val" id="country-fill-opacity-val">40%</span>
            </div>
            <div class="country-btn-row" id="country-btn-row" style="display:none">
              <button id="country-apply-btn" class="sb-action-btn">Apply</button>
              <button id="country-remove-btn" class="sb-action-btn">Remove</button>
              <button id="country-deselect-btn" class="sb-action-btn">Deselect</button>
            </div>
          </div>
          <div class="section-label" style="margin-top:6px">
            Styled countries
            <button id="country-clear-all-btn" class="appearance-reset-btn" title="Clear all country styles">↺</button>
          </div>
          <div id="country-style-list"></div>
        </div>
      </div>

      <!-- KML section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="kml">
          <span class="sb-section-icon">📂</span>
          <span class="sb-section-title">Data Import</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-kml">
          <div class="section-label">KML Files
            <button class="kml-import-btn" id="kml-import-btn" title="Import KML file">＋ KML</button>
          </div>
          <div id="kml-file-list"></div>
        </div>
      </div>

      <!-- SAVED PLACES section -->
      <div class="sb-section">
        <div class="sb-section-header" data-section="places">
          <span class="sb-section-icon">★</span>
          <span class="sb-section-title">Saved Places</span>
          <span class="sb-chevron">›</span>
        </div>
        <div class="sb-section-body" id="sec-places">
          <div class="section-label">Save view <span id="saved-count" class="saved-count"></span></div>
          <div class="sb-save-row">
            <input id="save-loc-name" class="sb-save-input" type="text" placeholder="Name this view…" />
            <button id="save-loc-btn" class="sb-save-btn" title="Save current view">+</button>
          </div>
          <div id="saved-locations-list"></div>
        </div>
      </div>

    </div><!-- /#sb-body -->

    <div id="sb-bottom">
      <button id="open-debug" title="API Diagnostics">🔍</button>
      <button id="export-geotiff" title="Export view as GeoTIFF">⬇</button>
      <button id="open-settings" title="Settings">⚙</button>
    </div>
  `
  document.body.appendChild(panel)

  // ── Restore initial UI states from localStorage ────────────────────────────
  document.getElementById(savedProjection === 'globe' ? 'btn-globe' : 'btn-mercator')
    .classList.add('active')
  document.getElementById('toggle-labels').checked  = labelsVisible
  document.getElementById('toggle-terrain').checked = terrainEnabled

  // ── Settings + Debug modals ────────────────────────────────────────────────
  const settings = initSettings()
  document.getElementById('open-settings').onclick = () => settings.open()
  document.getElementById('open-debug').onclick    = () => debug?.open()

  // ── GeoTIFF export ────────────────────────────────────────────────────────
  const exportBtn = document.getElementById('export-geotiff')
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true
    exportBtn.title    = 'Exporting…'
    try {
      await exportGeotiff(map, `${activeProvider}_${activeStyle}`)
    } finally {
      exportBtn.disabled = false
      exportBtn.title    = 'Export view as GeoTIFF'
    }
  })

  // ── Accordion sections ─────────────────────────────────────────────────────
  document.querySelectorAll('.sb-section-header').forEach(header => {
    const body    = header.nextElementSibling
    const chevron = header.querySelector('.sb-chevron')
    const key     = 'wm_sec_' + header.dataset.section
    if (load(key, 'open') === 'closed') {
      body.classList.add('collapsed')
      chevron.classList.add('rotated')
    }
    header.addEventListener('click', () => {
      const closed = body.classList.toggle('collapsed')
      chevron.classList.toggle('rotated', closed)
      save(key, closed ? 'closed' : 'open')
    })
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

  // ── Provider dropdown + style buttons ─────────────────────────────────────
  function renderProviderSelect() {
    const sel = document.getElementById('provider-select')
    sel.innerHTML = ''
    Object.entries(PROVIDERS).forEach(([key, { label }]) => {
      const opt = document.createElement('option')
      opt.value = key
      opt.textContent = label
      sel.appendChild(opt)
    })
    sel.value = activeProvider
  }

  function renderStyleButtons() {
    const row = document.getElementById('style-btn-row')
    row.innerHTML = ''
    const styles = PROVIDERS[activeProvider]?.styles ?? {}
    const entries = Object.entries(styles)
    // Hide style row when provider has only one style (e.g. satellite)
    row.style.display = entries.length <= 1 ? 'none' : ''
    entries.forEach(([key, { label }]) => {
      const btn = document.createElement('button')
      btn.className = 'style-btn' + (key === activeStyle ? ' active' : '')
      btn.textContent = label
      btn.dataset.style = key
      btn.addEventListener('click', () => {
        activeStyle = key
        save('wm_style', key)
        row.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        _onBaseMapChange?.(activeProvider, activeStyle)
      })
      row.appendChild(btn)
    })
  }

  renderProviderSelect()
  renderStyleButtons()

  document.getElementById('provider-select').addEventListener('change', (e) => {
    activeProvider = e.target.value
    save('wm_provider', activeProvider)
    activeStyle = Object.keys(PROVIDERS[activeProvider].styles)[0]
    save('wm_style', activeStyle)
    renderStyleButtons()
    _onBaseMapChange?.(activeProvider, activeStyle)
  })

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

  _bindSourceBadges(_overlays)

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
        map.flyTo({ center: [+lon, +lat], zoom: 10, duration: 1000, essential: true })
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

  // ── Appearance controls ────────────────────────────────────────────────────
  let _apGetState, _apLoadState
  ;(function () {
    // Inject SVG gamma filter into the page (invisible element)
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
    const defs = document.createElementNS(svgNS, 'defs')
    const filter = document.createElementNS(svgNS, 'filter')
    filter.id = 'wm-gamma-filter'
    ;['R', 'G', 'B'].forEach(ch => {
      const fn = document.createElementNS(svgNS, `feFunc${ch}`)
      fn.setAttribute('type', 'gamma')
      fn.setAttribute('amplitude', '1')
      fn.setAttribute('exponent', '1')
      fn.setAttribute('offset', '0')
      filter.appendChild(fn)
    })
    defs.appendChild(filter)
    svg.appendChild(defs)
    document.body.appendChild(svg)

    // Tint overlay — sits above the map canvas, below UI
    const tintEl = document.createElement('div')
    tintEl.id = 'map-tint-overlay'
    tintEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;mix-blend-mode:multiply;transition:background 0.15s,opacity 0.15s'
    document.getElementById('map').appendChild(tintEl)

    // Defaults
    const DEFAULTS = {
      brightness: 100, contrast: 100, saturation: 100, gamma: 100,
      tintColor: '#0044ff', tintStrength: 0, tintBlend: 'multiply',
      colorizeOn: false, colorizeHue: 200
    }

    // Load persisted values
    const ap = {
      brightness:   +load('wm_ap_brightness',    DEFAULTS.brightness),
      contrast:     +load('wm_ap_contrast',      DEFAULTS.contrast),
      saturation:   +load('wm_ap_saturation',    DEFAULTS.saturation),
      gamma:        +load('wm_ap_gamma',          DEFAULTS.gamma),
      tintColor:     load('wm_ap_tint_color',     DEFAULTS.tintColor),
      tintStrength: +load('wm_ap_tint_strength',  DEFAULTS.tintStrength),
      tintBlend:     load('wm_ap_tint_blend',     DEFAULTS.tintBlend),
      colorizeOn:    load('wm_ap_colorize_on',    'false') === 'true',
      colorizeHue:  +load('wm_ap_colorize_hue',   DEFAULTS.colorizeHue)
    }

    function applyFilter() {
      const g = ap.gamma / 100
      ;[...filter.children].forEach(fn => fn.setAttribute('exponent', String(g)))

      const parts = ['url(#wm-gamma-filter)']

      // Colorize: desaturate then re-hue via sepia + hue-rotate
      // sepia() gives a warm ~30° hue base; subtract that offset so the
      // slider value maps 1-to-1 to the visible hue on the map.
      if (ap.colorizeOn) {
        const rotated = ((ap.colorizeHue - 30) + 360) % 360
        parts.push('grayscale(1)', 'sepia(1)', `hue-rotate(${rotated}deg)`)
      }

      parts.push(`brightness(${ap.brightness / 100})`, `contrast(${ap.contrast / 100})`, `saturate(${ap.saturation / 100})`)
      map.getContainer().style.filter = parts.join(' ')

      // Tint overlay
      tintEl.style.mixBlendMode = ap.tintBlend
      const strength = ap.tintStrength / 100
      if (strength <= 0) {
        tintEl.style.opacity = '0'
      } else {
        const r  = parseInt(ap.tintColor.slice(1, 3), 16)
        const g2 = parseInt(ap.tintColor.slice(3, 5), 16)
        const b  = parseInt(ap.tintColor.slice(5, 7), 16)
        const mix = v => Math.round(255 - (255 - v) * strength)
        tintEl.style.opacity = '1'
        tintEl.style.backgroundColor = `rgb(${mix(r)},${mix(g2)},${mix(b)})`
      }
    }

    function initSlider(id, valId, key, fmt) {
      const slider = document.getElementById(id)
      const valEl  = document.getElementById(valId)
      slider.value = ap[key]
      valEl.textContent = fmt(ap[key])
      slider.addEventListener('input', () => {
        ap[key] = +slider.value
        valEl.textContent = fmt(ap[key])
        save(`wm_ap_${key}`, ap[key])
        applyFilter()
      })
    }

    initSlider('ap-brightness',   'ap-brightness-val', 'brightness',   v => v)
    initSlider('ap-contrast',     'ap-contrast-val',   'contrast',     v => v)
    initSlider('ap-saturation',   'ap-saturation-val', 'saturation',   v => v)
    initSlider('ap-gamma',        'ap-gamma-val',      'gamma',        v => (v / 100).toFixed(1))
    initSlider('ap-tint-strength','ap-tint-val',       'tintStrength', v => v)

    const colorPicker = document.getElementById('ap-tint-color')
    colorPicker.value = ap.tintColor
    colorPicker.addEventListener('input', () => {
      ap.tintColor = colorPicker.value
      save('wm_ap_tint_color', ap.tintColor)
      applyFilter()
    })

    const blendSelect = document.getElementById('ap-tint-blend')
    blendSelect.value = ap.tintBlend
    blendSelect.addEventListener('change', () => {
      ap.tintBlend = blendSelect.value
      save('wm_ap_tint_blend', ap.tintBlend)
      applyFilter()
    })

    // Colorize toggle + hue slider
    const colorizeChk = document.getElementById('ap-colorize-on')
    const colorizeHueSlider = document.getElementById('ap-colorize-hue')
    const colorizeVal = document.getElementById('ap-colorize-val')

    function syncColorizeUI() {
      colorizeChk.checked = ap.colorizeOn
      colorizeHueSlider.value = ap.colorizeHue
      colorizeHueSlider.disabled = !ap.colorizeOn
      colorizeHueSlider.style.opacity = ap.colorizeOn ? '1' : '0.35'
      colorizeVal.textContent = ap.colorizeOn ? `${ap.colorizeHue}°` : '–'
    }

    colorizeChk.addEventListener('change', () => {
      ap.colorizeOn = colorizeChk.checked
      save('wm_ap_colorize_on', ap.colorizeOn)
      syncColorizeUI()
      applyFilter()
    })
    colorizeHueSlider.addEventListener('input', () => {
      ap.colorizeHue = +colorizeHueSlider.value
      colorizeVal.textContent = `${ap.colorizeHue}°`
      save('wm_ap_colorize_hue', ap.colorizeHue)
      applyFilter()
    })

    syncColorizeUI()

    document.getElementById('appearance-reset').addEventListener('click', () => {
      Object.assign(ap, DEFAULTS)
      ;['brightness', 'contrast', 'saturation', 'gamma', 'tintStrength', 'colorizeHue'].forEach(k => {
        save(`wm_ap_${k}`, ap[k])
      })
      save('wm_ap_tint_color', ap.tintColor)
      save('wm_ap_tint_blend', ap.tintBlend)
      save('wm_ap_colorize_on', ap.colorizeOn)
      document.getElementById('ap-brightness').value    = ap.brightness
      document.getElementById('ap-contrast').value      = ap.contrast
      document.getElementById('ap-saturation').value    = ap.saturation
      document.getElementById('ap-gamma').value         = ap.gamma
      document.getElementById('ap-tint-strength').value = ap.tintStrength
      document.getElementById('ap-tint-color').value    = ap.tintColor
      document.getElementById('ap-tint-blend').value    = ap.tintBlend
      document.getElementById('ap-brightness-val').textContent = ap.brightness
      document.getElementById('ap-contrast-val').textContent   = ap.contrast
      document.getElementById('ap-saturation-val').textContent = ap.saturation
      document.getElementById('ap-gamma-val').textContent      = (ap.gamma / 100).toFixed(1)
      document.getElementById('ap-tint-val').textContent       = ap.tintStrength
      syncColorizeUI()
      applyFilter()
    })

    applyFilter()

    // Expose state API for presets
    _apGetState = () => ({ ...ap })
    _apLoadState = (state) => {
      Object.assign(ap, state)
      document.getElementById('ap-brightness').value            = ap.brightness
      document.getElementById('ap-brightness-val').textContent  = ap.brightness
      document.getElementById('ap-contrast').value              = ap.contrast
      document.getElementById('ap-contrast-val').textContent    = ap.contrast
      document.getElementById('ap-saturation').value            = ap.saturation
      document.getElementById('ap-saturation-val').textContent  = ap.saturation
      document.getElementById('ap-gamma').value                 = ap.gamma
      document.getElementById('ap-gamma-val').textContent       = (ap.gamma / 100).toFixed(1)
      document.getElementById('ap-tint-strength').value         = ap.tintStrength
      document.getElementById('ap-tint-val').textContent        = ap.tintStrength
      document.getElementById('ap-tint-color').value            = ap.tintColor
      document.getElementById('ap-tint-blend').value            = ap.tintBlend || 'multiply'
      syncColorizeUI()
      applyFilter()
    }
  })()

  // ── Gridlines ──────────────────────────────────────────────────────────────
  const gridlines = initGridlines(map)

  ;(function () {
    const glEnabled  = document.getElementById('gl-enabled')
    const glColor    = document.getElementById('gl-color')
    const glOpacity  = document.getElementById('gl-opacity')
    const glOpacVal  = document.getElementById('gl-opacity-val')
    const glWidth    = document.getElementById('gl-width')
    const glWidthVal = document.getElementById('gl-width-val')
    const glLatSp    = document.getElementById('gl-lat-spacing')
    const glLonSp    = document.getElementById('gl-lon-spacing')
    const glLabels   = document.getElementById('gl-labels')

    function syncUI(cfg) {
      glEnabled.checked   = cfg.enabled
      glColor.value       = cfg.color
      glOpacity.value     = Math.round(cfg.opacity * 100)
      glOpacVal.textContent = `${Math.round(cfg.opacity * 100)}%`
      glWidth.value       = Math.round(cfg.width * 10)
      glWidthVal.textContent = cfg.width.toFixed(1)
      glLatSp.value       = String(cfg.latSpacing)
      glLonSp.value       = String(cfg.lonSpacing)
      glLabels.checked    = cfg.showLabels
    }

    function read() {
      return {
        enabled:    glEnabled.checked,
        color:      glColor.value,
        opacity:    +glOpacity.value / 100,
        width:      +glWidth.value / 10,
        latSpacing: +glLatSp.value,
        lonSpacing: +glLonSp.value,
        showLabels: glLabels.checked
      }
    }

    function commit() { gridlines.setConfig(read()) }

    glEnabled.addEventListener('change', commit)
    glColor.addEventListener('input',  commit)
    glOpacity.addEventListener('input', () => {
      glOpacVal.textContent = `${glOpacity.value}%`; commit()
    })
    glWidth.addEventListener('input', () => {
      glWidthVal.textContent = (+glWidth.value / 10).toFixed(1); commit()
    })
    glLatSp.addEventListener('change',  commit)
    glLonSp.addEventListener('change',  commit)
    glLabels.addEventListener('change', commit)

    syncUI(gridlines.config)
  })()

  // ── Labels & Lines ──────────────────────────────────────────────────────────
  const labelStyle = initLabelStyle(map)

  ;(function () {
    const notice   = document.getElementById('ll-raster-notice')
    const controls = document.getElementById('ll-controls')

    function updateVectorNotice() {
      const isVec = labelStyle.isVectorStyle()
      notice.style.display   = isVec ? 'none' : ''
      controls.style.display = isVec ? '' : 'none'
    }
    map.on('style.load', updateVectorNotice)
    updateVectorNotice()

    // Label rows
    document.querySelectorAll('#sec-labellines .ll-row[data-label]').forEach(row => {
      const cat   = row.dataset.label
      const vis   = row.querySelector('.ll-vis')
      const color = row.querySelector('.ll-color')
      const size  = row.querySelector('.ll-size')

      function commit() {
        labelStyle.setLabel(cat, {
          visible: vis.checked ? null : false,  // null = no override when checked
          color:   color.value,
          size:    size.value ? +size.value : null
        })
      }
      // Treating "checked" as "use default visibility" rather than forced-true
      vis.addEventListener('change', () => {
        labelStyle.setLabel(cat, { visible: vis.checked ? null : false })
      })
      color.addEventListener('input',  () => labelStyle.setLabel(cat, { color: color.value }))
      size.addEventListener('input',   () => labelStyle.setLabel(cat, { size: size.value ? +size.value : null }))
    })

    // Line rows
    document.querySelectorAll('#sec-labellines .ll-row[data-line]').forEach(row => {
      const cat   = row.dataset.line
      const vis   = row.querySelector('.ll-vis')
      const color = row.querySelector('.ll-color')
      const width = row.querySelector('.ll-width')

      vis.addEventListener('change', () => {
        labelStyle.setLine(cat, { visible: vis.checked ? null : false })
      })
      color.addEventListener('input',  () => labelStyle.setLine(cat, { color: color.value }))
      width.addEventListener('input',  () => labelStyle.setLine(cat, { width: width.value ? +width.value : null }))
    })

    document.getElementById('ll-reset-btn').addEventListener('click', () => {
      labelStyle.reset()
      // Reset UI to default/checked state
      document.querySelectorAll('#sec-labellines .ll-vis').forEach(el => { el.checked = true })
      document.querySelectorAll('#sec-labellines .ll-size, #sec-labellines .ll-width')
        .forEach(el => { el.value = '' })
    })
  })()

  // ── Map Style Store ─────────────────────────────────────────────────────────
  const msStore = initMapStyleStore()

  function msCollectState() {
    return {
      provider:  activeProvider,
      mapStyle:  activeStyle,
      ..._apGetState(),
      gridlines: gridlines.getState(),
      ...labelStyle.getState()
    }
  }

  function msApplyStyle(s) {
    // 1. Provider / tile style
    if (s.provider && (s.provider !== activeProvider || s.mapStyle !== activeStyle)) {
      activeProvider = s.provider
      activeStyle    = s.mapStyle || Object.keys(PROVIDERS[s.provider]?.styles ?? {})[0]
      save('wm_provider', activeProvider)
      save('wm_style',    activeStyle)
      document.getElementById('provider-select').value = activeProvider
      renderStyleButtons()
      _onBaseMapChange?.(activeProvider, activeStyle)
    }
    // 2. Appearance
    const apFields = ['brightness','contrast','saturation','gamma','tintColor','tintStrength','colorizeOn','colorizeHue']
    const apState  = {}
    apFields.forEach(k => { if (s[k] != null) apState[k] = s[k] })
    if (Object.keys(apState).length) _apLoadState(apState)
    // 3. Gridlines
    if (s.gridlines) gridlines.setConfig(s.gridlines)
    // 4. Labels / Lines (applied immediately; labelStyle re-applies on style.load too)
    if (s.labels || s.lines) labelStyle.loadState({ labels: s.labels, lines: s.lines })
  }

  function msRenderSelect() {
    const sel = document.getElementById('ms-style-select')
    const prev = sel.value
    sel.innerHTML = '<option value="">— unsaved —</option>'
    msStore.styles.forEach(s => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.name
      sel.appendChild(opt)
    })
    if (msStore.styles.find(s => s.id === prev)) sel.value = prev
  }

  function msInfo(msg, ok = true) {
    const el = document.getElementById('ms-info')
    el.textContent = msg
    el.style.color = ok ? '#44aa66' : '#ee6655'
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = '' }, 2500)
  }

  msRenderSelect()

  document.getElementById('ms-style-select').addEventListener('change', (e) => {
    const s = msStore.getById(e.target.value)
    if (!s) return
    document.getElementById('ms-name-input').value = s.name
    msApplyStyle(s)
    msInfo(`Loaded "${s.name}"`)
  })

  document.getElementById('ms-save-btn').addEventListener('click', () => {
    const name = document.getElementById('ms-name-input').value.trim()
    if (!name) { msInfo('Enter a style name first', false); return }
    const saved = msStore.save(name, msCollectState())
    msRenderSelect()
    document.getElementById('ms-style-select').value = saved.id
    msInfo(`Saved "${name}"`)
  })

  document.getElementById('ms-new-btn').addEventListener('click', () => {
    document.getElementById('ms-style-select').value = ''
    document.getElementById('ms-name-input').value   = ''
  })

  document.getElementById('ms-dup-btn').addEventListener('click', () => {
    const id = document.getElementById('ms-style-select').value
    if (!id) { msInfo('Select a style to duplicate', false); return }
    const copy = msStore.duplicate(id)
    if (copy) {
      msRenderSelect()
      document.getElementById('ms-style-select').value = copy.id
      document.getElementById('ms-name-input').value   = copy.name
      msInfo(`Duplicated as "${copy.name}"`)
    }
  })

  document.getElementById('ms-del-btn').addEventListener('click', () => {
    const id   = document.getElementById('ms-style-select').value
    const name = document.getElementById('ms-style-select').selectedOptions[0]?.text
    if (!id) return
    msStore.delete(id)
    msRenderSelect()
    document.getElementById('ms-name-input').value = ''
    msInfo(`Deleted "${name}"`)
  })

  document.getElementById('ms-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ms-save-btn').click()
  })

  // ── Appearance Presets ─────────────────────────────────────────────────────
  let apPresets = JSON.parse(localStorage.getItem('wm_ap_presets') || '[]')

  function saveApPresets() {
    localStorage.setItem('wm_ap_presets', JSON.stringify(apPresets))
  }

  function renderApPresets() {
    const list = document.getElementById('ap-preset-list')
    list.innerHTML = ''
    if (!apPresets.length) {
      const empty = document.createElement('div')
      empty.className = 'saved-loc-empty'
      empty.textContent = 'No presets saved yet.'
      list.appendChild(empty)
      return
    }
    apPresets.forEach((preset, i) => {
      const row = document.createElement('div')
      row.className = 'saved-loc-item'

      const name = document.createElement('span')
      name.className = 'saved-loc-name'
      name.textContent = preset.name
      name.title = preset.name

      const loadBtn = document.createElement('button')
      loadBtn.className = 'saved-loc-go'
      loadBtn.textContent = 'Load'
      loadBtn.addEventListener('click', () => {
        const { name: _n, ...state } = preset
        _apLoadState(state)
        // Persist loaded values
        Object.entries(state).forEach(([k, v]) => {
          const key = `wm_ap_${k.replace(/([A-Z])/g, '_$1').toLowerCase()}`
          save(key, v)
        })
      })

      const delBtn = document.createElement('button')
      delBtn.className = 'saved-loc-del'
      delBtn.textContent = '×'
      delBtn.title = 'Delete preset'
      delBtn.addEventListener('click', () => {
        apPresets.splice(i, 1)
        saveApPresets()
        renderApPresets()
      })

      row.append(name, loadBtn, delBtn)
      list.appendChild(row)
    })
  }

  document.getElementById('ap-preset-save-btn').addEventListener('click', () => {
    const input = document.getElementById('ap-preset-name')
    const name = input.value.trim() || `Preset ${apPresets.length + 1}`
    apPresets.push({ name, ..._apGetState() })
    saveApPresets()
    input.value = ''
    renderApPresets()
  })

  document.getElementById('ap-preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ap-preset-save-btn').click()
  })

  renderApPresets()

  // ── Country Style ──────────────────────────────────────────────────────────
  const countryStyle = initCountryStyle(map)

  function renderCountryStyleList() {
    const list = document.getElementById('country-style-list')
    list.innerHTML = ''
    const entries = Object.entries(countryStyle.styles)
    if (!entries.length) {
      const empty = document.createElement('div')
      empty.className = 'saved-loc-empty'
      empty.textContent = 'No styled countries yet.'
      list.appendChild(empty)
      return
    }
    entries.forEach(([iso, s]) => {
      const row = document.createElement('div')
      row.className = 'saved-loc-item'

      const swatch = document.createElement('span')
      swatch.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:2px;background:${s.color};flex-shrink:0;margin-right:4px;border:1px solid rgba(255,255,255,0.2)`

      const name = document.createElement('span')
      name.className = 'saved-loc-name'
      name.textContent = countryStyle.getCountryName(iso)
      name.title = iso

      const delBtn = document.createElement('button')
      delBtn.className = 'saved-loc-del'
      delBtn.textContent = '×'
      delBtn.title = 'Remove style'
      delBtn.addEventListener('click', () => {
        countryStyle.removeStyle(iso)
      })

      row.append(swatch, name, delBtn)
      list.appendChild(row)
    })
  }

  function syncCountryPanel(iso) {
    const nameEl    = document.getElementById('country-selected-name')
    const styleRow  = document.getElementById('country-style-row')
    const btnRow    = document.getElementById('country-btn-row')

    if (!iso) {
      nameEl.textContent = 'Click a country on the map'
      styleRow.style.display = 'none'
      btnRow.style.display   = 'none'
      return
    }

    const countryName = countryStyle.getCountryName(iso)
    nameEl.textContent = countryName || iso

    // Pre-fill with existing style if any
    const existing = countryStyle.styles[iso]
    if (existing) {
      document.getElementById('country-fill-color').value = existing.color
      document.getElementById('country-fill-opacity').value = Math.round(existing.opacity * 100)
      document.getElementById('country-fill-opacity-val').textContent = `${Math.round(existing.opacity * 100)}%`
    }

    styleRow.style.display = ''
    btnRow.style.display   = ''
  }

  countryStyle.onchange = () => {
    renderCountryStyleList()
    syncCountryPanel(countryStyle.selectedISO)
  }
  countryStyle.onselect = syncCountryPanel

  document.getElementById('country-fill-opacity').addEventListener('input', (e) => {
    document.getElementById('country-fill-opacity-val').textContent = `${e.target.value}%`
  })

  document.getElementById('country-apply-btn').addEventListener('click', () => {
    const iso = countryStyle.selectedISO
    if (!iso) return
    const color   = document.getElementById('country-fill-color').value
    const opacity = +document.getElementById('country-fill-opacity').value / 100
    countryStyle.setStyle(iso, color, opacity)
  })

  document.getElementById('country-remove-btn').addEventListener('click', () => {
    if (countryStyle.selectedISO) countryStyle.removeStyle(countryStyle.selectedISO)
  })

  document.getElementById('country-deselect-btn').addEventListener('click', () => {
    countryStyle.deselect()
  })

  document.getElementById('country-clear-all-btn').addEventListener('click', () => {
    if (Object.keys(countryStyle.styles).length === 0) return
    countryStyle.clearAll()
  })

  document.getElementById('toggle-country-style').addEventListener('change', (e) => {
    const panel = document.getElementById('country-selection-panel')
    if (e.target.checked) {
      panel.style.display = ''
      countryStyle.enable()
    } else {
      panel.style.display = 'none'
      countryStyle.disable()
    }
  })

  renderCountryStyleList()

  // ── KML Import ─────────────────────────────────────────────────────────────
  const kml = initKMLLayer(map)

  function renderKMLList() {
    const list = document.getElementById('kml-file-list')
    list.innerHTML = ''
    if (!kml.files.length) {
      const empty = document.createElement('div')
      empty.className = 'kml-empty'
      empty.textContent = 'No files imported yet.'
      list.appendChild(empty)
      return
    }
    kml.files.forEach(f => {
      const row = document.createElement('div')
      row.className = 'kml-row'

      const chk = document.createElement('input')
      chk.type    = 'checkbox'
      chk.checked = f.visible
      chk.className = 'kml-chk'
      chk.addEventListener('change', () => kml.setVisible(f.id, chk.checked))

      const name = document.createElement('span')
      name.className   = 'kml-name'
      name.textContent = f.name
      name.title       = f.name

      const count = document.createElement('span')
      count.className   = 'kml-count'
      count.textContent = `${f.geojson.features.length}`

      const fitBtn = document.createElement('button')
      fitBtn.className   = 'kml-action-btn'
      fitBtn.textContent = '⊙'
      fitBtn.title       = 'Zoom to layer'
      fitBtn.addEventListener('click', () => kml.fitToFile(f.id))

      const delBtn = document.createElement('button')
      delBtn.className   = 'kml-action-btn kml-del'
      delBtn.textContent = '×'
      delBtn.title       = 'Remove'
      delBtn.addEventListener('click', () => kml.remove(f.id))

      row.append(chk, name, count, fitBtn, delBtn)
      list.appendChild(row)
    })
  }

  kml.onchange = renderKMLList
  renderKMLList()

  document.getElementById('kml-import-btn').addEventListener('click', () => kml.openFilePicker())

  // Drag-and-drop KML onto the map canvas
  const mapEl = document.getElementById('map')
  mapEl.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.items].some(i => i.kind === 'file')) {
      e.preventDefault()
      mapEl.classList.add('kml-drag-over')
    }
  })
  mapEl.addEventListener('dragleave', () => mapEl.classList.remove('kml-drag-over'))
  mapEl.addEventListener('drop', (e) => {
    e.preventDefault()
    mapEl.classList.remove('kml-drag-over')
    kml.handleDrop(e.dataTransfer)
    kml.onchange = () => { renderKMLList(); kml.onchange = renderKMLList }
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
        const state = loc.drawState
        map.flyTo({
          center: loc.center, zoom: loc.zoom,
          pitch: loc.pitch, bearing: loc.bearing,
          duration: 2000, essential: true
        })
        if (state) {
          map.once('moveend', () => drawContext.restoreState(state))
        }
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
    savedProvider:   activeProvider,
    savedStyle:      activeStyle,
    savedProjection,
    onBaseMapChange(cb) { _onBaseMapChange = cb },
    updateOverlays(newOverlays) {
      _overlays = newOverlays
      _bindSourceBadges(newOverlays)
    }
  }
}

function _bindSourceBadges(overlays) {
  const badges = {
    flights:      document.getElementById('src-badge-flights'),
    flightradar:  document.getElementById('src-badge-flightradar')
  }
  for (const [key, el] of Object.entries(badges)) {
    if (!el) continue
    overlays[key]?.onUpdate?.(({ source, count }) => {
      el.textContent = `${source} · ${count.toLocaleString()}`
      el.style.display = ''
    })
  }
}
