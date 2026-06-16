'use strict';

/**
 * fileNames.js
 *
 * Small helpers for turning user-supplied names into safe download file names,
 * keeping names unique inside a zip, and picking the right file extension for
 * an export format. All pure functions — give them values, get a value back.
 */

/** Strip characters that are unsafe in a file name and make sure it ends in `ext`. */
function sanitizeFileName(name, fallback, ext = '.pdf') {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const base = cleaned || fallback;
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

/** Like sanitizeFileName but always ends in `.zip` (and drops a trailing `.pdf`). */
function sanitizeZipName(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const base = cleaned || fallback;
  return base.toLowerCase().endsWith('.zip') ? base : `${base.replace(/\.pdf$/i, '')}.zip`;
}

/**
 * Make `name` unique within the `used` set. If it's already taken, append
 * `-2`, `-3`, … before the extension until it's free. Records the result.
 */
function uniqueFileName(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot  = name.toLowerCase().endsWith('.pdf') ? name.length - 4 : name.length;
  const base = name.slice(0, dot);
  const ext  = name.slice(dot);
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) { i += 1; candidate = `${base}-${i}${ext}`; }
  used.add(candidate);
  return candidate;
}

/** File extension for an export format (image formats included). */
function extForFormat(format) {
  if (format === 'zpl') return '.zpl';
  if (format === 'png') return '.png';
  if (format === 'jpeg' || format === 'jpg') return '.jpg';
  return '.pdf';
}

/** Insert a `-p{n}` page marker before the extension, only for multi-page docs. */
function withPageSuffix(safeName, ext, pageIndex, multi) {
  if (!multi) return safeName;
  const stem = safeName.toLowerCase().endsWith(ext.toLowerCase()) ? safeName.slice(0, -ext.length) : safeName;
  return `${stem}-p${pageIndex + 1}${ext}`;
}

module.exports = {
  sanitizeFileName,
  sanitizeZipName,
  uniqueFileName,
  extForFormat,
  withPageSuffix,
};
