import { initMap, setBaseMap, enableTerrain } from './map.js'
import { initDraw } from './draw.js'
import { initOverlays } from './overlays/index.js'
import { initControls } from './ui/controls.js'
import { initToolbar } from './ui/toolbar.js'
import './ui/controls.css'
import './ui/settings.css'

async function main() {
  const map = await initMap('map')
  const drawController = initDraw(map)
  const { draw } = drawController
  initToolbar(drawController)

  let overlays = initOverlays(map)
  const controls = initControls(map, draw, overlays)

  controls.onBaseMapChange((baseMapKey) => {
    // Snapshot which overlays are currently visible before style wipes them
    const wasVisible = Object.fromEntries(
      Object.entries(overlays).map(([k, o]) => [k, o.visible])
    )

    setBaseMap(map, baseMapKey, () => {
      // Re-add all sources/layers (setStyle removes everything)
      overlays = initOverlays(map)
      // Restore previously active overlays
      for (const [name, visible] of Object.entries(wasVisible)) {
        if (visible) overlays[name]?.show()
      }
      controls.updateOverlays(overlays)
      // Re-apply terrain if it was enabled (setStyle wipes sources)
      if (document.getElementById('toggle-terrain')?.checked) enableTerrain(map)
    })
  })
}

main()
