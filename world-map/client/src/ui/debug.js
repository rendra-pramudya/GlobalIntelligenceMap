export function initDebug() {
  const modal = document.createElement('div')
  modal.id = 'debug-modal'
  modal.innerHTML = `
    <div class="debug-overlay"></div>
    <div class="debug-panel">
      <div class="debug-header">
        <span class="debug-title">API Diagnostics</span>
        <button class="debug-close" id="debug-close">✕</button>
      </div>
      <div class="debug-body">
        <div class="debug-actions">
          <span class="debug-meta" id="debug-meta"></span>
          <button class="debug-run-btn" id="debug-run">▶ Run Diagnostics</button>
        </div>
        <div id="debug-config-section" class="debug-section" style="display:none">
          <div class="debug-section-title">API Keys Configured</div>
          <div id="debug-config-grid" class="debug-config-grid"></div>
        </div>
        <div id="debug-apis-section" class="debug-section" style="display:none">
          <div class="debug-section-title">Live API Status <span class="debug-hint">(probes external services)</span></div>
          <table class="debug-table" id="debug-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Source</th>
                <th>Items</th>
                <th>Time</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody id="debug-tbody"></tbody>
          </table>
        </div>
        <div id="debug-ws-section" class="debug-section" style="display:none">
          <div class="debug-section-title">WebSocket (drawings sync)</div>
          <div id="debug-ws-info" class="debug-ws-info"></div>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.classList.remove('open')
  document.getElementById('debug-close').onclick = close
  modal.querySelector('.debug-overlay').onclick = close

  document.getElementById('debug-run').onclick = runDiagnostics

  async function runDiagnostics(force = true) {
    const btn  = document.getElementById('debug-run')
    const meta = document.getElementById('debug-meta')
    btn.disabled = true
    btn.textContent = '⏳ Running…'
    meta.textContent = ''

    try {
      const res  = await fetch(`/api/debug?force=${force ? 1 : 0}`)
      const data = await res.json()
      renderResults(data)
    } catch (e) {
      meta.textContent = `❌ Could not reach server: ${e.message}`
    } finally {
      btn.disabled = false
      btn.textContent = '▶ Re-run'
    }
  }

  function renderResults(data) {
    const meta = document.getElementById('debug-meta')
    const ts   = new Date(data.timestamp).toLocaleTimeString()
    meta.textContent = `Last run: ${ts}${data.cached ? ' (cached — click Re-run for fresh results)' : ''}`

    // ── Config grid ──────────────────────────────────────────────────────────
    const grid = document.getElementById('debug-config-grid')
    grid.innerHTML = ''
    for (const [key, set] of Object.entries(data.config)) {
      const chip = document.createElement('div')
      chip.className = `debug-chip ${set ? 'chip-ok' : 'chip-missing'}`
      chip.textContent = key
      chip.title = set ? 'Configured' : 'Not set'
      grid.appendChild(chip)
    }
    document.getElementById('debug-config-section').style.display = ''

    // ── APIs table ───────────────────────────────────────────────────────────
    const tbody = document.getElementById('debug-tbody')
    tbody.innerHTML = ''
    for (const [name, api] of Object.entries(data.apis)) {
      const tr = document.createElement('tr')
      const badge = statusBadge(api.status)
      const note  = [api.error, api.note].filter(Boolean).join(' ')
      tr.innerHTML = `
        <td class="debug-name">${name}</td>
        <td>${badge}</td>
        <td class="debug-source">${api.source || '–'}</td>
        <td class="debug-num">${api.features != null ? api.features.toLocaleString() : '–'}</td>
        <td class="debug-num">${api.time_ms != null && api.time_ms > 0 ? api.time_ms + ' ms' : '–'}</td>
        <td class="debug-note">${note || ''}</td>
      `
      tbody.appendChild(tr)
    }
    document.getElementById('debug-apis-section').style.display = ''

    // ── WebSocket ─────────────────────────────────────────────────────────────
    const wsEl  = document.getElementById('debug-ws-info')
    const wsUrl = `ws://${location.host}/ws`
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
    // Check by probing a short-lived WS
    const testWs = new WebSocket(wsUrl)
    let settled = false
    const finish = (s) => {
      if (settled) return
      settled = true
      testWs.close()
      wsEl.innerHTML = s
    }
    testWs.onopen  = () => finish(`<span class="debug-badge badge-ok">Connected</span> ${wsUrl}`)
    testWs.onerror = () => finish(`<span class="debug-badge badge-error">Failed</span> ${wsUrl}`)
    setTimeout(() => finish(`<span class="debug-badge badge-warn">Timeout</span> ${wsUrl}`), 4000)
    document.getElementById('debug-ws-section').style.display = ''
  }

  function statusBadge(status) {
    const map = {
      ok:           'badge-ok',
      configured:   'badge-ok',
      unconfigured: 'badge-warn',
      mock:         'badge-warn',
      error:        'badge-error'
    }
    const cls = map[status] || 'badge-warn'
    return `<span class="debug-badge ${cls}">${status}</span>`
  }

  return {
    open() {
      modal.classList.add('open')
      // Auto-run on first open (using cache if available)
      if (!document.getElementById('debug-meta').textContent) {
        runDiagnostics(false)
      }
    }
  }
}
