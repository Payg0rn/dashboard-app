/**
 * Webhook receiver for Health Auto Export (iOS app).
 * POST /api/health  — receives data from the app
 * GET  /api/health  — serves latest snapshot to the dashboard
 *
 * Run: node health-server.js
 * Default port: 3001
 */

import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { networkInterfaces } from 'os'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dir, 'health-data.json')
const PORT = 3001

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Seed file so the GET never 404s on first load
if (!existsSync(DATA_FILE)) {
  writeFileSync(DATA_FILE, JSON.stringify({ receivedAt: null, metrics: [] }))
}

// Health Auto Export POSTs here
app.post('/api/health', (req, res) => {
  const raw = req.body
  const metrics = parseMetrics(raw)
  const snapshot = { receivedAt: new Date().toISOString(), metrics }
  writeFileSync(DATA_FILE, JSON.stringify(snapshot, null, 2))
  console.log(`[${snapshot.receivedAt}] received ${metrics.length} metrics`)
  res.json({ ok: true, metrics: metrics.length })
})

// Dashboard fetches here
app.get('/api/health', (_req, res) => {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  res.json(data)
})

app.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces()
  const localIPs = Object.values(nets).flat()
    .filter(n => n.family === 'IPv4' && !n.internal)
    .map(n => n.address)

  console.log(`\nHealth server running on port ${PORT}`)
  console.log(`Webhook URL for Health Auto Export:`)
  localIPs.forEach(ip => console.log(`  http://${ip}:${PORT}/api/health`))
  console.log(`  http://localhost:${PORT}/api/health  (same machine only)\n`)
})

/**
 * Normalises the JSON payload that Health Auto Export sends.
 * It wraps everything under data.metrics[] with {name, units, data[]}.
 */
function parseMetrics(raw) {
  const src = raw?.data?.metrics ?? raw?.metrics ?? []
  return src.map(m => ({
    name: m.name,
    units: m.units ?? '',
    latest: latestValue(m.data ?? []),
    today: todayValues(m.data ?? []),
    allData: (m.data ?? []).slice(-30), // keep last 30 entries
  }))
}

function latestValue(data) {
  if (!data.length) return null
  const last = data[data.length - 1]
  return last.qty ?? last.Avg ?? last.value ?? last.asleep ?? null
}

function todayValues(data) {
  const today = new Date().toISOString().slice(0, 10)
  return data.filter(d => (d.date ?? '').startsWith(today))
}
