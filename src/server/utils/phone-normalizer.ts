export interface NormalizedPhone {
  country_code: string;  // strictly "62"
  phone_number: string;  // e.g. "81234567890"
  full_e164: string;     // e.g. "+6281234567890"
  phone_masked: string;  // e.g. "+62 812-****-7890"
}

export class PhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneValidationError";
  }
}

/**
 * Normalizes Indonesian mobile phone numbers according to Indonesian telecommunication standards.
 */
export function normalizeIndonesianPhone(input: string): NormalizedPhone {
  if (!input || typeof input !== "string") {
    throw new PhoneValidationError("Nomor telepon tidak boleh kosong");
  }

  // Remove whitespace, dashes, dots, brackets
  let cleaned = input.trim().replace(/[\s\-\.\(\)]/g, "");

  // Remove leading plus sign if present
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // Handle leading country code 62
  if (cleaned.startsWith("62")) {
    cleaned = cleaned.slice(2);
  }

  // Handle leading 0
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  // Only digits allowed
  if (!/^\d+$/.test(cleaned)) {
    throw new PhoneValidationError("Nomor telepon hanya boleh berisi angka");
  }

  // Validate mobile prefix: Indonesian mobile numbers start with '8'
  if (!cleaned.startsWith("8")) {
    throw new PhoneValidationError("Nomor ponsel Indonesia harus diawali dengan angka 8 (contoh: 0812...)");
  }

  // Validate length: Indonesian mobile numbers are 9-13 digits without leading 0 (e.g. 81234567890 = 11 digits)
  if (cleaned.length < 8 || cleaned.length > 13) {
    throw new PhoneValidationError(
      `Panjang nomor tidak valid (${cleaned.length} digit). Nomor ponsel Indonesia umumnya memiliki panjang 9-13 digit.`
    );
  }

  const country_code = "62";
  const phone_number = cleaned;
  const full_e164 = `+${country_code}${phone_number}`;

  // Create masked representation e.g. +62 812-****-7890
  const prefix = phone_number.slice(0, 3);
  const suffix = phone_number.slice(-4);
  const phone_masked = `+62 ${prefix}-****-${suffix}`;

  return {
    country_code,
    phone_number,
    full_e164,
    phone_masked,
  };
}
