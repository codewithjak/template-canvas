/**
 * src/account/sectionIcons.tsx
 *
 * The header icon set for account sections. Kept in its own module so
 * `SectionCard.tsx` exports only a component (react-refresh/only-export-components).
 */
export const ICONS = {
  plan: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 7l7-4 7 4-7 4-7-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3 11l7 4 7-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
  ),
  team: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 16a4.5 4.5 0 0 1 9 0M13 5.2a2.5 2.5 0 0 1 0 4.6M14.5 16a4.5 4.5 0 0 0-2.2-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  key: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M9.5 10.5 16 4M13 4h3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  usage: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 16V9M10 16V4M16 16v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  ),
  push: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V5m0 0L6 9m4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
}
