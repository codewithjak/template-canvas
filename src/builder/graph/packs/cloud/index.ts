/**
 * index.ts — assembles the cloud DomainPack from its parts and self-registers.
 *
 * Each part is a small single-purpose file (catalog · compile · lint · run),
 * so cloud work never touches another pack's code. This is the per-builder
 * folder shape every pack follows.
 */

import type { DomainPack } from '../../spine/domainPack';
import { registerPack } from '../../spine/registry';
import { awsCatalog } from './catalog';
import { compileToTerraform } from './compile';
import { lintCloud } from './lint';
import { runCloud } from './run';

export const cloudPack: DomainPack = {
  id: 'cloud',
  mode: 'wire',
  catalog: awsCatalog,
  compile: compileToTerraform,
  lint: lintCloud,
  run: runCloud,
};

registerPack(cloudPack);
