'use strict';

/**
 * normalizeKeys.js
 *
 * The app may send collection names and bindings in any letter case. These
 * helpers lower-case (and trim) the keys so later lookups can be
 * case-insensitive without sprinkling `.toLowerCase()` everywhere.
 */

/** Lower-case + trim the keys of a collections object. */
const normalizeCollectionKeys = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim().toLowerCase(), v]));

/** Lower-case + trim each binding's value (the collection it points at). */
const normalizeBindingKeys = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v.trim().toLowerCase() : v])
  );

/** Lower-case + trim the keys of a collection-mappings object. */
const normalizeCollectionMappings = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim().toLowerCase(), v]));

module.exports = {
  normalizeCollectionKeys,
  normalizeBindingKeys,
  normalizeCollectionMappings,
};
