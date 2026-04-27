import { format, parseISO } from 'date-fns'

const TYPE_LABEL = { corpus: 'Corpus', ppm: 'PPM', guest: 'Guest', new: 'New' }
const TYPE_COLOR = {
  corpus: 'bg-orange-50 text-orange-700',
  ppm:    'bg-blue-50 text-blue-700',
  guest:  'bg-purple-50 text-purple-700',
  new:    'bg-gray-50 text-gray-600',
}

export default function MatchPlayersModal({ week, players, records, onClose }) {
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

  const dateLabel = format(parseISO(week.match_date), 'MMMM d, yyyy')
  const guestsCount = (byType.guest ?? []).length
  const payingCount = played.length - guestsCount

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">🏏 {dateLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {week.venue?.split(',')[0]}
              {week.cricheroes_match_ids?.length > 1 && ` · ${week.cricheroes_match_ids.length} games`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">✕</button>
        </div>

        {/* Counts */}
        <div className="px-5 py-3 border-b border-gray-100 flex gap-4 text-xs text-gray-500">
          <span><strong className="text-gray-800 text-sm">{played.length}</strong> played</span>
          {guestsCount > 0 && (
            <span><strong className="text-gray-800 text-sm">{payingCount}</strong> fee-paying · <strong className="text-purple-700 text-sm">{guestsCount}</strong> guest{guestsCount > 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Player list */}
        <div className="overflow-y-auto flex-1 px-5 py-2">
          {played.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No players recorded for this match.</p>
          ) : (
            ['corpus', 'new', 'ppm', 'guest'].map(type => {
              const group = byType[type]
              if (!group?.length) return null
              return (
                <div key={type} className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{TYPE_LABEL[type]}</p>
                  <div className="space-y-1">
                    {group.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 py-1.5">
                        <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
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

        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}
