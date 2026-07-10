/**
 * FontFamilyOptions.tsx
 *
 * The list of fonts the user can pick from. This same list is shown in a
 * few different places (text, table cells, dates), so it lives in one spot
 * here. Drop it inside any <select> like this:
 *
 *   <select ...>
 *     <FontFamilyOptions />
 *   </select>
 */

/** One row in the font picker: the value we save, and the name we show. */
const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: "'Comic Sans MS', cursive", label: 'Comic Sans MS' },
  { value: "'Lucida Console', monospace", label: 'Lucida Console' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: "'Palatino Linotype', serif", label: 'Palatino Linotype' },
  { value: "'Garamond', serif", label: 'Garamond' },
  { value: "'Book Antiqua', serif", label: 'Book Antiqua' },
  { value: "'Century Gothic', sans-serif", label: 'Century Gothic' },
  { value: "'Lucida Sans Unicode', sans-serif", label: 'Lucida Sans Unicode' },
];

/**
 * The families that are bundled in the export engine (backend/fonts/, see
 * MULTILINGUAL_EXPORT_ARCHITECTURE.md). Non-Latin text always exports with
 * these regardless of the picked family — offering them in the picker makes
 * the preview match the export for RTL/CJK content.
 */
export const INTERNATIONAL_FONT_FAMILIES: { value: string; label: string }[] = [
  { value: "'Noto Sans', sans-serif", label: 'Noto Sans' },
  { value: "'Noto Naskh Arabic', serif", label: 'Noto Naskh Arabic' },
  { value: "'Noto Sans Hebrew', sans-serif", label: 'Noto Sans Hebrew' },
  { value: "'Noto Sans SC', 'Noto Sans CJK SC', sans-serif", label: 'Noto Sans CJK (Chinese/Japanese/Korean)' },
];

/**
 * Suggest the bundled family matching the content's script, or null when the
 * content has no RTL/CJK text or the current family already matches.
 * Ranges mirror the backend's detectScript (renderer/textLayout.js).
 */
export function suggestFontFamilyFor(
  content: string,
  currentFamily: string,
): { value: string; label: string } | null {
  const pick = (label: string) =>
    INTERNATIONAL_FONT_FAMILIES.find((f) => f.label.startsWith(label)) ?? null;

  const suggestion = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(content)
    ? pick('Noto Naskh Arabic')
    : /[֐-׿]/.test(content)
    ? pick('Noto Sans Hebrew')
    : /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(content)
    ? pick('Noto Sans CJK')
    : null;

  if (!suggestion) return null;
  const primary = suggestion.value.split(',')[0].replace(/'/g, '').trim().toLowerCase();
  if ((currentFamily || '').toLowerCase().includes(primary)) return null;
  return suggestion;
}

function FontFamilyOptions() {
  return (
    <>
      <optgroup label="Standard">
        {FONT_FAMILIES.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="International (used at export)">
        {INTERNATIONAL_FONT_FAMILIES.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export default FontFamilyOptions;
