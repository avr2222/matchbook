import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useExpenses, useWeeks, useConfig, usePlayers, useAttendance, useTransactions, useTshirtOrders } from '../../hooks/useData'
import { writeExpenses, writeTransactions, writePlayers, softDeleteTransactions } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { generateId, calcBalanceStatus } from '../../utils/balanceCalculator'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useCanWrite } from '../../hooks/useCanWrite'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { format, parseISO } from 'date-fns'

const CATEGORIES = [
  { value: 'match_cost',    label: 'Match Cost'     },
  { value: 'ground_booking',label: 'Ground Booking' },
  { value: 'cricket_ball',  label: 'Cricket Ball'   },
  { value: 'cricket_bat',   label: 'Cricket Bat'    },
  { value: 'equipment',     label: 'Equipment'      },
  { value: 'refreshments',  label: 'Refreshments'   },
  { value: 'kit',           label: 'Kit / Uniform'  },
  { value: 'other',         label: 'Other'          },
]

const SPLIT_LABEL = {
  all_played:    'Played',
  all_active:    'All Active',
  corpus_pool:   'Corpus Pool',
  week_present:  'Played',
  all_corpus:    'All Corpus',
  tshirt_orders: 'T-Shirt Orders',
}

const SPLIT_OPTIONS = [
  { value: 'all_played',    label: 'Split among all who played' },
  { value: 'all_active',    label: 'Split among all active players' },
  { value: 'tshirt_orders', label: 'T-Shirt orders only' },
]

