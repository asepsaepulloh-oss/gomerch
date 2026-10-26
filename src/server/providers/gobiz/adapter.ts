import crypto from "node:crypto";
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

const BASE_URL = process.env.GOBIZ_API_BASE_URL || "https://api.gobiz.co.id";
const CLIENT_ID = process.env.GOBIZ_CLIENT_ID || "go-biz-web-new";
const USE_MOCK_GOBIZ = process.env.USE_MOCK_GOBIZ === "true";

function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Returns exact browser-like headers expected by GoBiz WAF & API Gateway.
 */
function getGoBizHeaders(uniqueId: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "id",
    "Authentication-Type": "go-id",
    "Connection": "keep-alive",
    "Content-Type": "application/json",
    "Gojek-Country-Code": "ID",
    "Gojek-Timezone": "Asia/Jakarta",
    "Origin": "https://portal.gofoodmerchant.co.id",
    "Referer": "https://portal.gofoodmerchant.co.id/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "X-AppVersion": "platform-v3.107.0-94ce5d57",
    "X-PhoneMake": "Windows 10 64-bit",
    "X-PhoneModel": "Chrome 149.0.0.0 on Windows 10 64-bit",
    "X-Platform": "Web",
    "X-User-Locale": "en-US",
    "X-User-Type": "merchant",
    "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "x-DeviceOS": "Web",
    "x-appId": "go-biz-web-dashboard",
    "x-uniqueid": uniqueId,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return headers;
}

export class GobizAdapter {
  private clientId: string;
  private baseUrl: string;

