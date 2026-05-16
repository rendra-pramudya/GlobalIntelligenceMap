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
        <button class="settings-btn" id="open-settings" title="API Settings">⚙</button>
      </div>

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

      <div class="section-label">Camera</div>
      <div class="tilt-row">
        <span class="tilt-label">Tilt</span>
        <input type="range" id="tilt-slider" class="tilt-slider" min="0" max="85" value="0" step="1">
        <span id="tilt-value" class="tilt-value">0°</span>
      </div>
      <label class="layer-toggle"><input type="checkbox" id="toggle-rotation"> Auto-rotate</label>

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
    </div>
  `
  document.body.appendChild(panel)

  const settings = initSettings()
  document.getElementById('open-settings').onclick = () => settings.open()

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

  // Tilt / pitch slider
  const tiltSlider = document.getElementById('tilt-slider')
  const tiltValueEl = document.getElementById('tilt-value')

  tiltSlider.addEventListener('input', () => {
    const pitch = +tiltSlider.value
    map.setPitch(pitch)
    tiltValueEl.textContent = `${pitch}°`
  })

  map.on('pitch', () => {
    const pitch = Math.round(map.getPitch())
    tiltSlider.value = pitch
    tiltValueEl.textContent = `${pitch}°`
  })

  // Auto-rotate (globe spin)
  let rotating = false
  let spinRaf = null

  function spinStep() {
    map.setBearing((map.getBearing() + 0.05) % 360)
    spinRaf = requestAnimationFrame(spinStep)
  }

  function startSpin() { if (rotating && !spinRaf) spinRaf = requestAnimationFrame(spinStep) }
  function stopSpin()  { if (spinRaf) { cancelAnimationFrame(spinRaf); spinRaf = null } }

  document.getElementById('toggle-rotation').addEventListener('change', (e) => {
    rotating = e.target.checked
    rotating ? startSpin() : stopSpin()
  })

  // Pause while the user drags; resume on release
  map.on('mousedown',  stopSpin)
  map.on('touchstart', stopSpin)
  map.on('mouseup',    startSpin)
  map.on('touchend',   startSpin)

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