export default function AdminExpenses() {
  const qc = useQueryClient()
  const { data: eData, isLoading } = useExpenses()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const { data: pData } = usePlayers()
  const { data: aData } = useAttendance()
  const { data: tData } = useTransactions()
  const { data: tsData } = useTshirtOrders()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin  = useIsAdmin()
  const canWrite = useCanWrite()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmData, setConfirmData] = useState(null)
  const [editExpense, setEditExpense] = useState(null)
  const [editForm, setEditForm]       = useState(null)
  const [tshirtChecked, setTshirtChecked] = useState({})
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    week_id: '',
    category: 'match_cost',
    amount: '',
    description: '',
    split_among: 'all_played',
    paid_by_player_id: '',
    reimburse_corpus: false,
  })

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  if (isLoading) return <PageSpinner />

  const expenses  = (eData?.expenses ?? []).sort((a, b) => b.date.localeCompare(a.date))
  const weeks     = (wData?.weeks ?? []).filter(w => w.tournament_id === (cfg?.active_tournament_id ?? 'TRN_001'))
  const players   = (pData?.players ?? []).filter(p => p.status === 'active' && p.type !== 'ppm')
  const records   = aData?.records ?? []

  // Per-player impact preview — only corpus+new players are ever charged
  function perPlayerPreview() {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return null
    if (form.split_among === 'corpus_pool') return null
    const allPlayers = pData?.players ?? []
    let count = 0
    if (form.split_among === 'all_active') {
      count = allPlayers.filter(p => p.status === 'active' && (p.type === 'corpus' || p.type === 'new')).length
    } else if (form.split_among === 'all_played') {
      if (!form.week_id) return null
      const playedIds = new Set(records.filter(r => r.week_id === form.week_id && r.status === 'played').map(r => r.player_id))
      count = allPlayers.filter(p => (p.type === 'corpus' || p.type === 'new') && playedIds.has(p.id)).length
    } else if (form.split_among === 'tshirt_orders') {
      count = tshirtOrderPlayers().length
    }
    if (count === 0) return null
    return `₹${Math.round(amt / count).toLocaleString('en-IN')} per player (${count} players)`
  }

  // Players who ordered T-shirts AND are linked to a player account AND are checked
  function tshirtOrderPlayers() {
    const allPlayers = pData?.players ?? []
    const orders = tsData?.tshirt_orders ?? []
    const linkedPlayerIds = [...new Set(
      orders.filter(o => o.player_id).map(o => o.player_id)
    )]
    // Apply checkbox state (default checked = true)
    return allPlayers.filter(p =>
      linkedPlayerIds.includes(p.id) &&
      (tshirtChecked[p.id] !== false)
    )
  }

  async function save() {
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Valid amount required', 'error'); return }
    setSaving(true)
    try {
      const payer  = players.find(p => p.id === form.paid_by_player_id) ?? null
      const id     = generateId('EXP', expenses.map(e => e.id))
      const newExp = {
        id,
        date: form.date,
        week_id: form.week_id || null,
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description || CATEGORIES.find(c => c.value === form.category)?.label,
        split_among: form.split_among,
        share_per_player: null,
        paid_by: payer?.display_name ?? '',
        paid_by_player_id: form.paid_by_player_id || null,
        recorded_by: 'admin',
      }
      await writeExpenses([...expenses, newExp], 'add_expense', `Added expense: ${newExp.description} ₹${form.amount}`)
      qc.invalidateQueries({ queryKey: ['expenses'] })

      // Auto-deduct from corpus/new players
      if (form.split_among !== 'corpus_pool') {
        const allPlayers = pData?.players ?? []
        const allTxns    = tData?.transactions ?? []
        let deductPlayers = []
        if (form.split_among === 'all_active') {
          deductPlayers = allPlayers.filter(p => p.status === 'active' && (p.type === 'corpus' || p.type === 'new'))
        } else if (form.split_among === 'all_played' && form.week_id) {
          const playedIds = new Set(records.filter(r => r.week_id === form.week_id && r.status === 'played').map(r => r.player_id))
          deductPlayers = allPlayers.filter(p => (p.type === 'corpus' || p.type === 'new') && playedIds.has(p.id))
        } else if (form.split_among === 'tshirt_orders') {
          deductPlayers = tshirtOrderPlayers()
        }
        if (deductPlayers.length > 0) {
          const share = Math.round((parseFloat(form.amount) / deductPlayers.length) * 100) / 100
          const withShare = [...expenses.filter(e => e.id !== id), { ...newExp, share_per_player: share }]
          await writeExpenses(withShare, 'add_expense', `Expense split: ₹${share}/player × ${deductPlayers.length}`)
          const deductTxns = deductPlayers.map(p => ({
            id: `TXN_EXP_${id}_${p.id}`,
            player_id: p.id,
            tournament_id: cfg?.active_tournament_id ?? null,
            type: 'expense_deduction',
            amount: share,
            direction: 'debit',
            date: form.date,
            week_id: form.week_id || null,
            description: `Expense: ${newExp.description}`,
            recorded_by: 'admin',
            receipt_ref: '',
          }))
          await writeTransactions([...allTxns, ...deductTxns], 'add_expense_deduction', id,
            `Expense deduction: ${newExp.description} ₹${share}/player × ${deductPlayers.length}`, null, null)
          const updatedPlayers = allPlayers.map(p => {
            if (!deductPlayers.some(dp => dp.id === p.id)) return p
            const newBal = Math.round(((p.corpus_balance ?? 0) - share) * 100) / 100
            return { ...p, corpus_balance: newBal, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
          })
          await writePlayers(updatedPlayers, 'expense_deduction', id,
            `Balances updated for expense: ${newExp.description}`, null, null)
          qc.invalidateQueries({ queryKey: ['transactions'] })
          qc.invalidateQueries({ queryKey: ['players'] })
        }
      }

      if (form.reimburse_corpus && payer && (payer.type === 'corpus' || payer.type === 'new')) {
        const allTxns = tData?.transactions ?? []
        const txnId   = generateId('TXN', allTxns.map(t => t.id))
        const newTxn  = {
          id: txnId,
          player_id: payer.id,
          tournament_id: cfg?.active_tournament_id ?? null,
          type: 'corpus_payment',
          amount: parseFloat(form.amount),
          direction: 'credit',
          date: form.date,
          week_id: form.week_id || null,
          description: `Expense paid — ${newExp.description}`,
          recorded_by: 'admin',
          receipt_ref: '',
        }
        await writeTransactions(
          [...allTxns, newTxn], 'add_transaction', txnId,
          `Expense reimbursement for ${payer.display_name} ₹${form.amount}`, null, newTxn,
        )
        const newBal = (payer.corpus_balance ?? 0) + parseFloat(form.amount)
        const updatedPlayers = (pData?.players ?? []).map(p =>
          p.id !== payer.id ? p
          : { ...p, corpus_balance: Math.round(newBal * 100) / 100, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
        )
        await writePlayers(updatedPlayers, 'edit_player', payer.id,
          `Balance updated for ${payer.display_name} after expense reimbursement`, payer, null)
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['players'] })
      }

      setShowForm(false)
      setForm({ date: new Date().toISOString().slice(0, 10), week_id: '', category: 'match_cost', amount: '', description: '', split_among: 'all_played', paid_by_player_id: '', reimburse_corpus: false })
      showToast('Expense recorded')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function deleteExpense(exp) {
    setConfirmData({
      message: `Delete expense "${exp.description}" (₹${exp.amount.toLocaleString('en-IN')})?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setDeletingId(exp.id)
        try {
          const allTxns    = tData?.transactions ?? []
          const allPlayers = pData?.players ?? []
          const deductTxns = allTxns.filter(t => t.id.startsWith(`TXN_EXP_${exp.id}_`))
          if (deductTxns.length > 0) {
            await softDeleteTransactions(deductTxns.map(t => t.id),
              `Deleting deductions for expense: ${exp.description}`)
            const revertedPlayers = allPlayers.map(p => {
              const txn = deductTxns.find(t => t.player_id === p.id)
              if (!txn) return p
              const newBal = Math.round(((p.corpus_balance ?? 0) + txn.amount) * 100) / 100
              return { ...p, corpus_balance: newBal, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
            })
            await writePlayers(revertedPlayers, 'expense_deduction_reversal', exp.id,
              `Reverted balances for deleted expense: ${exp.description}`, null, null)
            qc.invalidateQueries({ queryKey: ['players'] })
            qc.invalidateQueries({ queryKey: ['transactions'] })
          }
          const updated = expenses.filter(e => e.id !== exp.id)
          await writeExpenses(updated, 'delete_expense', `Deleted expense: ${exp.description} ₹${exp.amount}`)
          qc.invalidateQueries({ queryKey: ['expenses'] })
          showToast('Expense deleted')
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  async function saveEdit() {
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) { showToast('Valid amount required', 'error'); return }
    setSaving(true)
    try {
      const allPlayers     = pData?.players ?? []
      const allTxns        = tData?.transactions ?? []
      const oldDeductTxns  = allTxns.filter(t => t.id.startsWith(`TXN_EXP_${editExpense.id}_`))

      // Reverse existing deductions
      let revertedPlayers = allPlayers
      if (oldDeductTxns.length > 0) {
        await softDeleteTransactions(oldDeductTxns.map(t => t.id),
          `Reversing deductions for expense edit: ${editExpense.description}`)
        revertedPlayers = allPlayers.map(p => {
          const oldTxn = oldDeductTxns.find(t => t.player_id === p.id)
          if (!oldTxn) return p
          const newBal = Math.round(((p.corpus_balance ?? 0) + oldTxn.amount) * 100) / 100
          return { ...p, corpus_balance: newBal, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
        })
        await writePlayers(revertedPlayers, 'expense_deduction_reversal', editExpense.id,
          `Reverted balances for expense edit: ${editExpense.description}`, null, null)
        qc.invalidateQueries({ queryKey: ['players'] })
        qc.invalidateQueries({ queryKey: ['transactions'] })
      }

      // Save updated expense
      const payer = players.find(p => p.id === editForm.paid_by_player_id) ?? null
      const updatedExp = {
        ...editExpense,
        date: editForm.date,
        week_id: editForm.week_id || null,
        category: editForm.category,
        amount: parseFloat(editForm.amount),
        description: editForm.description || CATEGORIES.find(c => c.value === editForm.category)?.label,
        split_among: editForm.split_among,
        share_per_player: null,
        paid_by: payer?.display_name ?? '',
        paid_by_player_id: editForm.paid_by_player_id || null,
      }
      let updatedList = expenses.map(e => e.id === editExpense.id ? updatedExp : e)
      await writeExpenses(updatedList, 'edit_expense', `Edited expense: ${updatedExp.description} ₹${editForm.amount}`)
      qc.invalidateQueries({ queryKey: ['expenses'] })

      // Re-apply new deductions
      if (editForm.split_among !== 'corpus_pool') {
        let deductPlayers = []
        if (editForm.split_among === 'all_active') {
          deductPlayers = revertedPlayers.filter(p => p.status === 'active' && (p.type === 'corpus' || p.type === 'new'))
        } else if (editForm.split_among === 'all_played' && editForm.week_id) {
          const playedIds = new Set(records.filter(r => r.week_id === editForm.week_id && r.status === 'played').map(r => r.player_id))
          deductPlayers = revertedPlayers.filter(p => (p.type === 'corpus' || p.type === 'new') && playedIds.has(p.id))
        } else if (editForm.split_among === 'tshirt_orders') {
          const orders = tsData?.tshirt_orders ?? []
          const linkedIds = new Set(orders.filter(o => o.player_id).map(o => o.player_id))
          deductPlayers = revertedPlayers.filter(p => linkedIds.has(p.id))
        }
        if (deductPlayers.length > 0) {
          const share = Math.round((parseFloat(editForm.amount) / deductPlayers.length) * 100) / 100
          updatedList = updatedList.map(e => e.id === editExpense.id ? { ...updatedExp, share_per_player: share } : e)
          await writeExpenses(updatedList, 'edit_expense', `Expense split: ₹${share}/player × ${deductPlayers.length}`)
          const freshTxns = allTxns.filter(t => !t.id.startsWith(`TXN_EXP_${editExpense.id}_`))
          const newDeductTxns = deductPlayers.map(p => ({
            id: `TXN_EXP_${editExpense.id}_${p.id}`,
            player_id: p.id,
            tournament_id: cfg?.active_tournament_id ?? null,
            type: 'expense_deduction',
            amount: share,
            direction: 'debit',
            date: editForm.date,
            week_id: editForm.week_id || null,
            description: `Expense: ${updatedExp.description}`,
            recorded_by: 'admin',
            receipt_ref: '',
          }))
          await writeTransactions([...freshTxns, ...newDeductTxns], 'edit_expense_deduction', editExpense.id,
            `Re-applied deductions: ₹${share}/player × ${deductPlayers.length}`, null, null)
          const finalPlayers = revertedPlayers.map(p => {
            if (!deductPlayers.some(dp => dp.id === p.id)) return p
            const newBal = Math.round(((p.corpus_balance ?? 0) - share) * 100) / 100
            return { ...p, corpus_balance: newBal, balance_status: calcBalanceStatus(newBal, cfg ?? {}) }
          })
          await writePlayers(finalPlayers, 'expense_deduction', editExpense.id,
            `Balances re-applied for expense: ${updatedExp.description}`, null, null)
          qc.invalidateQueries({ queryKey: ['transactions'] })
          qc.invalidateQueries({ queryKey: ['players'] })
        }
      }

      setEditExpense(null)
      setEditForm(null)
      showToast('Expense updated')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const preview = perPlayerPreview()

  // Match Fee Collections panel
  const activeTId = cfg?.active_tournament_id
  const completedWeeks = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .slice(0, 8)
  const deductByWeek = {}
  ;(tData?.transactions ?? []).filter(t => t.type === 'match_deduction').forEach(t => {
    if (!deductByWeek[t.week_id]) deductByWeek[t.week_id] = { total: 0, count: 0 }
    deductByWeek[t.week_id].total += t.amount ?? 0
    deductByWeek[t.week_id].count += 1
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium text-white">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Total: ₹{total.toLocaleString('en-IN')}</p>
        </div>
        {canWrite && <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Expense</button>}
      </div>

      {completedWeeks.length > 0 && (
        <div className="card">
          <h2 className="font-medium text-gray-100 mb-3">Match Fee Collections</h2>
          <div className="divide-y divide-white/[0.05] -mx-4 -mb-4">
            {completedWeeks.map(w => {
              const d = deductByWeek[w.week_id]
              return (
                <div key={w.week_id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-100">{format(parseISO(w.match_date), 'MMM d')}</span>
                    <span className="ml-2 text-xs text-gray-400">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                  </div>
                  {d ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{d.count} players</span>
                      <span className="font-mono text-gray-200">₹{Math.round(d.total).toLocaleString('en-IN')}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[rgba(16,185,129,0.08)] text-[#10b981] font-medium">Applied</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/20 text-amber-300 font-medium">Not applied</span>
                      <a href="#/admin/weeks" className="text-xs text-blue-500 hover:underline">Go to Weeks →</a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] border-b border-white/[0.06]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Category</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Description</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Split</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Amount</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {expenses.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No expenses recorded yet.</td></tr>
            ) : expenses.map(e => (
                <tr key={e.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(parseISO(e.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 text-gray-200 whitespace-nowrap">{CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}</td>
                  <td className="px-4 py-3 text-gray-400">
                    <div>{e.description}</div>
                    {(e.paid_by || e.paid_by_player_id) && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Paid by {e.paid_by || players.find(p => p.id === e.paid_by_player_id)?.display_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    <div>{SPLIT_LABEL[e.split_among ?? e.distribution] ?? e.split_among ?? e.distribution ?? '—'}</div>
                    {(e.share_per_player ?? e.per_player_amount) ? (
                      <div className="text-gray-400">₹{(e.share_per_player ?? e.per_player_amount).toLocaleString('en-IN')}/player</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-red-600 whitespace-nowrap">
                    ₹{e.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isAdmin && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { setEditExpense(e); setEditForm({ date: e.date, week_id: e.week_id ?? '', category: e.category, amount: String(e.amount), description: e.description ?? '', split_among: e.split_among ?? 'all_played', paid_by_player_id: e.paid_by_player_id ?? '' }) }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteExpense(e)}
                          disabled={deletingId === e.id}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          {deletingId === e.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="bg-white/[0.03] border-t border-white/[0.06]">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-medium text-gray-200">Total</td>
                <td className="px-4 py-2 text-right font-mono font-medium text-white">₹{total.toLocaleString('en-IN')}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {editExpense && editForm && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-white/[0.06] flex justify-between items-center shrink-0">
              <h2 className="font-medium text-gray-100">Edit Expense</h2>
              <button onClick={() => { setEditExpense(null); setEditForm(null) }} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="label">Category</label>
                <select className="input" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: '#0b1512' }}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount (₹)</label>
                <input className="input" type="number" min="0" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Match (optional)</label>
                <select className="input" value={editForm.week_id} onChange={e => setEditForm(f => ({ ...f, week_id: e.target.value }))}>
                  <option value="" style={{ background: '#0b1512' }}>— not tied to a match —</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id} style={{ background: '#0b1512' }}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Split Among</label>
                <select className="input" value={editForm.split_among} onChange={e => setEditForm(f => ({ ...f, split_among: e.target.value }))}>
                  {SPLIT_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ background: '#0b1512' }}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Who paid? (optional)</label>
                <select className="input" value={editForm.paid_by_player_id} onChange={e => setEditForm(f => ({ ...f, paid_by_player_id: e.target.value }))}>
                  <option value="" style={{ background: '#0b1512' }}>— nobody / unknown —</option>
                  {players.map(p => <option key={p.id} value={p.id} style={{ background: '#0b1512' }}>{p.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2 shrink-0">
              <button onClick={() => { setEditExpense(null); setEditForm(null) }} className="btn-secondary">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && canWrite && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-white/[0.06] flex justify-between items-center shrink-0">
              <h2 className="font-medium text-gray-100">Add Expense</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: '#0b1512' }}>{c.label}</option>)}
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
                <label className="label">Match (optional)</label>
                <select className="input" value={form.week_id} onChange={e => setForm(f => ({ ...f, week_id: e.target.value }))}>
                  <option value="" style={{ background: '#0b1512' }}>— not tied to a match —</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id} style={{ background: '#0b1512' }}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Split Among</label>
                <select className="input" value={form.split_among} onChange={e => setForm(f => ({ ...f, split_among: e.target.value }))}>
                  {SPLIT_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ background: '#0b1512' }}>{s.label}</option>)}
                </select>
                {preview && (
                  <p className="text-xs text-[#10b981] mt-1">≈ {preview}</p>
                )}
                {form.split_among === 'tshirt_orders' && (() => {
                  const orders = tsData?.tshirt_orders ?? []
                  const allPlayers = pData?.players ?? []
                  const linkedPlayerIds = [...new Set(orders.filter(o => o.player_id).map(o => o.player_id))]
                  const linked = allPlayers.filter(p => linkedPlayerIds.includes(p.id))
                  const unlinked = orders.filter(o => !o.player_id)
                  return (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-gray-400 mb-1">Select players to deduct from:</p>
                      {linked.length === 0 && (
                        <p className="text-xs text-amber-400">No T-shirt orders are linked to player accounts yet.</p>
                      )}
                      {linked.map(p => {
                        const order = orders.find(o => o.player_id === p.id)
                        return (
                          <label key={p.id} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tshirtChecked[p.id] !== false}
                              onChange={e => setTshirtChecked(c => ({ ...c, [p.id]: e.target.checked }))}
                              className="w-4 h-4 accent-[#10b981]"
                            />
                            <span>{p.display_name}</span>
                            {order && <span className="text-xs text-gray-500">({order.jersey_name} #{order.jersey_number})</span>}
                          </label>
                        )
                      })}
                      {unlinked.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-white/[0.06]">
                          <p className="text-xs text-gray-500 mb-1">Not linked — no deduction possible:</p>
                          {unlinked.map(o => (
                            <p key={o.id} className="text-xs text-gray-400">{o.jersey_name} #{o.jersey_number}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input className="input" value={form.description} placeholder="e.g. DLF Ground booking" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Who paid? (optional)</label>
                <select className="input" value={form.paid_by_player_id}
                  onChange={e => setForm(f => ({ ...f, paid_by_player_id: e.target.value, reimburse_corpus: false }))}>
                  <option value="" style={{ background: '#0b1512' }}>— nobody / unknown —</option>
                  {players.map(p => <option key={p.id} value={p.id} style={{ background: '#0b1512' }}>{p.display_name}</option>)}
                </select>
              </div>
              {form.paid_by_player_id && parseFloat(form.amount) > 0 && (() => {
                const payer = players.find(p => p.id === form.paid_by_player_id)
                if (!payer) return null
                if (payer.type !== 'corpus' && payer.type !== 'new') {
                  return <p className="text-xs text-gray-400">{payer.display_name} is PPM — no corpus balance to credit.</p>
                }
                return (
                  <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.reimburse_corpus}
                      onChange={e => setForm(f => ({ ...f, reimburse_corpus: e.target.checked }))}
                      className="w-4 h-4 accent-[#10b981]"
                    />
                    Add ₹{parseFloat(form.amount).toLocaleString('en-IN')} to their corpus balance
                  </label>
                )
              })()}
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
