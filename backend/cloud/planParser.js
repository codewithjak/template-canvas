'use strict';

/**
 * backend/cloud/planParser.js
 *
 * Parse `terraform plan -json` (newline-delimited JSON) into the structured diff
 * the UI shows. Pure + dependency-free — unit testable with sample output.
 *
 * Relevant message types:
 *   planned_change  → one resource change (action + address)
 *   change_summary  → totals { add, change, remove }
 */

const ACTIONS = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  replace: 'replace',
  read: 'read',
  'no-op': 'no-op',
};

function normAction(a) {
  return ACTIONS[a] || 'no-op';
}

function parsePlanJson(ndjson) {
  const lines = String(ndjson).split('\n').map((s) => s.trim()).filter(Boolean);
  const resources = [];
  let summary = { add: 0, change: 0, destroy: 0 };

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    if (msg.type === 'planned_change' && msg.change) {
      const r = msg.change.resource || {};
      resources.push({
        address: r.addr || '',
        type: r.resource_type || '',
        name: r.resource_name || '',
        action: normAction(msg.change.action),
      });
    } else if (msg.type === 'change_summary' && msg.changes) {
      summary = {
        add: msg.changes.add || 0,
        change: msg.changes.change || 0,
        destroy: msg.changes.remove || 0,
      };
    }
  }

  return { summary, resources };
}

module.exports = { parsePlanJson };
