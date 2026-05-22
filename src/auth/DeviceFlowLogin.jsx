import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function normalizeLogin(input) {
  const stripped = input.replace(/\D/g, '')
  if (/^\d{10,}$/.test(stripped)) {
    return `${stripped}@matchbook.app`
  }
  return input.trim()
}

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const login    = useAuthStore(s => s.login)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const email = normalizeLogin(identifier)
      await login(email, password)
      const { role } = useAuthStore.getState()
      if (role === 'admin' || role === 'host') {
        navigate('/admin')
      } else {
        navigate('/my')
      }
    } catch (err) {
      setError(err.message ?? 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col sm:flex-row">
      {/* Brand panel */}
      <div className="sm:w-2/5 bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 flex items-center justify-center p-10 relative overflow-hidden min-h-[200px] sm:min-h-screen">
        <div className="absolute text-[200px] leading-none opacity-10 bottom-0 right-0 pointer-events-none select-none">🏏</div>
        <div className="relative text-white text-center">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">🏏</div>
          <h1 className="text-3xl font-black tracking-tight">MatchBook</h1>
          <p className="text-green-100 text-sm mt-2 max-w-xs">Your cricket team's finance &amp; stats hub</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-black text-gray-900 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-400 mb-8">Sign in to continue to your team</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email or Mobile Number</label>
              <input
                type="text"
                className="input"
                placeholder="admin@email.com or 9876543210"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                inputMode="text"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/10 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in →'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2 text-sm">
            <p className="text-gray-500">
              New player?{' '}
              <Link to="/signup" className="text-green-600 font-semibold hover:underline">Sign up →</Link>
            </p>
            <Link to="/forgot-password" className="text-gray-400 hover:text-gray-600 text-xs hover:underline block">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
