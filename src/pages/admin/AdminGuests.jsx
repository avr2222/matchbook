import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGuestVisits, usePlayers, useWeeks, useConfig } from '../../hooks/useData'
import { writeGuestVisits, writePlayers } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { generateId, calcBalanceStatus } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'

export default function AdminGuests() {
  const qc = useQueryClient()
  const { data: gData, isLoading } = useGuestVisits()
  const { data: pData } = usePlayers()
  const { data: wData } = useWeeks()
  const { data: cfg }   = useConfig()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [converting, setConverting] = useState(null) // visit id being converted
  const [form, setForm] = useState({
    week_id: '',
    guest_name: '',
    invited_by_player_id: '',
    guest_fee: cfg?.default_guest_fee ?? 300,
    fee_mode: 'direct',
    payment_method: 'cash',
    notes: '',
  })

  if (isLoading) return <PageSpinner />

  const visits  = (gData?.guest_visits ?? []).sort((a, b) => {
    const wa = wData?.weeks?.find(w => w.week_id === a.week_id)
    const wb = wData?.weeks?.find(w => w.week_id === b.week_id)
    return (wb?.match_date ?? '').localeCompare(wa?.match_date ?? '')
  })
  const players = (pData?.players ?? []).filter(p => p.status === 'active')
  const weeks   = (wData?.weeks ?? []).filter(w => w.tournament_id === (cfg?.active_tournament_id ?? 'TRN_001'))

  // Count visits per guest name (case-insensitive)
  const visitCounts = {}
  visits.forEach(v => {
    const key = v.guest_name.toLowerCase().trim()
    visitCounts[key] = (visitCounts[key] ?? 0) + 1
  })

  function isFrequent(guestName) {
    return (visitCounts[guestName.toLowerCase().trim()] ?? 0) >= 3
  }

  async function save() {
    if (!form.week_id || !form.guest_name.trim()) { showToast('Match and guest name required', 'error'); return }
    setSaving(true)
    try {
      const id = generateId('GST', visits.map(v => v.id))
      const newVisit = {
        id,
        week_id: form.week_id,
        guest_name: form.guest_name,
        invited_by_player_id: form.invited_by_player_id || null,
        guest_fee: parseFloat(form.guest_fee) || 0,
        fee_mode: form.fee_mode,
        fee_paid: form.fee_mode === 'sponsored' || form.payment_method !== 'pending',
        payment_method: form.payment_method,
        notes: form.notes,
        converted_to_player_id: null,
      }
      await writeGuestVisits([...visits, newVisit], `Guest ${form.guest_name} for ${weeks.find(w => w.week_id === form.week_id)?.label ?? form.week_id}`)
      qc.invalidateQueries({ queryKey: ['guests'] })
      setShowForm(false)
      setForm({ week_id: '', guest_name: '', invited_by_player_id: '', guest_fee: cfg?.default_guest_fee ?? 300, fee_mode: 'direct', payment_method: 'cash', notes: '' })
      showToast('Guest visit recorded')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function convertToPlayer(visit) {
    if (!confirm(`Convert ${visit.guest_name} to a permanent player?`)) return
    setConverting(visit.id)
    try {
      const allPlayers = pData?.players ?? []
      const newId = generateId('PLY', allPlayers.map(p => p.id))
      const newPlayer = {
        id: newId,
        display_name: visit.guest_name,
        type: 'corpus',
        status: 'active',
        joined_date: new Date().toISOString().slice(0, 10),
        phone: '',
        corpus_balance: 0,
        total_paid: 0,
        total_deducted: 0,
        balance_status: calcBalanceStatus(0, cfg ?? { corpus_overdue_threshold: 0, corpus_urgent_threshold: 500, corpus_low_threshold: 1000 }),
        github_username: '',
        cricheroes_player_id: '',
        cricheroes_name: '',
        guest_fee_mode: null,
        sponsored_by_player_id: null,
        notes: `Converted from guest (${visit.guest_name})`,
      }
      await writePlayers([...allPlayers, newPlayer], 'add_player', newId, `Converted guest ${visit.guest_name} to player`, null, newPlayer)
      // Mark the visit as converted
      const updatedVisits = visits.map(v => v.id === visit.id ? { ...v, converted_to_player_id: newId } : v)
      await writeGuestVisits(updatedVisits, `Marked ${visit.guest_name} as converted to player ${newId}`)
      qc.invalidateQueries({ queryKey: ['players'] })
      qc.invalidateQueries({ queryKey: ['guests'] })
      showToast(`${visit.guest_name} added as a player`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setConverting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Guest Visits</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Guest Visit</button>
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Match</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Guest</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invited By</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Fee Mode</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Fee</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Paid?</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visits.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No guest visits recorded yet.</td></tr>
            ) : visits.map(v => {
              const week   = weeks.find(w => w.week_id === v.week_id)
              const invite = players.find(p => p.id === v.invited_by_player_id)
              const frequent = isFrequent(v.guest_name)
              const alreadyConverted = !!v.converted_to_player_id
              return (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {week ? format(parseISO(week.match_date), 'MMM d') : v.week_id}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div>👤 {v.guest_name}</div>
                    {frequent && (
                      <div className="text-xs text-purple-600 mt-0.5">⭐ Frequent Guest</div>
                    )}
                    {alreadyConverted && (
                      <div className="text-xs text-green-600 mt-0.5">✅ Converted to player</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{invite?.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      v.fee_mode === 'sponsored' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {v.fee_mode === 'sponsored' ? 'Sponsored' : 'Direct'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">₹{(v.guest_fee ?? 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-center">{v.fee_paid ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-center">
                    {!alreadyConverted && (
                      <button
                        onClick={() => convertToPlayer(v)}
                        disabled={converting === v.id}
                        className="text-xs text-green-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                      >
                        {converting === v.id ? 'Converting…' : '→ Make Player'}
                      </button>
                    )}
                  </td>
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
              <h2 className="font-semibold">Add Guest Visit</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Match</label>
                <select className="input" value={form.week_id} onChange={e => setForm(f => ({ ...f, week_id: e.target.value }))}>
                  <option value="">Select match…</option>
                  {weeks.map(w => <option key={w.week_id} value={w.week_id}>{w.label} · {w.match_date}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Guest Name</label>
                <input className="input" value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Invited By (optional)</label>
                <select className="input" value={form.invited_by_player_id} onChange={e => setForm(f => ({ ...f, invited_by_player_id: e.target.value }))}>
                  <option value="">— none —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fee Mode</label>
                <select className="input" value={form.fee_mode} onChange={e => setForm(f => ({ ...f, fee_mode: e.target.value }))}>
                  <option value="direct">Direct — guest pays cash</option>
                  <option value="sponsored">Sponsored — deduct from inviter's corpus</option>
                </select>
              </div>
              <div>
                <label className="label">Guest Fee (₹)</label>
                <input className="input" type="number" min="0" value={form.guest_fee} onChange={e => setForm(f => ({ ...f, guest_fee: e.target.value }))} />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
