import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardLayout } from './layouts/DashboardLayout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard: page }) => ({ default: page })))
const BillingLedger = lazy(() => import('./pages/BillingLedger').then(({ BillingLedger: page }) => ({ default: page })))

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading"><span className="loader" />Loading your workspace</div>
  if (!user) return <Navigate to="/login" replace />

  return (
    <DashboardLayout>
      <Suspense fallback={<div className="analytics-state" role="status"><span className="loader" /> Loading page…</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/billing" element={<BillingLedger />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </DashboardLayout>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}