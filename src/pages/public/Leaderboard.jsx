import { useState } from 'react'
import { usePlayers, useConfig, useLeaderboard } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'

function overs(balls) {
  if (!balls) return '0'
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

function economy(runs, balls) {
  if (!balls) return '—'
  return ((runs / balls) * 6).toFixed(2)
}

function strikeRate(runs, balls) {
  if (!balls) return '—'
  return ((runs / balls) * 100).toFixed(1)
}

export default function Leaderboard() {
  const [tab, setTab] = useState('batting')
  const { data: cfg, isLoading: cfgLoading } = useConfig()
  const { data: pData, isLoading: playersLoading } = usePlayers()
  const tournamentId = cfg?.active_tournament_id
  const { data: perfData, isLoading: perfLoading } = useLeaderboard(tournamentId)

  if (cfgLoading || playersLoading) return <PageSpinner />

  const playerMap   = Object.fromEntries((pData?.players ?? []).map(p => [p.id, p]))
  const perfs       = perfData?.performances ?? []

  // Aggregate per player across all sessions
  const statsMap = {}
  for (const perf of perfs) {
    if (!statsMap[perf.player_id]) {
      statsMap[perf.player_id] = {
        player_id: perf.player_id,
        matches: 0, runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0,
        wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0,
      }
    }
    const s = statsMap[perf.player_id]
    s.matches++
    s.runs        += perf.runs        || 0
    s.balls_faced += perf.balls_faced || 0
    s.fours       += perf.fours       || 0
    s.sixes       += perf.sixes       || 0
    s.high_score   = Math.max(s.high_score, perf.runs || 0)
    s.wickets     += perf.wickets     || 0
    s.runs_given  += perf.runs_given  || 0
    s.balls_bowled+= perf.balls_bowled|| 0
    s.maidens     += perf.maidens     || 0
    s.catches     += perf.catches     || 0
  }

  const allStats = Object.values(statsMap)
  const isEmpty  = allStats.length === 0

  const batters = [...allStats]
    .filter(s => s.runs > 0 || s.balls_faced > 0)
    .sort((a, b) => b.runs - a.runs)

  const bowlers = [...allStats]
    .filter(s => s.wickets > 0 || s.balls_bowled > 0)
    .sort((a, b) => {
      if (b.wickets !== a.wickets) return b.wickets - a.wickets
      const eA = a.balls_bowled ? a.runs_given / a.balls_bowled : Infinity
      const eB = b.balls_bowled ? b.runs_given / b.balls_bowled : Infinity
      return eA - eB
    })

  const mvps = [...allStats]
    .map(s => ({
      ...s,
      mvp_score: s.runs * 0.5 + s.fours * 0.5 + s.sixes * 1.5 + s.wickets * 8 + s.catches * 2,
    }))
    .filter(s => s.mvp_score > 0)
    .sort((a, b) => b.mvp_score - a.mvp_score)

  const tabs = [
    { id: 'batting', label: 'Batting' },
    { id: 'bowling', label: 'Bowling' },
    { id: 'mvp',     label: 'MVP' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🏆</span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Season Stats</h1>
          <p className="text-xs text-gray-400">{cfg?.team_name ?? 'Cricket Team'}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {perfLoading && <PageSpinner />}

      {!perfLoading && isEmpty && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-semibold text-gray-700">No stats yet</p>
          <p className="text-sm text-gray-400 mt-1">Run the CricHeroes sync to populate player stats.</p>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'batting' && (
        <div className="card overflow-x-auto">
          <h2 className="font-bold text-gray-900 mb-3">Top Batters</h2>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className="text-right pb-2 pr-2">M</th>
                <th className="text-right pb-2 pr-2">Runs</th>
                <th className="text-right pb-2 pr-2">Avg</th>
                <th className="text-right pb-2 pr-2">SR</th>
                <th className="text-right pb-2 pr-2">HS</th>
                <th className="text-right pb-2 pr-2">4s</th>
                <th className="text-right pb-2">6s</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batters.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-semibold' : ''}>
                  <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-gray-900 max-w-[120px] truncate">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold text-green-700">{s.runs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">
                    {s.matches > 0 ? (s.runs / s.matches).toFixed(1) : '—'}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{strikeRate(s.runs, s.balls_faced)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.high_score}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.fours}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.sixes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'bowling' && (
        <div className="card overflow-x-auto">
          <h2 className="font-bold text-gray-900 mb-3">Top Bowlers</h2>
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className="text-right pb-2 pr-2">M</th>
                <th className="text-right pb-2 pr-2">Wkts</th>
                <th className="text-right pb-2 pr-2">Overs</th>
                <th className="text-right pb-2 pr-2">Runs</th>
                <th className="text-right pb-2 pr-2">Econ</th>
                <th className="text-right pb-2">Mdns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bowlers.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-semibold' : ''}>
                  <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-gray-900 max-w-[130px] truncate">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold text-purple-700">{s.wickets}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{overs(s.balls_bowled)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.runs_given}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{economy(s.runs_given, s.balls_bowled)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.maidens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'mvp' && (
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-1">Season MVP</h2>
          <p className="text-xs text-gray-400 mb-4">Score = runs×0.5 + 4s×0.5 + 6s×1.5 + wkts×8 + catches×2</p>
          <div className="space-y-2">
            {mvps.map((s, i) => (
              <div
                key={s.player_id}
                className={`flex items-center gap-3 py-2 px-3 rounded-xl ${
                  i === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white'
                  : i === 1 ? 'bg-gray-300 text-gray-700'
                  : i === 2 ? 'bg-orange-300 text-white'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.runs}r · {s.wickets}w · {s.catches}c
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-lg text-amber-600">{s.mvp_score.toFixed(0)}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
