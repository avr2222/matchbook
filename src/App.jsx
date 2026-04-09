import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from './components/layout/Navbar'
import AdminSidebar from './components/layout/AdminSidebar'
import ProtectedRoute from './auth/ProtectedRoute'
import { ToastProvider } from './components/ui/Toast'

import Dashboard      from './pages/public/Dashboard'
import Players        from './pages/public/Players'
import DeviceFlowLogin from './auth/DeviceFlowLogin'
import MyDashboard    from './pages/player/MyDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminPlayers   from './pages/admin/AdminPlayers'
import AdminWeeks     from './pages/admin/AdminWeeks'
import AdminTransactions from './pages/admin/AdminTransactions'
import AdminAudit     from './pages/admin/AdminAudit'
import AdminMapping   from './pages/admin/AdminMapping'
import AdminSettings  from './pages/admin/AdminSettings'
import AdminExpenses  from './pages/admin/AdminExpenses'
import AdminGuests    from './pages/admin/AdminGuests'

const qc = new QueryClient()

function AdminLayout({ children }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
      <AdminSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <div className="flex-1">
            <Routes>
              {/* Public */}
              <Route path="/"        element={<Dashboard />} />
              <Route path="/players" element={<Players />} />
              <Route path="/login"   element={<DeviceFlowLogin />} />
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

              {/* Admin panel */}
              <Route path="/admin" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminDashboard /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/players" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminPlayers /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/weeks" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminWeeks /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/transactions" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminTransactions /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/audit" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminAudit /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/mapping" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminMapping /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout><AdminSettings /></AdminLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/expenses"  element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminExpenses /></AdminLayout></ProtectedRoute>} />
              <Route path="/admin/guests"    element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminGuests /></AdminLayout></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
        <ToastProvider />
      </HashRouter>
    </QueryClientProvider>
  )
}
