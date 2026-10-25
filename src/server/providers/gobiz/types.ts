export interface RequestOtpInput {
  phone_number: string; // Indonesian normalized phone without country code or with
}

export interface RequestOtpResult {
  success: boolean;
  message: string;
  requestId?: string;
  expiresInSeconds?: number;
}

export interface VerifyOtpInput {
  phone_number: string;
  otp: string;
}

export interface GobizTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface GobizMerchantInfo {
  merchantId: string;
  merchantName: string;
  businessType?: string;
  email?: string;
  isVerified: boolean;
}

export interface ProviderTransactionItem {
  id: string;
  merchantId: string;
  payableAmount: number;
  currency: string;
  transactionStatus: "SUCCESS" | "FAILED" | "PENDING";
  transactionTime: string; // ISO 8601
  source: "GOBIZ_ANALYTICS" | "MOCK" | "CSV_IMPORT" | "WEBHOOK";
  rawPayload?: Record<string, unknown>;
}

export interface TransactionPage {
  transactions: ProviderTransactionItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface TransactionProvider {
  fetchTransactions(input: {
    merchantId: string;
    cursor?: string;
    from?: string;
    to?: string;
    accessToken?: string;
  }): Promise<TransactionPage>;
}
