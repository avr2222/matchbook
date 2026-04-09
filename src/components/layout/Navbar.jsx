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
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-green-700 text-lg">
          🏏 MatchBook
        </Link>

        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
          <Link to="/players" className="text-sm text-gray-600 hover:text-gray-900">Players</Link>

          {isAuthenticated ? (
            <>
              {role === 'admin' && (
                <Link to="/admin" className="text-sm text-gray-600 hover:text-gray-900">Admin</Link>
              )}
              {role === 'player' && (
                <Link to="/my" className="text-sm text-gray-600 hover:text-gray-900">My Portal</Link>
              )}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
                <span className="text-sm text-gray-700 font-medium">{displayName}</span>
                <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600">Logout</button>
              </div>
            </>
          ) : (
            <Link to="/login" className="btn-primary text-sm py-1.5 px-3">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
