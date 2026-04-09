export function calcBalanceStatus(balance, config) {
  if (balance <= config.corpus_overdue_threshold)  return 'overdue'
  if (balance <= config.corpus_urgent_threshold)   return 'urgent'
  if (balance <= config.corpus_low_threshold)      return 'collect_soon'
  return 'good'
}

export const STATUS_LABEL = {
  good:         'Good',
  collect_soon: 'Collect Soon',
  urgent:       'Urgent',
  overdue:      'Overdue',
}

export const STATUS_CLASS = {
  good:         'badge-good',
  collect_soon: 'badge-collect',
  urgent:       'badge-urgent',
  overdue:      'badge-overdue',
}

export const STATUS_DOT = {
  good:         'bg-green-500',
  collect_soon: 'bg-yellow-500',
  urgent:       'bg-orange-500',
  overdue:      'bg-red-500',
}

export function playerBalance(player, transactions, tournamentId) {
  const txns = transactions.filter(
    t => t.player_id === player.id && t.tournament_id === tournamentId
  )
  const credits = txns.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amount, 0)
  const debits  = txns.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
  return credits - debits
}

export function typeEmoji(type) {
  return { corpus: '💰', ppm: '💵', new: '🆕', guest: '👤' }[type] ?? '👤'
}

export function typeLabel(type) {
  return { corpus: 'Corpus', ppm: 'PPM', new: 'New', guest: 'Guest' }[type] ?? type
}

export function generateId(prefix, existingIds) {
  const nums = existingIds
    .filter(id => id.startsWith(prefix + '_'))
    .map(id => parseInt(id.split('_').pop(), 10))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `${prefix}_${String(max + 1).padStart(3, '0')}`
}
