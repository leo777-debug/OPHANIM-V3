// Default document types. Organizations add arrival notices, manifests, gate
// passes and others as rows in ophanim_document_types — no code change needed.

export type FieldKind = 'text' | 'number' | 'date' | 'reference' | 'party' | 'money' | 'code';
export type FieldDefinition = { field: string; kind: FieldKind; labelEn: string; labelAr: string };
export type DocumentTypeDefinition = { code: string; labelEn: string; labelAr: string; keywords: string[]; fields: string[] };

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { field: 'awb_number', kind: 'reference', labelEn: 'AWB number', labelAr: 'رقم بوليصة الشحن الجوي' },
  { field: 'hawb_number', kind: 'reference', labelEn: 'House AWB', labelAr: 'البوليصة الفرعية' },
  { field: 'bl_number', kind: 'reference', labelEn: 'B/L number', labelAr: 'رقم بوليصة الشحن' },
  { field: 'container_number', kind: 'reference', labelEn: 'Container', labelAr: 'الحاوية' },
  { field: 'invoice_number', kind: 'reference', labelEn: 'Invoice number', labelAr: 'رقم الفاتورة' },
  { field: 'delivery_order_number', kind: 'reference', labelEn: 'Delivery order', labelAr: 'إذن التسليم' },
  { field: 'shipper', kind: 'party', labelEn: 'Shipper', labelAr: 'الشاحن' },
  { field: 'consignee', kind: 'party', labelEn: 'Consignee', labelAr: 'المرسل إليه' },
  { field: 'notify_party', kind: 'party', labelEn: 'Notify party', labelAr: 'الطرف المُخطر' },
  { field: 'pieces', kind: 'number', labelEn: 'Pieces', labelAr: 'عدد القطع' },
  { field: 'gross_weight_kg', kind: 'number', labelEn: 'Gross weight (kg)', labelAr: 'الوزن الإجمالي (كغ)' },
  { field: 'chargeable_weight_kg', kind: 'number', labelEn: 'Chargeable weight (kg)', labelAr: 'الوزن المحتسب (كغ)' },
  { field: 'volume_cbm', kind: 'number', labelEn: 'Volume (m³)', labelAr: 'الحجم (م³)' },
  { field: 'dimensions', kind: 'text', labelEn: 'Dimensions', labelAr: 'الأبعاد' },
  { field: 'description', kind: 'text', labelEn: 'Goods description', labelAr: 'وصف البضاعة' },
  { field: 'hs_code', kind: 'code', labelEn: 'HS code', labelAr: 'رمز النظام المنسق' },
  { field: 'incoterm', kind: 'code', labelEn: 'Incoterm', labelAr: 'شرط التسليم' },
  { field: 'currency', kind: 'code', labelEn: 'Currency', labelAr: 'العملة' },
  { field: 'invoice_subtotal', kind: 'money', labelEn: 'Subtotal', labelAr: 'المجموع الفرعي' },
  { field: 'vat_amount', kind: 'money', labelEn: 'VAT', labelAr: 'ضريبة القيمة المضافة' },
  { field: 'invoice_total', kind: 'money', labelEn: 'Invoice total', labelAr: 'إجمالي الفاتورة' },
  { field: 'invoice_date', kind: 'date', labelEn: 'Invoice date', labelAr: 'تاريخ الفاتورة' },
  { field: 'issue_date', kind: 'date', labelEn: 'Issue date', labelAr: 'تاريخ الإصدار' },
  { field: 'departure_date', kind: 'date', labelEn: 'Departure date', labelAr: 'تاريخ المغادرة' },
  { field: 'arrival_date', kind: 'date', labelEn: 'Arrival date', labelAr: 'تاريخ الوصول' },
  { field: 'origin', kind: 'code', labelEn: 'Origin', labelAr: 'المنشأ' },
  { field: 'destination', kind: 'code', labelEn: 'Destination', labelAr: 'الوجهة' },
  { field: 'flight', kind: 'text', labelEn: 'Flight', labelAr: 'الرحلة' },
  { field: 'vessel', kind: 'text', labelEn: 'Vessel / voyage', labelAr: 'السفينة / الرحلة' },
];

