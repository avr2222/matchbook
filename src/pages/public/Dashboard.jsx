import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useAttendance, useTournaments, useConfig, useAnnouncements, useExpenses, useTransactions, useLeaderboard } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { format, parseISO } from 'date-fns'
import {
  IconUsers, IconCalendar, IconCurrencyRupee, IconTrophy,
  IconStar, IconMedal, IconCricket, IconTarget, IconBallBowling,
  IconFlame, IconAlertTriangle, IconReceipt, IconTrendingUp, IconBell,
} from '@tabler/icons-react'

/* ── Leader card definitions (emoji + color) ── */
const LEADER_DEFS = [
  { key: 'mvp',     emoji: '⭐', label: 'Season MVP',    unit: 'pts',    color: '#f59e0b' },
  { key: 'potm',    emoji: '🔥', label: 'Most POTM',     unit: 'times',  color: '#f97316' },
  { key: 'scorer',  emoji: '🏏', label: 'Top Scorer',    unit: 'runs',   color: '#10b981' },
  { key: 'bowler',  emoji: '🔮', label: 'Wicket Wizard', unit: 'wkts',   color: '#a855f7' },
  { key: 'batsman', emoji: '🏅', label: 'Best Batsman',  unit: 'awards', color: '#3b82f6' },
  { key: 'bbowler', emoji: '⚡', label: 'Best Bowler',   unit: 'awards', color: '#f43f5e' },
]

const EXPENSE_LABELS = {
  match_cost: 'Match cost', ground_booking: 'Ground booking', cricket_ball: 'Cricket ball',
  cricket_bat: 'Cricket bat', equipment: 'Equipment', refreshments: 'Refreshments',
  kit: 'Kit / uniform', other: 'Other',
}

