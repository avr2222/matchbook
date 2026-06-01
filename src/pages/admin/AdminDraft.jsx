import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useConfig, useTournaments, useLeaderboard, useSeasonSquads } from '../../hooks/useData'
import { writePlayerRoles, writeSeasonSquads, revealSquadRow, resetSquadReveal, deleteSeasonSquads } from '../../api/dataWriter'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { PageSpinner } from '../../components/ui/Spinner'
import { showToast } from '../../components/ui/Toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'batsman',    label: 'Batsman',          icon: '🏏', stat: 'runs' },
  { value: 'batting_ar', label: 'Batting AR',        icon: '🔄', stat: 'runs' },
  { value: 'bat_wk',    label: 'Wicket Keeper',     icon: '🧤', stat: 'runs' },
  { value: 'bowling_ar', label: 'Bowling AR',        icon: '🎳', stat: 'wickets' },
]

const REVEAL_GROUP_ORDER = ['bat_wk', 'batsman', 'batting_ar', 'bowling_ar', 'umpire', 'captain']

const REVEAL_GROUP_LABELS = {
  bat_wk:    { label: 'Wicket Keepers', icon: '🧤' },
  batsman:   { label: 'Batsmen',         icon: '🏏' },
  batting_ar:{ label: 'Batting All Rounders', icon: '🔄' },
  bowling_ar:{ label: 'Bowling All Rounders', icon: '🎳' },
  umpire:    { label: 'Umpires',          icon: '🕵️' },
  captain:   { label: 'Captains',         icon: '👑' },
}

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminDraft() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()

  const { data: pData, isLoading: pLoading } = usePlayers()
  const { data: cfg } = useConfig()
  const { data: tData } = useTournaments()
  const activeTournamentId = cfg?.active_tournament_id

  // Aggregate last-season performance per player
  const { data: perfData } = useLeaderboard(activeTournamentId)

  const { data: existingSquads } = useSeasonSquads(activeTournamentId)

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [revealing, setRevealing] = useState(false)

  // Local role edits: { [player_id]: role }
  const [roleEdits, setRoleEdits] = useState({})

  // Squad rows local state: { [player_id]: squadRow }
  const [squad, setSquad] = useState({})

  // Captain draw animation state per team
  const [captainSpin, setCaptainSpin] = useState({ A: null, B: null }) // null | 'spinning' | 'done'
  const [captainDisplay, setCaptainDisplay] = useState({ A: '', B: '' })
  const spinRef = useRef({})

  const activeTournament = tData?.tournaments?.find(t => t.id === activeTournamentId)

  // Derive active corpus/ppm/new players
  const players = (pData?.players ?? []).filter(p => p.status === 'active' && p.type !== 'guest')

  // Build perf map
  const perfMap = {}
  for (const p of (perfData?.performances ?? [])) {
    if (!perfMap[p.player_id]) perfMap[p.player_id] = { runs: 0, wickets: 0 }
    perfMap[p.player_id].runs    += p.runs    || 0
    perfMap[p.player_id].wickets += p.wickets || 0
  }

  // Load existing squads into local state on mount
  useEffect(() => {
    if (!existingSquads) return
    const map = {}
    for (const row of existingSquads) {
      map[row.player_id] = row
    }
    setSquad(map)
  }, [existingSquads])

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getRole = (pid) => roleEdits[pid] ?? players.find(p => p.id === pid)?.player_role ?? ''

  const getSquadRow = (pid) => squad[pid] ?? null

  const squadList = Object.values(squad)
  const teamA = squadList.filter(r => r.team === 'A')
  const teamB = squadList.filter(r => r.team === 'B')

  // Resolve display name from player id
  const pMap = Object.fromEntries(players.map(p => [p.id, p]))

  // ── Step 1: Save roles ────────────────────────────────────────────────────

  async function saveRoles() {
    const dirty = Object.entries(roleEdits)
    if (dirty.length === 0) { showToast('No changes to save'); return }
    setSaving(true)
    try {
      await writePlayerRoles(Object.fromEntries(dirty))
      await qc.invalidateQueries({ queryKey: ['players'] })
      setRoleEdits({})
      showToast(`Saved roles for ${dirty.length} player(s)`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Step 2: Auto-balance ──────────────────────────────────────────────────

  function autoBalance() {
    const newSquad = {}
    for (const role of ROLES) {
      const group = players.filter(p => getRole(p.id) === role.value)
      const sorted = [...group].sort((a, b) => {
        const pa = perfMap[a.id] ?? {}
        const pb = perfMap[b.id] ?? {}
        const statA = role.stat === 'wickets' ? (pa.wickets ?? 0) : (pa.runs ?? 0)
        const statB = role.stat === 'wickets' ? (pb.wickets ?? 0) : (pb.runs ?? 0)
        return statB - statA
      })
      sorted.forEach((p, i) => {
        newSquad[p.id] = {
          ...getSquadRow(p.id),
          id: `SQUAD_${activeTournamentId}_${p.id}`,
          tournament_id: activeTournamentId,
          player_id: p.id,
          team: i % 2 === 0 ? 'A' : 'B',
          reveal_group: role.value,
          is_captain: false,
          is_umpire: false,
        }
      })
    }
    // Keep players with no role assigned as unassigned (keep existing assignment if any)
    for (const p of players) {
      if (!newSquad[p.id] && getSquadRow(p.id)) {
        newSquad[p.id] = getSquadRow(p.id)
      }
    }
    setSquad(newSquad)
    showToast('Teams balanced based on last-season performance')
  }

  function toggleTeam(pid, team) {
    const role = getRole(pid)
    setSquad(prev => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        id: `SQUAD_${activeTournamentId}_${pid}`,
        tournament_id: activeTournamentId,
        player_id: pid,
        team,
        reveal_group: prev[pid]?.reveal_group ?? role ?? null,
        is_captain: false,
        is_umpire: false,
        captain_interest: prev[pid]?.captain_interest ?? false,
        umpire_interest:  prev[pid]?.umpire_interest  ?? false,
      },
    }))
  }

  // ── Step 3: Captain interest + draw ──────────────────────────────────────

  function toggleCaptainInterest(pid) {
    setSquad(prev => ({
      ...prev,
      [pid]: { ...prev[pid], captain_interest: !(prev[pid]?.captain_interest) },
    }))
  }

  function drawCaptain(team) {
    const pool = squadList.filter(r => r.team === team && r.captain_interest && !r.is_captain)
    if (pool.length === 0) { showToast('No captain candidates for this team', 'error'); return }

    const chosen = pool[Math.floor(Math.random() * pool.length)]
    const names  = pool.map(r => pMap[r.player_id]?.display_name ?? r.player_id)

    setCaptainSpin(prev => ({ ...prev, [team]: 'spinning' }))
    let iterations = 0
    const maxIter = 25

    function spin() {
      if (iterations >= maxIter) {
        setCaptainDisplay(prev => ({ ...prev, [team]: pMap[chosen.player_id]?.display_name ?? '' }))
        setCaptainSpin(prev => ({ ...prev, [team]: 'done' }))
        setSquad(prev => {
          const next = { ...prev }
          // Clear previous captain for this team
          for (const row of Object.values(next)) {
            if (row.team === team) next[row.player_id] = { ...row, is_captain: false }
          }
          next[chosen.player_id] = { ...next[chosen.player_id], is_captain: true, reveal_group: 'captain' }
          return next
        })
        return
      }
      const delay = iterations < 15 ? 80 : iterations < 21 ? 150 : 300
      setCaptainDisplay(prev => ({ ...prev, [team]: names[iterations % names.length] }))
      iterations++
      spinRef.current[team] = setTimeout(spin, delay)
    }
    spin()
  }

  // ── Step 4: Umpire interest + distribute ─────────────────────────────────

  function toggleUmpireInterest(pid) {
    setSquad(prev => ({
      ...prev,
      [pid]: { ...prev[pid], umpire_interest: !(prev[pid]?.umpire_interest) },
    }))
  }

  function distributeUmpires() {
    const pool = shuffle(squadList.filter(r => r.umpire_interest))
    if (pool.length === 0) { showToast('No umpire candidates marked', 'error'); return }
    const half = Math.ceil(pool.length / 2)
    setSquad(prev => {
      const next = { ...prev }
      // Clear old umpire flags
      for (const row of Object.values(next)) {
        next[row.player_id] = { ...row, is_umpire: false }
      }
      pool.forEach((row, i) => {
        const assignedTeam = i < half ? 'A' : 'B'
        next[row.player_id] = {
          ...next[row.player_id],
          team: assignedTeam,
          is_umpire: true,
          reveal_group: 'umpire',
        }
      })
      return next
    })
    showToast(`Distributed ${pool.length} umpire(s): ${half} to Team A, ${pool.length - half} to Team B`)
  }

  // ── Step 5: Save draft order + publish ───────────────────────────────────

  function buildOrderedRows(publishFlag) {
    const rows = []
    let order = 1
    for (const group of REVEAL_GROUP_ORDER) {
      const groupRows = squadList.filter(r => r.reveal_group === group)
      // Alternate A/B within each group
      const byTeam = { A: groupRows.filter(r => r.team === 'A'), B: groupRows.filter(r => r.team === 'B') }
      const maxLen = Math.max(byTeam.A.length, byTeam.B.length)
      for (let i = 0; i < maxLen; i++) {
        if (byTeam.A[i]) rows.push({ ...byTeam.A[i], draft_order: order++, published: publishFlag, revealed: false })
        if (byTeam.B[i]) rows.push({ ...byTeam.B[i], draft_order: order++, published: publishFlag, revealed: false })
      }
    }
    // Players with no reveal_group go at the end
    for (const row of squadList) {
      if (!row.reveal_group || !REVEAL_GROUP_ORDER.includes(row.reveal_group)) {
        rows.push({ ...row, draft_order: order++, published: publishFlag, revealed: false })
      }
    }
    return rows
  }

  async function saveDraft() {
    setSaving(true)
    try {
      const rows = buildOrderedRows(false)
      await writeSeasonSquads(rows, 'Saved draft (unpublished)')
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      showToast('Draft saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function publishDraft() {
    setSaving(true)
    try {
      const rows = buildOrderedRows(true)
      await writeSeasonSquads(rows, 'Published season draft')
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      showToast('Draft published — /teams page is now live')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function startReveal() {
    const rows = (existingSquads ?? []).filter(r => r.published).sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
    if (rows.length === 0) { showToast('Publish the draft first', 'error'); return }

    // Reset all revealed flags first
    setRevealing(true)
    try {
      await resetSquadReveal(activeTournamentId)
      await qc.invalidateQueries({ queryKey: ['season_squads'] })

      let prevGroup = null
      for (const row of rows) {
        if (row.reveal_group !== prevGroup) {
          // Extra pause for group transition (especially captain)
          await new Promise(r => setTimeout(r, row.reveal_group === 'captain' ? 2000 : 1200))
          prevGroup = row.reveal_group
        }
        await revealSquadRow(row.id)
        const delay = row.reveal_group === 'captain' ? 1800 : 800
        await new Promise(r => setTimeout(r, delay))
      }
      showToast('Reveal complete!')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setRevealing(false)
    }
  }

  async function clearDraft() {
    if (!window.confirm('Clear all squad assignments for this tournament?')) return
    setSaving(true)
    try {
      await deleteSeasonSquads(activeTournamentId)
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      setSquad({})
      showToast('Draft cleared')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / guard ───────────────────────────────────────────────────────

  if (pLoading) return <PageSpinner />
  if (!isAdmin) return <div className="text-gray-400 p-4">Admin access required.</div>
  if (!activeTournamentId) return <div className="text-gray-400 p-4">No active tournament set in Settings.</div>

  const isPublished = squadList.some(r => r.published)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-medium text-white">Season Draft</h1>
          <p className="text-sm text-gray-400 mt-0.5">{activeTournament?.name ?? activeTournamentId}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isPublished && (
            <span className="text-xs bg-emerald-900/30 border border-emerald-700/30 text-emerald-400 px-3 py-1.5 rounded-full font-medium">
              ✓ Published
            </span>
          )}
          <button onClick={clearDraft} disabled={saving} className="btn-secondary text-xs">
            Clear Draft
          </button>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { n: 1, label: 'Roles' },
          { n: 2, label: 'Team Split' },
          { n: 3, label: 'Captains' },
          { n: 4, label: 'Umpires' },
          { n: 5, label: 'Publish & Reveal' },
        ].map(({ n, label }) => (
          <button
            key={n}
            onClick={() => setStep(n)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              step === n
                ? 'bg-[#10b981] text-white'
                : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.07] hover:text-gray-200'
            }`}
          >
            {n}. {label}
          </button>
        ))}
      </div>

      {/* ── Step 1: Role Assignment ── */}
      {step === 1 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white">Assign Player Roles</h2>
            <button onClick={saveRoles} disabled={saving || Object.keys(roleEdits).length === 0} className="btn-primary text-sm">
              {saving ? 'Saving…' : `Save ${Object.keys(roleEdits).length > 0 ? `(${Object.keys(roleEdits).length})` : 'Roles'}`}
            </button>
          </div>
          <p className="text-xs text-gray-400">Set each player's cricket role. This is saved permanently and reused across seasons.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="pb-2 pr-4">Player</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Last Season Runs</th>
                  <th className="pb-2">Last Season Wickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {players.map(p => {
                  const perf = perfMap[p.id] ?? {}
                  const currentRole = getRole(p.id)
                  const isDirty = roleEdits[p.id] !== undefined
                  return (
                    <tr key={p.id} className={isDirty ? 'bg-emerald-900/10' : ''}>
                      <td className="py-2.5 pr-4 text-gray-100 font-medium">{p.display_name}</td>
                      <td className="py-2.5 pr-4">
                        <select
                          className="input text-xs py-1.5"
                          value={currentRole}
                          onChange={e => setRoleEdits(prev => ({ ...prev, [p.id]: e.target.value || null }))}
                        >
                          <option value="">— Unassigned —</option>
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 pr-4 text-amber-300 tabular-nums">{perf.runs ?? 0}</td>
                      <td className="py-2.5 text-cyan-300 tabular-nums">{perf.wickets ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => setStep(2)} className="btn-primary text-sm w-full mt-2">
            Next: Team Split →
          </button>
        </div>
      )}

      {/* ── Step 2: Team Split ── */}
      {step === 2 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-medium text-white">Assign Players to Teams</h2>
            <div className="flex gap-2">
              <button onClick={autoBalance} className="btn-secondary text-sm">⚖️ Auto-Balance</button>
              <button onClick={saveDraft} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>

          {/* Team count pills */}
          <div className="flex gap-4">
            <span className="bg-amber-900/20 border border-amber-700/30 text-amber-300 text-xs px-3 py-1.5 rounded-full font-medium">
              Team A: {teamA.length} players
            </span>
            <span className="bg-blue-900/20 border border-blue-700/30 text-blue-300 text-xs px-3 py-1.5 rounded-full font-medium">
              Team B: {teamB.length} players
            </span>
          </div>

          {/* Group by role */}
          {ROLES.map(role => {
            const group = players.filter(p => getRole(p.id) === role.value)
            if (group.length === 0) return null
            return (
              <div key={role.value}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{role.icon} {role.label}</p>
                <div className="space-y-1">
                  {group.map(p => {
                    const sq = getSquadRow(p.id)
                    const perf = perfMap[p.id] ?? {}
                    const statVal = role.stat === 'wickets' ? perf.wickets : perf.runs
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-1.5">
                        <span className="text-sm text-gray-100 flex-1 min-w-0 truncate">{p.display_name}</span>
                        <span className="text-xs text-gray-500 tabular-nums w-14 text-right">
                          {role.stat === 'wickets' ? `${statVal ?? 0}w` : `${statVal ?? 0}r`}
                        </span>
                        <div className="flex rounded-lg overflow-hidden border border-white/10 shrink-0">
                          {['A', 'B'].map(t => (
                            <button
                              key={t}
                              onClick={() => toggleTeam(p.id, t)}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${
                                sq?.team === t
                                  ? t === 'A' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                  : 'text-gray-400 hover:bg-white/[0.07]'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Unassigned players */}
          {(() => {
            const unassigned = players.filter(p => !getRole(p.id))
            if (unassigned.length === 0) return null
            return (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">⚠️ No Role Assigned</p>
                <div className="space-y-1">
                  {unassigned.map(p => {
                    const sq = getSquadRow(p.id)
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-1.5">
                        <span className="text-sm text-gray-400 flex-1 truncate">{p.display_name}</span>
                        <div className="flex rounded-lg overflow-hidden border border-white/10">
                          {['A', 'B'].map(t => (
                            <button
                              key={t}
                              onClick={() => toggleTeam(p.id, t)}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${
                                sq?.team === t
                                  ? t === 'A' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                  : 'text-gray-400 hover:bg-white/[0.07]'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          <button onClick={() => setStep(3)} className="btn-primary text-sm w-full">Next: Captains →</button>
        </div>
      )}

      {/* ── Step 3: Captain Draw ── */}
      {step === 3 && (
        <div className="card space-y-6">
          <h2 className="font-medium text-white">Captain Selection</h2>
          <p className="text-xs text-gray-400">Mark players interested in captaincy, then draw randomly — equal probability for each candidate.</p>

          {['A', 'B'].map(team => {
            const teamPlayers = squadList.filter(r => r.team === team)
            const candidates  = teamPlayers.filter(r => r.captain_interest)
            const captain     = teamPlayers.find(r => r.is_captain)
            const spinning    = captainSpin[team] === 'spinning'
            const done        = captainSpin[team] === 'done'
            return (
              <div key={team} className={`rounded-xl border p-4 space-y-3 ${
                team === 'A' ? 'bg-amber-900/10 border-amber-700/20' : 'bg-blue-900/10 border-blue-700/20'
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold ${team === 'A' ? 'text-amber-300' : 'text-blue-300'}`}>
                    Team {team}
                  </h3>
                  <button
                    onClick={() => drawCaptain(team)}
                    disabled={candidates.length === 0 || spinning}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      candidates.length === 0
                        ? 'text-gray-500 bg-white/[0.03] cursor-not-allowed'
                        : team === 'A'
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-700/30'
                          : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-700/30'
                    }`}
                  >
                    🎲 Draw Captain
                  </button>
                </div>

                {/* Slot machine display */}
                <div className={`rounded-lg px-4 py-3 text-center min-h-[52px] flex items-center justify-center transition-all ${
                  done ? 'bg-white/[0.08] border border-white/10' : 'bg-white/[0.03]'
                }`}>
                  {spinning || done ? (
                    <div>
                      <p className={`text-lg font-bold tabular-nums ${spinning ? 'opacity-60' : 'text-white'}`}>
                        {captainDisplay[team] || '…'}
                      </p>
                      {done && <p className="text-xs text-emerald-400 mt-0.5">👑 Captain Selected!</p>}
                    </div>
                  ) : captain ? (
                    <div>
                      <p className="text-white font-bold">👑 {pMap[captain.player_id]?.display_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Current captain — draw again to change</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Mark candidates and draw</p>
                  )}
                </div>

                {/* Candidate list */}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {teamPlayers.map(row => {
                    const p = pMap[row.player_id]
                    if (!p) return null
                    return (
                      <label key={row.player_id} className="flex items-center gap-2.5 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!row.captain_interest}
                          onChange={() => toggleCaptainInterest(row.player_id)}
                          className="w-4 h-4 accent-[#10b981]"
                        />
                        <span className="text-sm text-gray-200">{p.display_name}</span>
                        {row.is_captain && <span className="text-xs text-amber-400 font-medium">👑 Captain</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <button onClick={() => setStep(4)} className="btn-primary text-sm w-full">Next: Umpires →</button>
        </div>
      )}

      {/* ── Step 4: Umpire Distribution ── */}
      {step === 4 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white">Umpire Selection</h2>
            <button onClick={distributeUmpires} className="btn-secondary text-sm">
              🎲 Distribute Umpires
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Mark players willing to umpire. "Distribute" randomly splits them equally between teams (ceil/floor).
            Umpires are full team members — they play too.
          </p>

          {/* Show umpire distribution summary */}
          {(() => {
            const umpA = squadList.filter(r => r.is_umpire && r.team === 'A')
            const umpB = squadList.filter(r => r.is_umpire && r.team === 'B')
            if (umpA.length + umpB.length === 0) return null
            return (
              <div className="flex gap-4 text-xs">
                <span className="text-amber-300">Team A umpires: {umpA.length}</span>
                <span className="text-blue-300">Team B umpires: {umpB.length}</span>
              </div>
            )
          })()}

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {squadList.map(row => {
              const p = pMap[row.player_id]
              if (!p) return null
              return (
                <label key={row.player_id} className="flex items-center gap-2.5 py-1.5 cursor-pointer border-b border-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={!!row.umpire_interest}
                    onChange={() => toggleUmpireInterest(row.player_id)}
                    className="w-4 h-4 accent-[#10b981]"
                  />
                  <span className="text-sm text-gray-200 flex-1">{p.display_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    row.team === 'A'
                      ? 'bg-amber-900/20 text-amber-400'
                      : 'bg-blue-900/20 text-blue-400'
                  }`}>Team {row.team}</span>
                  {row.is_umpire && <span className="text-xs text-gray-400">🕵️ Umpire</span>}
                </label>
              )
            })}
          </div>
          <button onClick={() => setStep(5)} className="btn-primary text-sm w-full">Next: Publish & Reveal →</button>
        </div>
      )}

      {/* ── Step 5: Publish & Live Reveal ── */}
      {step === 5 && (
        <div className="space-y-4">

          {/* Team preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['A', 'B'].map(team => {
              const rows = REVEAL_GROUP_ORDER.flatMap(g =>
                squadList.filter(r => r.team === team && r.reveal_group === g)
              )
              const captain = squadList.find(r => r.team === team && r.is_captain)
              return (
                <div key={team} className={`card space-y-3 ${
                  team === 'A'
                    ? 'bg-amber-900/10 border border-amber-700/20'
                    : 'bg-blue-900/10 border border-blue-700/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${team === 'A' ? 'text-amber-300' : 'text-blue-300'}`}>
                      Team {team}
                    </h3>
                    <span className="text-xs text-gray-400">{rows.length} players</span>
                  </div>
                  {captain && (
                    <p className="text-xs text-gray-300">
                      👑 Captain: <strong>{pMap[captain.player_id]?.display_name}</strong>
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {REVEAL_GROUP_ORDER.map(g => {
                      const groupRows = rows.filter(r => r.reveal_group === g)
                      if (groupRows.length === 0) return null
                      return (
                        <div key={g}>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-2 mb-0.5">
                            {REVEAL_GROUP_LABELS[g]?.icon} {REVEAL_GROUP_LABELS[g]?.label}
                          </p>
                          {groupRows.map(r => (
                            <p key={r.player_id} className="text-sm text-gray-200 py-0.5">
                              {r.is_captain && '👑 '}
                              {r.is_umpire && '🕵️ '}
                              {pMap[r.player_id]?.display_name ?? r.player_id}
                            </p>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="card space-y-3">
            <h2 className="font-medium text-white">Publish & Reveal Controls</h2>

            <div className="flex gap-3 flex-wrap">
              <button onClick={saveDraft} disabled={saving} className="btn-secondary text-sm">
                {saving ? 'Saving…' : '💾 Save Draft'}
              </button>
              <button
                onClick={publishDraft}
                disabled={saving || squadList.length === 0}
                className="btn-primary text-sm"
              >
                {saving ? 'Publishing…' : isPublished ? '✓ Re-publish' : '📢 Publish'}
              </button>
            </div>

            {isPublished && (
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <p className="text-xs text-gray-400">
                  Share <code className="text-emerald-400">#/teams</code> with players — they'll see the live reveal when you click below.
                </p>
                <button
                  onClick={startReveal}
                  disabled={revealing}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white disabled:opacity-50"
                >
                  {revealing ? '🎬 Revealing…' : '▶ Start Live Reveal'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
