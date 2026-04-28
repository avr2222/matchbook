import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useConfig } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { writePlayers } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { typeEmoji, typeLabel, generateId, calcBalanceStatus } from '../../utils/balanceCalculator'

const EMPTY = {
  display_name: '', type: 'corpus', status: 'active', joined_date: new Date().toISOString().slice(0,10),
  phone: '', corpus_balance: 0, total_paid: 0, total_deducted: 0, balance_status: 'good',
  github_username: '', cricheroes_player_id: '', cricheroes_name: '', guest_fee_mode: null,
  sponsored_by_player_id: null, notes: '',
}

const TYPE_TABS = ['all', 'corpus', 'ppm', 'new', 'guest', 'inactive']

function similarName(a, b) {
  const norm = s => s.toLowerCase().replace(/\s+/g, '')
  const na = norm(a), nb = norm(b)
  if (na === nb) return true
  if (na.length < 3 || nb.length < 3) return false
  // simple bigram overlap
  const bigrams = s => new Set([...Array(s.length - 1)].map((_, i) => s.slice(i, i + 2)))
  const ba = bigrams(na), bb = bigrams(nb)
  const intersection = [...ba].filter(x => bb.has(x)).length
  const union = new Set([...ba, ...bb]).size
  return union > 0 && intersection / union >= 0.6
}

