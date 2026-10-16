import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { pinnedPublicFetch } from '@/lib/http/pinned-public-fetch';

export async function POST(request: Request) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const forwardUrl = process.env.GITHUB_WEBHOOK_FORWARD_URL;

    // Fail-closed: require both secret and forward URL
    if (!secret || !forwardUrl) {
        return NextResponse.json(
            { error: 'Webhook endpoint not configured' },
            { status: 503 }
        );
    }

    try {
        const signature = request.headers.get('x-hub-signature-256');

        // Always verify signature
        if (!signature) {
            return NextResponse.json({ error: 'Unauthorized: Missing signature' }, { status: 401 });
        }

        const payloadText = new TextDecoder().decode(await limitedRequestBytes(request, 1024 * 1024));

        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(payloadText).digest('hex');

        try {
            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                return NextResponse.json({ error: 'Unauthorized: Invalid signature' }, { status: 401 });
            }
        } catch {
            return NextResponse.json({ error: 'Unauthorized: Invalid signature format' }, { status: 401 });
        }

        // Forward to configurable URL (no hardcoded IPs)
        const response = await pinnedPublicFetch(forwardUrl, {
            method: 'POST',
            httpsOnly: true,
            timeoutMs: 10000,
            maxResponseBytes: 64 * 1024,
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': signature,
            },
            body: payloadText,
        });

        if (!response.ok) {
            console.error('GitHub webhook forwarding failed');
            return NextResponse.json({ error: 'Failed to forward to bot' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Webhook forwarded successfully' }, { status: 200 });

    } catch (error) {
        if (error instanceof RequestBodyLimitError) return NextResponse.json({ error: 'Webhook payload exceeds the size limit.' }, { status: 413 });
        console.error('GitHub webhook handling failed');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
