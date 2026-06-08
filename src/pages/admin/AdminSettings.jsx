import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTournaments, useConfig, usePlayers, useTransactions } from '../../hooks/useData'
import { writeTournaments, updateConfig } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus } from '../../utils/balanceCalculator'
import { useIsAdmin } from '../../hooks/useIsAdmin'

export default function AdminSettings() {
  const qc = useQueryClient()
  const { data: tData, isLoading } = useTournaments()
  const { data: cfg }  = useConfig()
  const { data: pData }= usePlayers()
  const { data: txData }= useTransactions()
  const isAdmin = useIsAdmin()
  const [saving, setSaving] = useState(false)
  const [showMigrate, setShowMigrate] = useState(false)
  const [newTournamentName, setNewTournamentName] = useState('')
  const [newTournamentUrl, setNewTournamentUrl]   = useState('')
  const [form, setForm] = useState(null)
  const [cfgSaving, setCfgSaving] = useState(false)

  useEffect(() => {
    if (cfg && !form) {
      setForm({
        team_name:               cfg.team_name ?? '',
        admin_upi_id:            cfg.admin_upi_id ?? '',
        default_match_fee:       cfg.default_match_fee ?? 0,
        default_snacks_fee:      cfg.default_snacks_fee ?? 0,
        default_snacks_payer_id: cfg.default_snacks_payer_id ?? '',
        corpus_low_threshold:    cfg.corpus_low_threshold ?? 1000,
        corpus_urgent_threshold: cfg.corpus_urgent_threshold ?? 500,
        corpus_overdue_threshold:cfg.corpus_overdue_threshold ?? 0,
        season_budget:           cfg.season_budget ?? 0,
        auto_deduct_on_sync:     cfg.auto_deduct_on_sync ?? false,
      })
    }
  }, [cfg, form])

  async function saveConfig() {
    if (!form) return
    setCfgSaving(true)
    try {
      await updateConfig(form, 'Config updated via settings')
      qc.invalidateQueries({ queryKey: ['config'] })
      showToast('Settings saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setCfgSaving(false)
    }
  }

  function field(key) {
    return { value: form?.[key] ?? '', onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }
  function numField(key) {
    return { value: form?.[key] ?? '', onChange: e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 })) }
  }

  if (isLoading) return <PageSpinner />

  // active_tournament_id lives in config, not in the tournaments fetch result
  const activeTId = cfg?.active_tournament_id
  const activeTournament = tData?.tournaments?.find(t => t.id === activeTId)

  async function closeTournamentAndMigrate() {
    if (!newTournamentName) { showToast('Enter new tournament name', 'error'); return }
    setSaving(true)
    try {
      const players = pData?.players ?? []
      const transactions = txData?.transactions ?? []

      // Compute final balances for all active players
      const opening_balances = {}
      players.filter(p => p.status === 'active' && (p.type === 'corpus' || p.type === 'new')).forEach(p => {
        const txns   = transactions.filter(t => t.player_id === p.id && t.tournament_id === activeTId)
        const credits = txns.filter(t=>t.direction==='credit').reduce((s,t)=>s+t.amount,0)
        const debits  = txns.filter(t=>t.direction==='debit').reduce((s,t)=>s+t.amount,0)
        opening_balances[p.id] = Math.round((credits - debits) * 100) / 100
      })

      const newId = `TRN_${String(tData.tournaments.length + 1).padStart(3, '0')}`
      const newTournament = {
        id: newId, name: newTournamentName, short_name: newTournamentName,
        cricheroes_tournament_id: null, cricheroes_url: newTournamentUrl.trim(),
        start_date: new Date().toISOString().slice(0,10), end_date: null,
        status: 'active', opening_balances,
      }

      const today = new Date().toISOString().slice(0, 10)
      const updatedTournaments = tData.tournaments
        .map(t => t.id === activeTId ? { ...t, status: 'completed', end_date: today } : t)
        .concat(newTournament)

      await writeTournaments(updatedTournaments, 'start_tournament', `Closed ${activeTournament?.name}, started ${newTournamentName}`)
      await updateConfig({
        active_tournament_id: newId,
        ...(newTournamentUrl.trim() && { cricheroes_tournament_url: newTournamentUrl.trim() }),
      }, `Active tournament changed to ${newTournamentName}`)
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      setShowMigrate(false)
      setNewTournamentName('')
      setNewTournamentUrl('')
      showToast(`Tournament migrated! Opening balances carried forward.`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-[22px] font-medium text-white">Settings</h1>

      {/* Team Settings */}
      {form && (
        <div className="card">
          <h2 className="font-medium text-gray-100 mb-4">Team Settings</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Team Name</label>
              <input className="input" {...field('team_name')} />
            </div>
            <div>
              <label className="label">UPI ID</label>
              <input className="input font-mono" {...field('admin_upi_id')} placeholder="yourname@upi" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Default Match Fee (₹)</label>
                <input className="input" type="number" min="0" {...numField('default_match_fee')} />
              </div>
              <div>
                <label className="label">Default Snacks (₹)</label>
                <input className="input" type="number" min="0" {...numField('default_snacks_fee')} />
              </div>
              <div>
                <label className="label">Season Budget (₹)</label>
                <input className="input" type="number" min="0" {...numField('season_budget')} />
              </div>
            </div>
            <div>
              <label className="label">Default Snacks Payer</label>
              <select className="input" {...field('default_snacks_payer_id')}>
                <option value="">— None / rotate —</option>
                {(pData?.players ?? [])
                  .filter(p => p.status === 'active')
                  .sort((a, b) => a.display_name.localeCompare(b.display_name))
                  .map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Pre-selects this player in the attendance reimburse section.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Low Threshold (₹)</label>
                <input className="input" type="number" min="0" {...numField('corpus_low_threshold')} />
              </div>
              <div>
                <label className="label">Urgent Threshold (₹)</label>
                <input className="input" type="number" min="0" {...numField('corpus_urgent_threshold')} />
              </div>
              <div>
                <label className="label">Overdue Threshold (₹)</label>
                <input className="input" type="number" min="0" {...numField('corpus_overdue_threshold')} />
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 py-1">
              <div>
                <label className="text-sm font-medium text-gray-100">Auto-deduct on Sunday sync</label>
                <p className="text-xs text-gray-400 mt-0.5">CricHeroes sync will automatically create match deductions for corpus players who attended.</p>
              </div>
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 accent-[#10b981] shrink-0"
                checked={form?.auto_deduct_on_sync ?? false}
                onChange={e => setForm(f => ({ ...f, auto_deduct_on_sync: e.target.checked }))}
              />
            </div>
            <div className="pt-1 space-y-1 text-xs text-gray-400 bg-white/[0.04] rounded-lg p-2">
              <div>active_tournament_id: <span className="font-mono text-gray-600">{cfg?.active_tournament_id ?? '—'}</span></div>
              <div>default_ppm_rate: <span className="font-mono text-gray-600">₹{cfg?.default_ppm_rate ?? '—'}</span></div>
            </div>
          </div>
          <button
            onClick={saveConfig}
            disabled={cfgSaving}
            className="btn-primary mt-4"
          >
            {cfgSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Current tournament */}
      <div className="card">
        <h2 className="font-medium text-gray-100 mb-3">Current Tournament</h2>
        <div className="space-y-2 text-sm text-gray-200">
          <div><span className="text-gray-500">Name:</span> {activeTournament?.name}</div>
          <div><span className="text-gray-500">CricHeroes ID:</span> {activeTournament?.cricheroes_tournament_id ?? '—'}</div>
          <div><span className="text-gray-500">Start Date:</span> {activeTournament?.start_date ?? '—'}</div>
          <div><span className="text-gray-500">Status:</span> {activeTournament?.status}</div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowMigrate(true)} className="btn-danger text-sm mt-4">
            Close Tournament & Start New
          </button>
        )}
      </div>

      {/* All tournaments */}
      <div className="card">
        <h2 className="font-medium text-gray-100 mb-3">Tournament History</h2>
        <div className="divide-y divide-white/[0.05]">
          {(tData?.tournaments ?? []).map(t => (
            <div key={t.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-100">{t.name}</span>
                {t.id === activeTId && <span className="ml-2 text-xs bg-[rgba(16,185,129,0.08)] text-[#10b981] px-1.5 py-0.5 rounded">Active</span>}
              </div>
              <span className="text-xs text-gray-400">{t.start_date ?? '?'} → {t.end_date ?? 'ongoing'}</span>
            </div>
          ))}
        </div>
      </div>

      {showMigrate && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-sm">
            <div className="px-6 py-4 border-b border-white/[0.06] flex justify-between">
              <h2 className="font-medium text-red-700">Close Tournament</h2>
              <button onClick={() => { setShowMigrate(false); setNewTournamentName(''); setNewTournamentUrl('') }} className="text-gray-400">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-200">
                This will <strong>close "{activeTournament?.name}"</strong> and carry all corpus balances forward to the new tournament.
              </p>
              <div>
                <label className="label">New Tournament Name</label>
                <input className="input" placeholder="Machaxi Box Cricket Season 3" value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)} />
              </div>
              <div>
                <label className="label">CricHeroes Tournament URL <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input font-mono text-sm" placeholder="https://cricheroes.com/tournament/…" value={newTournamentUrl} onChange={e => setNewTournamentUrl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Needed for CricHeroes sync to work on the new season.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => { setShowMigrate(false); setNewTournamentName(''); setNewTournamentUrl('') }} className="btn-secondary">Cancel</button>
              <button onClick={closeTournamentAndMigrate} disabled={saving} className="btn-danger">
                {saving ? 'Migrating…' : 'Close & Migrate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
