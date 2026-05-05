import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from './useIsAdmin'
import { showToast } from '../components/ui/Toast'

// Realtime listener for admins: shows toasts + refreshes badges when new signups/payments arrive.
// OS-level push notifications are handled by the service worker via the send-push edge function.
export function useAdminNotifications() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()

  useEffect(() => {
    if (!isAdmin) return

    const signupCh = supabase
      .channel('admin-notify-signups')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_signups' }, (payload) => {
        const name = payload.new?.display_name ?? 'Someone'
        showToast(`✍️ New signup: ${name} wants to join`)
        qc.invalidateQueries({ queryKey: ['pending_counts'] })
        qc.invalidateQueries({ queryKey: ['user_signups'] })
      })
      .subscribe()

    const paymentCh = supabase
      .channel('admin-notify-payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_requests' }, (payload) => {
        const amount = payload.new?.amount ?? 0
        showToast(`💰 New payment: ₹${Number(amount).toLocaleString('en-IN')} pending`)
        qc.invalidateQueries({ queryKey: ['pending_counts'] })
        qc.invalidateQueries({ queryKey: ['payment_requests'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(signupCh)
      supabase.removeChannel(paymentCh)
    }
  }, [isAdmin, qc])
}
