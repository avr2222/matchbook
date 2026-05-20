import { useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usePlayers, useWeeks, useTransactions, useMatchPerformances } from '../../hooks/useData'
import { format, parseISO } from 'date-fns'
import { PageSpinner } from '../../components/ui/Spinner'
import { IconArrowLeft, IconCreditCard } from '@tabler/icons-react'

const NOT_OUT_KEYS = new Set(['not out','dnb','did not bat','absent','retired hurt','absent hurt','retired not out',''])
const isInnings   = p => (p.balls_faced || 0) > 0
const isDismissed = p => isInnings(p) && !NOT_OUT_KEYS.has((p.dismissal ?? '').toLowerCase().trim())

function PerformanceChart({ perfs, weeks }) {
  const data = [...perfs]
    .sort((a, b) => {
      const wa = weeks.find(w => w.week_id === a.week_id)
      const wb = weeks.find(w => w.week_id === b.week_id)
      return (wa?.match_date ?? '').localeCompare(wb?.match_date ?? '')
    })
    .map(p => ({ runs: p.runs || 0, wickets: p.wickets || 0 }))

  const n = data.length
  if (n < 3) return null

  const W = 400, barAreaH = 72, H = barAreaH + 4
  const maxRuns = Math.max(...data.map(d => d.runs), 1)
  const gap = 2
  const barW = Math.max(3, (W - gap) / n - gap)

  return (
    <div className="mb-4">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">Season form</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
        <line x1={0} y1={barAreaH} x2={W} y2={barAreaH} stroke="rgba(0,0,0,0.07)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = i * (barW + gap) + gap / 2
          const barH = Math.max((d.runs / maxRuns) * (barAreaH - 6), d.runs > 0 ? 2 : 0)
          const y = barAreaH - barH
          const fill = d.runs >= 30 ? '#1D9E75' : d.runs >= 15 ? '#6ECBAD' : '#B8E4D6'
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={1.5} fill={fill} opacity={0.9} />
              {d.wickets > 0 && (
                <circle cx={x + barW / 2} cy={Math.max(y - 5, 4)} r={3} fill="#7C3AED" opacity={0.85} />
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex gap-3 mt-1.5">
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1D9E75]" /> Runs
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-600" /> Wicket
        </span>
      </div>
    </div>
  )
}

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
      <Link to="/" className="text-[#1D9E75] font-medium">← Back to dashboard</Link>
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
  const totalGames         = perfs.length
  const careerInnings      = perfs.filter(isInnings).length
  const careerDismissals   = perfs.filter(isDismissed).length
  const careerNotOuts      = careerInnings - careerDismissals
  const careerAvg          = careerDismissals > 0 ? (careerRuns / careerDismissals).toFixed(1) : '—'
  const sortedPerfs = [...perfs].sort((a, b) => {
    const wa = weeks.find(w => w.week_id === a.week_id)
    const wb = weeks.find(w => w.week_id === b.week_id)
    return (wb?.match_date ?? '').localeCompare(wa?.match_date ?? '')
  })
  const sessionGroups = sortedPerfs.reduce((acc, perf) => {
    const existing = acc.find(g => g.week_id === perf.week_id)
    if (existing) existing.games.push(perf)
    else acc.push({ week_id: perf.week_id, games: [perf] })
    return acc
  }, [])

  return (
    <div className="max-w-lg mx-auto px-4 pb-12">

      {/* Back nav */}
      <div className="flex items-center gap-3 py-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 transition-colors">
          <IconArrowLeft size={20} />
        </button>
        <h1 className="font-medium text-gray-900">Player details</h1>
      </div>

      {/* Player card */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[20px] font-medium text-gray-900">{player.display_name}</h2>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">{player.type} · {player.status}</p>
          </div>
          <div className="text-right">
            <div className="text-[24px] font-medium text-gray-900 tabular-nums">
              ₹{Math.round(player.corpus_balance ?? 0).toLocaleString('en-IN')}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc}`}>
              {(player.balance_status ?? '').replace('_', ' ')}
            </span>
          </div>
        </div>

        {player.type !== 'ppm' && player.type !== 'guest' && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)]">
            <Link
              to={`/pay/${player.id}`}
              className="w-full btn-primary text-sm flex items-center justify-center gap-2"
            >
              <IconCreditCard size={15} />
              Top up balance
            </Link>
          </div>
        )}

        {txns.length > 0 && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] text-sm">
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Total paid in</div>
              <div className="font-medium text-[#1D9E75]">+₹{Math.round(totalCredits).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Total deducted</div>
              <div className="font-medium text-red-500">−₹{Math.round(totalDebits).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Transactions</div>
              <div className="font-medium text-gray-700">{txns.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Cricket Stats */}
      {perfs.length > 0 && (
        <div className="card mb-4">
          <h3 className="font-medium text-gray-900 mb-3">Cricket stats</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#F4F3F0] rounded-xl p-3 text-center">
              <div className="text-[24px] font-medium text-gray-900 tabular-nums">{careerRuns}</div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Runs</div>
            </div>
            <div className="bg-[#F4F3F0] rounded-xl p-3 text-center">
              <div className="text-[24px] font-medium text-gray-900 tabular-nums">{careerWkts}</div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Wickets</div>
            </div>
            <div className="bg-[#F4F3F0] rounded-xl p-3 text-center">
              <div className="text-[24px] font-medium text-gray-900 tabular-nums">{perfs.length}</div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Weeks</div>
              {totalGames > perfs.length && (
                <div className="text-[10px] text-gray-400 mt-0.5">{totalGames} matches</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-center">
            <div>
              <div className="font-medium text-gray-800 text-sm tabular-nums">
                {careerBalls > 0 ? ((careerRuns / careerBalls) * 100).toFixed(1) : '—'}
              </div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Bat SR</div>
            </div>
            <div>
              <div className="font-medium text-gray-800 text-sm tabular-nums">{careerHighScore}</div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">High score</div>
            </div>
            <div>
              <div className="font-medium text-gray-800 text-sm tabular-nums">
                {careerBallsBowled > 0 ? ((careerRunsGiven / careerBallsBowled) * 6).toFixed(2) : '—'}
              </div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Economy</div>
            </div>
            <div>
              <div className="font-medium text-gray-800 text-sm tabular-nums">{careerBestWkts}</div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Best wkts</div>
            </div>
          </div>

          {careerInnings > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
              <div>
                <div className="font-medium text-gray-800 tabular-nums">{careerInnings}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Innings</div>
              </div>
              <div>
                <div className="font-medium text-gray-800 tabular-nums">{careerAvg}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Avg</div>
              </div>
              <div>
                <div className="font-medium text-gray-800 tabular-nums">{careerNotOuts}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Not outs</div>
              </div>
            </div>
          )}

          <PerformanceChart perfs={perfs} weeks={weeks} />

          {sessionGroups.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">Match history</p>
              <div className="space-y-3">
                {sessionGroups.map(({ week_id, games }) => {
                  const week = weeks.find(w => w.week_id === week_id)
                  return (
                    <div key={week_id}>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.06em] mb-1 px-1">
                        {week ? format(parseISO(week.match_date), 'MMM d, yyyy') : week_id}
                      </p>
                      <div className="space-y-1">
                        {games.map(perf => (
                          <div key={perf.id} className="flex items-center justify-between bg-[#F4F3F0] rounded-lg px-3 py-2">
                            <div className="flex gap-3 items-center text-sm">
                              <span>
                                <span className="font-medium text-[#1D9E75] tabular-nums">{perf.runs}</span>
                                <span className="text-xs text-gray-400"> r</span>
                                {perf.balls_faced > 0 && (
                                  <span className="text-xs text-gray-400"> ({perf.balls_faced}b)</span>
                                )}
                              </span>
                              {perf.wickets > 0 && (
                                <span>
                                  <span className="font-medium text-purple-700 tabular-nums">{perf.wickets}</span>
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
                        ))}
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
        <h3 className="font-medium text-gray-900 mb-1">Transaction history</h3>
        {txns.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.04)] -mx-4 -mb-4 mt-2">
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
                  <div className={`font-mono font-medium text-sm shrink-0 ${t.direction === 'credit' ? 'text-[#1D9E75]' : 'text-red-500'}`}>
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
