import { format, parseISO } from 'date-fns'

const TYPE_LABEL = { corpus: 'Corpus', ppm: 'PPM', guest: 'Guest', new: 'New' }
const TYPE_COLOR = {
  corpus: 'bg-orange-50 text-orange-700',
  ppm:    'bg-blue-50 text-blue-700',
  guest:  'bg-purple-50 text-purple-700',
  new:    'bg-gray-50 text-gray-600',
}

const EXPENSE_CATEGORY = {
  match_cost:     'Match Cost',
  ground_booking: 'Ground Booking',
  cricket_ball:   'Cricket Ball',
  cricket_bat:    'Cricket Bat',
  equipment:      'Equipment',
  refreshments:   'Refreshments',
  kit:            'Kit / Uniform',
  other:          'Other',
}

export default function MatchPlayersModal({ week, players, records, expenses, perfRows, onClose }) {
  if (!week) return null

  const played = records
    .filter(r => r.week_id === week.week_id && r.status === 'played')
    .map(r => players.find(p => p.id === r.player_id))
    .filter(Boolean)
    .sort((a, b) => {
      const order = { corpus: 0, new: 1, ppm: 2, guest: 3 }
      return (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.display_name.localeCompare(b.display_name)
    })

  const byType = played.reduce((acc, p) => {
    const t = p.type ?? 'corpus'
    ;(acc[t] = acc[t] ?? []).push(p)
    return acc
  }, {})

  const matchExpenses = (expenses ?? []).filter(e => e.week_id === week.week_id)
  const totalExpenses = matchExpenses.reduce((s, e) => s + e.amount, 0)

  const dateLabel   = format(parseISO(week.match_date), 'MMMM d, yyyy')
  const guestsCount = (byType.guest ?? []).length
  const payingCount = played.length - guestsCount

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900">🏏 {dateLabel}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {week.venue?.split(',')[0]}
              {week.cricheroes_match_ids?.length > 1 && ` · ${week.cricheroes_match_ids.length} games`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5 text-lg leading-none">✕</button>
        </div>

        {/* Summary stats */}
        <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b border-gray-100 bg-gray-50">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Players</div>
            <div className="font-bold text-gray-900">{played.length}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Match Fee</div>
            <div className="font-bold text-gray-900">₹{(week.match_fee ?? 0).toLocaleString('en-IN')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Total Cost</div>
            <div className="font-bold text-gray-900">
              ₹{(week.total_cost ?? totalExpenses ?? 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Match Stars */}
        {perfRows?.length > 0 && (() => {
          const playerById = Object.fromEntries(players.map(p => [p.id, p]))
          const stars = [
            { key: 'potm_count', emoji: '🏅', label: 'POTM' },
            { key: 'bba_count',  emoji: '🦇', label: 'Best Bat' },
            { key: 'bbo_count',  emoji: '🎳', label: 'Best Bowl' },
          ].map(({ key, emoji, label }) => {
            const top = perfRows.filter(p => p[key] > 0).sort((a, b) => b[key] - a[key])[0]
            return top ? { emoji, label, name: playerById[top.player_id]?.display_name ?? top.player_id } : null
          }).filter(Boolean)
          if (!stars.length) return null
          return (
            <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">Match Stars ✨</p>
              <div className="flex flex-wrap gap-2">
                {stars.map(({ emoji, label, name }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-1.5 shadow-sm border border-amber-100">
                    <span>{emoji}</span>
                    <div>
                      <div className="text-xs text-gray-400 leading-none">{label}</div>
                      <div className="text-sm font-bold text-gray-800 leading-tight">{name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        <div className="overflow-y-auto flex-1">
          {/* Expenses section */}
          {matchExpenses.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Expenses</p>
              <div className="space-y-1.5">
                {matchExpenses.map(e => (
                  <div key={e.id} className="flex items-start justify-between text-sm gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-700">{e.description || EXPENSE_CATEGORY[e.category] || e.category}</span>
                      {e.paid_by && (
                        <span className="text-xs text-gray-400 ml-1.5">· paid by {e.paid_by}</span>
                      )}
                    </div>
                    <span className="font-mono font-medium text-red-600 shrink-0">
                      −₹{e.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-1.5 mt-1">
                  <span className="text-gray-700">Total Expenses</span>
                  <span className="font-mono text-gray-900">₹{totalExpenses.toLocaleString('en-IN')}</span>
                </div>
                {played.length > 0 && week.match_fee > 0 && (
                  <div className="text-xs text-gray-400 text-right">
                    ₹{week.match_fee.toLocaleString('en-IN')} × {payingCount} fee-paying players
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Players section */}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Players</p>
              {guestsCount > 0 && (
                <span className="text-xs text-gray-400">
                  {payingCount} paying · <span className="text-purple-600">{guestsCount} guest{guestsCount > 1 ? 's' : ''}</span>
                </span>
              )}
            </div>
            {played.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No players recorded for this match.</p>
            ) : (
              ['corpus', 'new', 'ppm', 'guest'].map(type => {
                const group = byType[type]
                if (!group?.length) return null
                return (
                  <div key={type} className="mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{TYPE_LABEL[type]}</p>
                    <div className="space-y-0.5">
                      {group.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-gray-300 w-5 text-right shrink-0">{i + 1}.</span>
                          <span className="text-sm font-medium text-gray-800 flex-1">{p.display_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[type]}`}>
                            {TYPE_LABEL[type]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}
