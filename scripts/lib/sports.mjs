// Supported sports. `key` is The Odds API sport key; `espn` is the ESPN public scoreboard path (fallback).
export const SPORTS = {
  NFL: { key: 'americanfootball_nfl', league: 'NFL', kind: 'team', threeWay: false, espn: 'football/nfl' },
  NBA: { key: 'basketball_nba', league: 'NBA', kind: 'team', threeWay: false, espn: 'basketball/nba' },
  MLB: { key: 'baseball_mlb', league: 'MLB', kind: 'team', threeWay: false, espn: 'baseball/mlb' },
  NHL: { key: 'icehockey_nhl', league: 'NHL', kind: 'team', threeWay: false, espn: 'hockey/nhl' },
  Soccer: { key: 'soccer_epl', league: 'EPL', kind: 'team', threeWay: true, espn: 'soccer/eng.1' },
  UFC: { key: 'mma_mixed_martial_arts', league: 'UFC', kind: 'fight', threeWay: false, espn: 'mma/ufc' },
}

export const SPORT_LABELS = Object.keys(SPORTS)

export function sportByKey(key) {
  return SPORT_LABELS.find((label) => SPORTS[label].key === key)
}

export const GAME_STATUSES = ['scheduled', 'in_progress', 'final', 'postponed', 'cancelled']
export const TERMINAL_STATUSES = ['final', 'postponed', 'cancelled']
export const MIN_SAMPLE = 50
export const STALE_HOURS = 48
export const EXPECT_RESOLVED_AFTER_HOURS = 8
export const AUTO_VOID_AFTER_DAYS = 7
export const MIN_LEGS = 25
