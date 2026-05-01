import { create } from 'zustand'
import { supabase } from '../lib/supabase'

function deriveState(session) {
  const meta = session?.user?.user_metadata ?? {}
  return {
    session,
    isAuthenticated: !!session,
    role: meta.is_admin ? 'admin' : (session ? 'player' : null),
    playerId: meta.player_id ?? null,
  }
}

export const useAuthStore = create((set) => ({
  session: null,
  role: null,
  isAuthenticated: false,
  playerId: null,

  // Call once on app mount — restores session and subscribes to auth changes
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set(deriveState(session))
    supabase.auth.onAuthStateChange((_event, session) => set(deriveState(session)))
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    set(deriveState(data.session))
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, role: null, isAuthenticated: false })
  },
}))
