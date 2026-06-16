/**
 * MappingPhase.tsx
 *
 * Phase 2 of the wizard: confirm how the data maps to the template. It is made
 * of a few smaller sections, each its own little component below:
 *   - RelationshipSummary : the confirmed links between collections (relational)
 *   - DataFieldsSection    : placeholders that fill in automatically from data
 *   - MetadataSection      : document-level values the user types once
 *   - TableSourcesSection  : pick which collection feeds each table
 */

import type { ClassificationResult } from '../../../utils/classifyPlaceholders';
import type { CanonicalDocument, CollectionMappings, TableCollectionBindings, TableInfo } from '../../../types/dataSource';
import type { RelationshipReviewResult } from '../RelationshipReview';

interface Props {
  ir: CanonicalDocument;
  classification: ClassificationResult | null;
  reviewResult: RelationshipReviewResult | null;
  autoDriverKey: string | undefined;
  tables: TableInfo[];
  collectionKeys: string[];
  tableCollectionBindings: TableCollectionBindings;
  collectionMappings: CollectionMappings;
  metaValues: Record<string, string>;
  missingMetaCount: number;
  onMetaChange: (placeholder: string, value: string) => void;
  onCollectionChange: (tableId: string, collKey: string) => void;
  onColumnMapChange: (collKey: string, placeholder: string, columnName: string) => void;
}

function MappingPhase(props: Props) {
  const { ir, classification, reviewResult, autoDriverKey, tables } = props;

  return (
    <>
      {reviewResult && Object.keys(reviewResult.scopingRules).length > 0 && (
        <RelationshipSummary reviewResult={reviewResult} driverKey={autoDriverKey} />
      )}

      {classification && classification.collectionScalars.length > 0 && (
        <DataFieldsSection classification={classification} />
      )}

      {classification && classification.trueMetadata.length > 0 && (
        <MetadataSection
          placeholders={classification.trueMetadata}
          metaValues={props.metaValues}
          missingMetaCount={props.missingMetaCount}
          onMetaChange={props.onMetaChange}
        />
      )}

      {tables.length > 0 && (
        <TableSourcesSection
          ir={ir}
          tables={tables}
          collectionKeys={props.collectionKeys}
          tableCollectionBindings={props.tableCollectionBindings}
          collectionMappings={props.collectionMappings}
          onCollectionChange={props.onCollectionChange}
          onColumnMapChange={props.onColumnMapChange}
        />
      )}
    </>
  );
}

