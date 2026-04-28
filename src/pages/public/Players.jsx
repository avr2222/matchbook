import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { typeEmoji, typeLabel } from '../../utils/balanceCalculator'

const TYPES = ['all', 'corpus', 'ppm', 'new']

export default function Players() {
  const { data, isLoading } = usePlayers()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  if (isLoading) return <PageSpinner />

  // Guests are transient/auto-created — exclude from the public roster
  const players = (data?.players ?? []).filter(p => p.status === 'active' && p.type !== 'guest')
  const visible = players.filter(p => {
    const matchType   = filter === 'all' || p.type === filter
    const matchSearch = p.display_name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl mt-6 mb-6 bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 px-6 py-8 text-white shadow-xl">
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[140px] leading-none flex items-center justify-end pr-4">👥</div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Player Roster</h1>
        <p className="text-slate-300 text-sm mt-1">{players.length} active players</p>
      </div>

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center justify-between">
        {/* Type filter pills */}
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all duration-150 ${
                filter === t
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {t === 'all' ? 'All' : `${typeEmoji(t)} ${typeLabel(t)}`}
            </button>
          ))}
        </div>
        <input
          className="input w-full sm:w-44 text-sm"
          placeholder="Search player…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">🔍</div>
                  No players found.
                </td>
              </tr>
            ) : visible.map((p, i) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-3.5 text-gray-300 text-xs font-medium">{i + 1}</td>
                <td className="px-4 py-3.5">
                  <Link
                    to={`/pay/${p.id}`}
                    className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors"
                  >
                    {p.display_name}
                  </Link>
                  <div className="sm:hidden text-xs text-gray-400 mt-0.5">
                    {typeEmoji(p.type)} {typeLabel(p.type)}
                  </div>
                </td>
                <td className="px-4 py-3.5 hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                    <span>{typeEmoji(p.type)}</span>
                    <span>{typeLabel(p.type)}</span>
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-800">
                  {p.type === 'ppm'
                    ? <span className="text-xs text-gray-400 font-sans">PPM</span>
                    : `₹${(p.corpus_balance ?? 0).toLocaleString('en-IN')}`
                  }
                </td>
                <td className="px-4 py-3.5 text-center">
                  <Link to={`/pay/${p.id}`}>
                    <BalanceBadge status={p.balance_status} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span>Showing {visible.length} of {players.length} players</span>
          {visible.length < players.length && (
            <button onClick={() => { setFilter('all'); setSearch('') }} className="text-green-600 hover:underline font-medium">
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
