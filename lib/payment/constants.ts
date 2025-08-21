// lib/payment/constants.ts
import { PaymentConfig, PaymentCredentials, PaymentMethod } from "./types";

export const PAYMENT_CONFIG: PaymentConfig = {
  authBearer:
    process.env.PAYMENT_AUTH_BEARER ||
    "OGFjOWE0Yzc5ODdlYjZiZTAxOThjNjM0YmYxMDE4Zjd8TXhqSGRQUGdtbVchUFk1a0BuelI=",
  apiUrl: process.env.PAYMENT_API_URL || "https://eu-prod.oppwa.com",
};

export const PAYMENT_CREDENTIALS: Record<PaymentMethod, PaymentCredentials> = {
  "zimswitch-usd": {
    entityId:
      process.env.ZIMSWITCH_USD_ENTITY_ID || "8ac9a4c7987eb6be0198c6359a1c1900",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "zimswitch-zwg": {
    entityId:
      process.env.ZIMSWITCH_ZWG_ENTITY_ID || "8ac9a4c7987eb6be0198c63e049e1944",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "card-usd": {
    entityId:
      process.env.CARD_USD_ENTITY_ID || "8ac9a4c7987eb6be0198c63659ef1909",
    paymentBrand: "VISA MASTER",
    testMode: "INTERNAL",
  },
  "ecocash-usd": {
    entityId:
      process.env.ECOCASH_USD_ENTITY_ID || "8ac9a4c7987eb6be0198c63659ef1909",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "ecocash-zwg": {
    entityId:
      process.env.ECOCASH_ZWG_ENTITY_ID || "8ac9a4c7987eb6be0198c63659ef1909",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
};
