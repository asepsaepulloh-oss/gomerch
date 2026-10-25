import { normalizeIndonesianPhone } from "@/server/utils/phone-normalizer";
import {
  RequestOtpResult,
  VerifyOtpInput,
  GobizTokenResult,
  GobizMerchantInfo,
  TransactionProvider,
  TransactionPage,
  ProviderTransactionItem,
} from "./types";

const GOBIZ_BASE_URL = process.env.GOBIZ_API_BASE_URL || "https://api.gobiz.co.id";
const GOBIZ_CLIENT_ID = process.env.GOBIZ_CLIENT_ID || "go-biz-web-new";
const USE_MOCK_GOBIZ = process.env.USE_MOCK_GOBIZ === "true" || process.env.NODE_ENV === "test";

// Rate limiting in-memory map for OTP attempts: phone -> { attempts, lastAttempt }
const otpRateLimitMap = new Map<string, { attempts: number; resetAt: number }>();

function checkOtpRateLimit(phoneNumber: string): void {
  const now = Date.now();
  const record = otpRateLimitMap.get(phoneNumber);

  if (record) {
    if (now < record.resetAt) {
      if (record.attempts >= 5) {
        const remainingMinutes = Math.ceil((record.resetAt - now) / 60000);
        throw new Error(
          `Terlalu banyak permintaan OTP untuk nomor ini. Silakan coba lagi dalam ${remainingMinutes} menit.`
        );
      }
      record.attempts += 1;
    } else {
      otpRateLimitMap.set(phoneNumber, { attempts: 1, resetAt: now + 15 * 60 * 1000 });
    }
  } else {
    otpRateLimitMap.set(phoneNumber, { attempts: 1, resetAt: now + 15 * 60 * 1000 });
  }
}

export class GobizAdapter {
  private clientId: string;
  private baseUrl: string;

  constructor(baseUrl = GOBIZ_BASE_URL, clientId = GOBIZ_CLIENT_ID) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.clientId = clientId;
  }

  /**
   * Request OTP from GoBiz.
   * Endpoint: POST https://api.gobiz.co.id/goid/login/request
   * Strict contract:
   * - No login_type
   * - No channel
   * - No empty Authorization header
   * - Content-Type: application/json
   */
  async requestOtp(rawPhone: string): Promise<RequestOtpResult> {
    const normalized = normalizeIndonesianPhone(rawPhone);
    checkOtpRateLimit(normalized.phone_number);

    // If sandbox / mock mode
    if (USE_MOCK_GOBIZ) {
      return {
        success: true,
        message: "Kode OTP simulasi telah dikirim (Gunakan 123456 untuk sandbox).",
        requestId: `mock_req_${Date.now()}`,
        expiresInSeconds: 300,
      };
    }

    const payload = {
      client_id: this.clientId,
      phone_number: normalized.full_e164, // or normalized.phone_number per GoBiz auth spec
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/login/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          // DO NOT send empty Authorization header
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = data?.message || data?.error_description || `GoBiz request failed with HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      return {
        success: true,
        message: data.message || "Kode OTP berhasil dikirim.",
        requestId: data.request_id || data.id,
        expiresInSeconds: data.expires_in || 300,
      };
    } catch (err: unknown) {
      const error = err as Error;
      // If external network is unreachable or blocked, fallback gracefully with explanation
      if (error.name === "TimeoutError" || error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
        throw new Error(
          `Tidak dapat terhubung ke GoBiz API Gateway (${error.message}). Pastikan jaringan mengizinkan akses ke ${this.baseUrl} atau aktifkan USE_MOCK_GOBIZ=true untuk sandbox.`
        );
      }
      throw error;
    }
  }

  /**
   * Verify OTP and obtain Access/Refresh tokens.
   * Endpoint: POST https://api.gobiz.co.id/goid/token
   */
  async verifyOtp(input: VerifyOtpInput): Promise<GobizTokenResult> {
    const normalized = normalizeIndonesianPhone(input.phone_number);

    if (!input.otp || input.otp.trim().length === 0) {
      throw new Error("Kode OTP harus diisi.");
    }

    if (USE_MOCK_GOBIZ) {
      if (input.otp !== "123456" && input.otp !== "654321") {
        throw new Error("Kode OTP salah atau telah kedaluwarsa (Gunakan 123456 pada sandbox).");
      }

      return {
        accessToken: `mock_gobiz_at_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        refreshToken: `mock_gobiz_rt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        expiresIn: 86400,
        tokenType: "Bearer",
      };
    }

    const payload = {
      client_id: this.clientId,
      phone_number: normalized.full_e164,
      otp: input.otp.trim(),
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = data?.error_description || data?.message || `Verifikasi OTP gagal (HTTP ${response.status})`;
        throw new Error(errMsg);
      }

      if (!data.access_token) {
        throw new Error("Respons GoBiz tidak berisi access_token yang valid.");
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400,
        tokenType: data.token_type || "Bearer",
      };
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "TimeoutError" || error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
        throw new Error(
          `Gagal menghubungi GoBiz token endpoint (${error.message}). Gunakan USE_MOCK_GOBIZ=true untuk sandbox testing.`
        );
      }
      throw error;
    }
  }

  /**
   * Refresh expired GoBiz token.
   * Endpoint: POST https://api.gobiz.co.id/goid/token (with grant_type: refresh_token if supported)
   */
  async refreshToken(refreshToken: string): Promise<GobizTokenResult> {
    if (!refreshToken) {
      throw new Error("Refresh token tidak disediakan.");
    }

    if (USE_MOCK_GOBIZ) {
      return {
        accessToken: `mock_gobiz_at_refreshed_${Date.now()}`,
        refreshToken: `mock_gobiz_rt_refreshed_${Date.now()}`,
        expiresIn: 86400,
        tokenType: "Bearer",
      };
    }

    const payload = {
      client_id: this.clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.message || data?.error_description || `Gagal refresh token (HTTP ${response.status})`);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 86400,
        tokenType: data.token_type || "Bearer",
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Refresh token gagal: ${error.message}`);
    }
  }

  /**
   * Resolve Merchant Identity from GoBiz config endpoint.
   * Endpoint: GET https://api.gobiz.co.id/goresto/v5/public/users/config
   */
  async resolveMerchant(accessToken: string): Promise<GobizMerchantInfo> {
    if (!accessToken) {
      throw new Error("Access token tidak valid.");
    }

    if (USE_MOCK_GOBIZ) {
      return {
        merchantId: "GBZ-MCH-98721",
        merchantName: "Resto Nusantara (Sandbox Verified)",
        businessType: "F&B / Retail",
        email: "merchant@example.com",
        isVerified: true,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/goresto/v5/public/users/config`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.message || `Gagal mengambil konfigurasi merchant dari GoBiz (HTTP ${response.status})`
        );
      }

      // GoBiz user config response structure validation:
      // Typically: data.data.merchant or data.stores[0] or data.user.merchant_id
      const merchantObj = data?.data?.merchant || data?.data?.stores?.[0] || data?.merchant || data?.restaurant;
      const merchantId = merchantObj?.id || merchantObj?.merchant_id || data?.data?.id || data?.id;
      const merchantName = merchantObj?.name || merchantObj?.store_name || data?.data?.name || "Merchant GoBiz";

      if (!merchantId) {
        throw new Error("Merchant ID tidak ditemukan dalam respons GoBiz config. Akun belum terhubung ke outlet aktif.");
      }

      return {
        merchantId: String(merchantId),
        merchantName: String(merchantName),
        businessType: merchantObj?.business_type || "Merchant",
        email: data?.data?.email || data?.email,
        isVerified: true,
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Resolusi merchant GoBiz gagal: ${error.message}`);
    }
  }
}

