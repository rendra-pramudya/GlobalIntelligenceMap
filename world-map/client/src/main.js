import { initMap, setBaseMap } from './map.js'
import { initDraw } from './draw.js'
import { initOverlays } from './overlays/index.js'
import { initControls } from './ui/controls.js'
import './ui/controls.css'
import './ui/settings.css'

async function main() {
  const map = await initMap('map')
  const { draw } = initDraw(map)

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
    })
  })
}

main()
