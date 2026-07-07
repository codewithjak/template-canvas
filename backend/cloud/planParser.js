'use strict';

/**
 * backend/cloud/planParser.js
 *
 * Parse `terraform plan -json` (newline-delimited JSON) into the structured diff
 * the UI shows. Pure + dependency-free — unit testable with sample output.
 *
 * Terraform reports two different things, on two different message types:
 *   planned_change  → a change Terraform PROPOSES to make (what `plan`/`apply` do)
 *   resource_drift  → a change that ALREADY HAPPENED outside Terraform (what a
 *                     `-refresh-only` drift check is about)
 *   change_summary  → totals { add, change, remove } for planned changes
 *
 * These must not be conflated: a normal plan's proposed changes are not drift, and
 * a refresh-only check's drift is reported ONLY as resource_drift (with an empty
 * change_summary, since refresh-only proposes no actions). So `parsePlanJson`
 * (proposed changes) and `parseDriftJson` (out-of-band drift) read different types.
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

/** A change/drift message's `change` block → the UI resource shape. */
function toResource(change) {
  const r = (change && change.resource) || {};
  return {
    address: r.addr || '',
    type: r.resource_type || '',
    name: r.resource_name || '',
    action: normAction(change && change.action),
  };
}

/** Collect planned changes, drift, and the summary in one pass. */
function collect(ndjson) {
  const lines = String(ndjson).split('\n').map((s) => s.trim()).filter(Boolean);
  const changes = [];
  const drift = [];
  let summary = { add: 0, change: 0, destroy: 0 };

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    if (msg.type === 'planned_change' && msg.change) {
      changes.push(toResource(msg.change));
    } else if (msg.type === 'resource_drift' && msg.change) {
      drift.push(toResource(msg.change));
    } else if (msg.type === 'change_summary' && msg.changes) {
      summary = {
        add: msg.changes.add || 0,
        change: msg.changes.change || 0,
        destroy: msg.changes.remove || 0,
      };
    }
  }

  return { summary, changes, drift };
}

/** Summarize a resource list by action (for the refresh-only path, whose
 *  change_summary is empty). */
function summarize(resources) {
  const summary = { add: 0, change: 0, destroy: 0 };
  for (const r of resources) {
    if (r.action === 'delete') summary.destroy += 1;
    else if (r.action === 'create') summary.add += 1;
    else summary.change += 1;
  }
  return summary;
}

/** Proposed changes from a normal `terraform plan -json` (plan/apply path). */
function parsePlanJson(ndjson) {
  const { summary, changes } = collect(ndjson);
  return { summary, resources: changes };
}

/**
 * Out-of-band drift from a `terraform plan -refresh-only -json` check. Drift is
 * carried on resource_drift messages; the change_summary is 0/0/0 in refresh-only,
 * so the summary is derived from the drift itself.
 */
function parseDriftJson(ndjson) {
  const { drift } = collect(ndjson);
  return { summary: summarize(drift), resources: drift };
}

module.exports = { parsePlanJson, parseDriftJson };
