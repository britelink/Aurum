import { PAYMENT_CREDENTIALS } from "../constants";
import { ValidationError } from "../errors";
import { CheckoutRequest } from "../types";


export function validateCheckoutRequest(request: CheckoutRequest): void {
  console.log(request)
  if (!request.amount || request.amount <= 0) {
    throw new ValidationError('Invalid amount');
  }

  if (!request.currency) {
    throw new ValidationError('Currency is required');
  }

  if (!request.studentId) {
    throw new ValidationError('Student ID is required');
  }

  if (!PAYMENT_CREDENTIALS[request.paymentMethod]) {
    throw new ValidationError('Invalid payment method');
  }
}