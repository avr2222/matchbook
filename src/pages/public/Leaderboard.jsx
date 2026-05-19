import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlayers, useConfig, useLeaderboard, useWeeks, useTournaments } from '../../hooks/useData'
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
  const [selectedTId, setSelectedTId] = useState(null)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const navigate = useNavigate()
  const { data: cfg, isLoading: cfgLoading } = useConfig()
  const { data: pData, isLoading: playersLoading } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: tData } = useTournaments()
  const tournamentId = selectedTId ?? cfg?.active_tournament_id
  const { data: perfData, isLoading: perfLoading } = useLeaderboard(tournamentId)
  const totalSessions = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === tournamentId && w.status === 'completed').length

  if (cfgLoading || playersLoading) return <PageSpinner />

  const playerMap   = Object.fromEntries((pData?.players ?? []).map(p => [p.id, p]))
  const perfs       = perfData?.performances ?? []

  // Aggregate per player across all sessions
  const statsMap = {}
  for (const perf of perfs) {
    if (!statsMap[perf.player_id]) {
      statsMap[perf.player_id] = {
        player_id: perf.player_id,
        weeks_attended: 0,
        matches: 0, runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0,
        wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0,
        run_outs: 0, stumpings: 0, wides: 0, no_balls: 0, potm_count: 0, ducks: 0,
        bba_count: 0, bbo_count: 0,
      }
    }
    const s = statsMap[perf.player_id]
    s.weeks_attended += 1
    s.matches    += perf.match_count || 1
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
    s.run_outs    += perf.run_outs    || 0
    s.stumpings   += perf.stumpings   || 0
    s.wides       += perf.wides       || 0
    s.no_balls    += perf.no_balls    || 0
    s.potm_count  += perf.potm_count  || 0
    s.ducks       += perf.ducks       || 0
    s.bba_count   += perf.bba_count   || 0
    s.bbo_count   += perf.bbo_count   || 0
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

  // CricHeroes MVP formula (season total)
  // Batting: runs/10 + 8% SR bonus | Bowling: 1.2 pts/wkt (T10), 2 maidens = 1 wkt
  // Fielding: catches/stumpings = 20% of wkt value, run-outs = full wkt value
  const WKT_PTS = 1.2
  const mvps = [...allStats]
    .filter(s => s.matches >= 5)
    .map(s => {
      const batting  = (s.runs / 10) * 1.08
      const bowling  = s.wickets * WKT_PTS + Math.floor(s.maidens / 2) * WKT_PTS
      const fielding = (s.catches + s.stumpings) * (WKT_PTS * 0.2) + s.run_outs * WKT_PTS
      return { ...s, mvp_score: parseFloat((batting + bowling + fielding).toFixed(1)) }
    })
    .filter(s => s.mvp_score > 0)
    .sort((a, b) => b.mvp_score - a.mvp_score)

  const fielders = [...allStats]
    .filter(s => (s.catches + s.run_outs + s.stumpings) > 0)
    .sort((a, b) => (b.catches + b.run_outs + b.stumpings) - (a.catches + a.run_outs + a.stumpings))

  const allrounders = [...allStats]
    .filter(s => s.matches >= 2)
    .map(s => {
      const bat = (s.runs / 10) * 1.08
      const bowl = s.wickets * WKT_PTS + Math.floor(s.maidens / 2) * WKT_PTS
      const fld  = (s.catches + s.stumpings) * (WKT_PTS * 0.2) + s.run_outs * WKT_PTS
      return { ...s, ar_score: parseFloat((bat + bowl + fld).toFixed(1)) }
    })
    .filter(s => s.ar_score > 0)
    .sort((a, b) => b.ar_score - a.ar_score)

  // Awards tab
  const MIN_BAT = 40, MIN_BOWL = 30
  const _tg = (sorted, fn) => {
    if (!sorted.length) return []
    const best = fn(sorted[0])
    return sorted.filter(s => fn(s) === best)
  }
  const _tgf = (sorted, fn) => {
    if (!sorted.length) return []
    const best = Math.round(fn(sorted[0]) * 10)
    return sorted.filter(s => Math.round(fn(s) * 10) === best)
  }
  const topPotm      = _tg([...allStats].filter(s => s.potm_count > 0).sort((a,b) => b.potm_count - a.potm_count), s => s.potm_count)
  const topBba       = _tg([...allStats].filter(s => s.bba_count > 0).sort((a,b) => b.bba_count - a.bba_count), s => s.bba_count)
  const topBbo       = _tg([...allStats].filter(s => s.bbo_count > 0).sort((a,b) => b.bbo_count - a.bbo_count), s => s.bbo_count)
  const sixMachine   = _tg([...allStats].filter(s => s.sixes > 0).sort((a,b) => b.sixes - a.sixes), s => s.sixes)
  const wicketWiz    = _tg([...allStats].filter(s => s.wickets > 0).sort((a,b) => b.wickets - a.wickets), s => s.wickets)
  const lightningBat = _tgf([...allStats].filter(s => s.balls_faced >= MIN_BAT).sort((a,b) => (b.runs/b.balls_faced)-(a.runs/a.balls_faced)), s => s.runs/s.balls_faced)
  const economyKing  = _tgf([...allStats].filter(s => s.balls_bowled >= MIN_BOWL).sort((a,b) => (a.runs_given/a.balls_bowled)-(b.runs_given/b.balls_bowled)), s => s.runs_given/s.balls_bowled)
  const maidenMaster = _tg([...allStats].filter(s => s.maidens > 0).sort((a,b) => b.maidens - a.maidens), s => s.maidens)
  const catchKing    = _tg([...allStats].filter(s => (s.catches+s.run_outs+s.stumpings) > 0).sort((a,b) => (b.catches+b.run_outs+b.stumpings)-(a.catches+a.run_outs+a.stumpings)), s => s.catches+s.run_outs+s.stumpings)
  const workhorse    = _tg([...allStats].filter(s => s.balls_bowled > 0).sort((a,b) => b.balls_bowled - a.balls_bowled), s => s.balls_bowled)
  const duckKing     = _tg([...allStats].filter(s => s.ducks > 0).sort((a,b) => b.ducks - a.ducks), s => s.ducks)
  const slowcoach    = _tgf([...allStats].filter(s => s.balls_faced >= MIN_BAT).sort((a,b) => (a.runs/a.balls_faced)-(b.runs/b.balls_faced)), s => s.runs/s.balls_faced)
  const wideMan      = _tg([...allStats].filter(s => s.wides > 0).sort((a,b) => b.wides - a.wides), s => s.wides)
  const noBallKing   = _tg([...allStats].filter(s => s.no_balls > 0).sort((a,b) => b.no_balls - a.no_balls), s => s.no_balls)
  const costlyBowler = _tgf([...allStats].filter(s => s.balls_bowled >= MIN_BOWL).sort((a,b) => (b.runs_given/b.balls_bowled)-(a.runs_given/a.balls_bowled)), s => s.runs_given/s.balls_bowled)
  const topAttendee  = totalSessions > 0
    ? [...allStats].filter(s => s.weeks_attended > 0)
        .map(s => ({ ...s, attend_pct: Math.round((s.weeks_attended / totalSessions) * 100) }))
        .sort((a, b) => b.attend_pct - a.attend_pct)[0]
    : null

  const _ru = (sorted, winGroup, fmt) => {
    const next = sorted.find(s => !winGroup.includes(s))
    if (!next) return null
    const nm = playerMap[next.player_id]?.display_name ?? '?'
    return `2nd: ${nm} (${fmt(next)})`
  }
  const _potmSorted   = [...allStats].filter(s => s.potm_count > 0).sort((a,b) => b.potm_count - a.potm_count)
  const _wicketSorted = [...allStats].filter(s => s.wickets > 0).sort((a,b) => b.wickets - a.wickets)
  const mvpRU    = _ru(mvps,          mvps.filter(s => s.mvp_score === mvps[0]?.mvp_score),  s => s.mvp_score.toFixed(1) + ' pts')
  const scorerRU = _ru(batters,       batters.filter(s => s.runs === batters[0]?.runs),       s => s.runs + ' runs')
  const wicketRU = _ru(_wicketSorted, wicketWiz,                                              s => s.wickets + ' wkts')
  const potmRU   = _ru(_potmSorted,   topPotm,                                                s => s.potm_count + 'x')

  const tabs = [
    { id: 'batting',  label: 'Batting'  },
    { id: 'bowling',  label: 'Bowling'  },
    { id: 'fielding', label: 'Fielding' },
    { id: 'allround', label: 'All-Round' },
    { id: 'mvp',      label: 'MVP'      },
    { id: 'awards',   label: 'Awards'   },
  ]
  const tournaments = [...(tData?.tournaments ?? [])].sort((a, b) => b.id.localeCompare(a.id))

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortArrow = col => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
  const thClass = col => `cursor-pointer select-none hover:text-gray-600 whitespace-nowrap${sortCol === col ? ' text-green-700 font-black' : ''}`

  const displayBatters = (() => {
    const enriched = batters.map(s => ({
      ...s,
      avg: s.matches > 0 ? s.runs / s.matches : 0,
      sr:  s.balls_faced > 0 ? (s.runs / s.balls_faced) * 100 : 0,
    }))
    if (!sortCol) return enriched
    return [...enriched].sort((a, b) => sortDir === 'desc' ? (b[sortCol] ?? 0) - (a[sortCol] ?? 0) : (a[sortCol] ?? 0) - (b[sortCol] ?? 0))
  })()

  const displayBowlers = (() => {
    const enriched = bowlers.map(s => ({
      ...s,
      econ: s.balls_bowled > 0 ? (s.runs_given / s.balls_bowled) * 6 : Infinity,
    }))
    if (!sortCol) return enriched
    const dir = sortCol === 'econ' ? (sortDir === 'desc' ? 1 : -1) : (sortDir === 'desc' ? -1 : 1)
    return [...enriched].sort((a, b) => dir * ((a[sortCol] ?? 0) - (b[sortCol] ?? 0)))
  })()

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🏆</span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Season Stats</h1>
          <p className="text-xs text-gray-400">{cfg?.team_name ?? 'Cricket Team'}</p>
        </div>
      </div>

      {tournaments.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 mb-4">
          <div className="flex gap-2 w-max">
            {tournaments.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTId(t.id === cfg?.active_tournament_id ? null : t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  tournamentId === t.id
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {t.short_name ?? t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 px-4 mb-6">
        <div className="flex gap-1 bg-gray-100/80 p-1 rounded-2xl w-max min-w-full">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSortCol(null); setSortDir('desc') }}
              className={`py-2 px-3 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-white shadow-sm text-green-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
                <th className={`text-right pb-2 pr-2 ${thClass('matches')}`} onClick={() => toggleSort('matches')}>M{sortArrow('matches')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('runs')}`}    onClick={() => toggleSort('runs')}>Runs{sortArrow('runs')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('avg')}`}     onClick={() => toggleSort('avg')}>Avg{sortArrow('avg')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('sr')}`}      onClick={() => toggleSort('sr')}>SR{sortArrow('sr')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('high_score')}`} onClick={() => toggleSort('high_score')}>HS{sortArrow('high_score')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('fours')}`}   onClick={() => toggleSort('fours')}>4s{sortArrow('fours')}</th>
                <th className={`text-right pb-2 ${thClass('sixes')}`}        onClick={() => toggleSort('sixes')}>6s{sortArrow('sixes')}</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayBatters.map((s, i) => (
                <tr key={s.player_id} className={i === 0 && !sortCol ? 'font-semibold' : ''}>
                  <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="text-gray-900 hover:text-green-700 hover:underline truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                    {s.bba_count > 0 && (
                      <span className="text-xs text-blue-500 font-semibold">🦇×{s.bba_count}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold text-green-700">{s.runs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">
                    {s.matches > 0 ? s.avg.toFixed(1) : '—'}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.balls_faced > 0 ? s.sr.toFixed(1) : '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.high_score}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.fours}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.sixes}</td>
                  <td className="py-2 pl-1">
                    <button
                      title="Compare"
                      onClick={() => navigate(`/compare?a=${s.player_id}`)}
                      className="text-gray-300 hover:text-green-600 transition-colors text-xs"
                    >⚖️</button>
                  </td>
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
                <th className={`text-right pb-2 pr-2 ${thClass('matches')}`}     onClick={() => toggleSort('matches')}>M{sortArrow('matches')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('wickets')}`}     onClick={() => toggleSort('wickets')}>Wkts{sortArrow('wickets')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('balls_bowled')}`} onClick={() => toggleSort('balls_bowled')}>Ovrs{sortArrow('balls_bowled')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('runs_given')}`}  onClick={() => toggleSort('runs_given')}>Runs{sortArrow('runs_given')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('econ')}`}        onClick={() => toggleSort('econ')}>Econ{sortArrow('econ')}</th>
                <th className={`text-right pb-2 ${thClass('maidens')}`}          onClick={() => toggleSort('maidens')}>Mdns{sortArrow('maidens')}</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayBowlers.map((s, i) => (
                <tr key={s.player_id} className={i === 0 && !sortCol ? 'font-semibold' : ''}>
                  <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="text-gray-900 hover:text-green-700 hover:underline truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                    {s.bbo_count > 0 && (
                      <span className="text-xs text-rose-500 font-semibold">🎳×{s.bbo_count}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold text-purple-700">{s.wickets}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{overs(s.balls_bowled)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.runs_given}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.balls_bowled > 0 ? s.econ.toFixed(2) : '—'}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.maidens}</td>
                  <td className="py-2 pl-1">
                    <button
                      title="Compare"
                      onClick={() => navigate(`/compare?a=${s.player_id}`)}
                      className="text-gray-300 hover:text-green-600 transition-colors text-xs"
                    >⚖️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'fielding' && (
        <div className="card overflow-x-auto">
          <h2 className="font-bold text-gray-900 mb-3">Top Fielders</h2>
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className="text-right pb-2 pr-2">M</th>
                <th className="text-right pb-2 pr-2">Ct</th>
                <th className="text-right pb-2 pr-2">RO</th>
                <th className="text-right pb-2 pr-2">St</th>
                <th className="text-right pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fielders.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-semibold' : ''}>
                  <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="text-gray-900 hover:text-green-700 hover:underline truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.catches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.run_outs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{s.stumpings}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-teal-700">
                    {s.catches + s.run_outs + s.stumpings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'allround' && (
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-1">All-Round Performers</h2>
          <p className="text-xs text-gray-400 mb-4">CricHeroes formula · min 2 matches · bat + bowl + field</p>
          <div className="space-y-2">
            {allrounders.map((s, i) => i < 3 ? (
              <div key={s.player_id} className={`flex items-center gap-4 p-4 rounded-2xl border ${
                i === 0 ? 'bg-amber-50 border-amber-200'
                : i === 1 ? 'bg-slate-50 border-slate-200'
                : 'bg-orange-50 border-orange-200'
              }`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white shadow-md shadow-amber-200'
                  : i === 1 ? 'bg-slate-400 text-white shadow-md shadow-slate-200'
                  : 'bg-orange-400 text-white shadow-md shadow-orange-200'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${s.player_id}`} className="font-bold text-gray-900 hover:text-green-700 truncate block">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </Link>
                  <div className="text-xs text-gray-500 mt-0.5">{s.runs}r · {s.wickets}w · {s.catches + s.run_outs + s.stumpings}dis</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl font-black tabular-nums ${
                    i === 0 ? 'text-amber-600' : i === 1 ? 'text-slate-500' : 'text-orange-500'
                  }`}>{s.ar_score.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ) : (
              <div key={s.player_id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</div>
                <Link to={`/player/${s.player_id}`} className="flex-1 font-medium text-sm text-gray-900 hover:text-green-700 truncate">
                  {playerMap[s.player_id]?.display_name ?? s.player_id}
                </Link>
                <div className="text-xs text-gray-500 shrink-0">{s.runs}r · {s.wickets}w · {s.catches + s.run_outs + s.stumpings}dis</div>
                <div className="text-sm font-bold tabular-nums text-gray-600 shrink-0">
                  {s.ar_score.toFixed(1)} <span className="text-xs text-gray-400 font-normal">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'mvp' && (
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-1">Season MVP</h2>
          <p className="text-xs text-gray-400 mb-4">CricHeroes formula · min 5 matches</p>
          <div className="space-y-2">
            {mvps.map((s, i) => i < 3 ? (
              <div key={s.player_id} className={`flex items-center gap-4 p-4 rounded-2xl border ${
                i === 0 ? 'bg-amber-50 border-amber-200'
                : i === 1 ? 'bg-slate-50 border-slate-200'
                : 'bg-orange-50 border-orange-200'
              }`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white shadow-md shadow-amber-200'
                  : i === 1 ? 'bg-slate-400 text-white shadow-md shadow-slate-200'
                  : 'bg-orange-400 text-white shadow-md shadow-orange-200'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${s.player_id}`} className="font-bold text-gray-900 hover:text-green-700 truncate block">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </Link>
                  <div className="text-xs text-gray-500 mt-0.5">{s.runs}r · {s.wickets}w · {s.catches}c</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl font-black tabular-nums ${
                    i === 0 ? 'text-amber-600' : i === 1 ? 'text-slate-500' : 'text-orange-500'
                  }`}>{s.mvp_score.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ) : (
              <div key={s.player_id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</div>
                <Link to={`/player/${s.player_id}`} className="flex-1 font-medium text-sm text-gray-900 hover:text-green-700 truncate">
                  {playerMap[s.player_id]?.display_name ?? s.player_id}
                </Link>
                <div className="text-sm font-bold tabular-nums text-gray-600">
                  {s.mvp_score.toFixed(1)} <span className="text-xs text-gray-400 font-normal">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!perfLoading && !isEmpty && tab === 'awards' && (() => {
        function ACard({ emoji, title, group = [], stat, unit, sub, variant = 'default' }) {
          const bg = variant === 'gold'  ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
                   : variant === 'spoon' ? 'bg-slate-50 border-slate-200'
                   : 'bg-gray-50 border-gray-100'
          const sc = variant === 'gold'  ? 'text-amber-600'
                   : variant === 'spoon' ? 'text-slate-400'
                   : 'text-green-700'
          if (!group.length) return (
            <div className={`rounded-xl border p-3 opacity-40 ${bg}`}>
              <div className="text-xl mb-1 grayscale">{emoji}</div>
              <div className="text-xs text-gray-400 font-medium mb-0.5">{title}</div>
              <div className="font-semibold text-gray-400 text-sm">—</div>
              <div className="text-xl font-black text-gray-300 leading-none mt-1">—</div>
              <div className="text-xs text-gray-300 mt-0.5">{unit}</div>
            </div>
          )
          const names = group.map(s => playerMap[s.player_id]?.display_name ?? '—').join(', ')
          const inner = (
            <>
              <div className="text-xl mb-1">{emoji}</div>
              <div className="text-xs text-gray-500 font-medium mb-0.5">{title}</div>
              <div className="font-semibold text-gray-900 text-sm leading-snug" title={names}>{names}</div>
              <div className={`text-xl font-black tabular-nums leading-none mt-1 ${sc}`}>{stat}</div>
              <div className="text-xs text-gray-400 mt-0.5">{unit}</div>
              {sub && <div className="text-[10px] text-gray-400 mt-1 truncate" title={sub}>{sub}</div>}
            </>
          )
          return group.length === 1
            ? <Link to={`/player/${group[0].player_id}`} className={`rounded-xl border p-3 hover:scale-[1.02] hover:shadow-md transition-all duration-150 block ${bg}`}>{inner}</Link>
            : <div className={`rounded-xl border p-3 ${bg}`}>{inner}</div>
        }
        return (
          <div className="space-y-4">
            {/* Season Champions */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Season Champions 🏆</h2>
              </div>
              {/* MVP — featured full-width */}
              {mvps.length > 0 && (() => {
                const mvpGroup = mvps.filter(s => s.mvp_score === mvps[0]?.mvp_score)
                const names = mvpGroup.map(s => playerMap[s.player_id]?.display_name ?? '—').join(', ')
                const inner = (
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
                    <div className="text-4xl">🌟</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Season MVP</div>
                      <div className="font-bold text-gray-900 text-base leading-snug truncate">{names}</div>
                      {mvpRU && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{mvpRU}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-3xl font-black tabular-nums text-amber-600 leading-none">{mvps[0].mvp_score.toFixed(1)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">pts</div>
                    </div>
                  </div>
                )
                return (
                  <div className="px-4 pt-4 pb-2">
                    {mvpGroup.length === 1
                      ? <Link to={`/player/${mvpGroup[0].player_id}`} className="hover:scale-[1.01] hover:shadow-md transition-all duration-150 block rounded-2xl">{inner}</Link>
                      : inner}
                  </div>
                )
              })()}
              <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="🏅" title="Most POTM Wins"  group={topPotm}    stat={topPotm[0]?.potm_count}   unit="times"   variant="gold" sub={potmRU}   />
                <ACard emoji="🏏" title="Top Scorer"      group={batters.filter(s => s.runs === batters[0]?.runs)}  stat={batters[0]?.runs}  unit="runs"    variant="gold" sub={scorerRU} />
                <ACard emoji="🎯" title="Wicket Wizard"   group={wicketWiz}  stat={wicketWiz[0]?.wickets}    unit="wickets" variant="gold" sub={wicketRU}  />
                <ACard emoji="💥" title="Six Machine"     group={sixMachine} stat={sixMachine[0]?.sixes}     unit="sixes"   variant="gold" />
                <ACard emoji="🦇" title="Best Batsman"    group={topBba}     stat={topBba[0]?.bba_count}     unit="awards"  variant="gold" />
                <ACard emoji="🎳" title="Best Bowler"     group={topBbo}     stat={topBbo[0]?.bbo_count}     unit="awards"  variant="gold" />
                <ACard emoji="🎽" title="Iron Man"        group={topAttendee ? [topAttendee] : []} stat={topAttendee ? `${topAttendee.attend_pct}%` : null} unit={`${topAttendee?.weeks_attended ?? 0}/${totalSessions} sessions`} variant="gold" />
              </div>
            </div>

            {/* Skill Awards */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-teal-600 to-emerald-500 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Skill Awards ⚡</h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="⚡" title="Lightning Bat"  group={lightningBat}  stat={lightningBat[0] ? (lightningBat[0].runs/lightningBat[0].balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} />
                <ACard emoji="🔒" title="Economy King"   group={economyKing}   stat={economyKing[0] ? economy(economyKing[0].runs_given, economyKing[0].balls_bowled) : null}    unit={`econ · min ${MIN_BOWL} balls`} />
                <ACard emoji="🎖️" title="Maiden Master" group={maidenMaster}  stat={maidenMaster[0]?.maidens}                                                                   unit="maidens" />
                <ACard emoji="🧤" title="Catch King"     group={catchKing}     stat={catchKing[0] ? catchKing[0].catches + catchKing[0].run_outs + catchKing[0].stumpings : null} unit="dismissals" />
                <ACard emoji="🏃" title="Workhorse"      group={workhorse}     stat={workhorse[0] ? overs(workhorse[0].balls_bowled) : null}                                     unit="overs" />
              </div>
            </div>

            {/* Wooden Spoons */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-slate-600 to-slate-500 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Wooden Spoons 🥄</h2>
                <p className="text-slate-300 text-xs mt-0.5">The not-so-glorious records…</p>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="🦆" title="Duck King"      group={duckKing}     stat={duckKing[0]?.ducks}              unit="golden ducks"              variant="spoon" />
                <ACard emoji="🐢" title="Slowcoach"      group={slowcoach}    stat={slowcoach[0] ? (slowcoach[0].runs/slowcoach[0].balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} variant="spoon" />
                <ACard emoji="💨" title="Wide Man"       group={wideMan}      stat={wideMan[0]?.wides ?? '—'}        unit="wides"                     variant="spoon" />
                <ACard emoji="⚾" title="No-Ball King"   group={noBallKing}   stat={noBallKing[0]?.no_balls ?? '—'}  unit="no balls"                  variant="spoon" />
                <ACard emoji="💸" title="Costly Bowler"  group={costlyBowler} stat={costlyBowler[0] ? economy(costlyBowler[0].runs_given, costlyBowler[0].balls_bowled) : null} unit={`econ · min ${MIN_BOWL} balls`} variant="spoon" />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

