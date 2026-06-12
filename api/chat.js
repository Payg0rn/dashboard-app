import { get } from '@vercel/edge-config'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Add ANTHROPIC_API_KEY to Vercel environment variables.' })
  }

  // Load Apple Watch data from Edge Config
  let snapshot = null
  try { snapshot = await get('health_snapshot') } catch {}

  const metrics = snapshot?.metrics ?? []
  const receivedAt = snapshot?.receivedAt

  const metricsText = metrics.length > 0
    ? metrics.map(m => {
        const name = m.name.replace(/_/g, ' ')
        const val = m.latest !== null ? `${m.latest} ${m.units}` : 'no data'
        return `• ${name}: ${val}${m.todayCount > 0 ? ` (${m.todayCount} readings today)` : ''}`
      }).join('\n')
    : 'No Apple Watch data received yet.'

  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const dayStr = now.toLocaleDateString('en-GB', { weekday: 'long' })

  const prompt = `You are a concise personal health coach. Based on the Apple Watch metrics below, give 3–5 short, specific, actionable bullet points for what the person should do right now or in the next few hours. Focus on what the data actually shows. Be direct and practical. No intro sentence, no sign-off. Just the bullets starting with a dash.

Current time: ${timeStr} on ${dayStr}
${receivedAt ? `Data synced: ${new Date(receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'No sync yet'}

Apple Watch metrics:
${metricsText}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!r.ok) {
    const err = await r.text()
    console.error('Anthropic API error:', err)
    return res.status(502).json({ error: 'AI service error', detail: err })
  }

  const data = await r.json()
  const advice = data.content?.[0]?.text ?? 'No advice available.'
  return res.json({ advice, generatedAt: new Date().toISOString() })
}