export default function AdminPlayers() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading } = usePlayers()
  const { data: cfg } = useConfig()
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  const [typeTab, setTypeTab] = useState('all')

  useEffect(() => {
    if (searchParams.get('new') === '1' && data) {
      const players = data?.players ?? []
      setEditing({ ...EMPTY, id: generateId('PLY', players.map(p => p.id)) })
      setSearchParams({}, { replace: true })
    }
  }, [data])

  if (isLoading) return <PageSpinner />

  const players = data?.players ?? []

  const visible = players.filter(p => {
    const matchesSearch = p.display_name.toLowerCase().includes(search.toLowerCase())
    const matchesTab =
      typeTab === 'all'      ? p.status === 'active' :
      typeTab === 'inactive' ? p.status === 'inactive' :
                               p.type === typeTab && p.status === 'active'
    return matchesSearch && matchesTab
  })

  const tabCounts = {
    all:      players.filter(p => p.status === 'active').length,
    corpus:   players.filter(p => p.type === 'corpus'  && p.status === 'active').length,
    ppm:      players.filter(p => p.type === 'ppm'     && p.status === 'active').length,
    new:      players.filter(p => p.type === 'new'     && p.status === 'active').length,
    guest:    players.filter(p => p.type === 'guest'   && p.status === 'active').length,
    inactive: players.filter(p => p.status === 'inactive').length,
  }

  function openNew() {
    setEditing({ ...EMPTY, id: generateId('PLY', players.map(p => p.id)) })
  }

  function openEdit(p) { setEditing({ ...p }) }

  // Duplicate name warning: similar names among active players excluding the player being edited
  const dupWarning = editing?.display_name?.trim().length >= 2
    ? players.filter(p => p.status === 'active' && p.id !== editing.id && similarName(p.display_name, editing.display_name))
    : []

  async function save() {
    if (!editing.display_name.trim()) { showToast('Display name is required', 'error'); return }
    setSaving(true)
    try {
      const isNew   = !players.find(p => p.id === editing.id)
      const before  = players.find(p => p.id === editing.id) ?? null
      editing.balance_status = calcBalanceStatus(editing.corpus_balance, cfg ?? {
        corpus_overdue_threshold: 0, corpus_urgent_threshold: 500, corpus_low_threshold: 1000,
      })
      const updated = isNew
        ? [...players, editing]
        : players.map(p => p.id === editing.id ? editing : p)
      await writePlayers(
        updated,
        isNew ? 'add_player' : 'edit_player',
        editing.id,
        `${isNew ? 'Added' : 'Updated'} player ${editing.display_name}`,
        before, editing,
      )
      qc.invalidateQueries({ queryKey: ['players'] })
      setEditing(null)
      showToast(`Player ${isNew ? 'added' : 'updated'} successfully`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(player) {
    if (!confirm(`Remove ${player.display_name}? This will mark them inactive.`)) return
    setSaving(true)
    try {
      const updated = players.map(p => p.id === player.id ? { ...p, status: 'inactive' } : p)
      await writePlayers(updated, 'remove_player', player.id, `Deactivated ${player.display_name}`, player, { ...player, status: 'inactive' })
      qc.invalidateQueries({ queryKey: ['players'] })
      showToast(`${player.display_name} deactivated`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const sponsorName = (id) => players.find(p => p.id === id)?.display_name ?? id

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Players</h1>
        <button onClick={openNew} className="btn-primary text-sm">+ Add Player</button>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TYPE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setTypeTab(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeTab === tab
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1 opacity-70">({tabCounts[tab]})</span>
          </button>
        ))}
        <input
          className="input ml-auto w-44 text-sm"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Player</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Deducted</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">GitHub</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No players found.</td>
              </tr>
            )}
            {visible.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 ${p.status === 'inactive' ? 'opacity-40' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div>{p.display_name}</div>
                  {p.type === 'guest' && p.sponsored_by_player_id && (
                    <div className="text-xs text-purple-600 mt-0.5">
                      Sponsored by {sponsorName(p.sponsored_by_player_id)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{typeEmoji(p.type)} {typeLabel(p.type)}</td>
                <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                  {p.type === 'ppm' ? 'PPM' : `₹${(p.corpus_balance ?? 0).toLocaleString('en-IN')}`}
                </td>
                <td className="px-4 py-3 text-right font-mono text-green-700 whitespace-nowrap">
                  {p.type === 'ppm' ? '—' : `₹${(p.total_paid ?? 0).toLocaleString('en-IN')}`}
                </td>
                <td className="px-4 py-3 text-right font-mono text-red-500 whitespace-nowrap">
                  {p.type === 'ppm' ? '—' : `₹${(p.total_deducted ?? 0).toLocaleString('en-IN')}`}
                </td>
                <td className="px-4 py-3 text-center"><BalanceBadge status={p.balance_status} /></td>
                <td className="px-4 py-3 text-center text-gray-400 text-xs">{p.github_username || '—'}</td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                  {p.status === 'active' && (
                    <button onClick={() => remove(p)} className="text-red-500 hover:underline text-xs">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit / Add modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-semibold text-gray-900">
                {players.find(p => p.id === editing.id) ? 'Edit Player' : 'Add Player'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {/* Name field with duplicate warning */}
              <div>
                <label className="label">Display Name</label>
                <input
                  className="input"
                  type="text"
                  value={editing.display_name}
                  onChange={e => setEditing(prev => ({ ...prev, display_name: e.target.value }))}
                />
                {dupWarning.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    Similar name already exists: {dupWarning.map(p => p.display_name).join(', ')}
                  </p>
                )}
              </div>

              {[
                ['phone', 'Phone', 'text'],
                ['corpus_balance', 'Corpus Balance (₹)', 'number'],
                ['total_paid', 'Total Paid (₹)', 'number'],
                ['total_deducted', 'Total Deducted (₹)', 'number'],
                ['github_username', 'GitHub Username', 'text'],
                ['cricheroes_player_id', 'CricHeroes Player ID', 'text'],
                ['cricheroes_name', 'CricHeroes Name', 'text'],
                ['notes', 'Notes', 'text'],
              ].map(([field, label, type]) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    type={type}
                    value={editing[field] ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  />
                </div>
              ))}

              <div>
                <label className="label">Player Type</label>
                <select className="input" value={editing.type} onChange={e => setEditing(p => ({ ...p, type: e.target.value }))}>
                  <option value="corpus">💰 Corpus</option>
                  <option value="ppm">💵 PPM</option>
                  <option value="new">🆕 New</option>
                  <option value="guest">👤 Guest</option>
                </select>
              </div>

              {editing.type === 'guest' && (
                <>
                  <div>
                    <label className="label">Guest Fee Mode</label>
                    <select className="input" value={editing.guest_fee_mode ?? 'free'} onChange={e => setEditing(p => ({ ...p, guest_fee_mode: e.target.value }))}>
                      <option value="free">Free — fee waived</option>
                      <option value="pay_self">Pay Self — guest pays directly</option>
                      <option value="sponsored">Sponsored — deduct from inviter's corpus</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Sponsored By (optional)</label>
                    <select
                      className="input"
                      value={editing.sponsored_by_player_id ?? ''}
                      onChange={e => setEditing(p => ({ ...p, sponsored_by_player_id: e.target.value || null }))}
                    >
                      <option value="">— None —</option>
                      {players.filter(p => p.status === 'active' && p.type !== 'guest' && p.id !== editing.id).map(p => (
                        <option key={p.id} value={p.id}>{p.display_name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
