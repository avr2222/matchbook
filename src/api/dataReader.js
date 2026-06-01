// Reads data from Supabase PostgreSQL.
// All functions return the same shape as the old JSON-file readers
// so useData.js / admin pages require no changes.

import { supabase } from '../lib/supabase'
import { calcBalanceStatus } from '../utils/balanceCalculator'

export async function fetchConfig() {
  const { data, error } = await supabase
    .from('config')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw new Error(`fetchConfig: ${error.message}`)
  return data
}

// clearConfig() is a no-op with Supabase (no client-side cache to clear)
export function clearConfig() {}

export async function fetchPlayers() {
  const [playersRes, cfgRes] = await Promise.all([
    supabase.from('player_balances').select('*').order('display_name'),
    supabase.from('config').select('corpus_overdue_threshold,corpus_urgent_threshold,corpus_low_threshold').eq('id', 1).single(),
  ])
  if (playersRes.error) throw new Error(`fetchPlayers: ${playersRes.error.message}`)
  const cfg = cfgRes.data ?? {}
  const players = (playersRes.data ?? []).map(p => ({
    ...p,
    balance_status: (p.type === 'ppm' || p.type === 'guest')
      ? 'n/a'
      : calcBalanceStatus(p.corpus_balance ?? 0, cfg),
  }))
  return { schema_version: 1, players }
}

export async function fetchWeeks() {
  const { data, error } = await supabase
    .from('weeks')
    .select('*')
    .neq('status', 'deleted')
    .order('match_date', { ascending: false })
  if (error) throw new Error(`fetchWeeks: ${error.message}`)
  return { schema_version: 1, weeks: data }
}

export async function fetchAttendance() {
  // Supabase PostgREST hard-limits each request to 1000 rows.
  // A 30-player team with 35+ matches already exceeds 1000 attendance records,
  // so we paginate to ensure every row is fetched.
  const PAGE = 1000
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetchAttendance: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { schema_version: 1, records: all }
}

export async function fetchTransactions() {
  const PAGE = 1000
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetchTransactions: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { schema_version: 1, transactions: all }
}

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw new Error(`fetchExpenses: ${error.message}`)
  return { schema_version: 1, expenses: data }
}

export async function fetchGuestVisits() {
  const { data, error } = await supabase.from('guest_visits').select('*')
  if (error) throw new Error(`fetchGuestVisits: ${error.message}`)
  return { schema_version: 1, guest_visits: data }
}

export async function fetchTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) throw new Error(`fetchTournaments: ${error.message}`)
  // active_tournament_id comes from config in the new model
  return { schema_version: 1, tournaments: data, active_tournament_id: null }
}

export async function fetchAuditLog() {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500)
  if (error) throw new Error(`fetchAuditLog: ${error.message}`)
  return { schema_version: 1, entries: data }
}

export async function fetchCricHeroesMapping() {
  const { data, error } = await supabase
    .from('cricheroes_mapping')
    .select('mapping')
    .eq('id', 1)
    .single()
  if (error) throw new Error(`fetchCricHeroesMapping: ${error.message}`)
  return data?.mapping ?? {}
}

export async function fetchAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('posted_on', { ascending: false })
  if (error) throw new Error(`fetchAnnouncements: ${error.message}`)
  return { schema_version: 1, announcements: data }
}

export async function fetchPaymentRequests() {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`fetchPaymentRequests: ${error.message}`)
  return { schema_version: 1, requests: data }
}

export async function fetchMatchPerformances({ playerId, tournamentId } = {}) {
  let query = supabase.from('match_performances').select('*')
  if (playerId)     query = query.eq('player_id', playerId)
  if (tournamentId) query = query.eq('tournament_id', tournamentId)
  const { data, error } = await query
  if (error) throw new Error(`fetchMatchPerformances: ${error.message}`)
  return { schema_version: 1, performances: data ?? [] }
}

export async function fetchBallDeliveries(tournamentId) {
  const { data, error } = await supabase
    .from('ball_deliveries')
    .select('bowler_id,batsman_id,bowler_name,batsman_name,runs,extra_type,extra_runs,is_wicket,is_boundary,is_dot_ball,commentary,innings,batting_team,over_num,week_id,cricheroes_match_id')
    .eq('tournament_id', tournamentId)
  if (error) throw new Error(`fetchBallDeliveries: ${error.message}`)
  return data ?? []
}

export async function fetchSeasonSquads(tournamentId) {
  const { data, error } = await supabase
    .from('season_squads')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('draft_order', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`fetchSeasonSquads: ${error.message}`)
  return data ?? []
}

// Users are now managed by Supabase Auth — no separate users.json table.
// Return a stub so any remaining useUsers() calls don't crash.
export async function fetchUsers() {
  return { users: [] }
}
