import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig, useMatchPerformances } from '../../hooks/useData'
import { supabase } from '../../lib/supabase'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'

// Creates a pending payment_requests row and opens the UPI app.
// On return, shows a form to capture the UPI transaction ID.
function UpiPaySection({ player, config }) {
  const [amount, setAmount]             = useState(null)
  const [customAmt, setCustomAmt]       = useState('')
  const [pendingReqId, setPendingReqId] = useState(null)
  const [upiRef, setUpiRef]             = useState('')
  const [refSaved, setRefSaved]         = useState(false)
  const [copied, setCopied]             = useState(false)
  const [saving, setSaving]             = useState(false)

  const upiId     = config?.admin_upi_id
  const threshold = config?.corpus_low_threshold ?? 1000
  const balance   = player.corpus_balance ?? 0

  if (!upiId) return (
    <p className="text-sm text-gray-400 text-center py-4">UPI not configured. Contact admin.</p>
  )

  const needed    = Math.max(threshold - balance, 500)
  const suggested = Math.ceil(needed / 500) * 500
  const chosen    = amount ?? suggested
  const isMobile  = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const teamName  = config?.team_name ?? 'Cricket Team'
  const note      = `Corpus Topup - ${player.display_name}`
  const upiHref   = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(teamName)}&am=${chosen}&cu=INR&tn=${encodeURIComponent(note)}`

  async function handlePayNow() {
    setSaving(true)
    try {
      const reqId = `PREQ_${Date.now()}`
      await supabase.from('payment_requests').insert({
        id: reqId,
        player_id: player.id,
        amount: chosen,
        status: 'pending',
        upi_ref: '',
        notes: `UPI Topup initiated — ${player.display_name}`,
      })
      setPendingReqId(reqId)
      // Open UPI app
      window.location.href = upiHref
    } catch (e) {
      console.error('Failed to record payment intent', e)
      // Still open UPI even if DB write failed
      window.location.href = upiHref
    } finally {
      setSaving(false)
    }
  }

  async function saveUpiRef() {
    if (!upiRef.trim() || !pendingReqId) return
    setSaving(true)
    try {
      await supabase.from('payment_requests').update({ upi_ref: upiRef.trim() }).eq('id', pendingReqId)
      setRefSaved(true)
    } catch (e) {
      console.error('Failed to save UPI ref', e)
    } finally {
      setSaving(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(upiId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Top-up Amount</p>
        <div className="text-4xl font-extrabold text-gray-900">
          ₹{chosen.toLocaleString('en-IN')}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {balance < threshold
            ? `to reach `
            : `optional top-up — `}
          <span className="text-emerald-600 font-semibold">Good</span> standing
        </p>
      </div>

      {/* Amount selector */}
      <div className="flex gap-2 justify-center flex-wrap">
        {[suggested, suggested + 500, suggested + 1000].map(a => (
          <button
            key={a}
            onClick={() => { setAmount(a); setCustomAmt('') }}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
              chosen === a && !customAmt
                ? 'bg-green-600 text-white border-green-600'
                : 'border-gray-200 text-gray-600 hover:border-green-300'
            }`}
          >
            ₹{a.toLocaleString('en-IN')}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">₹</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Or enter custom amount"
          className="input pl-7 text-sm"
          value={customAmt}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9]/g, '')
            setCustomAmt(raw)
            const v = parseInt(raw, 10)
            setAmount(!isNaN(v) && v >= 100 ? v : null)
          }}
        />
      </div>

      {/* Pay button */}
      {isMobile ? (
        <button
          onClick={handlePayNow}
          disabled={saving}
          className="btn-primary w-full text-base py-3.5 rounded-2xl"
        >
          {saving ? 'Opening…' : `💳 Pay ₹${chosen.toLocaleString('en-IN')} via UPI`}
        </button>
      ) : (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Pay to UPI ID</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-gray-900 flex-1 break-all">{upiId}</span>
            <button
              onClick={copy}
              className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                copied
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'text-emerald-700 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Use note: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{note}</span>
          </p>
          <p className="text-xs text-gray-400">Open any UPI app and pay, or open this page on your phone to pay in one tap.</p>
          {!pendingReqId && (
            <button
              onClick={handlePayNow}
              disabled={saving}
              className="text-xs text-green-600 font-semibold hover:underline"
            >
              {saving ? 'Recording…' : 'Record payment intent →'}
            </button>
          )}
        </div>
      )}

      {/* UPI Ref capture — shown after opening UPI app */}
      {pendingReqId && !refSaved && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">After Paying</p>
          <p className="text-sm text-blue-800">Enter your UPI Transaction ID so admin can verify:</p>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm font-mono"
              placeholder="e.g. 4123456789012"
              value={upiRef}
              onChange={e => setUpiRef(e.target.value)}
            />
            <button
              onClick={saveUpiRef}
              disabled={saving || !upiRef.trim()}
              className="btn-primary text-sm py-1.5 px-3 shrink-0"
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-blue-500">This is optional but helps admin confirm faster.</p>
        </div>
      )}

      {refSaved && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
          <p className="text-sm font-semibold text-emerald-700">✓ Payment reference saved!</p>
          <p className="text-xs text-emerald-600 mt-1">Admin will confirm and credit your account shortly.</p>
        </div>
      )}

      {pendingReqId && !refSaved && (
        <p className="text-xs text-center text-gray-400">
          ⏳ Payment pending admin confirmation. Your balance updates once confirmed.
        </p>
      )}
    </div>
  )
}

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
        <div className="text-5xl">🏏</div>
        <p className="text-gray-700 font-semibold text-lg">Player not found.</p>
        <p className="text-sm text-gray-400">Check the link or contact your admin.</p>
        <Link to="/" className="inline-block mt-2 text-green-600 hover:underline text-sm font-medium">← Back to home</Link>
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

  // Attendance streak + rate
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

  // Corpus forecast — avg fee from sessions this player actually attended
  const _attendedWithFee = completedWeeks.filter(w => perfWeekIds.has(w.week_id) && (w.match_fee || 0) > 0)
  const matchFee = _attendedWithFee.length > 0
    ? Math.round(_attendedWithFee.reduce((s, w) => s + w.match_fee, 0) / _attendedWithFee.length)
    : (cfg?.default_match_fee ?? 500)
  const matchesLeft = balance > 0 && matchFee > 0 ? Math.floor(balance / matchFee) : 0

  // Career stats
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

  // Achievement badges
  const totalPotm = perfs.reduce((s, p) => s + (p.potm_count || 0), 0)
  const totalBba  = perfs.reduce((s, p) => s + (p.bba_count  || 0), 0)
  const totalBbo  = perfs.reduce((s, p) => s + (p.bbo_count  || 0), 0)
  const badges = [
    careerHighScore >= 100                         && { emoji: '💯', label: 'Century Club' },
    careerHighScore >= 50 && careerHighScore < 100 && { emoji: '🏏', label: 'Half-Century' },
    careerBestWkts >= 3                            && { emoji: '🎯', label: 'Hat-trick Hero' },
    totalPotm > 0                                  && { emoji: '🏅', label: `POTM ×${totalPotm}` },
    totalBba > 0                                   && { emoji: '🦇', label: `Best Bat ×${totalBba}` },
    totalBbo > 0                                   && { emoji: '🎳', label: `Best Bowl ×${totalBbo}` },
    attendStreak >= 5                              && { emoji: '🔥', label: 'Iron Man' },
    perfs.length >= 5                              && { emoji: '🎽', label: 'Regular' },
  ].filter(Boolean)

  const statusColor = {
    good:         'from-emerald-600 via-green-500 to-teal-500',
    collect_soon: 'from-amber-500 via-amber-400 to-yellow-400',
    urgent:       'from-orange-600 via-orange-500 to-amber-500',
    overdue:      'from-red-600 via-red-500 to-rose-500',
  }[player.balance_status] ?? 'from-gray-600 to-gray-500'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-12 px-4">
      <div className="w-full max-w-sm">

        {/* Hero gradient header */}
        <div className={`relative overflow-hidden bg-gradient-to-br ${statusColor} rounded-b-3xl px-6 pt-10 pb-10 text-white text-center shadow-xl mb-6`}>
          <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[120px] leading-none flex items-center justify-center">🏏</div>
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">{cfg?.team_name ?? 'Cricket Team'}</p>
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-extrabold mx-auto mb-3 ring-2 ring-white/30">
            {player.display_name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">Hi, {player.display_name} 👋</h1>
          <p className="text-white/60 text-xs mt-0.5">Corpus Account</p>
        </div>

        {/* Balance card */}
        <div className="card text-center mb-4 shadow-md">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Corpus Balance</p>
          <div className={`text-5xl font-extrabold tracking-tight mb-3 ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {player.type === 'ppm'
              ? <span className="text-3xl text-gray-500">PPM</span>
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
            <div className="card shadow-sm text-center py-3 px-2">
              <div className="text-2xl font-extrabold text-blue-700">{attendRate}%</div>
              <div className="text-xs text-gray-400 mt-0.5">Attendance</div>
              <div className="text-xs text-gray-300 mt-0.5">{perfs.length}/{completedWeeks.length} sessions</div>
            </div>
            <div className="card shadow-sm text-center py-3 px-2">
              <div className="text-2xl font-extrabold text-orange-500">
                {attendStreak > 0 ? `🔥${attendStreak}` : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Streak</div>
              <div className="text-xs text-gray-300 mt-0.5">consecutive</div>
            </div>
            {player.type !== 'ppm' && (
              <div className="card shadow-sm text-center py-3 px-2">
                <div className={`text-2xl font-extrabold ${matchesLeft <= 2 ? 'text-red-500' : matchesLeft <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  ~{matchesLeft}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Matches left</div>
                <div className="text-xs text-gray-300 mt-0.5">at ₹{matchFee}/match</div>
              </div>
            )}
          </div>
        )}

        {/* Pay section */}
        {needsTopUp ? (
          <div className="card shadow-md mb-4">
            <UpiPaySection player={player} config={cfg} />
          </div>
        ) : (
          <div className="card shadow-md mb-4">
            {showTopUp ? (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 text-center">Top Up</p>
                <UpiPaySection player={player} config={cfg} />
              </div>
            ) : (
              <div className="py-4 space-y-3 text-center">
                <div className="text-4xl">✅</div>
                <p className="font-bold text-emerald-700 text-lg">You're all good!</p>
                <p className="text-sm text-gray-400">Your corpus balance is healthy. No action needed.</p>
                <button
                  onClick={() => setShowTopUp(true)}
                  className="mt-1 text-sm text-green-600 font-semibold hover:text-green-700 transition-colors"
                >
                  Top up anyway →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Next match */}
        {nextMatch && (
          <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 shadow-sm mb-4">
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1.5">Next Match</p>
            <p className="font-bold text-green-900 text-base">{format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}</p>
            {nextMatch.venue && (
              <p className="text-sm text-green-700 mt-0.5 flex items-center gap-1">
                <span>📍</span>{nextMatch.venue.split(',')[0]}
              </p>
            )}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-green-100">
              <span className="text-xs text-green-500 font-medium">Match fee</span>
              <span className="font-extrabold text-green-800 text-xl">₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* Achievements */}
        {badges.length > 0 && (
          <div className="card shadow-sm mb-4">
            <h3 className="font-bold text-gray-900 mb-2 text-sm uppercase tracking-wide">Achievements</h3>
            <div className="flex flex-wrap gap-2">
              {badges.map(({ emoji, label }) => (
                <span key={label} className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {emoji} {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cricket Stats */}
        {perfs.length > 0 && (
          <div className="card shadow-sm mb-4">
            <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wide">Cricket Stats</h3>
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
                <div className="text-xs text-gray-500 mt-0.5">Weeks</div>
                {totalGames > perfs.length && (
                  <div className="text-[10px] text-blue-400 mt-0.5">{totalGames} matches</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center mb-4">
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
            {last5.length >= 2 && (() => {
              const avgRuns = careerRuns / perfs.length
              const avgWkts = careerWkts / perfs.length
              return (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Form</p>
                  <div className="flex gap-1.5">
                    {[...last5].reverse().map(p => {
                      const empty = p.runs === 0 && p.wickets === 0
                      const good  = p.runs > avgRuns || p.wickets > avgWkts
                      return (
                        <div
                          key={p.id}
                          title={`${p.runs}r ${p.wickets}w`}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                            ${empty ? 'bg-gray-100 text-gray-400' : good ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Last {last5.length} Matches</p>
                <div className="space-y-1.5">
                  {last5.map(perf => {
                    const week = weeks.find(w => w.week_id === perf.week_id)
                    return (
                      <div key={perf.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-xs text-gray-500 w-14 shrink-0">
                            {week ? format(parseISO(week.match_date), 'MMM d') : perf.week_id}
                          </div>
                          {week?.result && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md truncate max-w-[90px]">
                              {week.result}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 items-center text-sm shrink-0">
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link to="/login" className="text-green-600 hover:underline font-medium">Log in</Link>
          {' '}to view your full transaction history.
        </p>

      </div>
    </div>
  )
}
