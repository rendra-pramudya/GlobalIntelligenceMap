import { initFlights } from './flights.js'
import { initVessels } from './vessels.js'
import { initEarthquakes } from './earthquakes.js'
import { initWeather } from './weather.js'
import { initConflict } from './conflict.js'

export function initOverlays(map) {
  const flights = initFlights(map)
  const vessels = initVessels(map)
  const earthquakes = initEarthquakes(map)
  const weather = initWeather(map)
  const conflict = initConflict(map)

  return { flights, vessels, earthquakes, weather, conflict }
}
