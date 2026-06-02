import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useConfig, useTournaments, useLeaderboard, useSeasonSquads, useAttendanceSummary, useWeeks } from '../../hooks/useData'
import { writePlayerRoles, writeSeasonSquads, revealSquadRow, resetSquadReveal, deleteSeasonSquads } from '../../api/dataWriter'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { PageSpinner } from '../../components/ui/Spinner'
import { showToast } from '../../components/ui/Toast'

// ── Constants ──────────────────────────────────────────────────────────────

const ATTEND_WEIGHT = 50  // max bonus score for 100% attendance

const ROLES = [
  { value: 'batsman',    label: 'Batsman',       icon: '🏏', stat: 'runs'    },
  { value: 'batting_ar', label: 'Batting AR',     icon: '🔄', stat: 'runs'    },
  { value: 'bat_wk',    label: 'Wicket Keeper',  icon: '🧤', stat: 'runs'    },
  { value: 'bowling_ar', label: 'Bowling AR',     icon: '🎳', stat: 'wickets' },
]

const REVEAL_GROUP_ORDER   = ['bat_wk', 'batsman', 'batting_ar', 'bowling_ar', 'umpire', 'captain']
const REVEAL_GROUP_LABELS  = {
  bat_wk:     { label: 'Wicket Keepers',       icon: '🧤' },
  batsman:    { label: 'Batsmen',               icon: '🏏' },
  batting_ar: { label: 'Batting All Rounders',  icon: '🔄' },
  bowling_ar: { label: 'Bowling All Rounders',  icon: '🎳' },
  umpire:     { label: 'Umpires',               icon: '🕵️' },
  captain:    { label: 'Captains',              icon: '👑' },
}

