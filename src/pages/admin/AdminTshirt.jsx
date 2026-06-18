import { useTshirtOrders, useDeleteTshirtOrder } from '../../hooks/useData'
import { usePlayers } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'

export default function AdminTshirt() {
  const { data: ordersData, isLoading } = useTshirtOrders()
  const { data: pData } = usePlayers()
  const deleteOrder = useDeleteTshirtOrder()
  const isAdmin = useIsAdmin()

  if (isLoading) return <PageSpinner />

  const orders = ordersData?.tshirt_orders ?? []
  const playerMap = Object.fromEntries(
    (pData?.players ?? []).map(p => [p.id, p.display_name])
  )

  const halfCount = orders.filter(o => o.sleeve_type === 'half').length
  const fullCount = orders.filter(o => o.sleeve_type === 'full').length
  const sizeCounts = orders.reduce((acc, o) => {
    acc[o.size] = (acc[o.size] ?? 0) + 1
    return acc
  }, {})

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
          body { background: #fff !important; color: #000 !important; }
          .print-table th, .print-table td { color: #000 !important; border-color: #ccc !important; }
          .print-table { border: 1px solid #ccc; }
          .print-header { color: #000 !important; }
        }
      `}</style>

      <div className="space-y-4">
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-[22px] font-medium text-white print-header">T-Shirt Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} total</p>
          </div>
          <button
            onClick={() => window.print()}
            className="btn-primary text-sm no-print"
          >
            Print / Export PDF
          </button>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">Machaxi Box Cricket — T-Shirt Orders</h1>
          <p className="text-sm text-gray-600">Total: {orders.length} orders · Half: {halfCount} · Full: {fullCount}</p>
        </div>

        {/* Summary chips */}
        {orders.length > 0 && (
          <div className="flex flex-wrap gap-2 no-print">
            <span className="px-3 py-1 rounded-full text-xs bg-white/[0.05] text-gray-300">Half sleeve: {halfCount}</span>
            <span className="px-3 py-1 rounded-full text-xs bg-white/[0.05] text-gray-300">Full sleeve: {fullCount}</span>
            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].filter(s => sizeCounts[s]).map(s => (
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
                    {o.player_id ? playerMap[o.player_id] ?? o.player_id : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{o.notes || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {o.created_at ? format(parseISO(o.created_at), 'MMM d, yyyy') : '—'}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 no-print">
                      <button
                        onClick={() => handleDelete(o)}
                        disabled={deleteOrder.isPending}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
