import { createClient } from '@supabase/supabase-js'

// Guard against multiple instances during Vite HMR — each new instance races
// for the auth token lock and throws "lock was stolen" errors.
if (!globalThis.__supabase__) {
  globalThis.__supabase__ = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: false,
        autoRefreshToken: true,
      },
    }
  )
}

export const supabase = globalThis.__supabase__
