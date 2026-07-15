/**
 * Canvas.tsx — the editor route.
 *
 * It used to draw its own fixed 52px header: a `UserMenu` and an "Integrations"
 * button, built from inline styles, with a 52px spacer under it. That header is
 * gone. The app frame supplies the one header (the UserMenu lives there) and the
 * sidebar supplies navigation (Integrations is a nav item), so this page is now the
 * editor and nothing else.
 *
 * The editor's own actions — undo/redo, page size, rulers, save, templates, AI,
 * upload, export — portal UP into the frame's header from `Toolbar`, so there is
 * still exactly one header. See `frame/FrameActions`.
 */
import TemplateCanvas from '../components/TemplateCanvas/TemplateCanvas'

function Canvas() {
  return <TemplateCanvas />
}

export default Canvas
