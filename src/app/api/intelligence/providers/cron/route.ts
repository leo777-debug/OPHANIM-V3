import { NextRequest, NextResponse } from "next/server";
import {
  ingestIntelligenceEvents,
  publicIntelligenceProviderIds,
} from "@/lib/intelligence/provider-ingestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Scheduled "Refresh feeds" for the public providers. Vercel Cron and the
// GitHub workflow both send Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await ingestIntelligenceEvents(null, {
      providerIds: publicIntelligenceProviderIds(),
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limitPerProvider: 100,
    });
    return NextResponse.json({
      eventsProcessed: result.eventsProcessed,
      evidenceRecords: result.evidenceRecords,
      failedProviders: result.diagnostics
        .filter((item) => item.status === "error")
        .map((item) => item.providerId),
    });
  } catch (error) {
    // The GitHub workflow log is public: keep database detail in Vercel logs.
    console.error("Scheduled intelligence refresh failed", error);
    return NextResponse.json(
      { error: "Intelligence refresh failed." },
      { status: 500 },
    );
  }
}
