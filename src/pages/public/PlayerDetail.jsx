import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { usePlayers, useWeeks, useTransactions, useMatchPerformances, useConfig } from '../../hooks/useData'
import { format, parseISO } from 'date-fns'
import { PageSpinner } from '../../components/ui/Spinner'
import { IconArrowLeft, IconCreditCard, IconFlame, IconMedal, IconStar, IconTarget, IconBallBowling, IconCricket, IconMapPin, IconCircleCheck } from '@tabler/icons-react'
import UpiPaySection from '../../components/ui/UpiPaySection'

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
  const [showTopUp, setShowTopUp] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [id])
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: txnData } = useTransactions()
  const { data: perfData } = useMatchPerformances(id)
  const { data: cfg }      = useConfig()

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

  const tournamentId = cfg?.active_tournament_id
  const completedWeeks = weeks
    .filter(w => w.tournament_id === tournamentId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  const perfWeekIds = new Set(perfs.map(p => p.week_id))
  let attendStreak = 0
  for (const w of completedWeeks) {
    if (perfWeekIds.has(w.week_id)) attendStreak++; else break
  }
  const attendedWeeks = completedWeeks.filter(w => perfWeekIds.has(w.week_id)).length
  const attendRate  = completedWeeks.length > 0 ? Math.round((attendedWeeks / completedWeeks.length) * 100) : 0
  const defaultFee  = cfg?.default_match_fee ?? 500
  const balance     = player.corpus_balance ?? 0
  const matchesLeft = balance > 0 ? Math.floor(balance / defaultFee) : 0
  const nextMatch   = weeks
    .filter(w => w.tournament_id === tournamentId && w.status === 'scheduled')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))[0] ?? null

  const totalPotm = perfs.reduce((s, p) => s + (p.potm_count || 0), 0)
  const totalBba  = perfs.reduce((s, p) => s + (p.bba_count  || 0), 0)
  const totalBbo  = perfs.reduce((s, p) => s + (p.bbo_count  || 0), 0)
  const badges = [
    careerHighScore >= 100                         && { Icon: IconStar,        label: 'Century Club' },
    careerHighScore >= 50 && careerHighScore < 100 && { Icon: IconCricket,     label: 'Half-century' },
    careerBestWkts >= 3                            && { Icon: IconTarget,      label: 'Hat-trick hero' },
    totalPotm > 0                                  && { Icon: IconMedal,       label: `POTM ×${totalPotm}` },
    totalBba > 0                                   && { Icon: IconStar,        label: `Best bat ×${totalBba}` },
    totalBbo > 0                                   && { Icon: IconBallBowling, label: `Best bowl ×${totalBbo}` },
    attendStreak >= 5                              && { Icon: IconFlame,       label: 'Iron Man' },
    perfs.length >= 5                              && { Icon: IconCricket,     label: 'Regular' },
  ].filter(Boolean)

  const last5    = sortedPerfs.slice(0, 5)
  const avgRuns  = perfs.length > 0 ? careerRuns / perfs.length : 0
  const avgWkts  = perfs.length > 0 ? careerWkts / perfs.length : 0
  const needsTopUp = player.balance_status !== 'good' && player.type !== 'ppm'

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
            {showTopUp ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Top up</p>
                  <button onClick={() => setShowTopUp(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <UpiPaySection player={player} config={cfg} />
              </div>
            ) : needsTopUp ? (
              <UpiPaySection player={player} config={cfg} />
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-[#1D9E75]">
                  <IconCircleCheck size={16} className="shrink-0" />
                  <span className="font-medium">Balance is healthy</span>
                </div>
                <button
                  onClick={() => setShowTopUp(true)}
                  className="text-sm text-[#1D9E75] font-medium hover:underline flex items-center gap-1"
                >
                  <IconCreditCard size={14} /> Top up
                </button>
              </div>
            )}
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

      {/* Attendance + streak + matches left */}
      {completedWeeks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card text-center py-3 px-2">
            <div className="text-[24px] font-medium text-[#1D9E75] tabular-nums">{attendRate}%</div>
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Attendance</div>
            <div className="text-xs text-gray-300 mt-0.5">{attendedWeeks}/{completedWeeks.length}</div>
          </div>
          <div className="card text-center py-3 px-2">
            <div className="flex items-center justify-center gap-1 text-[24px] font-medium text-amber-500 tabular-nums">
              {attendStreak > 0 ? <><IconFlame size={20} className="shrink-0" />{attendStreak}</> : '—'}
            </div>
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Streak</div>
            <div className="text-xs text-gray-300 mt-0.5">consecutive</div>
          </div>
          {player.type !== 'ppm' ? (
            <div className="card text-center py-3 px-2">
              <div className={`text-[24px] font-medium tabular-nums ${matchesLeft <= 2 ? 'text-red-500' : matchesLeft <= 5 ? 'text-amber-500' : 'text-[#1D9E75]'}`}>
                ~{matchesLeft}
              </div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Matches left</div>
              <div className="text-xs text-gray-300 mt-0.5">at ₹{defaultFee}/match</div>
            </div>
          ) : (
            <div className="card text-center py-3 px-2">
              <div className="text-[24px] font-medium text-gray-400">PPM</div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Pay per match</div>
            </div>
          )}
        </div>
      )}

      {/* Next match */}
      {nextMatch && (
        <div className="card bg-[#E1F5EE] border-[#1D9E75]/20 mb-4">
          <p className="text-[11px] font-medium text-[#1D9E75] uppercase tracking-[0.05em] mb-1.5">Next match</p>
          <p className="font-medium text-gray-900 text-base">{format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}</p>
          {nextMatch.venue && (
            <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
              <IconMapPin size={13} className="shrink-0 text-gray-400" />{nextMatch.venue.split(',')[0]}
            </p>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1D9E75]/20">
            <span className="text-xs text-gray-500 font-medium">Match fee</span>
            <span className="font-medium text-[#1D9E75] text-xl tabular-nums">₹{(nextMatch.match_fee ?? defaultFee).toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}

      {/* Achievements */}
      {badges.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-[11px] font-medium text-gray-900 uppercase tracking-[0.05em] mb-2">Achievements</h3>
          <div className="flex flex-wrap gap-2">
            {badges.map(({ Icon, label }) => (
              <span key={label} className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-1 rounded-full">
                <Icon size={11} className="shrink-0" /> {label}
              </span>
            ))}
          </div>
        </div>
      )}

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

          {last5.length >= 2 && (
            <div className="mb-3">
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-1.5">Form</p>
              <div className="flex gap-1.5">
                {[...last5].reverse().map(p => {
                  const empty = p.runs === 0 && p.wickets === 0
                  const good  = p.runs > avgRuns || p.wickets > avgWkts
                  return (
                    <div
                      key={p.id}
                      title={`${p.runs}r ${p.wickets}w`}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                        ${empty ? 'bg-gray-100 text-gray-400' : good ? 'bg-[#E1F5EE] text-[#1D9E75]' : 'bg-red-100 text-red-600'}`}
                    >
                      {empty ? '—' : good ? '↑' : '↓'}
                    </div>
                  )
                })}
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
