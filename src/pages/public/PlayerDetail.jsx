import { useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usePlayers, useWeeks, useTransactions } from '../../hooks/useData'
import { format, parseISO } from 'date-fns'
import { PageSpinner } from '../../components/ui/Spinner'

const STATUS_COLOR = {
  good:         'bg-emerald-100 text-emerald-700',
  collect_soon: 'bg-amber-100 text-amber-700',
  urgent:       'bg-orange-100 text-orange-700',
  overdue:      'bg-red-100 text-red-700',
}

export default function PlayerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => { window.scrollTo(0, 0) }, [id])
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: txnData } = useTransactions()

  if (isLoading) return <PageSpinner />

  const player = (pData?.players ?? []).find(p => p.id === id)

  if (!player) return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <p className="text-gray-400 mb-4">Player not found.</p>
      <Link to="/" className="text-green-600 font-medium">← Back to Dashboard</Link>
    </div>
  )

  const txns = (txnData?.transactions ?? [])
    .filter(t => t.player_id === id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const weeks = wData?.weeks ?? []
  const sc = STATUS_COLOR[player.balance_status] ?? 'bg-gray-100 text-gray-600'

  const totalCredits = txns.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amount, 0)
  const totalDebits  = txns.filter(t => t.direction === 'debit').reduce((s, t)  => s + t.amount, 0)

  return (
    <div className="max-w-lg mx-auto px-4 pb-12">

      {/* Back nav */}
      <div className="flex items-center gap-3 py-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">←</button>
        <h1 className="font-bold text-gray-900">Player Details</h1>
      </div>

      {/* Player card */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{player.display_name}</h2>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">{player.type} · {player.status}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              ₹{Math.round(player.corpus_balance ?? 0).toLocaleString('en-IN')}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc}`}>
              {(player.balance_status ?? '').replace('_', ' ')}
            </span>
          </div>
        </div>

        {player.type !== 'ppm' && player.type !== 'guest' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link
              to={`/pay/${player.id}`}
              className="w-full btn-primary text-sm flex items-center justify-center gap-2"
            >
              💳 Top Up Balance
            </Link>
          </div>
        )}

        {txns.length > 0 && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
            <div>
              <div className="text-xs text-gray-400">Total paid in</div>
              <div className="font-semibold text-green-600">+₹{Math.round(totalCredits).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Total deducted</div>
              <div className="font-semibold text-red-500">−₹{Math.round(totalDebits).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Transactions</div>
              <div className="font-semibold text-gray-700">{txns.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-1">Transaction History</h3>
        {txns.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-gray-50 -mx-4 -mb-4 mt-2">
            {txns.map(t => {
              const week = weeks.find(w => w.week_id === t.week_id)
              return (
                <div key={t.id} className="flex items-start justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="text-xs text-gray-400">
                      {format(parseISO(t.date), 'MMM d, yyyy')}
                      {week ? ` · ${week.label}` : ''}
                    </div>
                    <div className="text-sm text-gray-700 mt-0.5">{t.description}</div>
                    <div className="text-xs text-gray-400 mt-0.5 capitalize">{(t.type ?? '').replace(/_/g, ' ')}</div>
                  </div>
                  <div className={`font-mono font-semibold text-sm shrink-0 ${t.direction === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.direction === 'credit' ? '+' : '−'}₹{t.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
