/**
 * EMVCo QRIS (Quick Response Code Indonesian Standard) Converter & Dynamic Generator
 * Standardized according to Bank Indonesia EMVCo MPM Specification.
 */

/**
 * Computes CRC-16 CCITT (polynomial 0x1021, initial value 0xFFFF)
 */
export function computeCRC16(data: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatTLV(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${tag}${length}${value}`;
}

export interface TLVMap {
  [tag: string]: string;
}

/**
 * Parses any standard EMVCo QR string into tag-length-value pairs.
 */
export function parseEMVCoQR(qrString: string): TLVMap {
  const map: TLVMap = {};
  let i = 0;
  while (i < qrString.length) {
    if (i + 4 > qrString.length) break;
    const tag = qrString.substring(i, i + 2);
    const len = parseInt(qrString.substring(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const val = qrString.substring(i + 4, i + 4 + len);
    map[tag] = val;
    i += 4 + len;
  }
  return map;
}

/**
 * Converts a static GoBiz / GoPay QRIS string into a dynamic QRIS string with custom amount and invoice.
 */
export function convertStaticToDynamicQRIS(params: {
  staticQR: string;
  amount: number;
  billNumber?: string;
}): string {
  let qr = params.staticQR.trim();
  const amountStr = Math.round(params.amount).toString();

  // If already ends with 4-digit CRC checksum (starts with 6304), strip it
  const crcIndex = qr.indexOf("6304");
  if (crcIndex !== -1) {
    qr = qr.substring(0, crcIndex);
  }

  const tlv = parseEMVCoQR(qr);

  // 1. Change Point of Initiation Method from Static (11) to Dynamic (12)
  tlv["01"] = "12";

  // 2. Set Transaction Currency to 360 (IDR) if not present
  if (!tlv["53"]) {
    tlv["53"] = "360";
  }

  // 3. Set Transaction Amount (Tag 54)
  tlv["54"] = amountStr;

  // 4. Add Additional Data Field (Tag 62) if billNumber provided
  if (params.billNumber) {
    const cleanBill = params.billNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 25);
    tlv["62"] = formatTLV("01", cleanBill);
  }

  // 5. Reconstruct TLV in canonical numerical order
  let reconstructed = "";
  const sortedTags = Object.keys(tlv).sort((a, b) => {
    return parseInt(a, 10) - parseInt(b, 10);
  });

  for (const tag of sortedTags) {
    if (tag === "63") continue; // Exclude checksum tag
    reconstructed += formatTLV(tag, tlv[tag]);
  }

  // Append 6304 and recalculate CRC16
  const payloadToSign = `${reconstructed}6304`;
  const checksum = computeCRC16(payloadToSign);

  return `${payloadToSign}${checksum}`;
}

export interface DynamicQRISInput {
  merchantName: string;
  merchantCity?: string;
  merchantId?: string;
  amount: number;
  billNumber: string;
  acquirerId?: string;
  staticQR?: string; // Optional: if provided, uses real merchant static QRIS as base!
}

/**
 * Generates an EMVCo compliant Dynamic QRIS string.
 * If staticQR is provided, converts it directly to retain exact GoBiz merchant identity & acquirer tags!
 */
export function generateDynamicQRIS(input: DynamicQRISInput): string {
  if (input.staticQR && input.staticQR.startsWith("000201")) {
    return convertStaticToDynamicQRIS({
      staticQR: input.staticQR,
      amount: input.amount,
      billNumber: input.billNumber,
    });
  }

  const cleanMerchantName = (input.merchantName || "MERCHANT").toUpperCase().slice(0, 25);
  const cleanCity = (input.merchantCity || "JAKARTA").toUpperCase().slice(0, 15);
  const cleanBill = input.billNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 25);
  const amountStr = Math.round(input.amount).toString();

  const nns = input.acquirerId || "93600999";
  const merchantAccInfo =
    formatTLV("00", "ID.CO.QRIS.WWW") +
    formatTLV("01", input.merchantId || "ID1020000000000") +
    formatTLV("02", nns) +
    formatTLV("03", "UME");

  const additionalData = formatTLV("01", cleanBill);

  let raw = "";
  raw += formatTLV("00", "01");
  raw += formatTLV("01", "12"); // Dynamic
  raw += formatTLV("26", merchantAccInfo);
  raw += formatTLV("52", "5411");
  raw += formatTLV("53", "360");
  raw += formatTLV("54", amountStr);
  raw += formatTLV("58", "ID");
  raw += formatTLV("59", cleanMerchantName);
  raw += formatTLV("60", cleanCity);
  raw += formatTLV("62", additionalData);

  const payloadToSign = `${raw}6304`;
  const checksum = computeCRC16(payloadToSign);

  return `${payloadToSign}${checksum}`;
}
