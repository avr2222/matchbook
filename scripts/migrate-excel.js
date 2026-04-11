/**
 * Excel → JSON Migration Script
 * Reads Cricket_Corpus_Tracker_v9.xlsx and generates all public/data/*.json files.
 *
 * Usage:
 *   node scripts/migrate-excel.js [path/to/file.xlsx]
 */

import pkg from 'xlsx'
const { readFile, utils } = pkg
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = join(__dirname, '..', 'public', 'data')
const XLSX_PATH  = process.argv[2] ?? join(__dirname, '..', 'Cricket_Corpus_Tracker_v9.xlsx')

function saveJson(filename, data) {
  const path = join(DATA_DIR, filename)
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`  Saved ${filename}`)
}

// Excel serial date → YYYY-MM-DD
function serialToDate(serial) {
  if (!serial || typeof serial !== 'number') return null
  const d = new Date((serial - 25569) * 86400 * 1000)
  return d.toISOString().slice(0, 10)
}

// Parse "Wk1  22-Feb-2026" → "2026-02-22"
function parseWeekLabel(label) {
  if (!label) return null
  const s = label.toString().trim()
  // try "DD-Mon-YYYY"
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/)
  if (m) {
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
    return `${m[3]}-${months[m[2]]}-${m[1].padStart(2,'0')}`
  }
  // try "YYYYMMDD" string
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // try serial stored as string
  const n = parseFloat(s)
  if (!isNaN(n) && n > 40000) return serialToDate(n)
  return null
}

function balanceStatus(balance) {
  if (balance <= 0)   return 'overdue'
  if (balance <= 250) return 'urgent'
  if (balance <= 500) return 'collect_soon'
  return 'good'
}

function normalizeType(raw) {
  const s = (raw ?? '').toString().toLowerCase().trim()
  if (s.includes('ppm') || s.includes('no-corpus') || s.includes('no corpus') ||
      s.includes('pay/match') || s.includes('pay per match') || s.includes('per match')) return 'ppm'
  if (s.includes('new') || s.includes('mid-season')) return 'new'
  if (s.includes('guest')) return 'guest'
  return 'corpus'
}

