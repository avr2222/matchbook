import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWeeks, usePlayers, useAttendance, useConfig, useTransactions, useExpenses } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useCanWrite } from '../../hooks/useCanWrite'
import { writeWeeks, deleteWeekById, writeAttendance, writeTransactions, writePlayers, softDeleteTransactions } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { calcBalanceStatus, typeEmoji } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'
import MatchPlayersModal from '../../components/ui/MatchPlayersModal'
import ConfirmModal from '../../components/ui/ConfirmModal'

export default function AdminWeeks() {
  const qc = useQueryClient()
  const { data: wData, isLoading } = useWeeks()
  const { data: pData }  = usePlayers()
  const { data: aData }  = useAttendance()
  const { data: tData }  = useTransactions()
  const { data: cfg }    = useConfig()
  const { data: eData }  = useExpenses()

  const isAdmin   = useIsAdmin()
  const canWrite  = useCanWrite()
  const [selected, setSelected]           = useState(null)
  const [attendanceMap, setAttendanceMap] = useState({})
  const [deductFromMap, setDeductFromMap] = useState({})
  const [totalMatchCost, setTotalMatchCost] = useState(0)
  const [freePlayerIds, setFreePlayerIds]   = useState(new Set())
  const [ppmPaidIds, setPpmPaidIds]         = useState(new Set())
  const [reapplyDeductions, setReapplyDeductions] = useState(false)
  const [detail, setDetail]               = useState(null)
  const [showNew, setShowNew]             = useState(false)
  const [newWeek, setNewWeek]             = useState({
    match_date: '', venue: '', match_fee: cfg?.default_match_fee ?? 4688,
    total_cost: '', expected_players: '', notes: '',
  })
  const [saving, setSaving]   = useState(false)
  const [editResult, setEditResult] = useState(null)
  const [confirmData, setConfirmData] = useState(null)
  const [resultForm, setResultForm] = useState({ result: '', team_a: '', team_b: '' })

  if (isLoading) return <PageSpinner />

  const weeks        = (wData?.weeks ?? []).sort((a, b) => b.match_date.localeCompare(a.match_date))
  const players      = (pData?.players ?? []).filter(p => p.status === 'active')
  const corpusPlayers = players.filter(p => p.type === 'corpus' || p.type === 'new')
  const records      = aData?.records ?? []
  const transactions = tData?.transactions ?? []
  const expenses     = eData?.expenses ?? []
  const activeTId    = cfg?.active_tournament_id ?? 'TRN_001'
  const selectedWeek = weeks.find(w => w.week_id === selected)

  function openAttendance(weekId) {
    const week = weeks.find(w => w.week_id === weekId)
    const weekRecords = records.filter(r => r.week_id === weekId)
    const init = Object.fromEntries(weekRecords.map(r => [r.player_id, r.status]))
    // deductFromMap: only store overrides (non-self); empty string means "deduct from self"
    const deductInit = Object.fromEntries(
      weekRecords.filter(r => r.sponsor_player_id).map(r => [r.player_id, r.sponsor_player_id])
    )
    // Pre-fill total cost from existing match_deduction transactions for this week
    const existingDeductionTotal = transactions
      .filter(t => t.week_id === weekId && t.type === 'match_deduction')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0)
    const playedCount = weekRecords.filter(r => r.status === 'played').length
    const prefillCost = existingDeductionTotal > 0
      ? Math.round(existingDeductionTotal)
      : (week?.match_fee && playedCount > 0 ? Math.round(week.match_fee * playedCount) : 0)

    // Pre-fill ppmPaidIds from existing match_deduction txns for PPM players
    const ppmPlayers = new Set(players.filter(p => p.type === 'ppm').map(p => p.id))
    const ppmAlreadyPaid = new Set(
      transactions
        .filter(t => t.week_id === weekId && t.type === 'match_deduction' && ppmPlayers.has(t.player_id))
        .map(t => t.player_id)
    )

    setAttendanceMap(init)
    setDeductFromMap(deductInit)
    setTotalMatchCost(prefillCost)
    setFreePlayerIds(new Set())
    setPpmPaidIds(ppmAlreadyPaid)
    setReapplyDeductions(false)
    setSelected(weekId)
  }

  function toggleStatus(playerId) {
    setAttendanceMap(prev => ({
      ...prev,
      [playerId]: (prev[playerId] ?? 'absent') === 'played' ? 'absent' : 'played',
    }))
  }

  function toggleFree(playerId) {
    setFreePlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  function openResultEditor(w) {
    setResultForm({ result: w.result ?? '', team_a: w.team_a ?? '', team_b: w.team_b ?? '' })
    setEditResult(w.week_id)
  }

  function recalcFee(cost, players) {
    const c = parseFloat(cost)
    const p = parseInt(players, 10)
    if (c > 0 && p > 0) setNewWeek(f => ({ ...f, match_fee: Math.round(c / p) }))
  }

  async function saveResult() {
    setSaving(true)
    try {
      const updated = weeks.map(w =>
        w.week_id === editResult ? { ...w, ...resultForm } : w
      )
      await writeWeeks(updated, 'edit_week', `Updated result for ${weeks.find(w => w.week_id === editResult)?.label}`)
      qc.invalidateQueries({ queryKey: ['weeks'] })
      setEditResult(null)
      showToast('Match result saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function deleteWeek(week) {
    setConfirmData({
      message: `Delete match on ${format(parseISO(week.match_date), 'MMM d, yyyy')}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setSaving(true)
        try {
          // CASCADE on attendance + guest_visits — no need to delete them manually
          await deleteWeekById(week.week_id, week.label)
          qc.invalidateQueries({ queryKey: ['weeks'] })
          qc.invalidateQueries({ queryKey: ['attendance'] })
          showToast('Match week deleted')
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  async function saveAttendance(week) {
    setSaving(true)
    try {
      const total = parseFloat(totalMatchCost) || 0
      const played = players.filter(p => attendanceMap[p.id] === 'played')
      const paidPlayers = played.filter(p => p.type !== 'ppm' && !freePlayerIds.has(p.id))
      const perPlayerFee = paidPlayers.length > 0 ? total / paidPlayers.length : 0

      // Store computed per-player fee in week record
      if (perPlayerFee > 0 && Math.abs(perPlayerFee - week.match_fee) > 0.01) {
        await writeWeeks(
          weeks.map(w => w.week_id === week.week_id ? { ...w, match_fee: Math.round(perPlayerFee * 100) / 100 } : w),
          'edit_week', `Updated match fee for ${week.label}`
        )
        qc.invalidateQueries({ queryKey: ['weeks'] })
      }

      const existingOther = records.filter(r => r.week_id !== week.week_id)
      const newRecords = players.map(p => {
        const chargeId = deductFromMap[p.id] || null  // null = self (default)
        const rec = {
          id: `ATT_${p.id}_${week.week_id}`,
          player_id: p.id, week_id: week.week_id,
          tournament_id: activeTId,
          status: attendanceMap[p.id] ?? 'absent',
          source: 'admin', fee_deducted: false,
          // store override for any player type (guest or corpus with a sponsor)
          sponsor_player_id: chargeId,
        }
        return rec
      })
      await writeAttendance([...existingOther, ...newRecords], `Attendance for ${week.label}`)
      qc.invalidateQueries({ queryKey: ['attendance'] })

      const existingDeductTxns = transactions.filter(
        t => t.week_id === week.week_id && t.type === 'match_deduction'
      )
      const alreadyDeducted = existingDeductTxns.length > 0

      const shouldApply = cfg?.auto_deduct_on_sync && (!alreadyDeducted || reapplyDeductions)

      if (shouldApply) {
        const allPlayers = pData?.players ?? []

        // If reapplying, delete old deduction transactions first
        if (reapplyDeductions && alreadyDeducted) {
          await softDeleteTransactions(
            existingDeductTxns.map(t => t.id),
            `Re-apply deductions for ${week.label}`
          )
        }

        // Corpus/new/guest deductions (same as before)
        const balanceChanges = {}
        played.forEach(p => {
          if (p.type === 'ppm') return
          if (freePlayerIds.has(p.id)) return
          const chargeId = deductFromMap[p.id] || p.id
          if (p.type === 'guest' && !deductFromMap[p.id]) return
          balanceChanges[chargeId] = (balanceChanges[chargeId] ?? 0) + perPlayerFee
        })

        const corpusTxns = Object.entries(balanceChanges).map(([playerId, amount]) => {
          const sponsoredGuests = played.filter(p => p.type === 'guest' && (deductFromMap[p.id] || '') === playerId)
          const hasOverride     = played.some(p => p.id !== playerId && (deductFromMap[p.id] || '') === playerId)
          const desc = [
            `Match fee - ${week.label}`,
            hasOverride || sponsoredGuests.length > 0 ? `(incl. guest/proxy)` : '',
          ].filter(Boolean).join(' ')
          return {
            id: `TXN_DEDUCT_${week.week_id}_${playerId}`,
            player_id: playerId, tournament_id: activeTId,
            type: 'match_deduction', amount: Math.round(amount * 100) / 100,
            direction: 'debit', date: week.match_date, week_id: week.week_id,
            description: desc, recorded_by: 'admin', receipt_ref: '',
          }
        })

        // PPM players who were marked as paid — record payment but don't touch corpus balance
        const ppmTxns = played
          .filter(p => p.type === 'ppm' && ppmPaidIds.has(p.id))
          .map(p => ({
            id: `TXN_DEDUCT_${week.week_id}_${p.id}`,
            player_id: p.id, tournament_id: activeTId,
            type: 'match_deduction', amount: Math.round(perPlayerFee * 100) / 100,
            direction: 'debit', date: week.match_date, week_id: week.week_id,
            description: `Match fee - ${week.label} (cash)`,
            recorded_by: 'admin', receipt_ref: '',
          }))

        const newTxns = [...corpusTxns, ...ppmTxns]

        const updatedPlayers = allPlayers.map(p => {
          const deductAmount = balanceChanges[p.id]
          if (!deductAmount) return p
          const bal = (p.corpus_balance ?? 0) - deductAmount
          return { ...p, corpus_balance: Math.round(bal * 100) / 100, balance_status: calcBalanceStatus(bal, cfg) }
        })

        // Upsert only the new/updated transactions (don't re-upsert entire history)
        await writeTransactions(newTxns, 'mark_attendance', week.week_id, `Match deductions for ${week.label}`, null, null)
        await writePlayers(updatedPlayers, 'bulk_attendance', week.week_id, `Balances updated for ${week.label}`, null, null)
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['players'] })
        showToast(reapplyDeductions ? 'Deductions re-applied with updated attendance' : 'Attendance saved and deductions applied')
      } else {
        showToast(alreadyDeducted ? 'Attendance updated (deductions already applied)' : 'Attendance saved')
      }
      setSelected(null)
      setDeductFromMap({})
      setFreePlayerIds(new Set())
      setPpmPaidIds(new Set())
      setReapplyDeductions(false)
      setTotalMatchCost(0)
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
      const existingIds = new Set((wData?.weeks ?? []).map(w => w.week_id))
      const baseId = `W_${newWeek.match_date.replace(/-/g, '_')}`
      let id = baseId
      let counter = 2
      while (existingIds.has(id)) id = `${baseId}_${counter++}`

      const week = {
        week_id: id, tournament_id: activeTId,
        match_date: newWeek.match_date,
        label: format(parseISO(newWeek.match_date), 'MMM d'),
        venue: newWeek.venue,
        match_fee: parseFloat(newWeek.match_fee) || 500,
        status: 'scheduled', cricheroes_match_id: null,
        team_a: '', team_b: '', result: '',
        players_count: 0, notes: newWeek.notes,
      }
      await writeWeeks([...wData.weeks, week], 'add_week', `Added match ${week.label}`)
      qc.invalidateQueries({ queryKey: ['weeks'] })
      setShowNew(false)
      setNewWeek({ match_date: '', venue: '', match_fee: cfg?.default_match_fee ?? 4688, total_cost: '', expected_players: '', notes: '' })
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
        {isAdmin && <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ Add Match</button>}
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Venue / Teams</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Played</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {weeks.map(w => {
              const played         = records.filter(r => r.week_id === w.week_id && r.status === 'played').length
              const weekExps       = expenses.filter(e => e.week_id === w.week_id)
              const totalCost      = weekExps.reduce((s, e) => s + e.amount, 0)
              const deductionTotal = transactions
                .filter(t => t.week_id === w.week_id && t.type === 'match_deduction')
                .reduce((s, t) => s + (t.amount ?? 0), 0)
              return (
                <tr
                  key={w.week_id}
                  className={`hover:bg-gray-50 transition-colors ${w.status === 'completed' ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={() => w.status === 'completed' && setDetail(w.week_id)}
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {format(parseISO(w.match_date), 'MMM d, yyyy')}
                    {w.result && <div className="text-xs text-green-600 font-medium mt-0.5">{w.result}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    <div>{w.venue?.split(',')[0] || '—'}</div>
                    {w.team_a && w.team_b && (
                      <div className="text-gray-400">{w.team_a} vs {w.team_b}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {w.status === 'completed' ? (
                      <div>
                        <span className="text-green-700 font-semibold">{played}</span>
                        {weekExps.length > 0 ? (
                          <div className="text-xs text-red-400 mt-0.5">₹{totalCost.toLocaleString('en-IN')}</div>
                        ) : deductionTotal > 0 ? (
                          <div className="text-xs text-blue-400 mt-0.5">₹{Math.round(deductionTotal).toLocaleString('en-IN')}</div>
                        ) : null}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      w.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {w.cricheroes_match_id ? '🔗 CricHeroes' : '✍️ Manual'}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {canWrite && (
                        <button onClick={() => openAttendance(w.week_id)} className="text-blue-600 hover:underline text-xs font-medium">
                          Attendance
                        </button>
                      )}
                      {isAdmin && w.status === 'scheduled' && (
                        <button onClick={() => deleteWeek(w)} className="text-red-500 hover:underline text-xs font-medium">
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Match detail modal — expenses + players */}
      <MatchPlayersModal
        week={weeks.find(w => w.week_id === detail)}
        players={players}
        records={records}
        expenses={expenses}
        onClose={() => setDetail(null)}
      />

      {/* Result editor */}
      {editResult && isAdmin && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <h2 className="font-semibold">Match Result</h2>
              <button onClick={() => setEditResult(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Team A</label>
                <input className="input" value={resultForm.team_a} onChange={e => setResultForm(f => ({ ...f, team_a: e.target.value }))} placeholder="e.g. Team Alpha" />
              </div>
              <div>
                <label className="label">Team B</label>
                <input className="input" value={resultForm.team_b} onChange={e => setResultForm(f => ({ ...f, team_b: e.target.value }))} placeholder="e.g. Team Bravo" />
              </div>
              <div>
                <label className="label">Result</label>
                <input className="input" value={resultForm.result} onChange={e => setResultForm(f => ({ ...f, result: e.target.value }))} placeholder="e.g. Team Alpha won by 15 runs" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setEditResult(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveResult} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance editor */}
      {selected && selectedWeek && canWrite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <div>
                <h2 className="font-semibold">Attendance — {format(parseISO(selectedWeek.match_date), 'MMM d, yyyy')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedWeek.label}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Total match cost — auto-divided among paid players */}
            <div className="px-6 py-3 border-b border-gray-100">
              <label className="label text-xs">Total Match Cost (₹) — split among paid players</label>
              <input
                className="input text-sm"
                type="number" min="0"
                value={totalMatchCost || ''}
                placeholder="e.g. 10000"
                onChange={e => setTotalMatchCost(e.target.value)}
              />
            </div>

            <div className="px-6 py-2 flex gap-2">
              <button onClick={() => setAttendanceMap(Object.fromEntries(players.map(p => [p.id, 'played'])))} className="btn-secondary text-xs py-1">Mark All</button>
              <button onClick={() => setAttendanceMap(Object.fromEntries(players.map(p => [p.id, 'absent'])))} className="btn-secondary text-xs py-1">Clear All</button>
            </div>
            <AttendanceList
              players={players}
              attendanceMap={attendanceMap}
              onToggle={toggleStatus}
              corpusPlayers={corpusPlayers}
              deductFromMap={deductFromMap}
              onDeductFromChange={(playerId, chargeId) =>
                setDeductFromMap(m => ({ ...m, [playerId]: chargeId }))
              }
              freePlayerIds={freePlayerIds}
              onToggleFree={toggleFree}
              ppmPaidIds={ppmPaidIds}
              onTogglePpmPaid={id => setPpmPaidIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
            />
            <div className="px-6 py-4 border-t border-gray-100">
              {(() => {
                const total = parseFloat(totalMatchCost) || 0
                const paidCount = players.filter(p => attendanceMap[p.id] === 'played' && p.type !== 'ppm' && !freePlayerIds.has(p.id)).length
                const freeCount = players.filter(p => attendanceMap[p.id] === 'played' && p.type !== 'ppm' && freePlayerIds.has(p.id)).length
                const perPlayer = paidCount > 0 ? total / paidCount : 0
                const alreadyDeducted = transactions.some(
                  t => t.week_id === selectedWeek?.week_id && t.type === 'match_deduction'
                )
                return (
                  <>
                    {total > 0 && paidCount > 0 && (
                      <p className="text-xs text-gray-500 mb-3">
                        ₹{total.toFixed(0)} ÷ {paidCount} paid{freeCount > 0 ? ` (${freeCount} free)` : ''} = ₹{perPlayer.toFixed(0)}/player
                      </p>
                    )}
                    {alreadyDeducted && (
                      <label className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={reapplyDeductions}
                          onChange={e => setReapplyDeductions(e.target.checked)}
                          className="accent-amber-600"
                        />
                        Re-apply deductions — deletes existing charges and recalculates from current attendance
                      </label>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setSelected(null)} className="btn-secondary">Cancel</button>
                      <button onClick={() => saveAttendance(selectedWeek)} disabled={saving} className="btn-primary">
                        {saving ? 'Saving…' : reapplyDeductions ? 'Re-apply & Save' : alreadyDeducted ? 'Update Attendance' : 'Confirm & Deduct'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {/* Add match modal */}
      {showNew && isAdmin && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <h2 className="font-semibold">Add Match Week</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Match Date</label>
                <input className="input" type="date" value={newWeek.match_date} onChange={e => setNewWeek(f => ({ ...f, match_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Venue</label>
                <input className="input" value={newWeek.venue} onChange={e => setNewWeek(f => ({ ...f, venue: e.target.value }))} />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">Fee Calculator (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Total Cost (₹)</label>
                    <input
                      className="input text-sm"
                      type="number" min="0"
                      value={newWeek.total_cost}
                      onChange={e => {
                        setNewWeek(f => ({ ...f, total_cost: e.target.value }))
                        recalcFee(e.target.value, newWeek.expected_players)
                      }}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Players</label>
                    <input
                      className="input text-sm"
                      type="number" min="1"
                      value={newWeek.expected_players}
                      onChange={e => {
                        setNewWeek(f => ({ ...f, expected_players: e.target.value }))
                        recalcFee(newWeek.total_cost, e.target.value)
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Match Fee per Player (₹)</label>
                <input
                  className="input"
                  type="number"
                  value={newWeek.match_fee}
                  onChange={e => setNewWeek(f => ({ ...f, match_fee: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={newWeek.notes} onChange={e => setNewWeek(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
              <button onClick={addWeek} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Add Match'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AttendanceList({ players, attendanceMap, onToggle, corpusPlayers, deductFromMap, onDeductFromChange, freePlayerIds, onToggleFree, ppmPaidIds, onTogglePpmPaid }) {
  const guestPlayers   = players.filter(p => p.type === 'guest')
  const regularPlayers = players.filter(p => p.type !== 'guest')

  const renderPlayer = (p) => {
    const status    = attendanceMap[p.id] ?? 'absent'
    const isGuest   = p.type === 'guest'
    const isCorpus  = p.type === 'corpus' || p.type === 'new'
    const isPPM     = p.type === 'ppm'
    const chargeId  = deductFromMap?.[p.id] ?? ''

    return (
      <div key={p.id} className={`py-2.5 ${isGuest ? 'bg-purple-50/50' : ''}`}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-800">{typeEmoji(p.type)} {p.display_name}</span>
          <button
            onClick={() => onToggle(p.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              status === 'played'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
          >
            {status === 'played' ? '✅ Played' : 'Absent'}
          </button>
        </div>

        {/* PPM: Paid? toggle */}
        {status === 'played' && isPPM && (
          <div className="mt-1.5 ml-6">
            <button
              onClick={() => onTogglePpmPaid(p.id)}
              className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-colors ${
                ppmPaidIds?.has(p.id)
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              {ppmPaidIds?.has(p.id) ? '💵 Paid (cash)' : '💵 Mark as Paid?'}
            </button>
          </div>
        )}

        {/* Free toggle + Deduct-from selector: shown for played non-PPM players */}
        {status === 'played' && !isPPM && (
          <div className="mt-1.5 ml-6 flex items-center gap-2 flex-wrap">
            {(isCorpus || isGuest) && (
              <button
                onClick={() => onToggleFree(p.id)}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                  freePlayerIds?.has(p.id)
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {freePlayerIds?.has(p.id) ? 'Free' : 'Free?'}
              </button>
            )}
            {!freePlayerIds?.has(p.id) && (
              <>
                <span className={`text-xs font-medium ${isGuest ? 'text-purple-500' : 'text-blue-500'}`}>
                  {isGuest ? 'Fee charged to:' : 'Deduct from:'}
                </span>
                <select
                  className="input text-xs py-1 w-48"
                  value={chargeId}
                  onChange={e => onDeductFromChange(p.id, e.target.value)}
                >
                  {isCorpus && <option value="">Self ({p.display_name})</option>}
                  {isGuest  && <option value="">Guest pays directly</option>}
                  {corpusPlayers
                    .filter(cp => cp.id !== p.id)
                    .map(cp => (
                      <option key={cp.id} value={cp.id}>{cp.display_name}</option>
                    ))
                  }
                </select>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-6 py-2 divide-y divide-gray-100 max-h-96 overflow-y-auto">
      {regularPlayers.map(renderPlayer)}
      {guestPlayers.length > 0 && (
        <>
          <div className="py-2 text-xs font-bold text-purple-500 uppercase tracking-widest">
            Guests
          </div>
          {guestPlayers.map(renderPlayer)}
        </>
      )}
    </div>
  )
}
