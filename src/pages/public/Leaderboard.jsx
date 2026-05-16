import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
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
        run_outs: 0, stumpings: 0, wides: 0, no_balls: 0, potm_count: 0, ducks: 0,
        bba_count: 0, bbo_count: 0,
      }
    }
    const s = statsMap[perf.player_id]
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

  // Awards tab
  const MIN_BAT = 40, MIN_BOWL = 30
  const topPotm      = [...allStats].filter(s => s.potm_count > 0).sort((a,b) => b.potm_count - a.potm_count)[0]
  const topBba       = [...allStats].filter(s => s.bba_count > 0).sort((a,b) => b.bba_count - a.bba_count)[0]
  const topBbo       = [...allStats].filter(s => s.bbo_count > 0).sort((a,b) => b.bbo_count - a.bbo_count)[0]
  const sixMachine   = [...allStats].filter(s => s.sixes > 0).sort((a,b) => b.sixes - a.sixes)[0]
  const wicketWiz    = [...allStats].filter(s => s.wickets > 0).sort((a,b) => b.wickets - a.wickets)[0]
  const lightningBat = [...allStats].filter(s => s.balls_faced >= MIN_BAT).sort((a,b) => (b.runs/b.balls_faced)-(a.runs/a.balls_faced))[0]
  const economyKing  = [...allStats].filter(s => s.balls_bowled >= MIN_BOWL).sort((a,b) => (a.runs_given/a.balls_bowled)-(b.runs_given/b.balls_bowled))[0]
  const maidenMaster = [...allStats].filter(s => s.maidens > 0).sort((a,b) => b.maidens - a.maidens)[0]
  const catchKing    = [...allStats].filter(s => (s.catches+s.run_outs+s.stumpings) > 0).sort((a,b) => (b.catches+b.run_outs+b.stumpings)-(a.catches+a.run_outs+a.stumpings))[0]
  const workhorse    = [...allStats].filter(s => s.balls_bowled > 0).sort((a,b) => b.balls_bowled - a.balls_bowled)[0]
  const duckKing     = [...allStats].filter(s => s.ducks > 0).sort((a,b) => b.ducks - a.ducks)[0]
  const slowcoach    = [...allStats].filter(s => s.balls_faced >= MIN_BAT).sort((a,b) => (a.runs/a.balls_faced)-(b.runs/b.balls_faced))[0]
  const wideMan      = [...allStats].filter(s => s.wides > 0).sort((a,b) => b.wides - a.wides)[0]
  const noBallKing   = [...allStats].filter(s => s.no_balls > 0).sort((a,b) => b.no_balls - a.no_balls)[0]
  const costlyBowler = [...allStats].filter(s => s.balls_bowled >= MIN_BOWL).sort((a,b) => (b.runs_given/b.balls_bowled)-(a.runs_given/a.balls_bowled))[0]

  const tabs = [
    { id: 'batting', label: 'Batting' },
    { id: 'bowling', label: 'Bowling' },
    { id: 'mvp',     label: 'MVP' },
    { id: 'awards',  label: 'Awards' },
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

      <div className="flex gap-1 bg-gray-100/80 p-1 rounded-2xl mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
              tab === t.id ? 'bg-white shadow-sm text-green-700' : 'text-gray-400 hover:text-gray-600'
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
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batters.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-semibold' : ''}>
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
                    {s.matches > 0 ? (s.runs / s.matches).toFixed(1) : '—'}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{strikeRate(s.runs, s.balls_faced)}</td>
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
                <th className="text-right pb-2 pr-2">M</th>
                <th className="text-right pb-2 pr-2">Wkts</th>
                <th className="text-right pb-2 pr-2">Overs</th>
                <th className="text-right pb-2 pr-2">Runs</th>
                <th className="text-right pb-2 pr-2">Econ</th>
                <th className="text-right pb-2">Mdns</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bowlers.map((s, i) => (
                <tr key={s.player_id} className={i === 0 ? 'font-semibold' : ''}>
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
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{economy(s.runs_given, s.balls_bowled)}</td>
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
        function ACard({ emoji, title, pid, stat, unit, variant = 'default' }) {
          const bg = variant === 'gold'  ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
                   : variant === 'spoon' ? 'bg-slate-50 border-slate-200'
                   : 'bg-gray-50 border-gray-100'
          const sc = variant === 'gold'  ? 'text-amber-600'
                   : variant === 'spoon' ? 'text-slate-400'
                   : 'text-green-700'
          if (!pid) return (
            <div className={`rounded-xl border p-3 opacity-40 ${bg}`}>
              <div className="text-xl mb-1 grayscale">{emoji}</div>
              <div className="text-xs text-gray-400 font-medium mb-0.5">{title}</div>
              <div className="font-semibold text-gray-400 text-sm">—</div>
              <div className="text-xl font-black text-gray-300 leading-none mt-1">—</div>
              <div className="text-xs text-gray-300 mt-0.5">{unit}</div>
            </div>
          )
          return (
            <Link to={`/player/${pid}`} className={`rounded-xl border p-3 hover:scale-[1.02] hover:shadow-md transition-all duration-150 block ${bg}`}>
              <div className="text-xl mb-1">{emoji}</div>
              <div className="text-xs text-gray-500 font-medium mb-0.5">{title}</div>
              <div className="font-semibold text-gray-900 text-sm truncate">{playerMap[pid]?.display_name ?? '—'}</div>
              <div className={`text-xl font-black tabular-nums leading-none mt-1 ${sc}`}>{stat}</div>
              <div className="text-xs text-gray-400 mt-0.5">{unit}</div>
            </Link>
          )
        }
        return (
          <div className="space-y-4">
            {/* Season Champions */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Season Champions 🏆</h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="🌟" title="Season MVP"       pid={mvps[0]?.player_id}    stat={mvps[0]?.mvp_score.toFixed(1)} unit="pts"     variant="gold" />
                <ACard emoji="🏅" title="Most POTM Wins"  pid={topPotm?.player_id}    stat={topPotm?.potm_count}           unit="times"   variant="gold" />
                <ACard emoji="🏏" title="Top Scorer"      pid={batters[0]?.player_id} stat={batters[0]?.runs}              unit="runs"    variant="gold" />
                <ACard emoji="🎯" title="Wicket Wizard"   pid={wicketWiz?.player_id}  stat={wicketWiz?.wickets}            unit="wickets" variant="gold" />
                <ACard emoji="💥" title="Six Machine"     pid={sixMachine?.player_id} stat={sixMachine?.sixes}             unit="sixes"   variant="gold" />
                <ACard emoji="🦇" title="Best Batsman"    pid={topBba?.player_id}     stat={topBba?.bba_count}             unit="awards"  variant="gold" />
                <ACard emoji="🎳" title="Best Bowler"     pid={topBbo?.player_id}     stat={topBbo?.bbo_count}             unit="awards"  variant="gold" />
              </div>
            </div>

            {/* Skill Awards */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-teal-600 to-emerald-500 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Skill Awards ⚡</h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="⚡" title="Lightning Bat"  pid={lightningBat?.player_id}  stat={lightningBat ? (lightningBat.runs/lightningBat.balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} />
                <ACard emoji="🔒" title="Economy King"   pid={economyKing?.player_id}   stat={economyKing ? economy(economyKing.runs_given, economyKing.balls_bowled) : null}    unit={`econ · min ${MIN_BOWL} balls`} />
                <ACard emoji="🎖️" title="Maiden Master" pid={maidenMaster?.player_id}  stat={maidenMaster?.maidens}         unit="maidens" />
                <ACard emoji="🧤" title="Catch King"     pid={catchKing?.player_id}     stat={catchKing ? catchKing.catches + catchKing.run_outs + catchKing.stumpings : null} unit="dismissals" />
                <ACard emoji="🏃" title="Workhorse"      pid={workhorse?.player_id}     stat={workhorse ? overs(workhorse.balls_bowled) : null}                                unit="overs" />
              </div>
            </div>

            {/* Wooden Spoons */}
            <div className="card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-slate-600 to-slate-500 px-5 py-3">
                <h2 className="font-black text-white text-sm uppercase tracking-widest">Wooden Spoons 🥄</h2>
                <p className="text-slate-300 text-xs mt-0.5">The not-so-glorious records…</p>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ACard emoji="🦆" title="Duck King"      pid={duckKing?.player_id}      stat={duckKing?.ducks}             unit="golden ducks"             variant="spoon" />
                <ACard emoji="🐢" title="Slowcoach"      pid={slowcoach?.player_id}     stat={slowcoach ? (slowcoach.runs/slowcoach.balls_faced*100).toFixed(1) : null} unit={`SR · min ${MIN_BAT} balls`} variant="spoon" />
                <ACard emoji="💨" title="Wide Man"       pid={wideMan?.player_id}       stat={wideMan?.wides ?? '—'}       unit="wides"                    variant="spoon" />
                <ACard emoji="⚾" title="No-Ball King"   pid={noBallKing?.player_id}    stat={noBallKing?.no_balls ?? '—'} unit="no balls"                 variant="spoon" />
                <ACard emoji="💸" title="Costly Bowler"  pid={costlyBowler?.player_id}  stat={costlyBowler ? economy(costlyBowler.runs_given, costlyBowler.balls_bowled) : null} unit={`econ · min ${MIN_BOWL} balls`} variant="spoon" />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

