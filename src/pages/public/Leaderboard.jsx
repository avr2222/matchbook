import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlayers, useConfig, useLeaderboard, useWeeks, useTournaments } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import { IconTrophy, IconMedal, IconStar, IconTarget, IconBolt, IconBallBowling, IconCricket } from '@tabler/icons-react'

const NOT_OUT_KEYS = new Set(['not out','dnb','did not bat','absent','retired hurt','absent hurt','retired not out',''])
const isInnings   = p => (p.balls_faced || 0) > 0
const isDismissed = p => isInnings(p) && !NOT_OUT_KEYS.has((p.dismissal ?? '').toLowerCase().trim())

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

  const seenWeekPlayer = new Set()
  const statsMap = {}
  for (const perf of perfs) {
    if (!statsMap[perf.player_id]) {
      statsMap[perf.player_id] = {
        player_id: perf.player_id,
        weeks_attended: 0,
        matches: 0, innings: 0, dismissals: 0,
        runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0,
        wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0,
        run_outs: 0, stumpings: 0, wides: 0, no_balls: 0, potm_count: 0, ducks: 0,
        bba_count: 0, bbo_count: 0,
      }
    }
    const s = statsMap[perf.player_id]
    const wpKey = `${perf.player_id}:${perf.week_id}`
    if (!seenWeekPlayer.has(wpKey)) {
      s.weeks_attended += 1
      seenWeekPlayer.add(wpKey)
    }
    s.matches    += 1
    if (isInnings(perf))   s.innings    += 1
    if (isDismissed(perf)) s.dismissals += 1
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
    { id: 'batting',  label: 'Batting'   },
    { id: 'bowling',  label: 'Bowling'   },
    { id: 'fielding', label: 'Fielding'  },
    { id: 'allround', label: 'All-round' },
    { id: 'mvp',      label: 'MVP'       },
    { id: 'awards',   label: 'Awards'    },
  ]
  const tournaments = [...(tData?.tournaments ?? [])].sort((a, b) => b.id.localeCompare(a.id))

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortArrow = col => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
  const thClass = col => `cursor-pointer select-none hover:text-gray-300 whitespace-nowrap${sortCol === col ? ' text-[#10b981] font-medium' : ''}`

  const displayBatters = (() => {
    const enriched = batters.map(s => ({
      ...s,
      avg: s.dismissals > 0 ? s.runs / s.dismissals : null,
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
    <div className="max-w-3xl mx-auto px-4 pb-12 pt-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <IconTrophy size={22} className="text-[#10b981]" />
        <div>
          <h1 className="text-[22px] font-medium text-gray-100">Season stats</h1>
          <p className="text-xs text-gray-400">{cfg?.team_name ?? 'Cricket Team'}</p>
        </div>
      </div>

      {/* Tournament selector */}
      {tournaments.length > 1 && (
        <div className="overflow-x-auto -mx-1 px-1 mb-4">
          <div className="flex gap-2 w-max">
            {tournaments.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTId(t.id === cfg?.active_tournament_id ? null : t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tournamentId === t.id
                    ? 'bg-[#10b981] text-white'
                    : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
                }`}
              >
                {t.short_name ?? t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="overflow-x-auto -mx-4 px-4 mb-6">
        <div className="flex gap-1 bg-white/[0.04] p-1 rounded-xl w-max min-w-full">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSortCol(null); setSortDir('desc') }}
              className={`py-2 px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-white/[0.08] text-[#10b981]' : 'text-gray-500 hover:text-gray-200'
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
          <p className="font-medium text-gray-300">No stats yet</p>
          <p className="text-sm text-gray-400 mt-1">Run the CricHeroes sync to populate player stats.</p>
        </div>
      )}

      {/* Batting */}
      {!perfLoading && !isEmpty && tab === 'batting' && (
        <div className="card overflow-x-auto">
          <h2 className="font-medium text-gray-100 mb-3">Top batters</h2>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-[0.05em] border-b border-white/[0.06]">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className={`text-right pb-2 pr-2 ${thClass('matches')}`}    onClick={() => toggleSort('matches')}>M{sortArrow('matches')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('innings')}`}    onClick={() => toggleSort('innings')}>Inns{sortArrow('innings')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('runs')}`}       onClick={() => toggleSort('runs')}>Runs{sortArrow('runs')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('avg')}`}        onClick={() => toggleSort('avg')}>Avg{sortArrow('avg')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('sr')}`}         onClick={() => toggleSort('sr')}>SR{sortArrow('sr')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('high_score')}`} onClick={() => toggleSort('high_score')}>HS{sortArrow('high_score')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('fours')}`}      onClick={() => toggleSort('fours')}>4s{sortArrow('fours')}</th>
                <th className={`text-right pb-2 ${thClass('sixes')}`}           onClick={() => toggleSort('sixes')}>6s{sortArrow('sixes')}</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {displayBatters.map((s, i) => (
                <tr key={s.player_id} className={i === 0 && !sortCol ? 'font-medium' : ''}>
                  <td className="py-2 text-gray-500 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="font-medium text-gray-100 hover:text-[#10b981] truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                    {s.bba_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#10b981]">
                        <IconStar size={10} />{s.bba_count}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.innings}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-medium text-[#10b981]">{s.runs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.avg != null ? s.avg.toFixed(1) : '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.balls_faced > 0 ? s.sr.toFixed(1) : '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.high_score}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.fours}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.sixes}</td>
                  <td className="py-2 pl-1">
                    <button
                      title="Compare"
                      onClick={() => navigate(`/compare?a=${s.player_id}`)}
                      className="text-gray-300 hover:text-[#1D9E75] transition-colors text-xs font-medium"
                    >vs</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bowling */}
      {!perfLoading && !isEmpty && tab === 'bowling' && (
        <div className="card overflow-x-auto">
          <h2 className="font-medium text-gray-100 mb-3">Top bowlers</h2>
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-[0.05em] border-b border-white/[0.06]">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className={`text-right pb-2 pr-2 ${thClass('matches')}`}      onClick={() => toggleSort('matches')}>M{sortArrow('matches')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('wickets')}`}      onClick={() => toggleSort('wickets')}>Wkts{sortArrow('wickets')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('balls_bowled')}`} onClick={() => toggleSort('balls_bowled')}>Ovrs{sortArrow('balls_bowled')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('runs_given')}`}   onClick={() => toggleSort('runs_given')}>Runs{sortArrow('runs_given')}</th>
                <th className={`text-right pb-2 pr-2 ${thClass('econ')}`}         onClick={() => toggleSort('econ')}>Econ{sortArrow('econ')}</th>
                <th className={`text-right pb-2 ${thClass('maidens')}`}           onClick={() => toggleSort('maidens')}>Mdns{sortArrow('maidens')}</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {displayBowlers.map((s, i) => (
                <tr key={s.player_id} className={i === 0 && !sortCol ? 'font-medium' : ''}>
                  <td className="py-2 text-gray-500 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="font-medium text-gray-100 hover:text-[#10b981] truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                    {s.bbo_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-purple-400">
                        <IconBallBowling size={10} />{s.bbo_count}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-medium text-purple-400">{s.wickets}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{overs(s.balls_bowled)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.runs_given}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.balls_bowled > 0 ? s.econ.toFixed(2) : '—'}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{s.maidens}</td>
                  <td className="py-2 pl-1">
                    <button
                      title="Compare"
                      onClick={() => navigate(`/compare?a=${s.player_id}`)}
                      className="text-gray-300 hover:text-[#1D9E75] transition-colors text-xs font-medium"
                    >vs</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fielding */}
      {!perfLoading && !isEmpty && tab === 'fielding' && (
        <div className="card overflow-x-auto">
          <h2 className="font-medium text-gray-100 mb-3">Top fielders</h2>
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-[0.05em] border-b border-white/[0.06]">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2 pr-2">Player</th>
                <th className="text-right pb-2 pr-2">M</th>
                <th className="text-right pb-2 pr-2">Ct</th>
                <th className="text-right pb-2 pr-2">RO</th>
                <th className="text-right pb-2 pr-2">St</th>
                <th className="text-right pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {fielders.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-medium' : ''}>
                  <td className="py-2 text-gray-500 text-xs">{i + 1}</td>
                  <td className="py-2 pr-2 max-w-[140px]">
                    <Link to={`/player/${s.player_id}`} className="font-medium text-gray-100 hover:text-[#10b981] truncate block">
                      {playerMap[s.player_id]?.display_name ?? s.player_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-500">{s.matches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.catches}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.run_outs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-400">{s.stumpings}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-[#10b981]">
                    {s.catches + s.run_outs + s.stumpings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All-round */}
      {!perfLoading && !isEmpty && tab === 'allround' && (
        <div className="card">
          <h2 className="font-medium text-gray-100 mb-1">All-round performers</h2>
          <p className="text-xs text-gray-400 mb-4">CricHeroes formula · min 2 matches · bat + bowl + field</p>
          <div className="space-y-2">
            {allrounders.map((s, i) => i < 3 ? (
              <div key={s.player_id} className={`flex items-center gap-4 p-4 rounded-xl border ${
                i === 0 ? 'bg-amber-900/20 border-amber-500/30'
                : i === 1 ? 'bg-slate-800/30 border-slate-600/30'
                : 'bg-orange-900/20 border-orange-500/30'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-medium shrink-0 ${
                  i === 0 ? 'bg-amber-500/80 text-white'
                  : i === 1 ? 'bg-slate-500/80 text-white'
                  : 'bg-orange-500/80 text-white'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${s.player_id}`} className="font-medium text-gray-100 hover:text-[#10b981] truncate block">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">{s.runs}r · {s.wickets}w · {s.catches + s.run_outs + s.stumpings}dis</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[24px] font-medium tabular-nums ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : 'text-orange-400'
                  }`}>{s.ar_score.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ) : (
              <div key={s.player_id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-white/[0.03]">
                <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-xs font-medium text-gray-400 shrink-0">{i + 1}</div>
                <Link to={`/player/${s.player_id}`} className="flex-1 font-medium text-sm text-gray-100 hover:text-[#10b981] truncate">
                  {playerMap[s.player_id]?.display_name ?? s.player_id}
                </Link>
                <div className="text-xs text-gray-400 shrink-0">{s.runs}r · {s.wickets}w · {s.catches + s.run_outs + s.stumpings}dis</div>
                <div className="text-sm font-medium tabular-nums text-gray-300 shrink-0">
                  {s.ar_score.toFixed(1)} <span className="text-xs text-gray-400 font-normal">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP */}
      {!perfLoading && !isEmpty && tab === 'mvp' && (
        <div className="card">
          <h2 className="font-medium text-gray-100 mb-1">Season MVP</h2>
          <p className="text-xs text-gray-400 mb-4">CricHeroes formula · min 5 matches</p>
          <div className="space-y-2">
            {mvps.map((s, i) => i < 3 ? (
              <div key={s.player_id} className={`flex items-center gap-4 p-4 rounded-xl border ${
                i === 0 ? 'bg-amber-900/20 border-amber-500/30'
                : i === 1 ? 'bg-slate-800/30 border-slate-600/30'
                : 'bg-orange-900/20 border-orange-500/30'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-medium shrink-0 ${
                  i === 0 ? 'bg-amber-500/80 text-white'
                  : i === 1 ? 'bg-slate-500/80 text-white'
                  : 'bg-orange-500/80 text-white'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${s.player_id}`} className="font-medium text-gray-100 hover:text-[#10b981] truncate block">
                    {playerMap[s.player_id]?.display_name ?? s.player_id}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">{s.runs}r · {s.wickets}w · {s.catches}c</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[24px] font-medium tabular-nums ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : 'text-orange-400'
                  }`}>{s.mvp_score.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ) : (
              <div key={s.player_id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-white/[0.03]">
                <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-xs font-medium text-gray-400 shrink-0">{i + 1}</div>
                <Link to={`/player/${s.player_id}`} className="flex-1 font-medium text-sm text-gray-100 hover:text-[#10b981] truncate">
                  {playerMap[s.player_id]?.display_name ?? s.player_id}
                </Link>
                <div className="text-sm font-medium tabular-nums text-gray-300">
                  {s.mvp_score.toFixed(1)} <span className="text-xs text-gray-400 font-normal">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Awards */}
      {!perfLoading && !isEmpty && tab === 'awards' && (() => {
        function ACard({ Icon, title, group = [], stat, unit, sub, variant = 'default' }) {
          const bg = variant === 'gold'  ? 'bg-amber-900/20 border-amber-500/20'
                   : variant === 'spoon' ? 'bg-slate-800/30 border-slate-500/20'
                   : 'bg-white/[0.03] border-white/[0.06]'
          const sc = variant === 'gold'  ? 'text-amber-400'
                   : variant === 'spoon' ? 'text-slate-400'
                   : 'text-[#10b981]'
          if (!group.length) return (
            <div className={`rounded-xl border p-3 opacity-40 ${bg}`}>
              {Icon && <Icon size={16} className="text-gray-500 mb-1" />}
              <div className="text-xs text-gray-500 font-medium mb-0.5">{title}</div>
              <div className="font-medium text-gray-500 text-sm">—</div>
              <div className="text-[24px] font-medium text-gray-600 leading-none mt-1">—</div>
              <div className="text-xs text-gray-600 mt-0.5">{unit}</div>
            </div>
          )
          const names = group.map(s => playerMap[s.player_id]?.display_name ?? '—').join(', ')
          const inner = (
            <>
              {Icon && <Icon size={16} className={`mb-1 ${sc}`} />}
              <div className="text-xs text-gray-400 font-medium mb-0.5">{title}</div>
              <div className="font-medium text-gray-100 text-sm leading-snug" title={names}>{names}</div>
              <div className={`text-[24px] font-medium tabular-nums leading-none mt-1 ${sc}`}>{stat}</div>
              <div className="text-xs text-gray-400 mt-0.5">{unit}</div>
              {sub && <div className="text-[10px] text-gray-500 mt-1 truncate" title={sub}>{sub}</div>}
            </>
          )
          return group.length === 1
            ? <Link to={`/player/${group[0].player_id}`} className={`rounded-xl border p-3 hover:opacity-90 transition-opacity block ${bg}`}>{inner}</Link>
            : <div className={`rounded-xl border p-3 ${bg}`}>{inner}</div>
        }
        return (
          <div className="space-y-4">
            {/* Season Champions */}
            <div className="card overflow-hidden p-0">
              <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
                <IconTrophy size={15} className="text-white" />
                <h2 className="font-medium text-white text-sm uppercase tracking-[0.05em]">Season Champions</h2>
              </div>
              {mvps.length > 0 && (() => {
                const mvpGroup = mvps.filter(s => s.mvp_score === mvps[0]?.mvp_score)
                const names = mvpGroup.map(s => playerMap[s.player_id]?.display_name ?? '—').join(', ')
                const inner = (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 flex items-center gap-4">
                    <IconStar size={28} className="text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-[0.05em]">Season MVP</div>
                      <div className="font-medium text-gray-100 text-sm leading-snug truncate">{names}</div>
                      {mvpRU && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{mvpRU}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[24px] font-medium tabular-nums text-amber-400 leading-none">{mvps[0].mvp_score.toFixed(1)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">pts</div>
                    </div>
                  </div>
                )
                return (
                  <div className="px-4 pt-4 pb-2">
                    {mvpGroup.length === 1
                      ? <Link to={`/player/${mvpGroup[0].player_id}`} className="hover:opacity-90 transition-opacity block rounded-xl">{inner}</Link>
                      : inner}
                  </div>
                )
              })()}
              <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard Icon={IconMedal}       title="Most POTM wins"  group={topPotm}    stat={topPotm[0]?.potm_count}   unit="times"   variant="gold" sub={potmRU}   />
                <ACard Icon={IconCricket}     title="Top scorer"      group={batters.filter(s => s.runs === batters[0]?.runs)}  stat={batters[0]?.runs}  unit="runs"    variant="gold" sub={scorerRU} />
                <ACard Icon={IconTarget}      title="Wicket wizard"   group={wicketWiz}  stat={wicketWiz[0]?.wickets}    unit="wickets" variant="gold" sub={wicketRU}  />
                <ACard Icon={IconBolt}        title="Six machine"     group={sixMachine} stat={sixMachine[0]?.sixes}     unit="sixes"   variant="gold" />
                <ACard Icon={IconStar}        title="Best batsman"    group={topBba}     stat={topBba[0]?.bba_count}     unit="awards"  variant="gold" />
                <ACard Icon={IconBallBowling} title="Best bowler"     group={topBbo}     stat={topBbo[0]?.bbo_count}     unit="awards"  variant="gold" />
                <ACard Icon={IconTrophy}      title="Iron Man"        group={topAttendee ? [topAttendee] : []} stat={topAttendee ? `${topAttendee.attend_pct}%` : null} unit={`${topAttendee?.weeks_attended ?? 0}/${totalSessions} sessions`} variant="gold" />
              </div>
            </div>

            {/* Skill Awards */}
            <div className="card overflow-hidden p-0">
              <div className="bg-[#10b981] px-5 py-3 flex items-center gap-2">
                <IconBolt size={15} className="text-white" />
                <h2 className="font-medium text-white text-sm uppercase tracking-[0.05em]">Skill Awards</h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard Icon={IconBolt}        title="Lightning bat"  group={lightningBat}  stat={lightningBat[0] ? (lightningBat[0].runs/lightningBat[0].balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} />
                <ACard Icon={IconTarget}      title="Economy king"   group={economyKing}   stat={economyKing[0] ? economy(economyKing[0].runs_given, economyKing[0].balls_bowled) : null}    unit={`econ · min ${MIN_BOWL} balls`} />
                <ACard Icon={IconMedal}       title="Maiden master"  group={maidenMaster}  stat={maidenMaster[0]?.maidens}                                                                   unit="maidens" />
                <ACard Icon={IconStar}        title="Catch king"     group={catchKing}     stat={catchKing[0] ? catchKing[0].catches + catchKing[0].run_outs + catchKing[0].stumpings : null} unit="dismissals" />
                <ACard Icon={IconBallBowling} title="Workhorse"      group={workhorse}     stat={workhorse[0] ? overs(workhorse[0].balls_bowled) : null}                                     unit="overs" />
              </div>
            </div>

            {/* Wooden Spoons */}
            <div className="card overflow-hidden p-0">
              <div className="bg-slate-600 px-5 py-3">
                <h2 className="font-medium text-white text-sm uppercase tracking-[0.05em]">Wooden Spoons</h2>
                <p className="text-slate-300 text-xs mt-0.5">The not-so-glorious records…</p>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard title="Duck king"     group={duckKing}     stat={duckKing[0]?.ducks}              unit="golden ducks"              variant="spoon" />
                <ACard title="Slowcoach"     group={slowcoach}    stat={slowcoach[0] ? (slowcoach[0].runs/slowcoach[0].balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} variant="spoon" />
                <ACard title="Wide man"      group={wideMan}      stat={wideMan[0]?.wides ?? '—'}        unit="wides"                     variant="spoon" />
                <ACard title="No-ball king"  group={noBallKing}   stat={noBallKing[0]?.no_balls ?? '—'}  unit="no balls"                  variant="spoon" />
                <ACard title="Costly bowler" group={costlyBowler} stat={costlyBowler[0] ? economy(costlyBowler[0].runs_given, costlyBowler[0].balls_bowled) : null} unit={`econ · min ${MIN_BOWL} balls`} variant="spoon" />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
