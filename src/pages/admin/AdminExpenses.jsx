import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useExpenses, useWeeks, useConfig } from '../../hooks/useData'
import { writeExpenses } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { generateId } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'

const CATEGORIES = [
  { value: 'ground_booking', label: 'Ground Booking' },
  { value: 'equipment',      label: 'Equipment'      },
  { value: 'refreshments',   label: 'Refreshments'   },
  { value: 'kit',            label: 'Kit / Uniform'  },
  { value: 'other',          label: 'Other'          },
]

const SPLIT_OPTIONS = [
  { value: 'all_played',   label: 'Split among all who played' },
  { value: 'all_active',   label: 'Split among all active players' },
  { value: 'corpus_pool',  label: 'Deduct from corpus pool only' },
]

export default function AdminExpenses() {
  const qc = useQueryClient()
  const { data: eData, isLoading } = useExpenses()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    week_id: '',
    category: 'ground_booking',
    amount: '',
    description: '',
    split_among: 'all_played',
  })

  if (isLoading) return <PageSpinner />

  const expenses = (eData?.expenses ?? []).sort((a, b) => b.date.localeCompare(a.date))
  const weeks    = (wData?.weeks ?? []).filter(w => w.tournament_id === (cfg?.active_tournament_id ?? 'TRN_001'))

  async function save() {
    if (!form.amount) { showToast('Amount required', 'error'); return }
    setSaving(true)
    try {
      const id = generateId('EXP', expenses.map(e => e.id))
      const newExp = {
        id,
        date: form.date,
        week_id: form.week_id || null,
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description || CATEGORIES.find(c => c.value === form.category)?.label,
        split_among: form.split_among,
        per_player_amount: null,
        recorded_by: 'admin',
      }
      await writeExpenses([...expenses, newExp], 'add_expense', `Added expense: ${newExp.description} ₹${form.amount}`)
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setShowForm(false)
      setForm({ date: new Date().toISOString().slice(0,10), week_id: '', category: 'ground_booking', amount: '', description: '', split_among: 'all_played' })
      showToast('Expense recorded')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Total: ₹{total.toLocaleString('en-IN')}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Expense</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Split</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses recorded yet.</td></tr>
            ) : expenses.map(e => {
              const week = weeks.find(w => w.week_id === e.week_id)
              return (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{format(parseISO(e.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 text-gray-700">{CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}</td>
                  <td className="px-4 py-3 text-gray-600">{e.description}{week ? <span className="ml-1 text-xs text-gray-400">({week.label})</span> : null}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{SPLIT_OPTIONS.find(s => s.value === e.split_among)?.label ?? e.split_among}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-red-600">₹{e.amount.toLocaleString('en-IN')}</td>
                </tr>
              )
            })}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
                <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">₹{total.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Add Expense</h2>
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
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input className="input" value={form.description} placeholder="e.g. DLF Ground booking" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
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
