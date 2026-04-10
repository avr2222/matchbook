import { usePlayers, useWeeks, useAttendance, useTransactions, useConfig } from '../../hooks/useData'
import { useAuthStore } from '../../store/authStore'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'

export default function MyDashboard() {
  const { playerId } = useAuthStore()
  const { data: cfg }   = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: aData } = useAttendance()
  const { data: tData } = useTransactions()

  if (isLoading) return <PageSpinner />

  const player = pData?.players?.find(p => p.id === playerId)
  if (!player) return <div className="p-8 text-gray-500">Player profile not found.</div>

  const activeTournamentId = cfg?.active_tournament_id
  const myAttendance = (aData?.records ?? []).filter(r => r.player_id === playerId && r.tournament_id === activeTournamentId)
  const myTransactions = (tData?.transactions ?? [])
    .filter(t => t.player_id === playerId && t.tournament_id === activeTournamentId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  const played = myAttendance.filter(r => r.status === 'played').length
  const weeks  = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId && w.status === 'completed')

  const activityFeed = myAttendance.map(r => {
    const week = weeks.find(w => w.week_id === r.week_id)
    return { date: week?.match_date ?? '', label: week ? format(parseISO(week.match_date), 'MMM d') : r.week_id, type: 'attendance', status: r.status }
  }).concat(myTransactions.map(t => ({
    date: t.date, label: format(parseISO(t.date), 'MMM d'), type: 'transaction',
    direction: t.direction, amount: t.amount, description: t.description,
  }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">My Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-900">
            {player.type === 'ppm' ? 'PPM' : `₹${(player.corpus_balance ?? 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-sm text-gray-500 mt-1">My Balance</div>
          <div className="mt-2"><BalanceBadge status={player.balance_status} /></div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-900">{played}</div>
          <div className="text-sm text-gray-500 mt-1">Weeks Played</div>
          <div className="text-xs text-gray-400 mt-1">out of {weeks.length} this season</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Recent Activity</h2>
        {activityFeed.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activityFeed.map((item, i) => (
              <div key={i} className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {item.type === 'attendance'
                      ? item.status === 'played' ? '✅' : '❌'
                      : item.direction === 'credit' ? '💰' : '🔻'}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800">{item.label}</div>
                    {item.description && <div className="text-xs text-gray-500">{item.description}</div>}
                    {item.type === 'attendance' && (
                      <div className="text-xs text-gray-500">{item.status === 'played' ? 'Played' : 'Absent'}</div>
                    )}
                  </div>
                </div>
                {item.type === 'transaction' && (
                  <span className={`font-mono font-medium ${item.direction === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {item.direction === 'credit' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
