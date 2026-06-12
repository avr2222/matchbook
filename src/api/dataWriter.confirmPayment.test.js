import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the two tables confirmPayment touches, so we can
// assert the idempotency guarantee: one credit transaction per request, ever.
const h = vi.hoisted(() => {
  const db = { request: null, transactions: [] }

  const supabase = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from(table) {
      if (table === 'config') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { active_tournament_id: 'TRN_001' } }) }),
          }),
        }
      }
      if (table === 'payment_requests') {
        return {
          update(values) {
            const filters = {}
            const chain = {
              eq(col, val) {
                filters[col] = val
                return chain
              },
              // claim path: .update().eq().eq().select()
              async select() {
                const req = db.request
                if (!req || req.id !== filters.id) return { data: [], error: null }
                if (filters.status !== undefined && req.status !== filters.status)
                  return { data: [], error: null }
                Object.assign(req, values)
                return { data: [{ ...req }], error: null }
              },
              // revert path: awaited without .select()
              then(resolve) {
                const req = db.request
                if (req && req.id === filters.id) Object.assign(req, values)
                resolve({ data: null, error: null })
              },
            }
            return chain
          },
        }
      }
      if (table === 'transactions') {
        return {
          async insert(row) {
            if (db.transactions.some(t => t.id === row.id))
              return { error: { message: 'duplicate key value violates unique constraint' } }
            db.transactions.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'audit_log') {
        return { insert: async () => ({ error: null }) }
      }
      throw new Error(`unmocked table: ${table}`)
    },
  }

  return { db, supabase }
})

vi.mock('../lib/supabase', () => ({ supabase: h.supabase }))

import { confirmPayment } from './dataWriter'

describe('confirmPayment idempotency', () => {
  beforeEach(() => {
    h.db.request = { id: 'PREQ_1', player_id: 'PLY_001', amount: 1000, status: 'pending', upi_ref: 'REF42' }
    h.db.transactions = []
  })

  it('credits the player once and marks the request confirmed', async () => {
    await confirmPayment('PREQ_1')

    expect(h.db.request.status).toBe('confirmed')
    expect(h.db.transactions).toHaveLength(1)
    const txn = h.db.transactions[0]
    expect(txn.id).toBe('TXN_PAY_PREQ_1')
    expect(txn.player_id).toBe('PLY_001')
    expect(txn.amount).toBe(1000)
    expect(txn.direction).toBe('credit')
  })

  it('throws on a second confirm and does not insert a duplicate transaction', async () => {
    await confirmPayment('PREQ_1')
    await expect(confirmPayment('PREQ_1')).rejects.toThrow('Payment already processed')
    expect(h.db.transactions).toHaveLength(1)
  })

  it('throws for an unknown request id without inserting anything', async () => {
    await expect(confirmPayment('PREQ_MISSING')).rejects.toThrow('Payment already processed')
    expect(h.db.transactions).toHaveLength(0)
  })
})
