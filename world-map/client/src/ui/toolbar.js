import './toolbar.css'

const ROWS = [
  { L: { kind: 'line',   type: 'STROKE', color: 'RED',    lm: 'freehand_line'    }, R: { kind: 'tool',   name: 'INTERACTIVE', mode: 'simple_select',    title: 'Select' } },
  { L: { kind: 'line',   type: 'FILL',   color: 'RED',    lm: 'freehand_line'    }, R: { kind: 'tool',   name: 'MOVE',        mode: 'simple_select',    title: 'Move' } },
  { L: { kind: 'line',   type: 'DASHED', color: 'RED',    lm: 'freehand_line'    }, R: { kind: 'tool',   name: 'PEN',         mode: 'freehand_line',    title: 'Draw line' } },
  { L: { kind: 'line',   type: 'ARROW',  color: 'RED',    lm: 'freehand_line'    }, R: { kind: 'tool',   name: 'RULER',       mode: 'freehand_polygon', title: 'Draw polygon' } },
  { L: { kind: 'line',   type: 'STROKE', color: 'YELLOW', lm: 'freehand_line'    }, R: { kind: 'action', name: 'UNDO',   title: 'Undo' } },
  { L: { kind: 'line',   type: 'FILL',   color: 'YELLOW', lm: 'freehand_line'    }, R: { kind: 'action', name: 'DELETE', title: 'Delete selected' } },
  { L: { kind: 'line',   type: 'DASHED', color: 'YELLOW', lm: 'freehand_line'    }, R: { kind: 'symbol', name: 'RADAR', title: 'Radar' } },
  { L: { kind: 'line',   type: 'ARROW',  color: 'YELLOW', lm: 'freehand_line'    }, R: { kind: 'symbol', name: 'DRONE', title: 'Drone' } },
  { L: { kind: 'symbol', name: 'SOLDIER'    }, R: { kind: 'loc', num: 1 } },
  { L: { kind: 'symbol', name: 'JETFIGHTER' }, R: { kind: 'loc', num: 2 } },
  { L: { kind: 'symbol', name: 'ROCKET'     }, R: { kind: 'loc', num: 3 } },
  { L: { kind: 'symbol', name: 'TANK'       }, R: { kind: 'loc', num: 4 } },
  { L: { kind: 'symbol', name: 'HELICOPTER' }, R: { kind: 'loc', num: 5 } },
  { L: { kind: 'shape', name: 'PULSE',  lineType: 'RING',        title: 'Area outline' }, R: { kind: 'loc', num: 6 } },
  { L: { kind: 'shape', name: 'CIRCLE', lineType: 'CIRCLE_FILL', title: 'Filled area'  }, R: { kind: 'loc', num: 7 } },
]

function cap(s) { return s.charAt(0) + s.slice(1).toLowerCase() }
function offIcon(name) { return `/icons/${name}_OFF.png` }
function onIcon(name) {
  const ov = { PUBLIC_HELICOPTER: '/icons/PUBLICK_HELICOPTER_ON.png' }
  return ov[name] ?? `/icons/${name}_ON.png`
}

