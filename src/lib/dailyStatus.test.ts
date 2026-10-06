import { describe, expect, it } from 'vitest'
import { dailyStatus } from './dailyStatus'

const now = new Date('2026-10-06T12:00:00Z')
const items = Array.from({ length: 25 }, () => ({}))

describe('dailyStatus', () => {
  it('is sample when there are no generated legs', () => {
    expect(dailyStatus({ groups: [{ items: [] }] }, {}, now).state).toBe('sample')
  })
  it('is live when recent and stale when old', () => {
    expect(dailyStatus({ generated_at: '2026-10-06T05:30:00Z', groups: [{ items }] }, { graded: 10, pending: 25 }, now)).toMatchObject({ state: 'live', legs: 25, graded: 10, pending: 25 })
    expect(dailyStatus({ generated_at: '2026-10-04T05:30:00Z', groups: [{ items }] }, {}, now).state).toBe('stale')
  })
})
