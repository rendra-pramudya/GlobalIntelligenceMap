import { initMap, setBaseMap, setProjection } from './map.js'
import { initDraw } from './draw.js'
import { initOverlays } from './overlays/index.js'
import { initControls } from './ui/controls.js'
import { initToolbar } from './ui/toolbar.js'
import './ui/controls.css'
import './ui/settings.css'

async function main() {
  // Load saved base map so the map initialises with the right style immediately
  const savedBasemap = localStorage.getItem('wm_basemap') || 'standard'
  const map = await initMap('map', savedBasemap)

  const drawController = initDraw(map)
  const { draw } = drawController
  initToolbar(drawController)

  let overlays = initOverlays(map)
  const controls = initControls(map, draw, overlays)

  // Restore saved projection (controls' style.load handler will re-apply
  // labels + terrain if this triggers a style reload)
  if (controls.savedProjection !== 'mercator') {
    setProjection(map, controls.savedProjection)
  }

  controls.onBaseMapChange((baseMapKey) => {
    const wasVisible = Object.fromEntries(
      Object.entries(overlays).map(([k, o]) => [k, o.visible])
    )
    setBaseMap(map, baseMapKey, () => {
      overlays = initOverlays(map)
      for (const [name, visible] of Object.entries(wasVisible)) {
        if (visible) overlays[name]?.show()
      }
      controls.updateOverlays(overlays)
      // labels + terrain are re-applied by controls' persistent style.load handler
    })
  })
}

main()
