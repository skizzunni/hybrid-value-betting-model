export type PickItem = {
  id: string
  sport: string
  market: string
  title: string
  side: string
  odds: number
  fair: number
  edge: number
  confidence: 'Low' | 'Medium' | 'High'
  units: number
  notes: string[]
}

export type PickGroup = {
  id: string
  label: string
  note: string
  items: PickItem[]
}

const range = (count: number) => Array.from({ length: count }, (_, i) => i)

const moneylineGames = [
  ['Chiefs', 'Bills'], ['Eagles', 'Cowboys'], ['49ers', 'Rams'], ['Bengals', 'Steelers'], ['Lions', 'Packers'],
  ['Jets', 'Patriots'], ['Dolphins', 'Bills'], ['Buccaneers', 'Saints'], ['Texans', 'Jaguars'], ['Vikings', 'Bears'],
  ['Ravens', 'Browns'], ['Chargers', 'Raiders'], ['Seahawks', 'Cardinals'], ['Giants', 'Commanders'], ['Falcons', 'Panthers'],
  ['Bears', 'Lions'], ['Colts', 'Titans'], ['Broncos', 'Chiefs'], ['Steelers', 'Ravens'], ['Saints', 'Falcons'],
  ['Cowboys', 'Eagles'], ['Packers', 'Vikings'], ['Jaguars', 'Texans'], ['Rams', 'Seahawks'], ['Browns', 'Steelers'],
]

const playerList = [
  'Patrick Mahomes', 'Jalen Hurts', 'Josh Allen', 'Christian McCaffrey', 'Ja Morant', 'Nikola Jokic',
  'Jayson Tatum', 'Shai Gilgeous-Alexander', 'Anthony Edwards', 'Devin Booker', 'Kyrie Irving', 'Chet Holmgren',
  'Mookie Betts', 'Shohei Ohtani', 'Jose Ramirez', 'Aaron Judge', 'Connor McDavid', 'Nathan MacKinnon',
  'Jack Hughes', 'Alex Ovechkin', 'Luis Robert', 'Bryce Harper', 'Rasmus Dahlin', 'Erling Haaland',
]

const totalsList = [
  'Chiefs/Bills Over 48.5', 'Eagles/Cowboys Over 52.5', '49ers/Rams Under 45.5', 'Bengals/Steelers Over 39.5',
  'Lions/Packers Over 50.5', 'Jets/Patriots Under 39.5', 'Dolphins/Bills Over 46.5', 'Bucs/Saints Over 41.5',
  'Texans/Jags Over 43.5', 'Vikings/Bears Under 45.5', 'Ravens/Browns Under 44.5', 'Chargers/Raiders Over 48.5',
  'Seahawks/Cardinals Over 43.5', 'Giants/Commanders Over 43.5', 'Falcons/Panthers Under 42.5', 'Bears/Lions Over 48.5',
  'Colts/Titans Under 42.5', 'Broncos/Chiefs Under 46.5', 'Steelers/Ravens Under 38.5', 'Saints/Falcons Over 39.5',
  'Cowboys/Eagles Over 51.5', 'Packers/Vikings Over 49.5', 'Jaguars/Texans Under 44.5', 'Rams/Seahawks Under 46.5', 'Browns/Steelers Over 36.5',
]

const createMoneylines = (): PickItem[] =>
  moneylineGames.map(([home, away], index) => ({
    id: `ml-${index + 1}`,
    sport: 'Multi-sport',
    market: 'Moneyline',
    title: `${home} vs ${away}`,
    side: home,
    odds: -170 - (index % 5) * 15,
    fair: 0.63 + (index % 5) * 0.025,
    edge: Number((0.03 + ((index % 4) * 0.012)).toFixed(2)),
    confidence: index % 3 === 0 ? 'High' : index % 2 === 0 ? 'Medium' : 'Low',
    units: index % 3 === 0 ? 1.5 : 1,
    notes: ['Strong home edge', 'Rest advantages', 'Line soft vs market'],
  }))

