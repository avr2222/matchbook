import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useAttendance, useTournaments, useConfig, useAnnouncements, useExpenses, useTransactions, useLeaderboard } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { format, parseISO } from 'date-fns'

export default function Dashboard() {
  const [detail, setDetail]         = useState(null)
  const [payPlayer, setPayPlayer]   = useState('')
  const [payAmt, setPayAmt]         = useState('')
  const [copied, setCopied]         = useState(false)
  const [activeStatus, setActiveStatus] = useState(null) // 'good'|'collect_soon'|'urgent'|'overdue'
  const { data: cfg }     = useConfig()
  const { data: tData }   = useTournaments()
  const { data: pData, isLoading: pLoad } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: aData }   = useAttendance()
  const { data: annData } = useAnnouncements()
  const { data: eData }   = useExpenses()
  const { data: txnData } = useTransactions()
  const { data: perfData } = useLeaderboard(cfg?.active_tournament_id)

  if (pLoad) return <PageSpinner />

  const activeTournamentId = tData?.active_tournament_id ?? cfg?.active_tournament_id
  const allActive    = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = allActive.filter(p => p.type === 'corpus' || p.type === 'new')
  const weeks        = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed    = weeks.filter(w => w.status === 'completed')
  const records      = aData?.records ?? []
  const seasonName   = tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? cfg?.team_name ?? 'Season'

  // Series score — prefer winning_team column; fall back to parsing result string
  const _parseWinner = result => {
    const m = (result ?? '').match(/^(.+?)\s+(\d+)-(\d+)$/)
    if (!m) return ''
    return parseInt(m[2]) !== parseInt(m[3]) ? m[1].trim() : ''
  }
  const seriesWins = {}
  completed.forEach(w => {
    const winner = w.winning_team || _parseWinner(w.result)
    if (winner) seriesWins[winner] = (seriesWins[winner] || 0) + 1
  })
  const seriesTeams = Object.entries(seriesWins).sort((a, b) => b[1] - a[1])
  const seriesLeader = seriesTeams[0]
  const seriesDraws = completed.filter(w => !(w.winning_team || _parseWinner(w.result))).length
  const sortedCompleted = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date))
  let winStreak = 0
  if (seriesLeader) {
    for (const w of sortedCompleted) {
      if ((w.winning_team || _parseWinner(w.result)) === seriesLeader[0]) winStreak++
      else break
    }
  }

  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  corpusPlayers.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })
  const remainingPool = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const recentWeeks   = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)
  const todayStr      = new Date().toISOString().slice(0, 10)
  const sortedCorpus  = [...corpusPlayers].sort((a, b) => a.display_name.localeCompare(b.display_name))
  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= todayStr)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posted_on.localeCompare(a.posted_on))

  const statusBar = [
    { key: 'good',         label: 'Good',         color: 'bg-emerald-500' },
    { key: 'collect_soon', label: 'Collect Soon',  color: 'bg-amber-400'   },
    { key: 'urgent',       label: 'Urgent',        color: 'bg-orange-500'  },
    { key: 'overdue',      label: 'Overdue',       color: 'bg-red-500'     },
  ]
  const corpusTotal = corpusPlayers.length || 1
  const atRiskCount = statusCounts.urgent + statusCounts.overdue
  const upiId       = cfg?.admin_upi_id
  const threshold   = cfg?.corpus_low_threshold ?? 1000

  const allExpenses   = eData?.expenses ?? []
  const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)

  // Group match_deduction transactions by week → one summary entry per match
  const allWeeks = wData?.weeks ?? []
  const deductionByWeek = {}
  ;(txnData?.transactions ?? [])
    .filter(t => t.type === 'match_deduction')
    .forEach(t => {
      if (!deductionByWeek[t.week_id]) {
        const week = allWeeks.find(w => w.week_id === t.week_id)
        deductionByWeek[t.week_id] = { date: t.date, label: week?.label ?? t.week_id, total: 0, count: 0 }
      }
      deductionByWeek[t.week_id].total += t.amount ?? 0
      deductionByWeek[t.week_id].count += 1
    })
  const deductionEntries = Object.entries(deductionByWeek).map(([weekId, d]) => ({
    id: `deduct_${weekId}`,
    _type: 'deduction',
    description: `Match fees — ${d.label}`,
    date: d.date,
    amount: d.total,
    count: d.count,
  }))

  const recentActivity = [...allExpenses.map(e => ({ ...e, _type: 'expense' })), ...deductionEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)

  const perfs = perfData?.performances ?? []
  const _sMap = {}
  for (const perf of perfs) {
    if (!_sMap[perf.player_id]) _sMap[perf.player_id] = {
      player_id: perf.player_id, runs: 0, balls_faced: 0, fours: 0, sixes: 0,
      wickets: 0, runs_given: 0, balls_bowled: 0, catches: 0,
      maidens: 0, run_outs: 0, stumpings: 0, match_count: 0,
      potm_count: 0, bba_count: 0, bbo_count: 0,
    }
    const s = _sMap[perf.player_id]
    s.runs         += perf.runs         || 0
    s.balls_faced  += perf.balls_faced  || 0
    s.fours        += perf.fours        || 0
    s.sixes        += perf.sixes        || 0
    s.wickets      += perf.wickets      || 0
    s.runs_given   += perf.runs_given   || 0
    s.balls_bowled += perf.balls_bowled || 0
    s.catches      += perf.catches      || 0
    s.maidens      += perf.maidens      || 0
    s.run_outs     += perf.run_outs     || 0
    s.stumpings    += perf.stumpings    || 0
    s.match_count  += perf.match_count  || 1
    s.potm_count   += perf.potm_count   || 0
    s.bba_count    += perf.bba_count    || 0
    s.bbo_count    += perf.bbo_count    || 0
  }
  const _allS = Object.values(_sMap)
  const _topGroup = (arr, fn) => { const top = fn(arr[0]); return arr.filter(s => fn(s) === top) }
  const topBatterArr = _allS.filter(s => s.runs > 0).sort((a, b) => b.runs - a.runs)
  const topBowlerArr = _allS.filter(s => s.wickets > 0).sort((a, b) => b.wickets - a.wickets)
  const topPotmArr   = _allS.filter(s => s.potm_count > 0).sort((a, b) => b.potm_count - a.potm_count)
  const topBbaArr    = _allS.filter(s => s.bba_count > 0).sort((a, b) => b.bba_count - a.bba_count)
  const topBboArr    = _allS.filter(s => s.bbo_count > 0).sort((a, b) => b.bbo_count - a.bbo_count)
  const topBatter = topBatterArr.length ? _topGroup(topBatterArr, s => s.runs) : []
  const topBowler = topBowlerArr.length ? _topGroup(topBowlerArr, s => s.wickets) : []
  const topPotm   = topPotmArr.length   ? _topGroup(topPotmArr, s => s.potm_count) : []
  const topBba    = topBbaArr.length    ? _topGroup(topBbaArr, s => s.bba_count) : []
  const topBbo    = topBboArr.length    ? _topGroup(topBboArr, s => s.bbo_count) : []
  const WKT_PTS   = 1.2
  const _mvpSorted = _allS
    .filter(s => s.match_count >= 5)
    .map(s => ({
      ...s,
      score: parseFloat((
        (s.runs / 10) * 1.08
        + s.wickets * WKT_PTS
        + Math.floor(s.maidens / 2) * WKT_PTS
        + (s.catches + s.stumpings) * (WKT_PTS * 0.2)
        + s.run_outs * WKT_PTS
      ).toFixed(1)),
    }))
    .filter(s => s.score > 0).sort((a, b) => b.score - a.score)
  const topMvp = _mvpSorted.length ? _topGroup(_mvpSorted, s => s.score) : []
  const perfPlayerMap = Object.fromEntries((pData?.players ?? []).map(p => [p.id, p]))

  const recentWeekIds = new Set(recentWeeks.slice(0, 3).map(w => w.week_id))
  const recentPerfs   = perfs.filter(p => recentWeekIds.has(p.week_id))
  const recentMap     = {}
  recentPerfs.forEach(p => {
    if (!recentMap[p.player_id]) recentMap[p.player_id] = { runs: 0, wickets: 0, matches: 0 }
    recentMap[p.player_id].runs    += p.runs    || 0
    recentMap[p.player_id].wickets += p.wickets || 0
    recentMap[p.player_id].matches += 1
  })
  const hotPlayers = Object.entries(recentMap)
    .map(([pid, recent]) => {
      const season = _sMap[pid]
      if (!season || season.match_count < 3) return null
      const avgRuns = season.runs / season.match_count
      const avgWkts = season.wickets / season.match_count
      const recentAvgRuns = recent.runs / recent.matches
      const recentAvgWkts = recent.wickets / recent.matches
      const score = ((recentAvgRuns - avgRuns) / Math.max(avgRuns, 1)) +
                    ((recentAvgWkts - avgWkts) / Math.max(avgWkts, 0.5))
      return score > 0.3
        ? { pid, score, recentRuns: recent.runs, recentWkts: recent.wickets, matches: recent.matches }
        : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const EXPENSE_LABELS = {
    match_cost: 'Match Cost', ground_booking: 'Ground Booking', cricket_ball: 'Cricket Ball',
    cricket_bat: 'Cricket Bat', equipment: 'Equipment', refreshments: 'Refreshments',
    kit: 'Kit / Uniform', other: 'Other',
  }

  const stats = [
    { label: 'Active Players',   value: allActive.length,                                       icon: '👥', to: '/players',            bg: 'from-blue-500 to-blue-600'    },
    { label: 'Weeks Played',     value: completed.length,                                       icon: '🏏', to: '/admin/weeks',         bg: 'from-green-500 to-emerald-600' },
    { label: 'Corpus Balance',   value: `₹${Math.round(remainingPool).toLocaleString('en-IN')}`, icon: '💰', to: '/admin/transactions',  bg: 'from-amber-500 to-orange-500'  },
    { label: 'Season',           value: seasonName,                                             icon: '🏆', to: '/admin',               bg: 'from-purple-500 to-violet-600' },
  ]

  const selectedP    = payPlayer ? corpusPlayers.find(p => p.id === payPlayer) : null
  const payNeeded    = selectedP ? Math.max(threshold - (selectedP.corpus_balance ?? 0), 500) : 500
  const paySuggested = selectedP ? Math.ceil(payNeeded / 500) * 500 : 500
  const payFinal     = payAmt && parseInt(payAmt, 10) >= 100 ? parseInt(payAmt, 10) : paySuggested
  const isMobile     = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const payName      = encodeURIComponent(cfg?.team_name ?? 'Cricket Team')
  const payNote      = selectedP ? encodeURIComponent(`Corpus Topup - ${selectedP.display_name}`) : ''
  const upiHref      = selectedP ? `upi://pay?pa=${upiId}&pn=${payName}&am=${payFinal}&cu=INR&tn=${payNote}` : ''

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">

      {/* Pay Corpus card */}
      {upiId && (
        <div className="rounded-3xl mt-6 mb-4 bg-gradient-to-br from-emerald-600 to-green-500 px-5 py-5 text-white shadow-lg">
          <p className="text-sm font-bold text-white/80 uppercase tracking-widest mb-3">Top Up Your Corpus</p>

          <select
            className="w-full bg-white/20 backdrop-blur-sm text-white rounded-xl px-3 py-2.5 text-sm font-medium outline-none border border-white/20 focus:border-white/60 transition-colors mb-2"
            value={payPlayer}
            onChange={e => { setPayPlayer(e.target.value); setCopied(false); setPayAmt('') }}
          >
            <option value="" disabled className="text-gray-800">Select your name…</option>
            {sortedCorpus.map(p => (
              <option key={p.id} value={p.id} className="text-gray-800">{p.display_name}</option>
            ))}
          </select>

          {selectedP && (
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 text-sm font-medium pointer-events-none">₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={`Suggested: ₹${paySuggested.toLocaleString('en-IN')}`}
                  className="w-full bg-white/20 backdrop-blur-sm text-white placeholder-white/50 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none border border-white/20 focus:border-white/60 transition-colors"
                  value={payAmt}
                  onChange={e => setPayAmt(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              {isMobile ? (
                <a href={upiHref} className="shrink-0 bg-white text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow hover:bg-green-50 transition-colors">
                  Pay ₹{payFinal.toLocaleString('en-IN')} →
                </a>
              ) : (
                <button
                  onClick={() => { navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="shrink-0 bg-white text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow hover:bg-green-50 transition-colors"
                >
                  {copied ? '✓ Copied!' : 'Copy UPI'}
                </button>
              )}
            </div>
          )}

          {selectedP && (
            <p className="text-xs text-white/70 mt-2">
              Balance: ₹{(selectedP.corpus_balance ?? 0).toLocaleString('en-IN')} · Suggested: ₹{paySuggested.toLocaleString('en-IN')}
              {!isMobile && <span className="ml-1">· UPI: {upiId}</span>}
            </p>
          )}
        </div>
      )}

      {/* Hero */}
      <div className={`relative overflow-hidden rounded-3xl ${upiId ? '' : 'mt-6 '}mb-6 bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 px-6 py-8 text-white shadow-xl`}>
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[160px] leading-none flex items-center justify-end pr-6">🏏</div>
        <p className="text-green-200 text-sm font-semibold uppercase tracking-widest mb-1">{seasonName}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">{cfg?.team_name ?? 'MatchBook'}</h1>
        <p className="text-green-100 text-sm mt-1">
          {completed.length} week{completed.length !== 1 ? 's' : ''} played · {allActive.length} active players
        </p>

        {/* Series scoreboard */}
        {seriesLeader && (
          <div className="mt-4 bg-black/25 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/15">
            <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-3">
              ⚔️ Series Standing
            </p>
            <div className="flex items-center gap-3">
              {seriesTeams.map(([name, wins], i) => (
                <div key={name} className={`flex-1 ${i === 1 ? 'opacity-65' : ''}`}>
                  <div className={`text-3xl font-black tabular-nums leading-none ${i === 0 ? 'text-white' : 'text-white/80'}`}>
                    {wins}
                  </div>
                  <div className="text-xs text-white/50 font-semibold uppercase tracking-widest leading-none mt-0.5">weeks</div>
                  <div className="text-xs text-white/70 mt-1 truncate leading-tight">{name}</div>
                </div>
              ))}
              {seriesTeams.length === 1 && (
                <div className="flex-1 opacity-50">
                  <div className="text-3xl font-black tabular-nums leading-none text-white/60">0</div>
                  <div className="text-xs text-white/40 font-semibold uppercase tracking-widest leading-none mt-0.5">weeks</div>
                  <div className="text-xs text-white/50 mt-1">Opponent</div>
                </div>
              )}
            </div>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-white/15">
              <div
                className="h-full bg-white/70 rounded-full transition-all duration-500"
                style={{ width: `${(seriesLeader[1] / completed.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-white/50 mt-1.5 text-center">
              {seriesLeader[0].split(' ')[0]} leads
              {seriesDraws > 0 && ` · ${seriesDraws} draw${seriesDraws > 1 ? 's' : ''}`}
              {winStreak >= 2 && ` · 🔥 ${winStreak} in a row`}
            </p>
          </div>
        )}
      </div>

      {/* Announcements */}
      {activeAnnouncements.map(a => (
        <div key={a.id} className="card bg-blue-50 border border-blue-100 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-base">
              {a.pinned ? '📌' : '📢'}
            </div>
            <div>
              <p className="font-semibold text-blue-900 text-sm">{a.title}</p>
              <p className="text-blue-700 text-sm mt-0.5">{a.body}</p>
              <p className="text-xs text-blue-400 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(({ label, value, icon, to, bg }) => (
          <Link
            key={label}
            to={to}
            className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${bg} opacity-90`} />
            <div className="relative p-4 text-white">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-2xl font-bold leading-tight">{value}</div>
              <div className="text-xs font-medium text-white/75 mt-0.5">{label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Season Leaders */}
      {(topBatter.length || topBowler.length || topMvp.length || topPotm.length || topBba.length || topBbo.length) ? (
        <div className="card mb-6 overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Season Leaders</h2>
            <Link to="/leaderboard" className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
              Full Stats →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3">
            {[
              { ss: topMvp,    emoji: '🌟', label: 'Season MVP',    val: topMvp[0]?.score,        unit: 'pts',    color: 'text-amber-500',   hover: 'hover:bg-amber-50'   },
              { ss: topPotm,   emoji: '🏅', label: 'Most POTM',     val: topPotm[0]?.potm_count,  unit: 'times',  color: 'text-yellow-600',  hover: 'hover:bg-yellow-50'  },
              { ss: topBatter, emoji: '🏏', label: 'Top Scorer',    val: topBatter[0]?.runs,      unit: 'runs',   color: 'text-green-600',   hover: 'hover:bg-green-50'   },
              { ss: topBowler, emoji: '🎯', label: 'Wicket Wizard', val: topBowler[0]?.wickets,   unit: 'wkts',   color: 'text-purple-600',  hover: 'hover:bg-purple-50'  },
              { ss: topBba,    emoji: '🦇', label: 'Best Batsman',  val: topBba[0]?.bba_count,    unit: 'awards', color: 'text-blue-600',    hover: 'hover:bg-blue-50'    },
              { ss: topBbo,    emoji: '🎳', label: 'Best Bowler',   val: topBbo[0]?.bbo_count,    unit: 'awards', color: 'text-rose-600',    hover: 'hover:bg-rose-50'    },
            ].map(({ ss, emoji, label, val, unit, color, hover }, i) => {
              if (!ss.length) return null
              const cellClass = `p-4 ${hover} transition-colors ${i % 3 !== 2 ? 'sm:border-r' : ''} ${i % 2 !== 1 ? 'border-r sm:border-r-0' : ''} ${i < 3 ? 'border-b' : ''} border-gray-100`
              const names = ss.map(s => perfPlayerMap[s.player_id]?.display_name ?? '—').join(', ')
              const inner = (
                <>
                  <div className="text-xl mb-1.5">{emoji}</div>
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</div>
                  <div className="font-bold text-gray-900 text-sm leading-snug" title={names}>{names}</div>
                  <div className={`text-2xl font-black tabular-nums leading-none mt-1 ${color}`}>
                    {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{unit}</div>
                </>
              )
              return ss.length === 1
                ? <Link key={label} to={`/player/${ss[0].player_id}`} className={cellClass}>{inner}</Link>
                : <div key={label} className={cellClass}>{inner}</div>
            })}
          </div>
        </div>
      ) : null}

      {/* Balance health */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Corpus Balance Health</h2>
          <span className="text-xs text-gray-400">{corpusPlayers.length} players</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-px mb-4">
          {statusBar.map(({ key, color }) =>
            statusCounts[key] > 0 && (
              <div key={key} className={`${color} transition-all duration-500`} style={{ width: `${(statusCounts[key] / corpusTotal) * 100}%` }} />
            )
          )}
        </div>
        {/* Clickable status chips — tap to see that group of players */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statusBar.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setActiveStatus(activeStatus === key ? null : key)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all ${
                activeStatus === key
                  ? 'bg-gray-200 ring-2 ring-gray-400'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
              <div>
                <div className="text-xs text-gray-500">{label}</div>
                <div className="font-bold text-gray-900 text-sm">{statusCounts[key]}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Status-filtered player list */}
        {activeStatus && (() => {
          const filtered = sortedCorpus.filter(p => p.balance_status === activeStatus)
          if (!filtered.length) return null
          const chip = statusBar.find(s => s.key === activeStatus)
          return (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">{chip?.label} · {filtered.length} player{filtered.length !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-1.5">
                {filtered.map(p => (
                  <Link
                    key={p.id}
                    to={`/player/${p.id}`}
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                      p.balance_status === 'overdue'      ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                      p.balance_status === 'urgent'       ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                      p.balance_status === 'collect_soon' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                                            'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    {p.display_name} · ₹{Math.round(p.corpus_balance ?? 0).toLocaleString('en-IN')}
                  </Link>
                ))}
              </div>
            </div>
          )
        })()}

        {/* At-risk quick list (always shown when no filter active) */}
        {!activeStatus && atRiskCount > 0 && (
          <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
            <p className="text-xs font-semibold text-orange-700 mb-1.5">⚠️ {atRiskCount} player{atRiskCount > 1 ? 's' : ''} need to top up</p>
            <div className="divide-y divide-orange-100">
              {sortedCorpus
                .filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
                .map(p => (
                  <Link
                    key={p.id}
                    to={`/player/${p.id}`}
                    className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity"
                  >
                    <span className={`text-xs font-medium ${p.balance_status === 'overdue' ? 'text-red-700' : 'text-orange-700'}`}>
                      {p.display_name}
                    </span>
                    <span className={`text-xs font-mono font-semibold ${p.balance_status === 'overdue' ? 'text-red-600' : 'text-orange-600'}`}>
                      ₹{Math.round(p.corpus_balance ?? 0).toLocaleString('en-IN')}
                    </span>
                  </Link>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Recent Matches</h2>
          <Link to="/timeline" className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
            See All →
          </Link>
        </div>
        {recentWeeks.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No matches recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {recentWeeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <div
                  key={w.week_id}
                  className="flex items-center justify-between text-sm px-3 py-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setDetail(w.week_id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-700 font-bold text-xs shrink-0">
                      {format(parseISO(w.match_date), 'd')}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                      {w.venue && <span className="text-gray-400 ml-2 text-xs">{w.venue.split(',')[0]}</span>}
                      {w.result && <span className="ml-2 text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">{w.result}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">👥 {played}</span>
                    <span className="text-gray-300 text-xs">›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {hotPlayers.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Who's Hot 🔥</h2>
            <span className="text-xs text-gray-400">Last 3 sessions</span>
          </div>
          <div className="space-y-1">
            {hotPlayers.map(({ pid, recentRuns, recentWkts, matches }) => (
              <Link key={pid} to={`/player/${pid}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-sm">🔥</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{perfPlayerMap[pid]?.display_name ?? pid}</p>
                  <p className="text-xs text-gray-400">
                    {recentRuns}r{recentWkts > 0 ? ` · ${recentWkts}w` : ''} in last {matches} match{matches !== 1 ? 'es' : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold text-green-600 shrink-0">In form ↑</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Financial Activity */}
      {recentActivity.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Recent Expenses</h2>
            <span className="text-xs text-gray-400">Season total: ₹{Math.round(totalExpenses).toLocaleString('en-IN')}</span>
          </div>
          <div className="space-y-1">
            {recentActivity.map(e => {
              const isDeduction = e._type === 'deduction'
              return (
                <div key={e.id} className="flex items-center justify-between text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 ${isDeduction ? 'bg-blue-50' : 'bg-red-50'}`}>
                      {isDeduction ? '🏏' : '🧾'}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800">{e.description}</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {format(parseISO(e.date), 'MMM d, yyyy')}
                        {isDeduction
                          ? <span className="ml-1">· {e.count} players</span>
                          : <>
                              {e.category && <span className="ml-1">· {EXPENSE_LABELS[e.category] ?? e.category}</span>}
                              {e.paid_by && <span className="ml-1">· paid by {e.paid_by}</span>}
                            </>
                        }
                      </div>
                    </div>
                  </div>
                  <span className={`font-mono font-semibold shrink-0 ml-2 ${isDeduction ? 'text-blue-600' : 'text-red-600'}`}>
                    ₹{Math.round(e.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <MatchPlayersModal
        week={(wData?.weeks ?? []).find(w => w.week_id === detail)}
        players={allActive}
        records={records}
        perfRows={detail ? (perfData?.performances ?? []).filter(p => p.week_id === detail) : []}
        expenses={allExpenses}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
