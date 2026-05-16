import { createFlightOverlay } from './flightLayer.js'

export function initFlights(map) {
  return createFlightOverlay(map, {
    sourceParam: 'opensky',
    layerId:     'flights-layer',
    sourceId:    'flights-source',
    imageId:     'plane-icon-opensky',
    iconColor:   '#f0c040'   // yellow
  })
}
