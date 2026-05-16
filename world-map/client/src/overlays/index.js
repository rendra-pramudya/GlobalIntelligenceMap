import { initFlights }     from './flights.js'
import { initFlightradar } from './flightradar.js'
import { initVessels }     from './vessels.js'
import { initEarthquakes } from './earthquakes.js'
import { initWeather }     from './weather.js'
import { initConflict }    from './conflict.js'

export function initOverlays(map) {
  return {
    flights:     initFlights(map),
    flightradar: initFlightradar(map),
    vessels:     initVessels(map),
    earthquakes: initEarthquakes(map),
    weather:     initWeather(map),
    conflict:    initConflict(map)
  }
}
