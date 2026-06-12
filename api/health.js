import { get } from '@vercel/edge-config'

const EC_ID = process.env.EDGE_CONFIG_ID
const VC_TOKEN = process.env.VC_API_TOKEN   // renamed — VERCEL_ prefix is reserved
const TEAM_ID = process.env.VC_TEAM_ID

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const data = await get('health_snapshot')
      return res.json(data ?? { receivedAt: null, metrics: [] })
    } catch {
      return res.json({ receivedAt: null, metrics: [] })
    }
  }

  if (req.method === 'POST') {
    try {
      // Read raw body regardless of Content-Type
      const rawBody = await readBody(req)
      let parsed
      try {
        parsed = JSON.parse(rawBody)
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON' })
      }

      const metrics = parseMetrics(parsed)
      const snapshot = { receivedAt: new Date().toISOString(), metrics }

      const r = await fetch(
        `https://api.vercel.com/v1/edge-config/${EC_ID}/items?teamId=${TEAM_ID}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${VC_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ operation: 'upsert', key: 'health_snapshot', value: snapshot }],
          }),
        }
      )

      if (!r.ok) {
        const err = await r.text()
        console.error('Edge Config write error:', err)
        return res.status(500).json({ ok: false, error: err })
      }

      return res.json({ ok: true, metrics: metrics.length })
    } catch (e) {
      console.error('POST handler error:', e)
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function parseMetrics(raw) {
  const src = raw?.data?.metrics ?? raw?.metrics ?? []
  return src.map(m => {
    const data = m.data ?? []
    const today = new Date().toISOString().slice(0, 10)
    const todayEntries = data.filter(d => (d.date ?? '').startsWith(today))
    return {
      name: m.name,
      units: m.units ?? '',
      latest: latestValue(data),
      todayCount: todayEntries.length,
      todaySum: todayEntries.reduce((s, d) => s + (d.qty ?? d.Avg ?? d.value ?? 0), 0),
      // keep only last 7 entries for sparkline — no full history
      recent: data.slice(-7).map(d => d.qty ?? d.Avg ?? d.value ?? d.asleep ?? null),
    }
  })
}

function latestValue(data) {
  if (!data.length) return null
  const last = data[data.length - 1]
  return last.qty ?? last.Avg ?? last.value ?? last.asleep ?? null
}

