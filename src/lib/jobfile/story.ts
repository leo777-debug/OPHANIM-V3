// The SYNTHETIC DEMO story, played step by step on a controllable clock. Used by
// the demo seed and the end-to-end test. Every party, number and document is invented.
import { createDriverLink, driverTap, jobConditions, resolveDriverLink } from './congestion';
import { draftInvoice, markInvoice, recordIncomingInvoice } from './invoices';
import { recordMilestone, recordPieceCount } from './milestones';
import { processDocument, receiveAndProcess } from './paper-desk';
import type { ReadField, ReadResult } from './reader';
import { recordPaperRisk } from './receipts';
import { loadJob } from './service';
import type { Ctx } from './types';

export const DEMO = 'SYNTHETIC DEMO';
export const AWB = '176-12345675';
const H = 36e5;
const box = (row: number) => ({ x: 0.52, y: 0.14 + row * 0.06, w: 0.4, h: 0.045 });
const field = (name: string, value: string, row: number, confidence = 0.97): ReadField => ({ field: name, value, confidence, page: 1, bbox: box(row) });
const shipper = `${DEMO} Shenzhen Bright Electronics Co., Ltd`, consignee = `${DEMO} Gulf Star Trading LLC`;
const PAPERS: Record<string, { title: string; read: ReadField[] }> = {
  awb: { title: 'AIR WAYBILL (MASTER)', read: [field('awb_number', AWB, 0), field('shipper', shipper, 1), field('consignee', consignee, 2), field('pieces', '12', 3), field('gross_weight_kg', '1240', 4), field('volume_cbm', '7.2', 5), field('description', 'LED display panels', 6), field('hs_code', '8528.59', 7), field('flight', 'EK9881', 8)] },
  invoice: { title: 'COMMERCIAL INVOICE', read: [field('invoice_number', 'INV-SZ-2026-118', 0), field('shipper', shipper, 1), field('consignee', consignee, 2), field('pieces', '12', 3), field('gross_weight_kg', '1276', 4), field('currency', 'USD', 5), field('incoterm', 'FCA', 6), field('description', 'LED display panels', 7)] },
  packing: { title: 'PACKING LIST', read: [field('invoice_number', 'INV-SZ-2026-118', 0), field('shipper', shipper, 1), field('consignee', consignee, 2), field('pieces', '12', 3), field('gross_weight_kg', '1240', 4), field('dimensions', '12 @ 100x60x100 cm', 5)] },
  do: { title: 'DELIVERY ORDER', read: [field('delivery_order_number', 'DO-DXB-77120', 0), field('awb_number', AWB, 1), field('consignee', consignee, 2), field('pieces', '12', 3), field('gross_weight_kg', '1240', 4)] },
  gate: { title: 'GATE PASS', read: [field('awb_number', AWB, 0), field('pieces', '12', 1)] },
};
const DOC_TYPES: Record<string, string> = { awb: 'air_waybill', invoice: 'commercial_invoice', packing: 'packing_list', do: 'delivery_order', gate: 'gate_pass' };

