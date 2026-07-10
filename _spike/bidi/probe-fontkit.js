'use strict';
// SPIKE (throwaway) — MULTILINGUAL_EXPORT_ARCHITECTURE.md task 2.1.
// Questions:
//   Q1. For a single Arabic run, does fontkit's layout() return glyphs in
//       VISUAL order (RTL already applied) or logical order?
//   Q2. Does it apply contextual joining (init/medi/fina forms)?
//   Q3. What happens to Arabic-Indic digits inside an Arabic run?
// The answers decide whether Phase 2 needs a reshaper at all or only
// line-level bidi run reordering.

const fontkit = require('/home/user/template-canvas/backend/node_modules/@pdf-lib/fontkit');
const fs = require('fs');

const naskh = fontkit.create(fs.readFileSync('/home/user/template-canvas/backend/fonts/NotoNaskhArabic-Regular.ttf'));

function probe(label, text) {
  const run = naskh.layout(text);
  const ids = run.glyphs.map(g => g.id);
  const names = run.glyphs.map(g => g.name || '?');
  console.log(`\n${label}: ${JSON.stringify(text)}`);
  console.log('  direction:', run.direction);
  console.log('  glyph names:', names.join(' '));
  console.log('  glyph ids  :', ids.join(' '));
}

// 'باب' = beh alef beh: if joining works, first beh (logical) is INITIAL form,
// last beh is FINAL form. If visual order is applied, the FINAL-form beh
// (logically last) appears FIRST in the glyph array.
probe('Q1/Q2 three letters', 'باب');

// Isolated vs joined: same letter alone
probe('isolated beh', 'ب');

// Q3: Arabic-Indic digits inside Arabic text — digits must stay LTR (١٢٣ = ١٢٣)
probe('digits in Arabic', 'رقم ١٢٣');

// Mixed neutral: space + punctuation between Arabic words
probe('two words', 'مرحبا بالعالم');
