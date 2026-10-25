import crypto from "node:crypto";

export type EncryptedToken = {
  ciphertext: string; // hex
  iv: string;         // hex (12 bytes = 24 hex chars)
  authTag: string;    // hex (16 bytes = 32 hex chars)
  keyVersion: number;
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit recommended for GCM
const AUTH_TAG_LENGTH = 16;
const DEFAULT_KEY_VERSION = 1;

/**
 * Resolves a 32-byte Buffer key from an environment string.
 * Supports 64-character hex strings or raw 32-byte strings.
 */
function resolveKeyBuffer(rawKey: string | undefined): Buffer {
  if (!rawKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY environment variable is missing or empty. A 32-byte hex or UTF-8 key is required."
    );
  }

  // If hex encoded (64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  // If raw string of 32 bytes
  const buf = Buffer.from(rawKey, "utf-8");
  if (buf.length === 32) {
    return buf;
  }

  // If not exactly 32 bytes, derive via SHA-256 to ensure exact 32 bytes
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Key registry for key rotation support.
 * Version 1 is primary, older versions can be registered via KEY_VERSION_X env vars.
 */
function getKeyForVersion(version: number): Buffer {
  if (version === 1) {
    const primaryKey = process.env.TOKEN_ENCRYPTION_KEY || "development_secret_key_needs_32_bytes_len!";
    return resolveKeyBuffer(primaryKey);
  }

  const versionedKey = process.env[`TOKEN_ENCRYPTION_KEY_V${version}`];
  if (!versionedKey) {
    throw new Error(`Encryption key for version ${version} not configured.`);
  }

  return resolveKeyBuffer(versionedKey);
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a cryptographically secure fresh IV.
 * Never reuses IV.
 */
export function encryptToken(plaintext: string, keyVersion: number = DEFAULT_KEY_VERSION): EncryptedToken {
  if (typeof plaintext !== "string") {
    throw new Error("Plaintext must be a string");
  }

  const key = getKeyForVersion(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    keyVersion,
  };
}

/**
 * Decrypts an EncryptedToken payload.
 * Verifies authenticity with GCM auth tag. Throws if tampered or invalid.
 */
export function decryptToken(payload: EncryptedToken): string {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error("Invalid encrypted token payload structure.");
  }

  const key = getKeyForVersion(payload.keyVersion || DEFAULT_KEY_VERSION);
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes.`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Re-encrypts an existing payload with the latest key version (for key rotation).
 */
export function rotateTokenEncryption(payload: EncryptedToken, newKeyVersion: number = DEFAULT_KEY_VERSION): EncryptedToken {
  const plaintext = decryptToken(payload);
  return encryptToken(plaintext, newKeyVersion);
}
