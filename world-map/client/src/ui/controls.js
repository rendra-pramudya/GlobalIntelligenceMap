import { setProjection, enableTerrain, disableTerrain, setBaseMap, PROVIDERS } from '../map.js'
import { initSettings } from './settings.js'
import { initKMLLayer } from '../overlays/kmlLayer.js'

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
  let isSatellite    = load('wm_satellite', 'false') === 'true'

  // ── Panel HTML ─────────────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.id = 'controls'
  panel.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">World Map</span>
        <div class="panel-header-actions">
          <button class="settings-btn" id="minimize-panel" title="Minimize">−</button>
          <button class="settings-btn" id="open-debug" title="API Diagnostics">🔍</button>
          <button class="settings-btn" id="open-settings" title="API Settings">⚙</button>
        </div>
      </div>

      <div class="panel-body">
      <div class="place-finder">
        <input id="place-input" class="place-input" type="text" placeholder="Find a place…" />
        <button id="place-go" class="place-go-btn">Go</button>
      </div>

      <div class="section-label">Tile Provider</div>
      <div class="provider-toggle">
        <button class="provider-btn" data-provider="openfreemap">OpenFreeMap</button>
        <button class="provider-btn" data-provider="arcgis">ArcGIS</button>
      </div>

      <div class="section-label">Map Style</div>
      <div id="style-btn-row" class="style-btn-row"></div>
      <div class="basemap-toggle" style="margin-top:5px">
        <button id="btn-satellite" class="basemap-btn">🛰 Satellite</button>
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
      <label class="layer-toggle"><input type="checkbox" data-layer="flights">      Flights (ADS-B / OpenSky)</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="flightradar"> Flights (ADS-B Exchange / FR24)</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="vessels">   Marine vessels</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="earthquakes"> Earthquakes</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="weather">   Weather</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="conflict">  Conflict (ACLED)</label>

      <div class="section-label">KML / Data Import
        <button class="kml-import-btn" id="kml-import-btn" title="Import KML file">＋ KML</button>
      </div>
      <div id="kml-file-list"></div>
      <div class="section-label" id="weather-sub" style="display:none">Weather layer</div>
      <select id="weather-select" style="display:none">
        <option value="precipitation_new">Precipitation</option>
        <option value="clouds_new">Clouds</option>
        <option value="temp_new">Temperature</option>
        <option value="wind_new">Wind speed</option>
        <option value="pressure_new">Pressure</option>
      </select>

      <div class="section-label">Appearance
        <button class="appearance-reset-btn" id="appearance-reset" title="Reset to defaults">↺</button>
      </div>
      <div class="appearance-controls">
        <div class="ap-row">
          <span class="ap-label">Brightness</span>
          <input type="range" class="ap-slider" id="ap-brightness" min="0" max="200" step="1" value="100">
          <span class="ap-val" id="ap-brightness-val">100</span>
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
  document.getElementById(savedProjection === 'globe' ? 'btn-globe' : 'btn-mercator')
    .classList.add('active')
  document.getElementById('toggle-labels').checked  = labelsVisible
  document.getElementById('toggle-terrain').checked = terrainEnabled

  // ── Settings + Debug modals ────────────────────────────────────────────────
  const settings = initSettings()
  document.getElementById('open-settings').onclick = () => settings.open()
  document.getElementById('open-debug').onclick    = () => debug?.open()

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

  // ── Provider + style switcher ──────────────────────────────────────────────
  function renderStyleButtons() {
    const row = document.getElementById('style-btn-row')
    row.innerHTML = ''
    const styles = PROVIDERS[activeProvider]?.styles ?? {}
    Object.entries(styles).forEach(([key, { label }]) => {
      const btn = document.createElement('button')
      btn.className = 'style-btn' + (key === activeStyle && !isSatellite ? ' active' : '')
      btn.textContent = label
      btn.dataset.style = key
      btn.addEventListener('click', () => {
        if (isSatellite) {
          isSatellite = false
          save('wm_satellite', 'false')
          document.getElementById('btn-satellite').classList.remove('active')
        }
        activeStyle = key
        save('wm_style', key)
        row.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        _onBaseMapChange?.(activeProvider, activeStyle)
      })
      row.appendChild(btn)
    })
  }

  function renderProviderButtons() {
    panel.querySelectorAll('.provider-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.provider === activeProvider)
      btn.addEventListener('click', () => {
        activeProvider = btn.dataset.provider
        save('wm_provider', activeProvider)
        // Default to first style of new provider
        activeStyle = Object.keys(PROVIDERS[activeProvider].styles)[0]
        save('wm_style', activeStyle)
        panel.querySelectorAll('.provider-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.provider === activeProvider))
        renderStyleButtons()
        if (!isSatellite) _onBaseMapChange?.(activeProvider, activeStyle)
      })
    })
  }

  renderProviderButtons()
  renderStyleButtons()

  document.getElementById('btn-satellite').classList.toggle('active', isSatellite)
  document.getElementById('btn-satellite').addEventListener('click', () => {
    isSatellite = !isSatellite
    save('wm_satellite', isSatellite)
    document.getElementById('btn-satellite').classList.toggle('active', isSatellite)
    document.getElementById('style-btn-row')
      .querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'))
    if (!isSatellite) {
      document.getElementById('style-btn-row')
        .querySelector(`[data-style="${activeStyle}"]`)?.classList.add('active')
    }
    _onBaseMapChange?.(isSatellite ? 'satellite' : activeProvider,
                       isSatellite ? 'satellite' : activeStyle)
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
      brightness: 100, saturation: 100, gamma: 100,
      tintColor: '#0044ff', tintStrength: 0,
      colorizeOn: false, colorizeHue: 200
    }

    // Load persisted values
    const ap = {
      brightness:   +load('wm_ap_brightness',    DEFAULTS.brightness),
      saturation:   +load('wm_ap_saturation',    DEFAULTS.saturation),
      gamma:        +load('wm_ap_gamma',          DEFAULTS.gamma),
      tintColor:     load('wm_ap_tint_color',     DEFAULTS.tintColor),
      tintStrength: +load('wm_ap_tint_strength',  DEFAULTS.tintStrength),
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

      parts.push(`brightness(${ap.brightness / 100})`, `saturate(${ap.saturation / 100})`)
      map.getContainer().style.filter = parts.join(' ')

      // Tint overlay
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
      ;['brightness', 'saturation', 'gamma', 'tintStrength', 'colorizeHue'].forEach(k => {
        save(`wm_ap_${k}`, ap[k])
      })
      save('wm_ap_tint_color', ap.tintColor)
      save('wm_ap_colorize_on', ap.colorizeOn)
      document.getElementById('ap-brightness').value    = ap.brightness
      document.getElementById('ap-saturation').value    = ap.saturation
      document.getElementById('ap-gamma').value         = ap.gamma
      document.getElementById('ap-tint-strength').value = ap.tintStrength
      document.getElementById('ap-tint-color').value    = ap.tintColor
      document.getElementById('ap-brightness-val').textContent = ap.brightness
      document.getElementById('ap-saturation-val').textContent = ap.saturation
      document.getElementById('ap-gamma-val').textContent      = (ap.gamma / 100).toFixed(1)
      document.getElementById('ap-tint-val').textContent       = ap.tintStrength
      syncColorizeUI()
      applyFilter()
    })

    applyFilter()
  })()

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
    savedIsSatellite: isSatellite,
    savedProjection,
    onBaseMapChange(cb) { _onBaseMapChange = cb },
    updateOverlays(newOverlays) { _overlays = newOverlays }
  }
}
