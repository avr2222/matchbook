import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useWeeks, useAttendance, useTransactions, useConfig, useAnnouncements, usePaymentRequests, useMatchPerformances } from '../../hooks/useData'
import { writePaymentRequests } from '../../api/dataWriter'
import { useAuthStore } from '../../store/authStore'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { showToast } from '../../components/ui/Toast'
import { generateId } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'
import { IconCricket, IconFlame, IconMapPin, IconCalendar, IconShare, IconCreditCard, IconBell } from '@tabler/icons-react'

function PayNowButton({ player, config }) {
  const [copied, setCopied] = useState(false)
  const upiId    = config?.admin_upi_id
  const threshold = config?.corpus_low_threshold ?? 1000
  const balance   = player.corpus_balance ?? 0

  if (!upiId || player.balance_status === 'good') return null

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
      <a href={upiHref} className="mt-4 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg px-4 py-3 transition-colors text-sm">
        <IconCreditCard size={16} />
        Pay ₹{suggested.toLocaleString('en-IN')} via UPI
      </a>
    )
  }

  return (
    <div className="mt-4 bg-white/15 rounded-xl p-3 text-left">
      <p className="text-xs font-medium text-white/80 mb-2">
        Top up ₹{suggested.toLocaleString('en-IN')} → UPI ID
      </p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-white flex-1 truncate">{upiId}</span>
        <button
          onClick={copyUpi}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            copied ? 'bg-white text-[#1D9E75]' : 'bg-white/25 text-white hover:bg-white/35'
          }`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
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
    <div className="card bg-[#E1F5EE] border-[#1D9E75]/20 space-y-2">
      <p className="text-sm font-medium text-gray-800">Already paid via UPI?</p>
      {pending.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {pending.length} pending request{pending.length > 1 ? 's' : ''} awaiting admin review
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-[#1D9E75] font-medium hover:underline">
          Submit your UPI transaction reference →
        </button>
      ) : (
        <div className="space-y-2 pt-1">
          <input
            className="input text-sm"
            type="number" min="1"
            placeholder="Amount paid (₹)"
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
  const { data: myPerfData }       = useMatchPerformances(playerId)

  const claimPlayer = useAuthStore(s => s.claimPlayer)
  const [claimId, setClaimId]       = useState('')
  const [claiming, setClaiming]     = useState(false)
  const [claimError, setClaimError] = useState('')

  async function handleClaim() {
    if (!claimId) return
    setClaiming(true)
    setClaimError('')
    try {
      await claimPlayer(claimId)
    } catch (e) {
      setClaimError(e.message)
    } finally {
      setClaiming(false)
    }
  }

  if (isLoading) return <PageSpinner />

  const allPlayers = pData?.players ?? []
  const player = allPlayers.find(p => p.id === playerId)

  if (!player) {
    const unclaimed = allPlayers.filter(p =>
      p.status === 'active' && p.type !== 'guest' && !p.auth_user_id
    )
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card text-center space-y-4">
          <IconCricket size={36} className="text-gray-300 mx-auto" />
          <h2 className="font-medium text-gray-900 text-lg">Link your player name</h2>
          <p className="text-sm text-gray-500">
            Select your name from the list to see your balance and match history.
          </p>
          <select
            className="input"
            value={claimId}
            onChange={e => setClaimId(e.target.value)}
          >
            <option value="">— Select your name —</option>
            {unclaimed.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          {claimError && <p className="text-sm text-red-500">{claimError}</p>}
          <button
            onClick={handleClaim}
            disabled={!claimId || claiming}
            className="btn-primary w-full"
          >
            {claiming ? 'Linking…' : 'Link my name'}
          </button>
        </div>
      </div>
    )
  }

  const activeTId    = cfg?.active_tournament_id
  const allRecords   = aData?.records ?? []
  const myAttendance = allRecords.filter(r => r.player_id === playerId && r.tournament_id === activeTId)

  const completedWeeks = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))

  const todayStr = new Date().toISOString().slice(0, 10)
  const scheduledWeeks = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'scheduled' && w.match_date > todayStr)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))

  const allMyTxns = (tData?.transactions ?? [])
    .filter(t => t.player_id === playerId && t.tournament_id === activeTId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const played = myAttendance.filter(r => r.status === 'played').length
  const total  = completedWeeks.length
  const pct    = total > 0 ? Math.round((played / total) * 100) : 0

  const myPerfs      = myPerfData?.performances ?? []
  const myPerfWkIds  = new Set(myPerfs.map(p => p.week_id))
  let attendStreak   = 0
  for (const w of completedWeeks) {
    if (myPerfWkIds.has(w.week_id)) attendStreak++
    else break
  }

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

  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= todayStr)
    .sort((a, b) => b.posted_on.localeCompare(a.posted_on))

  const nextMatch = scheduledWeeks[0]

  return (
    <div className="max-w-3xl mx-auto pb-12">

      {/* Hero */}
      <div className="bg-[#1D9E75] px-6 pt-8 pb-8 text-white mb-6 rounded-b-xl">
        <p className="text-white/70 text-xs font-medium uppercase tracking-[0.05em] mb-2">{cfg?.team_name ?? 'Cricket Team'}</p>
        <h1 className="text-[22px] font-medium">Hi, {player.display_name}</h1>
        {attendStreak >= 2 && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm font-medium">
              <IconFlame size={14} /> {attendStreak}-week streak
            </span>
          </div>
        )}
        <div className="mt-3 flex items-end gap-3">
          <div>
            <p className="text-white/60 text-xs">Corpus balance</p>
            <p className="text-[36px] font-medium leading-tight tabular-nums">
              {player.type === 'ppm' ? 'PPM' : `₹${(player.corpus_balance ?? 0).toLocaleString('en-IN')}`}
            </p>
          </div>
          <div className="pb-1"><BalanceBadge status={player.balance_status} /></div>
        </div>
        {player.type !== 'ppm' && <PayNowButton player={player} config={cfg} />}
        {player.type !== 'ppm' && player.balance_status === 'good' && (
          <Link
            to={`/pay/${playerId}`}
            className="mt-3 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 text-white font-medium rounded-lg px-4 py-2.5 transition-colors text-sm"
          >
            <IconCreditCard size={15} />
            Top up balance
          </Link>
        )}
      </div>

      <div className="px-4 space-y-4">

      {/* Announcements */}
      {activeAnnouncements.map(a => (
        <div key={a.id} className="card bg-[#E1F5EE] border-[#1D9E75]/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1D9E75]/20 flex items-center justify-center shrink-0">
              <IconBell size={14} className="text-[#1D9E75]" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{a.title}</p>
              <p className="text-gray-700 text-sm mt-0.5">{a.body}</p>
              <p className="text-xs text-gray-400 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Next match */}
      {nextMatch && (
        <div className="card bg-[#E1F5EE] border-[#1D9E75]/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-[#1D9E75] uppercase tracking-[0.05em] mb-1">Upcoming match</p>
              <p className="font-medium text-gray-900 text-base">
                {format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}
              </p>
              {nextMatch.venue && (
                <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
                  <IconMapPin size={13} className="shrink-0 text-gray-400" />{nextMatch.venue.split(',')[0]}
                </p>
              )}
              {nextMatch.notes && <p className="text-xs text-gray-500 mt-1 italic">{nextMatch.notes}</p>}
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-xs text-gray-500">Match fee</p>
              <p className="text-[24px] font-medium text-[#1D9E75] tabular-nums">
                ₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}
              </p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${cfg?.team_name ?? 'Cricket'} — next match on ${format(parseISO(nextMatch.match_date), 'EEEE, MMM d')} at ${nextMatch.venue?.split(',')[0] ?? 'TBD'}. Fee: ₹${nextMatch.match_fee}. Reply if you're playing!`
                )}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-gray-400 font-medium hover:text-[#1D9E75] mt-1 justify-end"
              >
                <IconShare size={12} /> Share
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <IconCricket size={16} className="text-[#1D9E75]" />
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Matches played</span>
          </div>
          <div className="text-[24px] font-medium text-gray-900 tabular-nums">
            {played}<span className="text-base font-normal text-gray-400">/{total}</span>
          </div>
          <div className={`text-xs font-medium mt-1 ${pct >= 75 ? 'text-[#1D9E75]' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {pct}% attendance
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <IconCalendar size={16} className="text-[#1D9E75]" />
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Upcoming</span>
          </div>
          <div className="text-[24px] font-medium text-gray-900 tabular-nums">{scheduledWeeks.length}</div>
          {scheduledWeeks[0] && (
            <div className="text-xs text-gray-400 mt-1">
              Next: {format(parseISO(scheduledWeeks[0].match_date), 'MMM d')}
            </div>
          )}
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
        <div className="card">
          <h2 className="font-medium text-gray-700 mb-2 text-sm">Recent missed matches</h2>
          <div className="space-y-1.5">
            {missedWeeks.map(w => (
              <div key={w.week_id} className="flex items-center justify-between text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {format(parseISO(w.match_date), 'MMM d, yyyy')}
                </span>
                {w.venue && <span className="text-xs text-gray-400">{w.venue.split(',')[0]}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="card">
        <h2 className="font-medium text-gray-800 mb-3">Activity</h2>
        {activityFeed.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.04)]">
            {activityFeed.map((item, i) => (
              <div
                key={i}
                className={`py-3 flex items-center justify-between text-sm ${
                  item.type === 'attendance' && item.status === 'played'
                    ? 'cursor-pointer hover:bg-[#F8F8F6] -mx-4 px-4 rounded-lg'
                    : ''
                }`}
                onClick={() =>
                  item.type === 'attendance' && item.status === 'played' && item.week_id && setDetail(item.week_id)
                }
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    item.type === 'attendance'
                      ? item.status === 'played' ? 'bg-[#1D9E75]' : 'bg-gray-300'
                      : item.direction === 'credit' ? 'bg-[#1D9E75]' : 'bg-red-400'
                  }`} />
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
                  <span className={`font-mono font-medium ${item.direction === 'credit' ? 'text-[#1D9E75]' : 'text-red-500'}`}>
                    {item.direction === 'credit' ? '+' : '−'}₹{item.amount.toLocaleString('en-IN')}
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
            className="mt-3 text-sm text-[#1D9E75] font-medium hover:underline w-full text-center"
          >
            {showAllTxns ? 'Show less' : `Show all ${allMyTxns.length} transactions`}
          </button>
        )}
      </div>

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
