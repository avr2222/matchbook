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
  const allActive   = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = allActive.filter(p => p.type === 'corpus' || p.type === 'new')
  const weeks       = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed   = weeks.filter(w => w.status === 'completed')
  const scheduled   = weeks.filter(w => w.status === 'scheduled').sort((a, b) => a.match_date.localeCompare(b.match_date))
  const records     = aData?.records ?? []
  const nextMatch   = scheduled[0] ?? null

  // Status counts — corpus/new players only (PPM/guests don't have corpus balances)
  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  corpusPlayers.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })

  // Actual remaining pool = sum of all corpus balances (not total paid)
  const remainingPool = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)

  const recentWeeks = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)

  const todayStr = new Date().toISOString().slice(0, 10)
  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= todayStr)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posted_on.localeCompare(a.posted_on))

  const statusBar = [
    { key: 'good',         label: 'Good',        color: 'bg-green-500'  },
    { key: 'collect_soon', label: 'Collect Soon', color: 'bg-yellow-500' },
    { key: 'urgent',       label: 'Urgent',       color: 'bg-orange-500' },
    { key: 'overdue',      label: 'Overdue',      color: 'bg-red-500'    },
  ]
  const corpusTotal = corpusPlayers.length || 1
  const atRiskCount = statusCounts.urgent + statusCounts.overdue

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Announcements */}
      {activeAnnouncements.map(a => (
        <div key={a.id} className="card bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">{a.pinned ? '📌' : '📢'}</span>
            <div>
              <p className="font-semibold text-blue-900 text-sm">{a.title}</p>
              <p className="text-blue-800 text-sm mt-0.5">{a.body}</p>
              <p className="text-xs text-blue-400 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Next match */}
      {nextMatch && (
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Next Match</p>
              <p className="font-semibold text-green-900 mt-0.5 text-lg">
                {format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}
              </p>
              {nextMatch.venue && (
                <p className="text-sm text-green-700 mt-0.5">{nextMatch.venue.split(',')[0]}</p>
              )}
              {nextMatch.notes && <p className="text-xs text-green-600 mt-1">{nextMatch.notes}</p>}
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-xs text-green-600">Match fee</p>
              <p className="font-bold text-green-900 text-xl">
                ₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Players',   value: allActive.length,   icon: '👥' },
          { label: 'Matches Played',   value: completed.length,   icon: '🏏' },
          { label: 'Corpus Remaining', value: `₹${Math.round(remainingPool).toLocaleString('en-IN')}`, icon: '💰' },
          { label: 'Season',           value: tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? cfg?.team_name ?? 'Season 2', icon: '🏆' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Balance distribution — corpus players only */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Corpus Balance Health</h2>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
          {statusBar.map(({ key, color }) =>
            statusCounts[key] > 0 && (
              <div key={key} className={`${color} rounded-full`} style={{ width: `${(statusCounts[key] / corpusTotal) * 100}%` }} />
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
        {atRiskCount > 0 && (
          <p className="text-xs text-orange-600 mt-3">
            ⚠️ {atRiskCount} player{atRiskCount > 1 ? 's' : ''} need{atRiskCount === 1 ? 's' : ''} to top up.{' '}
            <Link to="/login" className="underline">Log in</Link> to view details.
          </p>
        )}
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
                <div
                  key={w.week_id}
                  className="py-3 flex items-center justify-between text-sm cursor-pointer hover:bg-gray-50 -mx-4 px-4 rounded-lg transition-colors"
                  onClick={() => setDetail(w.week_id)}
                >
                  <div>
                    <span className="font-medium text-gray-800">
                      {format(parseISO(w.match_date), 'MMM d, yyyy')}
                    </span>
                    {w.venue && (
                      <>
                        <span className="text-gray-400 mx-2">·</span>
                        <span className="text-gray-500">{w.venue.split(',')[0]}</span>
                      </>
                    )}
                    {w.result && (
                      <span className="ml-2 text-xs font-medium text-green-700">{w.result}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    <span className="text-green-700 font-medium">👥 {played}</span>
                    <span className="text-xs text-gray-400">Who played →</span>
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
