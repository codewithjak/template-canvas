/**
 * run.ts — cloud pack runtime adapter (in-account ephemeral runner).
 *
 * Stub for P5–P7: assume Connect-Role → launch CodeBuild → terraform plan →
 * human approval → apply → capture outputs → teardown. The real implementation
 * lives backend-side; this client adapter streams progress to the canvas.
 */

import type { RunContext, RunResult } from '../../spine/domainPack';

export async function runCloud(_artifact: string, ctx: RunContext): Promise<RunResult> {
  ctx.onProgress?.({ status: 'log', message: 'Cloud runtime not yet implemented (P5–P7).' });
  return { ok: false, logs: ['runtime stub'] };
}
