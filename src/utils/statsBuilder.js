export const NOT_OUT_KEYS = new Set(['not out','dnb','did not bat','absent','retired hurt','absent hurt','retired not out',''])

export const isInnings   = p => (p.balls_faced || 0) > 0
export const isDismissed = p => isInnings(p) && !NOT_OUT_KEYS.has((p.dismissal ?? '').toLowerCase().trim())

export function buildStatsMap(perfs) {
  const seenWeekPlayer = new Set()
  const map = {}
  for (const perf of (perfs ?? [])) {
    if (!map[perf.player_id]) {
      map[perf.player_id] = {
        player_id: perf.player_id,
        weeks_attended: 0,
        matches: 0, innings: 0, dismissals: 0,
        runs: 0, balls_faced: 0, fours: 0, sixes: 0, high_score: 0,
        wickets: 0, runs_given: 0, balls_bowled: 0, maidens: 0, catches: 0,
        run_outs: 0, stumpings: 0, wides: 0, no_balls: 0, potm_count: 0, ducks: 0,
        bba_count: 0, bbo_count: 0,
      }
    }
    const s = map[perf.player_id]
    const wpKey = `${perf.player_id}:${perf.week_id}`
    if (!seenWeekPlayer.has(wpKey)) { s.weeks_attended += 1; seenWeekPlayer.add(wpKey) }
    s.matches    += 1
    if (isInnings(perf))   s.innings    += 1
    if (isDismissed(perf)) s.dismissals += 1
    s.runs        += perf.runs        || 0
    s.balls_faced += perf.balls_faced || 0
    s.fours       += perf.fours       || 0
    s.sixes       += perf.sixes       || 0
    s.high_score   = Math.max(s.high_score, perf.runs || 0)
    s.wickets     += perf.wickets     || 0
    s.runs_given  += perf.runs_given  || 0
    s.balls_bowled+= perf.balls_bowled|| 0
    s.maidens     += perf.maidens     || 0
    s.catches     += perf.catches     || 0
    s.run_outs    += perf.run_outs    || 0
    s.stumpings   += perf.stumpings   || 0
    s.wides       += perf.wides       || 0
    s.no_balls    += perf.no_balls    || 0
    s.potm_count  += perf.potm_count  || 0
    s.ducks       += perf.ducks       || 0
    s.bba_count   += perf.bba_count   || 0
    s.bbo_count   += perf.bbo_count   || 0
  }
  return map
}
