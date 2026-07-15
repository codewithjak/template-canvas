/**
 * EditPane.tsx — the panel's first tab (was the duplicate "Insert" grid).
 *
 * It holds element-contextual EDIT tools that need more room than a floating bar —
 * starting with image crop-to-shape. It is deliberately not a properties panel:
 * everyday formatting stays on the bars (relayout doc Amendment 5). For anything
 * without an edit tool it shows a short hint rather than an empty pane.
 */
import { useState } from 'react'
import type { CanvasElement, UpdateElement, ImageElementType } from '../properties/elementTypes'
import CropModal, { type CropPatch } from '../crop/CropModal'
import './panel.css'

/** An image can be cropped only when we have real pixels — a data-URL source. */
function croppableImage(el: CanvasElement | null): el is ImageElementType {
  if (!el || el.type !== 'image') return false
  const source = el.originalSrc ?? el.src
  return source.startsWith('data:')
}

function ImageCropTool({ el, onUpdate }: { el: ImageElementType; onUpdate: UpdateElement }) {
  const [open, setOpen] = useState(false)

  const applyCrop = (patch: CropPatch) => {
    onUpdate(el.id, {
      src: patch.src,
      originalSrc: patch.originalSrc,
      crop: patch.crop,
      style: { ...el.style, height: patch.style.height },
    })
    setOpen(false)
  }

  const resetCrop = () => {
    if (!el.originalSrc) return
    onUpdate(el.id, { src: el.originalSrc, originalSrc: undefined, crop: undefined })
  }

  return (
    <>
      <div className="ep-section-label">Image</div>
      <div className="ep-edit-group">
        <button type="button" className="ep-edit-btn" onClick={() => setOpen(true)}>
          {el.crop ? 'Edit crop' : 'Crop to shape'}
        </button>
        {el.crop && (
          <button type="button" className="ep-edit-btn ep-edit-btn--ghost" onClick={resetCrop}>
            Reset crop
          </button>
        )}
      </div>
      {open && <CropModal element={el} onApply={applyCrop} onCancel={() => setOpen(false)} />}
    </>
  )
}

export default function EditPane({ selectedElement, onUpdate }: { selectedElement: CanvasElement | null; onUpdate: UpdateElement }) {
  return (
    <div className="ep-pane">
      {croppableImage(selectedElement) ? (
        <ImageCropTool el={selectedElement} onUpdate={onUpdate} />
      ) : (
        <p className="ep-hint">
          Select an uploaded image to crop it to a shape. Insert elements from the toolbar on the left.
        </p>
      )}
    </div>
  )
}
