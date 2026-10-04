import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  description,
  action,
  tone = 'default',
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  tone?: 'default' | 'error'
}) {
  return (
    <div className={`empty tone-box-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
