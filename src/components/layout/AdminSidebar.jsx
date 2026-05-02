import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMapping } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { supabase } from '../../lib/supabase'

function usePendingCounts() {
  const isAdmin = useIsAdmin()
  return useQuery({
    queryKey: ['pending_counts'],
    queryFn: async () => {
      const [signupsRes, paymentsRes] = await Promise.all([
        supabase.from('user_signups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      return { signups: signupsRes.count ?? 0, payments: paymentsRes.count ?? 0 }
    },
    enabled: isAdmin,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

function useAdminLinks() {
  const { data: mapData } = useMapping()
  const { data: counts }  = usePendingCounts()
  const isAdmin           = useIsAdmin()
  const unmatchedCount    = (mapData?.unmatched ?? []).length
  const staleCount        = (mapData?.player_mappings ?? []).filter(m => !m.confirmed).length
  const cricHeroesBadge   = unmatchedCount + staleCount

  const links = [
    { to: '/admin',                label: 'Overview',       icon: '🏠', end: true },
    { to: '/admin/players',        label: 'Players',        icon: '👥', adminOnly: true },
    { to: '/admin/weeks',          label: 'Matches',        icon: '📅' },
    { to: '/admin/transactions',   label: 'Payments',       icon: '💳', adminOnly: true },
    { to: '/admin/expenses',       label: 'Expenses',       icon: '🧾' },
    { to: '/admin/guests',         label: 'Guests',         icon: '👤', adminOnly: true },
    { to: '/admin/announcements',  label: 'Announcements',  icon: '📢', adminOnly: true },
    { to: '/admin/audit',          label: 'Audit Log',      icon: '📋', adminOnly: true },
    { to: '/admin/mapping',        label: 'CricHeroes',     icon: '🔗', badge: cricHeroesBadge, adminOnly: true },
    { to: '/admin/signups',        label: 'Signups',        icon: '✍️',  badge: counts?.signups, adminOnly: true },
    { to: '/admin/payments',       label: 'Pay Requests',   icon: '💰', badge: counts?.payments, adminOnly: true },
    { to: '/admin/settings',       label: 'Settings',       icon: '⚙️', adminOnly: true },
  ]
  return isAdmin ? links : links.filter(l => !l.adminOnly)
}

export function AdminMobileNav() {
  const links = useAdminLinks()
  return (
    <nav className="md:hidden overflow-x-auto flex gap-1 pb-1 -mx-4 px-4">
      {links.map(({ to, label, icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 relative ${
              isActive
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`
          }
        >
          <span>{icon}</span>
          <span>{label}</span>
          {badge > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {badge > 9 ? '!' : badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AdminSidebar() {
  const links = useAdminLinks()

  return (
    <aside className="w-48 shrink-0 hidden md:block">
      <div className="card p-3 sticky top-20">
        <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-2">Admin Panel</p>
        <nav className="flex flex-col gap-0.5">
          {links.map(({ to, label, icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-green-50 text-green-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {badge > 9 ? '!' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
