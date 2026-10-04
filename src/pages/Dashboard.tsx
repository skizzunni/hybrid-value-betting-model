import React, { useMemo, useState } from 'react'
import { buildCsv, pickGroups, type PickItem } from '../mockData'

function exportCsv(rows: PickItem[]) {
  const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = 'hybrid-picks.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function Dashboard() {
  const groups = useMemo(() => pickGroups, [])
  const [selected, setSelected] = useState(groups[0].id)

  const activeGroup = groups.find((group) => group.id === selected) ?? groups[0]
  const rows = activeGroup.items.slice(0, 25)

  return (
    <div className="container page-space">
      <section className="section-panel board-panel professional-panel">
        <div className="section-head split-head align-bottom">
          <div>
            <div className="eyebrow subtle">Model output</div>
            <h2>Multi-sport picks board</h2>
          </div>

          <div className="toolbar-row">
            <div className="segmented-control" role="tablist" aria-label="Pick categories">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={selected === group.id ? 'segment active' : 'segment'}
                  onClick={() => setSelected(group.id)}
                  type="button"
                >
                  {group.label}
                </button>
              ))}
            </div>

            <button type="button" className="primary-btn compact" onClick={() => exportCsv(rows)}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="section-note">
          {activeGroup.note}
        </div>

        <div className="professional-table-wrap">
          <table className="professional-table">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Market</th>
                <th>Pick</th>
                <th>Side</th>
                <th>Odds</th>
                <th>Fair</th>
                <th>Edge</th>
                <th>Conf.</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sport}</td>
                  <td>{row.market}</td>
                  <td className="pick-cell">
                    <strong>{row.title}</strong>
                    <span>{row.notes[0]}</span>
                  </td>
                  <td>{row.side}</td>
                  <td>{row.odds > 0 ? `+${row.odds}` : row.odds}</td>
                  <td>{(row.fair * 100).toFixed(1)}%</td>
                  <td className="edge-cell">{row.edge.toFixed(2)}%</td>
                  <td>
                    <span className={`confidence-dot ${row.confidence.toLowerCase()}`}>{row.confidence}</span>
                  </td>
                  <td>{row.units.toFixed(1)}u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
