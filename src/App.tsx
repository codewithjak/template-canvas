import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Home from './pages/Home'
import Features from './pages/Features'
import Careers from './pages/Careers'
import Canvas from './pages/Canvas'
import AuthCallback from './pages/AuthCallback'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/canvas"
            element={
              <ProtectedRoute>
                <Canvas />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
