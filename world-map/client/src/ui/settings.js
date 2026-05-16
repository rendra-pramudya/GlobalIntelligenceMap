export function initSettings() {
  const modal = document.createElement('div')
  modal.id = 'settings-modal'
  modal.innerHTML = `
    <div class="settings-overlay"></div>
    <div class="settings-panel">
      <div class="settings-header">
        <span class="settings-title">API Settings</span>
        <button class="settings-close" id="settings-close">✕</button>
      </div>
      <div class="settings-body">
        <p class="settings-note">
          Settings are saved on the server and persist across restarts.
          Leave a field blank to keep the current value.
        </p>

        <div class="settings-section">
          <div class="settings-section-title">
            OpenSky Network
            <span class="badge badge-free">Free</span>
          </div>
          <p class="settings-desc">Optional — increases flight data rate limits.</p>
          <label class="settings-label">
            Username
            <input class="settings-input" type="text" name="OPENSKY_USER" placeholder="your-username" />
          </label>
          <label class="settings-label">
            Password
            <input class="settings-input" type="password" name="OPENSKY_PASS" placeholder="••••••••" />
          </label>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">
            FlightRadar24
            <span class="badge badge-paid">Paid</span>
          </div>
          <p class="settings-desc">
            Real-time flight data with aircraft type, route, and registration.
            Register at <a href="https://fr24api.com" target="_blank">fr24api.com</a>.
            When set, replaces OpenSky as the flights data source.
          </p>
          <label class="settings-label">
            API Key
            <input class="settings-input" type="password" name="FR24_API_KEY" placeholder="••••••••" />
          </label>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">
            AIS Stream
            <span class="badge badge-free">Free tier</span>
          </div>
          <p class="settings-desc">Real vessel positions. Mock data shown if not set.</p>
          <label class="settings-label">
            API Key
            <input class="settings-input" type="password" name="AIS_API_KEY" placeholder="••••••••" />
          </label>
          <label class="settings-label">
            API URL
            <input class="settings-input" type="text" name="AIS_API_URL" placeholder="https://api.aisstream.io/v0/stream" />
          </label>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">
            OpenWeatherMap
            <span class="badge badge-required">Required for weather</span>
          </div>
          <p class="settings-desc">Register free at <a href="https://openweathermap.org" target="_blank">openweathermap.org</a></p>
          <label class="settings-label">
            API Key
            <input class="settings-input" type="password" name="OWM_API_KEY" placeholder="••••••••" />
          </label>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">
            ACLED Conflict Data
            <span class="badge badge-required">Required for conflict</span>
          </div>
          <p class="settings-desc">Free academic/journalist access at <a href="https://acleddata.com" target="_blank">acleddata.com</a></p>
          <label class="settings-label">
            API Key
            <input class="settings-input" type="password" name="ACLED_KEY" placeholder="••••••••" />
          </label>
          <label class="settings-label">
            Email
            <input class="settings-input" type="email" name="ACLED_EMAIL" placeholder="you@example.com" />
          </label>
        </div>

        <div class="settings-actions">
          <span class="settings-status" id="settings-status"></span>
          <button class="settings-save" id="settings-save">Save Settings</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const inputs = modal.querySelectorAll('.settings-input')
  const status = document.getElementById('settings-status')

  // Load current values
  fetch('/api/settings')
    .then(r => r.json())
    .then(cfg => {
      inputs.forEach(input => {
        if (input.name in cfg) input.placeholder = cfg[input.name] || input.placeholder
      })
    })
    .catch(() => {})

  // Save
  document.getElementById('settings-save').onclick = async () => {
    const body = {}
    inputs.forEach(input => { if (input.value) body[input.name] = input.value })
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      inputs.forEach(input => { input.value = '' })
      status.textContent = 'Saved!'
      status.className = 'settings-status settings-status-ok'
      setTimeout(() => { status.textContent = '' }, 2500)
    } catch {
      status.textContent = 'Save failed'
      status.className = 'settings-status settings-status-err'
    }
  }

  // Close
  const close = () => modal.classList.remove('open')
  document.getElementById('settings-close').onclick = close
  modal.querySelector('.settings-overlay').onclick = close

  return {
    open() { modal.classList.add('open') }
  }
}
