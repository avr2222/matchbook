import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { usePlayers, useConfig, useTransactions, useAttendance, useWeeks, useExpenses } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import BalanceBadge from '../../components/ui/BalanceBadge'
import { PageSpinner } from '../../components/ui/Spinner'
import { writePlayers, writeTransactions } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { typeEmoji, typeLabel, generateId, calcBalanceStatus } from '../../utils/balanceCalculator'
import { format, parseISO } from 'date-fns'
import ConfirmModal from '../../components/ui/ConfirmModal'

const fmt = n => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function PlayerHistoryModal({ player, allTxns, attendance, weeks, expenses, onClose }) {
  if (!player) return null

  const playerTxns = allTxns
    .filter(t => t.player_id === player.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const matchDeductions = attendance
    .filter(r => r.player_id === player.id && r.status === 'played' && r.fee_deducted)
    .map(r => {
      const week = weeks.find(w => w.week_id === r.week_id)
      if (!week) return null
      return { date: week.match_date, kind: 'debit', amount: week.match_fee ?? 0, label: `Match fee — ${format(parseISO(week.match_date), 'EEE, MMM d, yyyy')}` }
    })
    .filter(Boolean)

  const isCorpus = player.type === 'corpus' || player.type === 'new'
  const expenseDeductions = isCorpus ? expenses.filter(e => {
    const split = e.split_among ?? e.distribution
    if (split === 'all_corpus' || split === 'all_active' || split === 'corpus_pool') return true
    if (split === 'all_played' || split === 'week_present') {
      return attendance.some(r => r.player_id === player.id && r.week_id === e.week_id && r.status === 'played')
    }
    return false
  }).map(e => ({
    date: e.date,
    kind: 'debit',
    amount: +(e.share_per_player ?? e.per_player_amount ?? 0),
    label: `Expense share — ${e.description}`,
  })) : []

  const timeline = [
    ...playerTxns.map(t => ({
      date: t.date,
      kind: t.direction === 'credit' ? 'credit' : 'debit',
      amount: t.amount,
      label: t.description || 'Corpus Payment',
    })),
    ...matchDeductions,
    ...expenseDeductions,
  ].sort((a, b) => b.date.localeCompare(a.date))

  const matchesPlayed = attendance.filter(r => r.player_id === player.id && r.status === 'played').length

  return (
    <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
          <div>
            <h2 className="font-medium text-white text-lg">{player.display_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <BalanceBadge status={player.balance_status} />
              <span className="text-xs text-gray-500">{typeLabel(player.type)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="px-6 py-3 bg-white/[0.04] grid grid-cols-3 gap-3 border-b border-white/[0.06] shrink-0">
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">Balance</div>
            <div className={`font-medium text-sm ${(player.corpus_balance ?? 0) < 0 ? 'text-red-600' : 'text-white'}`}>₹{fmt(player.corpus_balance)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">Total paid in</div>
            <div className="font-medium text-sm text-[#10b981]">₹{fmt(player.total_paid)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">Matches played</div>
            <div className="font-medium text-sm text-gray-200">{matchesPlayed}</div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-white/[0.05]">
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No transaction history found.</p>
          ) : timeline.map((entry, i) => (
            <div key={i} className="px-6 py-3 flex items-center justify-between text-sm">
              <div>
                <div className="text-gray-100">{entry.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{format(parseISO(entry.date), 'MMM d, yyyy')}</div>
              </div>
              <div className={`font-mono font-medium shrink-0 ml-4 ${entry.kind === 'credit' ? 'text-[#10b981]' : 'text-red-500'}`}>
                {entry.kind === 'credit' ? '+' : '−'}₹{entry.amount.toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-white/[0.06] shrink-0 text-right">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

const EMPTY = {
  display_name: '', type: 'corpus', status: 'active', joined_date: new Date().toISOString().slice(0,10),
  phone: '', corpus_balance: 0, total_paid: 0, total_deducted: 0, balance_status: 'good',
  github_username: '', cricheroes_player_id: '', cricheroes_name: '', guest_fee_mode: null,
  sponsored_by_player_id: null, notes: '',
}

const TYPE_TABS = ['all', 'corpus', 'ppm', 'new', 'guest', 'inactive']

function similarName(a, b) {
  const norm = s => s.toLowerCase().replace(/\s+/g, '')
  const na = norm(a), nb = norm(b)
  if (na === nb) return true
  if (na.length < 3 || nb.length < 3) return false
  // simple bigram overlap
  const bigrams = s => new Set([...Array(s.length - 1)].map((_, i) => s.slice(i, i + 2)))
  const ba = bigrams(na), bb = bigrams(nb)
  const intersection = [...ba].filter(x => bb.has(x)).length
  const union = new Set([...ba, ...bb]).size
  return union > 0 && intersection / union >= 0.6
}

export default function AdminPlayers() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading }     = usePlayers()
  const { data: cfg }           = useConfig()
  const { data: tData }         = useTransactions()
  const { data: aData }         = useAttendance()
  const { data: wData }         = useWeeks()
  const { data: eData }         = useExpenses()
  const isAdmin                 = useIsAdmin()
  const [copiedId, setCopiedId] = useState(null)
  const [editing, setEditing]   = useState(null)
  const [detail, setDetail]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [typeTab, setTypeTab]   = useState('all')
  const [confirmData, setConfirmData] = useState(null)
  const [cashModal, setCashModal]     = useState(null)
  const [cashAmount, setCashAmount]   = useState('')
  const [cashDesc, setCashDesc]       = useState('')
  const [selected, setSelected]       = useState(new Set())

  useEffect(() => {
    if (searchParams.get('new') === '1' && data) {
      const players = data?.players ?? []
      setEditing({ ...EMPTY, id: generateId('PLY', players.map(p => p.id)) })
      setSearchParams({}, { replace: true })
    }
  }, [data])

  useEffect(() => { setSelected(new Set()) }, [typeTab])

  if (isLoading) return <PageSpinner />

  const players = data?.players ?? []

  const visible = players.filter(p => {
    const matchesSearch = p.display_name.toLowerCase().includes(search.toLowerCase())
    const matchesTab =
      typeTab === 'all'      ? p.status === 'active' :
      typeTab === 'inactive' ? p.status === 'inactive' :
                               p.type === typeTab && p.status === 'active'
    return matchesSearch && matchesTab
  })

  const tabCounts = {
    all:      players.filter(p => p.status === 'active').length,
    corpus:   players.filter(p => p.type === 'corpus'  && p.status === 'active').length,
    ppm:      players.filter(p => p.type === 'ppm'     && p.status === 'active').length,
    new:      players.filter(p => p.type === 'new'     && p.status === 'active').length,
    guest:    players.filter(p => p.type === 'guest'   && p.status === 'active').length,
    inactive: players.filter(p => p.status === 'inactive').length,
  }

  function openNew() {
    setEditing({ ...EMPTY, id: generateId('PLY', players.map(p => p.id)) })
  }

  function openEdit(p) { setEditing({ ...p }) }

  // Duplicate name warning: similar names among active players excluding the player being edited
  const dupWarning = editing?.display_name?.trim().length >= 2
    ? players.filter(p => p.status === 'active' && p.id !== editing.id && similarName(p.display_name, editing.display_name))
    : []

  async function save() {
    if (!editing.display_name.trim()) { showToast('Display name is required', 'error'); return }
    setSaving(true)
    try {
      const isNew   = !players.find(p => p.id === editing.id)
      const before  = players.find(p => p.id === editing.id) ?? null
      editing.balance_status = (editing.type === 'ppm' || editing.type === 'guest')
        ? 'good'
        : calcBalanceStatus(editing.corpus_balance, cfg ?? {
            corpus_overdue_threshold: 0, corpus_urgent_threshold: 500, corpus_low_threshold: 1000,
          })
      const updated = isNew
        ? [...players, editing]
        : players.map(p => p.id === editing.id ? editing : p)
      await writePlayers(
        updated,
        isNew ? 'add_player' : 'edit_player',
        editing.id,
        `${isNew ? 'Added' : 'Updated'} player ${editing.display_name}`,
        before, editing,
      )
      qc.invalidateQueries({ queryKey: ['players'] })
      setEditing(null)
      showToast(`Player ${isNew ? 'added' : 'updated'} successfully`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deactivatePlayer(player, withWithdrawal) {
    setSaving(true)
    try {
      if (withWithdrawal) {
        const balance = player.corpus_balance ?? 0
        if (balance > 0) {
          const txnId = `TXN_WITHDRAW_${player.id}_${Date.now()}`
          await writeTransactions(
            [{
              id: txnId,
              player_id: player.id,
              tournament_id: cfg?.active_tournament_id ?? null,
              type: 'corpus_withdrawal',
              direction: 'debit',
              amount: balance,
              date: new Date().toISOString().slice(0, 10),
              description: `Corpus returned on deactivation`,
              recorded_by: 'admin',
              receipt_ref: '',
            }],
            'corpus_withdrawal', player.id,
            `Corpus withdrawal ₹${balance} for ${player.display_name} on deactivation`,
            null, null,
          )
        }
      }
      const updated = players.map(p => p.id === player.id ? { ...p, status: 'inactive' } : p)
      await writePlayers(updated, 'remove_player', player.id, `Deactivated ${player.display_name}`, player, { ...player, status: 'inactive' })
      qc.invalidateQueries({ queryKey: ['players'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      showToast(`${player.display_name} deactivated${withWithdrawal ? ' & balance returned' : ''}`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function remove(player) {
    const balance = player.corpus_balance ?? 0
    const hasBalance = (player.type === 'corpus' || player.type === 'new') && balance > 0

    if (hasBalance) {
      setConfirmData({
        message: `${player.display_name} has a corpus balance of ₹${balance.toLocaleString('en-IN')}.\n\nReturn this balance (record a withdrawal) before deactivating?`,
        confirmLabel: 'Return Balance & Deactivate',
        cancelLabel: 'Deactivate Without Returning',
        danger: true,
        onConfirm: () => deactivatePlayer(player, true),
        onCancel: () => deactivatePlayer(player, false),
      })
    } else {
      setConfirmData({
        message: `Remove ${player.display_name}? This will mark them inactive.`,
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => deactivatePlayer(player, false),
      })
    }
  }

  function bulkDeactivate() {
    const names = [...selected].map(id => players.find(p => p.id === id)?.display_name ?? id).join(', ')
    setConfirmData({
      message: `Deactivate ${selected.size} player${selected.size > 1 ? 's' : ''}? (${names})`,
      confirmLabel: 'Deactivate All',
      danger: true,
      onConfirm: async () => {
        setSaving(true)
        try {
          const updated = players.map(p => selected.has(p.id) ? { ...p, status: 'inactive' } : p)
          await writePlayers(updated, 'remove_player', null, `Bulk deactivated ${selected.size} players: ${names}`, null, null)
          qc.invalidateQueries({ queryKey: ['players'] })
          setSelected(new Set())
          showToast(`${selected.size} player${selected.size > 1 ? 's' : ''} deactivated`)
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  async function saveCashPayment() {
    const { player } = cashModal
    const amount = parseFloat(cashAmount)
    if (!amount || amount <= 0) return
    const allTxns = tData?.transactions ?? []
    const txnId   = generateId('TXN', allTxns.map(t => t.id))
    const newTxn  = {
      id: txnId,
      player_id: player.id,
      tournament_id: cfg?.active_tournament_id ?? null,
      type: 'ppm_payment',
      amount,
      direction: 'credit',
      date: new Date().toISOString().slice(0, 10),
      week_id: null,
      description: cashDesc.trim() || 'Cash payment received',
      recorded_by: 'admin',
      receipt_ref: '',
    }
    setSaving(true)
    try {
      await writeTransactions(
        [...allTxns, newTxn], 'add_transaction', txnId,
        `Cash payment for ${player.display_name} ₹${amount}`, null, newTxn,
      )
      qc.invalidateQueries({ queryKey: ['transactions'] })
      showToast(`Cash payment of ₹${amount.toLocaleString('en-IN')} recorded for ${player.display_name}`)
      setCashModal(null)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const sponsorName = (id) => players.find(p => p.id === id)?.display_name ?? id

  function sharePayLink(playerId) {
    const base = window.location.href.split('#')[0]
    const url  = `${base}#/pay/${playerId}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(playerId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-medium text-white">Players</h1>
        {isAdmin && <button onClick={openNew} className="btn-primary text-sm">+ Add Player</button>}
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TYPE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setTypeTab(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeTab === tab
                ? 'bg-[#10b981] text-white'
                : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1 opacity-70">({tabCounts[tab]})</span>
          </button>
        ))}
        <input
          className="input ml-auto w-44 text-sm"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="flex items-center gap-3 bg-red-900/10 border border-red-700/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-300 font-medium flex-1">{selected.size} player{selected.size > 1 ? 's' : ''} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          <button onClick={bulkDeactivate} className="btn-danger text-sm py-1 px-3">
            Deactivate Selected ({selected.size})
          </button>
        </div>
      )}

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] border-b border-white/[0.06]">
            <tr>
              {isAdmin && (
                <th className="pl-4 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={visible.filter(p => p.status === 'active').length > 0 && visible.filter(p => p.status === 'active').every(p => selected.has(p.id))}
                    onChange={e => {
                      const activeIds = visible.filter(p => p.status === 'active').map(p => p.id)
                      setSelected(e.target.checked ? new Set(activeIds) : new Set())
                    }}
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Player</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Type</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Balance</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] hidden sm:table-cell">Paid</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] hidden sm:table-cell">Deducted</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Status</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] hidden sm:table-cell">GitHub</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-4 py-8 text-center text-gray-400 text-sm">No players found.</td>
              </tr>
            )}
            {visible.map(p => (
              <tr key={p.id} className={`hover:bg-white/[0.03] ${p.status === 'inactive' ? 'opacity-40' : ''} ${selected.has(p.id) ? 'bg-red-900/10' : ''}`}>
                {isAdmin && (
                  <td className="pl-4 py-3 w-8">
                    {p.status === 'active' && (
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.has(p.id)}
                        onChange={e => {
                          const next = new Set(selected)
                          e.target.checked ? next.add(p.id) : next.delete(p.id)
                          setSelected(next)
                        }}
                      />
                    )}
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-white">
                  <button
                    onClick={() => setDetail(p)}
                    className="font-medium text-white hover:text-[#10b981] hover:underline text-left"
                  >
                    {p.display_name}
                  </button>
                  {p.type === 'guest' && p.sponsored_by_player_id && (
                    <div className="text-xs text-purple-600 mt-0.5">
                      Sponsored by {sponsorName(p.sponsored_by_player_id)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{typeLabel(p.type)}</td>
                <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                  {p.type === 'ppm'
                    ? (p.corpus_balance < 0
                        ? <span className="text-red-600 font-medium">₹{fmt(Math.abs(p.corpus_balance))} owed</span>
                        : <span className="text-gray-400">PPM</span>)
                    : `₹${fmt(p.corpus_balance)}`}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[#10b981] whitespace-nowrap hidden sm:table-cell">
                  ₹{fmt(p.total_paid)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-red-500 whitespace-nowrap hidden sm:table-cell">
                  ₹{fmt(p.total_deducted)}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.type === 'ppm'
                    ? (p.corpus_balance < 0
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/20 text-red-300">₹{fmt(Math.abs(p.corpus_balance))} pending</span>
                        : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.08)] text-[#10b981]">✓ Paid</span>)
                    : <BalanceBadge status={p.balance_status} />}
                </td>
                <td className="px-4 py-3 text-center text-gray-400 text-xs hidden sm:table-cell">{p.github_username || '—'}</td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {(p.type === 'corpus' || p.type === 'new') && (
                    <button
                      onClick={() => sharePayLink(p.id)}
                      className="text-[#10b981] hover:underline text-xs mr-3"
                      title="Copy pay link"
                    >
                      {copiedId === p.id ? '✓ Copied' : 'Pay link'}
                    </button>
                  )}
                  {isAdmin ? (
                    <>
                      {(p.type === 'ppm' || p.type === 'guest') && p.status === 'active' && (
                        <button
                          onClick={() => { setCashModal({ player: p }); setCashAmount(String(cfg?.default_match_fee ?? '')); setCashDesc('') }}
                          className="text-xs text-[#10b981] border border-[#10b981]/20 rounded-lg px-2 py-1 hover:bg-[rgba(16,185,129,0.08)] transition-colors mr-3"
                          title="Record cash payment"
                        >
                          Cash
                        </button>
                      )}
                      <button onClick={() => openEdit(p)} className="text-gray-500 hover:text-[#10b981] hover:underline text-xs mr-3">Edit</button>
                      {p.status === 'active' && (
                        <button onClick={() => remove(p)} className="text-red-500 hover:underline text-xs">Remove</button>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {/* Cash payment modal for PPM/Guest players */}
      {cashModal && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] max-w-sm w-full p-6">
            <h3 className="font-medium text-white mb-4">Record cash payment — {cashModal.player.display_name}</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Amount (₹)</label>
                <input
                  type="number"
                  className="input"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="500"
                  min="0"
                />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={cashDesc}
                  onChange={e => setCashDesc(e.target.value)}
                  placeholder="Cash payment received"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setCashModal(null)} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={saveCashPayment}
                disabled={saving || !cashAmount || parseFloat(cashAmount) <= 0}
                className="btn-primary text-sm"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add modal — admin only */}
      {editing && isAdmin && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1e18] rounded-xl border border-white/[0.1] w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/[0.06] flex justify-between items-center">
              <h2 className="font-medium text-white">
                {players.find(p => p.id === editing.id) ? 'Edit player' : 'Add player'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {/* Name field with duplicate warning */}
              <div>
                <label className="label">Display Name</label>
                <input
                  className="input"
                  type="text"
                  value={editing.display_name}
                  onChange={e => setEditing(prev => ({ ...prev, display_name: e.target.value }))}
                />
                {dupWarning.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    Similar name already exists: {dupWarning.map(p => p.display_name).join(', ')}
                  </p>
                )}
              </div>

              {[
                ['phone', 'Phone', 'text'],
                ['corpus_balance', 'Corpus Balance (₹)', 'number'],
                ['total_paid', 'Total Paid (₹)', 'number'],
                ['total_deducted', 'Total Deducted (₹)', 'number'],
                ['github_username', 'GitHub Username', 'text'],
                ['cricheroes_player_id', 'CricHeroes Player ID', 'text'],
                ['cricheroes_name', 'CricHeroes Name', 'text'],
                ['notes', 'Notes', 'text'],
              ].map(([field, label, type]) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    type={type}
                    value={editing[field] ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  />
                </div>
              ))}

              <div>
                <label className="label">Player Type</label>
                <select className="input" value={editing.type} onChange={e => setEditing(p => ({ ...p, type: e.target.value }))}>
                  <option value="corpus">Corpus</option>
                  <option value="ppm">PPM</option>
                  <option value="new">New</option>
                  <option value="guest">Guest</option>
                </select>
              </div>

              {editing.type === 'guest' && (
                <>
                  <div>
                    <label className="label">Guest Fee Mode</label>
                    <select className="input" value={editing.guest_fee_mode ?? 'free'} onChange={e => setEditing(p => ({ ...p, guest_fee_mode: e.target.value }))}>
                      <option value="free">Free — fee waived</option>
                      <option value="pay_self">Pay Self — guest pays directly</option>
                      <option value="sponsored">Sponsored — deduct from inviter's corpus</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Sponsored By (optional)</label>
                    <select
                      className="input"
                      value={editing.sponsored_by_player_id ?? ''}
                      onChange={e => setEditing(p => ({ ...p, sponsored_by_player_id: e.target.value || null }))}
                    >
                      <option value="">— None —</option>
                      {players.filter(p => p.status === 'active' && p.type !== 'guest' && p.id !== editing.id).map(p => (
                        <option key={p.id} value={p.id}>{p.display_name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PlayerHistoryModal
        player={detail}
        allTxns={tData?.transactions ?? []}
        attendance={aData?.records ?? []}
        weeks={wData?.weeks ?? []}
        expenses={eData?.expenses ?? []}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
