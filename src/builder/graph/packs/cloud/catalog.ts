/**
 * catalog.ts — cloud pack node catalog (v1 stub).
 *
 * One factory per node type — same shape as src/components/.../elementFactories.ts.
 * Target ~10 core AWS nodes (VISUAL_CLOUD_BUILDER_ARCHITECTURE.md P2). This stub
 * ships two to prove the structure; fill the rest in P2.
 */

import type { CatalogEntry, NodeCatalog } from '../../spine/domainPack';
import type { GraphNode } from '../../../types/blueprint';

const newId = (prefix: string) => `${prefix}-${Date.now()}`;

const vpc: CatalogEntry = {
  type: 'aws_vpc',
  label: 'VPC',
  group: 'Network',
  create: (): GraphNode => ({ id: newId('vpc'), type: 'aws_vpc', props: { cidr: '10.0.0.0/16' } }),
  fields: [{ key: 'cidr', label: 'CIDR block', kind: 'text' }],
};

const instance: CatalogEntry = {
  type: 'aws_instance',
  label: 'EC2 Instance',
  group: 'Compute',
  create: (): GraphNode => ({ id: newId('ec2'), type: 'aws_instance', props: { size: 't3.micro' } }),
  fields: [{
    key: 'size',
    label: 'Instance type',
    kind: 'select',
    options: ['t3.micro', 't3.small', 't3.medium'],
  }],
};

export const awsCatalog: NodeCatalog = [vpc, instance];
