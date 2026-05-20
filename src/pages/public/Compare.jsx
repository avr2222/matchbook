import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { usePlayers, useConfig, useLeaderboard, useWeeks, useAttendance } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'

const NOT_OUT_KEYS = new Set(['not out','dnb','did not bat','absent','retired hurt','absent hurt','retired not out',''])
const isInnings   = p => (p.balls_faced || 0) > 0
const isDismissed = p => isInnings(p) && !NOT_OUT_KEYS.has((p.dismissal ?? '').toLowerCase().trim())

function overs(balls) {
  if (!balls) return '0.0'
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

export default function Compare() {
  const [params, setParams] = useSearchParams()
  const [playerA, setPlayerA] = useState(params.get('a') ?? '')
  const [playerB, setPlayerB] = useState(params.get('b') ?? '')

  const { data: cfg }     = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: aData }   = useAttendance()
  const tournamentId = cfg?.active_tournament_id
  const { data: perfData } = useLeaderboard(tournamentId)

  if (isLoading) return <PageSpinner />

  const players      = (pData?.players ?? []).filter(p => p.status === 'active').sort((a, b) => a.display_name.localeCompare(b.display_name))
  const perfs        = perfData?.performances ?? []
  const completedWeeks = (wData?.weeks ?? []).filter(w => w.tournament_id === tournamentId && w.status === 'completed')
  const records      = aData?.records ?? []

  function buildStats(pid) {
    if (!pid) return null
    const playerPerfs = perfs.filter(p => p.player_id === pid)
    if (!playerPerfs.length) return { player_id: pid, matches: 0, innings: 0, dismissals: 0, runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0, wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0, run_outs: 0, stumpings: 0, potm_count: 0, bba_count: 0, bbo_count: 0, attend_pct: 0 }
    const s = { player_id: pid, matches: 0, innings: 0, dismissals: 0, runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0, wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0, run_outs: 0, stumpings: 0, potm_count: 0, bba_count: 0, bbo_count: 0 }
    for (const p of playerPerfs) {
      s.matches     += 1
      if (isInnings(p))   s.innings    += 1
      if (isDismissed(p)) s.dismissals += 1
      s.runs        += p.runs         || 0
      s.balls_faced += p.balls_faced  || 0
      s.fours       += p.fours        || 0
      s.sixes       += p.sixes        || 0
      s.high_score   = Math.max(s.high_score, p.runs || 0)
      s.wickets     += p.wickets      || 0
      s.runs_given  += p.runs_given   || 0
      s.balls_bowled+= p.balls_bowled || 0
      s.maidens     += p.maidens      || 0
      s.catches     += p.catches      || 0
      s.run_outs    += p.run_outs     || 0
      s.stumpings   += p.stumpings    || 0
      s.potm_count  += p.potm_count   || 0
      s.bba_count   += p.bba_count    || 0
      s.bbo_count   += p.bbo_count    || 0
    }
    const played = records.filter(r => r.player_id === pid && r.status === 'played').length
    s.attend_pct = completedWeeks.length > 0 ? Math.round((played / completedWeeks.length) * 100) : 0
    return s
  }

  const sA = buildStats(playerA)
  const sB = buildStats(playerB)
  const pA = players.find(p => p.id === playerA)
  const pB = players.find(p => p.id === playerB)

  function selectA(id) { setPlayerA(id); setParams(prev => { const n = new URLSearchParams(prev); n.set('a', id); return n }) }
  function selectB(id) { setPlayerB(id); setParams(prev => { const n = new URLSearchParams(prev); n.set('b', id); return n }) }

  const rows = sA && sB ? [
    { label: 'Matches',      a: sA.matches,     b: sB.matches,     higher: true,  fmt: v => v },
    { label: 'Runs',         a: sA.runs,        b: sB.runs,        higher: true,  fmt: v => v },
    { label: 'Batting avg',  a: sA.dismissals > 0 ? (sA.runs / sA.dismissals) : 0, b: sB.dismissals > 0 ? (sB.runs / sB.dismissals) : 0, higher: true, fmt: v => v > 0 ? v.toFixed(1) : '—' },
    { label: 'Strike rate',  a: sA.balls_faced > 0 ? (sA.runs / sA.balls_faced * 100) : 0, b: sB.balls_faced > 0 ? (sB.runs / sB.balls_faced * 100) : 0, higher: true, fmt: v => v.toFixed(1) },
    { label: 'High score',   a: sA.high_score,  b: sB.high_score,  higher: true,  fmt: v => v },
    { label: '4s',           a: sA.fours,       b: sB.fours,       higher: true,  fmt: v => v },
    { label: '6s',           a: sA.sixes,       b: sB.sixes,       higher: true,  fmt: v => v },
    { label: 'Wickets',      a: sA.wickets,     b: sB.wickets,     higher: true,  fmt: v => v },
    { label: 'Economy',      a: sA.balls_bowled > 0 ? (sA.runs_given / sA.balls_bowled * 6) : 0, b: sB.balls_bowled > 0 ? (sB.runs_given / sB.balls_bowled * 6) : 0, higher: false, fmt: v => v > 0 ? v.toFixed(2) : '—' },
    { label: 'Overs',        a: sA.balls_bowled, b: sB.balls_bowled, higher: true, fmt: v => overs(v) },
    { label: 'Maidens',      a: sA.maidens,     b: sB.maidens,     higher: true,  fmt: v => v },
    { label: 'Catches',      a: sA.catches + sA.run_outs + sA.stumpings, b: sB.catches + sB.run_outs + sB.stumpings, higher: true, fmt: v => v },
    { label: 'POTM',         a: sA.potm_count,  b: sB.potm_count,  higher: true,  fmt: v => v },
    { label: 'Best bat',     a: sA.bba_count,   b: sB.bba_count,   higher: true,  fmt: v => v },
    { label: 'Best bowl',    a: sA.bbo_count,   b: sB.bbo_count,   higher: true,  fmt: v => v },
    { label: 'Attendance',   a: sA.attend_pct,  b: sB.attend_pct,  higher: true,  fmt: v => `${v}%` },
  ] : []

  return (
    <div className="max-w-4xl mx-auto px-4 pb-12 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/leaderboard" className="text-gray-400 hover:text-gray-600 text-sm">← Leaderboard</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-[22px] font-medium text-gray-900">Compare players</h1>
      </div>

      {/* Player selectors */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[{ val: playerA, set: selectA, label: 'Player A' }, { val: playerB, set: selectB, label: 'Player B' }].map(({ val, set, label }) => (
          <div key={label}>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-1.5">{label}</p>
            <select
              className="input text-sm"
              value={val}
              onChange={e => set(e.target.value)}
            >
              <option value="">Select player…</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      {sA && sB && pA && pB ? (
        <div className="card overflow-hidden p-0">
          <div className="grid grid-cols-3 border-b border-[rgba(0,0,0,0.06)] bg-[#F8F8F6]">
            <div className="col-span-1 px-4 py-3 text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Stat</div>
            <div className="px-4 py-3 text-center">
              <Link to={`/player/${pA.id}`} className="font-medium text-sm text-gray-900 hover:text-[#1D9E75]">{pA.display_name}</Link>
            </div>
            <div className="px-4 py-3 text-center">
              <Link to={`/player/${pB.id}`} className="font-medium text-sm text-gray-900 hover:text-[#1D9E75]">{pB.display_name}</Link>
            </div>
          </div>

          <div className="divide-y divide-[rgba(0,0,0,0.04)]">
            {rows.map(({ label, a, b, higher, fmt }) => {
              const aWins = higher ? a > b : (a > 0 && (b === 0 || a < b))
              const bWins = higher ? b > a : (b > 0 && (a === 0 || b < a))
              return (
                <div key={label} className="grid grid-cols-3 items-center">
                  <div className="px-4 py-2.5 text-xs text-gray-500 font-medium">{label}</div>
                  <div className={`px-4 py-2.5 text-center text-sm font-medium tabular-nums ${aWins ? 'text-[#1D9E75] bg-[#E1F5EE]' : 'text-gray-600'}`}>
                    {fmt(a)}
                  </div>
                  <div className={`px-4 py-2.5 text-center text-sm font-medium tabular-nums ${bWins ? 'text-[#1D9E75] bg-[#E1F5EE]' : 'text-gray-600'}`}>
                    {fmt(b)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="font-medium text-gray-700">Select two players to compare</p>
          <p className="text-sm text-gray-400 mt-1">Choose from the dropdowns above</p>
        </div>
      )}
    </div>
  )
}
