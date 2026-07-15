import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Home from './pages/Home'
import Features from './pages/Features'
import Careers from './pages/Careers'
import Canvas from './pages/Canvas'
import Builder from './pages/Builder'
import BuilderConnect from './pages/BuilderConnect'
import Settings from './pages/Settings'
import Team from './pages/Team'
import Integrations from './pages/Integrations'
import Pricing from './pages/Pricing'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import AcceptInvite from './pages/AcceptInvite'
import AppFrame from './frame/AppFrame'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
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
          {/* Connect-account flow (P5) — guarded: links a real cloud account */}
          <Route
            path="/builder/connect"
            element={
              <ProtectedRoute>
                <BuilderConnect />
              </ProtectedRoute>
            }
          />
          {/* Framed routes: the sidebar + the app's ONE header wrap the page.
              /canvas is here now (relayout 4E) — its old fixed 52px header is gone
              and its toolbar portals up into the frame's header instead. */}
          <Route
            element={
              <ProtectedRoute>
                <AppFrame />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
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
