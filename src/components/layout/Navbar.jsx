import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function Navbar() {
  const { isAuthenticated, role, displayName, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-green-700 text-lg tracking-tight">
          <span className="text-xl">🏏</span>
          <span>MatchBook</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link to="/" className="hidden sm:block text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            Home
          </Link>
          <Link to="/players" className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            Players
          </Link>

          {isAuthenticated ? (
            <>
              {role === 'admin' && (
                <Link to="/admin" className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Admin
                </Link>
              )}
              {role === 'player' && (
                <Link to="/my" className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  My Portal
                </Link>
              )}
              <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200">
                <span className="hidden sm:block text-sm font-semibold text-gray-700">{displayName}</span>
                <button
                  onClick={handleLogout}
                  className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <Link to="/login" className="btn-primary text-sm py-1.5 px-4">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
