import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { fetchConfig } from '../api/dataReader'
import { fetchUsers } from '../api/dataReader'

const DEVICE_AUTH_URL = 'https://github.com/login/device/code'
const TOKEN_URL       = 'https://github.com/login/oauth/access_token'
const USER_API        = 'https://api.github.com/user'

export default function DeviceFlowLogin() {
  const [stage, setStage] = useState('idle')   // idle | waiting | error
  const [userCode, setUserCode]   = useState('')
  const [verifyUrl, setVerifyUrl] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [errorMsg, setErrorMsg]   = useState('')
  const pollRef  = useRef(null)
  const timerRef = useRef(null)
  const navigate = useNavigate()
  const login    = useAuthStore(s => s.login)

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(timerRef.current)
  }, [])

  async function startFlow() {
    setErrorMsg('')
    setStage('idle')
    try {
      const config = await fetchConfig()
      const clientId = config.github_oauth_client_id

      if (!clientId || clientId === 'YOUR_OAUTH_CLIENT_ID') {
        setErrorMsg('GitHub OAuth client_id not configured in config.json.')
        return
      }

      const res = await fetch(DEVICE_AUTH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: 'repo read:user' }),
      })
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error_description); return }

      setUserCode(data.user_code)
      setVerifyUrl(data.verification_uri)
      setSecondsLeft(data.expires_in)
      setStage('waiting')

      // countdown
      timerRef.current = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)

      // poll for token
      const interval = (data.interval ?? 5) * 1000
      pollRef.current = setInterval(async () => {
        try {
          const tr = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              device_code: data.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          })
          const td = await tr.json()
          if (td.error === 'authorization_pending') return
          if (td.error === 'slow_down') return
          if (td.error) {
            clearInterval(pollRef.current)
            clearInterval(timerRef.current)
            setErrorMsg(td.error_description || td.error)
            setStage('idle')
            return
          }
          if (td.access_token) {
            clearInterval(pollRef.current)
            clearInterval(timerRef.current)
            await finalizeLogin(td.access_token)
          }
        } catch { /* network glitch, keep polling */ }
      }, interval)
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  async function finalizeLogin(token) {
    try {
      const ur = await fetch(USER_API, { headers: { Authorization: `Bearer ${token}` } })
      const user = await ur.json()
      const { users } = await fetchUsers()
      const found = users.find(u => u.github_username === user.login && u.is_active)
      if (!found) {
        setErrorMsg(`@${user.login} is not registered as a team member.`)
        setStage('idle')
        return
      }
      login(token, found.role, found.player_id, user.login, found.display_name || user.name || user.login)
      navigate(found.role === 'admin' ? '/admin' : '/my')
    } catch (e) {
      setErrorMsg(e.message)
      setStage('idle')
    }
  }

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const secs = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏏</div>
          <h1 className="text-xl font-bold text-gray-900">Sign in to MatchBook</h1>
          <p className="text-sm text-gray-500 mt-1">Uses your GitHub account — no separate password needed</p>
        </div>

        {stage === 'idle' && (
          <button onClick={startFlow} className="btn-primary w-full flex items-center justify-center gap-2">
            <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub
          </button>
        )}

        {stage === 'waiting' && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Enter this code at <strong>github.com/login/device</strong></p>
              <div className="text-3xl font-mono font-bold tracking-widest text-green-700 my-3">{userCode}</div>
              <a href={verifyUrl} target="_blank" rel="noreferrer" className="btn-primary inline-block text-sm">
                Open GitHub Device Page
              </a>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Waiting for approval… expires in {mins}:{secs}</p>
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {errorMsg}
            <button onClick={startFlow} className="ml-2 underline">Try again</button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Must be a registered team member. Contact your admin if you need access.
        </p>
      </div>
    </div>
  )
}
