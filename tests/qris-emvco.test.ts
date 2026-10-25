import { describe, it, expect } from "vitest";
import { generateDynamicQRIS, computeCRC16 } from "@/server/utils/qris-emvco";

describe("EMVCo QRIS Dynamic Generator", () => {
  it("calculates standard CRC16-CCITT correctly", () => {
    // Known test vector for CRC16-CCITT (0xFFFF init)
    const crc = computeCRC16("123456789");
    expect(crc).toBe("29B1");
  });

  it("generates compliant Dynamic QRIS payload string", () => {
    const qris = generateDynamicQRIS({
      merchantName: "Resto Padang",
      merchantCity: "JAKARTA",
      merchantId: "ID1020000000001",
      amount: 45000,
      billNumber: "INV-9901",
    });

    // Tag 00: 01 (Format indicator)
    expect(qris).toContain("000201");
    // Tag 01: 12 (Dynamic initiation)
    expect(qris).toContain("010212");
    // Tag 53: 360 (Currency IDR)
    expect(qris).toContain("5303360");
    // Tag 54: Amount 45000
    expect(qris).toContain("540545000");
    // Tag 58: Country ID
    expect(qris).toContain("5802ID");
    // Tag 59: Merchant name RESTO PADANG
    expect(qris).toContain("5912RESTO PADANG");
    // Tag 63: CRC checksum
    expect(qris.length).toBeGreaterThan(60);
    expect(qris.slice(-8, -4)).toBe("6304");

    // Validate that the checksum attached matches recalculation
    const payloadWithoutCrc = qris.slice(0, -4);
    const checksum = qris.slice(-4);
    expect(computeCRC16(payloadWithoutCrc)).toBe(checksum);
  });
});
