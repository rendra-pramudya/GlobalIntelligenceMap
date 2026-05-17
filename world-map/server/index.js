import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import 'dotenv/config'
import { getConfig } from './config.js'

import flightsRouter from './routes/flights.js'
import earthquakesRouter from './routes/earthquakes.js'
import conflictRouter from './routes/conflict.js'
import weatherRouter from './routes/weather.js'
import drawingsRouter from './routes/drawings.js'
import settingsRouter from './routes/settings.js'
import debugRouter from './routes/debug.js'

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
app.use('/api/debug',    debugRouter)

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
const symbols_map = new Map() // id -> GeoJSON feature

wss.on('connection', (ws) => {
  connectedClients.add(ws)

  // Send current state to new client
  ws.send(JSON.stringify({ type: 'vessels', data: latestVessels }))
  ws.send(JSON.stringify({
    type: 'drawings_snapshot',
    data: Array.from(drawings.values())
  }))
  ws.send(JSON.stringify({ type: 'symbols_snapshot', data: Array.from(symbols_map.values()) }))

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

      if (msg.type === 'symbol_create') {
        symbols_map.set(msg.feature.properties.id, msg.feature)
        broadcast(msg, ws)
      }
      if (msg.type === 'symbol_delete') {
        symbols_map.delete(msg.id)
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
// AISStream.io upstream WebSocket
// Connects to wss://stream.aisstream.io/v0/stream,
// accumulates vessel positions by MMSI, broadcasts
// a GeoJSON snapshot to all browser clients every 10s.
// -------------------------------------------------------

const AIS_URL = 'wss://stream.aisstream.io/v0/stream'
const VESSEL_TTL_MS = 10 * 60 * 1000   // drop vessel after 10 min of silence
const BROADCAST_INTERVAL_MS = 10_000

// AIS ship type number → category label
function shipCategory(typeNum) {
  if (!typeNum) return 'unknown'
  if (typeNum >= 60 && typeNum <= 69) return 'passenger'
  if (typeNum >= 70 && typeNum <= 79) return 'cargo'
  if (typeNum >= 80 && typeNum <= 89) return 'tanker'
  if (typeNum === 30) return 'fishing'
  if (typeNum === 52) return 'tug'
  if (typeNum === 36 || typeNum === 37) return 'sailing'
  if (typeNum >= 40 && typeNum <= 49) return 'highspeed'
  return 'other'
}

const vesselStore = new Map() // MMSI → vessel object

function vesselGeoJSON() {
  const now = Date.now()
  const features = []
  for (const [mmsi, v] of vesselStore) {
    if (now - v.lastSeen > VESSEL_TTL_MS) { vesselStore.delete(mmsi); continue }
    if (v.lon == null || v.lat == null) continue
    features.push({
      type: 'Feature',
      id: String(mmsi),
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: {
        mmsi,
        name:        v.name        || `MMSI ${mmsi}`,
        category:    v.category    || 'unknown',
        sog:         v.sog         ?? null,
        cog:         v.cog         ?? null,
        heading:     v.heading     ?? null,
        navStatus:   v.navStatus   ?? null,
        callSign:    v.callSign    || null,
        destination: v.destination || null,
        shipType:    v.shipType    ?? null
      }
    })
  }
  return { type: 'FeatureCollection', features }
}

let aisUpstream = null

function connectAISStream() {
  const key = getConfig().AIS_API_KEY
  if (!key) {
    console.log('[AIS] No AIS_API_KEY configured — vessel layer disabled')
    return
  }

  console.log('[AIS] Connecting to AISStream…')
  aisUpstream = new WebSocket(AIS_URL)

  aisUpstream.on('open', () => {
    console.log('[AIS] Connected — subscribing to global feed')
    aisUpstream.send(JSON.stringify({
      APIKey: key,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData']
    }))
  })

  aisUpstream.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      const meta = msg.MetaData
      if (!meta) return
      const mmsi = meta.MMSI
      if (!mmsi) return

      const existing = vesselStore.get(mmsi) || { mmsi }

      if (msg.MessageType === 'PositionReport') {
        const pr = msg.Message?.PositionReport
        const lat = meta.latitude  ?? pr?.Latitude
        const lon = meta.longitude ?? pr?.Longitude
        if (lat == null || lon == null) return
        vesselStore.set(mmsi, {
          ...existing,
          lat, lon,
          cog:       pr?.Cog             ?? existing.cog,
          sog:       pr?.Sog             ?? existing.sog,
          heading:   pr?.TrueHeading     ?? existing.heading,
          navStatus: pr?.NavigationalStatus ?? existing.navStatus,
          name:      meta.ShipName?.trim() || existing.name,
          lastSeen:  Date.now()
        })
      } else if (msg.MessageType === 'ShipStaticData') {
        const sd = msg.Message?.ShipStaticData
        vesselStore.set(mmsi, {
          ...existing,
          name:        sd?.Name?.trim()        || existing.name,
          callSign:    sd?.CallSign?.trim()     || existing.callSign,
          destination: sd?.Destination?.trim() || existing.destination,
          shipType:    sd?.Type               ?? existing.shipType,
          category:    shipCategory(sd?.Type  ?? existing.shipType),
          lastSeen:    existing.lastSeen || Date.now()
        })
      }
    } catch { /* malformed message */ }
  })

  aisUpstream.on('close', (code) => {
    console.log(`[AIS] Disconnected (${code}) — reconnecting in 5s`)
    setTimeout(connectAISStream, 5000)
  })

  aisUpstream.on('error', (err) => {
    console.error('[AIS] Error:', err.message)
    aisUpstream.terminate()
  })
}

// Broadcast vessel snapshot to all browser clients every 10 s
setInterval(() => {
  if (vesselStore.size === 0) return
  latestVessels = vesselGeoJSON()
  broadcast({ type: 'vessels', data: latestVessels })
}, BROADCAST_INTERVAL_MS)

connectAISStream()

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
