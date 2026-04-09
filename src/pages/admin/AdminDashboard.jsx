import { Link } from 'react-router-dom'
import { usePlayers, useWeeks, useConfig, useAttendance, useMapping } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { triggerCricHeroesSync } from '../../api/dataWriter'
import { useAuthStore } from '../../store/authStore'
import { showToast } from '../../components/ui/Toast'
import { useState } from 'react'
import { format, parseISO } from 'date-fns'

export default function AdminDashboard() {
  const { token } = useAuthStore()
  const { data: cfg }   = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: aData } = useAttendance()
  const { data: mapData } = useMapping()
  const [syncing, setSyncing] = useState(false)

  if (isLoading) return <PageSpinner />

  const activeTId = cfg?.active_tournament_id
  const players   = (pData?.players ?? []).filter(p => p.status === 'active')
  const weeks     = (wData?.weeks ?? []).filter(w => w.tournament_id === activeTId)
  const completed = weeks.filter(w => w.status === 'completed')
  const atRisk    = players.filter(p => p.balance_status === 'urgent' || p.balance_status === 'overdue')
  const records   = aData?.records ?? []
  const unmatched = mapData?.unmatched ?? []

  const recentWeeks = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 3)

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
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-800 flex items-center justify-between">
          <span>⚠️ {unmatched.length} player(s) from last CricHeroes sync could not be matched.</span>
          <Link to="/admin/mapping" className="underline font-medium">Fix mapping →</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Players', value: players.length,    icon: '👥' },
          { label: 'Matches',        value: completed.length,  icon: '🏟' },
          { label: 'At Risk',        value: atRisk.length,     icon: '⚠️' },
          { label: 'Corpus Pool',    value: `₹${players.filter(p=>p.type==='corpus').reduce((s,p)=>s+(p.corpus_balance??0),0).toLocaleString('en-IN')}`, icon: '💰' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
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
            { to: '/admin/transactions?new=1', label: '+ Record Payment',   icon: '💳' },
            { to: '/admin/expenses?new=1',     label: '+ Add Expense',      icon: '🧾' },
            { to: '/admin/players?new=1',      label: '+ Add Player',       icon: '👥' },
            { to: '/admin/guests?new=1',       label: '+ Guest Visit',      icon: '👤' },
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
                    {w.cricheroes_match_id && (
                      <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">🔗 CricHeroes</span>
                    )}
                  </div>
                  <div className="text-gray-500">👥 {played} played</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
