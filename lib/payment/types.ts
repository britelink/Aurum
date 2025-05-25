import { Id } from "@/convex/_generated/dataModel";

export type Currency = "USD" | "ZWG";
export type PaymentBrand = "PRIVATE_LABEL" | "VISA MASTER" | "ECOCASH";
export type TestMode = "INTERNAL" | "EXTERNAL";

export interface PaymentCredentials {
  entityId: string;
  paymentBrand: PaymentBrand;
  testMode: TestMode;
}

export interface PaymentConfig {
  authBearer: string;
  apiUrl: string;
}

export interface CheckoutRequest {
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  userId: Id<"users">;
}

export interface CheckoutResponse {
  id: string;
  ndc: string;
  timestamp: string;
  result: {
    code: string;
    description: string;
  };
  paymentBrand: PaymentBrand;
}

export interface PaymentStatusResponse {
  success: boolean;
  pending?: boolean;
  data?: unknown;
  error?: string;
  reason?: string;
}

export type PaymentMethod =
  | "zimswitch-usd"
  | "zimswitch-zwg"
  | "card-usd"
  | "ecocash-usd"
  | "ecocash-zwg";

export interface PaymentState {
  currentStep: number;
  checkoutId: string | null;
  paymentAmount: number;
  isProcessing: boolean;
  paymentBrand: string;
}
