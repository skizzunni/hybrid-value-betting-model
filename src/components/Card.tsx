import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode
  actions?: ReactNode
  padded?: boolean
}

export default function Card({ title, actions, padded = true, className = '', children, ...rest }: CardProps) {
  return (
    <section className={`card ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <header className="card-head">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'card-body' : undefined}>{children}</div>
    </section>
  )
}
