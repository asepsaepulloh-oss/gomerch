export interface CreatePaymentInput {
  externalId: string;
  amount: number;
  currency: string;
  description?: string;
  merchantId?: string;
  merchantName?: string;
  staticQR?: string; // GoBiz Static QRIS string from merchant settings
  expiresInSeconds?: number;
}

export interface CreatedPayment {
  providerPaymentId: string;
  externalId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "FAILED";
  qrString: string;
  qrImageUrl?: string;
  expiresAt: string; // ISO 8601
  rawPayload?: Record<string, unknown>;
}

export interface PaymentStatus {
  providerPaymentId: string;
  externalId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "FAILED";
  paidAt?: string;
  providerTransactionId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface CancelResult {
  success: boolean;
  status: "CANCELLED";
  cancelledAt: string;
}

export interface ProviderWebhookInput {
  headers: Record<string, string>;
  rawBody: string;
}

export interface VerifiedEvent {
  isValid: boolean;
  eventType: string;
  providerPaymentId: string;
  externalId: string;
  amount: number;
  currency: string;
  status: "PAID" | "EXPIRED" | "FAILED";
  providerTransactionId: string;
  paidAt?: string;
}

export interface QrisPaymentProvider {
  name: string;
  isSandbox: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getPayment(providerPaymentId: string): Promise<PaymentStatus>;
  cancelPayment?(providerPaymentId: string): Promise<CancelResult>;
  verifyWebhook?(input: ProviderWebhookInput): Promise<VerifiedEvent>;
}
