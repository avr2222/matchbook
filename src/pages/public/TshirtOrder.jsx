import { useState } from 'react'
import { useTshirtOrders, useAddTshirtOrder } from '../../hooks/useData'
import { usePlayers } from '../../hooks/useData'
import { showToast } from '../../components/ui/Toast'
import { format, parseISO } from 'date-fns'

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL']

const EMPTY_FORM = {
  jersey_name: '',
  jersey_number: '',
  size: 'L',
  sleeve_type: 'half',
  player_id: '',
  notes: '',
}

export default function TshirtOrder() {
  const { data: ordersData, isLoading: ordersLoading } = useTshirtOrders()
  const { data: pData } = usePlayers()
  const addOrder = useAddTshirtOrder()

  const [form, setForm] = useState(EMPTY_FORM)
  const [touched, setTouched] = useState({})

  const orders = ordersData?.tshirt_orders ?? []
  const players = (pData?.players ?? [])
    .filter(p => p.status === 'active')
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  const nameHint = touched.jersey_name && form.jersey_name.trim()
    ? orders.some(o => o.jersey_name.toLowerCase() === form.jersey_name.trim().toLowerCase())
      ? `Someone already ordered with this jersey name — that's fine, duplicates are allowed.`
      : null
    : null

  const numberHint = touched.jersey_number && form.jersey_number.trim()
    ? orders.some(o => o.jersey_number === form.jersey_number.trim())
      ? `Jersey #${form.jersey_number} is already in an order — that's fine, duplicates are allowed.`
      : null
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.jersey_name.trim()) { showToast('Jersey name is required', 'error'); return }
    if (!form.jersey_number.trim()) { showToast('Jersey number is required', 'error'); return }

    const id = `TSHIRT_${Date.now()}`
    try {
      await addOrder.mutateAsync({
        id,
        jersey_name: form.jersey_name.trim(),
        jersey_number: form.jersey_number.trim(),
        size: form.size,
        sleeve_type: form.sleeve_type,
        player_id: form.player_id || null,
        notes: form.notes.trim(),
      })
      showToast('Your order has been saved!')
      setForm(EMPTY_FORM)
      setTouched({})
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">T-Shirt Order</h1>
        <p className="text-sm text-gray-400 mt-1">
          Fill in the jersey details you want on your shirt. All fields except Notes are required.
        </p>
      </div>

      {/* Order Form */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Jersey Name */}
        <div>
          <label className="label">Name on Jersey</label>
          <input
            className="input"
            placeholder="e.g. VENKAT"
            value={form.jersey_name}
            onChange={e => setForm(f => ({ ...f, jersey_name: e.target.value }))}
            onBlur={() => setTouched(t => ({ ...t, jersey_name: true }))}
          />
          {nameHint && (
            <p className="text-xs text-gray-400 mt-1">{nameHint}</p>
          )}
        </div>

        {/* Jersey Number */}
        <div>
          <label className="label">Jersey Number</label>
          <input
            className="input"
            placeholder="e.g. 7"
            value={form.jersey_number}
            onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))}
            onBlur={() => setTouched(t => ({ ...t, jersey_number: true }))}
          />
          {numberHint && (
            <p className="text-xs text-gray-400 mt-1">{numberHint}</p>
          )}
        </div>

        {/* Size */}
        <div>
          <label className="label">Size</label>
          <div className="flex gap-2 flex-wrap">
            {SIZES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setForm(f => ({ ...f, size: s }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.size === s
                    ? 'bg-[#10b981] border-[#10b981] text-white'
                    : 'border-white/[0.1] text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Sleeve Type */}
        <div>
          <label className="label">Sleeve Type</label>
          <div className="flex gap-2">
            {[
              { value: 'half', label: 'Half Sleeve' },
              { value: 'full', label: 'Full Sleeve' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, sleeve_type: opt.value }))}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.sleeve_type === opt.value
                    ? 'bg-[#10b981] border-[#10b981] text-white'
                    : 'border-white/[0.1] text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Link to player account (optional) */}
        <div>
          <label className="label">Your Player Account <span className="text-gray-500 font-normal">(optional)</span></label>
          <select
            className="input"
            value={form.player_id}
            onChange={e => setForm(f => ({ ...f, player_id: e.target.value }))}
          >
            <option value="" style={{ background: '#0b1512' }}>— select your name —</option>
            {players.map(p => (
              <option key={p.id} value={p.id} style={{ background: '#0b1512' }}>{p.display_name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Link your account so the admin can deduct T-shirt cost from your balance.</p>
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes <span className="text-gray-500 font-normal">(optional)</span></label>
          <input
            className="input"
            placeholder="Any special requests…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={addOrder.isPending}
            className="btn-primary w-full"
          >
            {addOrder.isPending ? 'Saving…' : 'Submit Order'}
          </button>
        </div>
      </form>

      {/* Live orders list */}
      <div>
        <h2 className="text-base font-medium text-gray-200 mb-3">
          Orders so far
          {orders.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          )}
        </h2>
        {ordersLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet — be the first!</p>
        ) : (
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">#</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Name on Jersey</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Number</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Size</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Sleeve</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {orders.map((o, i) => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-100">{o.jersey_name}</td>
                    <td className="px-4 py-3 font-mono text-gray-300">{o.jersey_number}</td>
                    <td className="px-4 py-3 text-gray-300">{o.size}</td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{o.sleeve_type}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {o.created_at ? format(parseISO(o.created_at), 'MMM d') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
