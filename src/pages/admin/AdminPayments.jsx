import { useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { confirmPayment, rejectPayment } from '../../api/dataWriter'
import { usePlayers } from '../../hooks/useData'
import { showToast } from '../../components/ui/Toast'
import { format, parseISO } from 'date-fns'

function usePaymentRequestsFull() {
  return useQuery({
    queryKey: ['payment_requests_full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
}

export default function AdminPayments() {
  const qc = useQueryClient()
  const { data: requests = [], isLoading } = usePaymentRequestsFull()
  const { data: pData } = usePlayers()
  const [busy, setBusy] = useState(null)
  const [filter, setFilter] = useState('pending')

  const playerMap = Object.fromEntries((pData?.players ?? []).map(p => [p.id, p]))

  async function handleConfirm(req) {
    if (!confirm(`Confirm ₹${req.amount?.toLocaleString('en-IN')} from ${playerMap[req.player_id]?.display_name ?? req.player_id}?`)) return
    setBusy(req.id)
    try {
      await confirmPayment(req.id)
      qc.invalidateQueries({ queryKey: ['payment_requests_full'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      showToast('Payment confirmed — corpus_payment transaction created')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleReject(req) {
    if (!confirm('Reject this payment request?')) return
    setBusy(req.id)
    try {
      await rejectPayment(req.id)
      qc.invalidateQueries({ queryKey: ['payment_requests_full'] })
      showToast('Payment request rejected')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const pending = requests.filter(r => r.status === 'pending').length
  const visible = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Requests</h1>
          {pending > 0 && (
            <p className="text-sm text-amber-600 font-medium">{pending} pending confirmation</p>
          )}
        </div>
        <div className="flex gap-2">
          {['pending', 'confirmed', 'rejected', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === f
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="card text-center py-8 text-gray-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">💳</div>
          No {filter === 'all' ? '' : filter} payment requests.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">UPI Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Date</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {visible.map(req => {
                const player = playerMap[req.player_id]
                const isBusy = busy === req.id
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {player?.display_name ?? req.player_id}
                      {req.notes && (
                        <div className="text-xs text-gray-400 font-normal">{req.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">
                      ₹{(req.amount ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden sm:table-cell">
                      {req.upi_ref || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                      {req.created_at ? format(parseISO(req.created_at), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleConfirm(req)}
                            disabled={isBusy}
                            className="btn-primary text-xs py-1 px-3"
                          >
                            {isBusy ? '…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => handleReject(req)}
                            disabled={isBusy}
                            className="btn-danger text-xs py-1 px-3"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {req.status === 'confirmed' && (
                        <span className="text-xs text-green-500 font-medium">
                          {req.paid_at ? format(parseISO(req.paid_at), 'MMM d') : '✓'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
