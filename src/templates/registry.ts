/**
 * src/templates/registry.ts
 *
 * Built-in starter templates that ship with the app. Each is a static JSON
 * asset (tokenized layout + matching sample data) bundled into the build — no
 * DB, no network. Opening one loads it onto the canvas as a fresh UNSAVED
 * template (currentTemplateId = null), pre-filled from its sample data, so the
 * user can edit it directly and "Save" it as their own without touching the
 * shipped original.
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
import billOfLadingDoc from './builtins/bill-of-lading.template.json'
import billOfLadingData from './builtins/bill-of-lading.data.json'
import freightManifestDoc from './builtins/freight-manifest.template.json'
import freightManifestData from './builtins/freight-manifest.data.json'
import customsDeclarationDoc from './builtins/customs-declaration.template.json'
import customsDeclarationData from './builtins/customs-declaration.data.json'
import deliveryNoteDoc from './builtins/delivery-note.template.json'
import deliveryNoteData from './builtins/delivery-note.data.json'
import quotationDoc from './builtins/quotation.template.json'
import quotationData from './builtins/quotation.data.json'
import siteInspectionReportDoc from './builtins/site-inspection-report.template.json'
import siteInspectionReportData from './builtins/site-inspection-report.data.json'
import safetyReportDoc from './builtins/safety-report.template.json'
import safetyReportData from './builtins/safety-report.data.json'
import projectProgressReportDoc from './builtins/project-progress-report.template.json'
import projectProgressReportData from './builtins/project-progress-report.data.json'
import complianceCertificateDoc from './builtins/compliance-certificate.template.json'
import complianceCertificateData from './builtins/compliance-certificate.data.json'
import claimsReportDoc from './builtins/claims-report.template.json'
import claimsReportData from './builtins/claims-report.data.json'
import policyDocumentDoc from './builtins/policy-document.template.json'
import policyDocumentData from './builtins/policy-document.data.json'
import insuranceInspectionReportDoc from './builtins/insurance-inspection-report.template.json'
import insuranceInspectionReportData from './builtins/insurance-inspection-report.data.json'
import renewalNoticeDoc from './builtins/renewal-notice.template.json'
import renewalNoticeData from './builtins/renewal-notice.data.json'
import medicalReportDoc from './builtins/medical-report.template.json'
import medicalReportData from './builtins/medical-report.data.json'
import labReportDoc from './builtins/lab-report.template.json'
import labReportData from './builtins/lab-report.data.json'
import medicalCertificateDoc from './builtins/medical-certificate.template.json'
import medicalCertificateData from './builtins/medical-certificate.data.json'
import healthcareInvoiceDoc from './builtins/healthcare-invoice.template.json'
import healthcareInvoiceData from './builtins/healthcare-invoice.data.json'
import equipmentServiceReportDoc from './builtins/equipment-service-report.template.json'
import equipmentServiceReportData from './builtins/equipment-service-report.data.json'
import procurementReportDoc from './builtins/procurement-report.template.json'
import procurementReportData from './builtins/procurement-report.data.json'
import qualityInspectionReportDoc from './builtins/quality-inspection-report.template.json'
import qualityInspectionReportData from './builtins/quality-inspection-report.data.json'
import certificateOfConformityDoc from './builtins/certificate-of-conformity.template.json'
import certificateOfConformityData from './builtins/certificate-of-conformity.data.json'
import productionReportDoc from './builtins/production-report.template.json'
import productionReportData from './builtins/production-report.data.json'
import packingListDoc from './builtins/packing-list.template.json'
import packingListData from './builtins/packing-list.data.json'
import eventQuotationDoc from './builtins/event-quotation.template.json'
import eventQuotationData from './builtins/event-quotation.data.json'
import realtorBrochureDoc from './builtins/realtor-brochure.template.json'
import realtorBrochureData from './builtins/realtor-brochure.data.json'
import postexLoadSheetDoc from './builtins/postex-load-sheet.template.json'
import postexLoadSheetData from './builtins/postex-load-sheet.data.json'
import postexRunSheetDoc from './builtins/postex-run-sheet.template.json'
import postexRunSheetData from './builtins/postex-run-sheet.data.json'
import postexSettlementDoc from './builtins/postex-settlement.template.json'
import postexSettlementData from './builtins/postex-settlement.data.json'
import postexMerchantInvoiceDoc from './builtins/postex-merchant-invoice.template.json'
import postexMerchantInvoiceData from './builtins/postex-merchant-invoice.data.json'
import postexPodDoc from './builtins/postex-pod.template.json'
import postexPodData from './builtins/postex-pod.data.json'
import arabicTaxInvoiceDoc from './builtins/arabic-tax-invoice.template.json'
import arabicTaxInvoiceData from './builtins/arabic-tax-invoice.data.json'
import zatcaReceiptDoc from './builtins/zatca-simplified-receipt.template.json'
import zatcaReceiptData from './builtins/zatca-simplified-receipt.data.json'
import arabicAnnualReportDoc from './builtins/arabic-annual-report.template.json'
import arabicAnnualReportData from './builtins/arabic-annual-report.data.json'

export type BuiltinCategory =
  | 'Courier & Last-Mile'
  | 'Logistics & Freight'
  | 'Construction & Engineering'
  | 'Insurance'
  | 'Healthcare'
  | 'Manufacturing'
  | 'Events & Hospitality'
  | 'Real Estate'
  | 'Arabic (RTL)'

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
  /** Matching sample data that fills the template on open. */
  data: CanonicalDocument
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  // ── Courier & Last-Mile (PostEx e-commerce logistics) ──
  {
    id: 'builtin-postex-load-sheet',
    name: 'Load Sheet',
    description: 'Hub dispatch load sheet: parcels, CN numbers, COD and rider sign-off.',
    category: 'Courier & Last-Mile',
    sizeLabel: 'A4',
    doc: postexLoadSheetDoc as unknown as TemplateDocument,
    data: postexLoadSheetData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-postex-run-sheet',
    name: 'Run Sheet',
    description: 'Rider delivery run with COD-to-collect and per-stop status/signature columns.',
    category: 'Courier & Last-Mile',
    sizeLabel: 'A4',
    doc: postexRunSheetDoc as unknown as TemplateDocument,
    data: postexRunSheetData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-postex-settlement',
    name: 'COD Settlement Receipt',
    description: 'Merchant remittance advice with COD breakdown and net upfront payment.',
    category: 'Courier & Last-Mile',
    sizeLabel: 'A4',
    doc: postexSettlementDoc as unknown as TemplateDocument,
    data: postexSettlementData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-postex-merchant-invoice',
    name: 'Merchant Invoice',
    description: 'Tax invoice billing the merchant for delivery, COD and return charges.',
    category: 'Courier & Last-Mile',
    sizeLabel: 'A4',
    doc: postexMerchantInvoiceDoc as unknown as TemplateDocument,
    data: postexMerchantInvoiceData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-postex-pod',
    name: 'Proof of Delivery',
    description: 'Single-parcel POD with CN barcode, delivered stamp and signature block.',
    category: 'Courier & Last-Mile',
    sizeLabel: 'A4',
    doc: postexPodDoc as unknown as TemplateDocument,
    data: postexPodData as unknown as CanonicalDocument,
  },
  // ── Logistics & Freight ──
  {
    id: 'builtin-invoice',
    name: 'Invoice',
    description: 'Clean A4 invoice with itemized line items and totals.',
    category: 'Logistics & Freight',
    sizeLabel: 'A4',
    doc: invoiceDoc as unknown as TemplateDocument,
    data: invoiceData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-shipping-label',
    name: 'Shipping Label',
    description: '4×6 thermal label with barcode and tracking number.',
    category: 'Logistics & Freight',
    sizeLabel: '4×6',
    doc: shippingLabelDoc as unknown as TemplateDocument,
    data: shippingLabelData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-bill-of-lading',
    name: 'Bill of Lading',
    description: 'Negotiable B/L with shipper, consignee and cargo table.',
    category: 'Logistics & Freight',
    sizeLabel: 'A4',
    doc: billOfLadingDoc as unknown as TemplateDocument,
    data: billOfLadingData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-freight-manifest',
    name: 'Freight Manifest',
    description: 'Consolidated trailer manifest with shipment lines and stats.',
    category: 'Logistics & Freight',
    sizeLabel: 'A4',
    doc: freightManifestDoc as unknown as TemplateDocument,
    data: freightManifestData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-customs-declaration',
    name: 'Customs Declaration',
    description: 'Import entry summary with HTS-coded goods and duty totals.',
    category: 'Logistics & Freight',
    sizeLabel: 'A4',
    doc: customsDeclarationDoc as unknown as TemplateDocument,
    data: customsDeclarationData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-delivery-note',
    name: 'Delivery Note',
    description: 'Goods-received note with ordered vs delivered quantities.',
    category: 'Logistics & Freight',
    sizeLabel: 'A4',
    doc: deliveryNoteDoc as unknown as TemplateDocument,
    data: deliveryNoteData as unknown as CanonicalDocument,
  },
  // ── Construction & Engineering ──
  {
    id: 'builtin-quotation',
    name: 'Quotation',
    description: 'Branded sales quote with line items, discount and tax totals.',
    category: 'Construction & Engineering',
    sizeLabel: 'A4',
    doc: quotationDoc as unknown as TemplateDocument,
    data: quotationData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-site-inspection-report',
    name: 'Site Inspection Report',
    description: 'Field inspection record with checklist, results and NCRs.',
    category: 'Construction & Engineering',
    sizeLabel: 'A4',
    doc: siteInspectionReportDoc as unknown as TemplateDocument,
    data: siteInspectionReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-safety-report',
    name: 'Safety Report',
    description: 'Weekly HSE summary with incident table and KPI cards.',
    category: 'Construction & Engineering',
    sizeLabel: 'A4',
    doc: safetyReportDoc as unknown as TemplateDocument,
    data: safetyReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-project-progress-report',
    name: 'Project Progress Report',
    description: 'Monthly status with work packages and schedule/cost KPIs.',
    category: 'Construction & Engineering',
    sizeLabel: 'A4',
    doc: projectProgressReportDoc as unknown as TemplateDocument,
    data: projectProgressReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-compliance-certificate',
    name: 'Compliance Certificate',
    description: 'Statement of conformity with standard reference and sign-off.',
    category: 'Construction & Engineering',
    sizeLabel: 'A4',
    doc: complianceCertificateDoc as unknown as TemplateDocument,
    data: complianceCertificateData as unknown as CanonicalDocument,
  },
  // ── Insurance ──
  {
    id: 'builtin-claims-report',
    name: 'Claims Report',
    description: 'Adjuster assessment with loss itemization and settlement.',
    category: 'Insurance',
    sizeLabel: 'A4',
    doc: claimsReportDoc as unknown as TemplateDocument,
    data: claimsReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-policy-document',
    name: 'Policy Document',
    description: 'Schedule of cover with limits, deductibles and premiums.',
    category: 'Insurance',
    sizeLabel: 'A4',
    doc: policyDocumentDoc as unknown as TemplateDocument,
    data: policyDocumentData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-insurance-inspection-report',
    name: 'Inspection Report',
    description: 'Pre-risk survey with findings, priorities and risk grade.',
    category: 'Insurance',
    sizeLabel: 'A4',
    doc: insuranceInspectionReportDoc as unknown as TemplateDocument,
    data: insuranceInspectionReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-renewal-notice',
    name: 'Renewal Notice',
    description: 'Renewal terms with expiring vs renewal premium comparison.',
    category: 'Insurance',
    sizeLabel: 'A4',
    doc: renewalNoticeDoc as unknown as TemplateDocument,
    data: renewalNoticeData as unknown as CanonicalDocument,
  },
  // ── Healthcare ──
  {
    id: 'builtin-medical-report',
    name: 'Medical Report',
    description: 'Clinical exam report with patient panel and vital signs.',
    category: 'Healthcare',
    sizeLabel: 'A4',
    doc: medicalReportDoc as unknown as TemplateDocument,
    data: medicalReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-lab-report',
    name: 'Lab Report',
    description: 'Laboratory results with reference ranges and flags.',
    category: 'Healthcare',
    sizeLabel: 'A4',
    doc: labReportDoc as unknown as TemplateDocument,
    data: labReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-medical-certificate',
    name: 'Medical Certificate',
    description: 'Fitness statement with examination details and physician sign-off.',
    category: 'Healthcare',
    sizeLabel: 'A4',
    doc: medicalCertificateDoc as unknown as TemplateDocument,
    data: medicalCertificateData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-healthcare-invoice',
    name: 'Medical Invoice',
    description: 'Patient statement with coded charges and insurance adjustment.',
    category: 'Healthcare',
    sizeLabel: 'A4',
    doc: healthcareInvoiceDoc as unknown as TemplateDocument,
    data: healthcareInvoiceData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-equipment-service-report',
    name: 'Equipment Service Report',
    description: 'Biomedical field-service report: equipment details, service checklist, findings and sign-off.',
    category: 'Healthcare',
    sizeLabel: 'A4',
    doc: equipmentServiceReportDoc as unknown as TemplateDocument,
    data: equipmentServiceReportData as unknown as CanonicalDocument,
  },
  // ── Manufacturing ──
  {
    id: 'builtin-procurement-report',
    name: 'Procurement Report',
    description: 'Quarterly procurement summary with spend cards and PO table.',
    category: 'Manufacturing',
    sizeLabel: 'A4',
    doc: procurementReportDoc as unknown as TemplateDocument,
    data: procurementReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-quality-inspection-report',
    name: 'Quality Inspection Report',
    description: 'Incoming/in-process inspection with characteristics and disposition.',
    category: 'Manufacturing',
    sizeLabel: 'A4',
    doc: qualityInspectionReportDoc as unknown as TemplateDocument,
    data: qualityInspectionReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-certificate-of-conformity',
    name: 'Certificate of Conformity',
    description: 'Conformance declaration with requirement-by-requirement evidence.',
    category: 'Manufacturing',
    sizeLabel: 'A4',
    doc: certificateOfConformityDoc as unknown as TemplateDocument,
    data: certificateOfConformityData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-production-report',
    name: 'Production Report',
    description: 'Daily shift summary with output-by-part and OEE cards.',
    category: 'Manufacturing',
    sizeLabel: 'A4',
    doc: productionReportDoc as unknown as TemplateDocument,
    data: productionReportData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-packing-list',
    name: 'Packing List',
    description: 'Carton-by-carton contents with quantities and net weights.',
    category: 'Manufacturing',
    sizeLabel: 'A4',
    doc: packingListDoc as unknown as TemplateDocument,
    data: packingListData as unknown as CanonicalDocument,
  },
  // ── Events & Hospitality ──
  {
    id: 'builtin-event-quotation',
    name: 'Event Quotation',
    description: 'Multi-page event proposal: cover, company & client details, scope, equipment, rooms and terms.',
    category: 'Events & Hospitality',
    sizeLabel: 'A4',
    doc: eventQuotationDoc as unknown as TemplateDocument,
    data: eventQuotationData as unknown as CanonicalDocument,
  },
  // ── Arabic / RTL (Saudi market) ──
  {
    id: 'builtin-arabic-tax-invoice',
    name: 'فاتورة ضريبية — Arabic Tax Invoice',
    description: 'RTL tax invoice with mirrored line-item table, 15% VAT totals and a ZATCA phase-1 QR code.',
    category: 'Arabic (RTL)',
    sizeLabel: 'A4',
    doc: arabicTaxInvoiceDoc as unknown as TemplateDocument,
    data: arabicTaxInvoiceData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-zatca-simplified-receipt',
    name: 'فاتورة ضريبية مبسطة — ZATCA Receipt',
    description: '80mm point-of-sale simplified tax invoice with the mandatory TLV QR code.',
    category: 'Arabic (RTL)',
    sizeLabel: '80mm',
    doc: zatcaReceiptDoc as unknown as TemplateDocument,
    data: zatcaReceiptData as unknown as CanonicalDocument,
  },
  {
    id: 'builtin-arabic-annual-report',
    name: 'التقرير السنوي — Arabic Annual Report',
    description: 'RTL report cover with side panel, data-bound quarterly chart and KPI summary.',
    category: 'Arabic (RTL)',
    sizeLabel: 'A4',
    doc: arabicAnnualReportDoc as unknown as TemplateDocument,
    data: arabicAnnualReportData as unknown as CanonicalDocument,
  },
  // ── Real Estate ──
  {
    id: 'builtin-realtor-brochure',
    name: 'Realtor Brochure',
    description: 'Two-page property listing brochure with hero cover, features, room dimensions and agent card.',
    category: 'Real Estate',
    sizeLabel: 'A4',
    doc: realtorBrochureDoc as unknown as TemplateDocument,
    data: realtorBrochureData as unknown as CanonicalDocument,
  },
]
