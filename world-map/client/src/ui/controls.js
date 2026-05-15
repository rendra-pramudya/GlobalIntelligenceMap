import { setProjection } from '../map.js'

export function initControls(map, drawContext, overlays) {
  const panel = document.createElement('div')
  panel.id = 'controls'
  panel.innerHTML = `
    <div class="panel">
      <div class="panel-title">World Map</div>

      <div class="section-label">Projection</div>
      <div class="projection-toggle">
        <button id="btn-mercator" class="proj-btn active">Mercator</button>
        <button id="btn-globe" class="proj-btn">Globe</button>
      </div>

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
  panel.querySelectorAll('input[data-layer]').forEach(input => {
    input.addEventListener('change', () => {
      const layer = input.dataset.layer
      overlays[layer]?.toggle()

      if (layer === 'weather') {
        document.getElementById('weather-sub').style.display = input.checked ? '' : 'none'
        document.getElementById('weather-select').style.display = input.checked ? '' : 'none'
      }
    })
  })

  // Weather sub-layer selector
  document.getElementById('weather-select').addEventListener('change', (e) => {
    overlays.weather.setLayer(e.target.value)
  })
}
