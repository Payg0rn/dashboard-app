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
      return res.json(data ?? { receivedAt: null, metrics: [], hourlyEnergy: null })
    } catch {
      return res.json({ receivedAt: null, metrics: [], hourlyEnergy: null })
    }
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await readBody(req)
      let parsed
      try {
        parsed = JSON.parse(rawBody)
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON' })
      }

      const srcMetrics = parsed?.data?.metrics ?? parsed?.metrics ?? []
      const metrics = parseMetrics(srcMetrics)
      const hourlyEnergy = buildHourlyEnergy(srcMetrics)
      const sleepNights  = buildSleepNights(srcMetrics)
      const snapshot = { receivedAt: new Date().toISOString(), metrics, hourlyEnergy, sleepNights }

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

function parseMetrics(src) {
  const today = new Date().toISOString().slice(0, 10)
  return src.map(m => {
    const data = m.data ?? []
    const todayEntries = data.filter(d => (d.date ?? '').startsWith(today))
    return {
      name: m.name,
      units: m.units ?? '',
      latest: latestValue(data),
      todayCount: todayEntries.length,
      todaySum: todayEntries.reduce((s, d) => s + (d.qty ?? d.Avg ?? d.value ?? 0), 0),
      recent: data.slice(-7).map(d => d.qty ?? d.Avg ?? d.value ?? d.asleep ?? null),
    }
  })
}

function latestValue(data) {
  if (!data.length) return null
  const last = data[data.length - 1]
  return last.qty ?? last.Avg ?? last.value ?? last.asleep ?? null
}

// Build a 24-element array of energy scores (0-100) derived from heart rate and step count.
// Slots with no data for today return null → the front-end falls back to the circadian baseline.
function buildHourlyEnergy(srcMetrics) {
  const today = new Date().toISOString().slice(0, 10)

  const findRaw = name => srcMetrics.find(m => m.name === name)?.data ?? []
  const hrRaw    = findRaw('heart_rate')
  const stepRaw  = findRaw('step_count')
  const restingRaw = findRaw('resting_heart_rate')

  // Use latest resting HR for normalisation (default 60 if unavailable)
  const restingHR = restingRaw.length ? (latestValue(restingRaw) ?? 60) : 60

  // Group today's readings by local hour (Health Auto Export timestamps are local time)
  const hrByHour   = groupByHour(hrRaw,   today)
  const stepByHour = groupByHour(stepRaw, today)

  return Array.from({ length: 24 }, (_, h) => {
    const hrs   = hrByHour[h]
    const steps = stepByHour[h]

    if (!hrs && !steps) return null

    let scoreSum = 0, parts = 0

    if (hrs && hrs.length) {
      const avg = hrs.reduce((s, v) => s + v, 0) / hrs.length
      // Map HR relative to resting onto 5–95:
      // at resting → 20, +30 above resting → ~47, +75 above resting → ~88
      const hrScore = Math.max(5, Math.min(95, Math.round(20 + (avg - restingHR) * 0.9)))
      scoreSum += hrScore
      parts++
    }

    if (steps) {
      // 600 steps/hr ≈ slow walk → 100; caps at 95
      const stepScore = Math.min(95, Math.round((steps / 600) * 95))
      scoreSum += stepScore
      parts++
    }

    return Math.round(scoreSum / parts)
  })
}

function groupByHour(dataArr, today) {
  const map = {}
  for (const d of dataArr) {
    const dateStr = d.date ?? ''
    if (!dateStr.startsWith(today)) continue
    const h = parseHour(dateStr)
    if (h === null) continue
    const val = d.qty ?? d.Avg ?? d.value ?? null
    if (val == null) continue
    if (!map[h]) map[h] = []
    map[h].push(val)
  }
  return map
}

// Parses hour from "2024-01-15 09:32:00 -0800" or "2024-01-15T09:32:00"
function parseHour(dateStr) {
  const m = dateStr.match(/[\sT](\d{2}):\d{2}/)
  return m ? parseInt(m[1], 10) : null
}

// Parse wall-clock date/time from a Health Auto Export timestamp string.
// Returns { date:"YYYY-MM-DD", hour, minute, ms } treating local wall-clock as-is.
function parseSleepDt(dateStr) {
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})[\sT](\d{2}):(\d{2})/)
  if (!m) return null
  const hour = parseInt(m[2], 10), minute = parseInt(m[3], 10)
  // Use synthetic ISO (no tz) so Date parses it as local — consistent across all entries
  const ms = new Date(`${m[1]}T${m[2]}:${m[3]}:00`).getTime()
  return { date: m[1], hour, minute, ms }
}

