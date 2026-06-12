import { useEffect, useState } from 'react'
import { PageShell, Card, Ring, Badge, Ticker } from './design-kit'

interface MetricEntry {
  date: string
  qty?: number
  Avg?: number
  Min?: number
  Max?: number
  value?: number
  asleep?: number
  inBed?: number
}

interface Metric {
  name: string
  units: string
  latest: number | null
  todayCount: number
  todaySum: number
  recent: (number | null)[]
}

interface HealthSnapshot {
  receivedAt: string | null
  metrics: Metric[]
}

const METRIC_DISPLAY: Record<string, { label: string; icon: string; unit: string; ringMax?: number }> = {
  heart_rate:            { label: 'Heart Rate',      icon: '♥',  unit: 'bpm',  ringMax: 200 },
  step_count:            { label: 'Steps',           icon: '👟', unit: 'steps', ringMax: 10000 },
  active_energy_burned:  { label: 'Active Cal',      icon: '🔥', unit: 'kcal', ringMax: 600 },
  exercise_time:         { label: 'Exercise',        icon: '⏱',  unit: 'min',  ringMax: 60 },
  stand_hours:           { label: 'Stand Hours',     icon: '🧍', unit: 'hr',   ringMax: 12 },
  sleep_analysis:        { label: 'Sleep',           icon: '🌙', unit: 'hr',   ringMax: 9 },
  resting_heart_rate:    { label: 'Resting HR',      icon: '💤', unit: 'bpm',  ringMax: 100 },
  heart_rate_variability_sdnn: { label: 'HRV',       icon: '📈', unit: 'ms',   ringMax: 100 },
  vo2_max:               { label: 'VO₂ Max',         icon: '💨', unit: 'ml/kg·min', ringMax: 60 },
  respiratory_rate:      { label: 'Respiration',     icon: '🫁', unit: 'brpm', ringMax: 30 },
  blood_oxygen_saturation: { label: 'Blood O₂',     icon: '🩸', unit: '%',    ringMax: 100 },
  body_mass:             { label: 'Weight',          icon: '⚖',  unit: 'kg' },
  distance_walking_running: { label: 'Distance',    icon: '📍', unit: 'km',   ringMax: 10 },
}

const PRIORITY = [
  'heart_rate', 'step_count', 'active_energy_burned', 'exercise_time',
  'stand_hours', 'sleep_analysis', 'resting_heart_rate', 'heart_rate_variability_sdnn',
  'vo2_max', 'blood_oxygen_saturation',
]

function ringPercent(value: number, name: string): number {
  const max = METRIC_DISPLAY[name]?.ringMax
  if (!max) return Math.min(100, (value / 100) * 100)
  return Math.min(100, (value / max) * 100)
}

function fmt(value: number | null, units: string): string {
  if (value === null) return '—'
  if (units.includes('hr') || units === 'h') return `${value.toFixed(1)}`
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toFixed(1)
}

function statusForHR(bpm: number | null): 'accent' | 'amber' | 'red' {
  if (bpm === null) return 'accent'
  if (bpm > 100) return 'red'
  if (bpm > 90) return 'amber'
  return 'accent'
}

