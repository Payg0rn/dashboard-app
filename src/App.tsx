import { useState } from 'react'
import {
  PageShell, PosterGrid, Ticker,
  Badge, Button,
} from './design-kit'
import type { PosterConfig } from './design-kit'
import HealthPage from './HealthPage'

const POSTERS: PosterConfig[] = [
  { art: 'aurora',  slot: 'hero',    label: 'Dashboard',  id: 'dashboard', active: true },
  { art: 'grid',    slot: 'wideTop', label: 'Nutrition',  id: 'nutrition', active: true },
  { art: 'dots',    slot: 'tall',    label: 'Finance',    id: 'finance' },
  { art: 'duotone', slot: 'square',  label: 'Gym',        id: 'gym' },
  { art: 'frosted', slot: 'wideBot', label: 'Education',  id: 'education' },
]

const TICKER_ITEMS = [
  { label: 'Revenue', value: '$48,200', live: true },
  { label: 'Users', value: '2,841' },
  { label: 'Conversion', value: '3.4%' },
  { label: 'Orders', value: '184' },
  { label: 'MRR', value: '$12,400' },
]

type Tab = 'dashboard' | 'health'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.25rem',
        padding: '0 1.5rem',
      }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--muted)', marginRight: '1rem' }}>
          NexusFlow
        </span>
        {(['dashboard', 'health'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            letterSpacing: '.1em', textTransform: 'uppercase',
            color: tab === t ? 'var(--accent)' : 'var(--muted)',
            padding: '1rem 0.75rem',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            transition: 'color 180ms, border-color 180ms',
          }}>
            {t === 'health' ? 'Apple Watch' : t}
          </button>
        ))}
      </nav>

      {tab === 'health' ? <HealthPage /> : (
        <PageShell>
          <Ticker items={TICKER_ITEMS} />

          <PosterGrid posters={POSTERS} onSelect={id => setSelected(id)} />

{selected && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge tone="neutral">Selected</Badge>
              <Badge tone="accent">{selected}</Badge>
              <Button variant="link" onClick={() => setSelected(null)}>Clear</Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="primary">Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="pill">Pill tag</Button>
            <Button variant="link">Link</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </PageShell>
      )}
    </>
  )
}
