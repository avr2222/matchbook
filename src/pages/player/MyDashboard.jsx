import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useWeeks, useAttendance, useTransactions, useConfig, useAnnouncements, usePaymentRequests } from '../../hooks/useData'
import { writePaymentRequests } from '../../api/dataWriter'
import { useAuthStore } from '../../store/authStore'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { showToast } from '../../components/ui/Toast'
import { generateId } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'

function PayNowButton({ player, config }) {
  const [copied, setCopied] = useState(false)
  const upiId    = config?.admin_upi_id
  const threshold = config?.corpus_low_threshold ?? 1000
  const balance   = player.corpus_balance ?? 0

  if (!upiId || player.balance_status === 'good') return null

  // Round up to nearest ₹500 to bring balance comfortably above threshold
  const needed    = Math.max(threshold - balance, 500)
  const suggested = Math.ceil(needed / 500) * 500

  const isMobile  = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const name      = encodeURIComponent(config?.team_name ?? 'Cricket Team')
  const note      = encodeURIComponent(`Corpus Topup - ${player.display_name}`)
  const upiHref   = `upi://pay?pa=${upiId}&pn=${name}&am=${suggested}&cu=INR&tn=${note}`

  function copyUpi() {
    navigator.clipboard?.writeText(upiId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (isMobile) {
    return (
      <a href={upiHref} className="mt-3 btn-primary text-sm w-full text-center block">
        💳 Pay ₹{suggested.toLocaleString('en-IN')} via UPI
      </a>
    )
  }

  return (
    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-left">
      <p className="text-xs font-semibold text-green-800 mb-1">
        Top up ₹{suggested.toLocaleString('en-IN')} to reach Good status
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="font-mono text-sm bg-white border border-gray-200 rounded px-2 py-1 flex-1 text-gray-800 truncate">
          {upiId}
        </span>
        <button
          onClick={copyUpi}
          className="text-xs text-green-700 font-medium hover:underline whitespace-nowrap"
        >
          {copied ? '✓ Copied' : 'Copy ID'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">Open on mobile to pay directly via UPI app</p>
    </div>
  )
}

function PaymentProofForm({ playerId, cfg, existingRequests }) {
  const qc = useQueryClient()
  const [open, setOpen]       = useState(false)
  const [amount, setAmount]   = useState('')
  const [upiRef, setUpiRef]   = useState('')
  const [saving, setSaving]   = useState(false)

  const pending = existingRequests.filter(r => r.player_id === playerId && r.status === 'pending')

  async function submit() {
    if (!upiRef.trim() || parseFloat(amount) <= 0) { showToast('Amount and UPI reference required', 'error'); return }
    setSaving(true)
    try {
      const id = generateId('REQ', existingRequests.map(r => r.id))
      const req = {
        id, player_id: playerId,
        amount: parseFloat(amount),
        upi_ref: upiRef.trim(),
        submitted_on: new Date().toISOString().slice(0, 10),
        status: 'pending',
        reviewed_on: null,
        notes: '',
      }
      await writePaymentRequests([...existingRequests, req], `Payment proof submitted by ${playerId}`)
      qc.invalidateQueries({ queryKey: ['payment_requests'] })
      setOpen(false)
      setAmount('')
      setUpiRef('')
      showToast('Payment reference submitted — admin will verify and credit your account')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card border-l-4 border-green-400 space-y-2">
      <p className="text-sm font-semibold text-gray-800">Already paid via UPI?</p>
      {pending.length > 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
          ⏳ {pending.length} pending request{pending.length > 1 ? 's' : ''} awaiting admin review
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-green-600 hover:underline">
          Submit your UPI transaction reference →
        </button>
      ) : (
        <div className="space-y-2 pt-1">
          <input
            className="input text-sm"
            type="number" min="1"
            placeholder={`Amount paid (₹)`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <input
            className="input text-sm"
            placeholder="UPI Transaction ID / UTR number"
            value={upiRef}
            onChange={e => setUpiRef(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="btn-primary text-sm py-1.5">
              {saving ? 'Submitting…' : 'Submit'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary text-sm py-1.5">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MyDashboard() {
  const [detail, setDetail]           = useState(null)
  const [showAllTxns, setShowAllTxns] = useState(false)
  const { playerId } = useAuthStore()
  const { data: cfg }              = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }            = useWeeks()
  const { data: aData }            = useAttendance()
  const { data: tData }            = useTransactions()
  const { data: annData }          = useAnnouncements()
  const { data: reqData }          = usePaymentRequests()

  if (isLoading) return <PageSpinner />

  const player = pData?.players?.find(p => p.id === playerId)
  if (!player) return <div className="p-8 text-gray-500">Player profile not found.</div>

  const activeTId    = cfg?.active_tournament_id
  const allPlayers   = pData?.players ?? []
  const allRecords   = aData?.records ?? []
  const myAttendance = allRecords.filter(r => r.player_id === playerId && r.tournament_id === activeTId)

  const completedWeeks = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))

  const scheduledWeeks = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'scheduled')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))

  const allMyTxns = (tData?.transactions ?? [])
    .filter(t => t.player_id === playerId && t.tournament_id === activeTId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const played = myAttendance.filter(r => r.status === 'played').length
  const total  = completedWeeks.length
  const pct    = total > 0 ? Math.round((played / total) * 100) : 0

  const missedWeeks = completedWeeks
    .filter(w => {
      const r = myAttendance.find(a => a.week_id === w.week_id)
      return !r || r.status === 'absent'
    })
    .slice(0, 3)

  const displayedTxns = showAllTxns ? allMyTxns : allMyTxns.slice(0, 10)

  const activityFeed = myAttendance.map(r => {
    const week = completedWeeks.find(w => w.week_id === r.week_id)
    return {
      date: week?.match_date ?? '', week_id: r.week_id,
      label: week ? format(parseISO(week.match_date), 'MMM d, yyyy') : r.week_id,
      type: 'attendance', status: r.status,
    }
  }).concat(displayedTxns.map(t => ({
    date: t.date, week_id: t.week_id ?? null,
    label: format(parseISO(t.date), 'MMM d, yyyy'),
    type: 'transaction', direction: t.direction, amount: t.amount, description: t.description,
  }))).sort((a, b) => b.date.localeCompare(a.date))

  const today = new Date().toISOString().slice(0, 10)
  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= today)
    .sort((a, b) => b.posted_on.localeCompare(a.posted_on))

  const nextMatch = scheduledWeeks[0]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">My Dashboard</h1>

      {/* Announcements */}
      {activeAnnouncements.map(a => (
        <div key={a.id} className="card bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">📢</span>
            <div>
              <p className="font-semibold text-blue-900 text-sm">{a.title}</p>
              <p className="text-blue-800 text-sm mt-0.5">{a.body}</p>
              <p className="text-xs text-blue-500 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
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
              <p className="font-semibold text-green-900 mt-0.5">
                {format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}
              </p>
              {nextMatch.venue && (
                <p className="text-sm text-green-700">{nextMatch.venue.split(',')[0]}</p>
              )}
              {nextMatch.notes && <p className="text-xs text-green-600 mt-1">{nextMatch.notes}</p>}
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-xs text-green-600">Match fee</p>
              <p className="font-bold text-green-900 text-lg">
                ₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}
              </p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `🏏 ${cfg?.team_name ?? 'Cricket'} — next match on ${format(parseISO(nextMatch.match_date), 'EEEE, MMM d')} at ${nextMatch.venue?.split(',')[0] ?? 'TBD'}. Fee: ₹${nextMatch.match_fee}. Reply if you're playing!`
                )}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-green-600 hover:underline mt-1 inline-block"
              >
                📤 Share on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-900">
            {player.type === 'ppm' ? 'PPM' : `₹${(player.corpus_balance ?? 0).toLocaleString('en-IN')}`}
          </div>
          <div className="text-sm text-gray-500 mt-1">My Balance</div>
          <div className="mt-2"><BalanceBadge status={player.balance_status} /></div>
          {player.type !== 'ppm' && <PayNowButton player={player} config={cfg} />}
        </div>

        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-900">
            {played}<span className="text-xl text-gray-400">/{total}</span>
          </div>
          <div className="text-sm text-gray-500 mt-1">Matches Played</div>
          <div className={`text-xs font-semibold mt-2 ${pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
            {pct}% attendance
          </div>
        </div>
      </div>

      {/* Payment proof submission */}
      {player.type !== 'ppm' && cfg?.admin_upi_id && (
        <PaymentProofForm
          playerId={playerId}
          cfg={cfg}
          existingRequests={reqData?.requests ?? []}
        />
      )}

      {/* Missed matches */}
      {missedWeeks.length > 0 && (
        <div className="card border-l-4 border-gray-300">
          <h2 className="font-semibold text-gray-700 mb-2 text-sm">Recent Missed Matches</h2>
          <div className="space-y-1.5">
            {missedWeeks.map(w => (
              <div key={w.week_id} className="flex items-center justify-between text-sm text-gray-600">
                <span>❌ {format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                {w.venue && <span className="text-xs text-gray-400">{w.venue.split(',')[0]}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Activity</h2>
        {activityFeed.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activityFeed.map((item, i) => (
              <div
                key={i}
                className={`py-3 flex items-center justify-between text-sm ${
                  item.type === 'attendance' && item.status === 'played'
                    ? 'cursor-pointer hover:bg-gray-50 -mx-4 px-4 rounded-lg'
                    : ''
                }`}
                onClick={() =>
                  item.type === 'attendance' && item.status === 'played' && item.week_id && setDetail(item.week_id)
                }
              >
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
                      <div className="text-xs text-gray-500">
                        {item.status === 'played' ? 'Played · tap to see teammates' : 'Absent'}
                      </div>
                    )}
                  </div>
                </div>
                {item.type === 'transaction' && (
                  <span className={`font-mono font-medium ${item.direction === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {item.direction === 'credit' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                  </span>
                )}
                {item.type === 'attendance' && item.status === 'played' && (
                  <span className="text-xs text-gray-400">→</span>
                )}
              </div>
            ))}
          </div>
        )}
        {allMyTxns.length > 10 && (
          <button
            onClick={() => setShowAllTxns(v => !v)}
            className="mt-3 text-sm text-green-600 hover:underline w-full text-center"
          >
            {showAllTxns ? 'Show less' : `Show all ${allMyTxns.length} transactions`}
          </button>
        )}
      </div>

      <MatchPlayersModal
        week={completedWeeks.find(w => w.week_id === detail)}
        players={allPlayers.filter(p => p.status === 'active')}
        records={allRecords}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
