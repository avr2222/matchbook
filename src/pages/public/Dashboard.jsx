import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useAttendance, useTournaments, useConfig } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { STATUS_DOT } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'

export default function Dashboard() {
  const { data: cfg }     = useConfig()
  const { data: tData }   = useTournaments()
  const { data: pData, isLoading: pLoad } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: aData }   = useAttendance()

  if (pLoad) return <PageSpinner />

  const activeTournamentId = tData?.active_tournament_id ?? cfg?.active_tournament_id
  const players  = (pData?.players ?? []).filter(p => p.status === 'active')
  const weeks    = (wData?.weeks   ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed = weeks.filter(w => w.status === 'completed')
  const records  = aData?.records ?? []

  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  players.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })

  const totalCorpus = players
    .filter(p => p.type === 'corpus' || p.type === 'new')
    .reduce((s, p) => s + (p.total_paid ?? 0), 0)

  const recentWeeks = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)

  const statusBar = [
    { key: 'good',         label: 'Good',         color: 'bg-green-500'  },
    { key: 'collect_soon', label: 'Collect Soon',  color: 'bg-yellow-500' },
    { key: 'urgent',       label: 'Urgent',        color: 'bg-orange-500' },
    { key: 'overdue',      label: 'Overdue',       color: 'bg-red-500'    },
  ]
  const total = players.length || 1

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Players', value: players.length,        icon: '👥' },
          { label: 'Matches Played', value: completed.length,      icon: '🏟' },
          { label: 'Corpus Pool',    value: `₹${totalCorpus.toLocaleString('en-IN')}`, icon: '💰' },
          { label: 'This Season',    value: tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? 'Season', icon: '📅' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Balance distribution */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Balance Status Overview</h2>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
          {statusBar.map(({ key, color }) =>
            statusCounts[key] > 0 && (
              <div key={key} className={`${color} rounded-full`} style={{ width: `${(statusCounts[key] / total) * 100}%` }} />
            )
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          {statusBar.map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1.5 text-sm text-gray-600">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              {label}: <strong>{statusCounts[key]}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Recent Matches</h2>
          <Link to="/players" className="text-sm text-green-600 hover:underline">View Roster →</Link>
        </div>
        {recentWeeks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No matches recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentWeeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <div key={w.week_id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-800">
                      {format(parseISO(w.match_date), 'MMM d, yyyy')}
                    </span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-500">{w.venue?.split(',')[0]}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    <span>👥 {played} played</span>
                    <span className={`w-2 h-2 rounded-full ${w.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Players needing attention */}
      {(statusCounts.urgent + statusCounts.overdue) > 0 && (
        <div className="card border-l-4 border-orange-400">
          <h2 className="font-semibold text-gray-800 mb-3">⚠️ Needs Attention</h2>
          <div className="divide-y divide-gray-100">
            {players
              .filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
              .map(p => (
                <div key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-800">{p.display_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">₹{p.corpus_balance.toLocaleString('en-IN')}</span>
                    <BalanceBadge status={p.balance_status} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
