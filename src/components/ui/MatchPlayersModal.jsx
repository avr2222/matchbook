import { format, parseISO } from 'date-fns'
import { IconX, IconCricket, IconMedal, IconStar, IconBallBowling } from '@tabler/icons-react'

const TYPE_LABEL = { corpus: 'Corpus', ppm: 'PPM', guest: 'Guest', new: 'New' }
const TYPE_COLOR = {
  corpus: 'bg-orange-900/30 text-orange-300',
  ppm:    'bg-purple-900/30 text-purple-300',
  guest:  'bg-white/[0.06] text-gray-400',
  new:    'bg-white/[0.04] text-gray-400',
}

const EXPENSE_CATEGORY = {
  match_cost:     'Match cost',
  ground_booking: 'Ground booking',
  cricket_ball:   'Cricket ball',
  cricket_bat:    'Cricket bat',
  equipment:      'Equipment',
  refreshments:   'Refreshments',
  kit:            'Kit / uniform',
  other:          'Other',
}

const STAR_CONFIG = [
  { key: 'potm_count', Icon: IconMedal,      label: 'POTM' },
  { key: 'bba_count',  Icon: IconStar,       label: 'Best bat' },
  { key: 'bbo_count',  Icon: IconBallBowling, label: 'Best bowl' },
]

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
      <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <IconCricket size={16} className="text-[#10b981] shrink-0" />
              <h2 className="font-medium text-gray-100">{dateLabel}</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {week.venue?.split(',')[0]}
              {week.cricheroes_match_ids?.length > 1 && ` · ${week.cricheroes_match_ids.length} games`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 mt-0.5">
            <IconX size={16} />
          </button>
        </div>

        {/* Summary stats */}
        <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b border-white/[0.06] bg-white/[0.03]">
          <div className="text-center">
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mb-0.5">Players</div>
            <div className="font-medium text-gray-100 text-[15px]">{played.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mb-0.5">Match fee</div>
            <div className="font-medium text-gray-100 text-[15px]">₹{(week.match_fee ?? 0).toLocaleString('en-IN')}</div>
          </div>
          <div className="text-center">
            <div className="text-[11px] text-gray-400 uppercase tracking-[0.05em] mb-0.5">Total cost</div>
            <div className="font-medium text-gray-100 text-[15px]">
              ₹{(week.total_cost ?? totalExpenses ?? 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Match Stars */}
        {perfRows?.length > 0 && (() => {
          const playerById = Object.fromEntries(players.map(p => [p.id, p]))
          const stars = STAR_CONFIG.map(({ key, Icon, label }) => {
            const winners = perfRows.filter(p => p[key] > 0).sort((a, b) => b[key] - a[key])
            if (!winners.length) return null
            const names = winners.map(p => {
              const nm = playerById[p.player_id]?.display_name ?? p.player_id
              return p[key] > 1 ? `${nm} ×${p[key]}` : nm
            }).join(', ')
            return { Icon, label, names }
          }).filter(Boolean)
          if (!stars.length) return null
          return (
            <div className="px-5 py-3 border-b border-white/[0.06] bg-amber-900/10">
              <p className="text-[11px] font-medium text-amber-400 uppercase tracking-[0.05em] mb-2">Match stars</p>
              <div className="flex flex-wrap gap-2">
                {stars.map(({ Icon, label, names }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-white/[0.04] rounded-lg px-3 py-1.5 border border-amber-700/20">
                    <Icon size={14} className="text-amber-500 shrink-0" />
                    <div>
                      <div className="text-[10px] text-gray-400 leading-none">{label}</div>
                      <div className="text-sm font-medium text-gray-100 leading-tight">{names}</div>
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
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">Expenses</p>
              <div className="space-y-1.5">
                {matchExpenses.map(e => (
                  <div key={e.id} className="flex items-start justify-between text-sm gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-300">{e.description || EXPENSE_CATEGORY[e.category] || e.category}</span>
                      {e.paid_by && (
                        <span className="text-xs text-gray-400 ml-1.5">· paid by {e.paid_by}</span>
                      )}
                    </div>
                    <span className="font-mono font-medium text-red-600 shrink-0">
                      −₹{e.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium border-t border-white/[0.06] pt-1.5 mt-1">
                  <span className="text-gray-400">Total expenses</span>
                  <span className="font-mono text-gray-100">₹{totalExpenses.toLocaleString('en-IN')}</span>
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
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Players</p>
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
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">{TYPE_LABEL[type]}</p>
                    <div className="space-y-0.5">
                      {group.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-2 py-1.5">
                          <span className="text-xs text-gray-300 w-5 text-right shrink-0">{i + 1}.</span>
                          <span className="text-sm font-medium text-gray-100 flex-1">{p.display_name}</span>
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

        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}
