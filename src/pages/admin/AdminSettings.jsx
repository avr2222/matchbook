import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTournaments, useConfig, usePlayers, useTransactions } from '../../hooks/useData'
import { writeTournaments } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus } from '../../utils/balanceCalculator'

export default function AdminSettings() {
  const qc = useQueryClient()
  const { data: tData, isLoading } = useTournaments()
  const { data: cfg }  = useConfig()
  const { data: pData }= usePlayers()
  const { data: txData }= useTransactions()
  const [saving, setSaving] = useState(false)
  const [showMigrate, setShowMigrate] = useState(false)
  const [newTournamentName, setNewTournamentName] = useState('')

  if (isLoading) return <PageSpinner />

  const activeTId = tData?.active_tournament_id
  const activeTournament = tData?.tournaments?.find(t => t.id === activeTId)

  async function closeTournamentAndMigrate() {
    if (!newTournamentName) { showToast('Enter new tournament name', 'error'); return }
    setSaving(true)
    try {
      const players = pData?.players ?? []
      const transactions = txData?.transactions ?? []

      // Compute final balances for all active players
      const opening_balances = {}
      players.filter(p => p.status === 'active' && p.type === 'corpus').forEach(p => {
        const txns   = transactions.filter(t => t.player_id === p.id && t.tournament_id === activeTId)
        const credits = txns.filter(t=>t.direction==='credit').reduce((s,t)=>s+t.amount,0)
        const debits  = txns.filter(t=>t.direction==='debit').reduce((s,t)=>s+t.amount,0)
        opening_balances[p.id] = Math.round((credits - debits) * 100) / 100
      })

      const newId = `TRN_${String(tData.tournaments.length + 1).padStart(3, '0')}`
      const newTournament = {
        id: newId, name: newTournamentName, short_name: newTournamentName,
        cricheroes_tournament_id: null, cricheroes_url: '',
        start_date: new Date().toISOString().slice(0,10), end_date: null,
        status: 'active', opening_balances,
      }

      const updated = {
        ...tData,
        active_tournament_id: newId,
        tournaments: tData.tournaments.map(t =>
          t.id === activeTId ? { ...t, status: 'completed' } : t
        ).concat(newTournament),
      }

      await writeTournaments(updated, 'start_tournament', `Closed ${activeTournament?.name}, started ${newTournamentName}`)
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      setShowMigrate(false)
      showToast(`Tournament migrated! Opening balances carried forward.`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Current tournament */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Current Tournament</h2>
        <div className="space-y-2 text-sm text-gray-700">
          <div><span className="text-gray-500">Name:</span> {activeTournament?.name}</div>
          <div><span className="text-gray-500">CricHeroes ID:</span> {activeTournament?.cricheroes_tournament_id ?? '—'}</div>
          <div><span className="text-gray-500">Start Date:</span> {activeTournament?.start_date ?? '—'}</div>
          <div><span className="text-gray-500">Status:</span> {activeTournament?.status}</div>
        </div>
        <button onClick={() => setShowMigrate(true)} className="btn-danger text-sm mt-4">
          Close Tournament & Start New
        </button>
      </div>

      {/* All tournaments */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Tournament History</h2>
        <div className="divide-y divide-gray-100">
          {(tData?.tournaments ?? []).map(t => (
            <div key={t.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-800">{t.name}</span>
                {t.id === activeTId && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Active</span>}
              </div>
              <span className="text-xs text-gray-400">{t.start_date ?? '?'} → {t.end_date ?? 'ongoing'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Config info */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Configuration</h2>
        <div className="space-y-1 text-sm font-mono text-gray-600 bg-gray-50 rounded-lg p-3">
          <div>repo: {cfg?.repo_owner}/{cfg?.repo_name}</div>
          <div>branch: {cfg?.data_branch}</div>
          <div>match_fee: ₹{cfg?.default_match_fee}</div>
          <div>cricheroes_id: {cfg?.cricheroes_tournament_id}</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Edit config.json in the repo to change these values.</p>
      </div>

      {showMigrate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold text-red-700">Close Tournament</h2>
              <button onClick={() => setShowMigrate(false)} className="text-gray-400">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                This will <strong>close "{activeTournament?.name}"</strong> and carry all corpus balances forward to the new tournament.
              </p>
              <div>
                <label className="label">New Tournament Name</label>
                <input className="input" placeholder="Machaxi Box Cricket Season 3" value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowMigrate(false)} className="btn-secondary">Cancel</button>
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
