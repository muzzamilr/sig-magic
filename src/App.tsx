import { useState } from 'react'
import { SignatureModal } from './signature'

const METRICS = [
  { label: 'Active patients', value: '1,284', delta: '+4.2%' },
  { label: 'Claims processed', value: '312', delta: '+11%' },
  { label: 'Pending approvals', value: '27', delta: '-8%' },
  { label: 'Revenue (MTD)', value: '$86.4k', delta: '+6.9%' },
]

const ROWS = [
  { name: 'Downtown Clinic', visits: 342, revenue: '$24,100', status: 'On track' },
  { name: 'Northside Care', visits: 289, revenue: '$19,870', status: 'On track' },
  { name: 'Lakeview Center', visits: 214, revenue: '$15,340', status: 'Review' },
  { name: 'Home Visits', visits: 439, revenue: '$27,090', status: 'On track' },
]

export default function App() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="page">
      <header className="topbar">
        <strong>Care Dashboard</strong>
        <span className="proto-badge">PROTOTYPE</span>
      </header>

      <main>
        <div className="metrics">
          {METRICS.map((m) => (
            <div className="card" key={m.label}>
              <div className="muted">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className={m.delta.startsWith('-') ? 'delta down' : 'delta up'}>{m.delta}</div>
            </div>
          ))}
        </div>

        <div className="card table-card">
          <div className="table-head">
            <h3>Locations — July 2026</h3>
            <button className="primary" onClick={() => setModalOpen(true)}>
              Sign monthly report
            </button>
          </div>
          <table>
            <thead>
              <tr><th>Location</th><th>Visits</th><th>Revenue</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td><td>{r.visits}</td><td>{r.revenue}</td><td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {modalOpen && (
        <SignatureModal
          onClose={() => setModalOpen(false)}
          onComplete={(result) => console.log('signature captured:', result.source, result.capturedAt)}
        />
      )}
    </div>
  )
}
