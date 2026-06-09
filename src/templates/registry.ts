/**
 * src/templates/registry.ts
 *
 * Built-in starter templates that ship with the app. These are static JSON
 * assets (layout + matching sample data) bundled into the build — no DB,
 * no network. Opening one loads it onto the canvas as a fresh UNSAVED
 * template (currentTemplateId = null), so the user can edit and "Save" it
 * as their own without touching the originals.
 *
 * To add a template: drop `<id>.template.json` + `<id>.data.json` in
 * ./builtins, import them below, and add one entry to BUILTIN_TEMPLATES.
 */
import type { TemplateDocument } from '../types/canvas'
import type { CanonicalDocument } from '../types/dataSource'

import invoiceDoc from './builtins/invoice.template.json'
import invoiceData from './builtins/invoice.data.json'
import shippingLabelDoc from './builtins/shipping-label.template.json'
import shippingLabelData from './builtins/shipping-label.data.json'
import quotationDoc from './builtins/quotation.template.json'
import quotationData from './builtins/quotation.data.json'
import medicalReportDoc from './builtins/medical-report.template.json'
import medicalReportData from './builtins/medical-report.data.json'
import procurementReportDoc from './builtins/procurement-report.template.json'
import procurementReportData from './builtins/procurement-report.data.json'

export type BuiltinCategory = 'Billing' | 'Shipping' | 'Reports' | 'Office'

export interface BuiltinTemplate {
  /** Stable id — used as React key and for "currently open" comparisons. */
  id: string
  name: string
  description: string
  category: BuiltinCategory
  /** Page-size label shown on the card, e.g. "A4" or "4×6". */
  sizeLabel: string
  /** The layout loaded onto the canvas. */
  doc: TemplateDocument
  /** Matching sample data the user can load to exercise data-binding. */
  data: CanonicalDocument
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-invoice',
    name: 'Invoice',
    description: 'Clean A4 invoice with itemized table and totals.',
    category: 'Billing',
    sizeLabel: 'A4',
    doc: invoiceDoc as unknown as TemplateDocument,
    data: invoiceData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-shipping-label',
    name: 'Shipping Label',
    description: '4×6 thermal label with barcode and tracking.',
    category: 'Shipping',
    sizeLabel: '4×6',
    doc: shippingLabelDoc as unknown as TemplateDocument,
    data: shippingLabelData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-quotation',
    name: 'Quotation',
    description: 'A4 sales quote with branded header, line items, discount/tax totals, and signature block.',
    category: 'Billing',
    sizeLabel: 'A4',
    doc: quotationDoc as unknown as TemplateDocument,
    data: quotationData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-medical-report',
    name: 'Medical Report',
    description: 'A4 clinical exam report with patient panel, vital-signs table, findings, and physician sign-off.',
    category: 'Reports',
    sizeLabel: 'A4',
    doc: medicalReportDoc as unknown as TemplateDocument,
    data: medicalReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-procurement-report',
    name: 'Procurement Report',
    description: 'A4 quarterly procurement summary with spend stat cards, purchase-order table, and approvals.',
    category: 'Reports',
    sizeLabel: 'A4',
    doc: procurementReportDoc as unknown as TemplateDocument,
    data: procurementReportData as unknown as CanonicalDocument,
  },
]
