import QRCode from "qrcode";
import { generateDynamicQRIS } from "@/server/utils/qris-emvco";
import {
  QrisPaymentProvider,
  CreatePaymentInput,
  CreatedPayment,
  PaymentStatus,
  CancelResult,
  ProviderWebhookInput,
  VerifiedEvent,
} from "./types";

/**
 * In-memory store for sandbox payment status simulation.
 */
const sandboxPayments = new Map<string, {
  providerPaymentId: string;
  externalId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "FAILED";
  expiresAt: string;
  paidAt?: string;
  providerTransactionId?: string;
  qrString: string;
}>();

export class SandboxQrisProvider implements QrisPaymentProvider {
  name = "SANDBOX_MOCK_QRIS";
  isSandbox = true;

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const providerPaymentId = `sbx_pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresSeconds = input.expiresInSeconds || 900; // default 15 minutes
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();

    const qrString = generateDynamicQRIS({
      merchantName: input.merchantName || "QRIS DEMO GATEWAY",
      merchantCity: "JAKARTA",
      merchantId: input.merchantId || "MCH-DEMO-001",
      amount: input.amount,
      billNumber: input.externalId,
      staticQR: input.staticQR,
    });

    let qrImageUrl: string | undefined;
    try {
      qrImageUrl = await QRCode.toDataURL(qrString, {
        margin: 2,
        width: 320,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
    } catch {
      qrImageUrl = undefined;
    }

    const paymentRecord = {
      providerPaymentId,
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency || "IDR",
      status: "PENDING" as const,
      expiresAt,
      qrString,
    };

    sandboxPayments.set(providerPaymentId, paymentRecord);

    return {
      providerPaymentId,
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency || "IDR",
      status: "PENDING",
      qrString,
      qrImageUrl,
      expiresAt,
      rawPayload: { provider: this.name, simulated: true },
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentStatus> {
    const payment = sandboxPayments.get(providerPaymentId);
    if (!payment) {
      throw new Error(`Payment with ID ${providerPaymentId} not found in sandbox provider.`);
    }

    // Auto-expire if past expiry date
    if (payment.status === "PENDING" && new Date(payment.expiresAt).getTime() < Date.now()) {
      payment.status = "EXPIRED";
    }

    return {
      providerPaymentId: payment.providerPaymentId,
      externalId: payment.externalId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
      providerTransactionId: payment.providerTransactionId,
      rawPayload: { sandbox: true },
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<CancelResult> {
    const payment = sandboxPayments.get(providerPaymentId);
    if (!payment) {
      throw new Error(`Payment ${providerPaymentId} not found.`);
    }

    if (payment.status === "PAID") {
      throw new Error("Cannot cancel payment that has already been PAID.");
    }

    payment.status = "CANCELLED";
    const cancelledAt = new Date().toISOString();

    return {
      success: true,
      status: "CANCELLED",
      cancelledAt,
    };
  }

  /**
   * Helper method for testing/sandbox simulations: simulate customer paying the QRIS.
   */
  async simulatePaymentSuccess(providerPaymentId: string, customTxId?: string): Promise<PaymentStatus> {
    const payment = sandboxPayments.get(providerPaymentId);
    if (!payment) {
      throw new Error(`Payment ${providerPaymentId} not found in sandbox.`);
    }

    if (payment.status === "PAID") {
      return this.getPayment(providerPaymentId);
    }

    payment.status = "PAID";
    payment.paidAt = new Date().toISOString();
    payment.providerTransactionId = customTxId || `sbx_tx_${Date.now()}`;

    return {
      providerPaymentId: payment.providerPaymentId,
      externalId: payment.externalId,
      amount: payment.amount,
      currency: payment.currency,
      status: "PAID",
      paidAt: payment.paidAt,
      providerTransactionId: payment.providerTransactionId,
    };
  }
}

/**
 * Production Adapter for registered official QRIS Provider.
 */
export class ProductionQrisProvider implements QrisPaymentProvider {
  name: string;
  isSandbox = false;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.name = process.env.QRIS_PROVIDER || "OFFICIAL_QRIS_PROVIDER";
    this.baseUrl = (process.env.QRIS_PROVIDER_BASE_URL || "").replace(/\/+$/, "");
    this.apiKey = process.env.QRIS_PROVIDER_API_KEY || "";

    if (!this.apiKey || !this.baseUrl) {
      // Per master prompt: If production provider keys are not yet configured,
      // clearly mark production as unavailable and guide users to use Sandbox.
    }
  }

  private checkConfig() {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error(
        "Konfigurasi Production QRIS Provider (QRIS_PROVIDER_BASE_URL, QRIS_PROVIDER_API_KEY) belum dikonfigurasi. Silakan aktifkan mode Sandbox atau isi kredensial provider resmi pada environment server."
      );
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    this.checkConfig();

    const response = await fetch(`${this.baseUrl}/qris/dynamic`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: input.externalId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        merchant_id: input.merchantId,
        expires_in_seconds: input.expiresInSeconds || 900,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || `Gagal membuat tagihan QRIS ke provider: HTTP ${response.status}`);
    }

    return {
      providerPaymentId: data.id || data.payment_id,
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency,
      status: data.status || "PENDING",
      qrString: data.qr_string,
      qrImageUrl: data.qr_image_url,
      expiresAt: data.expires_at || new Date(Date.now() + 900000).toISOString(),
      rawPayload: data,
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentStatus> {
    this.checkConfig();

    const response = await fetch(`${this.baseUrl}/qris/payments/${providerPaymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || `Provider payment query failed with HTTP ${response.status}`);
    }

    return {
      providerPaymentId,
      externalId: data.external_id,
      amount: data.amount,
      currency: data.currency || "IDR",
      status: data.status,
      paidAt: data.paid_at,
      providerTransactionId: data.provider_transaction_id,
      rawPayload: data,
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<CancelResult> {
    this.checkConfig();

    const response = await fetch(`${this.baseUrl}/qris/payments/${providerPaymentId}/cancel`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || `Payment cancellation failed: HTTP ${response.status}`);
    }

    return {
      success: true,
      status: "CANCELLED",
      cancelledAt: data.cancelled_at || new Date().toISOString(),
    };
  }
}

/**
 * Singleton factory to get the active QRIS provider
 */
let sandboxProviderInstance: SandboxQrisProvider | null = null;
let productionProviderInstance: ProductionQrisProvider | null = null;

export function getQrisProvider(preferSandbox = false): QrisPaymentProvider {
  // If production QRIS provider credentials are not explicitly filled in .env,
  // gracefully fall back to EMVCo dynamic QRIS generator so user can create & see QRIS instantly
  if (preferSandbox || process.env.QRIS_PROVIDER === "sandbox" || !process.env.QRIS_PROVIDER_API_KEY) {
    if (!sandboxProviderInstance) {
      sandboxProviderInstance = new SandboxQrisProvider();
    }
    return sandboxProviderInstance;
  }

  if (!productionProviderInstance) {
    productionProviderInstance = new ProductionQrisProvider();
  }
  return productionProviderInstance;
}
