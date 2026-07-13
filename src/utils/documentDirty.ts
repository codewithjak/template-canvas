/**
 * documentDirty.ts — value equality for the folded-in savepoint fields
 * (activation doc T0.4). `handlePageSizeChange` and `onGlobalFieldsSave` always
 * allocate a fresh object, so reference identity would read re-picking the same
 * preset (or re-saving identical fields) as a change — a spurious dirty flag,
 * leave-site prompt, and draft write. These compare by value instead.
 */
import type { PageSizeConfig } from '../types/canvas'

export function samePageSize(a: PageSizeConfig, b: PageSizeConfig): boolean {
  return (
    a.preset === b.preset &&
    a.canvasWidth === b.canvasWidth &&
    a.canvasHeight === b.canvasHeight &&
    a.pdfWidth === b.pdfWidth &&
    a.pdfHeight === b.pdfHeight &&
    a.widthInches === b.widthInches &&
    a.heightInches === b.heightInches
  )
}

export function sameStringMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  return ak.every((k) => a[k] === b[k])
}
