import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTransactions, usePlayers, useWeeks, useConfig, usePaymentRequests } from '../../hooks/useData'
import { writeTransactions, writePlayers, writePaymentRequests, softDeleteTransactions } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus, generateId } from '../../utils/balanceCalculator'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import ConfirmModal from '../../components/ui/ConfirmModal'
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

  const { data: reqData }          = usePaymentRequests()
  const isAdmin                   = useIsAdmin()
  const [showForm, setShowForm]   = useState(false)
  const [showBulk, setShowBulk]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [confirmData, setConfirmData] = useState(null)
  const [editTxn, setEditTxn]         = useState(null)
  const [editTxnForm, setEditTxnForm] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

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

  function reverseTransaction(t) {
    setConfirmData({
      message: `Reverse this ${t.type} of ₹${t.amount}? A reversal entry will be created.`,
      confirmLabel: 'Reverse',
      danger: true,
      onConfirm: async () => {
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
      },
    })
  }

  async function approveRequest(req) {
    const payer = players.find(p => p.id === req.player_id)
    if (!payer) { showToast('Player not found', 'error'); return }
    setApprovingId(req.id)
    try {
      const allReqs = reqData?.requests ?? []
      const txnId   = generateId('TXN', allTxns.map(t => t.id))
      const newTxn  = {
        id: txnId, player_id: req.player_id, tournament_id: activeTId,
        type: 'corpus_payment', amount: req.amount, direction: 'credit',
        date: req.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), week_id: null,
        description: `UPI payment — ref: ${req.upi_ref}`,
        recorded_by: 'admin', receipt_ref: req.upi_ref,
      }
      await writeTransactions([...allTxns, newTxn], 'add_transaction', txnId,
        `Approved payment from ${payer.display_name} ₹${req.amount}`, null, newTxn)
      const newBal = (payer.corpus_balance ?? 0) + req.amount
      const updatedPlayers = players.map(p =>
        p.id !== req.player_id ? p
        : { ...p, corpus_balance: Math.round(newBal * 100) / 100, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
      )
      await writePlayers(updatedPlayers, 'edit_player', payer.id,
        `Balance updated for ${payer.display_name} from approved payment`, payer, null)
      const updatedReqs = allReqs.map(r =>
        r.id !== req.id ? r : { ...r, status: 'approved', reviewed_on: new Date().toISOString().slice(0, 10) }
      )
      await writePaymentRequests(updatedReqs, `Approved payment from ${payer.display_name}`)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      qc.invalidateQueries({ queryKey: ['payment_requests'] })
      showToast(`Approved — ₹${req.amount} credited to ${payer.display_name}`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setApprovingId(null)
    }
  }

  function rejectRequest(req) {
    const name = players.find(p => p.id === req.player_id)?.display_name ?? req.player_id
    setConfirmData({
      message: `Reject this payment reference from ${name}?`,
      confirmLabel: 'Reject',
      danger: true,
      onConfirm: async () => {
        setApprovingId(req.id)
        try {
          const allReqs = reqData?.requests ?? []
          const updatedReqs = allReqs.map(r =>
            r.id !== req.id ? r : { ...r, status: 'rejected', reviewed_on: new Date().toISOString().slice(0, 10) }
          )
          await writePaymentRequests(updatedReqs, `Rejected payment request ${req.id}`)
          qc.invalidateQueries({ queryKey: ['payment_requests'] })
          showToast('Request rejected')
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setApprovingId(null)
        }
      },
    })
  }

  async function saveEditTxn() {
    if (!editTxnForm.player_id || parseFloat(editTxnForm.amount) <= 0) {
      showToast('Player and a positive amount are required', 'error')
      return
    }
    setSaving(true)
    try {
      const updated = {
        ...editTxn,
        player_id:   editTxnForm.player_id,
        type:        editTxnForm.type,
        amount:      parseFloat(editTxnForm.amount),
        direction:   editTxnForm.direction,
        date:        editTxnForm.date,
        description: editTxnForm.description,
        receipt_ref: editTxnForm.receipt_ref,
        week_id:     editTxnForm.week_id || null,
      }
      const updatedList = allTxns.map(t => t.id === editTxn.id ? updated : t)
      await writeTransactions(updatedList, 'edit_transaction', editTxn.id,
        `Edited transaction ${editTxn.id}`, editTxn, updated)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      setEditTxn(null)
      showToast('Transaction updated')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function deleteSelected() {
    const ids = [...selectedIds]
    if (!ids.length) return
    setConfirmData({
      message: `Soft-delete ${ids.length} selected transaction${ids.length > 1 ? 's' : ''}? They will be hidden from all views and excluded from balances. This can only be undone from the database.`,
      confirmLabel: `Delete ${ids.length}`,
      danger: true,
      onConfirm: async () => {
        setSaving(true)
        try {
          await softDeleteTransactions(ids, `Bulk soft-deleted ${ids.length} transactions`)
          qc.invalidateQueries({ queryKey: ['transactions'] })
          qc.invalidateQueries({ queryKey: ['players'] })
          setSelectedIds(new Set())
          showToast(`${ids.length} transaction${ids.length > 1 ? 's' : ''} deleted`)
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setSaving(false)
        }
      },
    })
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

  const hasFilters   = filterPlayer || filterType || filterFrom || filterTo
  const pendingReqs  = (reqData?.requests ?? []).filter(r => r.status === 'pending')

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (transactions.every(t => selectedIds.has(t.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-medium text-gray-900">
          Payments & Transactions
          {pendingReqs.length > 0 && (
            <span className="ml-2 bg-red-900/100 text-white text-xs font-medium rounded-full px-2 py-0.5">{pendingReqs.length}</span>
          )}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} className="btn-secondary text-sm">↓ CSV</button>
          {isAdmin && selectedIds.size > 0 && (
            <button onClick={deleteSelected} className="btn-danger text-sm">
              Delete {selectedIds.size} selected
            </button>
          )}
          {isAdmin && <button onClick={() => setShowBulk(true)} className="btn-secondary text-sm">Bulk Record</button>}
          {isAdmin && <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Record Payment</button>}
        </div>
      </div>

      {/* Pending payment requests */}
      {isAdmin && pendingReqs.length > 0 && (
        <div className="card border-l-4 border-amber-400 space-y-2">
          <h2 className="font-medium text-gray-800 text-sm">Pending Payment References ({pendingReqs.length})</h2>
          <div className="divide-y divide-white/[0.05]">
            {pendingReqs.map(req => {
              const payer = players.find(p => p.id === req.player_id)
              return (
                <div key={req.id} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{payer?.display_name ?? req.player_id}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span className="font-mono text-[#10b981]">₹{req.amount.toLocaleString('en-IN')}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span className="text-gray-500 text-xs">Ref: {req.upi_ref}</span>
                    <div className="text-xs text-gray-400 mt-0.5">{req.submitted_on}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approveRequest(req)}
                      disabled={approvingId === req.id}
                      className="text-xs text-[#10b981] font-medium border border-[#10b981]/20 rounded px-2 py-1 hover:bg-[rgba(16,185,129,0.08)] disabled:opacity-50"
                    >
                      {approvingId === req.id ? '…' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => rejectRequest(req)}
                      disabled={approvingId === req.id}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-white/[0.03] border-b border-white/[0.06]">
            <tr>
              {isAdmin && (
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={transactions.length > 0 && transactions.every(t => selectedIds.has(t.id))}
                    onChange={toggleSelectAll}
                    title="Select all visible"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Player</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Type</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Amount</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Note</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {transactions.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-gray-400">No transactions found.</td></tr>
            ) : transactions.map(t => {
              const player = players.find(p => p.id === t.player_id)
              return (
                <tr key={t.id} className={`hover:bg-white/[0.03] ${selectedIds.has(t.id) ? 'bg-red-900/10' : ''}`}>
                  {isAdmin && (
                    <td className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-500">{format(parseISO(t.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{player?.display_name ?? t.player_id}</td>
                  <td className="px-4 py-3 text-gray-500">{TYPES.find(x => x.value === t.type)?.label ?? t.type}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${t.direction === 'credit' ? 'text-[#10b981]' : 'text-red-500'}`}>
                    {t.direction === 'credit' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{t.description}</td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { setEditTxn(t); setEditTxnForm({ player_id: t.player_id, type: t.type, amount: t.amount, direction: t.direction, date: t.date, description: t.description ?? '', receipt_ref: t.receipt_ref ?? '', week_id: t.week_id ?? '' }) }}
                          className="text-blue-500 hover:underline text-xs"
                        >
                          Edit
                        </button>
                        <button onClick={() => reverseTransaction(t)} className="text-orange-500 hover:underline text-xs" title="Create reversal entry">
                          Reverse
                        </button>
                      </div>
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
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">Record Payment</h2>
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
                <div className="bg-white/[0.04] rounded-lg p-3 text-sm text-gray-700">
                  Preview: <strong>{selectedPlayer?.display_name}</strong>{' '}
                  <span className={typeInfo?.dir === 'credit' ? 'text-[#10b981]' : 'text-red-500'}>
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

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {editTxn && editTxnForm && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">Edit Transaction</h2>
              <button onClick={() => setEditTxn(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Player</label>
                <select className="input" value={editTxnForm.player_id} onChange={e => setEditTxnForm(f => ({ ...f, player_id: e.target.value }))}>
                  <option value="">Select player…</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={editTxnForm.type} onChange={e => {
                    const dir = TYPES.find(t => t.value === e.target.value)?.dir ?? editTxnForm.direction
                    setEditTxnForm(f => ({ ...f, type: e.target.value, direction: dir }))
                  }}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Amount (₹)</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={editTxnForm.amount} onChange={e => setEditTxnForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={editTxnForm.date} onChange={e => setEditTxnForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={editTxnForm.description} onChange={e => setEditTxnForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">UPI / Ref # (optional)</label>
                <input className="input" value={editTxnForm.receipt_ref} onChange={e => setEditTxnForm(f => ({ ...f, receipt_ref: e.target.value }))} />
              </div>
              <div>
                <label className="label">Match (optional)</label>
                <select className="input" value={editTxnForm.week_id} onChange={e => setEditTxnForm(f => ({ ...f, week_id: e.target.value }))}>
                  <option value="">— not tied to a match —</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setEditTxn(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveEditTxn} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk payment form — admin only */}
      {showBulk && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">Bulk Record Payments</h2>
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
              <div className="divide-y divide-white/[0.05]">
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
              <button onClick={() => setBulkRows(rows => [...rows, { player_id: '', amount: '' }])} className="text-sm text-[#10b981] hover:underline">
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
