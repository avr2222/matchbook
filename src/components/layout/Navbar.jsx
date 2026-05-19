import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { IconCricket } from '@tabler/icons-react'

export default function Navbar() {
  const { isAuthenticated, role, displayName, logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  function handleLogout() {
    logout()
    navigate('/')
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [menuOpen])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  function NavLink({ to, children, onClick }) {
    const active = pathname === to || (to !== '/' && pathname.startsWith(to))
    return (
      <Link
        to={to}
        onClick={onClick}
        className={`relative text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
          active ? 'text-[#1D9E75] bg-[#E1F5EE]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        {children}
      </Link>
    )
  }

  function MobileNavLink({ to, children }) {
    const active = pathname === to || (to !== '/' && pathname.startsWith(to))
    return (
      <Link
        to={to}
        onClick={() => setMenuOpen(false)}
        className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
          active ? 'text-[#1D9E75] bg-[#E1F5EE]' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        {children}
      </Link>
    )
  }

  return (
    <nav className="bg-white border-b border-[rgba(0,0,0,0.10)] sticky top-0 z-40" ref={menuRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 font-medium text-[#1D9E75] text-base tracking-tight shrink-0">
          <span className="w-7 h-7 bg-[#E1F5EE] border border-[#1D9E75]/20 rounded-lg flex items-center justify-center">
            <IconCricket size={16} />
          </span>
          <span>MatchBook</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/leaderboard">Stats</NavLink>

          {isAuthenticated && (role === 'admin' || role === 'host') && (
            <NavLink to="/admin">{role === 'host' ? 'Host' : 'Admin'}</NavLink>
          )}
          {isAuthenticated && (role === 'player' || role === 'host') && (
            <NavLink to="/my">My portal</NavLink>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200 shrink-0">
              <span className="hidden sm:block text-sm font-medium text-gray-700">{displayName}</span>
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

        {/* Mobile hamburger */}
        <button
          className="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-gray-500 rounded-full transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-500 rounded-full transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-500 rounded-full transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 space-y-0.5">
          <MobileNavLink to="/">Home</MobileNavLink>
          <MobileNavLink to="/players">Players</MobileNavLink>
          <MobileNavLink to="/leaderboard">Stats</MobileNavLink>

          {isAuthenticated && (role === 'admin' || role === 'host') && (
            <MobileNavLink to="/admin">{role === 'host' ? 'Host' : 'Admin'}</MobileNavLink>
          )}
          {isAuthenticated && (role === 'player' || role === 'host') && (
            <MobileNavLink to="/my">My portal</MobileNavLink>
          )}

          <div className="pt-2 mt-2 border-t border-gray-100">
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-sm font-medium text-gray-700">{displayName}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="btn-primary text-sm py-2.5 px-4 w-full text-center block"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
