import { useState } from 'react'
import { useTshirtOrders, useDeleteTshirtOrder, useUpdateTshirtOrder } from '../../hooks/useData'
import { usePlayers } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL']

export default function AdminTshirt() {
  const { data: ordersData, isLoading } = useTshirtOrders()
  const { data: pData } = usePlayers()
  const deleteOrder = useDeleteTshirtOrder()
  const updateOrder = useUpdateTshirtOrder()
  const isAdmin = useIsAdmin()

  const [editOrder, setEditOrder] = useState(null)
  const [editForm, setEditForm] = useState(null)

  if (isLoading) return <PageSpinner />

  const orders = ordersData?.tshirt_orders ?? []
  const players = (pData?.players ?? [])
    .filter(p => p.status === 'active')
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  const playerMap = Object.fromEntries(players.map(p => [p.id, p.display_name]))

  const halfCount = orders.filter(o => o.sleeve_type === 'half').length
  const fullCount = orders.filter(o => o.sleeve_type === 'full').length
  const sizeCounts = orders.reduce((acc, o) => {
    acc[o.size] = (acc[o.size] ?? 0) + 1
    return acc
  }, {})

  function openEdit(o) {
    setEditOrder(o)
    setEditForm({
      jersey_name: o.jersey_name,
      jersey_number: o.jersey_number,
      size: o.size,
      sleeve_type: o.sleeve_type,
      player_id: o.player_id ?? '',
      notes: o.notes ?? '',
    })
  }

  async function saveEdit() {
    if (!editForm.jersey_name.trim()) { showToast('Jersey name is required', 'error'); return }
    if (!editForm.jersey_number.trim()) { showToast('Jersey number is required', 'error'); return }
    try {
      await updateOrder.mutateAsync({
        id: editOrder.id,
        jersey_name: editForm.jersey_name.trim(),
        jersey_number: editForm.jersey_number.trim(),
        size: editForm.size,
        sleeve_type: editForm.sleeve_type,
        player_id: editForm.player_id || null,
        notes: editForm.notes.trim(),
      })
      showToast('Order updated')
      setEditOrder(null)
      setEditForm(null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleDelete(o) {
    if (!window.confirm(`Delete order for ${o.jersey_name} #${o.jersey_number}?`)) return
    try {
      await deleteOrder.mutateAsync(o.id)
      showToast('Order deleted')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; color: #000 !important; }
          .print-table th, .print-table td { color: #000 !important; border-color: #ccc !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="space-y-4">
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-[22px] font-medium text-white">T-Shirt Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} total</p>
          </div>
          <button onClick={() => window.print()} className="btn-primary text-sm no-print">
            Print / Export PDF
          </button>
        </div>

        {/* Print-only header (hidden on screen via inline style above) */}
        <div className="print-only mb-4">
          <h1 className="text-xl font-bold">Machaxi Box Cricket — T-Shirt Orders</h1>
          <p className="text-sm" style={{ color: '#555' }}>
            Total: {orders.length} · Half sleeve: {halfCount} · Full sleeve: {fullCount}
          </p>
        </div>

        {/* Summary chips */}
        {orders.length > 0 && (
          <div className="flex flex-wrap gap-2 no-print">
            <span className="px-3 py-1 rounded-full text-xs bg-white/[0.05] text-gray-300">Half sleeve: {halfCount}</span>
            <span className="px-3 py-1 rounded-full text-xs bg-white/[0.05] text-gray-300">Full sleeve: {fullCount}</span>
            {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'].filter(s => sizeCounts[s]).map(s => (
              <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/[0.05] text-gray-300">{s}: {sizeCounts[s]}</span>
            ))}
          </div>
        )}

        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm print-table">
            <thead className="bg-white/[0.03] border-b border-white/[0.06]">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Name on Jersey</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Number</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Size</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Sleeve</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Player</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Notes</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Submitted</th>
                {isAdmin && <th className="px-4 py-3 no-print" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400">No T-shirt orders yet.</td>
                </tr>
              ) : orders.map((o, i) => (
                <tr key={o.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-100">{o.jersey_name}</td>
                  <td className="px-4 py-3 font-mono text-gray-300">{o.jersey_number}</td>
                  <td className="px-4 py-3 text-gray-300">{o.size}</td>
                  <td className="px-4 py-3 text-gray-300 capitalize">{o.sleeve_type}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {o.player_id ? (playerMap[o.player_id] ?? o.player_id) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{o.notes || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {o.created_at ? format(parseISO(o.created_at), 'MMM d, yyyy') : '—'}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 no-print">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(o)}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(o)}
                          disabled={deleteOrder.isPending}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editOrder && editForm && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-white/[0.06] flex justify-between items-center shrink-0">
              <h2 className="font-medium text-gray-100">Edit T-Shirt Order</h2>
              <button onClick={() => { setEditOrder(null); setEditForm(null) }} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="label">Name on Jersey</label>
                <input
                  className="input"
                  value={editForm.jersey_name}
                  onChange={e => setEditForm(f => ({ ...f, jersey_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Jersey Number</label>
                <input
                  className="input"
                  value={editForm.jersey_number}
                  onChange={e => setEditForm(f => ({ ...f, jersey_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Size</label>
                <div className="flex gap-2 flex-wrap">
                  {SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, size: s }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        editForm.size === s
                          ? 'bg-[#10b981] border-[#10b981] text-white'
                          : 'border-white/[0.1] text-gray-400 hover:border-white/20 hover:text-gray-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Sleeve Type</label>
                <div className="flex gap-2">
                  {[{ value: 'half', label: 'Half Sleeve' }, { value: 'full', label: 'Full Sleeve' }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, sleeve_type: opt.value }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        editForm.sleeve_type === opt.value
                          ? 'bg-[#10b981] border-[#10b981] text-white'
                          : 'border-white/[0.1] text-gray-400 hover:border-white/20 hover:text-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Player Account <span className="text-gray-500 font-normal">(optional)</span></label>
                <select
                  className="input"
                  value={editForm.player_id}
                  onChange={e => setEditForm(f => ({ ...f, player_id: e.target.value }))}
                >
                  <option value="" style={{ background: '#0b1512' }}>— not linked —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id} style={{ background: '#0b1512' }}>{p.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notes <span className="text-gray-500 font-normal">(optional)</span></label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2 shrink-0">
              <button onClick={() => { setEditOrder(null); setEditForm(null) }} className="btn-secondary">Cancel</button>
              <button onClick={saveEdit} disabled={updateOrder.isPending} className="btn-primary">
                {updateOrder.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
