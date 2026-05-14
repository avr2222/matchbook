import { useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usePlayers, useWeeks, useTransactions, useMatchPerformances } from '../../hooks/useData'
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

  const { data: perfData } = useMatchPerformances(id)

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

  const perfs = perfData?.performances ?? []
  const careerRuns         = perfs.reduce((s, p) => s + (p.runs || 0), 0)
  const careerBalls        = perfs.reduce((s, p) => s + (p.balls_faced || 0), 0)
  const careerWkts         = perfs.reduce((s, p) => s + (p.wickets || 0), 0)
  const careerRunsGiven    = perfs.reduce((s, p) => s + (p.runs_given || 0), 0)
  const careerBallsBowled  = perfs.reduce((s, p) => s + (p.balls_bowled || 0), 0)
  const careerHighScore    = perfs.reduce((max, p) => Math.max(max, p.runs || 0), 0)
  const careerBestWkts     = perfs.reduce((max, p) => Math.max(max, p.wickets || 0), 0)
  const sortedPerfs = [...perfs].sort((a, b) => {
    const wa = weeks.find(w => w.week_id === a.week_id)
    const wb = weeks.find(w => w.week_id === b.week_id)
    return (wb?.match_date ?? '').localeCompare(wa?.match_date ?? '')
  })
  const last5 = sortedPerfs.slice(0, 5)

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

      {/* Cricket Stats */}
      {perfs.length > 0 && (
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-900 mb-3">Cricket Stats</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-green-700">{careerRuns}</div>
              <div className="text-xs text-gray-500 mt-0.5">Runs</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-purple-700">{careerWkts}</div>
              <div className="text-xs text-gray-500 mt-0.5">Wickets</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-blue-700">{perfs.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Matches</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div>
              <div className="font-bold text-gray-800 text-sm">
                {careerBalls > 0 ? ((careerRuns / careerBalls) * 100).toFixed(1) : '—'}
              </div>
              <div className="text-xs text-gray-400">Bat SR</div>
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">{careerHighScore}</div>
              <div className="text-xs text-gray-400">High Score</div>
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">
                {careerBallsBowled > 0 ? ((careerRunsGiven / careerBallsBowled) * 6).toFixed(2) : '—'}
              </div>
              <div className="text-xs text-gray-400">Economy</div>
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">{careerBestWkts}</div>
              <div className="text-xs text-gray-400">Best Wkts</div>
            </div>
          </div>

          {last5.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Last {last5.length} Matches</p>
              <div className="space-y-1.5">
                {last5.map(perf => {
                  const week = weeks.find(w => w.week_id === perf.week_id)
                  return (
                    <div key={perf.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="text-xs text-gray-500 w-14 shrink-0">
                        {week ? format(parseISO(week.match_date), 'MMM d') : perf.week_id}
                      </div>
                      <div className="flex gap-3 items-center text-sm">
                        <span>
                          <span className="font-bold text-green-700">{perf.runs}</span>
                          <span className="text-xs text-gray-400"> r</span>
                          {perf.balls_faced > 0 && (
                            <span className="text-xs text-gray-400"> ({perf.balls_faced}b)</span>
                          )}
                        </span>
                        {perf.wickets > 0 && (
                          <span>
                            <span className="font-bold text-purple-700">{perf.wickets}</span>
                            <span className="text-xs text-gray-400"> w</span>
                          </span>
                        )}
                        {(perf.fours > 0 || perf.sixes > 0) && (
                          <span className="text-xs text-gray-400">
                            {perf.fours > 0 ? `${perf.fours}×4` : ''}
                            {perf.fours > 0 && perf.sixes > 0 ? ' ' : ''}
                            {perf.sixes > 0 ? `${perf.sixes}×6` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

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
