import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWeeks, usePlayers, useAttendance, useConfig } from '../../hooks/useData'
import { writeWeeks, writeAttendance, writeTransactions, writePlayers } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus, generateId, typeEmoji } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'
import { useTransactions } from '../../hooks/useData'

export default function AdminWeeks() {
  const qc = useQueryClient()
  const { data: wData, isLoading } = useWeeks()
  const { data: pData } = usePlayers()
  const { data: aData } = useAttendance()
  const { data: tData } = useTransactions()
  const { data: cfg }   = useConfig()
  const [selected, setSelected] = useState(null) // week_id being edited
  const [showNew, setShowNew] = useState(false)
  const [newWeek, setNewWeek] = useState({ match_date: '', venue: '', match_fee: cfg?.default_match_fee ?? 500, notes: '' })
  const [saving, setSaving] = useState(false)

  if (isLoading) return <PageSpinner />

  const weeks    = (wData?.weeks ?? []).sort((a,b) => b.match_date.localeCompare(a.match_date))
  const players  = (pData?.players ?? []).filter(p => p.status === 'active')
  const records  = aData?.records ?? []
  const transactions = tData?.transactions ?? []
  const activeTId    = cfg?.active_tournament_id ?? 'TRN_001'

  const selectedWeek = weeks.find(w => w.week_id === selected)
  const weekRecords  = records.filter(r => r.week_id === selected)
  const attendanceMap = Object.fromEntries(weekRecords.map(r => [r.player_id, r.status]))

  function toggleStatus(playerId) {
    const cur = attendanceMap[playerId] ?? 'absent'
    attendanceMap[playerId] = cur === 'played' ? 'absent' : 'played'
  }

  async function saveAttendance(week) {
    setSaving(true)
    try {
      const existingOther = records.filter(r => r.week_id !== week.week_id)
      const newRecords = players.map(p => ({
        id: `ATT_${p.id}_${week.week_id}`,
        player_id: p.id,
        week_id: week.week_id,
        tournament_id: activeTId,
        status: attendanceMap[p.id] ?? 'absent',
        source: 'admin',
        fee_deducted: false,
      }))
      await writeAttendance([...existingOther, ...newRecords], `Attendance for ${week.label}`)

      // Auto-deduct if configured
      if (cfg?.auto_deduct_on_sync) {
        const playedPlayers = players.filter(p => attendanceMap[p.id] === 'played')
        const newTxns = playedPlayers.map(p => ({
          id: generateId('TXN', transactions.map(t => t.id)) + '_' + p.id,
          player_id: p.id, tournament_id: activeTId,
          type: 'match_deduction', amount: week.match_fee,
          direction: 'debit', date: week.match_date, week_id: week.week_id,
          description: `Match fee - ${week.label}`, recorded_by: 'admin', receipt_ref: '',
        }))
        const updatedPlayers = players.map(p => {
          if (attendanceMap[p.id] !== 'played' || p.type === 'ppm') return p
          const bal = (p.corpus_balance ?? 0) - week.match_fee
          return { ...p, corpus_balance: bal, balance_status: calcBalanceStatus(bal, cfg) }
        })
        await writeTransactions([...transactions, ...newTxns], 'mark_attendance', week.week_id, `Match deductions for ${week.label}`, null, null)
        await writePlayers(updatedPlayers, 'bulk_attendance', week.week_id, `Balances updated for ${week.label}`, null, null)
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['players'] })
      }

      qc.invalidateQueries({ queryKey: ['attendance'] })
      setSelected(null)
      showToast('Attendance saved and deductions applied')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function addWeek() {
    if (!newWeek.match_date) { showToast('Match date required', 'error'); return }
    setSaving(true)
    try {
      const id = `W_${newWeek.match_date.replace(/-/g, '_')}`
      const week = {
        week_id: id, tournament_id: activeTId,
        match_date: newWeek.match_date, label: format(parseISO(newWeek.match_date), 'MMM d'),
        venue: newWeek.venue, match_fee: parseFloat(newWeek.match_fee) || 500,
        status: 'scheduled', cricheroes_match_id: null,
        team_a: '', team_b: '', result: '', players_count: 0, notes: newWeek.notes,
      }
      await writeWeeks([...wData.weeks, week], 'add_week', `Added match ${week.label}`)
      qc.invalidateQueries({ queryKey: ['weeks'] })
      setShowNew(false)
      showToast('Match week added')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Matches</h1>
        <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ Add Match</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Venue</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Played</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {weeks.map(w => {
              const played = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              return (
                <tr key={w.week_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{format(parseISO(w.match_date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{w.venue?.split(',')[0] || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{played}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      w.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {w.cricheroes_match_id ? '🔗 CricHeroes' : '✍️ Manual'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setSelected(w.week_id)} className="text-blue-600 hover:underline text-xs">
                      Attendance
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Attendance editor */}
      {selected && selectedWeek && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Attendance — {format(parseISO(selectedWeek.match_date), 'MMM d, yyyy')}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-2 flex gap-2">
              <button onClick={() => players.forEach(p => { attendanceMap[p.id] = 'played' })} className="btn-secondary text-xs py-1">Mark All Present</button>
              <button onClick={() => players.forEach(p => { attendanceMap[p.id] = 'absent' })} className="btn-secondary text-xs py-1">Mark All Absent</button>
            </div>
            <AttendanceList players={players} attendanceMap={attendanceMap} onToggle={toggleStatus} />
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => saveAttendance(selectedWeek)} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Confirm & Deduct'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add match modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Add Match Week</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div><label className="label">Match Date</label><input className="input" type="date" value={newWeek.match_date} onChange={e => setNewWeek(p => ({ ...p, match_date: e.target.value }))} /></div>
              <div><label className="label">Venue</label><input className="input" value={newWeek.venue} onChange={e => setNewWeek(p => ({ ...p, venue: e.target.value }))} /></div>
              <div><label className="label">Match Fee (₹)</label><input className="input" type="number" value={newWeek.match_fee} onChange={e => setNewWeek(p => ({ ...p, match_fee: e.target.value }))} /></div>
              <div><label className="label">Notes</label><input className="input" value={newWeek.notes} onChange={e => setNewWeek(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
              <button onClick={addWeek} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Add Match'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AttendanceList({ players, attendanceMap, onToggle }) {
  const [, rerender] = useState(0)
  return (
    <div className="px-6 py-2 divide-y divide-gray-100 max-h-80 overflow-y-auto">
      {players.map(p => {
        const status = attendanceMap[p.id] ?? 'absent'
        return (
          <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-800">{typeEmoji(p.type)} {p.display_name}</span>
            <button
              onClick={() => { onToggle(p.id); rerender(n => n + 1) }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                status === 'played'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {status === 'played' ? '✅ Played' : '❌ Absent'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
