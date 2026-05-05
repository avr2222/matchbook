import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig } from '../../hooks/useData'
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
        amount_requested: chosen,
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
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
        <input
          type="number"
          min="100"
          step="100"
          placeholder="Or enter custom amount"
          className="input pl-7 text-sm"
          value={customAmt}
          onChange={e => {
            setCustomAmt(e.target.value)
            const v = parseInt(e.target.value, 10)
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

  const activeTId  = cfg?.active_tournament_id
  const nextMatch  = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'scheduled')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))[0] ?? null

  const needsTopUp = player.balance_status !== 'good' && player.type !== 'ppm'
  const balance    = player.corpus_balance ?? 0

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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link to="/login" className="text-green-600 hover:underline font-medium">Log in</Link>
          {' '}to view your full transaction history.
        </p>

      </div>
    </div>
  )
}
