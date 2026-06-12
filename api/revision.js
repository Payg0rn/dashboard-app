import { get } from '@vercel/edge-config'

const EC_ID    = process.env.EDGE_CONFIG_ID
const VC_TOKEN = process.env.VC_API_TOKEN
const TEAM_ID  = process.env.VC_TEAM_ID

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const data = await get('revision_state')
      return res.json(data ?? null)
    } catch {
      return res.json(null)
    }
  }

  if (req.method === 'POST') {
    try {
      const raw = await readBody(req)
      const payload = JSON.parse(raw)

      const r = await fetch(
        `https://api.vercel.com/v1/edge-config/${EC_ID}/items?teamId=${TEAM_ID}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${VC_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ operation: 'upsert', key: 'revision_state', value: payload }],
          }),
        }
      )

      if (!r.ok) return res.status(500).json({ ok: false, error: await r.text() })
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => resolve(d))
    req.on('error', reject)
  })
}
