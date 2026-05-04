import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role, loading } = useAuthStore()

  // Wait for session to be restored before deciding — avoids flash-redirect to /login
  if (loading) return null

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // 'writer' = admin or host (can add/edit but not necessarily delete)
  if (requiredRole === 'writer') {
    if (role === 'admin' || role === 'host') return children
    return <Navigate to="/unauthorized" replace />
  }

  if (requiredRole === 'player' && role === 'admin') return <Navigate to="/admin" replace />
  if (requiredRole === 'player' && role === 'host') return children
  if (requiredRole && role !== requiredRole) return <Navigate to="/unauthorized" replace />
  return children
}
