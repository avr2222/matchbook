import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useAttendance, useTournaments, useConfig, useAnnouncements } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { format, parseISO } from 'date-fns'

export default function Dashboard() {
  const [detail, setDetail] = useState(null)
  const { data: cfg }     = useConfig()
  const { data: tData }   = useTournaments()
  const { data: pData, isLoading: pLoad } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: aData }   = useAttendance()
  const { data: annData } = useAnnouncements()

  if (pLoad) return <PageSpinner />

  const activeTournamentId = tData?.active_tournament_id ?? cfg?.active_tournament_id
  const allActive    = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = allActive.filter(p => p.type === 'corpus' || p.type === 'new')
  const weeks        = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed    = weeks.filter(w => w.status === 'completed')
  const scheduled    = weeks.filter(w => w.status === 'scheduled').sort((a, b) => a.match_date.localeCompare(b.match_date))
  const records      = aData?.records ?? []
  const seasonName   = tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? cfg?.team_name ?? 'Season'

  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  corpusPlayers.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })
  const remainingPool = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const recentWeeks   = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)
  // Each week may have multiple games (e.g. 3-game CricHeroes session)
  const totalMatches  = completed.reduce((s, w) => s + (w.cricheroes_match_ids?.length ?? 1), 0)

  const todayStr = new Date().toISOString().slice(0, 10)
  // Only show scheduled weeks that are actually in the future
  const futureScheduled = scheduled.filter(w => w.match_date > todayStr)
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

  const stats = [
    { label: 'Active Players',   value: allActive.length,                                       icon: '👥', to: '/players',            bg: 'from-blue-500 to-blue-600'    },
    { label: 'Weeks Played',     value: completed.length,                                       icon: '🏏', to: '/admin/weeks',         bg: 'from-green-500 to-emerald-600' },
    { label: 'Corpus Pool',      value: `₹${Math.round(remainingPool).toLocaleString('en-IN')}`, icon: '💰', to: '/admin/transactions',  bg: 'from-amber-500 to-orange-500'  },
    { label: 'Season',           value: seasonName,                                             icon: '🏆', to: '/admin',               bg: 'from-purple-500 to-violet-600' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl mt-6 mb-6 bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 px-6 py-10 text-white shadow-xl">
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[160px] leading-none flex items-center justify-end pr-6">🏏</div>
        <p className="text-green-200 text-sm font-semibold uppercase tracking-widest mb-1">{seasonName}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">{cfg?.team_name ?? 'MatchBook'}</h1>
        <p className="text-green-100 text-sm mt-1">
          {completed.length} week{completed.length !== 1 ? 's' : ''} played · {allActive.length} active players
        </p>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statusBar.map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
              <div>
                <div className="text-xs text-gray-500">{label}</div>
                <div className="font-bold text-gray-900 text-sm">{statusCounts[key]}</div>
              </div>
            </div>
          ))}
        </div>
        {atRiskCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
            <span>⚠️</span>
            <span>{atRiskCount} player{atRiskCount > 1 ? 's' : ''} need{atRiskCount === 1 ? 's' : ''} to top up.</span>
            <Link to="/login" className="ml-auto font-semibold underline underline-offset-2">Log in →</Link>
          </div>
        )}
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Recent Matches</h2>
          <Link to="/players" className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
            View Roster →
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

      <MatchPlayersModal
        week={(wData?.weeks ?? []).find(w => w.week_id === detail)}
        players={allActive}
        records={records}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
