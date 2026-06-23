'use strict';

/**
 * lib/templateStore.js
 *
 * Tenant-scoped reads of a template's design + saved mapping, shared by the
 * API-key routes that need them (/v1/generate and /v1/ingest). Centralised so
 * the tenant check and the snake_case→camelCase mapping live in one place.
 */

const { httpError } = require('./apiAuth');

/**
 * Load a template's design, asserting it belongs to `teamId`.
 * Throws httpError(404) when missing or owned by another team.
 * @returns {Promise<{ id: string, team_id: string, body_json: object }>}
 */
async function loadTemplate(sb, teamId, templateId) {
  const { data, error } = await sb
    .from('templates')
    .select('id, team_id, body_json')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.team_id !== teamId) throw httpError(404, 'Template not found for this team.');
  return data;
}

/**
 * Load the saved mapping blob for (team, template), normalised to the camelCase
 * keys the renderer/assembly expect. `bound` reports whether a row existed.
 * @returns {Promise<{ bound: boolean, fieldMapping: object, collectionMappings: object, tableCollectionBindings: object }>}
 */
async function loadBindings(sb, teamId, templateId) {
  const { data } = await sb
    .from('template_bindings')
    .select('field_mapping, collection_mappings, table_collection_bindings')
    .eq('team_id', teamId)
    .eq('template_id', templateId)
    .maybeSingle();
  return {
    bound:                   Boolean(data),
    fieldMapping:            (data && data.field_mapping)             || {},
    collectionMappings:      (data && data.collection_mappings)       || {},
    tableCollectionBindings: (data && data.table_collection_bindings) || {},
  };
}

module.exports = { loadTemplate, loadBindings };
