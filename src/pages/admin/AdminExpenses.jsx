import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useExpenses, useWeeks, useConfig, usePlayers, useAttendance, useTransactions } from '../../hooks/useData'
import { writeExpenses, writeTransactions, writePlayers } from '../../api/dataWriter'
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
  all_played:   'Played',
  all_active:   'All Active',
  corpus_pool:  'Corpus Pool',
  week_present: 'Played',
  all_corpus:   'All Corpus',
}

const SPLIT_OPTIONS = [
  { value: 'all_played',  label: 'Split among all who played' },
  { value: 'all_active',  label: 'Split among all active players' },
  { value: 'corpus_pool', label: 'Deduct from corpus pool only' },
]

export default function AdminExpenses() {
  const qc = useQueryClient()
  const { data: eData, isLoading } = useExpenses()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const { data: pData } = usePlayers()
  const { data: aData } = useAttendance()
  const { data: tData } = useTransactions()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin  = useIsAdmin()
  const canWrite = useCanWrite()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmData, setConfirmData] = useState(null)
  const [editExpense, setEditExpense] = useState(null)
  const [editForm, setEditForm]       = useState(null)
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

  // Per-player impact preview for the form
  function perPlayerPreview() {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return null
    if (form.split_among === 'corpus_pool') return null
    let count = 0
    if (form.split_among === 'all_active') {
      count = players.length
    } else if (form.split_among === 'all_played') {
      if (!form.week_id) return null
      count = records.filter(r => r.week_id === form.week_id && r.status === 'played').length
    }
    if (count === 0) return null
    return `₹${Math.round(amt / count).toLocaleString('en-IN')} per player (${count} players)`
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
      const payer = players.find(p => p.id === editForm.paid_by_player_id) ?? null
      const updated = {
        ...editExpense,
        date: editForm.date,
        week_id: editForm.week_id || null,
        category: editForm.category,
        amount: parseFloat(editForm.amount),
        description: editForm.description || CATEGORIES.find(c => c.value === editForm.category)?.label,
        split_among: editForm.split_among,
        paid_by: payer?.display_name ?? '',
        paid_by_player_id: editForm.paid_by_player_id || null,
      }
      const updatedList = expenses.map(e => e.id === editExpense.id ? updated : e)
      await writeExpenses(updatedList, 'edit_expense', `Edited expense: ${updated.description} ₹${editForm.amount}`)
      qc.invalidateQueries({ queryKey: ['expenses'] })
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
          <h1 className="text-[22px] font-medium text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Total: ₹{total.toLocaleString('en-IN')}</p>
        </div>
        {canWrite && <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Expense</button>}
      </div>

      {completedWeeks.length > 0 && (
        <div className="card">
          <h2 className="font-medium text-gray-800 mb-3">Match Fee Collections</h2>
          <div className="divide-y divide-[rgba(0,0,0,0.04)] -mx-4 -mb-4">
            {completedWeeks.map(w => {
              const d = deductByWeek[w.week_id]
              return (
                <div key={w.week_id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{format(parseISO(w.match_date), 'MMM d')}</span>
                    <span className="ml-2 text-xs text-gray-400">{format(parseISO(w.match_date), 'MMM d, yyyy')}</span>
                  </div>
                  {d ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{d.count} players</span>
                      <span className="font-mono text-gray-700">₹{Math.round(d.total).toLocaleString('en-IN')}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#E1F5EE] text-[#1D9E75] font-medium">Applied</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Not applied</span>
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
          <thead className="bg-[#F8F8F6] border-b border-[rgba(0,0,0,0.06)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Category</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Description</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Split</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Amount</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
            {expenses.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No expenses recorded yet.</td></tr>
            ) : expenses.map(e => (
                <tr key={e.id} className="hover:bg-[#F8F8F6]">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(parseISO(e.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}</td>
                  <td className="px-4 py-3 text-gray-600">
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
            <tfoot className="bg-[#F8F8F6] border-t border-[rgba(0,0,0,0.06)]">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-medium text-gray-700">Total</td>
                <td className="px-4 py-2 text-right font-mono font-medium text-gray-900">₹{total.toLocaleString('en-IN')}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {editExpense && editForm && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">Edit Expense</h2>
              <button onClick={() => { setEditExpense(null); setEditForm(null) }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Category</label>
                <select className="input" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
                  <option value="">— not tied to a match —</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Split Among</label>
                <select className="input" value={editForm.split_among} onChange={e => setEditForm(f => ({ ...f, split_among: e.target.value }))}>
                  {SPLIT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Who paid? (optional)</label>
                <select className="input" value={editForm.paid_by_player_id} onChange={e => setEditForm(f => ({ ...f, paid_by_player_id: e.target.value }))}>
                  <option value="">— nobody / unknown —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => { setEditExpense(null); setEditForm(null) }} className="btn-secondary">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && canWrite && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">Add Expense</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
                  <option value="">— not tied to a match —</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Split Among</label>
                <select className="input" value={form.split_among} onChange={e => setForm(f => ({ ...f, split_among: e.target.value }))}>
                  {SPLIT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {preview && (
                  <p className="text-xs text-[#1D9E75] mt-1">≈ {preview}</p>
                )}
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input className="input" value={form.description} placeholder="e.g. DLF Ground booking" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Who paid? (optional)</label>
                <select className="input" value={form.paid_by_player_id}
                  onChange={e => setForm(f => ({ ...f, paid_by_player_id: e.target.value, reimburse_corpus: false }))}>
                  <option value="">— nobody / unknown —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              {form.paid_by_player_id && parseFloat(form.amount) > 0 && (() => {
                const payer = players.find(p => p.id === form.paid_by_player_id)
                if (!payer) return null
                if (payer.type !== 'corpus' && payer.type !== 'new') {
                  return <p className="text-xs text-gray-400">{payer.display_name} is PPM — no corpus balance to credit.</p>
                }
                return (
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.reimburse_corpus}
                      onChange={e => setForm(f => ({ ...f, reimburse_corpus: e.target.checked }))}
                      className="w-4 h-4 accent-[#1D9E75]"
                    />
                    Add ₹{parseFloat(form.amount).toLocaleString('en-IN')} to their corpus balance
                  </label>
                )
              })()}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
