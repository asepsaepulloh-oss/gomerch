import { describe, it, expect } from "vitest";
import {
  encryptToken,
  decryptToken,
  rotateTokenEncryption,
} from "@/server/security/token-encryption";

describe("AES-256-GCM Token Encryption", () => {
  const sampleToken = "gobiz_sec_access_token_super_secret_value_123456789";

  it("encrypts and decrypts accurately back to plaintext", () => {
    const encrypted = encryptToken(sampleToken);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex characters
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex characters

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(sampleToken);
  });

  it("produces unique IV and ciphertext on repeated encryptions (never reuses IV)", () => {
    const enc1 = encryptToken(sampleToken);
    const enc2 = encryptToken(sampleToken);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

    // Both decrypt to same original value
    expect(decryptToken(enc1)).toBe(sampleToken);
    expect(decryptToken(enc2)).toBe(sampleToken);
  });

  it("fails when ciphertext has been tampered with", () => {
    const encrypted = encryptToken(sampleToken);
    // Tamper one byte in ciphertext
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -2) + "00";
    const tamperedPayload = { ...encrypted, ciphertext: tamperedCiphertext };

    expect(() => decryptToken(tamperedPayload)).toThrow();
  });

  it("fails when authTag has been tampered with", () => {
    const encrypted = encryptToken(sampleToken);
    const tamperedTag = "00000000000000000000000000000000";
    const tamperedPayload = { ...encrypted, authTag: tamperedTag };

    expect(() => decryptToken(tamperedPayload)).toThrow();
  });

  it("supports key rotation", () => {
    const original = encryptToken(sampleToken, 1);
    const rotated = rotateTokenEncryption(original, 1);

    expect(rotated.iv).not.toBe(original.iv);
    expect(decryptToken(rotated)).toBe(sampleToken);
  });
});
