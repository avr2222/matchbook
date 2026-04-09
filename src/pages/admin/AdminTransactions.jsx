import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTransactions, usePlayers, useWeeks, useConfig } from '../../hooks/useData'
import { writeTransactions, writePlayers } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus, generateId } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'

const TYPES = [
  { value: 'corpus_payment', label: 'Corpus Top-up', dir: 'credit' },
  { value: 'ppm_payment',    label: 'PPM Payment',   dir: 'credit' },
  { value: 'match_deduction',label: 'Match Deduction',dir: 'debit' },
  { value: 'expense_deduction',label: 'Expense Deduction',dir: 'debit' },
  { value: 'refund',         label: 'Refund',         dir: 'credit' },
  { value: 'adjustment',     label: 'Manual Adjustment',dir: 'credit' },
]

export default function AdminTransactions() {
  const qc = useQueryClient()
  const { data: tData, isLoading } = useTransactions()
  const { data: pData } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    player_id: '', type: 'corpus_payment', amount: '', date: new Date().toISOString().slice(0,10),
    week_id: '', description: '', receipt_ref: '',
  })

  if (isLoading) return <PageSpinner />

  const transactions = (tData?.transactions ?? []).sort((a,b) => b.date.localeCompare(a.date))
  const players      = pData?.players ?? []
  const weeks        = wData?.weeks ?? []
  const activeTId    = cfg?.active_tournament_id ?? 'TRN_001'

  const typeInfo = TYPES.find(t => t.value === form.type)
  const selectedPlayer = players.find(p => p.id === form.player_id)
  const newBalance = selectedPlayer
    ? (selectedPlayer.corpus_balance ?? 0) + (typeInfo?.dir === 'credit' ? 1 : -1) * (parseFloat(form.amount) || 0)
    : null

  async function save() {
    if (!form.player_id || !form.amount) { showToast('Player and amount required', 'error'); return }
    setSaving(true)
    try {
      const id = generateId('TXN', transactions.map(t => t.id))
      const dir = typeInfo?.dir ?? 'credit'
      const newTxn = {
        id, player_id: form.player_id, tournament_id: activeTId,
        type: form.type, amount: parseFloat(form.amount),
        direction: dir, date: form.date, week_id: form.week_id || null,
        description: form.description || TYPES.find(t=>t.value===form.type)?.label,
        recorded_by: 'admin', receipt_ref: form.receipt_ref,
      }
      await writeTransactions(
        [...transactions, newTxn],
        'add_transaction', id,
        `${newTxn.description} for ${selectedPlayer?.display_name} ₹${form.amount}`,
        null, newTxn,
      )
      // Update player balance
      if (selectedPlayer) {
        const updatedPlayers = players.map(p => {
          if (p.id !== form.player_id) return p
          const bal = (p.corpus_balance ?? 0) + (dir === 'credit' ? 1 : -1) * parseFloat(form.amount)
          return { ...p, corpus_balance: Math.round(bal * 100) / 100, balance_status: calcBalanceStatus(bal, cfg ?? {}) }
        })
        await writePlayers(updatedPlayers, 'edit_player', form.player_id, `Balance updated for ${selectedPlayer.display_name}`, selectedPlayer, null)
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      setShowForm(false)
      setForm({ player_id: '', type: 'corpus_payment', amount: '', date: new Date().toISOString().slice(0,10), week_id: '', description: '', receipt_ref: '' })
      showToast('Transaction recorded')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Payments & Transactions</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Record Payment</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Player</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No transactions yet.</td></tr>
            ) : transactions.map(t => {
              const player = players.find(p => p.id === t.player_id)
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{format(parseISO(t.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{player?.display_name ?? t.player_id}</td>
                  <td className="px-4 py-3 text-gray-500">{TYPES.find(x=>x.value===t.type)?.label ?? t.type}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${t.direction==='credit'?'text-green-600':'text-red-500'}`}>
                    {t.direction==='credit'?'+':'-'}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{t.description}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Record Payment</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Player</label>
                <select className="input" value={form.player_id} onChange={e => setForm(f => ({ ...f, player_id: e.target.value }))}>
                  <option value="">Select player…</option>
                  {players.filter(p=>p.status==='active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount (₹)</label>
                <input className="input" type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">UPI / Ref # (optional)</label>
                <input className="input" value={form.receipt_ref} onChange={e => setForm(f => ({ ...f, receipt_ref: e.target.value }))} />
              </div>
              <div>
                <label className="label">Note (optional)</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {newBalance !== null && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                  Preview: <strong>{selectedPlayer?.display_name}</strong>{' '}
                  <span className={typeInfo?.dir === 'credit' ? 'text-green-600' : 'text-red-500'}>
                    {typeInfo?.dir === 'credit' ? '+' : '-'}₹{parseFloat(form.amount || 0).toLocaleString('en-IN')}
                  </span>
                  {' → '}New balance: <strong>₹{newBalance.toLocaleString('en-IN')}</strong>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save & Commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
