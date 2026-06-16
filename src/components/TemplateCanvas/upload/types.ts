/**
 * types.ts (upload)
 *
 * Shared types for the upload wizard pieces.
 */

/** The four steps of the upload wizard, in order. */
export type Phase =
  | 'intent'   // Phase 0: ask flat or relational
  | 'upload'   // Phase 1: drop a file
  | 'review'   // Phase 1.5: relationship review (relational only)
  | 'mapping'; // Phase 2: confirm mappings