export default function Dashboard() {
  const [detail, setDetail]           = useState(null)
  const [payPlayer, setPayPlayer]     = useState('')

  const [copied, setCopied]           = useState(false)
  const [accordionOpen, setAccordionOpen] = useState(false)

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

  /* ── Derived data ── */
  const activeTournamentId = tData?.active_tournament_id ?? cfg?.active_tournament_id
  const allActive     = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = allActive.filter(p => p.type === 'corpus' || p.type === 'new')
  const weeks         = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed     = weeks.filter(w => w.status === 'completed')
  const records       = aData?.records ?? []
  const seasonName    = tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? cfg?.team_name ?? 'Season'
  const todayStr      = new Date().toISOString().slice(0, 10)

  /* ── Series / standings ── */
  const _parseWinner = result => {
    const m = (result ?? '').match(/^(.+?)\s+(\d+)-(\d+)$/)
    if (!m) return ''
    return parseInt(m[2]) !== parseInt(m[3]) ? m[1].trim() : ''
  }
  // Seed both team names from week records so the losing team is always known
  const allTeamNamesSet = new Set()
  completed.forEach(w => {
    if (w.team_a) allTeamNamesSet.add(w.team_a)
    if (w.team_b) allTeamNamesSet.add(w.team_b)
  })
  const seriesWins = {}
  allTeamNamesSet.forEach(name => { seriesWins[name] = 0 })
  completed.forEach(w => {
    const winner = _parseWinner(w.result) || w.winning_team
    if (winner) seriesWins[winner] = (seriesWins[winner] ?? 0) + 1
  })
  const seriesTeams  = Object.entries(seriesWins).sort((a, b) => b[1] - a[1])
  const seriesLeader = seriesTeams[0]?.[1] > 0 ? seriesTeams[0] : null
  const _t0 = seriesTeams[0]?.[0], _t1 = seriesTeams[1]?.[0]
  const matchWinMap  = {}
  completed.forEach(w => {
    const rm = (w.result ?? '').match(/^(.+?)\s+(\d+)-(\d+)$/)
    if (!rm) return
    const wScore = parseInt(rm[2])
    const lScore = parseInt(rm[3])
    const wName  = rm[1].trim()
    const loser  = w.team_a === wName ? w.team_b
      : w.team_b === wName ? w.team_a
      : wName === _t0 ? _t1 : wName === _t1 ? _t0 : null
    if (wScore === lScore) {
      matchWinMap[wName] = (matchWinMap[wName] || 0) + wScore
      if (loser) matchWinMap[loser] = (matchWinMap[loser] || 0) + lScore
      return
    }
    matchWinMap[wName] = (matchWinMap[wName] || 0) + wScore
    if (loser) matchWinMap[loser] = (matchWinMap[loser] || 0) + lScore
  })
  const seriesDraws   = completed.filter(w => !(_parseWinner(w.result) || w.winning_team)).length
  const sortedCompleted = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date))
  let winStreak = 0
  if (seriesLeader) {
    for (const w of sortedCompleted) {
      if ((_parseWinner(w.result) || w.winning_team) === seriesLeader[0]) winStreak++
      else break
    }
  }
  const matchLeaderName = Object.entries(matchWinMap).sort((a, b) => b[1] - a[1])[0]?.[0]
  const _abbr = name => {
    if (!name) return '?'
    const paren = name.match(/\(([A-Z0-9]+)\)/)
    if (paren) return paren[1]
    const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase()
    return initials.slice(0, 4) || name.slice(0, 3).toUpperCase()
  }
  const _chronoWeeks = [...completed].sort((a, b) => a.match_date.localeCompare(b.match_date))
  // Assign a stable color per team
  const teamColors = {
    ..._t0 ? { [_t0]: { pill: 'bg-amber-500/20 border border-amber-500/40 text-amber-300',    card: 'bg-amber-500/10 border border-amber-500/20' } } : {},
    ..._t1 ? { [_t1]: { pill: 'bg-blue-500/20 border border-blue-500/40 text-blue-300',       card: 'bg-blue-500/10 border border-blue-500/20'  } } : {},
  }

  /* ── Corpus health ── */
  const statusBar = [
    { key: 'good',         label: 'Good',        color: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { key: 'collect_soon', label: 'Collect',      color: 'bg-amber-400',  dot: 'bg-amber-400'   },
    { key: 'urgent',       label: 'Urgent',       color: 'bg-orange-500', dot: 'bg-orange-500'  },
    { key: 'overdue',      label: 'Overdue',      color: 'bg-red-900/100',    dot: 'bg-red-900/100'     },
  ]
  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  corpusPlayers.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })
  const corpusTotal   = corpusPlayers.length || 1
  const atRiskCount   = statusCounts.urgent + statusCounts.overdue
  const remainingPool = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const sortedCorpus  = [...corpusPlayers].sort((a, b) => a.display_name.localeCompare(b.display_name))

  /* ── Pay corpus ── */
  const upiId       = cfg?.admin_upi_id
  const threshold   = cfg?.corpus_low_threshold ?? 1000
  const selectedP   = payPlayer ? corpusPlayers.find(p => p.id === payPlayer) : null
  const payNeeded   = selectedP ? Math.max(threshold - (selectedP.corpus_balance ?? 0), 500) : 500
  const paySuggested = selectedP ? Math.ceil(payNeeded / 500) * 500 : 500
  const isMobile    = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const payName     = encodeURIComponent(cfg?.team_name ?? 'Cricket Team')
  const payNote     = selectedP ? encodeURIComponent(`Corpus Topup - ${selectedP.display_name}`) : ''
  const upiHref     = selectedP ? `upi://pay?pa=${upiId}&pn=${payName}&cu=INR&tn=${payNote}` : ''

  /* ── Stat / KPI cards ── */
  const kpiCards = [
    { label: 'Active Players',  value: allActive.length,                                          to: '/players'            },
    { label: 'Weeks Played',    value: completed.length,                                          to: '/admin/weeks'        },
    { label: 'Corpus Balance',  value: `₹${Math.round(remainingPool).toLocaleString('en-IN')}`,   to: '/admin/transactions' },
    { label: 'Active Season',   value: seasonName,                                                to: '/admin'              },
  ]

  /* ── Season leaders ── */
  const perfs = perfData?.performances ?? []
  const _sMap = {}
  for (const perf of perfs) {
    if (!_sMap[perf.player_id]) _sMap[perf.player_id] = {
      player_id: perf.player_id, runs: 0, wickets: 0, balls_faced: 0, balls_bowled: 0,
      runs_given: 0, catches: 0, maidens: 0, run_outs: 0, stumpings: 0,
      match_count: 0, potm_count: 0, bba_count: 0, bbo_count: 0,
    }
    const s = _sMap[perf.player_id]
    s.runs         += perf.runs         || 0
    s.wickets      += perf.wickets      || 0
    s.balls_faced  += perf.balls_faced  || 0
    s.balls_bowled += perf.balls_bowled || 0
    s.runs_given   += perf.runs_given   || 0
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
  const WKT_PTS = 1.2
  const _mvpSorted = _allS
    .filter(s => s.match_count >= 5)
    .map(s => ({
      ...s,
      score: parseFloat((
        (s.runs / 10) * 1.08 + s.wickets * WKT_PTS
        + Math.floor(s.maidens / 2) * WKT_PTS
        + (s.catches + s.stumpings) * (WKT_PTS * 0.2)
        + s.run_outs * WKT_PTS
      ).toFixed(1)),
    }))
    .filter(s => s.score > 0).sort((a, b) => b.score - a.score)

  const topBatterArr = _allS.filter(s => s.runs > 0).sort((a, b) => b.runs - a.runs)
  const topBowlerArr = _allS.filter(s => s.wickets > 0).sort((a, b) => b.wickets - a.wickets)
  const topPotmArr   = _allS.filter(s => s.potm_count > 0).sort((a, b) => b.potm_count - a.potm_count)
  const topBbaArr    = _allS.filter(s => s.bba_count > 0).sort((a, b) => b.bba_count - a.bba_count)
  const topBboArr    = _allS.filter(s => s.bbo_count > 0).sort((a, b) => b.bbo_count - a.bbo_count)

  const topMvp    = _mvpSorted.length ? _topGroup(_mvpSorted, s => s.score) : []
  const topBatter = topBatterArr.length ? _topGroup(topBatterArr, s => s.runs) : []
  const topBowler = topBowlerArr.length ? _topGroup(topBowlerArr, s => s.wickets) : []
  const topPotm   = topPotmArr.length   ? _topGroup(topPotmArr, s => s.potm_count) : []
  const topBba    = topBbaArr.length    ? _topGroup(topBbaArr, s => s.bba_count) : []
  const topBbo    = topBboArr.length    ? _topGroup(topBboArr, s => s.bbo_count) : []

  const perfPlayerMap = Object.fromEntries((pData?.players ?? []).map(p => [p.id, p]))

  const leaderRows = [
    { def: LEADER_DEFS[0], ss: topMvp,    val: topMvp[0]?.score,       pid: topMvp[0]?.player_id    },
    { def: LEADER_DEFS[1], ss: topPotm,   val: topPotm[0]?.potm_count, pid: topPotm[0]?.player_id   },
    { def: LEADER_DEFS[2], ss: topBatter, val: topBatter[0]?.runs,      pid: topBatter[0]?.player_id },
    { def: LEADER_DEFS[3], ss: topBowler, val: topBowler[0]?.wickets,   pid: topBowler[0]?.player_id },
    { def: LEADER_DEFS[4], ss: topBba,    val: topBba[0]?.bba_count,    pid: topBba[0]?.player_id    },
    { def: LEADER_DEFS[5], ss: topBbo,    val: topBbo[0]?.bbo_count,    pid: topBbo[0]?.player_id    },
  ].filter(r => r.ss.length > 0)

  /* ── Who's hot ── */
  const recentWeeks  = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)
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
      if (!season || season.match_count < 3 || recent.matches < 2) return null
      const perfScore = recent.runs + recent.wickets * 8
      return perfScore > 0 ? { pid, perfScore, recentRuns: recent.runs, recentWkts: recent.wickets, matches: recent.matches } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.perfScore - a.perfScore)
    .slice(0, 3)

  /* ── Recent financial activity ── */
  const allExpenses = eData?.expenses ?? []
  const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
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
    id: `deduct_${weekId}`, _type: 'deduction',
    description: `Match fees — ${d.label}`, date: d.date, amount: d.total, count: d.count,
  }))
  const recentActivity = [...allExpenses.map(e => ({ ...e, _type: 'expense' })), ...deductionEntries]
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)

  /* ── Announcements ── */
  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= todayStr)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posted_on.localeCompare(a.posted_on))

  /* ── Series summary text ── */
  const seriesSummaryText = (() => {
    if (!seriesLeader) return null
    const parts = [`${_abbr(seriesLeader[0])} leads weeks`]
    const m0 = matchWinMap[_t0] || 0, m1 = matchWinMap[_t1] || 0
    if (_t1 && m0 !== m1) {
      const mLeader = m0 > m1 ? _t0 : _t1
      parts.push(`${_abbr(mLeader)} leads matches by ${Math.abs(m0 - m1)}`)
    }
    if (seriesDraws > 0) parts.push(`${seriesDraws} draw${seriesDraws > 1 ? 's' : ''}`)
    if (winStreak >= 2) parts.push(`${winStreak} in a row`)
    return parts.join(' · ')
  })()

  return (
    <div className="max-w-7xl mx-auto px-4 pb-16">

      {/* ── Announcements ── */}
      {activeAnnouncements.map(a => (
        <div key={a.id}
          className="mt-6 rounded-2xl px-4 py-4 flex items-start gap-3"
          style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16,185,129,0.15)' }}>
            <IconBell size={14} className="text-[#10b981]" />
          </div>
          <div>
            <p className="font-semibold text-gray-100 text-sm">{a.title}</p>
            <p className="text-gray-400 text-sm mt-0.5">{a.body}</p>
            <p className="text-xs text-gray-500 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
          </div>
        </div>
      ))}

      {/* ── HERO GRID: standings (2fr) + topup (1fr) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 mt-6 mb-6">

        {/* Standings banner */}
        <div
          className="glass-card relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #04120e, #0c2b21, #04120e)' }}
        >
          {/* Radial glow overlay */}
          <div
            className="absolute bottom-[-40%] left-1/2 -translate-x-1/2 w-[60%] h-[60%] rounded-full pointer-events-none z-0"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)' }}
          />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest mb-0.5">{seasonName}</p>
            <h2 className="text-[22px] font-bold text-white tracking-tight">{cfg?.team_name ?? 'MatchBook'}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {completed.length} week{completed.length !== 1 ? 's' : ''} played · {allActive.length} active players
            </p>

            {/* Series visualizer */}
            {seriesLeader ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 my-4">
                {[_t0, _t1].map((teamName, i) => {
                  if (!teamName) {
                    return (
                      <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-3 text-center">
                        <p className="text-xs text-gray-300 font-medium">Opponent</p>
                        <div className="text-[28px] font-extrabold text-white/20 leading-none mt-1">0</div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">wins</p>
                      </div>
                    )
                  }
                  const mWins = matchWinMap[teamName] || 0
                  const wWins = seriesWins[teamName] || 0
                  const isLeader = matchLeaderName === teamName
                  return (
                    <div key={teamName}
                      className={`rounded-xl px-3 py-3 text-center ${
                        i === 0 ? 'bg-white/[0.04] border border-white/[0.08]' : 'bg-white/[0.02] border border-white/[0.04]'
                      }`}
                    >
                      <p className={`text-xs font-semibold truncate ${i === 0 ? 'text-gray-200' : 'text-gray-400'}`} title={teamName}>
                        {teamName}
                      </p>
                      {mWins > 0 && (
                        <div className={`text-[30px] sm:text-[36px] font-extrabold leading-none mt-1 flex items-center justify-center gap-1 tabular-nums ${
                          isLeader
                            ? (i === 0 ? 'text-amber-300' : 'text-cyan-300')
                            : (i === 0 ? 'text-white/60' : 'text-white/30')
                        }`}>
                          {mWins}
                          {isLeader && <IconTrophy size={22} className="shrink-0" />}
                        </div>
                      )}
                      <p className={`text-[10px] uppercase tracking-wide mt-1 ${
                        isLeader ? (i === 0 ? 'text-amber-400/60' : 'text-cyan-400/60') : 'text-white/20'
                      }`}>matches</p>
                      <div className="mt-2 flex items-baseline justify-center gap-1">
                        <span className={`text-lg font-bold tabular-nums ${i === 0 ? 'text-white/50' : 'text-white/25'}`}>{wWins}</span>
                        <span className={`text-[9px] uppercase tracking-wide ${i === 0 ? 'text-white/25' : 'text-white/15'}`}>wks</span>
                      </div>
                    </div>
                  )
                })}
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0 mx-auto"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                  VS
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-300 my-4">No series data yet.</p>
            )}

            {/* Timeline pills (wraps on mobile) */}
            {_chronoWeeks.length > 0 && (
              <div className="border-t border-white/[0.05] pt-3 flex flex-col items-center gap-2">
                <div className="flex gap-1 flex-wrap justify-center">
                  {_chronoWeeks.map(w => {
                    const winner = _parseWinner(w.result) || w.winning_team
                    const pillCls = winner
                      ? (teamColors[winner]?.pill ?? 'bg-white/10 border border-white/20 text-white/60')
                      : 'bg-white/5 border border-white/10 text-white/25'
                    return (
                      <span key={w.week_id}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pillCls}`}
                        title={winner || 'Draw'}
                      >
                        {winner ? _abbr(winner) : '='}
                      </span>
                    )
                  })}
                </div>
                {seriesSummaryText && (
                  <span className="text-xs font-semibold text-[#10b981] px-3 py-1 rounded-full"
                    style={{ background: 'rgba(16,185,129,0.05)' }}>
                    {seriesSummaryText}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top-up quick-action card */}
        {upiId && (
          <div className="glass-card flex flex-col justify-center">
            <h3 className="text-[17px] font-bold text-white text-center">Top Up Corpus</h3>
            <p className="text-xs text-center text-gray-400 mt-1 mb-4">
              Settle weekly match fees or outstanding dues instantly.
            </p>

            <select
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors mb-3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: payPlayer ? '#f3f4f6' : '#6b7280',
              }}
              value={payPlayer}
              onChange={e => { setPayPlayer(e.target.value); setCopied(false) }}
            >
              <option value="" disabled style={{ background: '#0b1512' }}>Select your name…</option>
              {sortedCorpus.map(p => (
                <option key={p.id} value={p.id} style={{ background: '#0b1512', color: '#f3f4f6' }}>
                  {p.display_name} (₹{Math.round(p.corpus_balance ?? 0).toLocaleString('en-IN')})
                </option>
              ))}
            </select>

            {selectedP && (
              <>
                <div className="flex gap-2 items-center">
                  {isMobile ? (
                    <a href={upiHref}
                      className="shrink-0 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
                      style={{ background: 'linear-gradient(135deg,#0f766e,#10b981)', color: '#fff', boxShadow: '0 4px 14px rgba(16,185,129,0.25)' }}
                    >
                      Pay →
                    </a>
                  ) : (
                    <button
                      onClick={() => { navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      className="shrink-0 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
                      style={{
                        background: copied ? 'linear-gradient(135deg,#0f766e,#10b981)' : 'rgba(255,255,255,0.05)',
                        color: copied ? '#fff' : '#10b981',
                        border: copied ? 'none' : '1px solid rgba(16,185,129,0.3)',
                      }}
                    >
                      {copied ? '✓ Copied' : 'Copy UPI'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-300 mt-2">
                  Balance: ₹{(selectedP.corpus_balance ?? 0).toLocaleString('en-IN')} · Suggested: ₹{paySuggested.toLocaleString('en-IN')}
                  {!isMobile && <span className="ml-1">· {upiId}</span>}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {kpiCards.map(({ label, value, to }) => (
          <Link key={label} to={to}
            className="glass-card kpi-card text-center py-4 px-3 hover:scale-[1.02]"
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-2/5 h-0.5 rounded-b"
              style={{ background: 'linear-gradient(135deg, #0f766e, #10b981)' }}
            />
            <div className="kpi-value">{value}</div>
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] font-semibold mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      {/* ── MAIN GRID: left (2fr) + right (1fr) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-5">

          {/* Season Leaders */}
          {leaderRows.length > 0 && (
            <div className="glass-card">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
                <div>
                  <h2 className="text-[18px] font-bold text-white">Season Leaders</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Current season performance awards</p>
                </div>
                <Link to="/leaderboard" className="text-xs font-semibold text-[#10b981] hover:underline">
                  Full stats →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {leaderRows.map(({ def, ss, val, pid }) => {
                  const names = ss.map(s => perfPlayerMap[s.player_id]?.display_name ?? '—').join(', ')
                  const inner = (
                    <>
                      <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center justify-center gap-1">
                        <span>{def.emoji}</span> {def.label}
                      </div>
                      <div className="font-bold text-white text-sm leading-snug truncate px-1" title={names}>{names}</div>
                      <div className="text-[22px] font-extrabold mt-1 tabular-nums" style={{ color: def.color }}>
                        {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : '—'}
                      </div>
                      <div className="text-[10px] text-gray-300 mt-0.5 uppercase tracking-wide">{def.unit}</div>
                    </>
                  )
                  const cardCls = 'bg-white/[0.01] border border-white/[0.04] rounded-xl p-4 text-center hover:border-[#10b981]/40 hover:bg-[rgba(16,185,129,0.02)] hover:-translate-y-0.5 transition-all duration-200'
                  return ss.length === 1 && pid
                    ? <Link key={def.key} to={`/player/${pid}`} className={cardCls}>{inner}</Link>
                    : <div key={def.key} className={cardCls}>{inner}</div>
                })}
              </div>
            </div>
          )}

          {/* Recent Matches */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
              <div>
                <h2 className="text-[18px] font-bold text-white">Recent Matches</h2>
                <p className="text-xs text-gray-400 mt-0.5">Matchday summaries and scoring sheets</p>
              </div>
              <Link to="/timeline" className="text-xs font-semibold text-[#10b981] hover:underline">See all →</Link>
            </div>
            {recentWeeks.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-6">No matches recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {recentWeeks.map(w => {
                  const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
                  return (
                    <div key={w.week_id}
                      onClick={() => setDetail(w.week_id)}
                      className="flex items-center justify-between p-3 rounded-xl cursor-pointer min-h-[56px] transition-all duration-200"
                      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.03)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Date badge */}
                        <div className="w-9 h-9 shrink-0 rounded-lg flex flex-col items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span className="text-sm font-bold text-white leading-none">{format(parseISO(w.match_date), 'd')}</span>
                          <span className="text-[9px] text-gray-400 uppercase leading-none mt-0.5">{format(parseISO(w.match_date), 'MMM')}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-100 truncate max-w-[160px] sm:max-w-none">
                            {w.venue ? w.venue.split(',')[0] : format(parseISO(w.match_date), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-gray-300 mt-0.5">
                            {w.venue ? format(parseISO(w.match_date), 'MMM d, yyyy') : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2 min-w-0 max-w-[45%]">
                        {w.result && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded w-full truncate text-center"
                            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                            {w.result}
                          </span>
                        )}
                        <span className="text-xs text-gray-300 font-medium flex items-center gap-1 shrink-0">
                          <IconUsers size={11} />{played}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Expenses */}
          {recentActivity.length > 0 && (
            <div className="glass-card">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
                <div>
                  <h2 className="text-[18px] font-bold text-white">Recent Expenses</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Corpus transactions and costs · Season total: ₹{Math.round(totalExpenses).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                {recentActivity.map(e => {
                  const isDeduction = e._type === 'deduction'
                  return (
                    <div key={e.id}
                      className="flex items-center justify-between p-3 rounded-xl min-h-[56px] transition-all duration-200"
                      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={el => { el.currentTarget.style.background = 'rgba(16,185,129,0.02)'; el.currentTarget.style.borderColor = 'rgba(16,185,129,0.1)' }}
                      onMouseLeave={el => { el.currentTarget.style.background = 'rgba(255,255,255,0.01)'; el.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Date badge */}
                        <div className="w-9 h-9 shrink-0 rounded-lg flex flex-col items-center justify-center"
                          style={isDeduction
                            ? { background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }
                            : { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }
                          }>
                          <span className="text-sm font-bold leading-none" style={{ color: isDeduction ? '#10b981' : '#ef4444' }}>
                            {format(parseISO(e.date), 'd')}
                          </span>
                          <span className="text-[9px] uppercase leading-none mt-0.5" style={{ color: isDeduction ? '#10b981' : '#ef4444' }}>
                            {format(parseISO(e.date), 'MMM')}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-100 truncate max-w-[160px] sm:max-w-none">{e.description}</div>
                          <div className="text-xs text-gray-300 mt-0.5">
                            {format(parseISO(e.date), 'MMM d, yyyy')}
                            {isDeduction
                              ? <span> · {e.count} players</span>
                              : <>
                                  {e.category && <span> · {EXPENSE_LABELS[e.category] ?? e.category}</span>}
                                  {e.paid_by && <span> · {e.paid_by}</span>}
                                </>
                            }
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-sm shrink-0 ml-2 tabular-nums" style={{ color: isDeduction ? '#10b981' : '#ef4444' }}>
                        {isDeduction ? '+' : '-'}₹{Math.round(e.amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-5">

          {/* Corpus Balance Health */}
          <div className="glass-card">
            <h2 className="text-[17px] font-bold text-white mb-1">Corpus Balance Health</h2>
            <p className="text-xs text-gray-400 mb-3">{corpusPlayers.length} players</p>

            {/* Health bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05] gap-px mb-3">
              {statusBar.map(({ key, color }) =>
                statusCounts[key] > 0 && (
                  <div key={key} className={`${color} transition-all duration-500`}
                    style={{ width: `${(statusCounts[key] / corpusTotal) * 100}%` }} />
                )
              )}
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-4 gap-1 mb-4">
              {statusBar.map(({ key, label, dot }) => (
                <div key={key} className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  </div>
                  <div className="text-[11px] text-gray-400">{label}</div>
                  <div className="font-bold text-white text-sm">{statusCounts[key]}</div>
                </div>
              ))}
            </div>

            {/* Accordion warning */}
            {atRiskCount > 0 && (
              <>
                <button
                  onClick={() => setAccordionOpen(o => !o)}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between transition-all duration-200 min-h-[44px]"
                  style={{
                    background: 'rgba(249,115,22,0.1)',
                    border: '1px solid rgba(249,115,22,0.3)',
                    color: '#fdba74',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.15)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.1)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.3)' }}
                >
                  <span className="flex items-center gap-2">
                    <IconAlertTriangle size={14} />
                    {atRiskCount} player{atRiskCount > 1 ? 's' : ''} need to top up
                  </span>
                  <span className="text-xs">{accordionOpen ? '▲' : '▼'}</span>
                </button>

                {accordionOpen && (
                  <div className="mt-2 rounded-xl p-3 flex flex-col gap-1"
                    style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)' }}>
                    {sortedCorpus
                      .filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
                      .map(p => (
                        <Link
                          key={p.id}
                          to={`/player/${p.id}`}
                          className="flex items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:bg-white/[0.03] transition-colors"
                        >
                          <span className={`font-medium ${p.balance_status === 'overdue' ? 'text-red-300' : 'text-orange-300'}`}>
                            {p.display_name}
                          </span>
                          <span className={`font-bold tabular-nums text-xs ${p.balance_status === 'overdue' ? 'text-red-400' : 'text-orange-400'}`}>
                            ₹{Math.round(p.corpus_balance ?? 0).toLocaleString('en-IN')}
                          </span>
                        </Link>
                      ))
                    }
                  </div>
                )}
              </>
            )}
          </div>

          {/* Who's Hot */}
          {hotPlayers.length > 0 && (
            <div className="glass-card">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
                <div>
                  <h2 className="text-[17px] font-bold text-white flex items-center gap-2">
                    <IconFlame size={16} className="text-orange-400" />
                    Who&apos;s Hot
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Form tracker · last 3 sessions</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {hotPlayers.map(({ pid, recentRuns, recentWkts, matches }) => (
                  <Link key={pid} to={`/player/${pid}`}
                    className="flex items-center justify-between p-3 rounded-xl min-h-[56px] transition-all duration-200 block"
                    style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.02)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-100">
                        {perfPlayerMap[pid]?.display_name ?? pid}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {recentRuns}r{recentWkts > 0 ? ` · ${recentWkts}w` : ''} in last {matches} match{matches !== 1 ? 'es' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ml-2"
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                      In Form
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

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
