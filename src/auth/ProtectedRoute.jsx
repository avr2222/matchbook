import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requiredRole && role !== requiredRole) return <Navigate to="/unauthorized" replace />
  return children
}
