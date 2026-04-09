// Writes JSON data files to GitHub via the Contents API (Octokit).
// Handles SHA conflict retries and appends to audit_log on every write.

import { Octokit } from '@octokit/rest'
import { fetchConfig, fetchData } from './dataReader'
import { useAuthStore } from '../store/authStore'

function getOctokit() {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('Not authenticated')
  return new Octokit({ auth: token })
}

async function getFileSha(octokit, config, path) {
  const { data } = await octokit.repos.getContent({
    owner: config.repo_owner,
    repo: config.repo_name,
    path,
    ref: config.data_branch,
  })
  return { sha: data.sha, content: JSON.parse(atob(data.content.replace(/\n/g, ''))) }
}

async function writeFile(octokit, config, path, content, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { sha } = await getFileSha(octokit, config, path)
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))))
      await octokit.repos.createOrUpdateFileContents({
        owner: config.repo_owner,
        repo: config.repo_name,
        path,
        message,
        content: encoded,
        sha,
        branch: config.data_branch,
      })
      return
    } catch (err) {
      if (err.status === 409 && attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * attempt))
        continue
      }
      throw err
    }
  }
}

async function appendAuditEntry(octokit, config, entry) {
  try {
    const { sha, content: log } = await getFileSha(octokit, config, 'public/data/audit_log.json')
    log.entries.unshift(entry) // newest first
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2))))
    await octokit.repos.createOrUpdateFileContents({
      owner: config.repo_owner,
      repo: config.repo_name,
      path: 'public/data/audit_log.json',
      message: `audit: ${entry.action} by ${entry.actor}`,
      content: encoded,
      sha,
      branch: config.data_branch,
    })
  } catch {
    // audit log failure should not block the main write
  }
}

function auditEntry(action, entityType, entityId, summary, before, after) {
  const auth = useAuthStore.getState()
  return {
    id: `AUD_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: auth.githubUsername || 'unknown',
    actor_role: auth.role || 'unknown',
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    before: before ?? null,
    after: after ?? null,
  }
}

// ── Public write helpers ───────────────────────────────────────────────────

export async function writePlayers(players, auditAction, entityId, summary, before, after) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, last_updated: new Date().toISOString(), players }
  await writeFile(octokit, config, 'public/data/players.json', payload, `${auditAction}: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry(auditAction, 'player', entityId, summary, before, after))
}

export async function writeWeeks(weeks, auditAction, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, weeks }
  await writeFile(octokit, config, 'public/data/weeks.json', payload, `weeks: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry(auditAction, 'week', null, summary, null, null))
}

export async function writeAttendance(records, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, last_updated: new Date().toISOString(), records }
  await writeFile(octokit, config, 'public/data/attendance.json', payload, `attendance: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry('mark_attendance', 'attendance', null, summary, null, null))
}

export async function writeTransactions(transactions, auditAction, entityId, summary, before, after) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, transactions }
  await writeFile(octokit, config, 'public/data/transactions.json', payload, `txn: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry(auditAction, 'transaction', entityId, summary, before, after))
}

export async function writeExpenses(expenses, auditAction, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, expenses }
  await writeFile(octokit, config, 'public/data/expenses.json', payload, `expense: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry(auditAction, 'expense', null, summary, null, null))
}

export async function writeGuestVisits(visits, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  const payload = { schema_version: 1, guest_visits: visits }
  await writeFile(octokit, config, 'public/data/guest_visits.json', payload, `guests: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry('add_guest', 'guest', null, summary, null, null))
}

export async function writeCricHeroesMapping(mapping, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  await writeFile(octokit, config, 'public/data/cricheroes_mapping.json', mapping, `mapping: ${summary}`)
}

export async function writeTournaments(data, auditAction, summary) {
  const config = await fetchConfig()
  const octokit = getOctokit()
  await writeFile(octokit, config, 'public/data/tournaments.json', data, `tournament: ${summary}`)
  await appendAuditEntry(octokit, config, auditEntry(auditAction, 'tournament', null, summary, null, null))
}

export async function triggerCricHeroesSync(config, token) {
  const octokit = new Octokit({ auth: token })
  await octokit.actions.createWorkflowDispatch({
    owner: config.repo_owner,
    repo: config.repo_name,
    workflow_id: 'sync-cricheroes.yml',
    ref: config.data_branch,
  })
}
