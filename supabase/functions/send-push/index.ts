import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_EMAIL   = Deno.env.get('VAPID_EMAIL') ?? 'mailto:admin@matchbook.app'

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function pushToUsers(userIds: string[], title: string, body: string, url: string) {
  if (!userIds.length) return
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)
  const payload = JSON.stringify({ title, body, url })
  await Promise.allSettled(
    (subs ?? []).map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    )
  )
}

async function getAdminUserIds(): Promise<string[]> {
  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  return (users ?? []).filter(u => u.app_metadata?.is_admin === true).map(u => u.id)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const { type, table, record, old_record } = await req.json()

  if (table === 'user_signups') {
    if (type === 'INSERT') {
      // → Admin: new signup request
      const admins = await getAdminUserIds()
      await pushToUsers(
        admins,
        '✍️ New Signup Request',
        `${record.display_name ?? 'Someone'} wants to join the team`,
        '/matchbook/#/admin/signups',
      )
    } else if (type === 'UPDATE' && old_record?.status === 'pending' && record.auth_user_id) {
      // → Player: their signup was approved or rejected
      if (record.status === 'approved') {
        await pushToUsers(
          [record.auth_user_id],
          '✅ Signup Approved!',
          'Welcome to the team! You can now access your dashboard.',
          '/matchbook/#/my',
        )
      } else if (record.status === 'rejected') {
        await pushToUsers(
          [record.auth_user_id],
          '❌ Signup Not Approved',
          'Your signup request was not approved. Contact the admin for details.',
          '/matchbook/',
        )
      }
    }
  } else if (table === 'payment_requests') {
    if (type === 'INSERT') {
      // → Admin: new payment request
      const amount = Number(record.amount ?? 0).toLocaleString('en-IN')
      const admins = await getAdminUserIds()
      await pushToUsers(
        admins,
        '💰 New Payment Request',
        `₹${amount} payment awaiting confirmation`,
        '/matchbook/#/admin/payments',
      )
    } else if (type === 'UPDATE' && old_record?.status === 'pending' && record.player_id) {
      // → Player: their payment was confirmed or rejected
      const { data: player } = await sb
        .from('players')
        .select('auth_user_id')
        .eq('id', record.player_id)
        .single()

      if (player?.auth_user_id) {
        const amount = Number(record.amount ?? 0).toLocaleString('en-IN')
        if (record.status === 'confirmed') {
          await pushToUsers(
            [player.auth_user_id],
            '✅ Payment Confirmed',
            `₹${amount} has been credited to your corpus account.`,
            '/matchbook/#/my',
          )
        } else if (record.status === 'rejected') {
          await pushToUsers(
            [player.auth_user_id],
            '❌ Payment Not Confirmed',
            `Your ₹${amount} payment could not be confirmed. Contact admin.`,
            '/matchbook/#/my',
          )
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
