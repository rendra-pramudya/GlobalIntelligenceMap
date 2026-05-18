import './toolbar.css'

const ON_OVERRIDES = {
  PUBLIC_HELICOPTER: '/icons/PUBLICK_HELICOPTER_ON.png'
}

// Each row: [left = line combo, right = tool or symbol]
const ROWS = [
  { line: ['STROKE', 'RED'],    lineMode: 'freehand_line',    right: { kind: 'tool',   name: 'INTERACTIVE', mode: 'simple_select',    title: 'Select' } },
  { line: ['FILL',   'RED'],    lineMode: 'freehand_line',    right: { kind: 'tool',   name: 'MOVE',        mode: 'simple_select',    title: 'Move' } },
  { line: ['DASHED', 'RED'],    lineMode: 'freehand_line',    right: { kind: 'tool',   name: 'PEN',         mode: 'freehand_line',    title: 'Draw line' } },
  { line: ['ARROW',  'RED'],    lineMode: 'freehand_polygon', right: { kind: 'tool',   name: 'RULER',       mode: 'freehand_polygon', title: 'Draw polygon' } },
  { line: ['STROKE', 'YELLOW'], lineMode: 'freehand_line',    right: { kind: 'symbol', name: 'LOCATION',  title: 'Location' } },
  { line: ['FILL',   'YELLOW'], lineMode: 'freehand_line',    right: { kind: 'symbol', name: 'EXPLOSION', title: 'Explosion' } },
  { line: ['DASHED', 'YELLOW'], lineMode: 'freehand_line',    right: { kind: 'symbol', name: 'PULSE',     title: 'Pulse' } },
  { line: ['ARROW',  'YELLOW'], lineMode: 'freehand_polygon', right: { kind: 'symbol', name: 'CIRCLE',    title: 'Circle' } },
]

function cap(s) { return s.charAt(0) + s.slice(1).toLowerCase() }
function onIcon(name) { return ON_OVERRIDES[name] ?? `/icons/${name}_ON.png` }

export function initToolbar(drawController) {
  let activeTool      = 'INTERACTIVE'
  let activeSymbol    = null
  let activeLineType  = null
  let activeLineColor = null

  // ── Root ──────────────────────────────────────────────────────────────────
  const root = document.createElement('div')
  root.id = 'draw-toolbar'
  document.getElementById('map').appendChild(root)

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

  // ── Unified grid ──────────────────────────────────────────────────────────
  const grid = document.createElement('div')
  grid.className = 'toolbar-grid'
  panel.appendChild(grid)

  const lineBtns   = {}  // `${type}_${color}` → btn
  const toolBtns   = {}  // name → { btn, img }
  const symbolBtns = {}  // name → { btn, img }

  function clearLine() {
    if (!activeLineType) return
    const k = `${activeLineType}_${activeLineColor}`
    if (lineBtns[k]) lineBtns[k].classList.remove('active')
    activeLineType = null; activeLineColor = null
  }

  function syncAll() {
    ROWS.forEach(({ line: [t, c], right }) => {
      lineBtns[`${t}_${c}`].classList.toggle('active', activeLineType === t && activeLineColor === c)
      if (right.kind === 'tool') {
        const { btn, img } = toolBtns[right.name]
        const on = activeTool === right.name
        btn.classList.toggle('active', on)
        img.src = on ? onIcon(right.name) : `/icons/${right.name}_OFF.png`
      } else {
        const { btn, img } = symbolBtns[right.name]
        const on = activeSymbol === right.name
        btn.classList.toggle('active', on)
        img.src = on ? onIcon(right.name) : `/icons/${right.name}_OFF.png`
      }
    })
  }

  ROWS.forEach(({ line: [type, color], lineMode, right }) => {
    // ── Left: line combo ────────────────────────────────────────────────────
    const lBtn = document.createElement('button')
    lBtn.className = 'tool-btn'
    lBtn.title = `${cap(type)} ${cap(color)}`
    const lImg = document.createElement('img')
    lImg.src = `/icons/LINE_${type}_${color}.png`
    lBtn.appendChild(lImg)
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
        drawController.setTool(lineMode)
        drawController.setActiveLine(type, color)
        syncAll()
      }
    })
    lineBtns[`${type}_${color}`] = lBtn
    grid.appendChild(lBtn)

    // ── Right: tool or symbol ────────────────────────────────────────────────
    const rBtn = document.createElement('button')
    rBtn.className = 'tool-btn'
    rBtn.title = right.title
    const rImg = document.createElement('img')
    rImg.src = `/icons/${right.name}_OFF.png`
    rBtn.appendChild(rImg)

    if (right.kind === 'tool') {
      rBtn.addEventListener('click', () => {
        if (activeTool === right.name) {
          activeTool = null
          drawController.setTool('simple_select')
          syncAll()
        } else {
          clearLine()
          if (right.name !== 'PEN') { activeSymbol = null; drawController.setActiveSymbol(null) }
          activeTool = right.name
          drawController.setTool(right.mode)
          syncAll()
        }
      })
      toolBtns[right.name] = { btn: rBtn, img: rImg }
    } else {
      rBtn.addEventListener('click', () => {
        if (activeSymbol === right.name) {
          activeSymbol = null
          drawController.setActiveSymbol(null)
          syncAll()
        } else {
          clearLine()
          if (activeTool !== 'PEN') { activeTool = null }
          activeSymbol = right.name
          drawController.setActiveSymbol(right.name)
          syncAll()
        }
      })
      symbolBtns[right.name] = { btn: rBtn, img: rImg }
    }
    grid.appendChild(rBtn)
  })

  // Set initial state
  syncAll()

  // ── Power toggle ─────────────────────────────────────────────────────────
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
