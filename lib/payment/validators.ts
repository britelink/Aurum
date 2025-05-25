import { CheckoutRequest } from "./types";
import { ValidationError } from "./errors";

export function validateDepositRequest(request: CheckoutRequest): void {
  if (!request.amount || request.amount <= 0) {
    throw new ValidationError("Invalid amount. Amount must be greater than 0.");
  }

  if (!request.currency) {
    throw new ValidationError("Currency is required.");
  }

  if (!request.paymentMethod) {
    throw new ValidationError("Payment method is required.");
  }

  if (!request.userId) {
    throw new ValidationError("User ID is required.");
  }
}
