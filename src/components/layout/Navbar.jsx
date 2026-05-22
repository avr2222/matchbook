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
        className={`relative text-sm font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap ${
          active
            ? 'text-[#10b981] bg-[rgba(16,185,129,0.08)]'
            : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.04]'
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
        className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${
          active
            ? 'text-[#10b981] bg-[rgba(16,185,129,0.08)]'
            : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.04]'
        }`}
      >
        {children}
      </Link>
    )
  }

  return (
    <nav
      className="sticky top-0 z-40 border-b border-white/[0.05]"
      style={{ background: '#0b1512' }}
      ref={menuRef}
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0f766e, #10b981)',
              boxShadow: '0 0 15px rgba(16,185,129,0.3)',
            }}
          >
            <IconCricket size={16} className="text-white" />
          </span>
          <span
            className="text-base font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #34d399, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            MatchBook
          </span>
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
            <div
              className="flex items-center gap-2 ml-2 pl-3 border-l border-white/[0.08] shrink-0"
            >
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
                <span className="hidden sm:block text-sm font-medium text-gray-300">{displayName}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
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
          className="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-xl hover:bg-white/[0.06] transition-colors"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-gray-400 rounded-full transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-400 rounded-full transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-400 rounded-full transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="sm:hidden border-t border-white/[0.05] px-3 py-3 space-y-0.5"
          style={{ background: '#0b1512' }}
        >
          <MobileNavLink to="/">Home</MobileNavLink>
          <MobileNavLink to="/players">Players</MobileNavLink>
          <MobileNavLink to="/leaderboard">Stats</MobileNavLink>

          {isAuthenticated && (role === 'admin' || role === 'host') && (
            <MobileNavLink to="/admin">{role === 'host' ? 'Host' : 'Admin'}</MobileNavLink>
          )}
          {isAuthenticated && (role === 'player' || role === 'host') && (
            <MobileNavLink to="/my">My portal</MobileNavLink>
          )}

          <div className="pt-2 mt-2 border-t border-white/[0.06]">
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
                  <span className="text-sm font-medium text-gray-300">{displayName}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10"
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
