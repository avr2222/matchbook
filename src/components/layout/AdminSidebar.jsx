import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMapping } from '../../hooks/useData'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { supabase } from '../../lib/supabase'
import {
  IconLayoutDashboard, IconUsers, IconCalendar, IconCreditCard,
  IconReceipt, IconUser, IconBell, IconClipboard, IconLink,
  IconPencil, IconCurrencyRupee, IconSettings,
} from '@tabler/icons-react'

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

const ICON_MAP = {
  overview:      IconLayoutDashboard,
  players:       IconUsers,
  matches:       IconCalendar,
  payments:      IconCreditCard,
  expenses:      IconReceipt,
  guests:        IconUser,
  announcements: IconBell,
  audit:         IconClipboard,
  cricheroes:    IconLink,
  signups:       IconPencil,
  payrequests:   IconCurrencyRupee,
  settings:      IconSettings,
}

function useAdminLinks() {
  const { data: mapData } = useMapping()
  const { data: counts }  = usePendingCounts()
  const isAdmin           = useIsAdmin()
  const unmatchedCount    = (mapData?.unmatched ?? []).length
  const staleCount        = (mapData?.player_mappings ?? []).filter(m => !m.confirmed).length
  const cricHeroesBadge   = unmatchedCount + staleCount

  const links = [
    { to: '/admin',               label: 'Overview',      key: 'overview',      end: true },
    { to: '/admin/players',       label: 'Players',       key: 'players',       adminOnly: true },
    { to: '/admin/weeks',         label: 'Matches',       key: 'matches' },
    { to: '/admin/transactions',  label: 'Payments',      key: 'payments',      adminOnly: true },
    { to: '/admin/expenses',      label: 'Expenses',      key: 'expenses' },
    { to: '/admin/guests',        label: 'Guests',        key: 'guests',        adminOnly: true },
    { to: '/admin/announcements', label: 'Announcements', key: 'announcements', adminOnly: true },
    { to: '/admin/audit',         label: 'Audit log',     key: 'audit',         adminOnly: true },
    { to: '/admin/mapping',       label: 'CricHeroes',    key: 'cricheroes',    badge: cricHeroesBadge, adminOnly: true },
    { to: '/admin/signups',       label: 'Signups',       key: 'signups',       badge: counts?.signups, adminOnly: true },
    { to: '/admin/payments',      label: 'Pay requests',  key: 'payrequests',   badge: counts?.payments, adminOnly: true },
    { to: '/admin/settings',      label: 'Settings',      key: 'settings',      adminOnly: true },
  ]
  return isAdmin ? links : links.filter(l => !l.adminOnly)
}

export function AdminMobileNav() {
  const links = useAdminLinks()
  return (
    <nav className="md:hidden grid grid-cols-4 gap-1.5 mb-2">
      {links.map(({ to, label, key, end, badge }) => {
        const Icon = ICON_MAP[key] ?? IconLayoutDashboard
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg text-center transition-colors ${
                isActive
                  ? 'bg-[#10b981] text-white'
                  : 'bg-white/[0.04] text-gray-400 active:bg-white/[0.07]'
              }`
            }
          >
            <Icon size={18} className="leading-none" />
            <span className="text-[10px] font-medium leading-tight line-clamp-1">{label}</span>
            {badge > 0 && (
              <span className="absolute top-1 right-1 bg-red-900/100 text-white text-[9px] font-medium rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                {badge > 9 ? '!' : badge}
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function AdminSidebar() {
  const links = useAdminLinks()

  return (
    <aside className="w-48 shrink-0 hidden md:block">
      <div className="card p-3 sticky top-20">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.05em] px-2 mb-2">Admin panel</p>
        <nav className="flex flex-col gap-0.5">
          {links.map(({ to, label, key, end, badge }) => {
            const Icon = ICON_MAP[key] ?? IconLayoutDashboard
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-[rgba(16,185,129,0.12)] text-[#10b981] font-medium'
                      : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                  }`
                }
              >
                <Icon size={15} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="bg-red-900/100 text-white text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {badge > 9 ? '!' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
