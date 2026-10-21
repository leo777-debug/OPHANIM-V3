import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { einvoiceProvider, pintAeXml } from './einvoice';
import { disputeOdds, draftInvoice, margin, markInvoice, paymentRange, recordIncomingInvoice } from './invoices';
import { jobPredictions } from './ledger';
import { recordPieceCount } from './milestones';
import { memoryRepo } from './repo';
import { createJobFile, loadJob } from './service';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000c9';

describe('Invoice Desk', () => {
  it('drafts from a seeded job, passes checks, exports PINT AE in stub mode and records a payment-date range', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => Date.parse('2026-10-26T08:00:00Z') };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-5001', clientName: 'SYNTHETIC Gulf Star Trading LLC', origin: 'SZX', destination: 'DXB', references: [{ type: 'awb', value: '176-12345675' }] });
    await recordPieceCount(ctx, job.id, { handoff: 'booked', pieces: 12, weightKg: 1240, source: 'document' });
    const { invoice, flags, predictions } = await draftInvoice(ctx, job.id, { ratePerKg: 4.5, quoteTotal: 5800, lines: [{ code: 'handling', description: 'Terminal handling', quantity: 1, unitPrice: 250, vatRate: 0.05 }] });
    expect(flags).toEqual([]);
    expect(invoice).toMatchObject({ subtotal: 5830, vatAmount: 12.5, total: 5842.5, counterpartyName: 'SYNTHETIC Gulf Star Trading LLC', einvoiceStatus: 'not_submitted' });
    expect(invoice.lines[0]).toMatchObject({ code: 'freight', quantity: 1240, vatRate: 0 });
    // Stub mode: XML shaped after PINT AE, clearly marked unvalidated; nothing sent.
    const provider = einvoiceProvider({} as NodeJS.ProcessEnv);
    expect(provider.stub).toBe(true); expect((await provider.submit('', invoice)).status).toBe('stub_exported');
    const xml = pintAeXml(invoice, job, { name: 'SYNTHETIC DEMO Forwarding LLC' }, { name: invoice.counterpartyName! });
    expect(xml).toContain('<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1'); expect(xml).toContain('NOT VALIDATED'); expect(xml).toContain('<cbc:PayableAmount currencyID="AED">5842.50</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>');
    // Payment-date range is in the ledger and on the job's Receipts strip.
    expect(predictions.paymentDate).toMatchObject({ p10At: '2026-11-16T08:00:00.000Z', p90At: '2027-01-09T08:00:00.000Z', basis: 'default prior (no history yet)' });
    const receipts = await jobPredictions(ctx, job.id);
    expect(receipts.map(item => item.questionType)).toEqual(expect.arrayContaining(['payment_date', 'dispute_odds']));
    await markInvoice(ctx, invoice.id, 'paid', '2026-11-30T09:00:00Z');
    expect((await jobPredictions(ctx, job.id)).find(item => item.questionType === 'payment_date')?.status).toBe('called');
  });

  it('catches quote overrun, wrong client and missing storage; tags delay costs and shows margin', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-5002', clientName: 'Client A', references: [{ type: 'awb', value: '176-12345675' }] });
    const incoming = await recordIncomingInvoice(ctx, { counterpartyName: 'SYNTHETIC Terminal', invoiceNumber: 'T-1', referencesText: 'AWB 176-12345675', lines: [{ description: 'Storage 3 days', quantity: 3, unitPrice: 120 }] });
    expect(incoming.matched).toBe(true); expect(incoming.invoice.delayCostKind).toBe('storage');
    expect((await ctx.repo.select('ophanim_forecast_outcomes', ORG))).toHaveLength(1);
    const { flags, predictions } = await draftInvoice(ctx, job.id, { lines: [{ code: 'freight', description: 'Freight', quantity: 1, unitPrice: 3000, vatRate: 0 }, { code: 'special', description: 'Special handling', quantity: 1, unitPrice: 900 }], quoteTotal: 3000, billTo: 'Client B' });
    // Storage is passed through automatically, so it is not "missing"; quote and client checks fire.
    expect(flags.map(flag => flag.code).sort()).toEqual(['invoice_vs_quote', 'invoice_wrong_client']);
    expect(predictions.dispute.reasons.map(reason => reason.label)).toEqual(['more than 10% above the quote', '1 extra charge(s) without evidence attached']);
    expect(margin((await loadJob(ctx, job.id))!.invoices)).toMatchObject({ cost: 360 });
  });

  it('uses client history for payment ranges when there is enough', () => {
    expect(paymentRange([30, 32, 35, 40, 41, 45], [])).toMatchObject({ basis: 'client history', p50: 40 });
    expect(paymentRange([30], [10, 20, 30, 40, 50])).toMatchObject({ basis: 'organization prior' });
    expect(disputeOdds({ lines: [] } as never, []).probability).toBeLessThan(0.1);
  });
});
