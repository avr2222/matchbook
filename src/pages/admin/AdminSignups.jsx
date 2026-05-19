import { useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { approveSignup, rejectSignup, updateSignupPlayer } from '../../api/dataWriter'
import { usePlayers } from '../../hooks/useData'
import { showToast } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { format, parseISO } from 'date-fns'

function useSignups() {
  return useQuery({
    queryKey: ['user_signups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_signups')
        .select('*, players(display_name, type)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

const STATUS_BADGE = {
  pending:  'bg-amber-100 text-amber-800',
  approved: 'bg-[#E1F5EE] text-[#1D9E75]',
  rejected: 'bg-red-100 text-red-600',
}

export default function AdminSignups() {
  const qc = useQueryClient()
  const { data: signups = [], isLoading } = useSignups()
  const { data: pData } = usePlayers()
  const [busy, setBusy]           = useState(null)
  const [filter, setFilter]       = useState('pending')
  const [editingId, setEditingId] = useState(null)
  const [editPlayerId, setEditPlayerId] = useState('')
  const [editBusy, setEditBusy]   = useState(false)
  const [confirmData, setConfirmData] = useState(null)

  const allPlayers = pData?.players ?? []

  async function savePlayerLink(signup) {
    setEditBusy(true)
    try {
      await updateSignupPlayer(signup.id, editPlayerId || null)
      qc.invalidateQueries({ queryKey: ['user_signups'] })
      qc.invalidateQueries({ queryKey: ['players'] })
      setEditingId(null)
      showToast('Player link updated')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setEditBusy(false)
    }
  }

  async function handleApprove(signup, role) {
    setBusy(signup.id)
    try {
      await approveSignup(signup.id, role)
      qc.invalidateQueries({ queryKey: ['user_signups'] })
      showToast(`${signup.display_name} approved as ${role}`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  function handleReject(signup) {
    setConfirmData({
      title: 'Reject Signup',
      message: `Reject signup request from ${signup.display_name}? They will not be able to access the app.`,
      confirmLabel: 'Reject',
      danger: true,
      onConfirm: async () => {
        setBusy(signup.id)
        try {
          await rejectSignup(signup.id)
          qc.invalidateQueries({ queryKey: ['user_signups'] })
          showToast(`${signup.display_name}'s signup rejected`)
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const pending  = signups.filter(s => s.status === 'pending').length
  const visible  = filter === 'all' ? signups : signups.filter(s => s.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[22px] font-medium text-gray-900">Signup Requests</h1>
          {pending > 0 && (
            <p className="text-sm text-amber-600 font-medium">{pending} pending approval</p>
          )}
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-[#1D9E75] text-white'
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
          <div className="text-3xl mb-2 text-gray-300">—</div>
          No {filter === 'all' ? '' : filter} signups.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(s => {
            const claimedPlayer = s.players
            const isBusy = busy === s.id
            // Players available for linking: unclaimed + currently linked
            const linkable = allPlayers.filter(p =>
              p.status === 'active' && p.type !== 'guest' &&
              (!p.auth_user_id || p.id === s.player_id)
            )
            return (
              <div key={s.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{s.display_name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.status}
                      </span>
                      {s.requested_role === 'host' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                          Host request
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{s.phone}</span>
                      <span className="flex items-center gap-1.5">
                        Player:
                        {editingId === s.id ? (
                          <span className="flex items-center gap-1.5">
                            <select
                              className="input text-xs py-0.5 h-7"
                              value={editPlayerId}
                              onChange={e => setEditPlayerId(e.target.value)}
                            >
                              <option value="">— No player —</option>
                              {linkable.map(p => (
                                <option key={p.id} value={p.id}>{p.display_name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => savePlayerLink(s)}
                              disabled={editBusy}
                              className="text-xs text-[#1D9E75] font-medium hover:underline"
                            >
                              {editBusy ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-700">
                              {claimedPlayer?.display_name ?? '—'}
                            </span>
                            <button
                              onClick={() => { setEditingId(s.id); setEditPlayerId(s.player_id ?? '') }}
                              className="text-xs text-blue-500 hover:underline"
                            >
                              Edit
                            </button>
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Signed up {s.created_at ? format(parseISO(s.created_at), 'MMM d, yyyy h:mm a') : '—'}
                    </div>
                  </div>

                  {s.status === 'pending' && (
                    <div className="flex gap-2 flex-wrap shrink-0">
                      <button
                        onClick={() => handleApprove(s, 'player')}
                        disabled={isBusy}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        {isBusy ? '…' : '✓ Player'}
                      </button>
                      <button
                        onClick={() => handleApprove(s, 'host')}
                        disabled={isBusy}
                        className="text-xs py-1.5 px-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? '…' : '★ Host'}
                      </button>
                      <button
                        onClick={() => handleReject(s)}
                        disabled={isBusy}
                        className="btn-danger text-xs py-1.5 px-3"
                      >
                        ✕ Reject
                      </button>
                    </div>
                  )}

                  {s.status !== 'pending' && (
                    <span className="text-xs text-gray-400 shrink-0">
                      Role: <span className="font-medium text-gray-700">{s.requested_role}</span>
                    </span>
                  )}
                </div>

                {/* Security questions (collapsed by default) */}
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer hover:text-gray-600 select-none">Security questions</summary>
                  <div className="mt-2 space-y-1 bg-[#F4F3F0] rounded-lg p-2">
                    <div><span className="font-medium text-gray-600">Q1:</span> {s.security_question_1}</div>
                    <div><span className="font-medium text-gray-600">A1:</span> {s.security_answer_1 ? '••••••' : '—'}</div>
                    <div><span className="font-medium text-gray-600">Q2:</span> {s.security_question_2}</div>
                    <div><span className="font-medium text-gray-600">A2:</span> {s.security_answer_2 ? '••••••' : '—'}</div>
                  </div>
                </details>
              </div>
            )
          })}
        </div>
      )}

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}
    </div>
  )
}
