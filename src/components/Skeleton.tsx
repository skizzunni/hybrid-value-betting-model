export default function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="skeleton" aria-hidden="true" style={{ height, width }} />
}

export function SkeletonCards({ count = 3, height = 220 }: { count?: number; height?: number }) {
  return (
    <div className="grid-cards" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card" style={{ minHeight: height }}>
          <div className="card-body stack">
            <Skeleton width="60%" height={18} />
            <Skeleton height={12} />
            <Skeleton height={12} width="80%" />
            <Skeleton height={48} />
          </div>
        </div>
      ))}
    </div>
  )
}
