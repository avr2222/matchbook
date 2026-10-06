// Match-fee split rules shared by the attendance editor.
// scripts/sync_cricheroes.py (auto-deduct) applies the same rule — keep them in step.

// The match + snacks total is divided among everyone who played, guests included
// (even guests who pay directly). PPM players pay cash and players marked free
// are left out.
export function sharesMatchCost(status, playerType, isFree) {
  return status === 'played' && playerType !== 'ppm' && !isFree
}

// Rebuilds a week's total cost from the match_deduction transactions already made,
// for weeks saved before total_cost was stored. Each charged player paid one share
// per person they covered, but guests paying directly were never charged, so
//   total = (sum charged) × (all sharers) ÷ (sharers someone was charged for).
// Returns 0 when nothing was charged.
export function rebuildWeekTotal(weekRecords, deductions, playerById) {
  const typeOf  = id => playerById[id]?.type
  const sharers = weekRecords.filter(r => sharesMatchCost(r.status, typeOf(r.player_id), r.fee_deducted))
  const charged = sharers.filter(r => typeOf(r.player_id) !== 'guest' || r.sponsor_player_id)
  const chargedSum = deductions
    .filter(t => typeOf(t.player_id) !== 'ppm')   // PPM cash payments aren't part of the split
    .reduce((s, t) => s + (t.amount ?? 0), 0)
  if (charged.length === 0 || chargedSum <= 0) return 0
  return chargedSum * sharers.length / charged.length
}
