import { NavLink } from 'react-router-dom'

const links = [
  { to: '/admin',              label: 'Overview',     icon: '🏠', end: true },
  { to: '/admin/players',      label: 'Players',      icon: '👥' },
  { to: '/admin/weeks',        label: 'Matches',      icon: '📅' },
  { to: '/admin/transactions', label: 'Payments',     icon: '💳' },
  { to: '/admin/expenses',     label: 'Expenses',     icon: '🧾' },
  { to: '/admin/guests',       label: 'Guests',       icon: '👤' },
  { to: '/admin/audit',        label: 'Audit Log',    icon: '📋' },
  { to: '/admin/mapping',      label: 'CricHeroes',   icon: '🔗' },
  { to: '/admin/settings',     label: 'Settings',     icon: '⚙️' },
]

export default function AdminSidebar() {
  return (
    <aside className="w-48 shrink-0 hidden md:block">
      <div className="card p-3 sticky top-20">
        <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-2">Admin Panel</p>
        <nav className="flex flex-col gap-0.5">
          {links.map(({ to, label, icon, end }) => (
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
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