/** Shows the confirmed "driver → child" links from the relationship review. */
function RelationshipSummary({
  reviewResult,
  driverKey,
}: {
  reviewResult: RelationshipReviewResult;
  driverKey: string | undefined;
}) {
  return (
    <div className="up-section up-rel-summary">
      <div className="up-section-head">
        <span className="up-section-label">Relationships confirmed</span>
        <span className="up-pill up-pill-green">
          {Object.keys(reviewResult.scopingRules).length} linked
        </span>
      </div>
      <div className="up-rel-chips">
        {Object.entries(reviewResult.scopingRules).map(([collKey, rule]) => (
          <div key={collKey} className="up-rel-chip">
            <span className="up-rel-chip-driver">{driverKey}</span>
            <span className="up-rel-chip-arrow">→</span>
            <span className="up-rel-chip-child">{collKey}</span>
            <span className="up-rel-chip-keys">
              via {rule.driverRowField} · {rule.filterColumn}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholders that resolve automatically from collection columns or fields. */
function DataFieldsSection({ classification }: { classification: ClassificationResult }) {
  return (
    <div className="up-section">
      <div className="up-section-head">
        <span className="up-section-label">Fields from data</span>
        <span className="up-pill up-pill-green">
          {classification.collectionScalars.length} auto-resolved
        </span>
      </div>
      <p className="up-section-hint">
        These resolve automatically per record during export — no action needed.
      </p>
      <div className="up-field-list">
        {classification.collectionScalars.map((info) => (
          <div key={info.placeholder} className="up-field-row">
            <span className="up-field-key">{`{{${info.placeholder}}}`}</span>
            <span className="up-field-source">
              from <code>{info.collectionKey}.{info.columnName}</code>
            </span>
            <span className="up-badge up-badge-auto">auto</span>
          </div>
        ))}
        {classification.alreadyResolved.map((ph) => (
          <div key={ph} className="up-field-row">
            <span className="up-field-key">{`{{${ph}}}`}</span>
            <span className="up-field-source">from data fields</span>
            <span className="up-badge up-badge-auto">auto</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Document-level values that aren't in the data — the user types them once. */
function MetadataSection({
  placeholders,
  metaValues,
  missingMetaCount,
  onMetaChange,
}: {
  placeholders: string[];
  metaValues: Record<string, string>;
  missingMetaCount: number;
  onMetaChange: (placeholder: string, value: string) => void;
}) {
  return (
    <div className="up-section">
      <div className="up-section-head">
        <span className="up-section-label">Document-level fields</span>
        <span className={`up-pill ${missingMetaCount > 0 ? 'up-pill-amber' : 'up-pill-green'}`}>
          {missingMetaCount > 0 ? `${missingMetaCount} need values` : 'all set'}
        </span>
      </div>
      <p className="up-section-hint">
        Not in your data — same value across all documents. Saved to template.
      </p>
      <div className="up-field-list">
        {placeholders.map((ph) => {
          const value = metaValues[ph] ?? '';
          const isSet = value.trim().length > 0;
          return (
            <div key={ph} className="up-meta-row">
              <span className="up-field-key">{`{{${ph}}}`}</span>
              <input
                className="up-meta-input"
                type="text"
                value={value}
                placeholder="Enter value…"
                onChange={(e) => onMetaChange(ph, e.target.value)}
              />
              <span className={`up-badge ${isSet ? 'up-badge-set' : 'up-badge-required'}`}>
                {isSet ? 'set' : 'required'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** For each table, pick the source collection and map its columns. */
function TableSourcesSection({
  ir,
  tables,
  collectionKeys,
  tableCollectionBindings,
  collectionMappings,
  onCollectionChange,
  onColumnMapChange,
}: {
  ir: CanonicalDocument;
  tables: TableInfo[];
  collectionKeys: string[];
  tableCollectionBindings: TableCollectionBindings;
  collectionMappings: CollectionMappings;
  onCollectionChange: (tableId: string, collKey: string) => void;
  onColumnMapChange: (collKey: string, placeholder: string, columnName: string) => void;
}) {
  return (
    <div className="up-section">
      <div className="up-section-head">
        <span className="up-section-label">Table data sources</span>
        <span className="up-pill up-pill-gray">{tables.length} table{tables.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="up-section-hint">
        Choose which collection provides rows for each table.
      </p>
      {tables.map((table) => {
        const boundCollKey = tableCollectionBindings[table.id] ?? '';
        const boundCol = boundCollKey ? ir.collections[boundCollKey] : null;
        const colHeaders = boundCol?.columns ?? [];
        const colMap = collectionMappings[boundCollKey] ?? {};
        return (
          <div key={table.id} className="up-table-card">
            <div className="up-table-card-head">
              <span>⊞</span>
              <span>{table.label}</span>
              {boundCol && (
                <span className="up-pill up-pill-green" style={{ marginLeft: 'auto' }}>
                  {boundCollKey} · {boundCol.rows.length} rows
                </span>
              )}
            </div>
            <div className="up-table-card-body">
              <div className="up-coll-row">
                <span className="up-coll-label">Collection</span>
                <select
                  className="up-coll-select"
                  value={boundCollKey}
                  onChange={(e) => onCollectionChange(table.id, e.target.value)}
                >
                  <option value="">— select —</option>
                  {collectionKeys.map((k) => (
                    <option key={k} value={k}>
                      {k} ({ir.collections[k].rows.length} rows)
                    </option>
                  ))}
                </select>
              </div>
              {boundCol && table.placeholders.length > 0 && (
                <div className="up-col-map-grid">
                  {table.placeholders.map((ph) => (
                    <div key={ph} className="up-col-map-row">
                      <span className="up-col-map-key">{`{{${ph}}}`}</span>
                      <span className="up-col-map-arrow">→</span>
                      <select
                        className="up-col-map-sel"
                        value={colMap[ph] ?? ''}
                        onChange={(e) => onColumnMapChange(boundCollKey, ph, e.target.value)}
                      >
                        <option value="">— column —</option>
                        {colHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MappingPhase;
