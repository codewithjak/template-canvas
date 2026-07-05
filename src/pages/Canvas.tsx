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
        <UserMenu />
      </div>
      <div style={{ height: '52px' }} />
      <TemplateCanvas />
    </div>
  )
}

export default Canvas