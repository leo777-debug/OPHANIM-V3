import { NextResponse, type NextRequest } from 'next/server';
import { headers, jobContext, jobError } from '@/lib/jobfile/context';
import { einvoiceProvider, pintAeXml } from '@/lib/jobfile/einvoice';
import { audit } from '@/lib/jobfile/service';
import type { Invoice, JobFile } from '@/lib/jobfile/types';
export const dynamic = 'force-dynamic';

/** Export a PINT AE-shaped XML through the e-invoice adapter (stub unless a validated ASP is configured). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const ctx = await jobContext(request, 'shipment:read'), { id, invoiceId } = await params, org = ctx.actor.organizationId;
    const [invoice] = await ctx.repo.select<Invoice>('ophanim_invoices', org, { id: invoiceId, jobFileId: id, direction: 'outgoing' });
    const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org, { id });
    if (!invoice || !job) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404, headers });
    const seller = { name: process.env.EINVOICE_SELLER_NAME || (ctx.actor.demo ? 'SYNTHETIC DEMO Forwarding LLC' : 'Seller name not configured (EINVOICE_SELLER_NAME)'), trn: process.env.EINVOICE_SELLER_TRN || null, country: 'AE' };
    const xml = pintAeXml(invoice, job, seller, { name: invoice.counterpartyName ?? job.clientName ?? 'Buyer', country: 'AE' });
    const provider = einvoiceProvider(), result = await provider.submit(xml, invoice);
    await ctx.repo.update('ophanim_invoices', org, { id: invoiceId }, { einvoiceStatus: result.status });
    await audit(ctx, 'invoice.einvoice', 'job_file', id, { invoiceId, provider: provider.id, status: result.status });
    return new NextResponse(xml, { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${(invoice.invoiceNumber ?? invoiceId).replace(/[^\w.-]/g, '_')}-PINT-AE-${provider.stub ? 'STUB-' : ''}UNVALIDATED.xml"`, 'X-Ophanim-EInvoice-Status': result.status } });
  } catch (error) { return jobError(error); }
}
