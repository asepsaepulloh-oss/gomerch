import { describe, it, expect } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  validateWebhookUrlSafety,
} from "@/server/services/webhook-service";

describe("Signed Webhook System & SSRF Defense", () => {
  const secret = "whsec_abcdef1234567890abcdef1234567890";
  const rawBody = JSON.stringify({
    id: "evt_123",
    type: "payment.paid",
    data: { amount: 25000, status: "PAID" },
  });

  it("generates and verifies valid HMAC-SHA256 signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(secret, timestamp, rawBody);

    const isValid = verifyWebhookSignature({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      rawBody,
    });

    expect(isValid).toBe(true);
  });

  it("rejects altered payload or incorrect secret", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(secret, timestamp, rawBody);

    // Tampered body
    const isAlteredValid = verifyWebhookSignature({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      rawBody: rawBody + " ",
    });
    expect(isAlteredValid).toBe(false);

    // Wrong secret
    const isWrongSecretValid = verifyWebhookSignature({
      secret: "whsec_wrong_secret",
      signatureHeader: signature,
      timestampHeader: timestamp,
      rawBody,
    });
    expect(isWrongSecretValid).toBe(false);
  });

  it("rejects timestamp that is beyond the tolerance window", () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const signature = signWebhookPayload(secret, staleTimestamp, rawBody);

    const isValid = verifyWebhookSignature({
      secret,
      signatureHeader: signature,
      timestampHeader: staleTimestamp,
      rawBody,
      toleranceSeconds: 300, // 5 minutes
    });

    expect(isValid).toBe(false);
  });

  it("blocks SSRF attacks to internal networks, localhost, and cloud metadata", () => {
    expect(validateWebhookUrlSafety("http://localhost:8080/hook").isSafe).toBe(false);
    expect(validateWebhookUrlSafety("http://127.0.0.1:3000/hook").isSafe).toBe(false);
    expect(validateWebhookUrlSafety("http://169.254.169.254/latest/meta-data").isSafe).toBe(false);
    expect(validateWebhookUrlSafety("http://192.168.1.1/webhook").isSafe).toBe(false);
    expect(validateWebhookUrlSafety("http://10.0.0.5/api").isSafe).toBe(false);
    expect(validateWebhookUrlSafety("file:///etc/passwd").isSafe).toBe(false);

    // Valid public URLs are permitted
    expect(validateWebhookUrlSafety("https://api.mymerchant.com/webhooks").isSafe).toBe(true);
    expect(validateWebhookUrlSafety("https://webhook.site/unique-uuid").isSafe).toBe(true);
  });
});
