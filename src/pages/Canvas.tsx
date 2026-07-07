import { useNavigate } from 'react-router-dom'
import TemplateCanvas from '../components/TemplateCanvas/TemplateCanvas'
import UserMenu from '../auth/UserMenu'

function Canvas() {
  const navigate = useNavigate()
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
          background: 'linear-gradient(180deg, #ffffff 0%, #e6ecff 100%)',
          borderBottom: '1px solid #d6def7',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minHeight: '52px',
        }}
      >
        <UserMenu />
        <div style={{ width: '1px', height: '22px', background: '#cdd8f5', flexShrink: 0 }} />
        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Integrations & API access"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '7px 12px',
            borderRadius: '9px',
            border: '1px solid #cdd8f5',
            background: 'rgba(255,255,255,0.7)',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#eef2ff')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="2.5" />
            <circle cx="19" cy="5" r="2.5" />
            <circle cx="19" cy="19" r="2.5" />
            <path d="M7.2 10.9 16.8 6.1M7.2 13.1 16.8 17.9" />
          </svg>
          Integrations
        </button>
      </div>
      <div style={{ height: '52px' }} />
      <TemplateCanvas />
    </div>
  )
}

export default Canvas