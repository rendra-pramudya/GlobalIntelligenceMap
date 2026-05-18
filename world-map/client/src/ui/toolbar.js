import './toolbar.css'

// PUBLIC_HELICOPTER has a typo in the ON filename
const ON_OVERRIDES = {
  PUBLIC_HELICOPTER: '/icons/PUBLICK_HELICOPTER_ON.png'
}

const SYMBOL_CATEGORIES = [
  {
    label: 'Symbols',
    symbols: ['LOCATION', 'SOLDIER', 'EXPLOSION', 'NUCLEAR', 'JETFIGHTER', 'HELICOPTER', 'ROCKET', 'PULSE', 'CIRCLE', 'ARROW']
  }
]

const LINE_COMBOS = [
  ['STROKE', 'RED'],    ['DASHED', 'RED'],
  ['ARROW',  'RED'],    ['FILL',   'RED'],
  ['STROKE', 'YELLOW'], ['DASHED', 'YELLOW'],
  ['ARROW',  'YELLOW'], ['FILL',   'YELLOW'],
]

function symbolOnIcon(name) {
  if (ON_OVERRIDES[name]) return ON_OVERRIDES[name]
  return `/icons/${name}_ON.png`
}

function symbolOffIcon(name) {
  return `/icons/${name}_OFF.png`
}

