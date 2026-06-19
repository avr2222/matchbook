import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { showToast } from '../../components/ui/Toast'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep]           = useState(1)
  const [phone, setPhone]         = useState('')
  const [questions, setQuestions] = useState({ q1: '', q2: '' })
  const [answer1, setAnswer1]     = useState('')
  const [answer2, setAnswer2]     = useState('')
  const [newPwd, setNewPwd]       = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function findAccount(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cleaned = phone.replace(/\D/g, '')
      const { data, error: fetchErr } = await supabase
        .from('user_signups')
        .select('security_question_1, security_question_2, status')
        .eq('phone', cleaned)
        .maybeSingle()

      if (fetchErr || !data) {
        setError('No account found for this number.')
        return
      }
      if (data.status !== 'approved') {
        setError('Your account has not been approved yet. Contact admin.')
        return
      }
      setQuestions({ q1: data.security_question_1, q2: data.security_question_2 })
      setStep(2)
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword(e) {
    e.preventDefault()
    setError('')
    if (newPwd !== confirmPwd) { setError('Passwords do not match.'); return }
    if (newPwd.length < 6)    { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const projectRef = 'tzcernzuwtwgrsattjaw'
      const res = await fetch(
        `https://${projectRef}.supabase.co/functions/v1/reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ phone: phone.replace(/\D/g, ''), answer1, answer2, newPassword: newPwd }),
        }
      )
      const result = await res.json()
      if (!res.ok || result.error) {
        setError(result.error ?? 'Reset failed.')
        return
      }
      showToast('Password updated! Please log in.')
      navigate('/login')
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔑</div>
          <h1 className="text-xl font-bold text-white">Reset Password</h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 1 ? 'Enter your mobile number' : 'Answer your security questions'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={findAccount} className="space-y-4">
            <div>
              <label className="label">Mobile Number</label>
              <input
                type="text"
                inputMode="tel"
                className="input w-full"
                placeholder="9876543210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Looking up…' : 'Find Account →'}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="space-y-4">
            <div>
              <label className="label">{questions.q1}</label>
              <input
                type="text"
                className="input w-full"
                value={answer1}
                onChange={e => setAnswer1(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{questions.q2}</label>
              <input
                type="text"
                className="input w-full"
                value={answer2}
                onChange={e => setAnswer2(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input w-full"
                placeholder="At least 6 characters"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input w-full"
                placeholder="Repeat password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
            <button type="button" onClick={() => { setStep(1); setError('') }} className="w-full text-sm text-gray-400 hover:text-gray-200">
              ← Back
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-gray-400">
          Remember it?{' '}
          <Link to="/login" className="text-green-600 font-semibold hover:underline">Sign in →</Link>
        </p>
      </div>
    </div>
  )
}
