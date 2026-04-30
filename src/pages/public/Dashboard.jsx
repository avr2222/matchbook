import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useAttendance, useTournaments, useConfig, useAnnouncements, useTransactions, useExpenses } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { format, parseISO } from 'date-fns'

function PlayerTransactionModal({ player, allTxns, weeks, onClose }) {
  const txns = allTxns
    .filter(t => t.player_id === player.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40)

  const statusColor = {
    good:         'bg-emerald-100 text-emerald-700',
    collect_soon: 'bg-amber-100 text-amber-700',
    urgent:       'bg-orange-100 text-orange-700',
    overdue:      'bg-red-100 text-red-700',
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">{player.display_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-gray-700">
                ₹{Math.round(player.corpus_balance ?? 0).toLocaleString('en-IN')}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[player.balance_status] ?? 'bg-gray-100 text-gray-600'}`}>
                {(player.balance_status ?? '').replace('_', ' ')}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {txns.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No transactions yet.</p>
          ) : txns.map(t => {
            const week = weeks.find(w => w.week_id === t.week_id)
            return (
              <div key={t.id} className="flex items-start justify-between px-5 py-3">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-xs text-gray-400">
                    {format(parseISO(t.date), 'MMM d, yyyy')}
                    {week ? ` · ${week.label}` : ''}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">{t.description}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">{t.type.replace(/_/g, ' ')}</div>
                </div>
                <div className={`font-mono font-semibold text-sm shrink-0 ${t.direction === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                  {t.direction === 'credit' ? '+' : '−'}₹{t.amount.toLocaleString('en-IN')}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [detail, setDetail]         = useState(null)
  const [payPlayer, setPayPlayer]   = useState('')
  const [copied, setCopied]         = useState(false)
  const [activeStatus, setActiveStatus] = useState(null) // 'good'|'collect_soon'|'urgent'|'overdue'
  const [playerDetail, setPlayerDetail] = useState(null)
  const { data: cfg }     = useConfig()
  const { data: tData }   = useTournaments()
  const { data: pData, isLoading: pLoad } = usePlayers()
  const { data: wData }   = useWeeks()
  const { data: aData }   = useAttendance()
  const { data: annData } = useAnnouncements()
  const { data: txnData } = useTransactions()
  const { data: expData } = useExpenses()

  if (pLoad) return <PageSpinner />

  const activeTournamentId = tData?.active_tournament_id ?? cfg?.active_tournament_id
  const allActive    = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = allActive.filter(p => p.type === 'corpus' || p.type === 'new')
  const weeks        = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTournamentId)
  const completed    = weeks.filter(w => w.status === 'completed')
  const records      = aData?.records ?? []
  const seasonName   = tData?.tournaments?.find(t => t.id === activeTournamentId)?.short_name ?? cfg?.team_name ?? 'Season'

  const statusCounts = { good: 0, collect_soon: 0, urgent: 0, overdue: 0 }
  corpusPlayers.forEach(p => { if (statusCounts[p.balance_status] !== undefined) statusCounts[p.balance_status]++ })
  const remainingPool = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const recentWeeks   = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5)
  const todayStr      = new Date().toISOString().slice(0, 10)
  const sortedCorpus  = [...corpusPlayers].sort((a, b) => a.display_name.localeCompare(b.display_name))
  const activeAnnouncements = (annData?.announcements ?? [])
    .filter(a => !a.expires_on || a.expires_on >= todayStr)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.posted_on.localeCompare(a.posted_on))

  const statusBar = [
    { key: 'good',         label: 'Good',         color: 'bg-emerald-500' },
    { key: 'collect_soon', label: 'Collect Soon',  color: 'bg-amber-400'   },
    { key: 'urgent',       label: 'Urgent',        color: 'bg-orange-500'  },
    { key: 'overdue',      label: 'Overdue',       color: 'bg-red-500'     },
  ]
  const corpusTotal = corpusPlayers.length || 1
  const atRiskCount = statusCounts.urgent + statusCounts.overdue
  const upiId       = cfg?.admin_upi_id
  const threshold   = cfg?.corpus_low_threshold ?? 1000

  const stats = [
    { label: 'Active Players',   value: allActive.length,                                       icon: '👥', to: '/players',            bg: 'from-blue-500 to-blue-600'    },
    { label: 'Weeks Played',     value: completed.length,                                       icon: '🏏', to: '/admin/weeks',         bg: 'from-green-500 to-emerald-600' },
    { label: 'Corpus Balance',   value: `₹${Math.round(remainingPool).toLocaleString('en-IN')}`, icon: '💰', to: '/admin/transactions',  bg: 'from-amber-500 to-orange-500'  },
    { label: 'Season',           value: seasonName,                                             icon: '🏆', to: '/admin',               bg: 'from-purple-500 to-violet-600' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">

      {/* Pay Corpus card */}
      {upiId && (
        <div className="rounded-3xl mt-6 mb-4 bg-gradient-to-br from-emerald-600 to-green-500 px-5 py-5 text-white shadow-lg">
          <p className="text-sm font-bold text-white/80 uppercase tracking-widest mb-3">Top Up Your Corpus</p>
          <div className="flex gap-2 items-center">
            <select
              className="flex-1 bg-white/20 backdrop-blur-sm text-white rounded-xl px-3 py-2.5 text-sm font-medium outline-none border border-white/20 focus:border-white/60 transition-colors"
              value={payPlayer}
              onChange={e => { setPayPlayer(e.target.value); setCopied(false) }}
            >
              <option value="" disabled className="text-gray-800">Select your name…</option>
              {sortedCorpus.map(p => (
                <option key={p.id} value={p.id} className="text-gray-800">{p.display_name}</option>
              ))}
            </select>
            {payPlayer && (() => {
              const p = corpusPlayers.find(pl => pl.id === payPlayer)
              if (!p) return null
              const needed    = Math.max(threshold - (p.corpus_balance ?? 0), 500)
              const suggested = Math.ceil(needed / 500) * 500
              const name      = encodeURIComponent(cfg?.team_name ?? 'Cricket Team')
              const note      = encodeURIComponent(`Corpus Topup - ${p.display_name}`)
              const upiHref   = `upi://pay?pa=${upiId}&pn=${name}&am=${suggested}&cu=INR&tn=${note}`
              const isMobile  = /Android|iPhone|iPad/i.test(navigator.userAgent)
              return isMobile ? (
                <a href={upiHref} className="shrink-0 bg-white text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow hover:bg-green-50 transition-colors">
                  Pay ₹{suggested.toLocaleString('en-IN')} →
                </a>
              ) : (
                <button
                  onClick={() => { navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="shrink-0 bg-white text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow hover:bg-green-50 transition-colors"
                >
                  {copied ? '✓ Copied!' : 'Copy UPI'}
                </button>
              )
            })()}
          </div>
          {payPlayer && (() => {
            const p = corpusPlayers.find(pl => pl.id === payPlayer)
            if (!p) return null
            const needed    = Math.max(threshold - (p.corpus_balance ?? 0), 500)
            const suggested = Math.ceil(needed / 500) * 500
            return (
              <p className="text-xs text-white/70 mt-2">
                Balance: ₹{(p.corpus_balance ?? 0).toLocaleString('en-IN')} · Suggested top-up: ₹{suggested.toLocaleString('en-IN')}
                {!(/Android|iPhone|iPad/i.test(navigator.userAgent)) && <span className="ml-1">· UPI: {upiId}</span>}
              </p>
            )
          })()}
        </div>
      )}

      {/* Hero */}
      <div className={`relative overflow-hidden rounded-3xl ${upiId ? '' : 'mt-6 '}mb-6 bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 px-6 py-10 text-white shadow-xl`}>
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[160px] leading-none flex items-center justify-end pr-6">🏏</div>
        <p className="text-green-200 text-sm font-semibold uppercase tracking-widest mb-1">{seasonName}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">{cfg?.team_name ?? 'MatchBook'}</h1>
        <p className="text-green-100 text-sm mt-1">
          {completed.length} week{completed.length !== 1 ? 's' : ''} played · {allActive.length} active players
        </p>
      </div>

      {/* Announcements */}
      {activeAnnouncements.map(a => (
        <div key={a.id} className="card bg-blue-50 border border-blue-100 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-base">
              {a.pinned ? '📌' : '📢'}
            </div>
            <div>
              <p className="font-semibold text-blue-900 text-sm">{a.title}</p>
              <p className="text-blue-700 text-sm mt-0.5">{a.body}</p>
              <p className="text-xs text-blue-400 mt-1">{format(parseISO(a.posted_on), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(({ label, value, icon, to, bg }) => (
          <Link
            key={label}
            to={to}
            className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${bg} opacity-90`} />
            <div className="relative p-4 text-white">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-2xl font-bold leading-tight">{value}</div>
              <div className="text-xs font-medium text-white/75 mt-0.5">{label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Balance health */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Corpus Balance Health</h2>
          <span className="text-xs text-gray-400">{corpusPlayers.length} players</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 gap-px mb-4">
          {statusBar.map(({ key, color }) =>
            statusCounts[key] > 0 && (
              <div key={key} className={`${color} transition-all duration-500`} style={{ width: `${(statusCounts[key] / corpusTotal) * 100}%` }} />
            )
          )}
        </div>
        {/* Clickable status chips — tap to see that group of players */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statusBar.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setActiveStatus(activeStatus === key ? null : key)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all ${
                activeStatus === key
                  ? 'bg-gray-200 ring-2 ring-gray-400'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
              <div>
                <div className="text-xs text-gray-500">{label}</div>
                <div className="font-bold text-gray-900 text-sm">{statusCounts[key]}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Status-filtered player list */}
        {activeStatus && (() => {
          const filtered = sortedCorpus.filter(p => p.balance_status === activeStatus)
          if (!filtered.length) return null
          const chip = statusBar.find(s => s.key === activeStatus)
          return (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">{chip?.label} · {filtered.length} player{filtered.length !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-1.5">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPlayerDetail(p)}
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                      p.balance_status === 'overdue'   ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                      p.balance_status === 'urgent'    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                      p.balance_status === 'collect_soon' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                                          'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    {p.display_name} · ₹{Math.round(p.corpus_balance ?? 0).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {/* At-risk quick list (always shown when no filter active) */}
        {!activeStatus && atRiskCount > 0 && (
          <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
            <p className="text-xs font-semibold text-orange-700 mb-1.5">⚠️ {atRiskCount} player{atRiskCount > 1 ? 's' : ''} need to top up</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedCorpus
                .filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPlayerDetail(p)}
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                      p.balance_status === 'overdue'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    } transition-colors`}
                  >
                    {p.display_name}
                  </button>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Recent Matches</h2>
          <Link to="/players" className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
            View Roster →
          </Link>
        </div>
        {recentWeeks.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No matches recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {recentWeeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <div
                  key={w.week_id}
                  className="flex items-center justify-between text-sm px-3 py-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setDetail(w.week_id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-700 font-bold text-xs shrink-0">
                      {format(parseISO(w.match_date), 'd')}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                      {w.venue && <span className="text-gray-400 ml-2 text-xs">{w.venue.split(',')[0]}</span>}
                      {w.result && <span className="ml-2 text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">{w.result}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">👥 {played}</span>
                    <span className="text-gray-300 text-xs">›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MatchPlayersModal
        week={(wData?.weeks ?? []).find(w => w.week_id === detail)}
        players={allActive}
        records={records}
        onClose={() => setDetail(null)}
      />
      {playerDetail && (
        <PlayerTransactionModal
          player={playerDetail}
          allTxns={txnData?.transactions ?? []}
          weeks={wData?.weeks ?? []}
          onClose={() => setPlayerDetail(null)}
        />
      )}
    </div>
  )
}