/**
 * GoBiz Analytics Transaction Provider.
 * Fetches transaction records from GoPay Merchant Analytics or Mock Sandbox.
 */
export class GobizTransactionProvider implements TransactionProvider {
  private baseUrl: string;

  constructor(baseUrl = GOBIZ_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async fetchTransactions(input: {
    merchantId: string;
    cursor?: string;
    from?: string;
    to?: string;
    accessToken?: string;
  }): Promise<TransactionPage> {
    if (USE_MOCK_GOBIZ || !input.accessToken) {
      // In sandbox/mock, return mock transactions for testing sync & matching
      return {
        transactions: [],
        nextCursor: undefined,
        hasMore: false,
      };
    }

    try {
      const url = new URL(`${this.baseUrl}/merchant-analytics/v1/transactions`);
      url.searchParams.set("merchant_id", input.merchantId);
      if (input.cursor) url.searchParams.set("cursor", input.cursor);
      if (input.from) url.searchParams.set("from", input.from);
      if (input.to) url.searchParams.set("to", input.to);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`GoBiz Analytics fetch failed: HTTP ${response.status}`);
      }

      const body = await response.json();
      const items: ProviderTransactionItem[] = (body.data?.items || []).map((item: any) => ({
        id: item.transaction_id || item.id,
        merchantId: input.merchantId,
        payableAmount: Number(item.amount || item.payable_amount),
        currency: item.currency || "IDR",
        transactionStatus: item.status === "SUCCESS" || item.status === "SETTLED" ? "SUCCESS" : "FAILED",
        transactionTime: item.transaction_time || item.created_at || new Date().toISOString(),
        source: "GOBIZ_ANALYTICS" as const,
        rawPayload: item,
      }));

      return {
        transactions: items,
        nextCursor: body.data?.next_cursor,
        hasMore: Boolean(body.data?.has_more),
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Gagal mengambil riwayat transaksi GoBiz: ${error.message}`);
    }
  }
}
