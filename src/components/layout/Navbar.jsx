import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function Navbar() {
  const { isAuthenticated, role, displayName, logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    logout()
    navigate('/')
  }

  function NavLink({ to, children }) {
    const active = pathname === to || (to !== '/' && pathname.startsWith(to))
    return (
      <Link
        to={to}
        className={`relative text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
          active ? 'text-green-700 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        {children}
        {active && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-green-600 rounded-full" />
        )}
      </Link>
    )
  }

  return (
    <nav className="bg-white/90 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 font-black text-green-700 text-lg tracking-tight shrink-0">
          <span className="w-8 h-8 bg-green-50 border border-green-100 rounded-lg flex items-center justify-center text-base leading-none">🏏</span>
          <span>MatchBook</span>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/leaderboard">Stats</NavLink>

          {isAuthenticated && (role === 'admin' || role === 'host') && (
            <NavLink to="/admin">{role === 'host' ? '★ Host' : 'Admin'}</NavLink>
          )}
          {isAuthenticated && (role === 'player' || role === 'host') && (
            <NavLink to="/my">My Portal</NavLink>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200 shrink-0">
              <span className="hidden sm:block text-sm font-semibold text-gray-700">{displayName}</span>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary text-sm py-1.5 px-4 ml-1 shrink-0">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
