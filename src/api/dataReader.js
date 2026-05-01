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
  const players = playersRes.data.map(p => ({
    ...p,
    balance_status: calcBalanceStatus(p.corpus_balance ?? 0, cfg),
  }))
  return { schema_version: 1, players }
}

export async function fetchWeeks() {
  const { data, error } = await supabase
    .from('weeks')
    .select('*')
    .order('match_date', { ascending: false })
  if (error) throw new Error(`fetchWeeks: ${error.message}`)
  return { schema_version: 1, weeks: data }
}

export async function fetchAttendance() {
  const { data, error } = await supabase.from('attendance').select('*')
  if (error) throw new Error(`fetchAttendance: ${error.message}`)
  return { schema_version: 1, records: data }
}

export async function fetchTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw new Error(`fetchTransactions: ${error.message}`)
  return { schema_version: 1, transactions: data }
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

// Users are now managed by Supabase Auth — no separate users.json table.
// Return a stub so any remaining useUsers() calls don't crash.
export async function fetchUsers() {
  return { users: [] }
}
