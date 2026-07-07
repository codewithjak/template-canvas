/**
 * icons.tsx
 *
 * The toolbar's little SVG pictures, one per button. Each is a tiny component
 * that draws a 16×16 icon in the current text colour. They were moved out of
 * Toolbar.tsx so the toolbar file is about layout, not drawing.
 *
 * Use them like: <Icons.Text /> or <Icons.Save />.
 */

export const Icons = {
  Text: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12M8 3v10M5 13h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Table: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1.5 6h13M6 1.5v13" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Image: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6"/>
      <path d="m1.5 10.5 4-4 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Watermark: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" opacity=".45"/>
      <path d="m4 11 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/>
      <path d="M4.5 5.5h3M6 4v3M9.5 10.5h2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
    </svg>
  ),
  Signature: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
      <path d="M3 9.5c1.2-3.8 2.2-5.6 3-5.4 1 .3-.7 5.8.5 6 1 .2 1.8-2.5 2.8-2.3.7.1.5 1.9 1.4 1.9.6 0 1.1-.7 1.6-1.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Paragraph: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M7 2h5M7 5.5h5M2 9h12M2 12.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.5 2v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 2h4a2 2 0 0 1 0 4H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Radio: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="5" r="1.2" fill="currentColor"/>
      <circle cx="5" cy="11" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 5h4M10 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Checkbox: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="m3.5 5 1.5 1.5L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="2" y="10" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" opacity=".4"/>
      <path d="M10 5h4M10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Date: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1.5 7h13M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="9" width="2.5" height="2.5" rx=".5" fill="currentColor" opacity=".6"/>
    </svg>
  ),
  Line: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  Box: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  Rectangle: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  Triangle: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 15 14H1L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Ellipse: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="8" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  AddPage: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7h3M12.5 5.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Ruler: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 3.5v3M7 3.5v2M9.5 3.5v3M12 3.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M2 9h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Save: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3a1 1 0 0 1 1-1h8l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 2v3h6V2M5 9h6v5H5V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Library: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 2.5h3v11h-3zM6.5 2.5h3v11h-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="m10.6 3 2.9.8-2.4 9.5-2.9-.8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Folder: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5a1 1 0 0 1 1-1h3l1.3 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Load: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 9v4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 2v7M5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 9V2M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Export: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Delete: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Shapes: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="11.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14 5 9l3 5H2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  Barcode: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="2" height="12" fill="currentColor"/>
      <rect x="4" y="2" width="1" height="12" fill="currentColor"/>
      <rect x="6" y="2" width="2" height="12" fill="currentColor"/>
      <rect x="9" y="2" width="1" height="12" fill="currentColor"/>
      <rect x="11" y="2" width="1.5" height="12" fill="currentColor"/>
      <rect x="13" y="2" width="2" height="12" fill="currentColor"/>
    </svg>
  ),
  Chart: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="8" width="2.2" height="4" fill="currentColor"/>
      <rect x="7.4" y="5" width="2.2" height="7" fill="currentColor"/>
      <rect x="10.8" y="9.5" width="2.2" height="2.5" fill="currentColor"/>
    </svg>
  ),
  Ai: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M12.5 10.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5Z" fill="currentColor"/>
    </svg>
  ),
  PageSize: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13 4v9.5a1.5 1.5 0 0 1-1.5 1.5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 5h3M5 7.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
    </svg>
  ),
};
