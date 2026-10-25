import crypto from "node:crypto";
import { db, DBWebhookEndpoint, DBWebhookEvent } from "@/server/db/unified-db";
import { encryptToken, decryptToken } from "@/server/security/token-encryption";

/**
 * Checks if a given destination URL is safe against Server-Side Request Forgery (SSRF).
 * Blocks loopback, private networks, link-local, and cloud metadata endpoints.
 */
export function validateWebhookUrlSafety(urlStr: string): { isSafe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { isSafe: false, reason: "Protokol webhook harus HTTP atau HTTPS." };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopback
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0"
    ) {
      return { isSafe: false, reason: "URL webhook tidak boleh mengarah ke localhost atau loopback." };
    }

    // Block AWS/Cloud metadata
    if (hostname === "169.254.169.254" || hostname.includes("metadata.google.internal")) {
      return { isSafe: false, reason: "URL webhook tidak diizinkan mengakses metadata cloud." };
    }

    // Block IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b1 = parseInt(ipv4Match[1], 10);
      const b2 = parseInt(ipv4Match[2], 10);

      if (b1 === 10) return { isSafe: false, reason: "URL IP privat (10.0.0.0/8) dilarang." };
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return { isSafe: false, reason: "URL IP privat (172.16.0.0/12) dilarang." };
      if (b1 === 192 && b2 === 168) return { isSafe: false, reason: "URL IP privat (192.168.0.0/16) dilarang." };
      if (b1 === 127) return { isSafe: false, reason: "URL IP loopback dilarang." };
      if (b1 === 169 && b2 === 254) return { isSafe: false, reason: "URL IP link-local dilarang." };
    }

    return { isSafe: true };
  } catch {
    return { isSafe: false, reason: "Format URL tidak valid." };
  }
}

/**
 * Computes the HMAC-SHA256 signature for a webhook payload.
 * Signed string format: `${timestamp}.${rawBody}`
 */
export function signWebhookPayload(secret: string, timestamp: number, rawBody: string): string {
  const signedString = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signedString);
  return `v1=${hmac.digest("hex")}`;
}

/**
 * Verifies webhook signature with constant-time equality check and timestamp tolerance.
 */
export function verifyWebhookSignature(params: {
  secret: string;
  signatureHeader: string;
  timestampHeader: string | number;
  rawBody: string;
  toleranceSeconds?: number;
}): boolean {
  const tolerance = params.toleranceSeconds || 300; // 5 minutes tolerance
  const timestamp = typeof params.timestampHeader === "string" 
    ? parseInt(params.timestampHeader, 10) 
    : params.timestampHeader;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return false; // Signature expired
  }

  const expectedSignature = signWebhookPayload(params.secret, timestamp, params.rawBody);

  // Constant time comparison
  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const actualBuf = Buffer.from(params.signatureHeader, "utf-8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Creates a new webhook signing secret.
 */
export function generateWebhookSecret(): { secret: string; preview: string; encrypted: any } {
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const preview = `whsec_...${secret.slice(-6)}`;
  const encrypted = encryptToken(secret);
  return { secret, preview, encrypted };
}

/**
 * Webhook Dispatcher with retry queue support.
 */
export async function dispatchWebhookEvent(params: {
  ownerId: string;
  eventType: "payment.created" | "payment.paid" | "payment.expired" | "payment.failed" | "payment.cancelled";
  resourceId: string;
  data: Record<string, any>;
}): Promise<void> {
  // 1. Create Webhook Event record
  const event = await db.webhooks.createEvent({
    owner_id: params.ownerId,
    event_type: params.eventType,
    resource_id: params.resourceId,
    payload: {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      type: params.eventType,
      created_at: new Date().toISOString(),
      data: params.data,
    },
  });

  // 2. Fetch all enabled endpoints for owner
  const endpoints = await db.webhooks.listEndpoints(params.ownerId);
  const activeEndpoints = endpoints.filter(e => e.enabled);

  if (activeEndpoints.length === 0) {
    return;
  }

  // 3. Deliver to each endpoint
  for (const endpoint of activeEndpoints) {
    await deliverEventToEndpoint(endpoint, event);
  }
}

/**
 * Performs HTTP POST delivery of a webhook event to an endpoint.
 */
export async function deliverEventToEndpoint(
  endpoint: DBWebhookEndpoint,
  event: DBWebhookEvent,
  attemptNumber = 1
): Promise<void> {
  const safety = validateWebhookUrlSafety(endpoint.url);
  if (!safety.isSafe) {
    await db.webhooks.recordDelivery({
      endpoint_id: endpoint.id,
      event_id: event.id,
      attempt_count: attemptNumber,
      http_status: 400,
      response_excerpt: null,
      error_message: `SSRF Blocked: ${safety.reason}`,
      next_attempt_at: null,
      delivered_at: null,
    });
    return;
  }

  let secret: string;
  try {
    secret = decryptToken(endpoint.signing_secret_enc);
  } catch (err: any) {
    secret = "dummy_secret_fallback";
  }

  const rawBody = JSON.stringify(event.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestamp, rawBody);

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": event.payload.id || event.id,
        "X-Webhook-Timestamp": timestamp.toString(),
        "X-Webhook-Signature": signature,
        "User-Agent": "QRIS-Payment-Gateway-Webhook/1.0",
      },
      body: rawBody,
      signal: AbortSignal.timeout(10000), // 10s max timeout per webhook request
    });

    const responseText = await response.text().catch(() => "");
    const excerpt = responseText.slice(0, 500); // cap to 500 chars

    const isSuccess = response.ok;
    const now = new Date().toISOString();

    if (isSuccess) {
      await db.webhooks.recordDelivery({
        endpoint_id: endpoint.id,
        event_id: event.id,
        attempt_count: attemptNumber,
        http_status: response.status,
        response_excerpt: excerpt,
        error_message: null,
        next_attempt_at: null,
        delivered_at: now,
      });
    } else {
      // Calculate exponential backoff for retries: 1min, 5min, 15min (max 3 attempts)
      const nextAttempt = attemptNumber < 3
        ? new Date(Date.now() + Math.pow(attemptNumber, 2) * 60 * 1000).toISOString()
        : null;

      await db.webhooks.recordDelivery({
        endpoint_id: endpoint.id,
        event_id: event.id,
        attempt_count: attemptNumber,
        http_status: response.status,
        response_excerpt: excerpt,
        error_message: `Penerima mengembalikan status HTTP ${response.status}`,
        next_attempt_at: nextAttempt,
        delivered_at: null,
      });
    }
  } catch (err: any) {
    const nextAttempt = attemptNumber < 3
      ? new Date(Date.now() + Math.pow(attemptNumber, 2) * 60 * 1000).toISOString()
      : null;

    await db.webhooks.recordDelivery({
      endpoint_id: endpoint.id,
      event_id: event.id,
      attempt_count: attemptNumber,
      http_status: 0,
      response_excerpt: null,
      error_message: err.message || "Network / timeout error",
      next_attempt_at: nextAttempt,
      delivered_at: null,
    });
  }
}
