import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const SECURITY_QUESTIONS = [
  "Mother's maiden name",
  "Name of first pet",
  "City of birth",
  "Name of primary school",
  "Favourite cricket player",
  "Name of childhood best friend",
  "Street you grew up on",
]

export default function Signup() {
  const [step, setStep] = useState('form')  // 'form' | 'success'

  const [displayName, setDisplayName]   = useState('')
  const [phone, setPhone]               = useState('')
  const [password, setPassword]         = useState('')
  const [confirmPw, setConfirmPw]       = useState('')
  const [claimedId, setClaimedId]       = useState('')
  const [sq1, setSq1]                   = useState(SECURITY_QUESTIONS[0])
  const [sa1, setSa1]                   = useState('')
  const [sq2, setSq2]                   = useState(SECURITY_QUESTIONS[1])
  const [sa2, setSa2]                   = useState('')

  const [players, setPlayers]           = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  // Fetch unclaimed active players for the dropdown
  useEffect(() => {
    supabase
      .from('players')
      .select('id, display_name, type')
      .eq('status', 'active')
      .is('auth_user_id', null)
      .neq('type', 'guest')
      .order('display_name')
      .then(({ data }) => setPlayers(data ?? []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Basic validation
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
      setError('Enter a valid 10-digit mobile number.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPw) {
      setError('Passwords do not match.')
      return
    }
    if (!sa1.trim() || !sa2.trim()) {
      setError('Please answer both security questions.')
      return
    }

    setLoading(true)
    const cleanPhone = phone.replace(/\D/g, '')
    const syntheticEmail = `${cleanPhone}@matchbook.app`

    try {
      // 1. Create Supabase auth account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
        options: { data: { display_name: displayName.trim(), phone: cleanPhone } },
      })
      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          throw new Error('This mobile number is already registered. Try signing in.')
        }
        throw signUpError
      }

      const authUserId = data.user?.id
      if (!authUserId) throw new Error('Signup failed — no user ID returned.')

      // 2. Insert signup record (self_insert RLS policy allows this)
      const { error: insertError } = await supabase.from('user_signups').insert({
        id: `SIGNUP_${Date.now()}`,
        auth_user_id: authUserId,
        player_id: claimedId || null,
        display_name: displayName.trim(),
        phone: cleanPhone,
        email: syntheticEmail,
        requested_role: 'player',
        status: 'pending',
        security_question_1: sq1,
        security_answer_1: sa1.trim().toLowerCase(),
        security_question_2: sq2,
        security_answer_2: sa2.trim().toLowerCase(),
      })
      if (insertError) throw new Error(`Profile save failed: ${insertError.message}`)

      // 3. Sign out — account is pending approval
      await supabase.auth.signOut()
      setStep('success')
    } catch (err) {
      setError(err.message ?? 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <div className="card max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl font-bold text-white">Account Created!</h1>
          <p className="text-sm text-gray-400">
            Your account is pending admin approval. You'll be able to sign in once approved.
          </p>
          <p className="text-xs text-gray-400">
            Claimed player: <span className="font-medium text-gray-200">
              {players.find(p => p.id === claimedId)?.display_name ?? 'None'}
            </span>
          </p>
          <Link to="/login" className="btn-primary block text-center">
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent px-4 py-10">
      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏏</div>
          <h1 className="text-xl font-bold text-white">Create Account</h1>
          <p className="text-sm text-gray-500 mt-1">Join MatchBook</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <div>
            <label className="label">Your Name</label>
            <input
              className="input w-full"
              placeholder="Venkat A"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Mobile Number</label>
            <input
              className="input w-full"
              type="tel"
              inputMode="numeric"
              placeholder="9876543210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              maxLength={15}
            />
            <p className="text-xs text-gray-400 mt-1">Used to sign in — no OTP required.</p>
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input w-full"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label">Confirm Password</label>
            <input
              className="input w-full"
              type="password"
              placeholder="Re-enter password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {/* Claim a player name */}
          <div>
            <label className="label">Claim your player name <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              className="input w-full"
              value={claimedId}
              onChange={e => setClaimedId(e.target.value)}
            >
              <option value="">— I'm new / not in the list yet —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Links your account to your existing player record.</p>
          </div>

          {/* Security questions */}
          <div className="pt-2 border-t border-white/[0.06]">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Security Questions (for password recovery)</p>

            <div className="space-y-2 mb-3">
              <select className="input w-full text-sm" value={sq1} onChange={e => setSq1(e.target.value)}>
                {SECURITY_QUESTIONS.map(q => <option key={q}>{q}</option>)}
              </select>
              <input
                className="input w-full text-sm"
                placeholder="Your answer"
                value={sa1}
                onChange={e => setSa1(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <select
                className="input w-full text-sm"
                value={sq2}
                onChange={e => setSq2(e.target.value)}
              >
                {SECURITY_QUESTIONS.filter(q => q !== sq1).map(q => <option key={q}>{q}</option>)}
              </select>
              <input
                className="input w-full text-sm"
                placeholder="Your answer"
                value={sa2}
                onChange={e => setSa2(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/10 border border-red-700/30 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-green-600 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
