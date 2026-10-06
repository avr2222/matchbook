import { describe, it, expect } from 'vitest'
import { sharesMatchCost, rebuildWeekTotal } from './feeSplit'

describe('sharesMatchCost', () => {
  it('includes corpus, new and guest players who played', () => {
    expect(sharesMatchCost('played', 'corpus', false)).toBe(true)
    expect(sharesMatchCost('played', 'new', false)).toBe(true)
    expect(sharesMatchCost('played', 'guest', false)).toBe(true)
  })

  it('excludes absent, PPM and free players', () => {
    expect(sharesMatchCost('absent', 'corpus', false)).toBe(false)
    expect(sharesMatchCost(undefined, 'corpus', false)).toBe(false)
    expect(sharesMatchCost('played', 'ppm', false)).toBe(false)
    expect(sharesMatchCost('played', 'guest', true)).toBe(false)
  })
})

describe('rebuildWeekTotal', () => {
  const players = {}
  const records = []
  const add = (id, type, rec = {}) => {
    players[id] = { id, type }
    records.push({ player_id: id, status: 'played', fee_deducted: false, sponsor_player_id: null, ...rec })
  }
  // 11 corpus + 5 guests paying directly, ₹5000 total → ₹312.50 each
  for (let i = 0; i < 11; i++) add(`C${i}`, 'corpus')
  for (let i = 0; i < 5; i++) add(`G${i}`, 'guest')
  const deductions = Array.from({ length: 11 }, (_, i) => ({ player_id: `C${i}`, amount: 312.5 }))

  it('adds back the share of guests who paid directly', () => {
    expect(rebuildWeekTotal(records, deductions, players)).toBeCloseTo(5000)
  })

  it('ignores PPM cash payments and free / absent players', () => {
    const p = { ...players, P1: { id: 'P1', type: 'ppm' }, F1: { id: 'F1', type: 'corpus' }, A1: { id: 'A1', type: 'corpus' } }
    const r = [
      ...records,
      { player_id: 'P1', status: 'played' },
      { player_id: 'F1', status: 'played', fee_deducted: true },
      { player_id: 'A1', status: 'absent' },
    ]
    const d = [...deductions, { player_id: 'P1', amount: 312.5 }]
    expect(rebuildWeekTotal(r, d, p)).toBeCloseTo(5000)
  })

  it('counts a sponsored guest as charged (sponsor paid both shares)', () => {
    const r = records.map(x => x.player_id === 'G0' ? { ...x, sponsor_player_id: 'C0' } : x)
    const d = deductions.map(t => t.player_id === 'C0' ? { ...t, amount: 625 } : t)
    expect(rebuildWeekTotal(r, d, players)).toBeCloseTo(5000)
  })

  it('recovers the ground cost from a CricHeroes auto-deduct (₹4688 over 16 sharers)', () => {
    const d = deductions.map(t => ({ ...t, amount: Math.round(4688 / 16 * 100) / 100 }))
    expect(Math.round(rebuildWeekTotal(records, d, players))).toBe(4688)
  })

  it('returns 0 when nothing was charged', () => {
    expect(rebuildWeekTotal(records, [], players)).toBe(0)
  })
})
