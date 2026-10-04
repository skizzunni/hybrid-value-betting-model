import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchOddsAsLegs } from '../engine/oddsAdapter'
import { generateDailyMenu, type Leg, type Ticket } from '../engine/ticketBuilder'
import { topStraightPlays } from '../engine/staking'
import { samplePicks } from '../mockData'
import { AdjustedProbabilityModel, loadLearnedAdjustments, loadLearningEnabled, saveLearningEnabled } from '../engine/postmortem/learning'

export const MIN_PROBABILITY = 0.55

export type DataSource = 'live' | 'demo'

export type SlateState = {
  status: 'loading' | 'ready' | 'error'
  legs: Leg[]
  tickets: Ticket[]
  straightPlays: Leg[]
  source: DataSource
  keyConfigured: boolean
  /** Key is set but the app still fell back to sample picks. */
  liveUnavailable: boolean
  learningEnabled: boolean
  setLearningEnabled: (enabled: boolean) => void
  error: string | null
  reload: () => void
}

const sampleIds = new Set(samplePicks.map((pick) => pick.id))

export function isSampleSlate(legs: Leg[]): boolean {
  return legs.length > 0 && legs.every((leg) => sampleIds.has(leg.id))
}

const SlateContext = createContext<SlateState | null>(null)

export function SlateProvider({ children }: { children: ReactNode }) {
  const keyConfigured = Boolean(import.meta.env.VITE_ODDS_API_KEY)
  const [nonce, setNonce] = useState(0)
  const [learningEnabled, setLearningEnabledState] = useState(loadLearningEnabled)
  const [learningRevision, setLearningRevision] = useState(0)
  const [state, setState] = useState<Omit<SlateState, 'reload' | 'keyConfigured' | 'liveUnavailable' | 'learningEnabled' | 'setLearningEnabled'>>({
    status: 'loading',
    legs: [],
    tickets: [],
    straightPlays: [],
    source: 'demo',
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    fetchOddsAsLegs()
      .then((legs) => {
        if (cancelled) return
        setState({
          status: 'ready',
          legs,
          tickets: generateDailyMenu(legs, { lotteryLegs: 25, minProbability: MIN_PROBABILITY, mode: 'parlays' }),
          straightPlays: topStraightPlays(legs, 8),
          source: keyConfigured && !isSampleSlate(legs) ? 'live' : 'demo',
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          legs: [],
          tickets: [],
          straightPlays: [],
          source: 'demo',
          error: error instanceof Error ? error.message : 'Failed to load odds',
        })
      })
    return () => {
      cancelled = true
    }
  }, [nonce, keyConfigured])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setLearningEnabled = useCallback((enabled: boolean) => {
    saveLearningEnabled(enabled)
    setLearningEnabledState(enabled)
    setLearningRevision((revision) => revision + 1)
  }, [])
  const value = useMemo<SlateState>(
    () => {
      const base = { ...state, learningEnabled, setLearningEnabled, keyConfigured, liveUnavailable: keyConfigured && state.status === 'ready' && state.source === 'demo', reload }
      if (!learningEnabled || state.status !== 'ready') return base
      const model = new AdjustedProbabilityModel(loadLearnedAdjustments())
      const legs = state.legs.map((leg) => ({ ...leg, modelProbability: model.estimate(leg) }))
      return {
        ...base,
        legs,
        tickets: generateDailyMenu(legs, { lotteryLegs: 25, minProbability: MIN_PROBABILITY, mode: 'parlays' }),
        straightPlays: topStraightPlays(legs, 8),
      }
    },
    [state, keyConfigured, reload, learningEnabled, setLearningEnabled, learningRevision],
  )
  return <SlateContext.Provider value={value}>{children}</SlateContext.Provider>
}

export function useSlate(): SlateState {
  const ctx = useContext(SlateContext)
  if (!ctx) throw new Error('useSlate must be used within SlateProvider')
  return ctx
}