export default function HealthPage() {
  const [data, setData] = useState<HealthSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const url = window.location.hostname === 'localhost'
          ? 'http://localhost:3001/api/health'
          : '/api/health'
        const res = await fetch(url)
        if (!res.ok) throw new Error()
        const json: HealthSnapshot = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    const id = setInterval(() => { load(); setLastRefresh(Date.now()) }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const metrics = data?.metrics ?? []

  // Sort by priority list, then alphabetically
  const sorted = [...metrics].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.name)
    const bi = PRIORITY.indexOf(b.name)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  const hrMetric = metrics.find(m => m.name === 'heart_rate')
  const stepsMetric = metrics.find(m => m.name === 'step_count')
  const sleepMetric = metrics.find(m => m.name === 'sleep_analysis')
  const calMetric = metrics.find(m => m.name === 'active_energy_burned')

  const tickerItems = [
    hrMetric    && { label: 'Heart Rate', value: `${fmt(hrMetric.latest, 'bpm')} bpm`, live: true },
    stepsMetric && { label: 'Steps Today', value: fmt(stepsMetric.latest, 'count') },
    calMetric   && { label: 'Active Cal', value: `${fmt(calMetric.latest, 'kcal')} kcal` },
    sleepMetric && { label: 'Sleep', value: `${fmt(sleepMetric.latest, 'hr')} hr` },
  ].filter(Boolean) as { label: string; value: string; live?: boolean }[]

  if (error) return (
    <PageShell>
      <Card eyebrow="Connection error" title="Could not load health data">
        <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          {window.location.hostname === 'localhost'
            ? 'Start the local health server: node health-server.js'
            : 'The health API is unreachable. Check that the Vercel deployment completed successfully.'}
        </p>
      </Card>
    </PageShell>
  )

  if (!data) return (
    <PageShell>
      <Card eyebrow="Loading" title="Waiting for Apple Watch data…">
        <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
          Connecting to health server…
        </p>
      </Card>
    </PageShell>
  )

  if (data.receivedAt === null) return (
    <PageShell>
      <SetupCard />
    </PageShell>
  )

  return (
    <PageShell>
      {tickerItems.length > 0 && <Ticker items={tickerItems} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Apple Watch
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'var(--text-2xl)', marginTop: '0.25rem' }}>
            Health Dashboard
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Badge tone="accent" dot>Live</Badge>
          <div style={{ marginTop: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
            Updated {new Date(data.receivedAt).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        {sorted.map(metric => {
          const display = METRIC_DISPLAY[metric.name]
          const label = display?.label ?? metric.name.replace(/_/g, ' ')
          const unit = display?.unit ?? metric.units
          const value = metric.latest
          const pct = value !== null ? ringPercent(value, metric.name) : 0
          const tone = metric.name === 'heart_rate' ? statusForHR(value) : 'accent'

          return (
            <Card key={metric.name} elevated>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                {label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Ring
                  value={pct}
                  size={80}
                  stroke={6}
                  display={
                    <span style={{ fontSize: '1rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: `var(--${tone === 'accent' ? 'accent' : tone === 'amber' ? 'amber' : 'red'})` }}>
                      {fmt(value, unit)}
                    </span>
                  }
                />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: '0.4rem' }}>
                    {unit}
                  </div>
                  <Badge tone={tone}>{value !== null ? `${Math.round(pct)}%` : 'no data'}</Badge>
                  {metric.todayCount > 0 && (
                    <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                      {metric.todayCount} readings today
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {sorted.length === 0 && (
        <Card eyebrow="No data yet" title="Waiting for first sync">
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
            Health Auto Export hasn't sent data yet. Trigger a manual export in the app or wait for the next scheduled sync.
          </p>
        </Card>
      )}
    </PageShell>
  )
}

function SetupCard() {
  return (
    <Card eyebrow="Setup required" title="Connect Health Auto Export">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
        <Step n={1} title="Install Health Auto Export">
          Free on the App Store. Search <em style={{ color: 'var(--accent)' }}>Health Auto Export</em>.
        </Step>
        <Step n={2} title="Add a REST API export">
          In the app: <Mono>Exports → + → REST API</Mono>
        </Step>
        <Step n={3} title="Set the URL">
          Use your computer's local IP printed when you started the server:
          <pre style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', background: 'var(--card-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)' }}>
            http://YOUR_IP:3001/api/health
          </pre>
        </Step>
        <Step n={4} title="Choose your metrics">
          Pick heart rate, steps, sleep, calories, HRV — whatever you want shown.
        </Step>
        <Step n={5} title="Set frequency &amp; tap Export">
          Hourly is a good default. Tap <Mono>Export Now</Mono> to get the first data immediately.
        </Step>
      </div>
    </Card>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.875rem' }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-deep)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>
        {n}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: '0.25rem' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8em', color: 'var(--accent)', background: 'var(--card-elevated)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>{children}</code>
}
