import { describe, it, expect } from "vitest";
import { generateApiKey, validateApiKey, hashApiKey } from "@/server/security/api-keys";
import { db } from "@/server/db/unified-db";

describe("API Key Management & Authentication", () => {
  const testOwner = "user_test_owner_1";

  it("generates sandbox and production keys with correct prefixes", async () => {
    const sandbox = await generateApiKey({
      ownerId: testOwner,
      name: "Test Sandbox Key",
      environment: "sandbox",
    });
    expect(sandbox.apiKey.startsWith("qris_test_")).toBe(true);
    expect(sandbox.record.key_prefix.startsWith("qris_test_")).toBe(true);

    const prod = await generateApiKey({
      ownerId: testOwner,
      name: "Test Prod Key",
      environment: "production",
    });
    expect(prod.apiKey.startsWith("qris_live_")).toBe(true);
  });

  it("validates authentic Bearer API Key", async () => {
    const created = await generateApiKey({
      ownerId: testOwner,
      name: "Backend Key",
      environment: "sandbox",
    });

    const validation = await validateApiKey(`Bearer ${created.apiKey}`);
    expect(validation.isValid).toBe(true);
    expect(validation.keyRecord?.owner_id).toBe(testOwner);
  });

  it("rejects missing, malformed, or fake Bearer headers", async () => {
    const noHeader = await validateApiKey(null);
    expect(noHeader.isValid).toBe(false);

    const badFormat = await validateApiKey("Basic 123456");
    expect(badFormat.isValid).toBe(false);

    const fakeKey = await validateApiKey("Bearer qris_test_completely_bogus_token");
    expect(fakeKey.isValid).toBe(false);
  });

  it("immediately rejects revoked API keys", async () => {
    const created = await generateApiKey({
      ownerId: testOwner,
      name: "Temporary Key",
      environment: "sandbox",
    });

    // Revoke
    await db.apiKeys.revoke(created.record.id, testOwner);

    const validation = await validateApiKey(`Bearer ${created.apiKey}`);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain("dicabut");
  });
});
