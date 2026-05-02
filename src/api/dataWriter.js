// Writes data to Supabase PostgreSQL.
// Function signatures are kept identical to the old GitHub/Octokit version
// so all admin pages work without changes.
// No more SHA conflicts, no base64, no retries — Supabase handles concurrency.

import { supabase } from '../lib/supabase'

// ── Computed fields that live only in the player_balances VIEW ─────────────
const COMPUTED_PLAYER_FIELDS = ['corpus_balance', 'total_paid', 'total_deducted', 'balance_status']

function stripComputed(player) {
  const row = { ...player }
  COMPUTED_PLAYER_FIELDS.forEach(f => delete row[f])
  return row
}

// ── Audit log helper ───────────────────────────────────────────────────────
async function appendAudit(action, entityType, entityId, summary, before, after) {
  const { data: { session } } = await supabase.auth.getSession()
  const actor = session?.user?.email ?? 'unknown'
  const isAdmin = session?.user?.user_metadata?.is_admin === true
  await supabase.from('audit_log').insert({
    id: `AUD_${Date.now()}`,
    actor,
    actor_role: isAdmin ? 'admin' : 'user',
    action,
    entity_type: entityType,
    entity_id: String(entityId ?? ''),
    summary,
    before_state: before ?? null,
    after_state: after ?? null,
  })
  // Audit failures must not block the main write — errors are swallowed here.
}

// ── Batch upsert with chunking (Supabase max ~500 rows/request) ─────────────
async function batchUpsert(table, rows, opts = {}) {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), opts)
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
}

// ── Sync helper: upsert all rows, delete rows not in new set ────────────────
async function syncTable(table, rows, pkField) {
  if (rows.length > 0) await batchUpsert(table, rows)
  // Find and delete rows that were removed
  const { data: existing, error: fetchErr } = await supabase.from(table).select(pkField)
  if (fetchErr) throw new Error(`${table} sync fetch: ${fetchErr.message}`)
  const newIds = new Set(rows.map(r => r[pkField]))
  const toDelete = (existing ?? []).filter(r => !newIds.has(r[pkField])).map(r => r[pkField])
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in(pkField, toDelete)
    if (error) throw new Error(`${table} sync delete: ${error.message}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Public write helpers — same signatures as the old dataWriter.js
// ══════════════════════════════════════════════════════════════════════════

export async function writePlayers(players, auditAction, entityId, summary, before, after) {
  const rows = players.map(stripComputed)
  await batchUpsert('players', rows)
  await appendAudit(auditAction ?? 'update_player', 'player', entityId, summary, before, after)
}

export async function writeWeeks(weeks, auditAction, summary) {
  // Upsert only — never bulk-delete here to avoid stale-cache races with CricHeroes sync.
  // Use deleteWeekById() for explicit week deletion.
  if (weeks.length > 0) await batchUpsert('weeks', weeks)
  await appendAudit(auditAction ?? 'update_week', 'week', null, summary, null, null)
}

export async function deleteWeekById(weekId, label) {
  // Soft delete — marks status='deleted' so data is recoverable.
  // Using UPDATE+select() lets us detect silent RLS failures (0 rows = blocked).
  const { data, error } = await supabase
    .from('weeks')
    .update({ status: 'deleted' })
    .eq('week_id', weekId)
    .select('week_id')
  if (error) throw new Error(`weeks delete: ${error.message}`)
  if (!data || data.length === 0)
    throw new Error('Delete was blocked — admin permissions required. Log out and log back in.')
  await appendAudit('delete_week', 'week', weekId, `Deleted match ${label}`, null, null)
}

export async function softDeleteTransactions(ids, summary) {
  if (!ids || ids.length === 0) return
  const { error } = await supabase.from('transactions').delete().in('id', ids)
  if (error) throw new Error(`transactions delete: ${error.message}`)
  // Verify at least one row was actually removed — RLS silently returns 0 rows when blocked
  const { data: remaining } = await supabase.from('transactions').select('id').in('id', ids)
  if (remaining && remaining.length === ids.length)
    throw new Error('Delete was blocked — admin permissions required. Log out and log back in.')
  await appendAudit('delete_transactions', 'transaction', null,
    summary ?? `Deleted ${ids.length} transactions`, null, null)
}

export async function writeAttendance(records, summary) {
  // Upsert all; orphaned records for deleted weeks are removed by ON DELETE CASCADE
  if (records.length > 0) {
    await batchUpsert('attendance', records, { onConflict: 'player_id,week_id' })
  }
  await appendAudit('mark_attendance', 'attendance', null, summary, null, null)
}

export async function writeTransactions(transactions, auditAction, entityId, summary, before, after) {
  // Transactions are append-only (reversals add a new record, never delete)
  await batchUpsert('transactions', transactions)
  await appendAudit(auditAction ?? 'update_transaction', 'transaction', entityId, summary, before, after)
}

export async function writeExpenses(expenses, auditAction, summary) {
  await syncTable('expenses', expenses, 'id')
  await appendAudit(auditAction ?? 'update_expense', 'expense', null, summary, null, null)
}

export async function writeGuestVisits(visits, summary) {
  await syncTable('guest_visits', visits, 'id')
  await appendAudit('add_guest', 'guest', null, summary, null, null)
}

export async function writeCricHeroesMapping(mapping, summary) {
  const { error } = await supabase
    .from('cricheroes_mapping')
    .upsert({ id: 1, mapping, updated_at: new Date().toISOString() })
  if (error) throw new Error(`cricheroes_mapping upsert: ${error.message}`)
}

export async function updateConfig(patch, summary) {
  const { error } = await supabase.from('config').update(patch).eq('id', 1)
  if (error) throw new Error(`config update: ${error.message}`)
  await appendAudit('update_config', 'config', null, summary ?? 'Config updated', null, patch)
}

export async function writeTournaments(data, auditAction, summary) {
  const tournaments = Array.isArray(data) ? data : (data?.tournaments ?? [data])
  await batchUpsert('tournaments', tournaments)
  await appendAudit(auditAction ?? 'update_tournament', 'tournament', null, summary, null, null)
}

export async function writeAnnouncements(data, summary) {
  const announcements = Array.isArray(data) ? data : (data?.announcements ?? [])
  await syncTable('announcements', announcements, 'id')
  await appendAudit('update_announcements', 'announcement', null, summary, null, null)
}

export async function writePaymentRequests(requests, summary) {
  const rows = Array.isArray(requests) ? requests : (requests?.requests ?? [])
  // Upsert only — never delete payment requests (concurrent submissions must be preserved).
  if (rows.length > 0) await batchUpsert('payment_requests', rows)
}

// triggerCricHeroesSync no longer needed — sync is triggered via GitHub Actions workflow_dispatch
// Kept as a no-op stub to avoid import errors in any code that still references it
export async function triggerCricHeroesSync() {
  console.warn('triggerCricHeroesSync: CricHeroes sync is now triggered via GitHub Actions workflow_dispatch')
}
