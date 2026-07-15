/**
 * locales/en.ts
 *
 * English message catalog for the notification module. Every user-facing
 * string the module shows lives here under a stable dotted key, so adding a
 * new language is just dropping in a sibling file with the same keys (see
 * locales/index.ts).
 *
 * Placeholders use `{name}` syntax and are filled in by t() at call time:
 *   t('templates.deleteConfirm', { name: 'Tax Invoice' })
 */

const en = {
  // Generic labels — reused across dialogs/toasts.
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.remove': 'Remove',
  'common.revoke': 'Revoke',
  'common.notice': 'Notice',
  'common.success': 'Success',
  'common.error': 'Something went wrong',
  'common.warning': 'Heads up',

  // Images
  'image.selectImageFile': 'Please select an image file.',

  // Templates — save / load / delete
  'template.saveFailed': 'Could not save template: {error}',
  'template.openFailed': 'Could not open that template: {error}',
  'template.invalidFile': 'Invalid template file.',
  'template.readError': 'Error reading template file.',
  'templates.deleteConfirm': 'Delete “{name}”? This cannot be undone.',

  // Export
  'export.nothingToExport': 'No template to export.',
  'export.failed': 'Export failed.',

  // Team / invites / members / API keys
  'invite.revokeConfirm': 'Revoke this invite? The link will stop working.',
  'member.removeConfirm': 'Remove {name} from the team?',
  'apiKey.revokeConfirm':
    'Revoke this API key? Any system using it will stop working immediately.',
} as const;

/** The set of valid message keys, derived from the English catalog. */
export type MessageKey = keyof typeof en;

/** Every locale must provide a string for each key the English catalog defines. */
export type Catalog = Record<MessageKey, string>;

export default en;
