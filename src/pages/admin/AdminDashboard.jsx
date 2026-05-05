import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlayers, useWeeks, useConfig, useAttendance, useMapping, useExpenses } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useAuthStore } from '../../store/authStore'
import { showToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'

export default function AdminDashboard() {
  const isAdmin    = useIsAdmin()
  const role       = useAuthStore(s => s.role)
  const myName     = useAuthStore(s => s.displayName)
  const canWrite   = role === 'admin' || role === 'host'
  const qc         = useQueryClient()

  const [collectPlayer, setCollectPlayer] = useState('')
  const [collectAmt, setCollectAmt]       = useState('')
  const [collectNote, setCollectNote]     = useState('')
  const [collectBusy, setCollectBusy]     = useState(false)

  const { data: cfg }              = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }            = useWeeks()
  const { data: aData }            = useAttendance()
  const { data: mapData }          = useMapping()
  const { data: eData }            = useExpenses()

  const { data: hostCollections = [] } = useQuery({
    queryKey: ['host_collections_pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('status', 'pending')
        .like('notes', '[HOST]%')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: canWrite,
    staleTime: 30_000,
  })

  if (isLoading) return <PageSpinner />

  async function handleCollect() {
    const amount = parseInt(collectAmt, 10)
    if (!collectPlayer || !amount || amount < 1) return
    setCollectBusy(true)
    try {
      const noteStr = `[HOST] Collected by ${myName ?? 'host'}${collectNote.trim() ? ' — ' + collectNote.trim() : ''}`
      const { error } = await supabase.from('payment_requests').insert({
        id: `PREQ_HOST_${Date.now()}`,
        player_id: collectPlayer,
        amount,
        amount_requested: amount,
        status: 'pending',
        upi_ref: '',
        notes: noteStr,
      })
      if (error) throw new Error(error.message)
      showToast('Cash collection recorded — awaiting admin confirmation')
      setCollectPlayer('')
      setCollectAmt('')
      setCollectNote('')
      qc.invalidateQueries({ queryKey: ['host_collections_pending'] })
      qc.invalidateQueries({ queryKey: ['pending_counts'] })
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setCollectBusy(false)
    }
  }

  const activeTId   = cfg?.active_tournament_id
  const players     = (pData?.players ?? []).filter(p => p.status === 'active')
  const weeks       = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTId)
  const completed   = weeks.filter(w => w.status === 'completed')
  const atRisk      = players.filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
  const records     = aData?.records ?? []
  const unmatched   = mapData?.unmatched ?? []
  const staleMaps   = (mapData?.player_mappings ?? []).filter(m => !m.confirmed).length
  const expenses    = eData?.expenses ?? []
  const recentWeeks   = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 3)

  // Corpus health — how many more matches the pool can cover per player
  const corpusPlayers   = players.filter(p => p.type === 'corpus' || p.type === 'new')
  const totalPool       = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const avgMatchFee     = completed.length > 0
    ? completed.reduce((s, w) => s + (w.match_fee ?? 0), 0) / completed.length
    : cfg?.default_match_fee ?? 500
  const matchesCovered  = avgMatchFee > 0 && corpusPlayers.length > 0
    ? totalPool / avgMatchFee / corpusPlayers.length
    : 0

  // Season budget tracking
  const budget     = cfg?.season_budget ?? 0
  const totalSpent = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const budgetPct  = budget > 0 ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        {isAdmin && (
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO ?? ''}/actions/workflows/sync-cricheroes.yml`}
            target="_blank" rel="noreferrer"
            className="btn-primary text-sm flex items-center gap-2"
          >
            🔄 Run CricHeroes Sync
          </a>
        )}
      </div>

      {/* Warning banners */}
      {unmatched.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 text-sm text-yellow-800 flex items-center justify-between gap-3">
          <span>⚠️ {unmatched.length} player(s) from last CricHeroes sync could not be matched.</span>
          <Link to="/admin/mapping" className="underline font-semibold shrink-0">Fix →</Link>
        </div>
      )}
      {staleMaps > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-sm text-orange-800 flex items-center justify-between gap-3">
          <span>🟡 {staleMaps} CricHeroes mapping(s) flagged for manual review.</span>
          <Link to="/admin/mapping" className="underline font-semibold shrink-0">Review →</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Players', value: players.length,   icon: '👥', bg: 'from-blue-500 to-blue-600',     to: '/admin/players'      },
          { label: 'Weeks Played',   value: completed.length, icon: '🏟', bg: 'from-green-500 to-emerald-600', to: '/admin/weeks'        },
          { label: 'At Risk',        value: atRisk.length,    icon: '⚠️', bg: atRisk.length > 0 ? 'from-red-500 to-rose-600' : 'from-gray-400 to-gray-500', to: '/admin/players' },
          { label: 'Corpus Pool',    value: `₹${Math.round(totalPool).toLocaleString('en-IN')}`, icon: '💰', bg: 'from-amber-500 to-orange-500', to: '/admin/transactions' },
        ].map(({ label, value, icon, bg, to }) => (
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

      {/* Collect Cash — visible to host + admin */}
      {canWrite && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-800">💰 Collect Cash Payment</h2>

          <select
            className="input"
            value={collectPlayer}
            onChange={e => setCollectPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players
              .filter(p => p.type !== 'guest')
              .sort((a, b) => a.display_name.localeCompare(b.display_name))
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.display_name}{p.type === 'ppm' ? ' (PPM)' : ''}
                </option>
              ))}
          </select>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">₹</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Amount"
                className="input pl-7"
                value={collectAmt}
                onChange={e => setCollectAmt(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <input
              type="text"
              placeholder="Note (optional)"
              className="input flex-1"
              value={collectNote}
              onChange={e => setCollectNote(e.target.value)}
            />
          </div>

          <button
            onClick={handleCollect}
            disabled={!collectPlayer || !collectAmt || collectBusy}
            className="btn-primary w-full"
          >
            {collectBusy ? 'Recording…' : 'Record Collection'}
          </button>

          {/* Pending host collections */}
          {hostCollections.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                ⏳ Pending Admin Confirmation
              </p>
              {hostCollections.map(req => {
                const p = players.find(pl => pl.id === req.player_id)
                return (
                  <div key={req.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{p?.display_name ?? req.player_id}</span>
                      {req.notes && (
                        <span className="ml-2 text-xs text-gray-400">{req.notes.replace('[HOST] ', '')}</span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-green-700">
                      ₹{(req.amount ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                )
              })}
              <p className="text-xs text-gray-400">
                Total: ₹{hostCollections.reduce((s, r) => s + (r.amount ?? 0), 0).toLocaleString('en-IN')} — admin confirms after receiving cash transfer
              </p>
            </div>
          )}
        </div>
      )}

      {/* Corpus health + season budget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-2">Corpus Health</h2>
          <p className="text-2xl font-bold text-gray-900">
            {matchesCovered.toFixed(1)}
            <span className="text-sm font-normal text-gray-500 ml-1">matches covered</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            ₹{totalPool.toLocaleString('en-IN')} pool ÷ ₹{Math.round(avgMatchFee)} avg fee ÷ {corpusPlayers.length} players
          </p>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${matchesCovered >= 3 ? 'bg-green-500' : matchesCovered >= 1 ? 'bg-yellow-400' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, (matchesCovered / 5) * 100)}%` }}
            />
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-2">Season Budget</h2>
          {budget > 0 ? (
            <>
              <p className="text-2xl font-bold text-gray-900">
                ₹{totalSpent.toLocaleString('en-IN')}
                <span className="text-sm font-normal text-gray-500 ml-1">of ₹{budget.toLocaleString('en-IN')}</span>
              </p>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct < 70 ? 'bg-green-500' : budgetPct < 90 ? 'bg-yellow-400' : 'bg-red-500'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {budgetPct}% spent · ₹{(budget - totalSpent).toLocaleString('en-IN')} remaining
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Set <code className="bg-gray-100 px-1 rounded text-xs">season_budget</code> in the config table to enable tracking.
            </p>
          )}
        </div>
      </div>

      {/* At-risk players */}
      {atRisk.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Needs Attention</h2>
            <Link to="/admin/players" className="text-sm text-green-600 hover:underline">All players →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {atRisk.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{p.display_name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-700">₹{(p.corpus_balance ?? 0).toLocaleString('en-IN')}</span>
                  <BalanceBadge status={p.balance_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/admin/transactions?new=1', label: '+ Record Payment', icon: '💳' },
            { to: '/admin/expenses?new=1',     label: '+ Add Expense',    icon: '🧾' },
            { to: '/admin/players?new=1',      label: '+ Add Player',     icon: '👥' },
            { to: '/admin/guests?new=1',       label: '+ Guest Visit',    icon: '👤' },
          ].map(({ to, label, icon }) => (
            <Link key={to} to={to} className="btn-secondary text-sm flex items-center gap-2 justify-center">
              <span>{icon}</span> {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Recent Matches</h2>
          <Link to="/admin/weeks" className="text-sm text-green-600 hover:underline">Manage →</Link>
        </div>
        {recentWeeks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No matches yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentWeeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <div key={w.week_id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                    {w.team_a && w.team_b && (
                      <span className="ml-2 text-xs text-gray-400">{w.team_a} vs {w.team_b}</span>
                    )}
                    {w.cricheroes_match_id && (
                      <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">🔗 CricHeroes</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    {w.result && <span className="text-xs font-medium text-green-700">{w.result}</span>}
                    <span>👥 {played} played</span>
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
