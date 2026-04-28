import { useAuthStore } from '../store/authStore'

export const useIsAdmin = () => {
  const { isAuthenticated, role } = useAuthStore()
  return isAuthenticated && role === 'admin'
}
