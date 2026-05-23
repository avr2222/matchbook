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
import { IconUsers, IconAlertTriangle, IconCurrencyRupee, IconCreditCard, IconReceipt, IconLink, IconUser, IconCalendar } from '@tabler/icons-react'

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
  const recentWeeks = [...completed].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 3)

  const corpusPlayers  = players.filter(p => p.type === 'corpus' || p.type === 'new')
  const totalPool      = corpusPlayers.reduce((s, p) => s + (p.corpus_balance ?? 0), 0)
  const defaultFee     = cfg?.default_match_fee ?? 500
  const matchesCovered = defaultFee > 0 && corpusPlayers.length > 0
    ? totalPool / (defaultFee * corpusPlayers.length)
    : 0

  const budget    = cfg?.season_budget ?? 0
  const totalSpent = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const budgetPct  = budget > 0 ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0

  const statCards = [
    { label: 'Active players', value: players.length,   Icon: IconUsers,          to: '/admin/players'      },
    { label: 'Weeks played',   value: completed.length, Icon: IconCalendar,       to: '/admin/weeks'        },
    { label: 'At risk',        value: atRisk.length,    Icon: IconAlertTriangle,  to: '/admin/players', warn: atRisk.length > 0 },
    { label: 'Corpus pool',    value: `₹${Math.round(totalPool).toLocaleString('en-IN')}`, Icon: IconCurrencyRupee, to: '/admin/transactions' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-medium text-white">Admin dashboard</h1>
        {isAdmin && (
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO ?? ''}/actions/workflows/sync-cricheroes.yml`}
            target="_blank" rel="noreferrer"
            className="btn-primary text-sm"
          >
            Run CricHeroes sync
          </a>
        )}
      </div>

      {/* Warning banners */}
      {unmatched.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><IconAlertTriangle size={15} />{unmatched.length} player(s) from last CricHeroes sync could not be matched.</span>
          <Link to="/admin/mapping" className="underline font-medium shrink-0">Fix →</Link>
        </div>
      )}
      {staleMaps > 0 && (
        <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl px-4 py-3 text-sm text-orange-300 flex items-center justify-between gap-3">
          <span>{staleMaps} CricHeroes mapping(s) flagged for manual review.</span>
          <Link to="/admin/mapping" className="underline font-medium shrink-0">Review →</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, Icon, to, warn }) => (
          <Link
            key={label}
            to={to}
            className="card hover:border-[rgba(0,0,0,0.18)] transition-colors"
          >
            <Icon size={18} className={`mb-2 ${warn ? 'text-red-500' : 'text-[#10b981]'}`} />
            <div className="text-[24px] font-medium text-white tabular-nums leading-tight">{value}</div>
            <div className="text-xs text-gray-300 mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      {/* Collect Cash */}
      {canWrite && (
        <div className="card space-y-3">
          <h2 className="font-medium text-gray-100 flex items-center gap-2">
            <IconCurrencyRupee size={16} className="text-[#10b981]" />
            Collect cash payment
          </h2>

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
            {collectBusy ? 'Recording…' : 'Record collection'}
          </button>

          {hostCollections.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06] space-y-2">
              <p className="text-[11px] font-medium text-amber-700 uppercase tracking-[0.05em]">
                Pending admin confirmation
              </p>
              {hostCollections.map(req => {
                const p = players.find(pl => pl.id === req.player_id)
                return (
                  <div key={req.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-100">{p?.display_name ?? req.player_id}</span>
                      {req.notes && (
                        <span className="ml-2 text-xs text-gray-300">{req.notes.replace('[HOST] ', '')}</span>
                      )}
                    </div>
                    <span className="font-mono font-medium text-[#10b981]">
                      ₹{(req.amount ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                )
              })}
              <p className="text-xs text-gray-300">
                Total: ₹{hostCollections.reduce((s, r) => s + (r.amount ?? 0), 0).toLocaleString('en-IN')} — admin confirms after receiving cash transfer
              </p>
            </div>
          )}
        </div>
      )}

      {/* Corpus health + season budget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-medium text-gray-100 mb-2">Corpus health</h2>
          <p className="text-[24px] font-medium text-white tabular-nums">
            {matchesCovered.toFixed(1)}
            <span className="text-sm font-normal text-gray-300 ml-1">matches covered</span>
          </p>
          <p className="text-xs text-gray-300 mt-1">
            ₹{totalPool.toLocaleString('en-IN')} pool ÷ ₹{defaultFee} fee ÷ {corpusPlayers.length} players
          </p>
          <div className="mt-3 h-2 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${matchesCovered >= 3 ? 'bg-[#10b981]' : matchesCovered >= 1 ? 'bg-amber-400' : 'bg-red-900/100'}`}
              style={{ width: `${Math.min(100, (matchesCovered / 5) * 100)}%` }}
            />
          </div>
        </div>

        <div className="card">
          <h2 className="font-medium text-gray-100 mb-2">Season budget</h2>
          {budget > 0 ? (
            <>
              <p className="text-[24px] font-medium text-white tabular-nums">
                ₹{totalSpent.toLocaleString('en-IN')}
                <span className="text-sm font-normal text-gray-300 ml-1">of ₹{budget.toLocaleString('en-IN')}</span>
              </p>
              <div className="mt-3 h-2 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct < 70 ? 'bg-[#10b981]' : budgetPct < 90 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-300 mt-1">
                {budgetPct}% spent · ₹{(budget - totalSpent).toLocaleString('en-IN')} remaining
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-300">
              Set <code className="bg-white/[0.06] px-1 rounded text-xs">season_budget</code> in the config table to enable tracking.
            </p>
          )}
        </div>
      </div>

      {/* At-risk players */}
      {atRisk.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-100">Needs attention</h2>
            <Link to="/admin/players" className="text-sm text-[#10b981] hover:underline">All players →</Link>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {atRisk.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-100">{p.display_name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-200">₹{(p.corpus_balance ?? 0).toLocaleString('en-IN')}</span>
                  <BalanceBadge status={p.balance_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card">
        <h2 className="font-medium text-gray-100 mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/admin/transactions?new=1', label: '+ Record payment', Icon: IconCreditCard },
            { to: '/admin/expenses?new=1',     label: '+ Add expense',    Icon: IconReceipt   },
            { to: '/admin/players?new=1',      label: '+ Add player',     Icon: IconUsers     },
            { to: '/admin/guests?new=1',       label: '+ Guest visit',    Icon: IconUser      },
          ].map(({ to, label, Icon }) => (
            <Link key={to} to={to} className="btn-secondary text-sm flex items-center gap-2 justify-center">
              <Icon size={14} /> {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-100">Recent matches</h2>
          <Link to="/admin/weeks" className="text-sm text-[#10b981] hover:underline">Manage →</Link>
        </div>
        {recentWeeks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No matches yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {recentWeeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <div key={w.week_id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-100">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                    {w.team_a && w.team_b && (
                      <span className="ml-2 text-xs text-gray-300">{w.team_a} vs {w.team_b}</span>
                    )}
                    {w.cricheroes_match_id && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-xs bg-blue-900/20 text-blue-300 px-1.5 py-0.5 rounded">
                        <IconLink size={10} /> CricHeroes
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    {w.result && <span className="text-xs font-medium text-[#10b981]">{w.result}</span>}
                    <span className="flex items-center gap-1"><IconUsers size={13} />{played}</span>
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