/** A synthetic photographed paper (PNG) with each value printed where its crop box says. */
export async function syntheticPaper(kind: keyof typeof PAPERS): Promise<{ bytes: Buffer; mimeType: string }> {
  const paper = PAPERS[kind], W = 900, Hh = 1200, esc = (value: string) => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]!));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}"><rect width="100%" height="100%" fill="#f7f4ec"/><text x="40" y="70" font-family="Arial" font-size="34" font-weight="bold" fill="#222">${paper.title}</text>
    <text x="40" y="110" font-family="Arial" font-size="22" fill="#b3261e">${DEMO} — not a real document</text>
    ${paper.read.map(item => `<text x="40" y="${(item.bbox!.y + item.bbox!.h * 0.75) * Hh}" font-family="Arial" font-size="20" fill="#555">${esc(item.field.replace(/_/g, ' ').toUpperCase())}</text><rect x="${item.bbox!.x * W}" y="${item.bbox!.y * Hh}" width="${item.bbox!.w * W}" height="${item.bbox!.h * Hh}" fill="none" stroke="#ccc"/><text x="${item.bbox!.x * W + 8}" y="${(item.bbox!.y + item.bbox!.h * 0.75) * Hh}" font-family="Courier New" font-size="22" fill="#111">${esc(item.value)}</text>`).join('')}</svg>`;
  try { const sharp = (await import('sharp')).default; return { bytes: await sharp(Buffer.from(svg)).png().toBuffer(), mimeType: 'image/png' }; }
  catch { return { bytes: Buffer.from(`${paper.title}\n${DEMO}\n${paper.read.map(item => `${item.field}: ${item.value}`).join('\n')}`), mimeType: 'text/plain' }; }
}
const readResult = (kind: keyof typeof PAPERS): ReadResult => ({ reader: 'vision', docType: DOC_TYPES[kind], typeConfidence: 0.96, pages: 1, fields: PAPERS[kind].read, lines: [], text: PAPERS[kind].read.map(item => `${item.field}: ${item.value}`).join('\n') });

export type StoryClock = { now: number };
/**
 * Air import, 12 pieces, SZX → DXB. Steps:
 * 1 pre-alert (AWB + invoice + packing list) → 36 kg weight flag, Paper Risk ~1 in 4
 * 2 fog TAF on the arrival morning   3 manifest 11 of 12 → short-landed
 * 4 landed, no terminal receipt after the usual window → ghost ~80% + chaser
 * 5 delivery order and gate pass photographed, filed, checked   6 driver taps Arrived at the gate
 * 7 delivered → client invoice with payment-date range   8 outcomes resolve and are scored
 */
export async function playStory(base: Omit<Ctx, 'now'>, clock: StoryClock, options: { jobNumber: string; stopAfter?: number; arrivalAt: number }) {
  const ctx: Ctx = { ...base, now: () => clock.now }, stop = options.stopAfter ?? 8, org = ctx.actor.organizationId, steps: string[] = [];
  const photos = async (kinds: Array<keyof typeof PAPERS>) => Promise.all(kinds.map(async kind => ({ fileName: `${DEMO.replace(' ', '-')}-${kind}.png`, ...(await syntheticPaper(kind)) })));
  // 1. Pre-alert email.
  const intake = await receiveAndProcess(ctx, { channel: 'email', externalId: `${options.jobNumber}-prealert`, sender: `${DEMO} origin agent <agent@origin.example>`, subject: `[${DEMO}] PRE-ALERT MAWB ${AWB} / HAWB SZX44871 — 12 pcs to DXB`,
    bodyText: `${DEMO}. Pre-alert for 12 pcs, flight EK9881 SZX-DXB.`, attachments: await photos(['awb', 'invoice', 'packing']) });
  const jobId = intake.intake.matchedJobFileId!;
  await ctx.repo.update('ophanim_job_files', org, { id: jobId }, { jobNumber: options.jobNumber, clientName: consignee, origin: 'SZX', destination: 'DXB', goodsDescription: 'LED display panels', plannedDepartureAt: new Date(options.arrivalAt - 10 * H).toISOString(), plannedArrivalAt: new Date(options.arrivalAt).toISOString(), isSynthetic: true });
  for (const [index, document] of intake.documents.entries()) await processDocument(ctx, document.id, readResult((['awb', 'invoice', 'packing'] as const)[index]));
  await recordPieceCount(ctx, jobId, { handoff: 'booked', pieces: 12, weightKg: 1240, source: 'document' });
  const risk = await recordPaperRisk(ctx, (await loadJob(ctx, jobId))!);
  steps.push(`1 pre-alert filed, Paper Risk 1 in ${risk.oneIn}`);
  if (stop <= 1) return { jobId, steps, risk };
  // 2. Fog on the arrival morning (synthetic TAF, customer-private row).
  const taf = new Date(options.arrivalAt - 20 * H), day = (at: number) => String(new Date(at).getUTCDate()).padStart(2, '0'), hour = (at: number) => String(new Date(at).getUTCHours()).padStart(2, '0');
  const from = options.arrivalAt - 2 * H, to = options.arrivalAt + 2 * H;
  await ctx.repo.insert('ophanim_airport_weather', org, { station: 'OMDB', kind: 'taf', issuedAt: taf.toISOString(), source: `${DEMO} feed`, isSynthetic: true,
    raw: `TAF OMDB ${day(taf.getTime())}${hour(taf.getTime())}00Z ${day(taf.getTime())}${hour(taf.getTime())}/${day(options.arrivalAt + 10 * H)}${hour(options.arrivalAt + 10 * H)} 32008KT 6000 NSC TEMPO ${day(from)}${hour(from)}/${day(to)}${hour(to)} 0800 FG` });
  await jobConditions(ctx, (await loadJob(ctx, jobId))!);
  steps.push('2 fog risk on arrival morning'); if (stop <= 2) return { jobId, steps, risk };
  // 3. Manifest shows 11 pieces.
  clock.now = Math.max(clock.now, options.arrivalAt - 4 * H);
  await recordPieceCount(ctx, jobId, { handoff: 'manifested', pieces: 11, weightKg: 1135, source: 'document' });
  steps.push('3 short-landed 11 of 12'); if (stop <= 3) return { jobId, steps, risk };
  // 4. Landed; terminal usually reports within its window. Learned report lags make the ghost ~80% at 6.5 h.
  const lags = { sourceKey: 'terminal:DXB', milestoneCode: 'terminal_received' };
  if ((await ctx.repo.select('ophanim_source_report_lags', org, lags)).length) await ctx.repo.update('ophanim_source_report_lags', org, lags, { lagSamplesHours: [0.5, 1, 2, 2.5, 4] });
  else await ctx.repo.insert('ophanim_source_report_lags', org, { ...lags, lagSamplesHours: [0.5, 1, 2, 2.5, 4], reportsMilestone: true });
  if (!(await ctx.repo.select('ophanim_counterparties', org, { type: 'terminal', normalizedName: 'SYNTHETIC DEMO DXB CARGO TERMINAL DESK' })).length)
    await ctx.repo.insert('ophanim_counterparties', org, { name: `${DEMO} DXB cargo terminal desk`, normalizedName: 'SYNTHETIC DEMO DXB CARGO TERMINAL DESK', type: 'terminal', email: 'terminal-desk@example.test', identifiers: {} });
  clock.now = options.arrivalAt + 0.25 * H;
  await recordMilestone(ctx, jobId, { code: 'arrived', actualAt: new Date(options.arrivalAt).toISOString(), source: 'api', sourceKey: 'airline:DXB' });
  clock.now = options.arrivalAt + 6.5 * H;
  const { jobView } = await import('./view');
  const view = (await jobView(ctx, jobId))!;
  steps.push(`4 ghost ${Math.round((view.ghosts[0]?.probability ?? 0) * 100)}% and chaser drafted`); if (stop <= 4) return { jobId, steps, risk, view };
  // 5. Terminal confirms; delivery order and gate pass photographed.
  clock.now = options.arrivalAt + 7.5 * H;
  await recordMilestone(ctx, jobId, { code: 'terminal_received', actualAt: new Date(options.arrivalAt + 4.5 * H).toISOString(), source: 'email', sourceKey: 'terminal:DXB', confidence: 0.95 });
  await recordPieceCount(ctx, jobId, { handoff: 'terminal_received', pieces: 12, weightKg: 1240, source: 'document' });
  await recordMilestone(ctx, jobId, { code: 'customs_cleared', actualAt: new Date(options.arrivalAt + 12 * H).toISOString(), source: 'manual' });
  clock.now = options.arrivalAt + 14 * H;
  const later = await receiveAndProcess(ctx, { channel: 'photo', externalId: `${options.jobNumber}-do`, bodyText: `AWB ${AWB}`, attachments: await photos(['do', 'gate']) });
  for (const [index, document] of later.documents.entries()) await processDocument(ctx, document.id, readResult((['do', 'gate'] as const)[index]));
  await recordMilestone(ctx, jobId, { code: 'do_issued', actualAt: new Date(options.arrivalAt + 13 * H).toISOString(), source: 'document' });
  steps.push('5 delivery order and gate pass filed'); if (stop <= 5) return { jobId, steps, risk };
  // 6. Driver taps Arrived at the gate.
  const site = await ctx.repo.insert<{ id: string }>('ophanim_sites', org, { type: 'gate', name: `${DEMO} DXB cargo gate 2`, code: 'DXB-G2', emirate: 'Dubai' });
  const { path } = await createDriverLink(ctx, jobId, { siteId: site.id, driverLabel: `${DEMO} driver`, locationOptIn: false });
  const link = (await resolveDriverLink(ctx, path.slice(3)))!.link;
  clock.now = options.arrivalAt + 15 * H; await driverTap(ctx, link, { event: 'arrived' });
  clock.now = options.arrivalAt + 16.6 * H; await driverTap(ctx, link, { event: 'loaded' }); await driverTap(ctx, link, { event: 'left' });
  await recordMilestone(ctx, jobId, { code: 'collected', actualAt: new Date(clock.now).toISOString(), source: 'driver' });
  steps.push('6 driver tapped at the gate'); if (stop <= 6) return { jobId, steps, risk };
  // 7. Delivered; invoice drafted with payment-date range.
  clock.now = options.arrivalAt + 20 * H;
  await recordMilestone(ctx, jobId, { code: 'delivered', actualAt: new Date(clock.now).toISOString(), source: 'driver' });
  await recordIncomingInvoice(ctx, { counterpartyName: `${DEMO} DXB cargo terminal`, invoiceNumber: 'TRM-5521', referencesText: `AWB ${AWB}`, lines: [{ description: 'Terminal handling', quantity: 1, unitPrice: 310 }, { description: 'Storage 1 day', quantity: 1, unitPrice: 95 }] });
  const invoice = await draftInvoice(ctx, jobId, { ratePerKg: 4.5, quoteTotal: 6200, lines: [{ code: 'delivery', description: 'Delivery to consignee, Dubai', quantity: 1, unitPrice: 450, vatRate: 0.05 }] });
  steps.push(`7 invoice drafted, paid between ${invoice.predictions.paymentDate.p10At.slice(0, 10)} and ${invoice.predictions.paymentDate.p90At.slice(0, 10)}`); if (stop <= 7) return { jobId, steps, risk, invoice };
  // 8. Outcomes arrive: paid on day 33.
  clock.now = Date.parse(invoice.invoice.issuedAt!) + 33 * 864e5;
  await markInvoice(ctx, invoice.invoice.id, 'paid', new Date(clock.now).toISOString());
  steps.push('8 predictions resolved and scored');
  return { jobId, steps, risk, invoice };
}
