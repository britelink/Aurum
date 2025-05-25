import { PaymentStatusResponse } from "./types";

export function parsePaymentStatus(resultCode?: string): PaymentStatusResponse {
  if (!resultCode) {
    return {
      success: false,
      error: "No result code provided",
    };
  }

  // Successful transaction codes
  if (
    resultCode === "000.000.000" ||
    resultCode === "000.000.100" ||
    resultCode === "000.100.110" ||
    resultCode === "000.100.111" ||
    resultCode === "000.100.112"
  ) {
    return {
      success: true,
    };
  }

  // Pending transaction codes
  if (
    resultCode.startsWith("000.200") ||
    resultCode === "800.400.500" ||
    resultCode === "800.400.501"
  ) {
    return {
      success: false,
      pending: true,
      reason: "Transaction is pending or requires additional verification",
    };
  }

  // Failed transaction
  return {
    success: false,
    error: "Transaction failed",
    reason: `Result code: ${resultCode}`,
  };
}
