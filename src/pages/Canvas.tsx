import { Link } from 'react-router-dom'
import TemplateCanvas from '../components/TemplateCanvas/TemplateCanvas'

function Canvas() {
  return (
    <div>
      <div
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          zIndex: 1001,
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.92)',
          borderBottom: '1px solid #e5e9f1',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          minHeight: '52px',
        }}
      >
        <Link
          to="/"
          className="button button--secondary"
          style={{ fontSize: '13px', padding: '8px 16px' }}
        >
          ← Back to Home
        </Link>
      </div>
      <div style={{ height: '52px' }} />
      <TemplateCanvas />
    </div>
  )
}

export default Canvas