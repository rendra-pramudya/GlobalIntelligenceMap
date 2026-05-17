import { initMap, setBaseMap, setProjection } from './map.js'
import { initDraw } from './draw.js'
import { initOverlays } from './overlays/index.js'
import { initControls } from './ui/controls.js'
import { initToolbar } from './ui/toolbar.js'
import { initDebug } from './ui/debug.js'
import './ui/controls.css'
import './ui/settings.css'
import './ui/debug.css'

async function main() {
  const savedProvider  = localStorage.getItem('wm_provider')  || 'openfreemap'
  const savedStyle     = localStorage.getItem('wm_style')     || 'liberty'
  const savedSatellite = localStorage.getItem('wm_satellite') === 'true'

  const map = await initMap(
    'map',
    savedSatellite ? 'satellite' : savedProvider,
    savedSatellite ? 'satellite' : savedStyle
  )

  const drawController = initDraw(map)
  initToolbar(drawController)

  const debug = initDebug()

  let overlays = initOverlays(map)
  const controls = initControls(map, drawController, overlays, debug)

  if (controls.savedProjection !== 'mercator') {
    setProjection(map, controls.savedProjection)
  }

  controls.onBaseMapChange((provider, style) => {
    const wasVisible = Object.fromEntries(
      Object.entries(overlays).map(([k, o]) => [k, o.visible])
    )
    setBaseMap(map, provider, style, () => {
      overlays = initOverlays(map)
      for (const [name, visible] of Object.entries(wasVisible)) {
        if (visible) overlays[name]?.show()
      }
      controls.updateOverlays(overlays)
    })
  })
}

main()
