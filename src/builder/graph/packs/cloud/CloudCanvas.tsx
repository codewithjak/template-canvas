/**
 * CloudCanvas.tsx — the cloud builder. Thin wrapper over the shared parent that
 * adds the cloud-specific bars: a Template picker (which saved blueprint you are
 * editing) and a Run target (which AWS connection Plan/Apply/Drift use). Each
 * saved template is its own deployment identity, so one account can hold many
 * infras without their state colliding (CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md).
 * All other cloud logic lives in ./catalog ./compile ./lint ./run ./architect.
 */

import { useEffect, useState } from 'react';
import { GraphCanvasBase } from '../../GraphCanvasBase';
import { ConnectionBar } from './ConnectionBar';
import { TemplateBar } from './TemplateBar';
import { DeploymentsPanel } from './DeploymentsPanel';
import { cloudPack } from './index';
import type { Blueprint } from '../../../types/blueprint';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  type TemplateSummary,
} from '../../../../services/templatesRepo';
import './CloudCanvas.css';

/** Coerce stored body_json into a usable Blueprint, or undefined for an empty canvas. */
function asBlueprint(body: unknown): Blueprint | undefined {
  return body && Array.isArray((body as Blueprint).nodes) ? (body as Blueprint) : undefined;
}

export const CloudCanvas = () => {
  const [connectionId, setConnectionId] = useState<string | undefined>();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [templateName, setTemplateName] = useState('Untitled');
  const [initial, setInitial] = useState<Blueprint | undefined>();
  // Bumped on load/new to remount the canvas with fresh initial nodes/edges.
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    listTemplates('cloud').then(setTemplates).catch(() => setTemplates([]));
  }, []);

  async function selectTemplate(id: string) {
    const rec = await getTemplate(id);
    setTemplateId(id);
    setTemplateName(rec.name);
    setInitial(asBlueprint(rec.body_json));
    setLoadKey((k) => k + 1);
  }

  function newTemplate() {
    setTemplateId(undefined);
    setTemplateName('Untitled');
    setInitial(undefined);
    setLoadKey((k) => k + 1);
  }

  async function save(bp: Blueprint) {
    if (templateId) {
      await updateTemplate(templateId, templateName, bp);
    } else {
      const id = await createTemplate(templateName, bp, 'cloud');
      setTemplateId(id);
    }
    setTemplates(await listTemplates('cloud'));
  }

  return (
    <div className="cloud-canvas">
      <TemplateBar
        templates={templates}
        value={templateId}
        name={templateName}
        onSelect={(id) => void selectTemplate(id)}
        onNew={newTemplate}
        onRename={setTemplateName}
      />
      <ConnectionBar value={connectionId} onChange={setConnectionId} />
      <DeploymentsPanel
        connectionId={connectionId}
        currentTemplateId={templateId}
        onOpen={(id) => void selectTemplate(id)}
      />
      <div className="cloud-canvas-body">
        <GraphCanvasBase
          key={loadKey}
          pack={cloudPack}
          initial={initial}
          connectionId={connectionId}
          templateId={templateId}
          onSave={save}
        />
      </div>
    </div>
  );
};