// Build per-night sleep records from raw sleep_analysis + physiological metric samples.
// Returns an array of nights (most-recent first, max 14) each with:
//   date, bed, wake, inBed (min), asleep (min), awake/rem/core/deep (min),
//   avgHR, minHR, hrv, resp, spo2, wristT  (null when not available)
function buildSleepNights(srcMetrics) {
  const findRaw = name => srcMetrics.find(m => m.name === name)?.data ?? []

  const sleepRaw = findRaw('sleep_analysis')
  const hrRaw    = findRaw('heart_rate')
  const hrvRaw   = findRaw('heart_rate_variability_sdnn')
  const respRaw  = findRaw('respiratory_rate')
  const spo2Raw  = findRaw('blood_oxygen_saturation')
  // Apple Watch sleep wrist temp (recorded nightly during sleep tracking)
  const wristRaw = findRaw('apple_sleeping_wrist_temperature').length
    ? findRaw('apple_sleeping_wrist_temperature')
    : findRaw('wrist_temperature')

  const STAGE_MAP = {
    HKCategoryValueSleepAnalysisInBed:            'inBed',
    HKCategoryValueSleepAnalysisAsleepUnspecified: 'core',
    HKCategoryValueSleepAnalysisAsleepCore:        'core',
    HKCategoryValueSleepAnalysisAsleepREM:         'rem',
    HKCategoryValueSleepAnalysisAsleepDeep:        'deep',
    HKCategoryValueSleepAnalysisAwake:             'awake',
  }

  // Group sleep stage entries by "night" key (YYYY-MM-DD of the evening side).
  // 18:00–23:59 → night of that date; 00:00–13:59 → night of previous date.
  const nightMap = {}
  for (const entry of sleepRaw) {
    const p = parseSleepDt(entry.date ?? '')
    if (!p) continue
    let nightKey
    if (p.hour >= 18) {
      nightKey = p.date
    } else if (p.hour < 14) {
      const d = new Date(`${p.date}T12:00:00`)
      d.setDate(d.getDate() - 1)
      nightKey = d.toISOString().slice(0, 10)
    } else {
      continue // 14–18 h gap — ambiguous, skip
    }
    if (!nightMap[nightKey]) nightMap[nightKey] = []
    nightMap[nightKey].push(entry)
  }

  const keys = Object.keys(nightMap).sort().reverse().slice(0, 14)

  const avg = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null
  const mn  = arr => arr.length ? Math.round(Math.min(...arr) * 10) / 10 : null

  return keys.map(nightKey => {
    const entries = nightMap[nightKey]
    let earliest = null, latest = null
    const stageMins = { inBed: 0, awake: 0, rem: 0, core: 0, deep: 0 }

    for (const e of entries) {
      const p = parseSleepDt(e.date ?? '')
      if (!p) continue
      const durMins = Math.round((e.qty ?? 0) * 60)
      const endMs = p.ms + durMins * 60000
      if (earliest === null || p.ms < earliest) earliest = p.ms
      if (latest   === null || endMs > latest)  latest   = endMs
      const stage = STAGE_MAP[e.value ?? ''] ?? 'core'
      stageMins[stage] += durMins
    }

    if (earliest === null) return null

    const bedDt  = new Date(earliest)
    const wakeDt = new Date(latest)
    const fmt2   = n => String(n).padStart(2, '0')
    const inBedMins  = Math.round((latest - earliest) / 60000)
    const asleepMins = stageMins.rem + stageMins.core + stageMins.deep

    // Collect physiological readings that fall within the sleep window
    const winVals = raw => raw
      .filter(d => { const p = parseSleepDt(d.date ?? ''); return p && p.ms >= earliest && p.ms <= latest })
      .map(d => d.qty ?? d.Avg ?? d.value ?? null)
      .filter(v => v != null)

    return {
      date:   nightKey,
      bed:    `${fmt2(bedDt.getHours())}:${fmt2(bedDt.getMinutes())}`,
      wake:   `${fmt2(wakeDt.getHours())}:${fmt2(wakeDt.getMinutes())}`,
      inBed:  inBedMins,
      asleep: asleepMins,
      awake:  stageMins.awake,
      rem:    stageMins.rem,
      core:   stageMins.core,
      deep:   stageMins.deep,
      avgHR:  avg(winVals(hrRaw)),
      minHR:  mn(winVals(hrRaw)),
      hrv:    avg(winVals(hrvRaw)),
      resp:   avg(winVals(respRaw)),
      spo2:   avg(winVals(spo2Raw)),
      wristT: avg(winVals(wristRaw)),
    }
  }).filter(Boolean)
}
