// codes.ts

// ✅ Success Codes - Payment went through successfully
export const SUCCESS_CODES: Record<string, string> = {
    "000.000.000": "Transaction succeeded",
    "000.000.100": "Successful request",
    "000.100.110": "Processed in test mode (Merchant Integrator)",
    "000.100.112": "Processed in test mode (Merchant Validator)",
    "000.400.000": "Transaction pending",
    "000.400.010": "Waiting for user interaction",
    "000.400.020": "Transaction pending (customer authorization required)",
  };
  
  // ✅ Pending Codes - Awaiting further action
  export const PENDING_CODES: Record<string, string> = {
    "200.100.101": "Transaction pending due to fraud check",
    "200.100.102": "Transaction pending due to 3D Secure authentication",
    "800.400.500": "Waiting for approval by admin",
  };
  
  // ❌ Error Codes - Failures, fraud, invalid transactions
  export const ERROR_CODES: Record<string, string> = {
    // Gateway Errors
    "800.100.152": "Transaction declined by authorization system",
    "800.100.162": "Transaction declined (limit exceeded)",
    "800.100.158": "Transaction declined (suspected fraud)",
    "100.380.501": "Risk management transaction timeout",
    "800.100.155": "Transaction declined (exceeds available credit)",
    "800.100.165": "Transaction declined (card reported lost)",
    "800.100.157": "Transaction declined (wrong expiry date)",
    "100.100.101": "Invalid credit card or bank details",
    "700.400.200": "Cannot refund (exceeded limits, reversed transaction)",
    "800.100.172": "Transaction declined (account blocked)",
    "800.100.163": "Transaction declined (maximum transaction frequency exceeded)",
    "100.100.700": "Invalid credit card number/brand combination",
  
    // Fraud & Risk Errors
    "100.100.303": "Blocked due to suspected fraud",
    "200.300.404": "Payment rejected due to risk analysis",
    "300.100.300": "Suspicious transaction - manual review required",
  
    // Validation Errors
    "100.100.500": "Invalid transaction request",
    "600.200.500": "Missing required parameter",
    "600.200.501": "Invalid format in request",
  };
  
  export const GATEWAY_ERRORS: Record<string, string> = {
    "900.100.600": "Payment gateway temporarily unavailable",
    "100.100.101": "Invalid payment method",
    "800.100.151": "Transaction declined by bank",
    "000.400.200": "Duplicate transaction",
    "100.400.500": "Invalid transaction amount"
  };