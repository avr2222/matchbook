import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function saveSubscription(sub) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert({
    user_id:  session.user.id,
    endpoint: json.endpoint,
    p256dh:   json.keys.p256dh,
    auth:     json.keys.auth,
  }, { onConflict: 'user_id,endpoint' })
}

async function doSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) { await saveSubscription(existing); return }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    await saveSubscription(sub)
  } catch (e) {
    console.warn('Push subscription failed:', e)
  }
}

// Call this hook once at the app level — works for all authenticated users (admin + players).
export function usePushSubscription() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated || !VAPID_PUBLIC_KEY) return
    if (!('Notification' in window)) return

    if (Notification.permission === 'granted') {
      doSubscribe()
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') doSubscribe()
      })
    }
  }, [isAuthenticated])
}
