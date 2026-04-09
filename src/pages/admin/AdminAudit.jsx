import { useAuditLog } from '../../hooks/useData'
import { PageSpinner } from '../../components/ui/Spinner'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'

const ACTION_ICON = {
  add_player: '👥+', edit_player: '👥✏️', remove_player: '👥✕',
  add_transaction: '💳+', edit_transaction: '💳✏️', delete_transaction: '💳✕',
  add_expense: '🧾+', edit_expense: '🧾✏️',
  mark_attendance: '📅', bulk_attendance: '📅📋', sync_attendance: '🔄',
  add_guest: '👤+', edit_guest: '👤✏️',
  close_tournament: '🏆✕', start_tournament: '🏆+',
  edit_config: '⚙️',
}

export default function AdminAudit() {
  const { data, isLoading } = useAuditLog()
  const [search, setSearch] = useState('')

  if (isLoading) return <PageSpinner />

  const entries = (data?.entries ?? []).filter(e =>
    !search || e.actor.includes(search) || e.summary.includes(search) || e.action.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <input className="input w-48 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {entries.length === 0 ? (
        <div className="card text-center text-gray-400 py-10">No audit entries yet.</div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {entries.map(e => (
            <div key={e.id} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xl mt-0.5">{ACTION_ICON[e.action] ?? '📋'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800 text-sm">{e.summary}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{e.action}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  by <strong className="text-gray-500">@{e.actor}</strong>
                  {' · '}{format(parseISO(e.timestamp), 'MMM d, yyyy HH:mm')}
                </div>
                {(e.before || e.after) && (
                  <details className="mt-1">
                    <summary className="text-xs text-blue-500 cursor-pointer">View changes</summary>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                      {e.before && (
                        <div className="bg-red-50 rounded p-2 font-mono text-red-700 overflow-auto max-h-20">
                          <div className="font-semibold mb-1">Before</div>
                          {JSON.stringify(e.before, null, 2)}
                        </div>
                      )}
                      {e.after && (
                        <div className="bg-green-50 rounded p-2 font-mono text-green-700 overflow-auto max-h-20">
                          <div className="font-semibold mb-1">After</div>
                          {JSON.stringify(e.after, null, 2)}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
