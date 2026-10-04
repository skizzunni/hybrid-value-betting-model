import type { ReactNode } from 'react'

export type BadgeKind =
  | 'Gold'
  | 'Diamond'
  | 'Silver'
  | 'Bronze'
  | 'lottery'
  | 'winnable'
  | 'demo'
  | 'live'
  | 'neutral'

const LABELS: Partial<Record<BadgeKind, string>> = {
  lottery: 'Lottery',
  winnable: 'Winnable',
  demo: 'Demo data',
  live: 'Live odds',
}

export default function Badge({ kind = 'neutral', children }: { kind?: BadgeKind | string; children?: ReactNode }) {
  const label = children ?? LABELS[kind as BadgeKind] ?? kind
  return <span className={`badge badge-${String(kind).toLowerCase()}`}>{label}</span>
}