const COMMON = ['shipper', 'consignee', 'pieces', 'gross_weight_kg', 'description'];
export const DEFAULT_DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  { code: 'air_waybill', labelEn: 'Air waybill', labelAr: 'بوليصة الشحن الجوي', keywords: ['AIR WAYBILL', 'MAWB', 'NOT NEGOTIABLE', 'AIRPORT OF DEPARTURE'], fields: ['awb_number', ...COMMON, 'notify_party', 'chargeable_weight_kg', 'volume_cbm', 'dimensions', 'hs_code', 'issue_date', 'origin', 'destination', 'flight'] },
  { code: 'house_air_waybill', labelEn: 'House air waybill', labelAr: 'بوليصة الشحن الجوي الفرعية', keywords: ['HOUSE AIR WAYBILL', 'HAWB'], fields: ['hawb_number', 'awb_number', ...COMMON, 'chargeable_weight_kg', 'volume_cbm', 'issue_date', 'origin', 'destination', 'flight'] },
  { code: 'bill_of_lading', labelEn: 'Bill of lading', labelAr: 'بوليصة الشحن البحري', keywords: ['BILL OF LADING', 'PORT OF LOADING', 'PORT OF DISCHARGE', 'B/L'], fields: ['bl_number', 'container_number', ...COMMON, 'notify_party', 'volume_cbm', 'hs_code', 'issue_date', 'origin', 'destination', 'vessel'] },
  { code: 'commercial_invoice', labelEn: 'Commercial invoice', labelAr: 'الفاتورة التجارية', keywords: ['COMMERCIAL INVOICE', 'INVOICE NO', 'UNIT PRICE', 'AMOUNT'], fields: ['invoice_number', ...COMMON, 'hs_code', 'incoterm', 'currency', 'invoice_subtotal', 'vat_amount', 'invoice_total', 'invoice_date', 'origin', 'destination'] },
  { code: 'packing_list', labelEn: 'Packing list', labelAr: 'قائمة التعبئة', keywords: ['PACKING LIST', 'NET WEIGHT', 'CARTON'], fields: ['invoice_number', ...COMMON, 'volume_cbm', 'dimensions', 'invoice_date'] },
  { code: 'delivery_order', labelEn: 'Delivery order', labelAr: 'إذن التسليم', keywords: ['DELIVERY ORDER', 'D/O', 'RELEASE'], fields: ['delivery_order_number', 'awb_number', 'bl_number', 'consignee', 'pieces', 'gross_weight_kg', 'issue_date'] },
  // Configurable additions, active by default; organizations can disable or extend them.
  { code: 'cargo_manifest', labelEn: 'Cargo manifest', labelAr: 'بيان الشحنة', keywords: ['MANIFEST', 'CARGO MANIFEST'], fields: ['awb_number', 'pieces', 'gross_weight_kg', 'flight', 'arrival_date'] },
  { code: 'arrival_notice', labelEn: 'Arrival notice', labelAr: 'إشعار الوصول', keywords: ['ARRIVAL NOTICE', 'NOTICE OF ARRIVAL'], fields: ['awb_number', 'bl_number', 'consignee', 'pieces', 'gross_weight_kg', 'arrival_date'] },
  { code: 'gate_pass', labelEn: 'Gate pass', labelAr: 'تصريح البوابة', keywords: ['GATE PASS', 'GATE OUT', 'EXIT PASS'], fields: ['awb_number', 'container_number', 'pieces', 'issue_date'] },
  { code: 'weight_slip', labelEn: 'Weight slip', labelAr: 'إيصال الوزن', keywords: ['WEIGHT SLIP', 'WEIGHBRIDGE', 'SCALE TICKET'], fields: ['awb_number', 'pieces', 'gross_weight_kg', 'issue_date'] },
  { code: 'certificate_of_origin', labelEn: 'Certificate of origin', labelAr: 'شهادة المنشأ', keywords: ['CERTIFICATE OF ORIGIN'], fields: ['shipper', 'consignee', 'description', 'origin', 'issue_date'] },
  { code: 'export_declaration', labelEn: 'Export declaration', labelAr: 'بيان التصدير', keywords: ['EXPORT DECLARATION', 'EXIT DECLARATION'], fields: ['shipper', 'consignee', 'hs_code', 'invoice_total', 'currency', 'issue_date'] },
  { code: 'import_declaration', labelEn: 'Import declaration', labelAr: 'بيان الاستيراد', keywords: ['IMPORT DECLARATION', 'BILL OF ENTRY'], fields: ['consignee', 'hs_code', 'invoice_total', 'currency', 'issue_date'] },
];

/** Merge organization rows over the defaults (same code replaces, inactive removes). */
export function documentTypes(custom: Array<DocumentTypeDefinition & { active?: boolean }> = []) {
  const byCode = new Map(DEFAULT_DOCUMENT_TYPES.map(type => [type.code, type]));
  for (const type of custom) { if (type.active === false) byCode.delete(type.code); else byCode.set(type.code, type); }
  return [...byCode.values()];
}
export const documentLabel = (code: string, locale: 'en' | 'ar' = 'en', types = DEFAULT_DOCUMENT_TYPES) => {
  const type = types.find(item => item.code === code); return type ? (locale === 'ar' ? type.labelAr : type.labelEn) : code.replace(/_/g, ' ');
};

/** Keyword classifier; the vision reader may override it with its own answer. */
export function classifyDocument(text: string, types = DEFAULT_DOCUMENT_TYPES): { code: string; confidence: number } {
  const upper = text.toUpperCase();
  const scored = types.map(type => ({ code: type.code, hits: type.keywords.filter(keyword => upper.includes(keyword)).length, specificity: Math.max(...type.keywords.map(keyword => upper.includes(keyword) ? keyword.length : 0)) }))
    .sort((a, b) => b.hits - a.hits || b.specificity - a.specificity);
  const best = scored[0];
  if (!best || !best.hits) return { code: 'other', confidence: 0 };
  return { code: best.code, confidence: Math.min(0.95, 0.5 + 0.15 * best.hits + (scored[1] && scored[1].hits === best.hits ? -0.2 : 0)) };
}
