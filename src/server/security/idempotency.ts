import crypto from "node:crypto";
import { db } from "@/server/db/unified-db";

export function computePayloadFingerprint(body: any): string {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  isProcessing: boolean;
  cachedResponse?: {
    statusCode: number;
    body: any;
  };
  mismatchedPayload?: boolean;
}

export async function checkIdempotency(params: {
  ownerId: string;
  idempotencyKey: string;
  fingerprint: string;
}): Promise<IdempotencyCheckResult> {
  const existing = await db.idempotency.get(params.ownerId, params.idempotencyKey);

  if (!existing) {
    return { isDuplicate: false, isProcessing: false };
  }

  // Check if payload matches
  if (existing.request_fingerprint !== params.fingerprint) {
    return {
      isDuplicate: true,
      isProcessing: false,
      mismatchedPayload: true,
    };
  }

  if (existing.status === "PROCESSING") {
    // Check if expired lock
    const isExpired = new Date(existing.expires_at).getTime() < Date.now();
    if (!isExpired) {
      return {
        isDuplicate: true,
        isProcessing: true,
      };
    }
  }

  if (existing.status === "COMPLETED" && existing.response_code && existing.response_body) {
    return {
      isDuplicate: true,
      isProcessing: false,
      cachedResponse: {
        statusCode: existing.response_code,
        body: existing.response_body,
      },
    };
  }

  return { isDuplicate: false, isProcessing: false };
}

export async function registerIdempotencyKey(params: {
  ownerId: string;
  idempotencyKey: string;
  fingerprint: string;
  expiresInSeconds?: number;
}): Promise<void> {
  const ttl = params.expiresInSeconds || 86400; // 24 hours
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await db.idempotency.create({
    owner_id: params.ownerId,
    idempotency_key: params.idempotencyKey,
    request_fingerprint: params.fingerprint,
    status: "PROCESSING",
    response_code: null,
    response_body: null,
    resource_id: null,
    expires_at: expiresAt,
  });
}

export async function completeIdempotencyKey(params: {
  ownerId: string;
  idempotencyKey: string;
  statusCode: number;
  body: any;
  resourceId?: string;
}): Promise<void> {
  await db.idempotency.complete(
    params.ownerId,
    params.idempotencyKey,
    params.statusCode,
    params.body,
    params.resourceId
  );
}
