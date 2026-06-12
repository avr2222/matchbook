import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig, useMatchPerformances } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import UpiPaySection from '../../components/ui/UpiPaySection'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'
import { IconCircleCheck, IconMapPin, IconFlame, IconCricket, IconMedal, IconStar, IconTarget, IconBallBowling } from '@tabler/icons-react'

export default function PlayerPay() {
  const [showTopUp, setShowTopUp] = useState(false)
  const { playerId } = useParams()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const { data: perfData } = useMatchPerformances(playerId)

  if (isLoading) return <PageSpinner />

  const player = (pData?.players ?? []).find(p => p.id === playerId)

  if (!player) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center space-y-3">
        <IconCricket size={40} className="text-gray-300 mx-auto" />
        <p className="text-gray-300 font-medium text-lg">Player not found.</p>
        <p className="text-sm text-gray-400">Check the link or contact your admin.</p>
        <Link to="/" className="inline-block mt-2 text-[#10b981] hover:underline text-sm font-medium">← Back to home</Link>
      </div>
    )
  }

  const weeks      = wData?.weeks ?? []
  const activeTId  = cfg?.active_tournament_id
  const nextMatch  = weeks
    .filter(w => w.tournament_id === activeTId && w.status === 'scheduled')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))[0] ?? null

  const needsTopUp = player.balance_status !== 'good' && player.type !== 'ppm'
  const balance    = player.corpus_balance ?? 0

  const perfs = perfData?.performances ?? []

  const completedWeeks = weeks
    .filter(w => w.tournament_id === activeTId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
  const perfWeekIds = new Set(perfs.map(p => p.week_id))
  let attendStreak = 0
  for (const w of completedWeeks) {
    if (perfWeekIds.has(w.week_id)) attendStreak++
    else break
  }
  const attendRate = completedWeeks.length > 0
    ? Math.round((perfs.length / completedWeeks.length) * 100)
    : 0

  const _attendedWithFee = completedWeeks.filter(w => perfWeekIds.has(w.week_id) && (w.match_fee || 0) > 0)
  const matchFee = _attendedWithFee.length > 0
    ? Math.round(_attendedWithFee.reduce((s, w) => s + w.match_fee, 0) / _attendedWithFee.length)
    : (cfg?.default_match_fee ?? 500)
  const matchesLeft = balance > 0 && matchFee > 0 ? Math.floor(balance / matchFee) : 0

  const careerRuns        = perfs.reduce((s, p) => s + (p.runs        || 0), 0)
  const careerWkts        = perfs.reduce((s, p) => s + (p.wickets     || 0), 0)
  const careerBalls       = perfs.reduce((s, p) => s + (p.balls_faced || 0), 0)
  const careerBallsBowled = perfs.reduce((s, p) => s + (p.balls_bowled|| 0), 0)
  const careerRunsGiven   = perfs.reduce((s, p) => s + (p.runs_given  || 0), 0)
  const careerHighScore   = perfs.reduce((max, p) => Math.max(max, p.runs     || 0), 0)
  const careerBestWkts    = perfs.reduce((max, p) => Math.max(max, p.wickets  || 0), 0)
  const sortedPerfs = [...perfs].sort((a, b) => {
    const wa = weeks.find(w => w.week_id === a.week_id)
    const wb = weeks.find(w => w.week_id === b.week_id)
    return (wb?.match_date ?? '').localeCompare(wa?.match_date ?? '')
  })
  const last5      = sortedPerfs.slice(0, 5)
  const totalGames = perfs.reduce((s, p) => s + (p.match_count || 1), 0)

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

  return (
    <div className="min-h-screen flex flex-col items-center pb-12 px-4">
      <div className="w-full max-w-sm">

        {/* Hero */}
        <div className="bg-[#10b981] rounded-b-xl px-6 pt-10 pb-10 text-white text-center mb-6">
          <p className="text-white/70 text-xs font-medium uppercase tracking-[0.05em] mb-2">{cfg?.team_name ?? 'Cricket Team'}</p>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-medium mx-auto mb-3">
            {player.display_name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-medium">Hi, {player.display_name}</h1>
          <p className="text-white/60 text-xs mt-0.5">Corpus account</p>
        </div>

        {/* Balance card */}
        <div className="card text-center mb-4">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">Corpus balance</p>
          <div className={`text-[40px] font-medium tracking-tight tabular-nums mb-3 ${balance < 0 ? 'text-red-400' : 'text-gray-100'}`}>
            {player.type === 'ppm'
              ? <span className="text-[28px] text-gray-500">PPM</span>
              : `₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
          </div>
          <div className="flex justify-center">
            <BalanceBadge status={player.balance_status} />
          </div>
        </div>

        {/* Attendance + Forecast */}
        {completedWeeks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card text-center py-3 px-2">
              <div className="text-[24px] font-medium text-[#10b981] tabular-nums">{attendRate}%</div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Attendance</div>
              <div className="text-xs text-gray-300 mt-0.5">{perfs.length}/{completedWeeks.length}</div>
            </div>
            <div className="card text-center py-3 px-2">
              <div className="flex items-center justify-center gap-1 text-[24px] font-medium text-amber-500 tabular-nums">
                {attendStreak > 0 ? (
                  <><IconFlame size={20} className="shrink-0" />{attendStreak}</>
                ) : '—'}
              </div>
              <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Streak</div>
              <div className="text-xs text-gray-300 mt-0.5">consecutive</div>
            </div>
            {player.type !== 'ppm' && (
              <div className="card text-center py-3 px-2">
                <div className={`text-[24px] font-medium tabular-nums ${matchesLeft <= 2 ? 'text-red-500' : matchesLeft <= 5 ? 'text-amber-500' : 'text-[#10b981]'}`}>
                  ~{matchesLeft}
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mt-0.5">Matches left</div>
                <div className="text-xs text-gray-300 mt-0.5">at ₹{matchFee}/match</div>
              </div>
            )}
          </div>
        )}

        {/* Pay section */}
        {needsTopUp ? (
          <div className="card mb-4">
            <UpiPaySection player={player} config={cfg} />
          </div>
        ) : (
          <div className="card mb-4">
            {showTopUp ? (
              <div>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-3 text-center">Top up</p>
                <UpiPaySection player={player} config={cfg} />
              </div>
            ) : (
              <div className="py-4 space-y-3 text-center">
                <IconCircleCheck size={36} className="text-[#10b981] mx-auto" />
                <p className="font-medium text-[#10b981] text-base">You're all good!</p>
                <p className="text-sm text-gray-400">Your corpus balance is healthy. No action needed.</p>
                <button
                  onClick={() => setShowTopUp(true)}
                  className="mt-1 text-sm text-[#10b981] font-medium hover:underline transition-colors"
                >
                  Top up anyway →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Next match */}
        {nextMatch && (
          <div className="card bg-[rgba(16,185,129,0.08)] border-[#10b981]/20 mb-4">
            <p className="text-[11px] font-medium text-[#10b981] uppercase tracking-[0.05em] mb-1.5">Next match</p>
            <p className="font-medium text-gray-100 text-base">{format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}</p>
            {nextMatch.venue && (
              <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1">
                <IconMapPin size={13} className="shrink-0 text-gray-400" />{nextMatch.venue.split(',')[0]}
              </p>
            )}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#10b981]/20">
              <span className="text-xs text-gray-500 font-medium">Match fee</span>
              <span className="font-medium text-[#10b981] text-xl tabular-nums">₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* Achievements */}
        {badges.length > 0 && (
          <div className="card mb-4">
            <h3 className="font-medium text-gray-100 mb-2 text-[11px] uppercase tracking-[0.05em]">Achievements</h3>
            <div className="flex flex-wrap gap-2">
              {badges.map(({ Icon, label }) => (
                <span key={label} className="flex items-center gap-1 bg-amber-900/20 text-amber-300 border border-amber-700/30 text-xs font-medium px-2.5 py-1 rounded-full">
                  <Icon size={11} className="shrink-0" /> {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cricket Stats */}
        {perfs.length > 0 && (
          <div className="card mb-4">
            <h3 className="font-medium text-gray-100 mb-3 text-[11px] uppercase tracking-[0.05em]">Cricket stats</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-[24px] font-medium text-gray-100 tabular-nums">{careerRuns}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Runs</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-[24px] font-medium text-gray-100 tabular-nums">{careerWkts}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Wickets</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-[24px] font-medium text-gray-100 tabular-nums">{perfs.length}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-[0.05em] mt-0.5">Weeks</div>
                {totalGames > perfs.length && (
                  <div className="text-[10px] text-gray-400 mt-0.5">{totalGames} matches</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center mb-4">
              <div>
                <div className="font-medium text-gray-100 text-sm tabular-nums">
                  {careerBalls > 0 ? ((careerRuns / careerBalls) * 100).toFixed(1) : '—'}
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Bat SR</div>
              </div>
              <div>
                <div className="font-medium text-gray-100 text-sm tabular-nums">{careerHighScore}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">High score</div>
              </div>
              <div>
                <div className="font-medium text-gray-100 text-sm tabular-nums">
                  {careerBallsBowled > 0 ? ((careerRunsGiven / careerBallsBowled) * 6).toFixed(2) : '—'}
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Economy</div>
              </div>
              <div>
                <div className="font-medium text-gray-100 text-sm tabular-nums">{careerBestWkts}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em]">Best wkts</div>
              </div>
            </div>
            {last5.length >= 2 && (() => {
              const avgRuns = careerRuns / perfs.length
              const avgWkts = careerWkts / perfs.length
              return (
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
                            ${empty ? 'bg-white/[0.06] text-gray-500' : good ? 'bg-[rgba(16,185,129,0.08)] text-[#10b981]' : 'bg-red-900/20 text-red-400'}`}
                        >
                          {empty ? '—' : good ? '↑' : '↓'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            {last5.length > 0 && (
              <>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">Last {last5.length} matches</p>
                <div className="space-y-1.5">
                  {last5.map(perf => {
                    const week = weeks.find(w => w.week_id === perf.week_id)
                    return (
                      <div key={perf.id} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-xs text-gray-500 w-14 shrink-0">
                            {week ? format(parseISO(week.match_date), 'MMM d') : perf.week_id}
                          </div>
                          {week?.result && (
                            <span className="text-xs font-medium text-[#10b981] bg-[rgba(16,185,129,0.08)] px-1.5 py-0.5 rounded-md truncate max-w-[90px]">
                              {week.result}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 items-center text-sm shrink-0">
                          <span>
                            <span className="font-medium text-[#10b981] tabular-nums">{perf.runs}</span>
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
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link to="/login" className="text-[#10b981] hover:underline font-medium">Log in</Link>
          {' '}to view your full transaction history.
        </p>

      </div>
    </div>
  )
}