  constructor(baseUrl = BASE_URL, clientId = CLIENT_ID) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.clientId = clientId;
  }

  /**
   * Request OTP via GoBiz Login Request API.
   * Endpoint: POST https://api.gobiz.co.id/goid/login/request
   */
  async requestOtp(rawPhone: string): Promise<RequestOtpResult & { otpToken?: string }> {
    const normalized = normalizeIndonesianPhone(rawPhone);

    if (USE_MOCK_GOBIZ) {
      return {
        success: true,
        message: "Kode OTP simulasi telah dikirim (Gunakan 123456 untuk sandbox).",
        requestId: `mock_req_${Date.now()}`,
        expiresInSeconds: 300,
        otpToken: "mock_otp_token_12345",
      };
    }

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId);

    const payload = {
      client_id: this.clientId,
      phone_number: normalized.phone_number, // Clean digit without 0 or 62 (e.g. 81234567890)
      country_code: "62",
      login_type: "otp",
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/login/request`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.errors?.length > 0) {
        const errorMsg = data.errors?.[0]?.message || data.message || `Request OTP gagal (HTTP ${response.status})`;
        throw new Error(errorMsg);
      }

      const responseData = data.data || data;
      const otpToken = responseData.otp_token || responseData.token || null;

      return {
        success: true,
        message: data.message || "Kode OTP berhasil dikirim via SMS/WhatsApp GoBiz.",
        requestId: data.request_id || otpToken || `req_${Date.now()}`,
        expiresInSeconds: data.expires_in || 300,
        otpToken: otpToken || undefined,
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Request OTP GoBiz gagal: ${error.message}`);
    }
  }

  /**
   * Verify OTP and exchange with GoBiz Access & Refresh Tokens.
   * Endpoint: POST https://api.gobiz.co.id/goid/token
   */
  async verifyOtp(input: VerifyOtpInput & { otpToken?: string }): Promise<GobizTokenResult> {
    const normalized = normalizeIndonesianPhone(input.phone_number);

    if (!input.otp || input.otp.trim().length === 0) {
      throw new Error("Kode OTP harus diisi.");
    }

    if (USE_MOCK_GOBIZ) {
      if (input.otp !== "123456" && input.otp !== "654321") {
        throw new Error("Kode OTP salah atau sudah kedaluwarsa (Gunakan 123456 pada sandbox).");
      }
      return {
        accessToken: `mock_gobiz_at_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        refreshToken: `mock_gobiz_rt_${Date.now()}`,
        expiresIn: 86400,
        tokenType: "Bearer",
      };
    }

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId);

    const payload = {
      client_id: this.clientId,
      grant_type: "otp",
      data: {
        otp: input.otp.trim(),
        ...(input.otpToken ? { otp_token: input.otpToken } : { phone_number: normalized.phone_number }),
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/token`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.errors?.length > 0) {
        const errorMsg = data.errors?.[0]?.message || data.message || `Verifikasi OTP gagal (HTTP ${response.status})`;
        throw new Error(errorMsg);
      }

      if (!data.access_token) {
        throw new Error("Respons GoBiz tidak mengembalikan access_token yang sah.");
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400,
        tokenType: data.token_type || "Bearer",
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Verifikasi OTP gagal: ${error.message}`);
    }
  }

  /**
   * Login using GoBiz merchant Email and Password credentials.
   * Step 1: POST https://api.gobiz.co.id/goid/login/request (validate email)
   * Step 2: POST https://api.gobiz.co.id/goid/token (grant_type: password)
   */
  async loginWithPassword(email: string, password: string): Promise<GobizTokenResult> {
    if (!email || !password) {
      throw new Error("Email dan password GoBiz wajib diisi.");
    }

    if (USE_MOCK_GOBIZ) {
      return {
        accessToken: `mock_gobiz_at_email_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        refreshToken: `mock_gobiz_rt_email_${Date.now()}`,
        expiresIn: 86400,
        tokenType: "Bearer",
      };
    }

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId);

    // Step 1: Validate email with GoBiz Login Request
    try {
      const valRes = await fetch(`${this.baseUrl}/goid/login/request`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: email.trim(),
          login_type: "password",
          client_id: this.clientId,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const valData = await valRes.json().catch(() => ({}));
      if (valData.errors?.length > 0) {
        console.warn(`[GoBiz Auth Warning] ${valData.errors[0].message}`);
      }
    } catch (e) {
      // Non-blocking warning
    }

    // Step 2: Exchange Email + Password for Access Token
    const payload = {
      client_id: this.clientId,
      grant_type: "password",
      data: {
        email: email.trim(),
        password: password,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/token`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.errors?.length > 0) {
        const errMsg = data.errors?.[0]?.message || data.message || `Login GoBiz gagal (HTTP ${response.status})`;
        throw new Error(errMsg);
      }

      if (!data.access_token) {
        throw new Error("Respons GoBiz tidak mengembalikan access_token yang sah.");
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400,
        tokenType: data.token_type || "Bearer",
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Login GoBiz gagal: ${error.message}`);
    }
  }

  /**
   * Resolve Merchant Profile & Merchant ID from GoBiz merchants/search API.
   * Endpoint: POST https://api.gobiz.co.id/v1/merchants/search
   */
  async resolveMerchant(accessToken: string): Promise<GobizMerchantInfo> {
    if (!accessToken) {
      throw new Error("Access token tidak valid.");
    }

    if (USE_MOCK_GOBIZ) {
      return {
        merchantId: "GBZ-MCH-98721",
        merchantName: "Resto Nusantara (Verified)",
        businessType: "F&B / Retail",
        email: "merchant@example.com",
        isVerified: true,
      };
    }

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId, accessToken);

    try {
      const response = await fetch(`${this.baseUrl}/v1/merchants/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ from: 0, to: 50, _source: ["id", "merchant_name"] }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.errors?.[0]?.message || `Gagal mengambil list merchant GoBiz (${response.status})`
        );
      }

      let merchantList: any[] = [];
      if (Array.isArray(data)) {
        merchantList = data;
      } else if (data?.merchants && Array.isArray(data.merchants)) {
        merchantList = data.merchants;
      } else if (data?.hits && Array.isArray(data.hits)) {
        merchantList = data.hits;
      } else if (data?.hits?.hits && Array.isArray(data.hits.hits)) {
        merchantList = data.hits.hits.map((h: any) => h._source || h);
      } else if (data?.data && Array.isArray(data.data)) {
        merchantList = data.data;
      }

      if (merchantList.length === 0) {
        throw new Error("Tidak ada merchant/outlet yang terasosiasi dengan akun GoBiz ini.");
      }

      const first = merchantList[0];
      const merchantId = first.id || first.merchant_id;
      const merchantName = first.merchant_name || first.name || "Merchant GoBiz";

      return {
        merchantId: String(merchantId),
        merchantName: String(merchantName),
        businessType: "Merchant GoBiz",
        isVerified: true,
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Resolusi merchant GoBiz gagal: ${error.message}`);
    }
  }

  /**
   * Refresh expired GoBiz access token using refresh_token.
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

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId);

    const payload = {
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    try {
      const response = await fetch(`${this.baseUrl}/goid/token`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.errors?.length > 0) {
        throw new Error(data.errors?.[0]?.message || `Gagal refresh token GoBiz (HTTP ${response.status})`);
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
}

/**
 * GoBiz Analytics & Journals Transaction Provider.
 * Fetches real incoming QRIS & GoPay transactions.
 */
