import Badge from '../components/Badge'
import Card from '../components/Card'
import DataTable, { type Column } from '../components/DataTable'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import ProbabilityBar from '../components/ProbabilityBar'
import { pickGroups, buildCsv, type PickItem } from '../mockData'
import { americanOdds, sportLabel } from '../lib/format'

const columns: Column<PickItem>[] = [
  {
    key: 'pick',
    header: 'Pick',
    render: (it) => (
      <>
        <div className="leg-title">{it.label}</div>
        <div className="leg-sub">{it.note}</div>
      </>
    ),
  },
  { key: 'sport', header: 'Sport', render: (it) => sportLabel(it.sport) },
  { key: 'odds', header: 'Odds', align: 'right', mono: true, render: (it) => americanOdds(it.odds) },
  { key: 'fair', header: 'Fair prob', render: (it) => <ProbabilityBar value={it.fair} label={`Fair probability for ${it.label}`} /> },
  { key: 'units', header: 'Units', align: 'right', render: (it) => it.units },
]

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
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Pick groups from the repository's sample picks."
        actions={
          <>
            <Badge kind="demo">Sample data</Badge>
            <button type="button" className="btn" onClick={downloadCsv}>Download CSV</button>
          </>
        }
      />
      {groups.length === 0 ? (
        <EmptyState title="No picks" description="There are no pick groups to show." />
      ) : (
        <div className="stack-lg">
          {groups.map((group) => (
            <Card key={group.id} title={group.label} padded={false}>
              <DataTable columns={columns} rows={group.items} rowKey={(it) => it.id} caption={group.label} />
            </Card>
          ))}
        </div>
      )}
      <Disclaimer />
    </>
  )
}
