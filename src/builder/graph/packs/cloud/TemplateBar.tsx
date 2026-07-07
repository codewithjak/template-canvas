/**
 * TemplateBar.tsx — the cloud builder's design picker.
 *
 * Lists the team's saved cloud templates (blueprints) so a user can open one of
 * many, or start a new one, and rename the current design. Selecting a template
 * loads its blueprint into the canvas; each saved template becomes its own
 * deployment identity for Plan/Apply/Drift (CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md).
 */

import type { TemplateSummary } from '../../../../services/templatesRepo';

export function TemplateBar({ templates, value, name, onSelect, onNew, onRename }: {
  templates: TemplateSummary[];
  value?: string;              // selected template id (undefined = unsaved/new)
  name: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div className="cb-bar">
      <span>Template</span>
      <select
        value={value ?? ''}
        onChange={(e) => (e.target.value ? onSelect(e.target.value) : onNew())}
      >
        <option value="">New template</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <input
        className="tb-name"
        value={name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Template name"
        aria-label="Template name"
      />
      {value ? <span className="cb-sim">saved</span> : <span className="cb-sim">unsaved</span>}
    </div>
  );
}
