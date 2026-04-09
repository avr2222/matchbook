import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMapping, usePlayers } from '../../hooks/useData'
import { writeCricHeroesMapping } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'

const CONFIDENCE_CLASS = c => c >= 0.85 ? 'text-green-600' : c >= 0.5 ? 'text-yellow-600' : 'text-red-500'
const CONFIDENCE_LABEL = c => c >= 0.85 ? '✅ Auto' : c >= 0.5 ? '🟡 Review' : '🔴 Manual'

export default function AdminMapping() {
  const qc = useQueryClient()
  const { data: mapData, isLoading } = useMapping()
  const { data: pData } = usePlayers()
  const [saving, setSaving] = useState(false)
  const [localMap, setLocalMap] = useState(null)

  if (isLoading) return <PageSpinner />

  const mapping = localMap ?? mapData
  if (!mapping) return null

  const players = pData?.players ?? []
  const mappings = mapping.player_mappings ?? []
  const unmatched = mapping.unmatched ?? []

  function updateMapping(cricheroes_player_id, player_id) {
    setLocalMap(prev => {
      const m = prev ?? mapData
      return {
        ...m,
        player_mappings: m.player_mappings.map(e =>
          e.cricheroes_player_id === cricheroes_player_id
            ? { ...e, player_id, confirmed: !!player_id, match_method: 'manual_remap' }
            : e
        ),
      }
    })
  }

  function assignUnmatched(cricheroes_player_id, cricheroes_name, player_id) {
    setLocalMap(prev => {
      const m = prev ?? mapData
      const exists = m.player_mappings.find(e => e.cricheroes_player_id === cricheroes_player_id)
      const newEntry = { cricheroes_player_id, cricheroes_name, player_id: player_id || null, match_confidence: 0, match_method: 'manual_remap', confirmed: !!player_id }
      return {
        ...m,
        player_mappings: exists
          ? m.player_mappings.map(e => e.cricheroes_player_id === cricheroes_player_id ? newEntry : e)
          : [...m.player_mappings, newEntry],
        unmatched: m.unmatched.filter(u => u.cricheroes_player_id !== cricheroes_player_id),
      }
    })
  }

  async function save() {
    setSaving(true)
    try {
      await writeCricHeroesMapping(localMap, 'Manual mapping update')
      qc.invalidateQueries({ queryKey: ['ch_mapping'] })
      setLocalMap(null)
      showToast('Mapping saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">CricHeroes Player Mapping</h1>
        {localMap && (
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="card border-l-4 border-yellow-400">
          <h2 className="font-semibold text-gray-800 mb-3">⚠️ Unmatched Players ({unmatched.length})</h2>
          <div className="divide-y divide-gray-100">
            {unmatched.map(u => (
              <div key={u.cricheroes_player_id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-gray-800">{u.cricheroes_name}</div>
                  <div className="text-xs text-gray-400">ID: {u.cricheroes_player_id}</div>
                </div>
                <select
                  className="input w-44 text-sm"
                  defaultValue=""
                  onChange={e => assignUnmatched(u.cricheroes_player_id, u.cricheroes_name, e.target.value)}
                >
                  <option value="">Assign to player…</option>
                  {players.filter(p=>p.status==='active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  <option value="__new_guest">+ Create as new guest</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">CricHeroes Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mapped To</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Confidence</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Remap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.map(m => {
              const player = players.find(p => p.id === m.player_id)
              return (
                <tr key={m.cricheroes_player_id} className={`hover:bg-gray-50 ${!m.confirmed ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{m.cricheroes_name}</div>
                    <div className="text-xs text-gray-400">ID: {m.cricheroes_player_id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{player?.display_name ?? <span className="text-gray-400">—</span>}</td>
                  <td className={`px-4 py-3 text-center text-xs font-medium ${CONFIDENCE_CLASS(m.match_confidence)}`}>
                    {CONFIDENCE_LABEL(m.match_confidence)} ({Math.round(m.match_confidence * 100)}%)
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      className="input w-36 text-xs"
                      value={m.player_id ?? ''}
                      onChange={e => updateMapping(m.cricheroes_player_id, e.target.value || null)}
                    >
                      <option value="">— unassign —</option>
                      {players.filter(p=>p.status==='active').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
