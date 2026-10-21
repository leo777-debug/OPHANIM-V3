// SYNTHETIC DEMO data. Every name, number and party below is invented and labelled.
import { receiveIntake } from './service';
import type { Ctx } from './types';

export const DEMO_LABEL = 'SYNTHETIC DEMO';
export const DEMO_AWB = '176-12345675';

export async function seedDemo(ctx: Ctx) {
  const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${DEMO_LABEL}\nBT (${text}) Tj ET\n`);
  await receiveIntake(ctx, {
    channel: 'email', externalId: 'synthetic-demo-prealert-1', sender: 'SYNTHETIC DEMO origin agent <agent@origin.example>',
    subject: `[${DEMO_LABEL}] PRE-ALERT MAWB ${DEMO_AWB} / HAWB SZX44871 — 12 pcs to DXB`,
    bodyText: `${DEMO_LABEL}. Dear team, pre-alert for 12 pcs, 1,240 kg, flight EK 9881 SZX-DXB. Invoice No: INV-SZ-2026-118.`,
    attachments: [
      { fileName: 'SYNTHETIC-MAWB-176-12345675.pdf', mimeType: 'application/pdf', bytes: pdf(`AIR WAYBILL ${DEMO_AWB} NOT NEGOTIABLE ${DEMO_LABEL}`), text: `AIR WAYBILL ${DEMO_AWB} NOT NEGOTIABLE ${DEMO_LABEL}` },
      { fileName: 'SYNTHETIC-invoice-INV-SZ-2026-118.pdf', mimeType: 'application/pdf', bytes: pdf(`COMMERCIAL INVOICE Invoice No INV-SZ-2026-118 ${DEMO_LABEL}`), text: `COMMERCIAL INVOICE Invoice No INV-SZ-2026-118 Unit price Amount ${DEMO_LABEL}` },
    ],
  });
}
