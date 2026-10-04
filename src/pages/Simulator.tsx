import { pickGroups, buildCsv } from '../mockData'

export default function Dashboard() {
  const groups = pickGroups

  function downloadCsv() {
    const rows = groups.flatMap((g) => g.items.map((it) => ({ group: g.label, ...it })))
    const csv = buildCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'picks.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container page-space">
      <section className="section-panel board-panel">
        <div className="section-head">
          <h2>Dashboard</h2>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="primary-btn" onClick={downloadCsv}>Download CSV</button>
        </div>

        <div style={{ marginTop: 16 }}>
          {groups.map((group) => (
            <div key={group.id} style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 8 }}>{group.label}</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {group.items.map((it) => (
                  <div key={it.id} style={{ padding: 10, border: '1px solid rgba(148,163,184,0.12)', borderRadius: 8 }}>
                    <strong>{it.label}</strong>
                    <div style={{ color: '#94a3b8' }}>{it.note}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ marginRight: 12 }}>Fair: {it.fair}</span>
                      <span style={{ marginRight: 12 }}>Odds: {it.odds}</span>
                      <span>Units: {it.units}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
