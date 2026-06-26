import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Home from './pages/Home'
import Features from './pages/Features'
import Careers from './pages/Careers'
import Canvas from './pages/Canvas'
import Builder from './pages/Builder'
import Settings from './pages/Settings'
import Pricing from './pages/Pricing'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import AcceptInvite from './pages/AcceptInvite'
import { PlanProvider } from './plan/PlanProvider'
import AdminRoute from './admin/AdminRoute'        // [ADMIN PANEL]
import AdminPage from './admin/AdminPage'          // [ADMIN PANEL]
import { NotificationProvider } from './notify'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <Router>
        <PlanProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/invite" element={<AcceptInvite />} />
          {/* Graph-canvas builder preview (platform P1) — unguarded for now */}
          <Route path="/builder" element={<Builder />} />
          <Route
            path="/canvas"
            element={
              <ProtectedRoute>
                <Canvas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          {/* [ADMIN PANEL] isolated feature — remove this Route + its imports to disable */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
        </Routes>
        </PlanProvider>
      </Router>
      {/* Global toasts + confirm dialogs — replaces native alert()/confirm() */}
      <NotificationProvider />
    </AuthProvider>
  )
}

export default App
