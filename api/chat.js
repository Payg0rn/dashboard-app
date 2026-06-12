import Anthropic from '@anthropic-ai/sdk'
import { get } from '@vercel/edge-config'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).end()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.' })
  }

  // Load latest Apple Watch data
  let snapshot = null
  try { snapshot = await get('health_snapshot') } catch {}

  const metrics = snapshot?.metrics ?? []
  const receivedAt = snapshot?.receivedAt

  const metricsText = metrics.length > 0
    ? metrics.map(m => {
        const name = m.name.replace(/_/g, ' ')
        const val = m.latest !== null ? `${m.latest} ${m.units}` : 'no data'
        const todayNote = m.todayCount > 0 ? ` (${m.todayCount} readings today)` : ''
        return `• ${name}: ${val}${todayNote}`
      }).join('\n')
    : 'No Apple Watch data received yet.'

  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const dayStr = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dataAge = receivedAt
    ? `Data last synced: ${new Date(receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : 'No sync yet today'

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are a concise personal health coach. Based on the Apple Watch metrics below, give 3–5 short, specific, actionable bullet points for what the person should do right now or in the next few hours. Focus on what the data actually shows — high/low heart rate, activity levels, sleep quality, recovery. Be direct and practical. No intro sentence, no sign-off. Just the bullets.

Current time: ${timeStr} on ${dayStr}
${dataAge}

Apple Watch metrics:
${metricsText}`
    }]
  })

  const advice = message.content[0]?.text ?? 'No advice available.'
  return res.json({ advice, generatedAt: new Date().toISOString() })
}
