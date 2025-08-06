// lib/payment/constants.ts
import { PaymentConfig, PaymentCredentials, PaymentMethod } from "./types";

export const PAYMENT_CONFIG: PaymentConfig = {
  authBearer:
    process.env.PAYMENT_AUTH_BEARER ||
    "OGFjN2E0Yzc5ODU4MzE3MzAxOTg1YjdjZGE0MzA0NzZ8a3I/NSNiamhmcktGS3FEaUF6bTk=",
  apiUrl: process.env.PAYMENT_API_URL || "https://eu-test.oppwa.com",
};

export const PAYMENT_CREDENTIALS: Record<PaymentMethod, PaymentCredentials> = {
  "zimswitch-usd": {
    entityId:
      process.env.ZIMSWITCH_USD_ENTITY_ID || "8ac7a4c79858317301985b7e52f8047f",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "zimswitch-zwg": {
    entityId:
      process.env.ZIMSWITCH_ZWG_ENTITY_ID || "8ac7a4c79858317301985b7ee21f0483",
    paymentBrand: "PRIVATE_LABEL",
    testMode: "EXTERNAL",
  },
  "card-usd": {
    entityId:
      process.env.CARD_USD_ENTITY_ID || "8ac7a4c79858317301985b7dcc27047a",
    paymentBrand: "VISA MASTER",
    testMode: "INTERNAL",
  },
  "ecocash-usd": {
    entityId:
      process.env.ECOCASH_USD_ENTITY_ID || "8ac7a4c79858317301985b7e52f8047f",
    paymentBrand: "ECOCASH",
    testMode: "INTERNAL",
  },
  "ecocash-zwg": {
    entityId:
      process.env.ECOCASH_ZWG_ENTITY_ID || "8ac7a4c79858317301985b7ee21f0483",
    paymentBrand: "ECOCASH",
    testMode: "INTERNAL",
  },
};
