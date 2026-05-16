import { createFlightOverlay } from './flightLayer.js'

export function initFlightradar(map) {
  return createFlightOverlay(map, {
    sourceParam: 'fr24',
    layerId:     'flightradar-layer',
    sourceId:    'flightradar-source',
    imageId:     'plane-icon-fr24',
    iconColor:   '#44ccff'   // cyan — distinguishable from OpenSky yellow
  })
}
