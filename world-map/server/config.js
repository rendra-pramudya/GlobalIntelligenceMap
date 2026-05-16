import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dirname, 'config.json')

export const KEYS = [
  'OPENSKY_USER', 'OPENSKY_PASS',
  'FR24_API_KEY',
  'AIS_API_KEY', 'AIS_API_URL',
  'OWM_API_KEY',
  'ACLED_KEY', 'ACLED_EMAIL'
]

const SENSITIVE = new Set(['OPENSKY_PASS', 'AIS_API_KEY', 'FR24_API_KEY', 'OWM_API_KEY', 'ACLED_KEY'])

function load() {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch {}
  return {}
}

let _config = load()

export function getConfig() {
  const out = {}
  for (const k of KEYS) out[k] = _config[k] || process.env[k] || ''
  return out
}

export function getConfigSafe() {
  const c = getConfig()
  const out = {}
  for (const k of KEYS) out[k] = SENSITIVE.has(k) && c[k] ? '••••••••' : c[k]
  return out
}

export function setConfig(updates) {
  for (const [k, v] of Object.entries(updates)) {
    if (KEYS.includes(k)) _config[k] = v
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2))
}
