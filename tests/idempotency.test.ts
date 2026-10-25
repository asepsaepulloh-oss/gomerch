import { describe, it, expect } from "vitest";
import {
  computePayloadFingerprint,
  checkIdempotency,
  registerIdempotencyKey,
  completeIdempotencyKey,
} from "@/server/security/idempotency";

describe("Idempotency Engine", () => {
  const ownerId = "owner_idemp_test";
  const idempotencyKey = "key_req_0001";
  const payloadA = { external_id: "ORD-01", amount: 10000 };
  const payloadB = { external_id: "ORD-01", amount: 20000 }; // different amount

  const fingerprintA = computePayloadFingerprint(payloadA);
  const fingerprintB = computePayloadFingerprint(payloadB);

  it("registers initial request as processing", async () => {
    const initialCheck = await checkIdempotency({
      ownerId,
      idempotencyKey,
      fingerprint: fingerprintA,
    });
    expect(initialCheck.isDuplicate).toBe(false);

    await registerIdempotencyKey({
      ownerId,
      idempotencyKey,
      fingerprint: fingerprintA,
    });

    const secondCheck = await checkIdempotency({
      ownerId,
      idempotencyKey,
      fingerprint: fingerprintA,
    });
    expect(secondCheck.isDuplicate).toBe(true);
    expect(secondCheck.isProcessing).toBe(true);
  });

  it("returns cached completed response for identical payload", async () => {
    const cachedBody = { success: true, payment_id: "pay_cached_99" };
    await completeIdempotencyKey({
      ownerId,
      idempotencyKey,
      statusCode: 201,
      body: cachedBody,
    });

    const check = await checkIdempotency({
      ownerId,
      idempotencyKey,
      fingerprint: fingerprintA,
    });
    expect(check.isDuplicate).toBe(true);
    expect(check.cachedResponse?.statusCode).toBe(201);
    expect(check.cachedResponse?.body).toEqual(cachedBody);
  });

  it("detects and flags mismatched payload with identical key", async () => {
    const checkMismatch = await checkIdempotency({
      ownerId,
      idempotencyKey,
      fingerprint: fingerprintB,
    });
    expect(checkMismatch.isDuplicate).toBe(true);
    expect(checkMismatch.mismatchedPayload).toBe(true);
  });
});
