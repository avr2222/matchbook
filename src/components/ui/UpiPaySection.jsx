import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function UpiPaySection({ player, config }) {
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
      const { error } = await supabase.from('payment_requests').insert({
        id: reqId,
        player_id: player.id,
        amount: chosen,
        status: 'pending',
        upi_ref: '',
        notes: `UPI Topup initiated — ${player.display_name}`,
      })
      if (!error) setPendingReqId(reqId)
      else console.error('Payment request insert failed:', error.message)
      window.location.href = upiHref
    } catch (e) {
      console.error('Failed to record payment intent', e)
      window.location.href = upiHref
    } finally {
      setSaving(false)
    }
  }

  async function saveUpiRef() {
    if (!upiRef.trim() || !pendingReqId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({ upi_ref: upiRef.trim() })
        .eq('id', pendingReqId)
      if (!error) setRefSaved(true)
      else console.error('Failed to save UPI ref:', error.message)
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
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-1">Top-up amount</p>
        <div className="text-[36px] font-medium text-white tabular-nums">
          ₹{chosen.toLocaleString('en-IN')}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {balance < threshold ? 'to reach ' : 'optional top-up — '}
          <span className="text-emerald-600 font-medium">Good</span> standing
        </p>
      </div>

      <div className="flex gap-2 justify-center flex-wrap">
        {[suggested, suggested + 500, suggested + 1000].map(a => (
          <button
            key={a}
            onClick={() => { setAmount(a); setCustomAmt('') }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              chosen === a && !customAmt
                ? 'bg-[#10b981] text-white border-[#10b981]'
                : 'border-white/[0.15] text-gray-300 hover:border-[#10b981]/40'
            }`}
          >
            ₹{a.toLocaleString('en-IN')}
          </button>
        ))}
      </div>

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

      {isMobile ? (
        <button
          onClick={handlePayNow}
          disabled={saving}
          className="btn-primary w-full text-base py-3"
        >
          {saving ? 'Opening…' : `Pay ₹${chosen.toLocaleString('en-IN')} via UPI`}
        </button>
      ) : (
        <div className="bg-[rgba(16,185,129,0.08)] border border-[#10b981]/20 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-medium text-[#10b981] uppercase tracking-[0.05em]">Pay to UPI ID</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-medium text-white flex-1 break-all">{upiId}</span>
            <button
              onClick={copy}
              className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                copied
                  ? 'bg-[#10b981] text-white border-[#10b981]'
                  : 'text-[#10b981] border-[#10b981]/30 hover:bg-[#10b981]/10'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Use note: <span className="font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">{note}</span>
          </p>
          <p className="text-xs text-gray-400">Open any UPI app and pay, or open this page on your phone to pay in one tap.</p>
          {!pendingReqId && (
            <button
              onClick={handlePayNow}
              disabled={saving}
              className="text-xs text-[#10b981] font-medium hover:underline"
            >
              {saving ? 'Recording…' : 'Record payment intent →'}
            </button>
          )}
        </div>
      )}

      {pendingReqId && !refSaved && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-medium text-blue-700 uppercase tracking-[0.05em]">After paying</p>
          <p className="text-sm text-blue-300">Enter your UPI Transaction ID so admin can verify:</p>
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
        <div className="bg-[rgba(16,185,129,0.08)] border border-[#10b981]/20 rounded-xl p-3 text-center">
          <p className="text-sm font-medium text-[#10b981]">Payment reference saved!</p>
          <p className="text-xs text-[#10b981]/70 mt-1">Admin will confirm and credit your account shortly.</p>
        </div>
      )}

      {pendingReqId && !refSaved && (
        <p className="text-xs text-center text-gray-400">
          Payment pending admin confirmation. Your balance updates once confirmed.
        </p>
      )}
    </div>
  )
}
