'use strict';

/**
 * backend/cloud/planSim.js
 *
 * Local simulated plan from compiled HCL — every resource shown as an addition.
 * Lets the run endpoint return a usable plan when no verified account / AWS
 * credentials are configured, so the flow is demonstrable without a real plan.
 */

const RESOURCE_RE = /resource\s+"([^"]+)"\s+"([^"]+)"/g;

function simulatePlanFromHcl(hcl) {
  const resources = [];
  let m;
  while ((m = RESOURCE_RE.exec(String(hcl))) !== null) {
    resources.push({ address: `${m[1]}.${m[2]}`, type: m[1], name: m[2], action: 'create' });
  }
  RESOURCE_RE.lastIndex = 0;
  return { summary: { add: resources.length, change: 0, destroy: 0 }, resources, simulated: true };
}

module.exports = { simulatePlanFromHcl };
