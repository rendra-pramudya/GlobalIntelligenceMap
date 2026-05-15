import { Router } from 'express'

const router = Router()

// In-memory store — replace with SQLite/Postgres for persistence
const drawings = new Map()

router.get('/', (req, res) => {
  res.json(Array.from(drawings.values()))
})

router.post('/', (req, res) => {
  const feature = req.body
  if (!feature?.id) return res.status(400).json({ error: 'Feature must have an id' })
  drawings.set(feature.id, feature)
  res.json(feature)
})

router.delete('/:id', (req, res) => {
  drawings.delete(req.params.id)
  res.json({ ok: true })
})

export default router
