import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function fetchUserSignup(session) {
  if (!session) return null
  const appMeta = session.user.app_metadata ?? {}
  if (appMeta.is_admin) return null  // admin doesn't need a signup record
  const { data } = await supabase
    .from('user_signups')
    .select('requested_role, status, player_id, display_name')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()
  return data
}

function deriveState(session, signup) {
  const appMeta  = session?.user?.app_metadata  ?? {}
  const userMeta = session?.user?.user_metadata ?? {}
  const role = appMeta.is_admin
    ? 'admin'
    : signup?.status === 'approved'
      ? signup.requested_role   // 'host' | 'player'
      : session ? 'player' : null
  const displayName =
    signup?.display_name ||
    userMeta.display_name ||
    session?.user?.email?.split('@')[0] ||
    null
  return {
    session,
    isAuthenticated: !!session,
    role,
    playerId: signup?.player_id ?? userMeta.player_id ?? appMeta.player_id ?? null,
    displayName,
  }
}

export const useAuthStore = create((set) => ({
  session: null,
  role: null,
  isAuthenticated: false,
  playerId: null,
  displayName: null,
  loading: true, // true until init() finishes restoring session

  // Call once on app mount — restores session and subscribes to auth changes
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const signup = await fetchUserSignup(session)
    set({ ...deriveState(session, signup), loading: false })
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const signup = await fetchUserSignup(session)
      set(deriveState(session, signup))
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const signup = await fetchUserSignup(data.session)
    set(deriveState(data.session, signup))
  },

  claimPlayer: async (selectedPlayerId) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const { error } = await supabase
      .from('user_signups')
      .update({ player_id: selectedPlayerId })
      .eq('auth_user_id', session.user.id)
    if (error) throw new Error(error.message)
    const signup = await fetchUserSignup(session)
    set(deriveState(session, signup))
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, role: null, isAuthenticated: false, playerId: null, displayName: null })
  },
}))
