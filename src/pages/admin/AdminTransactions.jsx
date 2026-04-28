import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTransactions, usePlayers, useWeeks, useConfig } from '../../hooks/useData'
import { writeTransactions, writePlayers } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus, generateId } from '../../utils/balanceCalculator'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { downloadCSV } from '../../utils/csvExport'
import { format, parseISO } from 'date-fns'

const TYPES = [
  { value: 'corpus_payment',    label: 'Corpus Top-up',      dir: 'credit' },
  { value: 'ppm_payment',       label: 'PPM Payment',         dir: 'credit' },
  { value: 'match_deduction',   label: 'Match Deduction',     dir: 'debit'  },
  { value: 'expense_deduction', label: 'Expense Deduction',   dir: 'debit'  },
  { value: 'refund',            label: 'Refund',              dir: 'credit' },
  { value: 'adjustment',        label: 'Manual Adjustment',   dir: 'credit' },
]

const EMPTY_FORM = {
  player_id: '', type: 'corpus_payment', amount: '',
  date: new Date().toISOString().slice(0, 10),
  week_id: '', description: '', receipt_ref: '',
}

export default function AdminTransactions() {
  const qc = useQueryClient()
  const { data: tData, isLoading } = useTransactions()
  const { data: pData }            = usePlayers()
  const { data: wData }            = useWeeks()
  const { data: cfg }              = useConfig()
  const [searchParams, setSearchParams] = useSearchParams()

  const isAdmin                   = useIsAdmin()
  const [showForm, setShowForm]   = useState(false)
  const [showBulk, setShowBulk]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)

  // Filters
  const [filterPlayer, setFilterPlayer] = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterFrom, setFilterFrom]     = useState('')
  const [filterTo, setFilterTo]         = useState('')

  // Bulk form: array of {player_id, amount}
  const [bulkType, setBulkType]   = useState('corpus_payment')
  const [bulkDate, setBulkDate]   = useState(new Date().toISOString().slice(0, 10))
  const [bulkRows, setBulkRows]   = useState([{ player_id: '', amount: '' }])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  if (isLoading) return <PageSpinner />

  const allTxns   = (tData?.transactions ?? []).sort((a, b) => b.date.localeCompare(a.date))
  const players   = pData?.players ?? []
  const weeks     = wData?.weeks ?? []
  const activeTId = cfg?.active_tournament_id ?? 'TRN_001'

  // Apply filters
  const transactions = allTxns.filter(t => {
    if (filterPlayer && t.player_id !== filterPlayer) return false
    if (filterType   && t.type      !== filterType)   return false
    if (filterFrom   && t.date      <  filterFrom)    return false
    if (filterTo     && t.date      >  filterTo)      return false
    return true
  })

  const typeInfo      = TYPES.find(t => t.value === form.type)
  const selectedPlayer = players.find(p => p.id === form.player_id)
  const newBalance    = selectedPlayer
    ? (selectedPlayer.corpus_balance ?? 0) + (typeInfo?.dir === 'credit' ? 1 : -1) * (parseFloat(form.amount) || 0)
    : null

  async function save() {
    if (!form.player_id || parseFloat(form.amount) <= 0) {
      showToast('Player and a positive amount are required', 'error')
      return
    }
    setSaving(true)
    try {
      const id  = generateId('TXN', allTxns.map(t => t.id))
      const dir = typeInfo?.dir ?? 'credit'
      const newTxn = {
        id, player_id: form.player_id, tournament_id: activeTId,
        type: form.type, amount: parseFloat(form.amount),
        direction: dir, date: form.date, week_id: form.week_id || null,
        description: form.description || TYPES.find(t => t.value === form.type)?.label,
        recorded_by: 'admin', receipt_ref: form.receipt_ref,
      }
      await writeTransactions(
        [...allTxns, newTxn], 'add_transaction', id,
        `${newTxn.description} for ${selectedPlayer?.display_name} ₹${form.amount}`,
        null, newTxn,
      )
      if (selectedPlayer && (selectedPlayer.type === 'corpus' || selectedPlayer.type === 'new')) {
        const bal = (selectedPlayer.corpus_balance ?? 0) + (dir === 'credit' ? 1 : -1) * parseFloat(form.amount)
        const updated = players.map(p =>
          p.id !== form.player_id ? p
          : { ...p, corpus_balance: Math.round(bal * 100) / 100, balance_status: calcBalanceStatus(bal, cfg ?? {}) }
        )
        await writePlayers(updated, 'edit_player', form.player_id, `Balance updated for ${selectedPlayer.display_name}`, selectedPlayer, null)
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      showToast('Transaction recorded')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function reverseTransaction(t) {
    if (!confirm(`Reverse this ${t.type} of ₹${t.amount}?`)) return
    setSaving(true)
    try {
      const reversedDir = t.direction === 'credit' ? 'debit' : 'credit'
      const revId       = generateId('TXN', allTxns.map(x => x.id))
      const rev = {
        id: revId, player_id: t.player_id, tournament_id: t.tournament_id,
        type: 'adjustment', amount: t.amount,
        direction: reversedDir, date: new Date().toISOString().slice(0, 10),
        week_id: t.week_id ?? null,
        description: `Reversal of ${t.id}: ${t.description}`,
        recorded_by: 'admin', receipt_ref: '',
      }
      await writeTransactions([...allTxns, rev], 'reverse_transaction', revId,
        `Reversed ${t.description}`, null, rev)

      // Update player balance
      const p = players.find(x => x.id === t.player_id)
      if (p && (p.type === 'corpus' || p.type === 'new')) {
        const delta = reversedDir === 'credit' ? t.amount : -t.amount
        const bal   = (p.corpus_balance ?? 0) + delta
        const updated = players.map(x =>
          x.id !== t.player_id ? x
          : { ...x, corpus_balance: Math.round(bal * 100) / 100, balance_status: calcBalanceStatus(bal, cfg ?? {}) }
        )
        await writePlayers(updated, 'edit_player', p.id, `Balance reversed for ${p.display_name}`, p, null)
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      showToast('Transaction reversed')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveBulk() {
    const validRows = bulkRows.filter(r => r.player_id && parseFloat(r.amount) > 0)
    if (!validRows.length) { showToast('Add at least one valid row', 'error'); return }
    setSaving(true)
    try {
      const dir       = TYPES.find(t => t.value === bulkType)?.dir ?? 'credit'
      const label     = TYPES.find(t => t.value === bulkType)?.label ?? bulkType
      let   baseId    = parseInt(generateId('TXN', allTxns.map(t => t.id)).split('_')[1] || '0', 10)
      const newTxns   = validRows.map((r, i) => ({
        id: `TXN_${String(baseId + i).padStart(3, '0')}`,
        player_id: r.player_id, tournament_id: activeTId,
        type: bulkType, amount: parseFloat(r.amount),
        direction: dir, date: bulkDate, week_id: null,
        description: label, recorded_by: 'admin', receipt_ref: '',
      }))
      await writeTransactions([...allTxns, ...newTxns], 'bulk_payment', null,
        `Bulk ${label} for ${newTxns.length} players`, null, null)

      // Update balances for corpus/new players
      const balanceUpdates = {}
      newTxns.forEach(t => {
        const p = players.find(x => x.id === t.player_id)
        if (p && (p.type === 'corpus' || p.type === 'new')) {
          const prev = balanceUpdates[t.player_id]?.corpus_balance ?? p.corpus_balance ?? 0
          balanceUpdates[t.player_id] = { ...p, corpus_balance: prev + (dir === 'credit' ? t.amount : -t.amount) }
        }
      })
      if (Object.keys(balanceUpdates).length > 0) {
        const updatedPlayers = players.map(p =>
          balanceUpdates[p.id]
            ? { ...balanceUpdates[p.id], balance_status: calcBalanceStatus(balanceUpdates[p.id].corpus_balance, cfg ?? {}) }
            : p
        )
        await writePlayers(updatedPlayers, 'bulk_payment', null, `Balances updated from bulk payment`, null, null)
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      setShowBulk(false)
      setBulkRows([{ player_id: '', amount: '' }])
      showToast(`${newTxns.length} transactions recorded`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function exportCSV() {
    const rows = transactions.map(t => ({
      Date: t.date,
      Player: players.find(p => p.id === t.player_id)?.display_name ?? t.player_id,
      Type: TYPES.find(x => x.value === t.type)?.label ?? t.type,
      Direction: t.direction,
      Amount: t.amount,
      Description: t.description,
      Receipt: t.receipt_ref,
    }))
    downloadCSV(rows, `transactions_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const hasFilters = filterPlayer || filterType || filterFrom || filterTo

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Payments & Transactions</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary text-sm">↓ CSV</button>
          {isAdmin && <button onClick={() => setShowBulk(true)} className="btn-secondary text-sm">Bulk Record</button>}
          {isAdmin && <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Record Payment</button>}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input text-sm" value={filterPlayer} onChange={e => setFilterPlayer(e.target.value)}>
            <option value="">All players</option>
            {players.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <select className="input text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="input text-sm" type="date" placeholder="From" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          <input className="input text-sm" type="date" placeholder="To" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        {hasFilters && (
          <button onClick={() => { setFilterPlayer(''); setFilterType(''); setFilterFrom(''); setFilterTo('') }}
            className="mt-2 text-xs text-red-500 hover:underline">
            Clear filters ({transactions.length} of {allTxns.length} shown)
          </button>
        )}
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
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No transactions found.</td></tr>
            ) : transactions.map(t => {
              const player = players.find(p => p.id === t.player_id)
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{format(parseISO(t.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{player?.display_name ?? t.player_id}</td>
                  <td className="px-4 py-3 text-gray-500">{TYPES.find(x => x.value === t.type)?.label ?? t.type}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${t.direction === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.direction === 'credit' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{t.description}</td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin && (
                      <button onClick={() => reverseTransaction(t)} className="text-orange-500 hover:underline text-xs" title="Create reversal entry">
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Single payment form — admin only */}
      {showForm && isAdmin && (
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
                  {players.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
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
                <input className="input" type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
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
                  </span>{' → '}
                  New balance: <strong>₹{Math.round(newBalance * 100) / 100}</strong>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save & Commit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk payment form — admin only */}
      {showBulk && isAdmin && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Bulk Record Payments</h2>
              <button onClick={() => setShowBulk(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={bulkType} onChange={e => setBulkType(e.target.value)}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {bulkRows.map((row, i) => (
                  <div key={i} className="py-2 flex gap-2 items-center">
                    <select
                      className="input flex-1 text-sm"
                      value={row.player_id}
                      onChange={e => setBulkRows(rows => rows.map((r, j) => j === i ? { ...r, player_id: e.target.value } : r))}
                    >
                      <option value="">Select player…</option>
                      {players.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                    </select>
                    <input
                      className="input w-28 text-sm"
                      type="number" min="1" placeholder="₹"
                      value={row.amount}
                      onChange={e => setBulkRows(rows => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                    />
                    <button onClick={() => setBulkRows(rows => rows.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setBulkRows(rows => [...rows, { player_id: '', amount: '' }])} className="text-sm text-green-600 hover:underline">
                + Add row
              </button>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowBulk(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveBulk} disabled={saving} className="btn-primary">{saving ? 'Saving…' : `Save ${bulkRows.filter(r => r.player_id && r.amount).length} Payments`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
