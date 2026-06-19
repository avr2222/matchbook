import { useState, useEffect, useRef } from 'react'
import { useConfig, useTournaments } from '../../hooks/useData'
import { fetchSeasonSquads } from '../../api/dataReader'
import { supabase } from '../../lib/supabase'
import { PageSpinner } from '../../components/ui/Spinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const REVEAL_GROUP_ORDER = ['bat_wk', 'batsman', 'batting_ar', 'bowling_ar', 'umpire', 'captain']

const CRICKET_ROLES = [
  { value: 'bat_wk',     label: 'Wicket Keepers',      icon: '🧤' },
  { value: 'batsman',    label: 'Batsmen',              icon: '🏏' },
  { value: 'batting_ar', label: 'Batting All Rounders', icon: '🔄' },
  { value: 'bowling_ar', label: 'Bowling All Rounders', icon: '🎳' },
]

const REVEAL_GROUP_LABELS = {
  bat_wk:     { label: 'Wicket Keepers',       icon: '🧤' },
  batsman:    { label: 'Batsmen',               icon: '🏏' },
  batting_ar: { label: 'Batting All Rounders',  icon: '🔄' },
  bowling_ar: { label: 'Bowling All Rounders',  icon: '🎳' },
  umpire:     { label: 'Umpires',               icon: '🕵️' },
  captain:    { label: 'Captains',              icon: '👑' },
}

// Cricket role from the joined players record (null-safe)
const getCricketRole = row => row.players?.player_role ?? null

// ── Card Component ─────────────────────────────────────────────────────────────

