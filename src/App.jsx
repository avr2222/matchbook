import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from './components/layout/Navbar'
import AdminSidebar, { AdminMobileNav } from './components/layout/AdminSidebar'
import ProtectedRoute from './auth/ProtectedRoute'
import { ToastProvider } from './components/ui/Toast'
import { useIsAdmin } from './hooks/useIsAdmin'
import { useAuthStore } from './store/authStore'

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

const qc = new QueryClient()

function AdminLayout({ children }) {
  const isAdmin = useIsAdmin()
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-3">
      {!isAdmin && (
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

              {/* Admin panel — readable by all, writes gated per-page by useIsAdmin() */}
              <Route path="/admin"                element={<AdminLayout><AdminDashboard /></AdminLayout>} />
              <Route path="/admin/players"        element={<AdminLayout><AdminPlayers /></AdminLayout>} />
              <Route path="/admin/weeks"          element={<AdminLayout><AdminWeeks /></AdminLayout>} />
              <Route path="/admin/transactions"   element={<AdminLayout><AdminTransactions /></AdminLayout>} />
              <Route path="/admin/audit"          element={<AdminLayout><AdminAudit /></AdminLayout>} />
              <Route path="/admin/mapping"        element={<AdminLayout><AdminMapping /></AdminLayout>} />
              <Route path="/admin/settings"       element={<AdminLayout><AdminSettings /></AdminLayout>} />
              <Route path="/admin/expenses"       element={<AdminLayout><AdminExpenses /></AdminLayout>} />
              <Route path="/admin/guests"         element={<AdminLayout><AdminGuests /></AdminLayout>} />
              <Route path="/admin/announcements"  element={<AdminLayout><AdminAnnouncements /></AdminLayout>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
        <ToastProvider />
      </HashRouter>
    </QueryClientProvider>
  )
}