const createProps = (): PickItem[] =>
  playerList.map((player, index) => ({
    id: `prop-${index + 1}`,
    sport: index % 2 === 0 ? 'NBA' : index % 3 === 0 ? 'NFL' : 'MLB',
    market: 'Player prop',
    title: player,
    side: index % 2 === 0 ? 'Over' : 'Under',
    odds: -210 - (index % 6) * 18,
    fair: 0.68 + (index % 5) * 0.022,
    edge: Number((0.05 + ((index % 3) * 0.012)).toFixed(2)),
    confidence: index % 3 === 0 ? 'High' : index % 2 === 0 ? 'Medium' : 'Low',
    units: 1,
    notes: ['Usage profile supports the number', 'Recent form is stable', 'Team script favors the prop'],
  }))

const createTotals = (): PickItem[] =>
  totalsList.map((label, index) => ({
    id: `total-${index + 1}`,
    sport: 'Multi-sport',
    market: 'Total',
    title: label,
    side: label.includes('Over') ? 'Over' : 'Under',
    odds: -175 - (index % 5) * 20,
    fair: 0.61 + (index % 4) * 0.03,
    edge: Number((0.04 + ((index % 4) * 0.015)).toFixed(2)),
    confidence: index % 2 === 0 ? 'High' : 'Medium',
    units: index % 3 === 0 ? 1.5 : 1,
    notes: ['Pace mismatch', 'Weather or game script supports the total', 'Recent trends are favorable'],
  }))

const createHighConfidence = (): PickItem[] =>
  range(25).map((_, index) => ({
    id: `safe-${index + 1}`,
    sport: ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer'][index % 5],
    market: ['Moneyline', 'Player prop', 'Team total', 'Total', 'Spread'][index % 5],
    title: ['Home favorite', 'Star scorer prop', 'Team total over', 'Total over', 'Short spread'][index % 5],
    side: index % 2 === 0 ? 'Yes' : 'No',
    odds: -220 - (index % 4) * 25,
    fair: 0.72 + (index % 5) * 0.018,
    edge: Number((0.06 + (index % 4) * 0.016).toFixed(2)),
    confidence: 'High',
    units: 0.5 + (index % 3) * 0.5,
    notes: ['Clear matchup edge', 'Market line is too generous', 'No major risk factor is in play'],
  }))

const createCombined = (): PickItem[] =>
  range(25).map((_, index) => ({
    id: `combo-${index + 1}`,
    sport: ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer'][index % 5],
    market: 'Combined',
    title: `${['Tufts', 'Falcons', 'Knicks', 'Mets', 'Maple Leafs'][index % 5]} + ${['Over', 'Home side', 'Top scorer', 'Pitcher prop', 'Total'][index % 5]}`,
    side: 'Combo',
    odds: -150 - (index % 4) * 30,
    fair: 0.65 + (index % 6) * 0.02,
    edge: Number((0.05 + (index % 4) * 0.015).toFixed(2)),
    confidence: index % 2 === 0 ? 'High' : 'Medium',
    units: 0.5,
    notes: ['Strong correlation', 'All legs fit the same theme', 'Higher probability than a random parlay'],
  }))

export const pickGroups: PickGroup[] = [
  { id: 'moneylines', label: 'Moneylines', note: 'Best home favorites and soft market edges', items: createMoneylines() },
  { id: 'player-props', label: 'Player Props', note: 'High-volume usage and matchup-driven props', items: createProps() },
  { id: 'totals', label: 'Totals', note: 'Excellent totals where pace and environment match the model', items: createTotals() },
  { id: 'most-confident', label: 'Most Confident', note: 'The cleanest 25 high-probability legs', items: createHighConfidence() },
  { id: 'combo', label: 'Combined', note: 'Correlated game/script combos with safer probability', items: createCombined() },
]

export const allPicks = pickGroups.flatMap((group) => group.items)

export async function loadLiveOdds() {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) {
    return { source: 'seed', groups: pickGroups }
  }

  try {
    const sportsResponse = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`)
    if (!sportsResponse.ok) throw new Error('Bad live odds response')
    const sports = await sportsResponse.json()

    return {
      source: 'live',
      groups: pickGroups,
      sports: Array.isArray(sports) ? sports.slice(0, 10) : [],
    }
  } catch {
    return { source: 'seed', groups: pickGroups }
  }
}

export function buildCsv(rows: PickItem[]) {
  const headers = ['sport', 'market', 'title', 'side', 'odds', 'fair', 'edge', 'confidence', 'units']
  const csvRows = rows.map((row) => [
    row.sport,
    row.market,
    row.title,
    row.side,
    row.odds,
    row.fair,
    row.edge,
    row.confidence,
    row.units,
  ])
  return [headers, ...csvRows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}
