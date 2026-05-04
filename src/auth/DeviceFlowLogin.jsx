import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Detects phone number input and constructs the synthetic email used at signup.
// Admin users type their real email; players/hosts type their 10-digit mobile number.
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏏</div>
          <h1 className="text-xl font-bold text-gray-900">Sign In</h1>
          <p className="text-sm text-gray-500 mt-1">MatchBook</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email or Mobile Number</label>
            <input
              type="text"
              className="input w-full"
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
              className="input w-full"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm">
          <p className="text-gray-500">
            New player?{' '}
            <Link to="/signup" className="text-green-600 font-semibold hover:underline">
              Sign up →
            </Link>
          </p>
          <p>
            <Link to="/forgot-password" className="text-gray-400 hover:text-gray-600 text-xs hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
