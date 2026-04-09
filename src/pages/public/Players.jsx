import { useState } from 'react'
import { usePlayers } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { typeEmoji, typeLabel } from '../../utils/balanceCalculator'

const TYPES = ['all', 'corpus', 'ppm', 'new', 'guest']

export default function Players() {
  const { data, isLoading } = usePlayers()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  if (isLoading) return <PageSpinner />

  const players = (data?.players ?? []).filter(p => p.status === 'active')
  const visible = players.filter(p => {
    const matchType   = filter === 'all' || p.type === filter
    const matchSearch = p.display_name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900">Player Roster</h1>
        <div className="flex items-center gap-2">
          <input
            className="input w-44 text-sm"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === t ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'all' ? 'All' : `${typeEmoji(t)} ${typeLabel(t)}`}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Player</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No players found.</td></tr>
            ) : visible.map((p, i) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.display_name}</td>
                <td className="px-4 py-3 text-gray-500">
                  <span className="mr-1">{typeEmoji(p.type)}</span>{typeLabel(p.type)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-800">
                  {p.type === 'ppm' ? 'PPM' : `₹${(p.corpus_balance ?? 0).toLocaleString('en-IN')}`}
                </td>
                <td className="px-4 py-3 text-center">
                  <BalanceBadge status={p.balance_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
          Showing {visible.length} of {players.length} players
        </div>
      </div>
    </div>
  )
}
