import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedActor } from "@/lib/auth/actor";
import { ingestIntelligenceEvents } from "@/lib/intelligence/provider-ingestion";
import { intelligenceEventProviderRegistry } from "@/lib/intelligence/event-provider-registry";
import { requirePlatformCapability } from "@/lib/platform/capabilities";
import { platformError } from "@/lib/platform/http";
import { getClientIp, isRateLimited } from "@/lib/ssrf-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, "intelligence:read");
    await requirePlatformCapability(actor, "events");
    return NextResponse.json({
      providers: intelligenceEventProviderRegistry.catalog(),
    });
  } catch (error) {
    return platformError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(
      request,
      "intelligence:write",
    );
    await requirePlatformCapability(actor, "events");
    if (
      isRateLimited(
        `intelligence:${actor.userId}:${getClientIp(request)}`,
        4,
        60_000,
      )
    ) {
      return NextResponse.json(
        { error: "Please wait before refreshing intelligence again." },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const providerIds =
      body.providerIds === undefined
        ? undefined
        : Array.isArray(body.providerIds)
          ? [
              ...new Set(
                body.providerIds.filter(
                  (value): value is string => typeof value === "string",
                ),
              ),
            ]
          : null;
    if (providerIds === null || (providerIds && providerIds.length > 20))
      throw new Error("Provider IDs must be a short list.");
    const knownProviders = new Set(
      intelligenceEventProviderRegistry
        .catalog()
        .map((provider) => provider.id),
    );
    if (providerIds?.some((providerId) => !knownProviders.has(providerId)))
      throw new Error("An intelligence provider is not recognized.");

    const sinceDays = body.sinceDays === undefined ? 7 : Number(body.sinceDays);
    const limitPerProvider =
      body.limitPerProvider === undefined ? 100 : Number(body.limitPerProvider);
    if (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 30)
      throw new Error("The refresh window must be from 1 to 30 days.");
    if (
      !Number.isInteger(limitPerProvider) ||
      limitPerProvider < 1 ||
      limitPerProvider > 200
    )
      throw new Error("The provider limit must be from 1 to 200.");

    const now = new Date();
    const result = await ingestIntelligenceEvents(actor, {
      ...(providerIds ? { providerIds } : {}),
      since: new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000),
      limitPerProvider,
    });
    return NextResponse.json(result);
  } catch (error) {
    return platformError(error);
  }
}