function run() {
  console.log(`\nMigrating: ${XLSX_PATH}\n`)
  mkdirSync(DATA_DIR, { recursive: true })

  const wb   = readFile(XLSX_PATH)
  const ws   = wb.Sheets['Weekly Tracker']
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null })

  // ── Parse week columns from Row 3 ───────────────────────────────────────
  const dateRow = rows[3] ?? []
  const weekColumns = []
  for (let c = 4; c < dateRow.length; c += 2) {
    const cell = dateRow[c]
    if (!cell) continue
    const label = cell.toString().trim()
    if (label.toLowerCase().includes('summary') || label.toLowerCase().includes('expense')) break
    const dateStr = parseWeekLabel(label)
    if (dateStr) {
      weekColumns.push({ col: c, dateStr, label: label.replace(/^Wk\d+\s+/, '').trim() })
    }
  }
  console.log(`Found ${weekColumns.length} match weeks: ${weekColumns.map(w => w.dateStr).join(', ')}`)

  // ── Parse Corpus Payments (credits) ─────────────────────────────────────
  const cpSheet = wb.Sheets['Corpus Payments']
  const cpRows  = utils.sheet_to_json(cpSheet, { header: 1, defval: null })
  // header is row 3, data starts row 4
  const paymentsByName = {}
  for (let i = 4; i < cpRows.length; i++) {
    const r = cpRows[i]
    if (!r || !r[1] || !r[2]) continue
    const name   = r[1].toString().trim()
    const amount = parseFloat(r[2]) || 0
    const date   = typeof r[0] === 'number' ? (serialToDate(r[0]) ?? '2026-02-22') : (r[0]?.toString().slice(0,10) ?? '2026-02-22')
    const type   = r[3]?.toString() ?? 'corpus_payment'
    if (!paymentsByName[name]) paymentsByName[name] = []
    paymentsByName[name].push({ amount, date, type })
  }
  console.log(`Found payments for ${Object.keys(paymentsByName).length} players`)

  // ── Parse PPM Payments ───────────────────────────────────────────────────
  const ppmSheet = wb.Sheets['PPM Payments']
  const ppmRows  = ppmSheet ? utils.sheet_to_json(ppmSheet, { header: 1, defval: null }) : []
  const ppmPaymentsByName = {}
  for (let i = 1; i < ppmRows.length; i++) {
    const r = ppmRows[i]
    if (!r || !r[1] || !r[2]) continue
    const name   = r[1].toString().trim()
    const amount = parseFloat(r[2]) || 0
    const date   = typeof r[0] === 'number' ? (serialToDate(r[0]) ?? '2026-02-22') : (r[0]?.toString().slice(0,10) ?? '2026-02-22')
    if (!ppmPaymentsByName[name]) ppmPaymentsByName[name] = []
    ppmPaymentsByName[name].push({ amount, date })
  }

  // ── Parse player rows (row 5 onwards) ───────────────────────────────────
  // NOTE: Attendance and match deductions are intentionally NOT imported here.
  // CricHeroes sync owns all attendance and deduction data.
  // Migration only imports: player profiles + corpus payment credits.
  const players      = []
  const transactions = []

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const name = row[2]?.toString().trim()
    // Skip blank name rows (section dividers) but keep scanning
    if (!name || name === '') continue
    // Stop at summary rows (col 0 has text like " Total Present")
    const col0str = row[0]?.toString() ?? ''
    if (col0str.includes('Total') || col0str.includes('Cost') || col0str.includes('Notes')) break
    // Skip placeholder rows
    if (name.startsWith('[') || name.startsWith('(')) continue
    // Skip if name looks like a formula result (number)
    if (!isNaN(parseFloat(name)) && isFinite(name)) continue

    const rawType = row[3]?.toString() ?? 'corpus'
    const type    = normalizeType(rawType)
    const playerId = `PLY_${String(players.length + 1).padStart(3, '0')}`

    // Get payments for this player
    const myPayments = paymentsByName[name] ?? []
    const myPPM      = ppmPaymentsByName[name] ?? []
    const totalPaid  = myPayments.reduce((s, p) => s + p.amount, 0)
        + myPPM.reduce((s, p) => s + p.amount, 0)

    // Read actual balance directly from Excel summary columns (variable expense-based)
    // Col 44 = Total Deducted, Col 45 = Corpus/Cash paid, Col 46 = Balance
    const xlTotalDeducted = typeof row[44] === 'number' ? Math.round(row[44] * 100) / 100 : 0
    const xlBalance       = typeof row[46] === 'number' ? Math.round(row[46] * 100) / 100 : null

    // Use Excel balance if available, otherwise fall back to paid - deducted
    const corpusBalance = type === 'corpus' || type === 'new'
      ? (xlBalance !== null ? xlBalance : totalPaid - xlTotalDeducted)
      : 0
    const totalDeducted = xlTotalDeducted

    players.push({
      id: playerId,
      display_name: name,
      type,
      status: 'active',
      joined_date: '2026-02-22',
      phone: '',
      corpus_balance: corpusBalance,
      total_paid: totalPaid,
      total_deducted: totalDeducted,
      balance_status: type === 'corpus' || type === 'new' ? balanceStatus(corpusBalance) : 'good',
      github_username: '',
      cricheroes_player_id: '',
      cricheroes_name: name,
      guest_fee_mode: null,
      sponsored_by_player_id: null,
      notes: '',
    })

    // Create corpus payment transactions (credits only)
    for (const pay of myPayments) {
      transactions.push({
        id: `TXN_PAY_${playerId}_${transactions.length}`,
        player_id: playerId,
        tournament_id: 'TRN_001',
        type: 'corpus_payment',
        amount: pay.amount,
        direction: 'credit',
        date: pay.date,
        week_id: null,
        description: `${pay.type ?? 'Corpus payment'} (imported)`,
        recorded_by: 'excel_import',
        receipt_ref: '',
      })
    }

  }

  // ── Parse match costs + attendance from Weekly Tracker ───────────────────
  const costRow    = rows[52] ?? []   // "Match Cost (₹)" row
  const noteRow    = rows[53] ?? []   // Notes row
  const totalRow   = rows[50] ?? []   // Total Present
  const corpusRow  = rows[51] ?? []   // Corpus Present

  const attendance = []
  const weeks      = []
  const today      = new Date()

  for (const { col, dateStr, label } of weekColumns) {
    const weekId  = `W_${dateStr.replace(/-/g, '_')}`
    const isPast  = new Date(dateStr) <= today
    const cost          = typeof costRow[col] === 'number' ? Math.round(costRow[col]) : 0
    const totalPresent  = typeof totalRow[col]  === 'number' ? totalRow[col]  : 0
    const corpusPresent = typeof corpusRow[col] === 'number' ? corpusRow[col] : 0
    const note          = noteRow[col]?.toString().trim() ?? ''
    // Expenses split only among corpus+PPM (not guests)
    const payingPresent = corpusPresent > 0 ? corpusPresent : totalPresent

    weeks.push({
      week_id: weekId,
      tournament_id: 'TRN_001',
      match_date: dateStr,
      label,
      venue: 'Machaxi J Sports, Bengaluru',
      match_fee: payingPresent > 0 ? Math.round(cost / payingPresent) : 0,
      total_cost: cost,
      corpus_present: corpusPresent,
      total_present: totalPresent,
      status: isPast && cost > 0 ? 'completed' : isPast ? 'completed' : 'scheduled',
      cricheroes_match_id: null,
      team_a: 'Royal Cricket Blasters (RCB)',
      team_b: 'Weekend Warriors (WW)',
      result: '',
      players_count: totalPresent,
      notes: note,
    })

    // Import attendance only for completed weeks with actual data
    if (isPast && cost > 0) {
      for (const player of players) {
        const pIdx = players.indexOf(player)
        const playerRow = rows[5 + pIdx]
        if (!playerRow) continue
        const cell   = playerRow[col]
        const val    = cell?.toString().trim().toUpperCase()
        const played = val === 'P' || val === '1' || val === 'TRUE'
        attendance.push({
          id: `ATT_${player.id}_${weekId}`,
          player_id: player.id,
          week_id: weekId,
          tournament_id: 'TRN_001',
          status: played ? 'played' : 'absent',
          source: 'excel_import',
          fee_deducted: played,
        })
      }
    }
  }

  // ── Import expenses from Expenses Log ────────────────────────────────────
  const expSheet = wb.Sheets['Expenses Log']
  const expRows  = utils.sheet_to_json(expSheet, { header: 1, defval: null })
  const expenses = []
  for (const row of expRows.slice(4)) {
    if (!row || !row[3]) continue
    const amount = typeof row[3] === 'number' ? row[3] : null
    if (!amount) continue
    const dateVal = row[0]
    const dateStr = typeof dateVal === 'number'
      ? new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    expenses.push({
      id: `EXP_${expenses.length + 1}`,
      tournament_id: 'TRN_001',
      date: dateStr,
      category: row[1]?.toString().replace(/[🏏💰📌]/g, '').trim() ?? 'Other',
      amount: Math.round(amount * 100) / 100,
      description: row[4]?.toString().trim() ?? '',
      paid_by: row[5]?.toString().trim() ?? '',
      share_per_player: typeof row[6] === 'number' ? Math.round(row[6] * 100) / 100 : 0,
      distribution: 'all_corpus',
      recorded_by: 'excel_import',
    })
  }

  // ── Also add per-week match costs as expenses ─────────────────────────────
  for (const wk of weeks.filter(w => w.status === 'completed' && w.total_cost > 0)) {
    expenses.push({
      id: `EXP_WK_${wk.week_id}`,
      tournament_id: 'TRN_001',
      date: wk.match_date,
      category: 'Match Cost',
      amount: wk.total_cost,
      description: `Weekly match cost (${wk.notes || wk.label})`,
      paid_by: '',
      share_per_player: (wk.corpus_present || wk.players_count) > 0 ? Math.round(wk.total_cost / (wk.corpus_present || wk.players_count) * 100) / 100 : 0,
      distribution: 'week_present',
      week_id: wk.week_id,
      recorded_by: 'excel_import',
    })
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\nPlayer summary:')
  const byType = {}
  players.forEach(p => { byType[p.type] = (byType[p.type] ?? 0) + 1 })
  console.log('  By type:', JSON.stringify(byType))
  console.log('  Balance statuses:', JSON.stringify(
    players.reduce((m, p) => { m[p.balance_status] = (m[p.balance_status] ?? 0) + 1; return m }, {})
  ))
  console.log('  Sample balances:', players.slice(0,5).map(p => `${p.display_name}: ₹${p.corpus_balance}`).join(', '))

  // ── Save ──────────────────────────────────────────────────────────────────
  console.log('\nSaving JSON files…')

  saveJson('players.json', {
    schema_version: 1,
    last_updated: new Date().toISOString(),
    players,
  })
  saveJson('weeks.json', { schema_version: 1, weeks })
  saveJson('attendance.json', {
    schema_version: 1,
    last_updated: new Date().toISOString(),
    records: attendance,
  })
  saveJson('transactions.json', { schema_version: 1, transactions })
  saveJson('expenses.json', { schema_version: 1, expenses })

  console.log('\n✅ Migration complete!')
  console.log(`   Players:      ${players.length}`)
  console.log(`   Weeks:        ${weeks.length} (${weeks.filter(w=>w.status==='completed').length} completed, ${weeks.filter(w=>w.status==='scheduled').length} scheduled)`)
  console.log(`   Attendance:   ${attendance.length}`)
  console.log(`   Transactions: ${transactions.length}`)
  console.log(`   Expenses:     ${expenses.length} (${expenses.filter(e=>e.category==='Match Cost').length} weekly + ${expenses.filter(e=>e.category!=='Match Cost').length} shared)`)
}

run()
