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

function FontFamilyOptions() {
  return (
    <>
      {FONT_FAMILIES.map((font) => (
        <option key={font.value} value={font.value}>
          {font.label}
        </option>
      ))}
    </>
  );
}

export default FontFamilyOptions;
