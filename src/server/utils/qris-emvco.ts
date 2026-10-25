/**
 * EMVCo QRIS (Quick Response Code Indonesian Standard) Dynamic QR Generator
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

export interface DynamicQRISInput {
  merchantName: string;
  merchantCity?: string;
  merchantId?: string;
  amount: number;
  billNumber: string; // external reference
  acquirerId?: string; // National Merchant ID or NNS
}

/**
 * Generates an EMVCo compliant Dynamic QRIS string with CRC-16 checksum.
 */
export function generateDynamicQRIS(input: DynamicQRISInput): string {
  const cleanMerchantName = (input.merchantName || "MERCHANT").toUpperCase().slice(0, 25);
  const cleanCity = (input.merchantCity || "JAKARTA").toUpperCase().slice(0, 15);
  const cleanBill = input.billNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 25);
  const amountStr = Math.round(input.amount).toString();

  // Tag 26: Merchant Account Information (Bank Indonesia standard)
  const nns = input.acquirerId || "93600999"; // default test acquirer
  const merchantAccInfo = 
    formatTLV("00", "ID.CO.QRIS.WWW") +
    formatTLV("01", input.merchantId || "ID1020000000000") +
    formatTLV("02", nns) +
    formatTLV("03", "UME"); // Merchant criteria (UME = Usaha Mikro)

  // Tag 62: Additional Data Field (Invoice / Bill Number)
  const additionalData = formatTLV("01", cleanBill);

  let raw = "";
  // 00: Payload Format Indicator (01)
  raw += formatTLV("00", "01");
  // 01: Point of Initiation Method (12 = Dynamic QR, 11 = Static)
  raw += formatTLV("01", "12");
  // 26: Merchant Account Info
  raw += formatTLV("26", merchantAccInfo);
  // 52: Merchant Category Code (5411 = Grocery/Stores)
  raw += formatTLV("52", "5411");
  // 53: Transaction Currency (360 = IDR)
  raw += formatTLV("53", "360");
  // 54: Transaction Amount
  raw += formatTLV("54", amountStr);
  // 58: Country Code (ID)
  raw += formatTLV("58", "ID");
  // 59: Merchant Name
  raw += formatTLV("59", cleanMerchantName);
  // 60: Merchant City
  raw += formatTLV("60", cleanCity);
  // 62: Additional Data
  raw += formatTLV("62", additionalData);

  // 63: CRC placeholder "6304"
  const payloadToSign = `${raw}6304`;
  const checksum = computeCRC16(payloadToSign);

  return `${payloadToSign}${checksum}`;
}
