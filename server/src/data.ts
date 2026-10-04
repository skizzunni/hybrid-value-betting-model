export const defaultDb = {
  tickets: [
    { type: 'Player prop', name: 'Jalen Brunson O 27.5 points', market: 'NBA', edge: '+8.6%', confidence: 'High', size: '0.6u', status: 'Live +EV', fair: '58.4%', book: '51.2%' },
    { type: 'Side', name: 'Lakers +3.5', market: 'NBA', edge: '+4.2%', confidence: 'Medium', size: '0.4u', status: 'Monitor', fair: '54.0%', book: '48.7%' },
    { type: 'Parlay', name: '10-leg SGP build', market: 'Multi-sport', edge: '+11.1%', confidence: 'Low', size: '0.2u', status: 'Correlation check', fair: '14.8%', book: '9.7%' },
    { type: 'Total', name: 'Over 218.5', market: 'NBA', edge: '+5.7%', confidence: 'High', size: '0.5u', status: 'Live +EV', fair: '53.8%', book: '49.1%' }
  ],
  metrics: {
    bankroll: 18240,
    clv: 4.8,
    passRate: 0.86,
    expectedLossRate: 0.42,
    refreshCycleMinutes: 15
  },
  signals: [
    'Beat report updated: Celtics injury risk elevated 11%',
    'Weather alert: wind 18 mph reduces total model variance',
    'Usage increase signal: Lambert projected 34 min vs earlier 28',
    'Parlay books widened on same-game pricing'
  ]
}
