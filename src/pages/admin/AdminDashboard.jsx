import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig, useAttendance, useMapping, useExpenses } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { triggerCricHeroesSync } from '../../api/dataWriter'
import { useAuthStore } from '../../store/authStore'
import { showToast } from '../../components/ui/Toast'
import { format, parseISO } from 'date-fns'

export default function AdminDashboard() {
  const { token } = useAuthStore()
  const { data: cfg }              = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }            = useWeeks()
  const { data: aData }            = useAttendance()
  const { data: mapData }          = useMapping()
  const { data: eData }            = useExpenses()
  const [syncing, setSyncing]      = useState(false)

  if (isLoading) return <PageSpinner />

  const activeTId   = cfg?.active_tournament_id
  const players     = (pData?.players ?? []).filter(p => p.status === 'active')
  const weeks       = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTId)
  const completed   = weeks.filter(w => w.status === 'completed')
  const atRisk      = players.filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
  const records     = aData?.records ?? []
  const unmatched   = mapData?.unmatched ?? []
  const staleMaps   = (mapData?.player_mappings ?? []).filter(m => !m.confirmed).length
  const expenses    = eData?.expenses ?? []
  const recentWeeks = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 3)

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

  async function handleSync() {
    setSyncing(true)
    try {
      await triggerCricHeroesSync(cfg, token)
      showToast('CricHeroes sync triggered! Check GitHub Actions for progress.')
    } catch (e) {
      showToast('Failed to trigger sync: ' + e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <button onClick={handleSync} disabled={syncing} className="btn-primary text-sm flex items-center gap-2">
          {syncing ? '⏳ Syncing…' : '🔄 Sync CricHeroes'}
        </button>
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
          { label: 'Matches Played', value: completed.length, icon: '🏟', bg: 'from-green-500 to-emerald-600', to: '/admin/weeks'        },
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
              Set <code className="bg-gray-100 px-1 rounded text-xs">season_budget</code> in config.json to enable tracking.
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
