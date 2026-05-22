import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWeeks, usePlayers, useAttendance, useConfig, useLeaderboard } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import { format, parseISO } from 'date-fns'
import { IconUsers, IconTrophy, IconMedal, IconStar, IconBallBowling, IconMapPin, IconShare } from '@tabler/icons-react'

const _parseWinner = result => {
  const m = (result ?? '').match(/^(.+?)\s+(\d+)-(\d+)$/)
  if (!m) return ''
  return parseInt(m[2]) !== parseInt(m[3]) ? m[1].trim() : ''
}

const STAR_CONFIG = [
  { key: 'potm_count', Icon: IconMedal,      label: 'POTM' },
  { key: 'bba_count',  Icon: IconStar,        label: 'Best bat' },
  { key: 'bbo_count',  Icon: IconBallBowling, label: 'Best bowl' },
]

export default function Timeline() {
  const [detail, setDetail] = useState(null)

  const { data: cfg }    = useConfig()
  const { data: pData, isLoading } = usePlayers()
  const { data: wData }  = useWeeks()
  const { data: aData }  = useAttendance()
  const { data: perfData } = useLeaderboard(cfg?.active_tournament_id)

  if (isLoading) return <PageSpinner />

  const players    = pData?.players ?? []
  const records    = aData?.records ?? []
  const activeTId  = cfg?.active_tournament_id
  const allPerfs   = perfData?.performances ?? []

  const sessions = (wData?.weeks ?? [])
    .filter(w => w.tournament_id === activeTId && w.status === 'completed')
    .sort((a, b) => b.match_date.localeCompare(a.match_date))

  const venueCounts = {}
  sessions.forEach(w => {
    const v = (w.venue ?? '').split(',')[0].trim() || 'Other'
    venueCounts[v] = (venueCounts[v] || 0) + 1
  })
  const topVenues = Object.entries(venueCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const expenses = []
  const playerById = Object.fromEntries(players.map(p => [p.id, p]))
  const detailWeek = detail ? sessions.find(w => w.week_id === detail) : null

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12 pt-6">
      <div className="flex items-center gap-3 mb-3">
        <Link to="/" className="text-gray-400 hover:text-gray-200 text-sm">← Home</Link>
        <span className="text-gray-600">|</span>
        <div>
          <h1 className="text-[22px] font-medium text-gray-100">Season timeline</h1>
          <p className="text-xs text-gray-400">{sessions.length} week{sessions.length !== 1 ? 's' : ''} · {cfg?.team_name ?? ''}</p>
        </div>
      </div>

      {topVenues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {topVenues.map(([venue, count]) => (
            <span key={venue} className="inline-flex items-center gap-1 text-xs text-gray-400 bg-white/[0.04] rounded-full px-2.5 py-1">
              <IconMapPin size={11} />
              {venue} ×{count}
            </span>
          ))}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-medium text-gray-300">No sessions yet</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/[0.08]" />
          <div className="space-y-4">
            {sessions.map((w, idx) => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              const winner = w.winning_team || _parseWinner(w.result)
              const sessionPerfs = allPerfs.filter(p => p.week_id === w.week_id)

              const stars = STAR_CONFIG.map(({ key, Icon, label }) => {
                const top = sessionPerfs.filter(p => p[key] > 0).sort((a, b) => b[key] - a[key])[0]
                return top ? { Icon, label, name: playerById[top.player_id]?.display_name ?? top.player_id } : null
              }).filter(Boolean)

              return (
                <div key={w.week_id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-medium border-2
                    ${idx === 0 ? 'bg-[#10b981] border-[#10b981] text-white' : 'bg-white/[0.04] border-white/[0.15] text-gray-400'}`}>
                    {format(parseISO(w.match_date), 'd')}
                  </div>

                  {/* Card */}
                  <div
                    className="flex-1 bg-white/[0.02] rounded-xl border border-white/[0.06] hover:border-white/[0.15] transition-colors cursor-pointer mb-1"
                    onClick={() => setDetail(w.week_id)}
                  >
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-100 text-sm">
                            {format(parseISO(w.match_date), 'EEEE, MMM d, yyyy')}
                          </p>
                          {w.venue && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <IconMapPin size={11} />
                              {w.venue.split(',')[0]}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {w.result && (
                            <span className="text-xs font-medium text-[#10b981] bg-[rgba(16,185,129,0.08)] px-2 py-0.5 rounded">
                              {w.result}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 bg-white/[0.04] px-2 py-0.5 rounded flex items-center gap-1">
                            <IconUsers size={11} />
                            {played}
                          </span>
                          <button
                            title="Share on WhatsApp"
                            onClick={e => {
                              e.stopPropagation()
                              const venue = (w.venue ?? '').split(',')[0]
                              const date  = format(parseISO(w.match_date), 'MMM d, yyyy')
                              const potmNames = sessionPerfs
                                .filter(p => p.potm_count > 0)
                                .sort((a, b) => b.potm_count - a.potm_count)
                                .map(p => playerById[p.player_id]?.display_name).filter(Boolean).join(', ')
                              const lines = [
                                `${date}${venue ? ` · ${venue}` : ''}`,
                                winner ? `${winner} won` : (w.result || ''),
                                potmNames ? `POTM: ${potmNames}` : '',
                                `${played} players`,
                              ].filter(Boolean).join('\n')
                              window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
                            }}
                            className="text-gray-300 hover:text-[#1D9E75] transition-colors leading-none p-0.5"
                          >
                            <IconShare size={13} />
                          </button>
                        </div>
                      </div>

                      {winner && (
                        <p className="text-xs text-[#10b981] font-medium mt-1.5 flex items-center gap-1">
                          <IconTrophy size={12} />
                          {winner.split(' ')[0]} won
                        </p>
                      )}

                      {stars.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/[0.06]">
                          {stars.map(({ Icon, label, name }) => (
                            <div key={label} className="flex items-center gap-1 text-xs text-gray-300">
                              <Icon size={12} className="text-amber-500 shrink-0" />
                              <span className="text-gray-400">{label}:</span>
                              <span className="font-medium">{name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {detailWeek && (
        <MatchPlayersModal
          week={detailWeek}
          players={players}
          records={records}
          expenses={expenses}
          perfRows={allPerfs.filter(p => p.week_id === detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
