import { create } from 'zustand'

const SESSION_KEY = 'cricket_auth'

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export const useAuthStore = create((set, get) => {
  const saved = loadSession()
  return {
    token: saved?.token ?? null,
    role: saved?.role ?? null,           // 'admin' | 'player' | null
    playerId: saved?.playerId ?? null,
    githubUsername: saved?.githubUsername ?? null,
    displayName: saved?.displayName ?? null,
    isAuthenticated: !!saved?.token,

    login(token, role, playerId, githubUsername, displayName) {
      const data = { token, role, playerId, githubUsername, displayName }
      saveSession(data)
      set({ ...data, isAuthenticated: true })
    },

    logout() {
      clearSession()
      set({ token: null, role: null, playerId: null, githubUsername: null, displayName: null, isAuthenticated: false })
    },
  }
})
