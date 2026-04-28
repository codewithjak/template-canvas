import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Features from './pages/Features'
import Careers from './pages/Careers'
import Canvas from './pages/Canvas'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/canvas" element={<Canvas />} />
      </Routes>
    </Router>
  )
}

export default App
