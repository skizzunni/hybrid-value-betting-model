const BASE = 'https://api.the-odds-api.com/v4/sports'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API request failed with HTTP ${res.status}`)
  return res.json()
}

export const fetchOdds = (sportKey, apiKey) =>
  getJson(`${BASE}/${sportKey}/odds/?regions=us,eu&markets=h2h&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`)

export const fetchScores = (sportKey, apiKey) =>
  getJson(`${BASE}/${sportKey}/scores/?daysFrom=3&dateFormat=iso&apiKey=${apiKey}`)