function PlayerCard({ squad, playerName, revealed, animating }) {
  const isA = squad.team === 'A'
  return (
    <div
      className="relative w-28 h-40"
      style={{ perspective: '600px' }}
    >
      <div
        className="w-full h-full relative transition-transform duration-700 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front — face-down */}
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center"
          style={{
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, #0c2b21, #0f1f19)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <span className="text-3xl opacity-40">🏏</span>
        </div>

        {/* Back — revealed */}
        <div
          className={`absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-1 px-2 ${
            animating ? 'scale-105' : ''
          } transition-transform duration-300`}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: isA
              ? 'linear-gradient(135deg, #451a03, #78350f)'
              : 'linear-gradient(135deg, #0c1a33, #1e3a5f)',
            border: isA
              ? '1px solid rgba(245,158,11,0.4)'
              : '1px solid rgba(59,130,246,0.4)',
            boxShadow: animating
              ? isA
                ? '0 0 20px rgba(245,158,11,0.5)'
                : '0 0 20px rgba(59,130,246,0.5)'
              : 'none',
          }}
        >
          {squad.is_captain && (
            <span className="text-xl leading-none">👑</span>
          )}
          {squad.is_umpire && !squad.is_captain && (
            <span className="text-xl leading-none">🕵️</span>
          )}
          <p className={`text-[11px] font-bold text-center leading-tight ${isA ? 'text-amber-200' : 'text-blue-200'}`}>
            {playerName}
          </p>
          <div className={`text-[9px] font-medium uppercase tracking-wider mt-0.5 px-2 py-0.5 rounded-full ${
            isA ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
          }`}>
            Team {squad.team}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Group Banner ──────────────────────────────────────────────────────────────

function GroupBanner({ group, visible }) {
  const info = REVEAL_GROUP_LABELS[group]
  if (!info || !visible) return null
  return (
    <div
      className="text-center py-6 transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-20px)',
      }}
    >
      <span className="text-4xl">{info.icon}</span>
      <h2 className="text-2xl font-bold text-white mt-2">{info.label}</h2>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TeamReveal() {
  const { data: cfg } = useConfig()
  const { data: tData } = useTournaments()
  const activeTournamentId = cfg?.active_tournament_id

  const [squads, setSquads]           = useState([])    // all rows sorted by draft_order
  const [playerMap, setPlayerMap]     = useState({})    // player_id → display_name
  const [revealed, setRevealed]       = useState({})    // player_id → bool
  const [animating, setAnimating]     = useState(null)  // player_id being animated right now
  const [currentGroup, setCurrentGroup] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [replayKey, setReplayKey]     = useState(0)

  const activeTournament = tData?.tournaments?.find(t => t.id === activeTournamentId)

  // ── Load initial state + player names ─────────────────────────────────────

  useEffect(() => {
    if (!activeTournamentId) return

    async function load() {
      setLoading(true)
      try {
        const [squadRows, playersRes] = await Promise.all([
          fetchSeasonSquads(activeTournamentId),
          supabase.from('player_balances').select('id,display_name'),
        ])
        const pmap = {}
        for (const p of (playersRes.data ?? [])) pmap[p.id] = p.display_name
        setPlayerMap(pmap)

        const sorted = [...squadRows].sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
        setSquads(sorted)

        // Pre-populate revealed state
        const rev = {}
        for (const row of sorted) rev[row.player_id] = row.revealed ?? false
        setRevealed(rev)

        // Set current group to last revealed group
        const lastRevealed = sorted.filter(r => r.revealed).at(-1)
        if (lastRevealed) setCurrentGroup(lastRevealed.reveal_group)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [activeTournamentId, replayKey])

  // ── Supabase Realtime subscription ───────────────────────────────────────

  useEffect(() => {
    if (!activeTournamentId) return

    const channel = supabase
      .channel(`squad-reveal-${activeTournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'season_squads',
          filter: `tournament_id=eq.${activeTournamentId}`,
        },
        (payload) => {
          const updated = payload.new
          if (!updated) return

          if (updated.revealed === false) {
            // Reset signal — clear all revealed
            setRevealed({})
            setAnimating(null)
            setCurrentGroup(null)
            return
          }

          if (updated.revealed === true) {
            setCurrentGroup(updated.reveal_group)
            setAnimating(updated.player_id)
            setRevealed(prev => ({ ...prev, [updated.player_id]: true }))

            // Also update the squads list with latest data
            setSquads(prev => prev.map(r =>
              r.player_id === updated.player_id ? { ...r, ...updated } : r
            ))

            setTimeout(() => setAnimating(null), 1000)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeTournamentId])

  // ── Derived values ────────────────────────────────────────────────────────

  const isPublished = squads.some(r => r.published)
  const allRevealed = squads.length > 0 && squads.every(r => revealed[r.player_id])
  const anyRevealed = squads.some(r => revealed[r.player_id])

  // Group squads for the final roster view — by cricket role (not reveal_group)
  const revealedSquads = squads.filter(r => revealed[r.player_id])
  const teamAByRole = {}
  const teamBByRole = {}
  for (const role of CRICKET_ROLES) {
    teamAByRole[role.value] = revealedSquads.filter(r => r.team === 'A' && getCricketRole(r) === role.value)
    teamBByRole[role.value] = revealedSquads.filter(r => r.team === 'B' && getCricketRole(r) === role.value)
  }
  const teamANoRole = revealedSquads.filter(r => r.team === 'A' && !getCricketRole(r))
  const teamBNoRole = revealedSquads.filter(r => r.team === 'B' && !getCricketRole(r))

  // ── Loading / pre-publish screens ────────────────────────────────────────

  if (loading || !activeTournamentId) return <PageSpinner />

  if (!isPublished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
        <div className="text-6xl">🏏</div>
        <h1 className="text-2xl font-bold text-white">Season Team Reveal</h1>
        <p className="text-gray-400">{activeTournament?.name ?? 'New Season'}</p>
        <p className="text-gray-500 text-sm">The team reveal hasn't been published yet.<br/>Check back soon!</p>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 pb-16">

      {/* Header */}
      <div className="text-center py-8">
        <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-1">
          {activeTournament?.short_name ?? 'Season'}
        </p>
        <h1 className="text-3xl font-bold text-white">Team Reveal</h1>

        {/* Live indicator */}
        {anyRevealed && !allRevealed && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-red-900/20 border border-red-700/30">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-medium">Live Reveal in Progress</span>
          </div>
        )}
        {!anyRevealed && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-400 font-medium">Waiting for reveal to start…</span>
          </div>
        )}
      </div>

      {/* Group banner */}
      <GroupBanner group={currentGroup} visible={!!currentGroup && !allRevealed} />

      {/* Cards grid — shows face-down cards in sequence, flip as revealed */}
      {!allRevealed && (
        <div className="flex flex-wrap justify-center gap-4 py-4 min-h-[200px]">
          {squads.map(row => (
            <PlayerCard
              key={row.player_id}
              squad={row}
              playerName={playerMap[row.player_id] ?? row.player_id}
              revealed={!!revealed[row.player_id]}
              animating={animating === row.player_id}
            />
          ))}
        </div>
      )}

      {/* Final roster — shown as each group completes */}
      {anyRevealed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Team A */}
          <div className="rounded-2xl border border-amber-700/20 overflow-hidden"
               style={{ background: 'linear-gradient(180deg, rgba(69,26,3,0.3) 0%, rgba(12,28,20,0.6) 100%)' }}>
            <div className="px-5 py-4 border-b border-amber-700/20">
              <h2 className="text-lg font-bold text-amber-300">Team A</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {squads.filter(r => r.team === 'A' && revealed[r.player_id]).length} / {squads.filter(r => r.team === 'A').length} revealed
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {CRICKET_ROLES.map(role => {
                const rows = teamAByRole[role.value]
                if (!rows || rows.length === 0) return null
                return (
                  <div key={role.value}>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      {role.icon} {role.label}
                    </p>
                    {rows.map(row => (
                      <div key={row.player_id} className="flex items-center gap-2 py-1">
                        <span className="text-sm text-amber-100">
                          {playerMap[row.player_id] ?? row.player_id}
                        </span>
                        {row.is_captain && <span className="text-xs text-amber-400">👑</span>}
                        {row.is_umpire  && <span className="text-xs text-gray-400">🕵️</span>}
                      </div>
                    ))}
                  </div>
                )
              })}
              {teamANoRole.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Others</p>
                  {teamANoRole.map(row => (
                    <div key={row.player_id} className="flex items-center gap-2 py-1">
                      <span className="text-sm text-amber-100">{playerMap[row.player_id] ?? row.player_id}</span>
                      {row.is_captain && <span className="text-xs text-amber-400">👑</span>}
                      {row.is_umpire  && <span className="text-xs text-gray-400">🕵️</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Team B */}
          <div className="rounded-2xl border border-blue-700/20 overflow-hidden"
               style={{ background: 'linear-gradient(180deg, rgba(12,26,51,0.3) 0%, rgba(12,28,20,0.6) 100%)' }}>
            <div className="px-5 py-4 border-b border-blue-700/20">
              <h2 className="text-lg font-bold text-blue-300">Team B</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {squads.filter(r => r.team === 'B' && revealed[r.player_id]).length} / {squads.filter(r => r.team === 'B').length} revealed
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {CRICKET_ROLES.map(role => {
                const rows = teamBByRole[role.value]
                if (!rows || rows.length === 0) return null
                return (
                  <div key={role.value}>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      {role.icon} {role.label}
                    </p>
                    {rows.map(row => (
                      <div key={row.player_id} className="flex items-center gap-2 py-1">
                        <span className="text-sm text-blue-100">
                          {playerMap[row.player_id] ?? row.player_id}
                        </span>
                        {row.is_captain && <span className="text-xs text-amber-400">👑</span>}
                        {row.is_umpire  && <span className="text-xs text-gray-400">🕵️</span>}
                      </div>
                    ))}
                  </div>
                )
              })}
              {teamBNoRole.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Others</p>
                  {teamBNoRole.map(row => (
                    <div key={row.player_id} className="flex items-center gap-2 py-1">
                      <span className="text-sm text-blue-100">{playerMap[row.player_id] ?? row.player_id}</span>
                      {row.is_captain && <span className="text-xs text-amber-400">👑</span>}
                      {row.is_umpire  && <span className="text-xs text-gray-400">🕵️</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replay button */}
      {allRevealed && (
        <div className="text-center mt-8">
          <p className="text-gray-400 text-sm mb-4">All players revealed! 🎉</p>
          <button
            onClick={() => setReplayKey(k => k + 1)}
            className="btn-secondary text-sm"
          >
            ↺ Refresh
          </button>
        </div>
      )}
    </div>
  )
}
