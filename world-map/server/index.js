import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import 'dotenv/config'

import flightsRouter from './routes/flights.js'
import earthquakesRouter from './routes/earthquakes.js'
import conflictRouter from './routes/conflict.js'
import weatherRouter from './routes/weather.js'
import drawingsRouter from './routes/drawings.js'
import settingsRouter from './routes/settings.js'

const app = express()
app.use(cors())
app.use(express.json())

// REST proxy routes
app.use('/api/flights', flightsRouter)
app.use('/api/earthquakes', earthquakesRouter)
app.use('/api/conflict', conflictRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/drawings', drawingsRouter)
app.use('/api/settings', settingsRouter)

// Health check
app.get('/health', (_, res) => res.json({ ok: true }))

const server = createServer(app)

// -------------------------------------------------------
// WebSocket server — handles:
//   1. AIS vessel stream fanout (type: 'vessels')
//   2. Drawing sync across clients (type: 'drawing')
// -------------------------------------------------------
const wss = new WebSocketServer({ server })

// In-memory state
const connectedClients = new Set()
let latestVessels = { type: 'FeatureCollection', features: [] }
const drawings = new Map() // id -> GeoJSON feature

wss.on('connection', (ws) => {
  connectedClients.add(ws)

  // Send current state to new client
  ws.send(JSON.stringify({ type: 'vessels', data: latestVessels }))
  ws.send(JSON.stringify({
    type: 'drawings_snapshot',
    data: Array.from(drawings.values())
  }))

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'drawing_create' || msg.type === 'drawing_update') {
        drawings.set(msg.feature.id, msg.feature)
        broadcast(msg, ws)
      }

      if (msg.type === 'drawing_delete') {
        drawings.delete(msg.id)
        broadcast(msg, ws)
      }
    } catch (e) {
      console.error('WS parse error:', e.message)
    }
  })

  ws.on('close', () => connectedClients.delete(ws))
})

function broadcast(msg, exclude = null) {
  const payload = JSON.stringify(msg)
  for (const client of connectedClients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload)
    }
  }
}

// -------------------------------------------------------
// AIS vessel polling (replace with real AIS WebSocket
// upstream if you have AISHub credentials)
// -------------------------------------------------------
async function pollVessels() {
  try {
    // Using MarineTraffic / AISHub / VesselFinder API
    // Replace URL and auth with your provider's endpoint
    const url = process.env.AIS_API_URL || 'https://api.aisstream.io/v0/stream'
    // For demo: generate mock vessels if no API key
    if (!process.env.AIS_API_KEY) {
      latestVessels = generateMockVessels()
    } else {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.AIS_API_KEY}` }
      })
      const json = await res.json()
      latestVessels = toGeoJSON(json)
    }
    broadcast({ type: 'vessels', data: latestVessels })
  } catch (e) {
    console.error('Vessel poll error:', e.message)
  }
}

function generateMockVessels() {
  const features = Array.from({ length: 80 }, (_, i) => ({
    type: 'Feature',
    id: `vessel-${i}`,
    geometry: {
      type: 'Point',
      coordinates: [
        (Math.random() - 0.5) * 360,
        (Math.random() - 0.5) * 140
      ]
    },
    properties: {
      name: `VESSEL ${i}`,
      type: ['cargo', 'tanker', 'passenger'][i % 3],
      speed: Math.round(Math.random() * 20),
      heading: Math.round(Math.random() * 360)
    }
  }))
  return { type: 'FeatureCollection', features }
}

function toGeoJSON(raw) {
  // Adapt this to your AIS provider's response shape
  const features = (Array.isArray(raw) ? raw : raw.vessels || []).map(v => ({
    type: 'Feature',
    id: v.mmsi || v.id,
    geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
    properties: { name: v.name, type: v.type, speed: v.speed, heading: v.cog }
  }))
  return { type: 'FeatureCollection', features }
}

setInterval(pollVessels, 30_000)
pollVessels()

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
