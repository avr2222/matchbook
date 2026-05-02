import { useAuthStore } from '../store/authStore'

// Returns true for admin AND host — both can add/edit attendance and expenses.
// Use useIsAdmin() separately to gate delete-only operations.
export function useCanWrite() {
  const role = useAuthStore(s => s.role)
  return role === 'admin' || role === 'host'
}
