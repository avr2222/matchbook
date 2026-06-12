import { useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, Link, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from './components/layout/Navbar'
import AdminSidebar, { AdminMobileNav } from './components/layout/AdminSidebar'
import ProtectedRoute from './auth/ProtectedRoute'
import { ToastProvider } from './components/ui/Toast'
import { useIsAdmin } from './hooks/useIsAdmin'
import { useAuthStore } from './store/authStore'
import { useAdminNotifications } from './hooks/useAdminNotifications'
import { usePushSubscription } from './hooks/usePushSubscription'
import { PageSpinner } from './components/ui/Spinner'
import ErrorBoundary from './components/ErrorBoundary'

// Public pages — loaded eagerly (part of the initial bundle)
import Dashboard      from './pages/public/Dashboard'
import Players        from './pages/public/Players'
import PlayerDetail   from './pages/public/PlayerDetail'
import DeviceFlowLogin from './auth/DeviceFlowLogin'
import Signup               from './pages/auth/Signup'
import ForgotPassword       from './pages/auth/ForgotPassword'
import Leaderboard          from './pages/public/Leaderboard'
import Compare              from './pages/public/Compare'
import Timeline             from './pages/public/Timeline'

// Admin + player portal pages — lazy loaded (split into separate chunks)
const MyDashboard       = lazy(() => import('./pages/player/MyDashboard'))
const AdminDashboard    = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminPlayers      = lazy(() => import('./pages/admin/AdminPlayers'))
const AdminWeeks        = lazy(() => import('./pages/admin/AdminWeeks'))
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'))
const AdminAudit        = lazy(() => import('./pages/admin/AdminAudit'))
const AdminMapping      = lazy(() => import('./pages/admin/AdminMapping'))
const AdminSettings     = lazy(() => import('./pages/admin/AdminSettings'))
const AdminExpenses     = lazy(() => import('./pages/admin/AdminExpenses'))
const AdminGuests       = lazy(() => import('./pages/admin/AdminGuests'))
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'))
const AdminSignups      = lazy(() => import('./pages/admin/AdminSignups'))
const AdminPayments     = lazy(() => import('./pages/admin/AdminPayments'))
const AdminDraft        = lazy(() => import('./pages/admin/AdminDraft'))
const TeamReveal        = lazy(() => import('./pages/public/TeamReveal'))

function PayRedirect() {
  const { playerId } = useParams()
  return <Navigate to={`/player/${playerId}`} replace />
}

const qc = new QueryClient()

function AdminLayout({ children }) {
  const isAdmin = useIsAdmin()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'host'
  useAdminNotifications()
  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-3">
      {!canWrite && (
        <div className="flex items-center justify-between bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-2 text-sm text-amber-300">
          <span>👁️ View-only — you can browse but not make changes.</span>
          <Link to="/login" className="font-medium underline">Log in as admin →</Link>
        </div>
      )}
      <AdminMobileNav />
      <div className="flex gap-6">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}

export default function App() {
  const init = useAuthStore(s => s.init)
  useEffect(() => { init() }, [init])
  usePushSubscription()

  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <div className="flex-1">
            <ErrorBoundary>
            <Suspense fallback={<PageSpinner />}>
            <Routes>
              {/* Public */}
              <Route path="/"              element={<Dashboard />} />
              <Route path="/players"       element={<Players />} />
              <Route path="/player/:id"    element={<PlayerDetail />} />
              <Route path="/pay/:playerId" element={<PayRedirect />} />
              <Route path="/leaderboard"  element={<Leaderboard />} />
              <Route path="/compare"      element={<Compare />} />
              <Route path="/timeline"     element={<Timeline />} />
              <Route path="/teams"        element={<TeamReveal />} />
              <Route path="/login"         element={<DeviceFlowLogin />} />
              <Route path="/signup"          element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/unauthorized" element={
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Access denied. You don't have permission to view this page.
                </div>
              } />

              {/* Player portal */}
              <Route path="/my" element={
                <ProtectedRoute requiredRole="player">
                  <MyDashboard />
                </ProtectedRoute>
              } />

              {/* Admin panel — overview accessible to host + admin */}
              <Route path="/admin"               element={<ProtectedRoute requiredRole="writer"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/players"       element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminPlayers /></AdminLayout></ProtectedRoute>} />
              {/* Hosts can access weeks + expenses (but delete buttons hidden inside) */}
              <Route path="/admin/weeks"         element={<ProtectedRoute requiredRole="writer"><AdminLayout><AdminWeeks /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/expenses"      element={<ProtectedRoute requiredRole="writer"><AdminLayout><AdminExpenses /></AdminLayout></ProtectedRoute>} />
              {/* Admin-only routes */}
              <Route path="/admin/transactions"  element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminTransactions /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/audit"         element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminAudit /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/mapping"       element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminMapping /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/settings"      element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminSettings /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/guests"        element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminGuests /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/announcements" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminAnnouncements /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/signups"       element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminSignups /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/payments"      element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminPayments /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/draft"        element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDraft /></AdminLayout></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
        </div>
        <ToastProvider />
      </HashRouter>
    </QueryClientProvider>
  )
}
