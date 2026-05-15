import { Router } from 'express'
import { getConfigSafe, setConfig, KEYS } from '../config.js'

const router = Router()

const MASK = '••••••••'

router.get('/', (req, res) => res.json(getConfigSafe()))

router.post('/', (req, res) => {
  const updates = {}
  for (const k of KEYS) {
    if (k in req.body && req.body[k] !== MASK) updates[k] = req.body[k]
  }
  setConfig(updates)
  res.json({ ok: true })
})

export default router
