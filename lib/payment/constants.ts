// lib/payment/constants.ts
import { PaymentConfig, PaymentCredentials, PaymentMethod } from "./types";

export const PAYMENT_CONFIG: PaymentConfig = {
  authBearer:
    process.env.PAYMENT_AUTH_BEARER ||
    "OGFjN2E0Yzk5NDY2ZDRhMDAxOTQ2OWRkYTFlZDA0MGF8aFAzRGFjSiUhVVg2eHpwbUQ6NDQ=",
  apiUrl: process.env.PAYMENT_API_URL || "https://eu-test.oppwa.com",
};

export const PAYMENT_CREDENTIALS: Record<PaymentMethod, PaymentCredentials> = {
  "zimswitch-usd": {
    entityId:
      process.env.ZIMSWITCH_USD_ENTITY_ID || "8ac7a4c99466d4a0019469e1c4cf0425",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "card-usd": {
    entityId:
      process.env.CARD_USD_ENTITY_ID || "8ac7a4c99466d4a0019469e025f20413",
    paymentBrand: "VISA MASTER",
    testMode: "INTERNAL",
  },
  "ecocash-usd": {
    entityId:
      process.env.ECOCASH_USD_ENTITY_ID || "8ac7a4c99466d4a0019469e025f20413",
    paymentBrand: "ECOCASH",
    testMode: "INTERNAL",
  },
  "zimswitch-zwg": {
    entityId:
      process.env.ZIMSWITCH_ZWG_ENTITY_ID || "8ac7a4c99466d4a0019469e14db10421",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "ecocash-zwg": {
    entityId:
      process.env.ECOCASH_ZWG_ENTITY_ID || "8ac7a4c99466d4a0019469e0bcf60419",
    paymentBrand: "ECOCASH",
    testMode: "INTERNAL",
  },
};
