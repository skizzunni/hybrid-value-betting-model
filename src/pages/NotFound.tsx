import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
      <h1>Page not found</h1>
      <p>We couldn&apos;t find the page you were looking for.</p>
      <Link to="/">Back to home</Link>
    </section>
  )
}
