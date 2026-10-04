import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import { SlateProvider } from './lib/slate'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Simulator from './pages/Simulator'
import Analytics from './pages/Analytics'
import Parlays from './pages/Parlays'
import Tickets from './pages/Tickets'

export default function App() {
  return (
    <BrowserRouter>
      <SlateProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/parlays" element={<Parlays />} />
            <Route path="/tickets" element={<Tickets />} />
          </Routes>
        </AppShell>
      </SlateProvider>
    </BrowserRouter>
  )
}
