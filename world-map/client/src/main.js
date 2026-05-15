import { initMap } from './map.js'
import { initDraw } from './draw.js'
import { initOverlays } from './overlays/index.js'
import { initControls } from './ui/controls.js'
import './ui/controls.css'

async function main() {
  const map = await initMap('map')
  const draw = initDraw(map)
  const overlays = initOverlays(map)
  initControls(map, draw, overlays)
}

main()
