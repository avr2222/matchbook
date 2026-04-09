// Reads JSON data files.
// On localhost (dev or local preview): reads from /matchbook/data/ served statically.
// On GitHub Pages: reads from raw.githubusercontent.com for always-fresh data.

function isLocal() {
  return typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
}

let _config = null

export async function fetchConfig() {
  if (_config) return _config
  const res = await fetch('/matchbook/data/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load config.json')
  _config = await res.json()
  return _config
}

function rawUrl(config, filename) {
  if (isLocal()) return `/matchbook/data/${filename}`
  return `https://raw.githubusercontent.com/${config.repo_owner}/${config.repo_name}/${config.data_branch}/public/data/${filename}`
}

export async function fetchData(filename) {
  const config = await fetchConfig()
  const url = rawUrl(config, filename)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`)
  return res.json()
}

export const fetchPlayers     = () => fetchData('players.json')
export const fetchWeeks       = () => fetchData('weeks.json')
export const fetchAttendance  = () => fetchData('attendance.json')
export const fetchTransactions= () => fetchData('transactions.json')
export const fetchExpenses    = () => fetchData('expenses.json')
export const fetchGuestVisits = () => fetchData('guest_visits.json')
export const fetchTournaments = () => fetchData('tournaments.json')
export const fetchUsers       = () => fetchData('users.json')
export const fetchAuditLog    = () => fetchData('audit_log.json')
export const fetchCricHeroesMapping = () => fetchData('cricheroes_mapping.json')