function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminDraft() {
  const isAdmin = useIsAdmin()
  const qc      = useQueryClient()

  const { data: pData, isLoading: pLoading } = usePlayers()
  const { data: cfg }   = useConfig()
  const { data: tData } = useTournaments()
  const activeTournamentId = cfg?.active_tournament_id

  const { data: perfData }       = useLeaderboard(activeTournamentId)
  const { data: existingSquads } = useSeasonSquads(activeTournamentId)
  const { data: attendRows }     = useAttendanceSummary(activeTournamentId)
  const { data: weeksData }      = useWeeks()

  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)
  const [revealing, setRevealing] = useState(false)

  const [roleEdits, setRoleEdits] = useState({})        // { player_id: role }
  const [squad, setSquad]         = useState({})         // { player_id: squadRow }
  const [oppositePairs, setOppositePairs] = useState([]) // [{ a, b }]
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')

  const activeTournament = tData?.tournaments?.find(t => t.id === activeTournamentId)
  const players = (pData?.players ?? []).filter(p => p.status === 'active' && p.type !== 'guest')
  const pMap    = Object.fromEntries(players.map(p => [p.id, p]))

  // Performance totals per player
  const perfMap = {}
  for (const p of (perfData?.performances ?? [])) {
    if (!perfMap[p.player_id]) perfMap[p.player_id] = { runs: 0, wickets: 0 }
    perfMap[p.player_id].runs    += p.runs    || 0
    perfMap[p.player_id].wickets += p.wickets || 0
  }

  // Attendance map: { player_id: { attended, total } }
  const attendMap = useMemo(() => {
    const tournWeeks = (weeksData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId).length
    const map = {}
    for (const row of (attendRows ?? [])) {
      if (!map[row.player_id]) map[row.player_id] = { attended: 0, total: tournWeeks }
      if (row.status === 'present') map[row.player_id].attended++
    }
    return map
  }, [attendRows, weeksData, activeTournamentId])

  const getAttendRate = pid => {
    const a = attendMap[pid]
    return a && a.total > 0 ? a.attended / a.total : 0
  }

  // Composite score: performance stat + attendance bonus
  const playerScore = (pid, role) => {
    const perf = perfMap[pid] ?? {}
    const stat = role?.stat === 'wickets' ? (perf.wickets ?? 0) * 10 : (perf.runs ?? 0)
    return stat + getAttendRate(pid) * ATTEND_WEIGHT
  }

  // Persist opposite pairs per tournament
  useEffect(() => {
    if (!activeTournamentId) return
    try {
      const s = localStorage.getItem(`draft_pairs_${activeTournamentId}`)
      if (s) setOppositePairs(JSON.parse(s))
    } catch { /* ignore */ }
  }, [activeTournamentId])

  useEffect(() => {
    if (activeTournamentId)
      localStorage.setItem(`draft_pairs_${activeTournamentId}`, JSON.stringify(oppositePairs))
  }, [oppositePairs, activeTournamentId])

  // Load existing squads from DB
  useEffect(() => {
    if (!existingSquads) return
    const map = {}
    for (const r of existingSquads) map[r.player_id] = r
    setSquad(map)
  }, [existingSquads])

  // ── Helpers ────────────────────────────────────────────────────────────

  const getRole = pid => roleEdits[pid] ?? pMap[pid]?.player_role ?? ''
  const getRow  = pid => squad[pid] ?? null
  const squadList = Object.values(squad)
  const teamA = squadList.filter(r => r.team === 'A')
  const teamB = squadList.filter(r => r.team === 'B')

  const violations = oppositePairs.filter(p => {
    const rA = getRow(p.a), rB = getRow(p.b)
    return rA && rB && rA.team === rB.team
  })

  function newRow(pid, team, overrides = {}) {
    const role = getRole(pid)
    return {
      id: `SQUAD_${activeTournamentId}_${pid}`,
      tournament_id: activeTournamentId,
      player_id: pid,
      team,
      reveal_group: role || null,   // overridden later for captains/umpires
      is_captain: false,
      is_umpire: false,
      captain_interest: false,
      umpire_interest: false,
      published: false,
      revealed: false,
      ...getRow(pid),               // keep existing flags
      ...overrides,
    }
  }

  // ── Step 1: Save roles ─────────────────────────────────────────────────

  async function saveRoles() {
    const dirty = Object.entries(roleEdits)
    if (!dirty.length) { showToast('No changes'); return }
    setSaving(true)
    try {
      await writePlayerRoles(Object.fromEntries(dirty))
      await qc.invalidateQueries({ queryKey: ['players'] })
      setRoleEdits({})
      showToast(`Saved roles for ${dirty.length} player(s)`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // ── Step 2: Team assignment ────────────────────────────────────────────

  function toggleTeam(pid, team) {
    setSquad(prev => ({ ...prev, [pid]: newRow(pid, team, { team }) }))
  }

  function autoBalance() {
    const next = {}
    for (const role of ROLES) {
      const group = players.filter(p => getRole(p.id) === role.value)
      const sorted = [...group].sort((a, b) => playerScore(b.id, role) - playerScore(a.id, role))
      sorted.forEach((p, i) =>
        (next[p.id] = newRow(p.id, i % 2 === 0 ? 'A' : 'B'))
      )
    }
    // Enforce opposite pairs
    for (const pair of oppositePairs) {
      const rA = next[pair.a], rB = next[pair.b]
      if (rA && rB && rA.team === rB.team)
        next[pair.b] = { ...rB, team: rB.team === 'A' ? 'B' : 'A' }
    }
    // Preserve existing rows for unassigned-role players
    for (const p of players)
      if (!next[p.id] && getRow(p.id)) next[p.id] = getRow(p.id)

    setSquad(next)
    const fixed = oppositePairs.filter(p => {
      const rA = next[p.a], rB = next[p.b]
      return rA && rB && rA.team !== rB.team
    }).length
    showToast(`Teams balanced${fixed ? ` · ${fixed} pair(s) enforced` : ''}`)
  }

  function addPair() {
    if (!pairA || !pairB || pairA === pairB) { showToast('Pick two different players', 'error'); return }
    const exists = oppositePairs.some(p => (p.a === pairA && p.b === pairB) || (p.a === pairB && p.b === pairA))
    if (exists) { showToast('Pair already exists', 'error'); return }
    setOppositePairs(prev => [...prev, { a: pairA, b: pairB }])
    setPairA(''); setPairB('')
  }

  // ── Step 3: Captain & Umpire distribution ─────────────────────────────

  function toggleInterest(pid, field) {
    setSquad(prev => ({
      ...prev,
      [pid]: { ...newRow(pid, prev[pid]?.team ?? 'A'), ...prev[pid], [field]: !(prev[pid]?.[field] ?? false) },
    }))
  }

  // Priority rule for reveal_group: captain > umpire > primary cricket role
  function calcRevealGroup(row) {
    if (row.is_captain) return 'captain'
    if (row.is_umpire)  return 'umpire'
    return getRole(row.player_id) || null
  }

  function distribute(interestField, isField, label) {
    const volunteers = shuffled(squadList.filter(r => r[interestField]))
    if (!volunteers.length) { showToast(`No ${label} volunteers marked`, 'error'); return }

    const n = volunteers.length
    // For odd n, randomly decide which team gets the extra rather than always Team A
    const teamACount = n % 2 === 0
      ? n / 2
      : (Math.random() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2))
    const teamBCount = n - teamACount

    setSquad(prev => {
      const next = { ...prev }

      // Clear previous designations for this role, then recalculate reveal_group
      for (const r of Object.values(next)) {
        const cleared = { ...r, [isField]: false }
        next[r.player_id] = { ...cleared, reveal_group: calcRevealGroup(cleared) }
      }

      // First teamACount → Team A, rest → Team B
      volunteers.forEach((r, i) => {
        const updated = { ...next[r.player_id], team: i < teamACount ? 'A' : 'B', [isField]: true }
        next[r.player_id] = { ...updated, reveal_group: calcRevealGroup(updated) }
      })
      return next
    })
    showToast(`${label}: ${teamACount} → Team A, ${teamBCount} → Team B`)
  }

  // ── Step 4: Build ordered rows + publish/reveal ────────────────────────

  function buildRows(pub) {
    const rows = []
    let order = 1
    for (const g of REVEAL_GROUP_ORDER) {
      const group = squadList.filter(r => r.reveal_group === g)
      const byTeam = { A: group.filter(r => r.team === 'A'), B: group.filter(r => r.team === 'B') }
      const max = Math.max(byTeam.A.length, byTeam.B.length)
      for (let i = 0; i < max; i++) {
        if (byTeam.A[i]) rows.push({ ...byTeam.A[i], draft_order: order++, published: pub, revealed: false })
        if (byTeam.B[i]) rows.push({ ...byTeam.B[i], draft_order: order++, published: pub, revealed: false })
      }
    }
    for (const r of squadList)
      if (!r.reveal_group || !REVEAL_GROUP_ORDER.includes(r.reveal_group))
        rows.push({ ...r, draft_order: order++, published: pub, revealed: false })
    return rows
  }

  async function saveDraft() {
    setSaving(true)
    try {
      await writeSeasonSquads(buildRows(false), 'Saved draft')
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      showToast('Draft saved')
    } catch (e) { showToast(e.message, 'error') } finally { setSaving(false) }
  }

  async function publishDraft() {
    setSaving(true)
    try {
      await writeSeasonSquads(buildRows(true), 'Published draft')
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      showToast('Published — /teams is live')
    } catch (e) { showToast(e.message, 'error') } finally { setSaving(false) }
  }

  async function startReveal() {
    const rows = (existingSquads ?? []).filter(r => r.published).sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
    if (!rows.length) { showToast('Publish first', 'error'); return }
    setRevealing(true)
    try {
      await resetSquadReveal(activeTournamentId)
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      let prevGroup = null
      for (const row of rows) {
        if (row.reveal_group !== prevGroup) {
          await new Promise(r => setTimeout(r, row.reveal_group === 'captain' ? 2200 : 1200))
          prevGroup = row.reveal_group
        }
        await revealSquadRow(row.id)
        await new Promise(r => setTimeout(r, row.reveal_group === 'captain' ? 1800 : 800))
      }
      showToast('Reveal complete!')
    } catch (e) { showToast(e.message, 'error') } finally { setRevealing(false) }
  }

  async function clearDraft() {
    if (!window.confirm('Clear all squad assignments?')) return
    setSaving(true)
    try {
      await deleteSeasonSquads(activeTournamentId)
      await qc.invalidateQueries({ queryKey: ['season_squads'] })
      setSquad({})
      showToast('Draft cleared')
    } catch (e) { showToast(e.message, 'error') } finally { setSaving(false) }
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  if (pLoading)            return <PageSpinner />
  if (!isAdmin)            return <div className="text-gray-400 p-4">Admin access required.</div>
  if (!activeTournamentId) return <div className="text-gray-400 p-4">No active tournament in Settings.</div>

  const isPublished = squadList.some(r => r.published)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-medium text-white">Season Draft</h1>
          <p className="text-sm text-gray-400 mt-0.5">{activeTournament?.name ?? activeTournamentId}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {isPublished && (
            <span className="text-xs bg-emerald-900/30 border border-emerald-700/30 text-emerald-400 px-3 py-1.5 rounded-full font-medium">✓ Published</span>
          )}
          {violations.length > 0 && (
            <span className="text-xs bg-red-900/30 border border-red-700/30 text-red-400 px-3 py-1.5 rounded-full font-medium">
              ⚠ {violations.length} pair conflict{violations.length > 1 ? 's' : ''}
            </span>
          )}
          <button onClick={clearDraft} disabled={saving} className="btn-secondary text-xs">Clear</button>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { n: 1, label: 'Roles' },
          { n: 2, label: 'Team Split' },
          { n: 3, label: 'Captain & Umpire' },
          { n: 4, label: 'Publish & Reveal' },
        ].map(({ n, label }) => (
          <button key={n} onClick={() => setStep(n)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              step === n ? 'bg-[#10b981] text-white' : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.07] hover:text-gray-200'
            }`}
          >
            {n}. {label}
          </button>
        ))}
      </div>

      {/* ═══ STEP 1: Primary Cricket Roles ═══ */}
      {step === 1 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-white">Primary Cricket Roles</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Captain and Umpire are set separately in Step 3 — a player can be Batsman + Captain + Umpire.
              </p>
            </div>
            <button onClick={saveRoles} disabled={saving || !Object.keys(roleEdits).length} className="btn-primary text-sm shrink-0">
              {saving ? 'Saving…' : `Save${Object.keys(roleEdits).length ? ` (${Object.keys(roleEdits).length})` : ''}`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="pb-2 pr-4">Player</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Runs</th>
                  <th className="pb-2 pr-4">Wickets</th>
                  <th className="pb-2 pr-4">Attended</th>
                  <th className="pb-2">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {players.map(p => {
                  const perf = perfMap[p.id] ?? {}
                  const dirty = roleEdits[p.id] !== undefined
                  const att = attendMap[p.id]
                  const rate = getAttendRate(p.id)
                  const attColor = att ? (rate >= 0.8 ? 'text-emerald-400' : rate < 0.5 ? 'text-amber-400' : 'text-gray-300') : 'text-gray-600'
                  const joined = p.joined_date
                    ? new Date(p.joined_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                    : '—'
                  return (
                    <tr key={p.id} className={dirty ? 'bg-emerald-900/10' : ''}>
                      <td className="py-2.5 pr-4 text-gray-100 font-medium">{p.display_name}</td>
                      <td className="py-2.5 pr-4">
                        <select className="input text-xs py-1.5"
                          value={getRole(p.id)}
                          onChange={e => setRoleEdits(prev => ({ ...prev, [p.id]: e.target.value || null }))}
                        >
                          <option value="">— Unassigned —</option>
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 pr-4 text-amber-300 tabular-nums">{perf.runs ?? 0}</td>
                      <td className="py-2.5 pr-4 text-cyan-300 tabular-nums">{perf.wickets ?? 0}</td>
                      <td className={`py-2.5 pr-4 tabular-nums text-xs ${attColor}`}>
                        {att ? `${att.attended}/${att.total} (${Math.round(rate * 100)}%)` : '—'}
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">{joined}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => setStep(2)} className="btn-primary text-sm w-full">Next: Team Split →</button>
        </div>
      )}

      {/* ═══ STEP 2: Team Split + Opposite Pairs ═══ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-medium text-white">Assign to Teams</h2>
              <div className="flex gap-2">
                <button onClick={autoBalance} className="btn-secondary text-sm">⚖️ Auto-Balance</button>
                <button onClick={saveDraft} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="bg-amber-900/20 border border-amber-700/30 text-amber-300 text-xs px-3 py-1.5 rounded-full font-medium">A: {teamA.length}</span>
              <span className="bg-blue-900/20 border border-blue-700/30 text-blue-300 text-xs px-3 py-1.5 rounded-full font-medium">B: {teamB.length}</span>
            </div>

            {violations.length > 0 && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 text-xs text-red-300 space-y-0.5">
                <p className="font-semibold">⚠ Pair conflicts on the same team:</p>
                {violations.map((p, i) => (
                  <p key={i}>{pMap[p.a]?.display_name} &amp; {pMap[p.b]?.display_name}</p>
                ))}
                <p className="text-red-500 mt-0.5">Auto-Balance will fix these.</p>
              </div>
            )}

            {ROLES.map(role => {
              const group = players.filter(p => getRole(p.id) === role.value)
              if (!group.length) return null
              return (
                <div key={role.value}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{role.icon} {role.label}</p>
                  <div className="space-y-1">
                    {group.map(p => {
                      const sq = getRow(p.id)
                      const perf = perfMap[p.id] ?? {}
                      const inViolation = violations.some(v => v.a === p.id || v.b === p.id)
                      const rate2 = getAttendRate(p.id)
                      const attColor2 = rate2 >= 0.8 ? 'text-emerald-400' : rate2 < 0.5 ? 'text-amber-400' : 'text-gray-400'
                      return (
                        <div key={p.id} className={`flex items-center gap-3 py-1.5 rounded-lg px-1 ${inViolation ? 'bg-red-900/10' : ''}`}>
                          <span className="text-sm text-gray-100 flex-1 truncate">
                            {inViolation && <span className="text-red-400 mr-1">⚠</span>}
                            {p.display_name}
                            {sq?.is_captain && <span className="ml-1 text-[10px] text-amber-400">👑</span>}
                            {sq?.is_umpire  && <span className="ml-1 text-[10px] text-gray-400">🕵️</span>}
                          </span>
                          <span className={`text-[10px] tabular-nums shrink-0 ${attColor2}`}>
                            {Math.round(rate2 * 100)}%
                          </span>
                          <span className="text-xs text-gray-500 tabular-nums w-12 text-right shrink-0">
                            {role.stat === 'wickets' ? `${perf.wickets ?? 0}w` : `${perf.runs ?? 0}r`}
                          </span>
                          <div className="flex rounded-lg overflow-hidden border border-white/10 shrink-0">
                            {['A', 'B'].map(t => (
                              <button key={t} onClick={() => toggleTeam(p.id, t)}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${
                                  sq?.team === t
                                    ? t === 'A' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                    : 'text-gray-400 hover:bg-white/[0.07]'
                                }`}
                              >{t}</button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Unassigned role */}
            {(() => {
              const u = players.filter(p => !getRole(p.id))
              if (!u.length) return null
              return (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">⚠️ No Role</p>
                  <div className="space-y-1">
                    {u.map(p => {
                      const sq = getRow(p.id)
                      return (
                        <div key={p.id} className="flex items-center gap-3 py-1.5">
                          <span className="text-sm text-gray-500 flex-1 truncate">{p.display_name}</span>
                          <div className="flex rounded-lg overflow-hidden border border-white/10">
                            {['A', 'B'].map(t => (
                              <button key={t} onClick={() => toggleTeam(p.id, t)}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${
                                  sq?.team === t
                                    ? t === 'A' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                    : 'text-gray-400 hover:bg-white/[0.07]'
                                }`}
                              >{t}</button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Opposite Players */}
          <div className="card space-y-4">
            <div>
              <h2 className="font-medium text-white">Opposite Players</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pairs that must always be on different teams. Auto-Balance enforces this.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select className="input text-xs py-1.5 flex-1 min-w-[130px]" value={pairA} onChange={e => setPairA(e.target.value)}>
                <option value="">Player A…</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              <select className="input text-xs py-1.5 flex-1 min-w-[130px]" value={pairB} onChange={e => setPairB(e.target.value)}>
                <option value="">Player B…</option>
                {players.filter(p => p.id !== pairA).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              <button onClick={addPair} disabled={!pairA || !pairB} className="btn-primary text-xs px-4 shrink-0">+ Add</button>
            </div>
            {!oppositePairs.length
              ? <p className="text-xs text-gray-500">No pairs set.</p>
              : (
                <div className="space-y-2">
                  {oppositePairs.map((pair, i) => {
                    const sA = getRow(pair.a), sB = getRow(pair.b)
                    const bad = sA && sB && sA.team === sB.team
                    return (
                      <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${bad ? 'bg-red-900/20 border border-red-700/30' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                        <span className={`text-sm flex-1 ${bad ? 'text-red-300' : 'text-gray-200'}`}>
                          {bad ? '⚠ ' : '↔ '}<strong>{pMap[pair.a]?.display_name}</strong> &amp; <strong>{pMap[pair.b]?.display_name}</strong>
                        </span>
                        <button onClick={() => setOppositePairs(prev => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          <button onClick={() => setStep(3)} className="btn-primary text-sm w-full">Next: Captain &amp; Umpire →</button>
        </div>
      )}

      {/* ═══ STEP 3: Captain & Umpire ═══ */}
      {step === 3 && (
        <div className="space-y-4">

          {/* Captain */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-white">👑 Captains</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tick volunteers. "Distribute" shuffles and splits equally (random side for odd count).
                </p>
              </div>
              <button
                onClick={() => distribute('captain_interest', 'is_captain', 'Captain')}
                className="btn-primary text-sm shrink-0"
              >
                🎲 Distribute
              </button>
            </div>

            {/* Summary */}
            {(() => {
              const caps = squadList.filter(r => r.is_captain)
              if (!caps.length) return null
              const capA = caps.filter(r => r.team === 'A'), capB = caps.filter(r => r.team === 'B')
              return (
                <div className="flex gap-4 text-xs">
                  <span className="text-amber-300">Team A: {capA.map(r => pMap[r.player_id]?.display_name).join(', ') || '—'}</span>
                  <span className="text-blue-300">Team B: {capB.map(r => pMap[r.player_id]?.display_name).join(', ') || '—'}</span>
                </div>
              )
            })()}

            <div className="space-y-1 max-h-72 overflow-y-auto">
              {squadList.map(row => {
                const p = pMap[row.player_id]
                if (!p) return null
                return (
                  <label key={row.player_id} className="flex items-center gap-2.5 py-1.5 cursor-pointer border-b border-white/[0.04]">
                    <input type="checkbox" checked={!!row.captain_interest}
                      onChange={() => toggleInterest(row.player_id, 'captain_interest')}
                      className="w-4 h-4 accent-[#10b981]"
                    />
                    <span className="text-sm text-gray-200 flex-1">{p.display_name}</span>
                    <span className="text-[10px] text-gray-500">{getRole(row.player_id) ? ROLES.find(r => r.value === getRole(row.player_id))?.icon : ''} {ROLES.find(r => r.value === getRole(row.player_id))?.label ?? ''}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${row.team === 'A' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      Team {row.team}
                    </span>
                    {row.is_captain && <span className="text-xs text-amber-400 font-medium">👑</span>}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Umpire */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-white">🕵️ Umpires</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tick volunteers. "Distribute" shuffles and splits equally (random side for odd count). A Batsman can also be an Umpire.
                </p>
              </div>
              <button
                onClick={() => distribute('umpire_interest', 'is_umpire', 'Umpire')}
                className="btn-secondary text-sm shrink-0"
              >
                🎲 Distribute
              </button>
            </div>

            {(() => {
              const umps = squadList.filter(r => r.is_umpire)
              if (!umps.length) return null
              const umpA = umps.filter(r => r.team === 'A'), umpB = umps.filter(r => r.team === 'B')
              return (
                <div className="flex gap-4 text-xs">
                  <span className="text-amber-300">Team A: {umpA.map(r => pMap[r.player_id]?.display_name).join(', ') || '—'}</span>
                  <span className="text-blue-300">Team B: {umpB.map(r => pMap[r.player_id]?.display_name).join(', ') || '—'}</span>
                </div>
              )
            })()}

            <div className="space-y-1 max-h-72 overflow-y-auto">
              {squadList.map(row => {
                const p = pMap[row.player_id]
                if (!p) return null
                return (
                  <label key={row.player_id} className="flex items-center gap-2.5 py-1.5 cursor-pointer border-b border-white/[0.04]">
                    <input type="checkbox" checked={!!row.umpire_interest}
                      onChange={() => toggleInterest(row.player_id, 'umpire_interest')}
                      className="w-4 h-4 accent-[#10b981]"
                    />
                    <span className="text-sm text-gray-200 flex-1">{p.display_name}</span>
                    <span className="text-[10px] text-gray-500">{getRole(row.player_id) ? ROLES.find(r => r.value === getRole(row.player_id))?.icon : ''} {ROLES.find(r => r.value === getRole(row.player_id))?.label ?? ''}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${row.team === 'A' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      Team {row.team}
                    </span>
                    {row.is_umpire && <span className="text-xs text-gray-400 font-medium">🕵️</span>}
                  </label>
                )
              })}
            </div>
          </div>

          <button onClick={saveDraft} disabled={saving} className="btn-secondary text-sm">
            {saving ? 'Saving…' : '💾 Save Progress'}
          </button>
          <button onClick={() => setStep(4)} className="btn-primary text-sm w-full">Next: Publish &amp; Reveal →</button>
        </div>
      )}

      {/* ═══ STEP 4: Publish & Live Reveal ═══ */}
      {step === 4 && (
        <div className="space-y-4">

          {/* Team previews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['A', 'B'].map(team => (
              <div key={team} className={`card space-y-2 ${team === 'A' ? 'bg-amber-900/10 border border-amber-700/20' : 'bg-blue-900/10 border border-blue-700/20'}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold ${team === 'A' ? 'text-amber-300' : 'text-blue-300'}`}>Team {team}</h3>
                  <span className="text-xs text-gray-400">{squadList.filter(r => r.team === team).length} players</span>
                </div>
                {REVEAL_GROUP_ORDER.map(g => {
                  const rows = squadList.filter(r => r.team === team && r.reveal_group === g)
                  if (!rows.length) return null
                  const info = REVEAL_GROUP_LABELS[g]
                  return (
                    <div key={g}>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1.5 mb-0.5">{info.icon} {info.label}</p>
                      {rows.map(r => (
                        <p key={r.player_id} className="text-sm text-gray-200 py-0.5 pl-1">
                          {r.is_captain && '👑 '}{r.is_umpire && '🕵️ '}{pMap[r.player_id]?.display_name ?? r.player_id}
                        </p>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* MVP Score Panel */}
          {squadList.length > 0 && (() => {
            const roleByValue = Object.fromEntries(ROLES.map(r => [r.value, r]))
            const teamScore = team => squadList
              .filter(r => r.team === team)
              .reduce((sum, r) => {
                const role = roleByValue[getRole(r.player_id)]
                return sum + playerScore(r.player_id, role)
              }, 0)
            const scoreA = Math.round(teamScore('A'))
            const scoreB = Math.round(teamScore('B'))
            const total  = scoreA + scoreB || 1
            const widthA = Math.round((scoreA / total) * 100)
            const delta  = Math.abs(scoreA - scoreB)
            const imbalanced = total > 0 && delta / total > 0.1
            return (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-white">Team MVP Score</h2>
                  {imbalanced && (
                    <span className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 px-2 py-1 rounded-full">
                      ⚠ Unbalanced — try Auto-Balance
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-900/10 border border-amber-700/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Team A</p>
                    <p className="text-2xl font-bold text-amber-300 tabular-nums">{scoreA.toLocaleString()}</p>
                    {scoreA > scoreB && <p className="text-[10px] text-amber-500 mt-0.5">+{(scoreA - scoreB).toLocaleString()} advantage</p>}
                  </div>
                  <div className="bg-blue-900/10 border border-blue-700/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-1">Team B</p>
                    <p className="text-2xl font-bold text-blue-300 tabular-nums">{scoreB.toLocaleString()}</p>
                    {scoreB > scoreA && <p className="text-[10px] text-blue-500 mt-0.5">+{(scoreB - scoreA).toLocaleString()} advantage</p>}
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-blue-900/40 flex">
                  <div className="bg-amber-500 transition-all duration-500" style={{ width: `${widthA}%` }} />
                  <div className="bg-blue-500 flex-1" />
                </div>
                <p className="text-[10px] text-gray-500 text-center">
                  Score = runs + wickets×10 + attendance% × {ATTEND_WEIGHT} per player
                </p>
              </div>
            )
          })()}

          {/* Controls */}
          <div className="card space-y-3">
            <h2 className="font-medium text-white">Publish &amp; Live Reveal</h2>
            {violations.length > 0 && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 text-xs text-red-300">
                ⚠ {violations.length} opposite-pair conflict(s) — fix in Step 2 first.
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <button onClick={saveDraft} disabled={saving} className="btn-secondary text-sm">{saving ? 'Saving…' : '💾 Save Draft'}</button>
              <button onClick={publishDraft} disabled={saving || !squadList.length} className="btn-primary text-sm">
                {saving ? 'Publishing…' : isPublished ? '✓ Re-publish' : '📢 Publish'}
              </button>
            </div>
            {isPublished && (
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <p className="text-xs text-gray-400">Share <code className="text-emerald-400">#/teams</code> — everyone watching sees the live reveal.</p>
                <button onClick={startReveal} disabled={revealing}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white disabled:opacity-50 transition-all"
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
