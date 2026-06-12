import { describe, it, expect } from 'vitest'
import { calcBalanceStatus, playerBalance, generateId } from './balanceCalculator'

const cfg = {
  corpus_overdue_threshold: 0,
  corpus_urgent_threshold: 500,
  corpus_low_threshold: 1000,
}

describe('calcBalanceStatus', () => {
  it('returns overdue at or below the overdue threshold', () => {
    expect(calcBalanceStatus(0, cfg)).toBe('overdue')
    expect(calcBalanceStatus(-250, cfg)).toBe('overdue')
  })

  it('returns urgent between overdue and urgent thresholds (inclusive)', () => {
    expect(calcBalanceStatus(1, cfg)).toBe('urgent')
    expect(calcBalanceStatus(500, cfg)).toBe('urgent')
  })

  it('returns collect_soon between urgent and low thresholds (inclusive)', () => {
    expect(calcBalanceStatus(501, cfg)).toBe('collect_soon')
    expect(calcBalanceStatus(1000, cfg)).toBe('collect_soon')
  })

  it('returns good above the low threshold', () => {
    expect(calcBalanceStatus(1001, cfg)).toBe('good')
  })
})

describe('playerBalance', () => {
  const player = { id: 'PLY_001' }
  const txns = [
    { player_id: 'PLY_001', tournament_id: 'TRN_001', direction: 'credit', amount: 2000 },
    { player_id: 'PLY_001', tournament_id: 'TRN_001', direction: 'debit', amount: 500 },
    { player_id: 'PLY_001', tournament_id: 'TRN_002', direction: 'credit', amount: 999 },
    { player_id: 'PLY_002', tournament_id: 'TRN_001', direction: 'credit', amount: 100 },
  ]

  it('sums credits minus debits for the player and tournament only', () => {
    expect(playerBalance(player, txns, 'TRN_001')).toBe(1500)
  })

  it('returns 0 with no matching transactions', () => {
    expect(playerBalance(player, txns, 'TRN_999')).toBe(0)
  })
})

describe('generateId', () => {
  it('increments the highest existing number and zero-pads', () => {
    expect(generateId('PLY', ['PLY_001', 'PLY_007', 'PLY_003'])).toBe('PLY_008')
  })

  it('starts at 001 when no ids match the prefix', () => {
    expect(generateId('PLY', ['TXN_004'])).toBe('PLY_001')
  })
})
