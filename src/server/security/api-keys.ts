import crypto from "node:crypto";
import { db, DBApiKey } from "@/server/db/unified-db";

export interface GeneratedApiKey {
  apiKey: string; // The plaintext secret - only shown once!
  record: DBApiKey;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

export async function generateApiKey(params: {
  ownerId: string;
  name: string;
  environment: "sandbox" | "production";
  permissions?: string[];
}): Promise<GeneratedApiKey> {
  const prefix = params.environment === "production" ? "qris_live_" : "qris_test_";
  const randomSecret = crypto.randomBytes(24).toString("base64url");
  const fullKey = `${prefix}${randomSecret}`;

  const keyPrefix = `${prefix}${randomSecret.slice(0, 6)}...`;
  const keyHash = hashApiKey(fullKey);

  const record = await db.apiKeys.create({
    owner_id: params.ownerId,
    name: params.name.trim(),
    key_prefix: keyPrefix,
    key_hash: keyHash,
    environment: params.environment,
    permissions: params.permissions || ["payments:read", "payments:write"],
  });

  return {
    apiKey: fullKey,
    record,
  };
}

export interface ValidatedApiKey {
  isValid: boolean;
  keyRecord?: DBApiKey;
  error?: string;
}

export async function validateApiKey(headerAuth: string | null): Promise<ValidatedApiKey> {
  if (!headerAuth || typeof headerAuth !== "string") {
    return { isValid: false, error: "Header Authorization Bearer diperlukan." };
  }

  const parts = headerAuth.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { isValid: false, error: "Format Authorization header harus 'Bearer <API_KEY>'." };
  }

  const token = parts[1].trim();
  if (!token.startsWith("qris_test_") && !token.startsWith("qris_live_")) {
    return { isValid: false, error: "Format API key tidak valid." };
  }

  const keyHash = hashApiKey(token);
  const record = await db.apiKeys.findByHash(keyHash);

  if (!record) {
    return { isValid: false, error: "API key tidak ditemukan atau salah." };
  }

  if (record.revoked_at) {
    return { isValid: false, error: "API key telah dicabut (revoked)." };
  }

  // Update last used asynchronously without blocking request
  db.apiKeys.updateLastUsed(record.id).catch(() => {});

  return {
    isValid: true,
    keyRecord: record,
  };
}