export function initToolbar(drawController) {
  // State
  let panelOpen = true
  let activeTool = 'INTERACTIVE'
  let activeSymbol = null
  let activeLineType = null
  let activeLineColor = null

  // ── Root container ────────────────────────────────────────────────────────
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

  // Restore saved position
  const savedPos = JSON.parse(localStorage.getItem('wm_toolbar_pos') || 'null')
  if (savedPos) {
    root.style.left = savedPos.x + 'px'
    root.style.top  = savedPos.y + 'px'
  }

  let _dragging = false, _offX = 0, _offY = 0
  dragHandle.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    _dragging = true
    const r = root.getBoundingClientRect()
    _offX = e.clientX - r.left
    _offY = e.clientY - r.top
  })
  window.addEventListener('mousemove', e => {
    if (!_dragging) return
    root.style.left = (e.clientX - _offX) + 'px'
    root.style.top  = (e.clientY - _offY) + 'px'
  })
  window.addEventListener('mouseup', e => {
    if (!_dragging || e.button !== 0) return
    _dragging = false
    const r = root.getBoundingClientRect()
    localStorage.setItem('wm_toolbar_pos', JSON.stringify({ x: r.left, y: r.top }))
  })

  // ── Tool row (INTERACTIVE, MOVE, PEN, RULER) ──────────────────────────────
  const toolRow = document.createElement('div')
  toolRow.className = 'tool-row'

  const TOOL_BUTTONS = [
    { name: 'INTERACTIVE', mode: 'simple_select',    title: 'Select' },
    { name: 'MOVE',        mode: 'simple_select',    title: 'Move' },
    { name: 'PEN',         mode: 'freehand_line',    title: 'Draw line (freehand)' },
    { name: 'RULER',       mode: 'freehand_polygon', title: 'Draw polygon (freehand)' },
  ]

  const toolBtnEls = {}
  TOOL_BUTTONS.forEach(({ name, mode, title }) => {
    const btn = document.createElement('button')
    btn.className = 'tool-btn'
    btn.title = title

    const img = document.createElement('img')
    img.src = `/icons/${name}_OFF.png`
    btn.appendChild(img)

    btn.addEventListener('click', () => {
      if (activeTool === name) {
        // Deactivate — fall back to select, keep symbol armed for click-to-place
        activeTool = null
        img.src = `/icons/${name}_OFF.png`
        btn.classList.remove('active')
        drawController.setTool('simple_select')
        updatePathModeIndicator()
      } else {
        // Deactivate previous tool
        if (activeTool && toolBtnEls[activeTool]) {
          toolBtnEls[activeTool].img.src = `/icons/${activeTool}_OFF.png`
          toolBtnEls[activeTool].btn.classList.remove('active')
        }
        activeTool = name
        activeLineType = null
        activeLineColor = null
        img.src = `/icons/${name}_ON.png`
        btn.classList.add('active')
        drawController.setTool(mode)
        // PEN keeps the active symbol (unit-path mode); other tools clear it
        if (name !== 'PEN') {
          activeSymbol = null
          drawController.setActiveSymbol(null)
          updateSymbolButtons()
        }
        updateLineBtns()
        updatePathModeIndicator()
      }
    })

    toolBtnEls[name] = { btn, img }
    toolRow.appendChild(btn)
  })

  panel.appendChild(toolRow)

  // ── Unit-path mode indicator ───────────────────────────────────────────────
  const pathIndicator = document.createElement('div')
  pathIndicator.className = 'path-mode-indicator hidden'
  pathIndicator.textContent = 'Unit Path Mode'
  panel.appendChild(pathIndicator)

  function updatePathModeIndicator() {
    const isPathMode = activeTool === 'PEN' && !!activeSymbol
    pathIndicator.classList.toggle('hidden', !isPathMode)
  }

  // Set initial active tool
  toolBtnEls['INTERACTIVE'].img.src = '/icons/INTERACTIVE_ON.png'
  toolBtnEls['INTERACTIVE'].btn.classList.add('active')

  // ── Action row (UNDO, DELETE) ─────────────────────────────────────────────
  const actionRow = document.createElement('div')
  actionRow.className = 'tool-row'

  function makeActionBtn(name, title, action) {
    const btn = document.createElement('button')
    btn.className = 'tool-btn'
    btn.title = title

    const img = document.createElement('img')
    img.src = `/icons/${name}_OFF.png`
    btn.appendChild(img)

    btn.addEventListener('click', () => {
      img.src = `/icons/${name}_ON.png`
      btn.classList.add('active')
      action()
      setTimeout(() => {
        img.src = `/icons/${name}_OFF.png`
        btn.classList.remove('active')
      }, 200)
    })

    return btn
  }

  actionRow.appendChild(makeActionBtn('UNDO', 'Undo', () => drawController.undo()))
  actionRow.appendChild(makeActionBtn('DELETE', 'Delete selected', () => drawController.deleteSelected()))
  panel.appendChild(actionRow)

  // ── Line section (flat 2-column grid of all type×color combos) ───────────
  const lineSection = document.createElement('div')
  lineSection.className = 'line-section'

  const lineComboBtns = {}
  LINE_COMBOS.forEach(([type, color]) => {
    const key = `${type}_${color}`
    const btn = document.createElement('button')
    btn.className = 'tool-btn'
    btn.title = `${type.charAt(0) + type.slice(1).toLowerCase()} ${color.charAt(0) + color.slice(1).toLowerCase()}`

    const img = document.createElement('img')
    img.src = `/icons/LINE_${type}_${color}.png`
    btn.appendChild(img)

    btn.addEventListener('click', () => {
      if (activeLineType === type && activeLineColor === color) {
        activeLineType = null
        activeLineColor = null
        btn.classList.remove('active')
        drawController.setActiveLine(null, null)
      } else {
        const prevKey = activeLineType && activeLineColor ? `${activeLineType}_${activeLineColor}` : null
        if (prevKey && lineComboBtns[prevKey]) lineComboBtns[prevKey].classList.remove('active')
        activeTool = null
        activeSymbol = null
        activeLineType = type
        activeLineColor = color
        btn.classList.add('active')
        updateToolButtons()
        updateSymbolButtons()
        drawController.setActiveSymbol(null)
        drawController.setTool('draw_line_string')
        drawController.setActiveLine(type, color)
      }
    })

    lineComboBtns[key] = btn
    lineSection.appendChild(btn)
  })

  panel.appendChild(lineSection)

  function updateLineBtns() {
    LINE_COMBOS.forEach(([type, color]) => {
      const key = `${type}_${color}`
      lineComboBtns[key].classList.toggle('active', activeLineType === type && activeLineColor === color)
    })
  }

  // ── Symbol categories ─────────────────────────────────────────────────────
  const symbolBtnEls = {}

  SYMBOL_CATEGORIES.forEach(({ label, symbols }) => {
    const section = document.createElement('div')
    section.className = 'cat-section'

    const header = document.createElement('div')
    header.className = 'section-header'
    header.textContent = label

    const body = document.createElement('div')
    body.className = 'cat-body'

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed')
    })

    symbols.forEach(name => {
      const btn = document.createElement('button')
      btn.className = 'tool-btn symbol-btn'
      btn.title = name.replace(/_/g, ' ')

      const img = document.createElement('img')
      img.src = symbolOffIcon(name)
      btn.appendChild(img)

      btn.addEventListener('click', () => {
        if (activeSymbol === name) {
          // Disarm
          activeSymbol = null
          img.src = symbolOffIcon(name)
          btn.classList.remove('active')
          drawController.setActiveSymbol(null)
          updatePathModeIndicator()
        } else {
          // Disarm previous symbol
          if (activeSymbol && symbolBtnEls[activeSymbol]) {
            symbolBtnEls[activeSymbol].img.src = symbolOffIcon(activeSymbol)
            symbolBtnEls[activeSymbol].btn.classList.remove('active')
          }
          activeSymbol = name
          img.src = symbolOnIcon(name)
          btn.classList.add('active')
          // Keep PEN active for unit-path mode; deactivate other tools
          if (activeTool !== 'PEN') {
            activeTool = null
            activeLineType = null
            activeLineColor = null
            updateToolButtons()
            updateLineBtns()
          }
          drawController.setActiveSymbol(name)
          updatePathModeIndicator()
        }
      })

      symbolBtnEls[name] = { btn, img }
      body.appendChild(btn)
    })

    section.appendChild(header)
    section.appendChild(body)
    panel.appendChild(section)
  })

  // ── Helper: update all tool button states ─────────────────────────────────
  function updateToolButtons() {
    TOOL_BUTTONS.forEach(({ name }) => {
      const { btn, img } = toolBtnEls[name]
      if (activeTool === name) {
        btn.classList.add('active')
        img.src = `/icons/${name}_ON.png`
      } else {
        btn.classList.remove('active')
        img.src = `/icons/${name}_OFF.png`
      }
    })
  }

  function updateSymbolButtons() {
    Object.entries(symbolBtnEls).forEach(([name, { btn, img }]) => {
      if (activeSymbol === name) {
        btn.classList.add('active')
        img.src = symbolOnIcon(name)
      } else {
        btn.classList.remove('active')
        img.src = symbolOffIcon(name)
      }
    })
  }

  // ── Power button toggle ───────────────────────────────────────────────────
  function updatePowerBtn() {
    if (panelOpen) {
      powerBtn.style.backgroundImage = "url('/icons/POWERBG_ON_.png')"
    } else {
      powerBtn.style.backgroundImage = "url('/icons/BasedPaneBody.png')"
    }
  }

  powerBtn.addEventListener('click', () => {
    panelOpen = !panelOpen
    panel.classList.toggle('hidden', !panelOpen)
    updatePowerBtn()
  })

  updatePowerBtn()
}