export class GobizTransactionProvider implements TransactionProvider {
  async fetchTransactions(input: {
    merchantId: string;
    cursor?: string;
    from?: string;
    to?: string;
    accessToken?: string;
  }): Promise<TransactionPage> {
    if (USE_MOCK_GOBIZ || !input.accessToken) {
      return {
        transactions: [],
        nextCursor: undefined,
        hasMore: false,
      };
    }

    const uniqueId = generateUUID();
    const headers = getGoBizHeaders(uniqueId, input.accessToken);

    // Primary: Gojek API Merchant Analytics v2
    try {
      const url = new URL("https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions");
      const startTime = input.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endTime = input.to || new Date().toISOString();

      url.searchParams.append("from", input.cursor || "0");
      url.searchParams.append("size", "50");
      url.searchParams.append("statuses", "SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND");
      url.searchParams.append("payment_types", "QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD");
      url.searchParams.append("start_time", startTime);
      url.searchParams.append("end_time", endTime);
      url.searchParams.append("merchant_ids", input.merchantId);

      const response = await fetch(url.toString(), { method: "GET", headers, signal: AbortSignal.timeout(15000) });

      if (response.ok) {
        const body = await response.json();
        const transactions = body.transactions || [];

        const items: ProviderTransactionItem[] = transactions.map((tx: any) => {
          const rawAmount = typeof tx.gross_amount === "number" ? tx.gross_amount / 100 : Number(tx.gross_amount || 0);
          return {
            id: tx.transaction_id || tx.id || tx.order_id,
            merchantId: input.merchantId,
            payableAmount: rawAmount,
            currency: "IDR",
            transactionStatus:
              tx.status === "SETTLEMENT" || tx.status === "CAPTURE" || tx.status === "SUCCESS"
                ? "SUCCESS"
                : "PENDING",
            transactionTime: tx.transaction_time || new Date().toISOString(),
            source: "GOBIZ_ANALYTICS" as const,
            rawPayload: tx,
          };
        });

        return {
          transactions: items,
          nextCursor: undefined,
          hasMore: false,
        };
      }
    } catch (err) {
      // Fallback to Journals Search API
    }

    // Secondary Fallback: Journals Search API (api.gobiz.co.id/journals/search)
    try {
      const startTime = input.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endTime = input.to || new Date().toISOString();

      const requestBody = {
        from: 0,
        size: 50,
        sort: { time: { order: "desc" } },
        included_categories: { incoming: ["transaction_share", "action"] },
        query: [
          {
            clauses: [
              { field: "metadata.transaction.status", op: "in", value: ["settlement", "capture", "success"] },
              { field: "metadata.transaction.transaction_time", op: "gte", value: startTime },
              { field: "metadata.transaction.transaction_time", op: "lte", value: endTime },
              { field: "metadata.transaction.merchant_id", op: "equal", value: input.merchantId },
            ],
            op: "and",
          },
        ],
      };

      const response = await fetch("https://api.gobiz.co.id/journals/search", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Journals search gagal: HTTP ${response.status}`);
      }

      const body = await response.json();
      const dataItems = body.data || [];

      const items: ProviderTransactionItem[] = [];
      for (const item of dataItems) {
        const tx = item.metadata?.transaction;
        if (!tx) continue;

        const rawAmount = typeof tx.gross_amount === "number" ? tx.gross_amount / 100 : Number(tx.gross_amount || 0);
        items.push({
          id: tx.transaction_id || tx.id || item.id,
          merchantId: input.merchantId,
          payableAmount: rawAmount,
          currency: "IDR",
          transactionStatus: "SUCCESS",
          transactionTime: tx.transaction_time || item.time || new Date().toISOString(),
          source: "GOBIZ_ANALYTICS" as const,
          rawPayload: item,
        });
      }

      return {
        transactions: items,
        nextCursor: undefined,
        hasMore: false,
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Gagal menarik transaksi GoBiz: ${error.message}`);
    }
  }
}
