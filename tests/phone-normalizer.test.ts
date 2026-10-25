import { describe, it, expect } from "vitest";
import { normalizeIndonesianPhone, PhoneValidationError } from "@/server/utils/phone-normalizer";

describe("Indonesian Phone Normalization", () => {
  it("normalizes standard 08... format", () => {
    const res = normalizeIndonesianPhone("081234567890");
    expect(res.country_code).toBe("62");
    expect(res.phone_number).toBe("81234567890");
    expect(res.full_e164).toBe("+6281234567890");
    expect(res.phone_masked).toBe("+62 812-****-7890");
  });

  it("normalizes 628... format", () => {
    const res = normalizeIndonesianPhone("6281234567890");
    expect(res.country_code).toBe("62");
    expect(res.phone_number).toBe("81234567890");
    expect(res.full_e164).toBe("+6281234567890");
  });

  it("normalizes +628... format with spaces and dashes", () => {
    const res = normalizeIndonesianPhone("+62 812-3456-7890");
    expect(res.country_code).toBe("62");
    expect(res.phone_number).toBe("81234567890");
    expect(res.full_e164).toBe("+6281234567890");
    expect(res.phone_masked).toBe("+62 812-****-7890");
  });

  it("rejects numbers that do not start with 8", () => {
    expect(() => normalizeIndonesianPhone("0215551234")).toThrow(PhoneValidationError);
    expect(() => normalizeIndonesianPhone("0712345678")).toThrow("Nomor ponsel Indonesia harus diawali dengan angka 8");
  });

  it("rejects numbers with invalid lengths", () => {
    expect(() => normalizeIndonesianPhone("0812")).toThrow(PhoneValidationError);
    expect(() => normalizeIndonesianPhone("081234567890123456")).toThrow(PhoneValidationError);
  });

  it("rejects non-numeric inputs", () => {
    expect(() => normalizeIndonesianPhone("0812abcd7890")).toThrow(PhoneValidationError);
  });
});
