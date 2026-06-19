/**
 * pdfImport/tokens.ts — shared {{placeholder}} helpers.
 *
 * One definition of the token syntax, reused by signature extraction, slot
 * extraction, and anywhere else that reads/strips `{{snake_case}}` tokens.
 * Each call uses a fresh regex so there are no shared-`lastIndex` surprises.
 */

const TOKEN_SOURCE = String.raw`\{\{\s*([^}]+?)\s*\}\}`;

/** The inner names of every `{{token}}` in a string, trimmed. */
export function tokensIn(s: string): string[] {
  const re = new RegExp(TOKEN_SOURCE, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1].trim());
  return out;
}

/** The string with every `{{token}}` replaced by a single space. */
export function stripTokens(s: string): string {
  return s.replace(new RegExp(TOKEN_SOURCE, 'g'), ' ');
}
