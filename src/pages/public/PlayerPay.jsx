import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'

function UpiPaySection({ player, config }) {
  const [copied, setCopied] = useState(false)
  const upiId     = config?.admin_upi_id
  const threshold = config?.corpus_low_threshold ?? 1000
  const balance   = player.corpus_balance ?? 0

  if (!upiId) return (
    <p className="text-sm text-gray-400 text-center py-4">UPI not configured. Contact admin.</p>
  )

  const needed    = Math.max(threshold - balance, 500)
  const suggested = Math.ceil(needed / 500) * 500
  const isMobile  = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const name      = encodeURIComponent(config?.team_name ?? 'Cricket Team')
  const note      = encodeURIComponent(`Corpus Topup - ${player.display_name}`)
  const upiHref   = `upi://pay?pa=${upiId}&pn=${name}&am=${suggested}&cu=INR&tn=${note}`

  function copy() {
    navigator.clipboard?.writeText(upiId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3">
      <div className="text-center text-sm text-gray-500">
        Suggested top-up to reach <span className="font-medium text-green-700">Good</span> status
      </div>
      <div className="text-center text-3xl font-bold text-gray-900">
        ₹{suggested.toLocaleString('en-IN')}
      </div>

      {isMobile ? (
        <a
          href={upiHref}
          className="btn-primary w-full text-center block text-base py-3"
        >
          💳 Pay via UPI App
        </a>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Pay to UPI ID</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-gray-900 flex-1">{upiId}</span>
            <button
              onClick={copy}
              className="text-sm text-green-700 font-medium border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Open any UPI app and pay to this ID, or open this page on your phone to pay in one tap.</p>
        </div>
      )}
    </div>
  )
}

export default function PlayerPay() {
  const { playerId } = useParams()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()

  if (isLoading) return <PageSpinner />

  const player = (pData?.players ?? []).find(p => p.id === playerId)

  if (!player) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center space-y-3">
        <div className="text-4xl">🏏</div>
        <p className="text-gray-600 font-medium">Player not found.</p>
        <p className="text-sm text-gray-400">Check the link or contact your admin.</p>
        <Link to="/" className="text-green-600 hover:underline text-sm block">← Back to home</Link>
      </div>
    )
  }

  const activeTId  = cfg?.active_tournament_id
  const nextMatch  = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'scheduled')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))[0] ?? null

  const needsTopUp = player.balance_status !== 'good' && player.type !== 'ppm'
  const balance    = player.corpus_balance ?? 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Team header */}
        <div className="text-center mb-2">
          <div className="text-3xl mb-1">🏏</div>
          <h1 className="text-lg font-bold text-gray-900">{cfg?.team_name ?? 'Cricket Team'}</h1>
        </div>

        {/* Player balance card */}
        <div className="card text-center space-y-2">
          <p className="text-sm text-gray-500">Hi, <span className="font-semibold text-gray-900">{player.display_name}</span> 👋</p>
          <div className={`text-4xl font-bold mt-1 ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {player.type === 'ppm' ? 'PPM' : `₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className="text-sm text-gray-500">Corpus Balance</div>
          <div className="flex justify-center mt-1">
            <BalanceBadge status={player.balance_status} />
          </div>
        </div>

        {/* Pay section */}
        {needsTopUp ? (
          <div className="card">
            <UpiPaySection player={player} config={cfg} />
          </div>
        ) : (
          <div className="card text-center py-6">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-semibold text-green-700">You're all good!</p>
            <p className="text-sm text-gray-500 mt-1">Your corpus balance is healthy.</p>
          </div>
        )}

        {/* Next match info */}
        {nextMatch && (
          <div className="card bg-green-50 border border-green-200">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Next Match</p>
            <p className="font-semibold text-green-900">{format(parseISO(nextMatch.match_date), 'EEEE, MMM d')}</p>
            {nextMatch.venue && (
              <p className="text-sm text-green-700 mt-0.5">{nextMatch.venue.split(',')[0]}</p>
            )}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-green-600">Match fee</span>
              <span className="font-bold text-green-900">₹{(nextMatch.match_fee ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          <Link to="/login" className="text-green-600 hover:underline">Log in</Link>
          {' '}to see your full match history and transactions.
        </p>
      </div>
    </div>
  )
}
