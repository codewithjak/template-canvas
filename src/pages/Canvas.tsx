import TemplateCanvas from '../components/TemplateCanvas/TemplateCanvas'
import UserMenu from '../auth/UserMenu'

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
          gap: '10px',
          minHeight: '52px',
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '2px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #2355f4, #1740d0)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              boxShadow: '0 2px 8px rgba(35,85,244,0.35)',
            }}
          >
            M
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: '#0f172a',
              letterSpacing: '-0.01em',
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Mapdoc
          </span>
        </div>
        <UserMenu />
      </div>
      <div style={{ height: '52px' }} />
      <TemplateCanvas />
    </div>
  )
}

export default Canvas