import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from './components/layout/Navbar'
import AdminSidebar, { AdminMobileNav } from './components/layout/AdminSidebar'
import ProtectedRoute from './auth/ProtectedRoute'
import { ToastProvider } from './components/ui/Toast'
import { useIsAdmin } from './hooks/useIsAdmin'
import { useAuthStore } from './store/authStore'
import { useAdminNotifications } from './hooks/useAdminNotifications'
import { usePushSubscription } from './hooks/usePushSubscription'

import Dashboard      from './pages/public/Dashboard'
import Players        from './pages/public/Players'
import PlayerPay      from './pages/public/PlayerPay'
import PlayerDetail   from './pages/public/PlayerDetail'
import DeviceFlowLogin from './auth/DeviceFlowLogin'
import MyDashboard    from './pages/player/MyDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminPlayers   from './pages/admin/AdminPlayers'
import AdminWeeks     from './pages/admin/AdminWeeks'
import AdminTransactions from './pages/admin/AdminTransactions'
import AdminAudit     from './pages/admin/AdminAudit'
import AdminMapping   from './pages/admin/AdminMapping'
import AdminSettings  from './pages/admin/AdminSettings'
import AdminExpenses       from './pages/admin/AdminExpenses'
import AdminGuests          from './pages/admin/AdminGuests'
import AdminAnnouncements   from './pages/admin/AdminAnnouncements'
import AdminSignups         from './pages/admin/AdminSignups'
import AdminPayments        from './pages/admin/AdminPayments'
import Signup               from './pages/auth/Signup'

const qc = new QueryClient()

function AdminLayout({ children }) {
  const isAdmin = useIsAdmin()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'host'
  useAdminNotifications()
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-3">
      {!canWrite && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
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
            <Routes>
              {/* Public */}
              <Route path="/"              element={<Dashboard />} />
              <Route path="/players"       element={<Players />} />
              <Route path="/player/:id"    element={<PlayerDetail />} />
              <Route path="/pay/:playerId" element={<PlayerPay />} />
              <Route path="/login"         element={<DeviceFlowLogin />} />
              <Route path="/signup"        element={<Signup />} />
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

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
        <ToastProvider />
      </HashRouter>
    </QueryClientProvider>
  )
}
