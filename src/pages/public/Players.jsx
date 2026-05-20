import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayers } from '../../hooks/useData'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { typeLabel } from '../../utils/balanceCalculator'

const TYPES = ['all', 'corpus', 'ppm', 'new']

function initials(name) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}
function avatarBg(name) {
  const colors = [
    'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700', 'bg-teal-100 text-teal-700', 'bg-indigo-100 text-indigo-700',
  ]
  return colors[(name.charCodeAt(0) || 0) % colors.length]
}

export default function Players() {
  const { data, isLoading } = usePlayers()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  if (isLoading) return <PageSpinner />

  const players = (data?.players ?? []).filter(p => p.status === 'active' && p.type !== 'guest')
  const visible = players.filter(p => {
    const matchType   = filter === 'all' || p.type === filter
    const matchSearch = p.display_name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div className="max-w-7xl mx-auto px-4 pb-12">

      {/* Hero */}
      <div className="rounded-xl mt-6 mb-6 bg-[#1D9E75] px-6 py-7 text-white">
        <h1 className="text-[22px] font-medium tracking-tight">Player roster</h1>
        <p className="text-white/70 text-sm mt-1">
          {players.filter(p => p.type === 'corpus' || p.type === 'new').length} corpus · {players.filter(p => p.type === 'ppm').length} PPM
        </p>
      </div>

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === t
                  ? 'bg-[#1D9E75] text-white'
                  : 'bg-white border border-[rgba(0,0,0,0.12)] text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t === 'all' ? 'All' : typeLabel(t)}
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
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead className="bg-[#F8F8F6] border-b border-[rgba(0,0,0,0.06)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] w-8">#</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Player</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] hidden sm:table-cell">Type</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Balance</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Status</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] hidden sm:table-cell">Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  No players found.
                </td>
              </tr>
            ) : visible.map((p, i) => (
              <tr key={p.id} className="hover:bg-[#F8F8F6] transition-colors group">
                <td className="px-4 py-3.5 text-gray-300 text-xs font-medium">{i + 1}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`avatar ${avatarBg(p.display_name)}`}>{initials(p.display_name)}</div>
                    <div>
                      <Link
                        to={`/pay/${p.id}`}
                        className="font-medium text-gray-900 group-hover:text-[#1D9E75] transition-colors"
                      >
                        {p.display_name}
                      </Link>
                      <div className="sm:hidden text-xs text-gray-400 mt-0.5">
                        {typeLabel(p.type)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 hidden sm:table-cell">
                  <span className="text-xs font-medium text-gray-500 bg-[#F4F3F0] rounded-full px-2.5 py-1">
                    {typeLabel(p.type)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-medium text-gray-800">
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
                <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                  {p.type !== 'ppm' && (
                    <Link
                      to={`/pay/${p.id}`}
                      className="text-xs px-2.5 py-1 bg-[#E1F5EE] text-[#1D9E75] border border-[#1D9E75]/20 rounded-full hover:bg-[#1D9E75] hover:text-white transition-colors font-medium"
                    >
                      Top up
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2.5 text-xs text-gray-400 bg-[#F8F8F6] border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <span>Showing {visible.length} of {players.length} players</span>
          {visible.length < players.length && (
            <button onClick={() => { setFilter('all'); setSearch('') }} className="text-[#1D9E75] hover:underline font-medium">
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