export function initToolbar(drawController, map) {
  let activeTool      = 'INTERACTIVE'
  let activeSymbol    = null
  let activeLineType  = null
  let activeLineColor = null

  // ── Location memory ────────────────────────────────────────────────────────
  // 7 slots, persisted to localStorage.  null = empty.
  const LOC_COUNT = 7
  const locs = Array.from({ length: LOC_COUNT }, (_, i) => {
    const raw = localStorage.getItem(`wm_loc_${i + 1}`)
    return raw ? JSON.parse(raw) : null
  })
  // DOM refs for each loc button: [{ btn, badge }]
  const locBtns = []

  function recallLocSlot(idx) {
    const raw = localStorage.getItem(`wm_loc_${idx + 1}`)
    if (!raw) return
    const loc = JSON.parse(raw)
    locs[idx] = loc
    map.flyTo({
      center:   [loc.lng, loc.lat],
      zoom:     loc.zoom,
      pitch:    loc.pitch    ?? 0,
      bearing:  loc.bearing  ?? 0,
      duration: 1200,
      essential: true
    })
    // Brief highlight so the user sees the button was triggered
    const ref = locBtns[idx]
    if (ref) {
      ref.btn.classList.add('loc-flash')
      setTimeout(() => ref.btn.classList.remove('loc-flash'), 500)
    }
  }

  function syncLocBtn(idx) {
    const ref = locBtns[idx]
    if (!ref) return
    const { btn, badge } = ref
    // Refresh from localStorage in case sidebar saved it
    const raw = localStorage.getItem(`wm_loc_${idx + 1}`)
    locs[idx] = raw ? JSON.parse(raw) : null
    const saved = locs[idx] != null
    btn.classList.toggle('loc-saved', saved)
    badge.classList.toggle('loc-badge-saved', saved)
  }

  // Sync when sidebar saves or clears a slot
  window.addEventListener('wm-loc-updated', e => syncLocBtn(e.detail.idx))

  // ── Root ──────────────────────────────────────────────────────────────────
  const root = document.createElement('div')
  root.id = 'draw-toolbar'
  document.body.appendChild(root)

  // ── Power button ──────────────────────────────────────────────────────────
  const powerBtn = document.createElement('button')
  powerBtn.className = 'toolbar-power'
  powerBtn.title = 'Toggle toolbar'
  const powerImg = document.createElement('img')
  powerImg.src = '/icons/POWER_ON.png'
  powerImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;'
  powerBtn.appendChild(powerImg)
  root.appendChild(powerBtn)

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.className = 'toolbar-panel'
  root.appendChild(panel)

  // ── Drag handle ───────────────────────────────────────────────────────────
  const dragHandle = document.createElement('div')
  dragHandle.className = 'drag-handle'
  panel.appendChild(dragHandle)

  const savedPos = JSON.parse(localStorage.getItem('wm_toolbar_pos') || 'null')
  if (savedPos) { root.style.left = savedPos.x + 'px'; root.style.top = savedPos.y + 'px' }

  let _drag = false, _offX = 0, _offY = 0
  dragHandle.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    _drag = true
    const r = root.getBoundingClientRect()
    _offX = e.clientX - r.left; _offY = e.clientY - r.top
  })
  window.addEventListener('mousemove', e => {
    if (!_drag) return
    root.style.left = (e.clientX - _offX) + 'px'
    root.style.top  = (e.clientY - _offY) + 'px'
  })
  window.addEventListener('mouseup', e => {
    if (!_drag || e.button !== 0) return
    _drag = false
    const r = root.getBoundingClientRect()
    localStorage.setItem('wm_toolbar_pos', JSON.stringify({ x: r.left, y: r.top }))
  })

  // ── Grid ──────────────────────────────────────────────────────────────────
  const grid = document.createElement('div')
  grid.className = 'toolbar-grid'
  panel.appendChild(grid)

  // Registries
  const lineBtns   = {}  // `${type}_${color}` → btn
  const toolBtns   = {}  // name → { btn, img }
  const symbolRefs = {}  // name → [{ btn, img, followIcon }]
  const shapeBtns  = {}  // lineType → { btn, img, name }

  function regSym(name, btn, img, followIcon) {
    ;(symbolRefs[name] = symbolRefs[name] || []).push({ btn, img, followIcon })
  }

  function clearLine() {
    if (!activeLineType) return
    const k = `${activeLineType}_${activeLineColor}`
    lineBtns[k]?.classList.remove('active')
    const sr = shapeBtns[activeLineType]
    if (sr) { sr.btn.classList.remove('active'); sr.img.src = offIcon(sr.name) }
    activeLineType = null; activeLineColor = null
  }

  function armSymbol(name) {
    if (activeSymbol === name) {
      activeSymbol = null
      drawController.setActiveSymbol(null)
    } else {
      clearLine()
      if (activeTool !== 'PEN') { activeTool = null }
      activeSymbol = name
      drawController.setActiveSymbol(name)
    }
    syncAll()
  }

  function syncAll() {
    Object.entries(lineBtns).forEach(([k, btn]) => {
      const [t, c] = k.split(/_(?=[^_]+$)/)
      btn.classList.toggle('active', activeLineType === t && activeLineColor === c)
    })
    Object.entries(shapeBtns).forEach(([lt, { btn, img, name }]) => {
      const on = activeLineType === lt
      btn.classList.toggle('active', on)
      img.src = on ? onIcon(name) : offIcon(name)
    })
    Object.entries(toolBtns).forEach(([name, { btn, img }]) => {
      const on = activeTool === name
      btn.classList.toggle('active', on)
      img.src = on ? onIcon(name) : offIcon(name)
    })
    Object.entries(symbolRefs).forEach(([name, refs]) => {
      const on = activeSymbol === name
      refs.forEach(({ btn, img, followIcon }) => {
        btn.classList.toggle('active', on)
        if (followIcon) img.src = on ? onIcon(name) : offIcon(name)
      })
    })
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  ROWS.forEach(({ L, R }) => {

    // ── Left button ────────────────────────────────────────────────────────
    const lBtn = document.createElement('button')
    lBtn.className = 'tool-btn'
    const lImg = document.createElement('img')
    lBtn.appendChild(lImg)

    if (L.kind === 'line') {
      const { type, color, lm } = L
      lBtn.title = `${cap(type)} ${cap(color)}`
      lImg.src = `/icons/LINE_${type}_${color}.png`
      lBtn.addEventListener('click', () => {
        if (activeLineType === type && activeLineColor === color) {
          activeLineType = null; activeLineColor = null
          lBtn.classList.remove('active')
          drawController.setActiveLine(null, null)
        } else {
          clearLine()
          activeTool = null; activeSymbol = null
          activeLineType = type; activeLineColor = color
          drawController.setActiveSymbol(null)
          drawController.setTool(lm)
          drawController.setActiveLine(type, color)
          syncAll()
        }
      })
      lineBtns[`${type}_${color}`] = lBtn
    } else if (L.kind === 'shape') {
      lBtn.title = L.title
      lImg.src = offIcon(L.name)
      lBtn.addEventListener('click', () => {
        if (activeLineType === L.lineType) {
          clearLine()
          drawController.setActiveLine(null, null)
          drawController.setTool('simple_select')
        } else {
          clearLine()
          activeTool = null; activeSymbol = null
          drawController.setActiveSymbol(null)
          activeLineType = L.lineType; activeLineColor = null
          drawController.setActiveLine(L.lineType, null)
          drawController.setTool('freehand_polygon')
          syncAll()
        }
      })
      shapeBtns[L.lineType] = { btn: lBtn, img: lImg, name: L.name }
    } else {
      lBtn.title = L.name.replace(/_/g, ' ')
      lImg.src = offIcon(L.name)
      lBtn.addEventListener('click', () => armSymbol(L.name))
      regSym(L.name, lBtn, lImg, true)
    }
    grid.appendChild(lBtn)

    // ── Right button ───────────────────────────────────────────────────────
    const rBtn = document.createElement('button')
    rBtn.className = 'tool-btn'
    const rImg = document.createElement('img')
    rBtn.appendChild(rImg)

    if (R.kind === 'tool') {
      rBtn.title = R.title
      rImg.src = offIcon(R.name)
      rBtn.addEventListener('click', () => {
        if (activeTool === R.name) {
          activeTool = null
          drawController.setTool('simple_select')
          syncAll()
        } else {
          clearLine()
          if (R.name !== 'PEN') { activeSymbol = null; drawController.setActiveSymbol(null) }
          activeTool = R.name
          drawController.setTool(R.mode)
          syncAll()
        }
      })
      toolBtns[R.name] = { btn: rBtn, img: rImg }

    } else if (R.kind === 'action') {
      rBtn.title = R.title
      rImg.src = offIcon(R.name)
      rBtn.addEventListener('click', () => {
        rImg.src = onIcon(R.name)
        rBtn.classList.add('active')
        if (R.name === 'UNDO') drawController.undo()
        else drawController.deleteSelected()
        setTimeout(() => { rImg.src = offIcon(R.name); rBtn.classList.remove('active') }, 200)
      })

    } else if (R.kind === 'symbol') {
      rBtn.title = R.title
      rImg.src = offIcon(R.name)
      rBtn.addEventListener('click', () => armSymbol(R.name))
      regSym(R.name, rBtn, rImg, true)

    } else if (R.kind === 'loc') {
      const idx = R.num - 1
      rBtn.className = 'tool-btn loc-btn'
      rBtn.title = `Location ${R.num} — click to recall (save from left panel)`
      rImg.src = '/icons/OFF.png'

      const badge = document.createElement('span')
      badge.className = 'loc-num'
      badge.textContent = R.num
      rBtn.appendChild(badge)

      locBtns[idx] = { btn: rBtn, badge }

      rBtn.addEventListener('click', () => recallLocSlot(idx))
    }

    grid.appendChild(rBtn)
  })

  // Keyboard shortcuts 1-7: recall saved location
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey) return
    const n = parseInt(e.key)
    if (n >= 1 && n <= LOC_COUNT) recallLocSlot(n - 1)
  })

  // Initial state
  syncAll()
  locBtns.forEach((_, i) => syncLocBtn(i))

  // ── Power toggle ──────────────────────────────────────────────────────────
  let panelOpen = true
  function updatePowerBtn() {
    powerBtn.style.backgroundImage = panelOpen
      ? "url('/icons/POWERBG_ON_.png')"
      : "url('/icons/BasedPaneBody.png')"
  }
  powerBtn.addEventListener('click', () => {
    panelOpen = !panelOpen
    panel.classList.toggle('hidden', !panelOpen)
    updatePowerBtn()
  })
  updatePowerBtn()
}
